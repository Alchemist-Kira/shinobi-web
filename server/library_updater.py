import os
import time
import json
import logging
import threading
from server import db
from server.sources import get_source
from server.downloader import downloader_instance

logger = logging.getLogger("library_updater")

def calculate_mihon_schedule(chapters, current_fetch_interval=0, is_completed=False):
    """
    Computes update interval and next expected update timestamp according to Mihon's algorithm:
    - Default/adaptive interval: median gap between chapter releases, clamped 1..28 days.
    - Custom interval: absolute value of user-defined interval.
    - Next update: latest upload timestamp + interval * 86400s.
    """
    if is_completed:
        return 0, 0.0

    user_interval = abs(current_fetch_interval) if current_fetch_interval != 0 else None
    
    timestamps = []
    for ch in chapters:
        d = ch.get("date_upload") or ch.get("date") or ch.get("created_at")
        if not d:
            continue
        try:
            ts = float(d)
            if ts > 100000000000:  # ms
                ts = ts / 1000.0
            if ts > 0:
                timestamps.append(ts)
        except Exception:
            pass
    
    now_ts = time.time()
    
    if user_interval is not None:
        interval_days = user_interval
    elif len(timestamps) < 2:
        interval_days = 7
    else:
        timestamps.sort()
        gaps = []
        for i in range(1, len(timestamps)):
            gap = (timestamps[i] - timestamps[i - 1]) / 86400.0
            if gap > 0:
                gaps.append(gap)
        if not gaps:
            interval_days = 7
        else:
            gaps.sort()
            mid = len(gaps) // 2
            median_gap = gaps[mid] if len(gaps) % 2 != 0 else (gaps[mid - 1] + gaps[mid]) / 2.0
            interval_days = max(1, min(28, int(round(median_gap))))
            if interval_days == 0:
                interval_days = 7

    latest_ts = max(timestamps) if timestamps else now_ts
    next_update_ts = latest_ts + (interval_days * 86400.0)
    stored_interval = -interval_days if (current_fetch_interval and current_fetch_interval != 0) else interval_days
    return stored_interval, next_update_ts

