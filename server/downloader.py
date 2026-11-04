import os
import re
import time
import json
import threading
import zipfile
import uuid
import requests
import shutil
from server import db

def build_valid_filename(orig_name, max_bytes=244):
    if not orig_name:
        return "(invalid)"
    name = str(orig_name).strip('. ')
    if not name:
        return "(invalid)"
    cleaned = re.sub(r'[\\/*?:"<>|]', '_', name)
    return cleaned[:max_bytes]

def get_chapter_cbz_name(chapter_name, chapter_number=None, scanlator=None, chapter_url="", chapter_id=""):
    clean_scan = build_valid_filename(scanlator.strip()) if (scanlator and str(scanlator).strip()) else ""
    c_name = str(chapter_name or "").strip()
    if not c_name:
        ch_num_str = str(chapter_number) if chapter_number is not None else ""
        c_name = f"Chapter {ch_num_str}".strip() if ch_num_str else "Chapter"
    clean_c_name = build_valid_filename(c_name)
    if clean_scan:
        return f"{clean_scan}_{clean_c_name}.cbz"
    return f"{clean_c_name}.cbz"

def get_valid_chapter_cbz_names(chapter_name=None, chapter_number=None, scanlator=None, chapter_url="", chapter_id="", has_duplicate_scans=False):
    names = set()
    clean_scan = build_valid_filename(scanlator.strip()) if (scanlator and str(scanlator).strip()) else ""
    c_name = str(chapter_name or "").strip()
    ch_num = chapter_number
    ch_num_str = ""
    if ch_num is not None:
        try:
            fn = float(ch_num)
            ch_num_str = str(int(fn)) if fn.is_integer() else str(fn)
        except Exception:
            ch_num_str = str(ch_num).strip().rstrip('.')

    if clean_scan:
        if c_name:
            names.add(f"{clean_scan}_{build_valid_filename(c_name)}.cbz".lower())
        if ch_num_str:
            names.add(f"{clean_scan}_chapter {ch_num_str}.cbz".lower())
            names.add(f"{clean_scan}_ch. {ch_num_str}.cbz".lower())
            names.add(f"{clean_scan}_{ch_num_str}.cbz".lower())
            names.add(f"chapter {ch_num_str} ({clean_scan}).cbz".lower())
            names.add(f"ch. {ch_num_str} ({clean_scan}).cbz".lower())
            names.add(f"chapter {ch_num_str}_{clean_scan}.cbz".lower())
        if chapter_id:
            cid_hash = re.sub(r'[^a-zA-Z0-9]', '', str(chapter_id))[-6:]
            if c_name:
                names.add(f"{clean_scan}_{build_valid_filename(c_name)}_{cid_hash}.cbz".lower())
            if ch_num_str:
                names.add(f"{clean_scan}_chapter {ch_num_str}_{cid_hash}.cbz".lower())
    else:
        if c_name:
            names.add(f"{build_valid_filename(c_name)}.cbz".lower())
        if ch_num_str:
            names.add(f"chapter {ch_num_str}.cbz".lower())
            names.add(f"ch. {ch_num_str}.cbz".lower())
            names.add(f"{ch_num_str}.cbz".lower())
        if chapter_id:
            cid_hash = re.sub(r'[^a-zA-Z0-9]', '', str(chapter_id))[-6:]
            if c_name:
                names.add(f"{build_valid_filename(c_name)}_{cid_hash}.cbz".lower())
            if ch_num_str:
                names.add(f"chapter {ch_num_str}_{cid_hash}.cbz".lower())

    return names