class LibraryUpdater:
    def __init__(self):
        self.is_updating = False
        self.progress = {
            "current": 0,
            "total": 0,
            "current_title": "",
            "new_chapters_total": 0,
            "status": "idle"
        }
        self.last_result = None
        self._scheduler_started = False
        self._lock = threading.Lock()

    def get_status(self):
        return {
            "is_updating": self.is_updating,
            "progress": self.progress,
            "last_result": self.last_result
        }

    def trigger_update(self, skip_completed=None, auto_download_count=None, force_all=False):
        """Triggers library update in background thread if not already running."""
        with self._lock:
            if self.is_updating:
                return {"success": False, "message": "Library update already in progress.", "is_updating": True}
        
        t = threading.Thread(
            target=self.update_library,
            kwargs={"skip_completed": skip_completed, "auto_download_count": auto_download_count, "force_all": force_all},
            daemon=True,
            name="LibraryUpdaterThread"
        )
        t.start()
        return {"success": True, "message": "Library update started in background.", "is_updating": True}

    def update_library(self, skip_completed=None, auto_download_count=None, force_all=False):
        """
        Polls sources for all library manga, finds new chapters, updates SQLite,
        and optionally auto-downloads new releases.
        """
        with self._lock:
            if self.is_updating:
                return {"success": False, "message": "Library update already in progress."}
            self.is_updating = True

        try:
            # 1. Load settings
            if skip_completed is None:
                skip_completed = db.get_setting("library_update_skip_completed", "true").lower() == "true"
            if auto_download_count is None:
                try:
                    auto_download_count = int(db.get_setting("library_update_auto_download", "0"))
                except Exception:
                    auto_download_count = 0

            # 2. Query library
            conn = db.get_db()
            items = conn.execute("""
                SELECT id, source, title, status, chapters_json, chapter_count, cover_url, 
                       update_strategy, fetch_interval, next_update 
                FROM library 
                ORDER BY title ASC
            """).fetchall()
            conn.close()

            total_items = len(items)
            self.progress = {
                "current": 0,
                "total": total_items,
                "current_title": "",
                "new_chapters_total": 0,
                "status": "updating"
            }

            updated_manga = []
            total_new_chapters = 0

            for idx, item in enumerate(items):
                m_id = item["id"]
                title = item["title"]
                source_id = item["source"]
                status = (item["status"] or "").lower()
                now_ts = time.time()

                self.progress["current"] = idx + 1
                self.progress["current_title"] = title

                # Skip completed manga if configured
                if skip_completed and status in ("completed", "finished"):
                    logger.info(f"Skipping completed manga: {title}")
                    continue

                # Respect per-manga update_strategy setting (e.g. skip / paused)
                u_strategy = (item["update_strategy"] or "smart").lower()
                if u_strategy in ("skip", "never", "paused"):
                    logger.info(f"Skipping manga with update_strategy={u_strategy}: {title}")
                    continue

                # Mihon smart schedule check: skip if not yet due unless forced
                next_up_val = float(item["next_update"] or 0.0)
                if not force_all and next_up_val > now_ts:
                    logger.info(f"Skipping {title}: next update not due until {time.ctime(next_up_val)}")
                    continue

                if source_id == "local":
                    # Local manga are scanned by scanner; skip remote check
                    continue

                src = get_source(source_id)
                if not src:
                    logger.warning(f"Source {source_id} not available for {title}")
                    continue

                try:
                    try:
                        fresh_chapters = src.get_chapters(m_id, limit=10000, refresh=True)
                    except TypeError:
                        fresh_chapters = src.get_chapters(m_id, limit=10000)
                    if not fresh_chapters:
                        continue

                    # Parse existing chapters
                    existing_chs = []
                    if item["chapters_json"]:
                        try:
                            existing_chs = json.loads(item["chapters_json"])
                        except Exception:
                            existing_chs = []

                    existing_keys = set()
                    for ch in existing_chs:
                        k = ch.get("id") or ch.get("url") or str(ch.get("chapter_number"))
                        if k:
                            existing_keys.add(k)

                    # Find new chapters not in existing list
                    new_found = []
                    for fresh in fresh_chapters:
                        k = fresh.get("id") or fresh.get("url") or str(fresh.get("chapter_number"))
                        if k and k not in existing_keys:
                            new_found.append(fresh)

                    # Calculate Mihon release schedule
                    is_comp = status in ("completed", "finished")
                    curr_f_interval = int(item["fetch_interval"] or 0)
                    calc_interval, calc_next_up = calculate_mihon_schedule(fresh_chapters, curr_f_interval, is_comp)

                    conn = db.get_db()
                    cursor = conn.cursor()

                    if new_found:
                        new_count = len(new_found)
                        total_new_chapters += new_count
                        self.progress["new_chapters_total"] = total_new_chapters

                        # Update library with fresh chapters, badges, and Mihon schedule
                        cursor.execute("""
                            UPDATE library
                            SET chapters_json = ?,
                                chapter_count = ?,
                                new_chapters_count = COALESCE(new_chapters_count, 0) + ?,
                                last_updated = ?,
                                last_checked = ?,
                                fetch_interval = ?,
                                next_update = ?
                            WHERE id = ?
                        """, (json.dumps(fresh_chapters), db.calculate_effective_chapter_count(fresh_chapters), new_count, now_ts, now_ts, calc_interval, calc_next_up, m_id))

                        updated_manga.append({
                            "id": m_id,
                            "title": title,
                            "new_chapters": new_count
                        })

                        logger.info(f"Found {new_count} new chapters for {title}")

                        # Auto-download new chapters if configured
                        if auto_download_count > 0:
                            excluded_scans = db.get_manga_excluded_scanlators(m_id)
                            valid_new = [
                                ch for ch in new_found
                                if (ch.get("scanlator") or "unofficial").lower().strip() not in excluded_scans
                            ]
                            # Queue up to N newest chapters
                            to_dl = valid_new[:auto_download_count]
                            for ch in to_dl:
                                try:
                                    ch_id = ch.get("id") or ch.get("url")
                                    ch_num = ch.get("chapter_number") or 0.0
                                    ch_title = ch.get("title") or ch.get("name") or f"Chapter {ch_num}"
                                    ch_scan = str(ch.get("scanlator", "") or "").strip()
                                    downloader_instance.add_to_queue(
                                        manga_id=m_id,
                                        chapter_id=ch_id,
                                        manga_title=title,
                                        chapter_title=ch_title,
                                        chapter_number=ch_num,
                                        cover_url=item["cover_url"],
                                        source=source_id,
                                        scanlator=ch_scan
                                    )
                                except Exception as dl_err:
                                    logger.error(f"Error queueing auto-download: {dl_err}")
                    else:
                        cursor.execute("""
                            UPDATE library 
                            SET last_checked = ?,
                                fetch_interval = ?,
                                next_update = ?
                            WHERE id = ?
                        """, (now_ts, calc_interval, calc_next_up, m_id))

                    conn.commit()
                    conn.close()

                except Exception as check_err:
                    logger.error(f"Error checking updates for {title} ({m_id}): {check_err}")

            now_finish = time.time()
            db.set_setting("last_library_update_time", str(now_finish))

            result = {
                "success": True,
                "timestamp": now_finish,
                "total_checked": total_items,
                "updated_manga_count": len(updated_manga),
                "new_chapters_total": total_new_chapters,
                "updated_manga": updated_manga
            }
            self.last_result = result
            self.progress["status"] = "completed"
            return result

        finally:
            with self._lock:
                self.is_updating = False

    def check_and_run_scheduled_update(self):
        """Checks if scheduled background library update is due."""
        try:
            freq = db.get_setting("library_update_frequency", "daily")
            if not freq or freq == "off":
                return None

            interval_map = {
                "6h": 6 * 3600,
                "12h": 12 * 3600,
                "daily": 24 * 3600,
                "2days": 48 * 3600,
                "weekly": 7 * 24 * 3600
            }
            interval = interval_map.get(freq)
            if not interval:
                return None

            last_run_str = db.get_setting("last_library_update_time", "0")
            try:
                last_run = float(last_run_str)
            except Exception:
                last_run = 0.0

            now = time.time()
            if (now - last_run) >= interval:
                logger.info(f"Triggering scheduled library update (frequency: {freq})...")
                return self.update_library()
        except Exception as e:
            logger.error(f"Error in check_and_run_scheduled_update: {e}")
        return None

    def start_background_scheduler(self):
        """Starts background worker daemon for periodic updates."""
        if self._scheduler_started:
            return
        self._scheduler_started = True

        def _worker():
            time.sleep(10)
            while True:
                try:
                    self.check_and_run_scheduled_update()
                except Exception as e:
                    logger.error(f"Error in library update scheduler: {e}")
                time.sleep(60)

        t = threading.Thread(target=_worker, daemon=True, name="LibraryUpdateScheduler")
        t.start()
        logger.info("Background library update scheduler started.")

library_updater = LibraryUpdater()