class ChapterDownloader:
    def __init__(self):
        self.is_running = True
        self.current_task = None
        self.paused_tasks = set()
        self.cancelled_tasks = set()
        self.wake_event = threading.Event()
        self.lock = threading.Lock()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        self.auto_resume_pending_or_interrupted()

    def _restore_pending_tasks(self):
        return self.auto_resume_pending_or_interrupted()

    def auto_resume_pending_or_interrupted(self):
        try:
            conn = db.get_db()
            try:
                conn.execute("ALTER TABLE download_tasks ADD COLUMN cleared INTEGER DEFAULT 0")
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE download_tasks ADD COLUMN priority REAL DEFAULT 0")
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE download_tasks ADD COLUMN scanlator TEXT DEFAULT ''")
                conn.commit()
            except Exception:
                pass

            conn.execute("UPDATE download_tasks SET status = 'pending' WHERE status = 'downloading'")
            conn.execute("UPDATE download_tasks SET status = 'pending', error_message = NULL WHERE status IN ('paused', 'failed') AND (cleared IS NULL OR cleared = 0)")
            conn.commit()

            count_row = conn.execute("SELECT COUNT(*) FROM download_tasks WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)").fetchone()
            count = count_row[0] if count_row else 0
            conn.close()

            with self.lock:
                self.cancelled_tasks.clear()
                self.paused_tasks.clear()
            self.wake_event.set()
            return count
        except Exception as e:
            print("[Downloader] Error in auto_resume_pending_or_interrupted:", e)
            return 0

    def _get_download_base_dir(self):
        base = db.get_download_dir()
        try:
            os.makedirs(base, exist_ok=True)
        except Exception:
            pass
        return base

    def add_to_queue(self, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source="mangadex", cover_url="", to_top=False, scanlator=""):
        task_id = f"dl_{chapter_id}_{int(time.time()*1000)}"
        now = time.time()
        ch_num_str = str(chapter_number)
        scanlator_str = str(scanlator or "").strip()

        if manga_id:
            excluded_scans = db.get_manga_excluded_scanlators(manga_id)
            if excluded_scans and (scanlator_str or "unofficial").lower() in excluded_scans:
                return None

        conn = db.get_db()
        existing = conn.execute("SELECT id, status, cleared FROM download_tasks WHERE chapter_id = ?", (chapter_id,)).fetchone()

        # If currently downloading right now
        if existing and existing["id"] == self.current_task:
            conn.close()
            return existing["id"]

        if existing and existing["status"] == "completed":
            sanitized_manga = self._sanitize_filename(manga_title) or "Downloaded Manga"
            dirs_to_check = [self._get_download_base_dir()]
            default_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads"))
            if default_dir not in dirs_to_check:
                dirs_to_check.append(default_dir)
            valid_names = get_valid_chapter_cbz_names(chapter_title, chapter_number, scanlator_str, chapter_id=chapter_id)
            for d_dir in dirs_to_check:
                manga_folder = os.path.join(d_dir, sanitized_manga)
                if os.path.isdir(manga_folder):
                    if any(os.path.exists(os.path.join(manga_folder, vn)) for vn in valid_names):
                        conn.close()
                        return existing["id"]

        if to_top:
            row_min = conn.execute("SELECT MIN(created_at) as min_ca, MAX(priority) as max_p FROM download_tasks WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)").fetchone()
            min_ca = row_min["min_ca"] if row_min and row_min["min_ca"] is not None else now
            max_p = row_min["max_p"] if row_min and row_min["max_p"] is not None else 0.0
            task_created_at = min_ca - 100.0
            task_priority = max_p + 10.0
        else:
            row_max = conn.execute("SELECT MAX(created_at) as max_ca FROM download_tasks WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)").fetchone()
            max_ca = row_max["max_ca"] if row_max and row_max["max_ca"] is not None else now
            task_created_at = max(now, max_ca + 1.0)
            task_priority = 0.0

        if existing:
            use_id = existing["id"]
            conn.execute("""
            UPDATE download_tasks 
            SET manga_id = ?, manga_title = ?, chapter_number = ?, chapter_title = ?, source = ?,
                status = 'pending', progress = 0, downloaded_pages = 0, total_pages = 0,
                error_message = NULL, cleared = 0, created_at = ?, priority = ?, cover_url = ?, scanlator = ?
            WHERE id = ?
            """, (manga_id, manga_title, ch_num_str, chapter_title, source, task_created_at, task_priority, cover_url, scanlator_str, use_id))
            conn.commit()
            conn.close()
            task_id = use_id
        else:
            try:
                conn.execute("""
                INSERT INTO download_tasks 
                (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, cover_url, created_at, cleared, priority, scanlator)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?, ?, 0, ?, ?)
                """, (task_id, manga_id, manga_title, chapter_id, ch_num_str, chapter_title, source, cover_url, task_created_at, task_priority, scanlator_str))
            except Exception:
                conn.execute("""
                INSERT INTO download_tasks 
                (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, created_at, cleared)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?, 0)
                """, (task_id, manga_id, manga_title, chapter_id, ch_num_str, chapter_title, source, task_created_at))
            conn.commit()
            conn.close()

        with self.lock:
            self.cancelled_tasks.discard(task_id)
            self.paused_tasks.discard(task_id)

        self.wake_event.set()
        return task_id

    def add_bulk_to_queue(self, items):
        if not items:
            return []

        conn = db.get_db()
        queued_ids = []

        # Sort items strictly by chapter number ascending so serial download is guaranteed!
        def _get_ch_num(it):
            c = it.get("chapter_number")
            try:
                return float(c) if c is not None else 0.0
            except (ValueError, TypeError):
                m = re.search(r'(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)', str(it.get("chapter_title", "")), re.IGNORECASE)
                if not m:
                    m = re.search(r'([0-9]+(?:\.[0-9]+)?)', str(it.get("chapter_title", "")))
                return float(m.group(1)) if m else 0.0

        sorted_items = sorted(items, key=_get_ch_num)

        row_max = conn.execute("SELECT MAX(created_at) as max_ca FROM download_tasks WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)").fetchone()
        base_time = max(time.time(), (row_max["max_ca"] if row_max and row_max["max_ca"] is not None else time.time()) + 1.0)

        for idx, item in enumerate(sorted_items):
            try:
                manga_id = item.get("manga_id")
                manga_title = item.get("manga_title", "Untitled")
                chapter_id = item.get("chapter_id")
                chapter_number = item.get("chapter_number", 0)
                chapter_title = item.get("chapter_title", "Chapter")
                scanlator = str(item.get("scanlator", "") or "").strip()
                source = item.get("source", "mangadex")
                cover_url = item.get("cover_url", "")

                if not manga_id or not chapter_id:
                    continue

                # Check if scanlator is excluded for this manga
                excluded_scans = db.get_manga_excluded_scanlators(manga_id)
                if excluded_scans and (scanlator or "unofficial").lower() in excluded_scans:
                    continue

                task_id = f"dl_{chapter_id}_{uuid.uuid4().hex[:6]}"
                ch_num_str = str(chapter_number)
                task_created_at = base_time + (idx * 0.001)

                existing = conn.execute("SELECT id, status, cleared FROM download_tasks WHERE chapter_id = ?", (chapter_id,)).fetchone()

                if existing and existing["id"] == self.current_task:
                    queued_ids.append(existing["id"])
                    continue

                if existing:
                    if existing["status"] == "completed":
                        sanitized_manga = self._sanitize_filename(manga_title) or "Downloaded Manga"
                        manga_folder = os.path.join(self._get_download_base_dir(), sanitized_manga)
                        valid_names = get_valid_chapter_cbz_names(chapter_title, chapter_number, scanlator, chapter_id=chapter_id)
                        if os.path.isdir(manga_folder) and any(os.path.exists(os.path.join(manga_folder, vn)) for vn in valid_names):
                            continue
                    use_id = existing["id"]
                    conn.execute("""
                    UPDATE download_tasks 
                    SET manga_id = ?, manga_title = ?, chapter_number = ?, chapter_title = ?, source = ?,
                        status = 'pending', progress = 0, downloaded_pages = 0, total_pages = 0,
                        error_message = NULL, cleared = 0, created_at = ?, priority = 0, cover_url = ?, scanlator = ?
                    WHERE id = ?
                    """, (manga_id, manga_title, ch_num_str, chapter_title, source, task_created_at, cover_url, scanlator, use_id))
                    task_id = use_id
                else:
                    try:
                        conn.execute("""
                        INSERT INTO download_tasks 
                        (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, cover_url, created_at, cleared, priority, scanlator)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?, ?, 0, 0, ?)
                        """, (task_id, manga_id, manga_title, chapter_id, ch_num_str, chapter_title, source, cover_url, task_created_at, scanlator))
                    except Exception:
                        conn.execute("""
                        INSERT INTO download_tasks 
                        (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, created_at, cleared)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, ?, 0)
                        """, (task_id, manga_id, manga_title, chapter_id, ch_num_str, chapter_title, source, task_created_at))

                with self.lock:
                    self.cancelled_tasks.discard(task_id)
                    self.paused_tasks.discard(task_id)

                queued_ids.append(task_id)
            except Exception as item_err:
                print(f"[Downloader] Error queueing item {item.get('chapter_id')}: {item_err}")
                continue

        conn.commit()
        conn.close()
        self.wake_event.set()
        return queued_ids

    def pause_task(self, task_id):
        with self.lock:
            self.paused_tasks.add(task_id)
        conn = db.get_db()
        conn.execute("UPDATE download_tasks SET status = 'paused' WHERE id = ?", (task_id,))
        conn.commit()
        conn.close()
        return True

    def resume_task(self, task_id):
        with self.lock:
            self.paused_tasks.discard(task_id)
            self.cancelled_tasks.discard(task_id)
        conn = db.get_db()
        conn.execute("UPDATE download_tasks SET status = 'pending', cleared = 0 WHERE id = ?", (task_id,))
        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def retry_task(self, task_id):
        with self.lock:
            self.cancelled_tasks.discard(task_id)
            self.paused_tasks.discard(task_id)
        conn = db.get_db()
        conn.execute("UPDATE download_tasks SET status = 'pending', progress = 0, downloaded_pages = 0, error_message = NULL, cleared = 0 WHERE id = ?", (task_id,))
        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def cancel_task(self, task_id):
        conn = db.get_db()
        row = conn.execute("SELECT id, status FROM download_tasks WHERE id = ? OR chapter_id = ?", (task_id, task_id)).fetchone()
        if row:
            actual_id = row["id"]
            with self.lock:
                self.cancelled_tasks.add(actual_id)
                self.cancelled_tasks.add(task_id)
                self.paused_tasks.discard(actual_id)
                self.paused_tasks.discard(task_id)
            if row["status"] == "completed":
                conn.execute("UPDATE download_tasks SET cleared = 1 WHERE id = ?", (actual_id,))
            else:
                conn.execute("UPDATE download_tasks SET status = 'cancelled', cleared = 1 WHERE id = ?", (actual_id,))
        else:
            with self.lock:
                self.cancelled_tasks.add(task_id)
                self.paused_tasks.discard(task_id)
            conn.execute("UPDATE download_tasks SET status = 'cancelled', cleared = 1 WHERE id = ? OR chapter_id = ?", (task_id, task_id))
        conn.commit()
        conn.close()
        return True

    def cancel_all(self):
        conn = db.get_db()
        rows = conn.execute("SELECT id FROM download_tasks WHERE status IN ('pending', 'downloading', 'paused')").fetchall()
        for r in rows:
            self.cancel_task(r["id"])
        conn.close()
        return True

    def pause_all(self):
        conn = db.get_db()
        rows = conn.execute("SELECT id FROM download_tasks WHERE status IN ('pending', 'downloading')").fetchall()
        conn.close()
        for r in rows:
            self.pause_task(r["id"])
        return True

    def resume_all(self):
        conn = db.get_db()
        rows = conn.execute("SELECT id FROM download_tasks WHERE status = 'paused'").fetchall()
        conn.close()
        for r in rows:
            self.resume_task(r["id"])
        return True

    def clear_finished(self):
        conn = db.get_db()
        conn.execute("UPDATE download_tasks SET cleared = 1 WHERE status IN ('completed', 'cancelled', 'failed')")
        conn.commit()
        conn.close()
        return True

    def reorder_task(self, task_id, to_top=True):
        """Moves a single chapter to the very front of the download queue."""
        conn = db.get_db()
        row = conn.execute("SELECT MIN(created_at) as min_ca, MAX(priority) as max_p FROM download_tasks WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)").fetchone()
        min_ca = row["min_ca"] if row and row["min_ca"] is not None else time.time()
        max_p = row["max_p"] if row and row["max_p"] is not None else 0.0

        if to_top:
            conn.execute("UPDATE download_tasks SET created_at = ?, priority = ? WHERE id = ? OR chapter_id = ?", (min_ca - 100.0, max_p + 10.0, task_id, task_id))
        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def reorder_manga(self, manga_id, action="top"):
        """Reorders entire manga in the queue: 'top', 'up', or 'down'."""
        conn = db.get_db()
        rows = conn.execute("""
        SELECT manga_id, MIN(created_at) as first_created, MAX(priority) as max_p
        FROM download_tasks
        WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)
        GROUP BY manga_id
        ORDER BY max_p DESC, first_created ASC
        """).fetchall()

        manga_order = [r["manga_id"] for r in rows]
        if manga_id not in manga_order:
            conn.close()
            return False

        idx = manga_order.index(manga_id)
        if action == "top":
            manga_order.pop(idx)
            manga_order.insert(0, manga_id)
        elif action == "up" and idx > 0:
            manga_order[idx], manga_order[idx - 1] = manga_order[idx - 1], manga_order[idx]
        elif action == "down" and idx < len(manga_order) - 1:
            manga_order[idx], manga_order[idx + 1] = manga_order[idx + 1], manga_order[idx]

        base_time = time.time()
        for m_idx, mid in enumerate(manga_order):
            m_tasks = conn.execute("""
            SELECT id FROM download_tasks
            WHERE manga_id = ? AND status = 'pending' AND (cleared IS NULL OR cleared = 0)
            ORDER BY CAST(chapter_number AS REAL) ASC, created_at ASC
            """, (mid,)).fetchall()

            for ch_idx, t in enumerate(m_tasks):
                t_val = base_time + (m_idx * 100.0) + (ch_idx * 0.001)
                conn.execute("UPDATE download_tasks SET created_at = ?, priority = 0 WHERE id = ?", (t_val, t["id"]))

        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def reorder_mangas_order(self, ordered_manga_ids):
        """Sets the exact order of mangas in the download queue from a list of manga_ids (for drag and drop)."""
        if not ordered_manga_ids:
            return False
        conn = db.get_db()
        rows = conn.execute("""
        SELECT manga_id
        FROM download_tasks
        WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)
        GROUP BY manga_id
        """).fetchall()

        existing_mangas = set(r["manga_id"] for r in rows)
        final_order = [m for m in ordered_manga_ids if m in existing_mangas]
        for m in existing_mangas:
            if m not in final_order:
                final_order.append(m)

        base_time = time.time()
        for m_idx, mid in enumerate(final_order):
            m_tasks = conn.execute("""
            SELECT id FROM download_tasks
            WHERE manga_id = ? AND status = 'pending' AND (cleared IS NULL OR cleared = 0)
            ORDER BY CAST(chapter_number AS REAL) ASC, created_at ASC
            """, (mid,)).fetchall()

            for ch_idx, t in enumerate(m_tasks):
                t_val = base_time + (m_idx * 100.0) + (ch_idx * 0.001)
                conn.execute("UPDATE download_tasks SET created_at = ?, priority = 0 WHERE id = ?", (t_val, t["id"]))

        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def reorder_tasks_order(self, ordered_task_ids):
        """Sets the exact order of individual tasks in the download queue from a list of task_ids (for drag and drop)."""
        if not ordered_task_ids:
            return False
        conn = db.get_db()
        base_time = time.time()
        for idx, task_id in enumerate(ordered_task_ids):
            t_val = base_time + (idx * 0.1)
            conn.execute("UPDATE download_tasks SET created_at = ?, priority = 0 WHERE id = ?", (t_val, task_id))
        conn.commit()
        conn.close()
        self.wake_event.set()
        return True

    def pause_manga(self, manga_id):
        conn = db.get_db()
        rows = conn.execute("SELECT id FROM download_tasks WHERE manga_id = ? AND status IN ('pending', 'downloading')", (manga_id,)).fetchall()
        conn.execute("UPDATE download_tasks SET status = 'paused' WHERE manga_id = ? AND status = 'pending'", (manga_id,))
        conn.commit()
        conn.close()
        with self.lock:
            for r in rows:
                self.paused_tasks.add(r["id"])
        return True

    def resume_manga(self, manga_id):
        conn = db.get_db()
        rows = conn.execute("SELECT id FROM download_tasks WHERE manga_id = ? AND status = 'paused'", (manga_id,)).fetchall()
        conn.execute("UPDATE download_tasks SET status = 'pending', cleared = 0 WHERE manga_id = ? AND status = 'paused'", (manga_id,))
        conn.commit()
        conn.close()
        with self.lock:
            for r in rows:
                self.paused_tasks.discard(r["id"])
                self.cancelled_tasks.discard(r["id"])
        self.wake_event.set()
        return True

    def cancel_manga(self, manga_id):
        conn = db.get_db()
        rows = conn.execute("SELECT id, status FROM download_tasks WHERE manga_id = ? AND (cleared IS NULL OR cleared = 0)", (manga_id,)).fetchall()
        conn.execute("UPDATE download_tasks SET status = 'cancelled', cleared = 1 WHERE manga_id = ? AND status != 'completed'", (manga_id,))
        conn.execute("UPDATE download_tasks SET cleared = 1 WHERE manga_id = ? AND status = 'completed'", (manga_id,))
        conn.commit()
        conn.close()
        with self.lock:
            for r in rows:
                self.cancelled_tasks.add(r["id"])
        return True

    def delete_chapter_download(self, manga_id, chapter_id, chapter_number=None, scanlator=None):
        """
        Deletes a single downloaded chapter from disk and removes its download task record.
        """
        conn = db.get_db()
        raw_id = manga_id or ""
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                raw_id = raw_id[len(pfx):]
                break

        # Look up existing task by exact chapter_id first
        task = conn.execute(
            "SELECT * FROM download_tasks WHERE chapter_id = ? OR (manga_id = ? AND chapter_id = ?) OR (manga_id = ? AND chapter_id = ?)",
            (chapter_id, manga_id, chapter_id, raw_id, chapter_id)
        ).fetchone()

        ch_num = chapter_number
        manga_title = None
        task_scanlator = scanlator
        ch_title = None
        if task:
            if ch_num is None:
                ch_num = task["chapter_number"]
            manga_title = task["manga_title"]
            if not task_scanlator and "scanlator" in task.keys() and task["scanlator"]:
                task_scanlator = task["scanlator"]
            if "chapter_title" in task.keys() and task["chapter_title"]:
                ch_title = task["chapter_title"]
            with self.lock:
                self.cancelled_tasks.add(task["id"])

        if not manga_title:
            row_lib = conn.execute("SELECT title, path FROM library WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchone()
            if row_lib and row_lib["title"]:
                manga_title = row_lib["title"]
            else:
                row_c = conn.execute("SELECT title FROM manga_cache WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchone()
                if row_c and row_c["title"]:
                    manga_title = row_c["title"]

        # CRITICAL: Find physical file on disk BEFORE deleting task records from DB!
        from server.app import find_chapter_cbz, get_downloads_dirs, find_cbz_file
        cbz_path = find_chapter_cbz(chapter_id, manga_id=manga_id, manga_title=manga_title, chapter_number=ch_num, scanlator=task_scanlator, chapter_title=ch_title)
        
        # If find_chapter_cbz didn't locate it, scan candidate folders directly
        if not cbz_path or not os.path.exists(cbz_path):
            candidate_dirs = []
            if manga_title:
                for dl_dir in get_downloads_dirs():
                    candidate_dirs.append(os.path.join(dl_dir, self._sanitize_filename(manga_title)))
                    candidate_dirs.append(os.path.join(dl_dir, manga_title))
            for dl_dir in get_downloads_dirs():
                candidate_dirs.append(os.path.join(dl_dir, self._sanitize_filename(raw_id)))
                candidate_dirs.append(os.path.join(dl_dir, raw_id))
            
            for c_dir in candidate_dirs:
                if c_dir and os.path.isdir(c_dir):
                    f_match = find_cbz_file(c_dir, ch_num_or_str=ch_num, chapter_title=ch_title, scanlator=task_scanlator, chapter_id=chapter_id)
                    if f_match and os.path.exists(f_match):
                        cbz_path = f_match
                        break

        deleted = False
        if cbz_path and os.path.exists(cbz_path):
            try:
                os.remove(cbz_path)
                deleted = True
            except Exception as e:
                print(f"[Downloader] Error removing {cbz_path}:", e)

        # Cancel and delete task record in DB for this exact chapter_id ONLY!
        conn.execute(
            "DELETE FROM download_tasks WHERE chapter_id = ? OR (manga_id = ? AND chapter_id = ?) OR (manga_id = ? AND chapter_id = ?)",
            (chapter_id, manga_id, chapter_id, raw_id, chapter_id)
        )
        conn.commit()
        conn.close()

        # Update cached chapters in DB
        db.update_chapter_download_flag(manga_id, chapter_id, False)

        return deleted

    def delete_manga_downloads(self, manga_id):
        """
        Deletes all downloaded chapters for a manga from disk and clears all tasks.
        """
        conn = db.get_db()
        tasks = conn.execute("SELECT id FROM download_tasks WHERE manga_id = ? OR manga_id LIKE ?", (manga_id, f"%{manga_id}%")).fetchall()
        with self.lock:
            for t in tasks:
                self.cancelled_tasks.add(t["id"])

        lib_row = conn.execute("SELECT title, path FROM library WHERE id = ? OR id LIKE ?", (manga_id, f"%{manga_id}%")).fetchone()
        conn.execute("DELETE FROM download_tasks WHERE manga_id = ? OR manga_id LIKE ?", (manga_id, f"%{manga_id}%"))
        conn.commit()
        conn.close()

        base_downloads_list = [self._get_download_base_dir()]
        default_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads"))
        if default_dir not in base_downloads_list:
            base_downloads_list.append(default_dir)

        candidate_dirs = set()

        if lib_row and lib_row["path"] and os.path.isdir(lib_row["path"]):
            candidate_dirs.add(os.path.abspath(lib_row["path"]))

        manga_title = lib_row["title"] if lib_row else ""
        raw_id = manga_id
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                raw_id = raw_id[len(pfx):]
                break

        for base_downloads in base_downloads_list:
            if manga_title:
                candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, self._sanitize_filename(manga_title))))
                candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, manga_title)))

            candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, self._sanitize_filename(raw_id))))
            candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, raw_id)))

            # Search downloads directory for matching details.json or directory name
            if os.path.isdir(base_downloads):
                for sub in os.listdir(base_downloads):
                    sub_path = os.path.join(base_downloads, sub)
                    if not os.path.isdir(sub_path):
                        continue
                    det_path = os.path.join(sub_path, "details.json")
                    if os.path.exists(det_path):
                        try:
                            with open(det_path, "r", encoding="utf-8") as f:
                                d = json.load(f)
                                if d.get("id") in (manga_id, raw_id) or (manga_title and d.get("title", "").lower() == manga_title.lower()):
                                    candidate_dirs.add(os.path.abspath(sub_path))
                        except Exception:
                            pass
                    elif manga_title and (sub.lower() in manga_title.lower() or manga_title.lower() in sub.lower()):
                        candidate_dirs.add(os.path.abspath(sub_path))

        deleted_files_count = 0
        for folder in candidate_dirs:
            if not os.path.isdir(folder):
                continue
            try:
                for f in os.listdir(folder):
                    if f.lower().endswith(('.cbz', '.zip', '.tmp')):
                        f_path = os.path.join(folder, f)
                        try:
                            os.remove(f_path)
                            deleted_files_count += 1
                        except Exception:
                            pass
                # If folder is inside downloads directory and has no remaining cbz files, delete the folder
                remaining_cbz = [f for f in os.listdir(folder) if f.lower().endswith(('.cbz', '.zip'))]
                if not remaining_cbz:
                    for base_downloads in base_downloads_list:
                        if os.path.abspath(base_downloads) in os.path.abspath(folder):
                            shutil.rmtree(folder, ignore_errors=True)
                            break
            except Exception as e:
                print(f"[Downloader] Error cleaning folder {folder}:", e)

        return deleted_files_count

    def delete_manga_downloads_by_scanlator(self, manga_id, scanlator):
        """
        Deletes all downloaded chapters for a manga matching a specific scanlator and clears their tasks.
        """
        if not manga_id or not scanlator:
            return 0
        clean_scan = str(scanlator).lower().strip()
        conn = db.get_db()
        raw_id = manga_id
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                raw_id = raw_id[len(pfx):]
                break

        tasks = conn.execute("""
            SELECT id FROM download_tasks 
            WHERE (manga_id = ? OR manga_id = ? OR manga_id LIKE ?)
              AND (LOWER(TRIM(COALESCE(scanlator, ''))) = ? OR (scanlator = '' AND ? = 'unofficial'))
        """, (manga_id, raw_id, f"%{manga_id}%", clean_scan, clean_scan)).fetchall()

        with self.lock:
            for t in tasks:
                self.cancelled_tasks.add(t["id"])

        conn.execute("""
            DELETE FROM download_tasks 
            WHERE (manga_id = ? OR manga_id = ? OR manga_id LIKE ?)
              AND (LOWER(TRIM(COALESCE(scanlator, ''))) = ? OR (scanlator = '' AND ? = 'unofficial'))
        """, (manga_id, raw_id, f"%{manga_id}%", clean_scan, clean_scan))
        conn.commit()

        lib_row = conn.execute("SELECT title, path FROM library WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{manga_id}%")).fetchone()
        conn.close()

        base_downloads_list = [self._get_download_base_dir()]
        default_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads"))
        if default_dir not in base_downloads_list:
            base_downloads_list.append(default_dir)

        candidate_dirs = set()
        if lib_row and lib_row["path"] and os.path.isdir(lib_row["path"]):
            candidate_dirs.add(os.path.abspath(lib_row["path"]))

        manga_title = lib_row["title"] if lib_row else ""
        for base_downloads in base_downloads_list:
            if manga_title:
                candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, self._sanitize_filename(manga_title))))
                candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, manga_title)))
            candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, self._sanitize_filename(raw_id))))
            candidate_dirs.add(os.path.abspath(os.path.join(base_downloads, raw_id)))

        deleted_files_count = 0
        for folder in candidate_dirs:
            if not os.path.isdir(folder):
                continue
            try:
                for f in os.listdir(folder):
                    f_lower = f.lower()
                    if f_lower.endswith(('.cbz', '.zip', '.tmp')):
                        if f_lower.startswith(f"{clean_scan}_") or f"({clean_scan})" in f_lower or f"_{clean_scan}." in f_lower:
                            f_path = os.path.join(folder, f)
                            try:
                                os.remove(f_path)
                                deleted_files_count += 1
                            except Exception as e:
                                print(f"[Downloader] Error removing {f_path}:", e)
            except Exception as e:
                print(f"[Downloader] Error scanning folder {folder}:", e)

        return deleted_files_count

    def get_all_tasks(self, include_completed=False, filter_status=None):
        conn = db.get_db()
        if filter_status == "completed" or include_completed:
            rows = conn.execute("""
            SELECT * FROM download_tasks 
            WHERE status = 'completed'
            ORDER BY completed_at DESC
            LIMIT 500
            """).fetchall()
        elif filter_status == "failed":
            rows = conn.execute("""
            SELECT * FROM download_tasks 
            WHERE status IN ('failed', 'cancelled')
            ORDER BY created_at DESC
            LIMIT 500
            """).fetchall()
        else:
            rows = conn.execute("""
            SELECT * FROM download_tasks 
            WHERE (cleared IS NULL OR cleared = 0) 
            ORDER BY 
                CASE status
                    WHEN 'downloading' THEN 1
                    WHEN 'pending' THEN 2
                    WHEN 'paused' THEN 3
                    WHEN 'failed' THEN 4
                    ELSE 5
                END ASC,
                priority DESC,
                created_at ASC,
                CAST(chapter_number AS REAL) ASC
            LIMIT 100000
            """).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def _sanitize_filename(self, name):
        if not name:
            return ""
        return re.sub(r'[\\/*?:"<>|]', "", str(name)).strip()

    def _normalize_download_url(self, raw_url):
        if not raw_url:
            return "", {}
        actual_url = raw_url.strip()
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

        if "/api/proxy/image?" in actual_url or "/api/proxy/image?url=" in actual_url:
            from urllib.parse import parse_qs
            query_part = actual_url.split("/api/proxy/image?")[-1]
            qs = parse_qs(query_part)
            if "url" in qs and qs["url"]:
                actual_url = qs["url"][0]
            if "referer" in qs and qs["referer"]:
                headers["Referer"] = qs["referer"][0]

        # Handle Suwayomi relative URLs
        if actual_url.startswith("/api/suwayomi/manga/"):
            parts = actual_url.strip("/").split("/")
            if len(parts) >= 8 and parts[4] == "chapter" and parts[6] == "page":
                raw_id = str(parts[3]).replace("suwayomi_", "")
                ch_idx = parts[5]
                pg_idx = parts[7]
                try:
                    from server.suwayomi_client import suwayomi_client
                    actual_url = f"{suwayomi_client.base_url}/api/v1/manga/{raw_id}/chapter/{ch_idx}/page/{pg_idx}"
                except Exception:
                    actual_url = f"http://127.0.0.1:8787{actual_url}"
            else:
                actual_url = f"http://127.0.0.1:8787{actual_url}"
        elif actual_url.startswith("/api/suwayomi/thumbnail/"):
            raw_id = actual_url.split("/api/suwayomi/thumbnail/")[-1].replace("suwayomi_", "")
            try:
                from server.suwayomi_client import suwayomi_client
                actual_url = f"{suwayomi_client.base_url}/api/v1/manga/{raw_id}/thumbnail"
            except Exception:
                actual_url = f"http://127.0.0.1:8787{actual_url}"
        elif actual_url.startswith("/api/suwayomi/icon/"):
            source_id = actual_url.split("/api/suwayomi/icon/")[-1]
            try:
                from server.suwayomi_client import suwayomi_client
                actual_url = f"{suwayomi_client.base_url}/api/v1/source/{source_id}/icon"
            except Exception:
                actual_url = f"http://127.0.0.1:8787{actual_url}"
        elif actual_url.startswith("//"):
            actual_url = "https:" + actual_url
        elif actual_url.startswith("/"):
            actual_url = f"http://127.0.0.1:8787{actual_url}"

        if "Referer" not in headers:
            from urllib.parse import urlparse
            p = urlparse(actual_url)
            if p.netloc:
                headers["Referer"] = f"{p.scheme}://{p.netloc}/"

        return actual_url, headers

    def _save_manga_offline_metadata_and_cover(self, task, source_obj, manga_folder):
        details_path = os.path.join(manga_folder, "details.json")
        manga_info = {}
        if os.path.exists(details_path):
            try:
                with open(details_path, "r", encoding="utf-8") as f:
                    manga_info = json.load(f)
            except Exception:
                pass

        if not manga_info or not manga_info.get("summary"):
            try:
                fetched = source_obj.get_details(task["manga_id"])
                if fetched:
                    manga_info.update(fetched)
            except Exception:
                pass

        if not manga_info.get("title"):
            manga_info["title"] = task["manga_title"]
        if not manga_info.get("id"):
            manga_info["id"] = task["manga_id"]
        if not manga_info.get("source"):
            manga_info["source"] = task["source"]
        if not manga_info.get("source_name"):
            manga_info["source_name"] = getattr(source_obj, "name", task["source"])
        if not manga_info.get("cover_url"):
            manga_info["cover_url"] = task.get("cover_url", "")

        try:
            with open(details_path, "w", encoding="utf-8") as f:
                json.dump(manga_info, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

        cover_names = ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]
        has_cover = any(os.path.exists(os.path.join(manga_folder, c)) for c in cover_names)
        target_cover_url = manga_info.get("cover_url") or task.get("cover_url")

        if not has_cover and target_cover_url:
            try:
                actual_cover_url, cov_headers = self._normalize_download_url(target_cover_url)
                cov_resp = requests.get(actual_cover_url, headers=cov_headers, timeout=15)
                if cov_resp.status_code == 200 and len(cov_resp.content) > 100:
                    cov_dest = os.path.join(manga_folder, "cover.jpg")
                    with open(cov_dest, "wb") as f:
                        f.write(cov_resp.content)
                    
                    covers_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "covers")
                    os.makedirs(covers_dir, exist_ok=True)
                    cached_cov = os.path.join(covers_dir, f"{task['manga_id']}.jpg")
                    with open(cached_cov, "wb") as f:
                        f.write(cov_resp.content)
            except Exception:
                pass

        try:
            conn_db = db.get_db()
            lib_row = conn_db.execute("SELECT id, summary, genres, author, artist, path FROM library WHERE id = ?", (task["manga_id"],)).fetchone()
            if lib_row:
                genres_json = json.dumps(manga_info.get("genres", []))
                conn_db.execute("""
                UPDATE library 
                SET path = ?, summary = COALESCE(NULLIF(summary, ''), ?),
                    genres = COALESCE(NULLIF(genres, '[]'), ?),
                    author = COALESCE(NULLIF(author, ''), ?),
                    artist = COALESCE(NULLIF(artist, ''), ?),
                    last_updated = ?
                WHERE id = ?
                """, (
                    manga_folder,
                    manga_info.get("summary") or manga_info.get("description", ""),
                    genres_json,
                    manga_info.get("author", ""),
                    manga_info.get("artist", ""),
                    time.time(),
                    task["manga_id"]
                ))
                conn_db.commit()
            conn_db.close()
        except Exception:
            pass

    def _worker_loop(self):
        from server.sources import get_source

        while self.is_running:
            conn = db.get_db()
            task_row = conn.execute("""
            SELECT * FROM download_tasks 
            WHERE status = 'pending' AND (cleared IS NULL OR cleared = 0)
            ORDER BY 
                priority DESC,
                created_at ASC,
                CAST(chapter_number AS REAL) ASC
            LIMIT 1
            """).fetchone()
            conn.close()

            if not task_row:
                self.current_task = None
                self.wake_event.wait(timeout=1.5)
                self.wake_event.clear()
                continue

            task = dict(task_row)
            task_id = task["id"]

            with self.lock:
                if task_id in self.cancelled_tasks:
                    conn = db.get_db()
                    conn.execute("UPDATE download_tasks SET status = 'cancelled', cleared = 1 WHERE id = ?", (task_id,))
                    conn.commit()
                    conn.close()
                    continue
                if task_id in self.paused_tasks:
                    conn = db.get_db()
                    conn.execute("UPDATE download_tasks SET status = 'paused' WHERE id = ?", (task_id,))
                    conn.commit()
                    conn.close()
                    continue

            # Check if manga has excluded this scanlator
            m_id = task.get("manga_id")
            scan = (task.get("scanlator") or "unofficial").lower().strip()
            excluded_scans = db.get_manga_excluded_scanlators(m_id) if m_id else set()
            if excluded_scans and scan in excluded_scans:
                conn = db.get_db()
                conn.execute("UPDATE download_tasks SET status = 'cancelled', cleared = 1, error_message = 'Cancelled: scanlator excluded' WHERE id = ?", (task_id,))
                conn.commit()
                conn.close()
                continue

            self.current_task = task_id

            conn = db.get_db()
            conn.execute("UPDATE download_tasks SET status = 'downloading' WHERE id = ?", (task_id,))
            conn.commit()
            conn.close()

            temp_cbz = None
            try:
                source_obj = get_source(task["source"])
                if not source_obj:
                    raise Exception(f"Unknown source {task['source']}")

                page_urls = source_obj.get_chapter_pages(task["chapter_id"])
                total_pages = len(page_urls)

                if total_pages == 0:
                    raise Exception("No pages returned from source for this chapter")

                conn = db.get_db()
                conn.execute("UPDATE download_tasks SET total_pages = ? WHERE id = ?", (total_pages, task_id))
                conn.commit()
                conn.close()

                sanitized_manga = self._sanitize_filename(task["manga_title"]) or "Downloaded Manga"
                manga_folder = os.path.join(self._get_download_base_dir(), sanitized_manga)
                os.makedirs(manga_folder, exist_ok=True)

                self._save_manga_offline_metadata_and_cover(task, source_obj, manga_folder)

                ch_num_str = str(task["chapter_number"])
                ch_title = task.get("chapter_title") or ""
                scanlator = task.get("scanlator") or ""

                cbz_filename = get_chapter_cbz_name(
                    chapter_name=ch_title,
                    chapter_number=ch_num_str,
                    scanlator=scanlator,
                    chapter_id=task.get("chapter_id", "")
                )

                cbz_path = os.path.join(manga_folder, cbz_filename)
                temp_cbz = cbz_path + ".tmp"

                page_data_list = []
                headers = {"User-Agent": "Mozilla/5.0"}

                for p_idx, p_url in enumerate(page_urls):
                    with self.lock:
                        if task_id in self.cancelled_tasks:
                            raise Exception("Download cancelled by user")
                        if task_id in self.paused_tasks:
                            raise Exception("Download paused by user")

                    actual_url, headers = self._normalize_download_url(p_url)

                    r = None
                    last_err = None
                    for attempt in range(3):
                        try:
                            r = requests.get(actual_url, headers=headers, timeout=20)
                            if r.status_code == 200 and len(r.content) > 100:
                                break
                        except Exception as req_err:
                            last_err = req_err
                            time.sleep(1)

                    if not r or r.status_code != 200:
                        raise Exception(f"Failed to download page {p_idx+1}: HTTP {r.status_code if r else last_err}")

                    ext = ".jpg"
                    if "image/png" in r.headers.get("Content-Type", ""):
                        ext = ".png"
                    elif "image/webp" in r.headers.get("Content-Type", ""):
                        ext = ".webp"

                    page_data_list.append((f"{p_idx+1:03d}{ext}", r.content))

                    pct = round(((p_idx + 1) / total_pages) * 100, 1)
                    conn = db.get_db()
                    conn.execute("UPDATE download_tasks SET downloaded_pages = ?, progress = ? WHERE id = ?", (p_idx + 1, pct, task_id))
                    conn.commit()
                    conn.close()

                comic_info_xml = f"""<?xml version='1.0' encoding='UTF-8' ?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>{task['chapter_title']}</Title>
  <Series>{task['manga_title']}</Series>
  <Number>{ch_num_str}</Number>
  <mh:SourceMihon xmlns:mh="http://www.w3.org/2001/XMLSchema">{source_obj.name}</mh:SourceMihon>
</ComicInfo>
"""

                with zipfile.ZipFile(temp_cbz, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr("ComicInfo.xml", comic_info_xml)
                    for filename, content in page_data_list:
                        zf.writestr(filename, content)

                if os.path.exists(cbz_path):
                    os.remove(cbz_path)
                os.rename(temp_cbz, cbz_path)

                auto_clear = (db.get_setting("auto_clear_downloads", "true") or "true").lower() in ("true", "1")
                cleared_val = 1 if auto_clear else 0

                conn = db.get_db()
                conn.execute("""
                UPDATE download_tasks 
                SET status = 'completed', progress = 100, completed_at = ?, cleared = ?
                WHERE id = ?
                """, (time.time(), cleared_val, task_id))
                conn.commit()
                conn.close()

                # Sync chapter download status in SQLite cache
                db.update_chapter_download_flag(task["manga_id"], task["chapter_id"], True)

            except Exception as e:
                err_msg = str(e)
                if temp_cbz and os.path.exists(temp_cbz):
                    try:
                        os.remove(temp_cbz)
                    except Exception:
                        pass

                final_status = 'cancelled' if 'cancelled' in err_msg.lower() else ('paused' if 'paused' in err_msg.lower() else 'failed')
                conn = db.get_db()
                conn.execute("""
                UPDATE download_tasks 
                SET status = ?, error_message = ?
                WHERE id = ?
                """, (final_status, err_msg, task_id))
                conn.commit()
                conn.close()

            finally:
                self.current_task = None

downloader_instance = ChapterDownloader()
