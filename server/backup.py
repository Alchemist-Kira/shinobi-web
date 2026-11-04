import os
import re
import json
import time
import gzip
import logging
from datetime import datetime, timezone
from server.db import get_db, add_category, update_manga_categories
from server.schema_backup_pb2 import Backup, BackupManga, BackupCategory, BackupChapter, BackupSource, BackupHistory

logger = logging.getLogger("backup_system")

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

# Standard Tachiyomi/Mihon Manga status integer mapping
STATUS_MAP_STR_TO_INT = {
    "unknown": 0,
    "ongoing": 1,
    "completed": 2,
    "licensed": 3,
    "publishing finished": 4,
    "cancelled": 5,
    "on hiatus": 6,
    "hiatus": 6,
}

STATUS_MAP_INT_TO_STR = {
    0: "Unknown",
    1: "Ongoing",
    2: "Completed",
    3: "Licensed",
    4: "Publishing Finished",
    5: "Cancelled",
    6: "On Hiatus",
}

# Known extension source IDs matching official Tachiyomi/Mihon extension APKs
KNOWN_SOURCE_IDS = {
    "asurascans": 6247824327199706550,
    "asura": 6247824327199706550,
    "mangafire": 6084907896154116083,
    "mangapill": 8448310129093543312,
    "mangadex": 2499283573021220255,
    "local": 0,
}

KNOWN_SOURCE_NAMES = {
    6247824327199706550: "Asura Scans",
    6084907896154116083: "MangaFire",
    8448310129093543312: "MangaPill",
    2499283573021220255: "MangaDex",
    0: "Local source",
}

def resolve_source_id(source_val):
    """Resolves string or numeric source into a valid int64 and source name."""
    if not source_val:
        return 0, "Local source"
    src_str = str(source_val).strip()
    if src_str.isdigit():
        sid = int(src_str)
        name = KNOWN_SOURCE_NAMES.get(sid, f"Source {sid}")
        return sid, name
    src_lower = src_str.lower()
    if src_lower in KNOWN_SOURCE_IDS:
        sid = KNOWN_SOURCE_IDS[src_lower]
        return sid, KNOWN_SOURCE_NAMES.get(sid, src_str.capitalize())
    # Query Suwayomi source list if available
    try:
        import requests
        res = requests.get("http://127.0.0.1:4567/api/v1/source/list", timeout=1.5)
        if res.status_code == 200:
            for s in res.json():
                if str(s.get("id")) == src_str or s.get("name", "").lower() == src_lower:
                    sid = int(s.get("id"))
                    return sid, s.get("name") or src_str
    except Exception:
        pass
    # Deterministic fallback int64
    import hashlib
    sid = int(hashlib.sha256(src_lower.encode("utf-8")).hexdigest()[:15], 16) & 0x7FFFFFFFFFFFFFFF
    return sid, src_str.capitalize()

def generate_tachibk_bytes(library_items=None, categories=None, manga_categories=None, reading_progress=None):
    """
    Builds official Mihon/Tachiyomi protocol buffer .tachibk backup payload
    conforming to tachiyomi.Backup protobuf definition.
    """
    backup_proto = Backup()

    # 1. Categories
    cat_order_map = {}
    for idx, cat in enumerate(categories or []):
        bc = backup_proto.backupCategories.add()
        bc.name = cat.get("name") or "Category"
        bc.order = int(cat.get("sort_order") if cat.get("sort_order") is not None else idx)
        bc.flags = 0
        if cat.get("id"):
            cat_order_map[cat.get("id")] = bc.order
        if cat.get("name"):
            cat_order_map[cat.get("name").lower()] = bc.order

    # Group reading progress by manga_id
    prog_by_manga = {}
    for pr in (reading_progress or []):
        m_id = pr.get("manga_id")
        if m_id:
            prog_by_manga.setdefault(m_id, []).append(pr)

    # Multi-category map
    mc_map = {}
    for mc in (manga_categories or []):
        mc_map.setdefault(mc.get("manga_id"), []).append(mc.get("category_id"))

    # Sources registry
    sources_used = {}

    for item in (library_items or []):
        m_id = item.get("id") or ""
        bm = backup_proto.backupManga.add()
        bm.title = item.get("title") or "Untitled"
        bm.author = item.get("author") or ""
        bm.artist = item.get("artist") or ""
        bm.description = item.get("summary") or ""
        bm.thumbnailUrl = item.get("cover_url") or ""
        bm.url = item.get("path") or m_id
        bm.favorite = bool(item.get("favorite", 1))

        # Status
        st_str = (item.get("status") or "").lower()
        bm.status = STATUS_MAP_STR_TO_INT.get(st_str, 1)

        # Genres
        genres = item.get("genres") or []
        if isinstance(genres, str):
            try:
                genres = json.loads(genres)
            except Exception:
                genres = [g.strip() for g in genres.split(",") if g.strip()]
        if isinstance(genres, list):
            for g in genres:
                if g and isinstance(g, str):
                    bm.genre.append(g)

        # Source
        src_id, src_name = resolve_source_id(item.get("source"))
        bm.source = src_id
        sources_used[src_id] = src_name

        # Categories
        cat_ids = item.get("category_ids") or mc_map.get(m_id) or [item.get("category_id") or "default"]
        if isinstance(cat_ids, str):
            try:
                cat_ids = json.loads(cat_ids)
            except Exception:
                cat_ids = [cat_ids]
        for cid in cat_ids:
            if cid in cat_order_map:
                bm.categories.append(cat_order_map[cid])
            elif str(cid).lower() in cat_order_map:
                bm.categories.append(cat_order_map[str(cid).lower()])

        # Chapters
        chs = item.get("chapters_json")
        if isinstance(chs, str) and chs.strip():
            try:
                chs = json.loads(chs)
            except Exception:
                chs = []
        if not isinstance(chs, list):
            chs = []

        m_progress_list = prog_by_manga.get(m_id, [])
        prog_by_ch = {p.get("chapter_id"): p for p in m_progress_list if p.get("chapter_id")}

        for idx, ch in enumerate(chs):
            if not isinstance(ch, dict):
                continue
            bc = bm.chapters.add()
            bc.name = ch.get("title") or ch.get("name") or f"Chapter {idx+1}"
            ch_url = ch.get("url") or ch.get("raw_id") or ch.get("id") or str(idx)
            bc.url = ch_url
            bc.scanlator = ch.get("scanlator") or ""

            # Check reading progress record
            pr_rec = prog_by_ch.get(ch.get("id")) or prog_by_ch.get(ch_url)

            is_read = bool(ch.get("is_read") or ch.get("read") or (pr_rec and pr_rec.get("is_read")))
            bc.read = is_read
            bc.bookmark = bool(ch.get("is_bookmarked") or ch.get("bookmark") or (pr_rec and pr_rec.get("is_bookmarked")))

            try:
                bc.chapterNumber = float(ch.get("chapter_number") or ch.get("chapterNumber") or 0.0)
            except Exception:
                bc.chapterNumber = 0.0

            last_page = int(ch.get("lastPageRead") or ch.get("page_index") or (pr_rec.get("page_index") if pr_rec else 0) or 0)
            bc.lastPageRead = last_page

            if ch.get("date_upload"):
                try:
                    bc.dateUpload = int(ch["date_upload"])
                except Exception:
                    pass
            if ch.get("date_fetch"):
                try:
                    bc.dateFetch = int(ch["date_fetch"])
                except Exception:
                    pass

            # History entry
            if pr_rec and pr_rec.get("last_read_at"):
                try:
                    last_ts = int(float(pr_rec["last_read_at"]) * 1000)
                    hist = bm.history.add()
                    hist.url = ch_url
                    hist.lastRead = last_ts
                    hist.readDuration = 0
                except Exception:
                    pass

    # Populate backupSources
    for sid, sname in sources_used.items():
        bs = backup_proto.backupSources.add()
        bs.sourceId = sid
        bs.name = sname

    raw_bytes = backup_proto.SerializeToString()
    return gzip.compress(raw_bytes)

def create_backup(save_to_disk=True):
    """
    Exports full Mihon Web library, categories, multi-category associations,
    reading progress, history, and settings into official Mihon / Tachiyomi .tachibk
    protobuf format as well as standard JSON format.
    """
    conn = get_db()
    
    # 1. Categories
    cat_rows = conn.execute("SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC").fetchall()
    categories = [dict(r) for r in cat_rows]

    # 2. Multi-category mappings
    mc_rows = conn.execute("SELECT manga_id, category_id FROM manga_categories").fetchall()
    manga_categories = [dict(r) for r in mc_rows]
    mc_map = {}
    for r in mc_rows:
        mc_map.setdefault(r["manga_id"], []).append(r["category_id"])

    # 3. Library manga
    lib_rows = conn.execute("""
        SELECT id, source, title, cover_url, author, artist, status, summary, 
               genres, path, favorite, category_id, category_ids, created_at, 
               last_updated, chapter_count, chapters_json 
        FROM library
        ORDER BY title ASC
    """).fetchall()
    
    library_items = []
    for r in lib_rows:
        item = dict(r)
        item["category_ids"] = mc_map.get(item["id"]) or [item.get("category_id") or "default"]
        if item.get("genres"):
            try:
                item["genres"] = json.loads(item["genres"]) if isinstance(item["genres"], str) else item["genres"]
            except Exception:
                pass
        library_items.append(item)

    # 4. Reading Progress & History
    prog_rows = conn.execute("""
        SELECT manga_id, chapter_id, page_index, total_pages, is_read, 
               is_bookmarked, last_read_at, manga_title, cover_url, source, 
               chapter_title, chapter_number
        FROM reading_progress
        ORDER BY last_read_at DESC
    """).fetchall()
    reading_progress = [dict(r) for r in prog_rows]

    # 5. Settings
    set_rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings_dict = {}
    for r in set_rows:
        try:
            settings_dict[r["key"]] = json.loads(r["value"])
        except Exception:
            settings_dict[r["key"]] = r["value"]

    conn.close()

    now_ts = time.time()
    now_iso = datetime.now(timezone.utc).isoformat()
    
    backup_data = {
        "version": 2,
        "app": "Shinobi",
        "backup_version": "1.0",
        "format": "tachibk",
        "created_at": now_ts,
        "created_at_iso": now_iso,
        "stats": {
            "manga_count": len(library_items),
            "category_count": len(categories),
            "progress_count": len(reading_progress)
        },
        "categories": categories,
        "manga_categories": manga_categories,
        "library": library_items,
        "reading_progress": reading_progress,
        "settings": settings_dict
    }

    # Generate official Mihon & Tachiyomi .tachibk protobuf payload
    tachibk_bytes = generate_tachibk_bytes(
        library_items=library_items,
        categories=categories,
        manga_categories=manga_categories,
        reading_progress=reading_progress
    )

    primary_filepath = None
    if save_to_disk:
        timestamp_str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
        # Primary file: .tachibk (supported natively by Shinobi, Mihon, and Tachiyomi APK)
        tachibk_filename = f"shinobi_backup_{timestamp_str}.tachibk"
        primary_filepath = os.path.join(BACKUP_DIR, tachibk_filename)
        with open(primary_filepath, "wb") as f:
            f.write(tachibk_bytes)
            
        # Secondary file: .json (local human-readable backup)
        json_filename = f"shinobi_backup_{timestamp_str}.json"
        json_filepath = os.path.join(BACKUP_DIR, json_filename)
        with open(json_filepath, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)
            
        logger.info(f"Created local Shinobi backup at {primary_filepath} and {json_filepath}")

    return backup_data, primary_filepath

def list_backups():
    """Returns list of local backups stored on disk in data/backups/ (.tachibk and .json)."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backups = []
    
    try:
        for fname in os.listdir(BACKUP_DIR):
            if not (fname.endswith(".json") or fname.endswith(".tachibk") or fname.endswith(".gz")):
                continue
            fpath = os.path.join(BACKUP_DIR, fname)
            if not os.path.isfile(fpath):
                continue
            
            stat = os.stat(fpath)
            size_kb = round(stat.st_size / 1024, 1)
            created_at = stat.st_mtime
            created_iso = datetime.fromtimestamp(created_at).strftime("%Y-%m-%d %H:%M:%S")

            manga_count = 0
            cat_count = 0
            
            if fname.endswith(".tachibk") or fname.endswith(".gz"):
                try:
                    with open(fpath, "rb") as bf:
                        raw = bf.read()
                    decomp = gzip.decompress(raw) if (len(raw) >= 2 and raw[0] == 0x1F and raw[1] == 0x8B) else raw
                    bp = Backup()
                    bp.ParseFromString(decomp)
                    manga_count = len(bp.backupManga)
                    cat_count = len(bp.backupCategories)
                except Exception:
                    pass
            elif fname.endswith(".json"):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        stats = data.get("stats") or {}
                        manga_count = stats.get("manga_count") or len(data.get("library") or data.get("backupManga") or [])
                        cat_count = stats.get("category_count") or len(data.get("categories") or data.get("backupCategories") or [])
                except Exception:
                    pass

            backups.append({
                "filename": fname,
                "filepath": fpath,
                "size_kb": size_kb,
                "created_at": created_at,
                "created_iso": created_iso,
                "manga_count": manga_count,
                "category_count": cat_count,
                "format": "tachibk" if fname.endswith(".tachibk") else "json"
            })
    except Exception as e:
        logger.error(f"Error listing backups: {e}")

    backups.sort(key=lambda b: b["created_at"], reverse=True)
    return backups

def delete_backup(filename):
    """Safely removes a backup from data/backups/."""
    clean_name = os.path.basename(filename)
    fpath = os.path.join(BACKUP_DIR, clean_name)
    if os.path.isfile(fpath):
        os.remove(fpath)
        return True
    return False

def get_backup_path(filename):
    """Returns absolute path to a backup file if it exists."""
    clean_name = os.path.basename(filename)
    fpath = os.path.join(BACKUP_DIR, clean_name)
    if os.path.isfile(fpath):
        return fpath
    return None

def prune_auto_backups(max_keep=5):
    """Retains the most recent N auto backups, deleting older ones."""
    try:
        for ext in (".tachibk", ".json"):
            backups = [f for f in os.listdir(BACKUP_DIR) if (f.startswith("shinobi_backup_") or f.startswith("mihon_backup_")) and f.endswith(ext)]
            if len(backups) > max_keep:
                backups.sort(reverse=True)
                for old_file in backups[max_keep:]:
                    fpath = os.path.join(BACKUP_DIR, old_file)
                    try:
                        os.remove(fpath)
                        logger.info(f"Pruned older backup: {old_file}")
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"Error pruning backups: {e}")

def check_and_run_auto_backup():
    """
    Checks if automatic backup is due based on settings.
    Supported frequencies: 'off', '6h', '12h', 'daily', '2days', 'weekly'
    """
    try:
        from server.db import get_setting, set_setting
        freq = get_setting("auto_backup_frequency", "off")
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

        last_run_str = get_setting("last_auto_backup_time", "0")
        try:
            last_run = float(last_run_str)
        except Exception:
            last_run = 0.0

        now = time.time()
        if (now - last_run) >= interval:
            logger.info(f"Triggering scheduled auto-backup (frequency: {freq})...")
            backup_data, filepath = create_backup(save_to_disk=True)
            set_setting("last_auto_backup_time", str(now))
            prune_auto_backups(max_keep=5)
            return filepath
    except Exception as e:
        logger.error(f"Error in check_and_run_auto_backup: {e}")
    return None

_auto_backup_thread_started = False

def start_auto_backup_scheduler():
    global _auto_backup_thread_started
    if _auto_backup_thread_started:
        return
    _auto_backup_thread_started = True

    import threading
    def _worker():
        time.sleep(5)
        while True:
            try:
                check_and_run_auto_backup()
            except Exception as e:
                logger.error(f"Error in auto-backup worker: {e}")
            time.sleep(60)

    t = threading.Thread(target=_worker, daemon=True, name="AutoBackupScheduler")
    t.start()


def is_tachiyomi_protobuf_backup(raw_bytes):
    """Checks if the byte payload is a gzipped protobuf (.tachibk)."""
    if isinstance(raw_bytes, (bytes, bytearray)) and len(raw_bytes) >= 2 and raw_bytes[0] == 0x1F and raw_bytes[1] == 0x8B:
        try:
            decomp = gzip.decompress(raw_bytes)
            try:
                json.loads(decomp.decode("utf-8"))
                return False  # Valid JSON inside gzip
            except Exception:
                return True   # Gzipped binary / protobuf
        except Exception:
            return True
    return False

def restore_tachiyomi_apk_backup(content):
    """
    Imports standard Tachiyomi/Mihon .tachibk protobuf file into SQLite,
    and synchronizes with Suwayomi if running.
    """
    decomp = gzip.decompress(content) if (len(content) >= 2 and content[0] == 0x1F and content[1] == 0x8B) else content
    backup_proto = Backup()
    backup_proto.ParseFromString(decomp)

    conn = get_db()
    cursor = conn.cursor()
    restored_manga = 0
    restored_categories = 0
    restored_progress = 0

    try:
        # 1. Restore Categories
        cat_order_to_id = {}
        for idx, bc in enumerate(backup_proto.backupCategories):
            cname = bc.name.strip() if bc.name else f"Category {idx+1}"
            cid = re.sub(r'[^a-zA-Z0-9_-]', '_', cname.lower().strip()) or f"cat_{bc.order}"
            try:
                existing_cat = cursor.execute("SELECT id FROM categories WHERE LOWER(name) = LOWER(?)", (cname,)).fetchone()
                if existing_cat:
                    cid = existing_cat[0]
                    cursor.execute("UPDATE categories SET sort_order = ? WHERE id = ?", (bc.order, cid))
                else:
                    cursor.execute("""
                        INSERT INTO categories (id, name, sort_order)
                        VALUES (?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order
                    """, (cid, cname, bc.order))
                cat_order_to_id[bc.order] = cid
                restored_categories += 1
            except Exception as cat_err:
                logger.error(f"Error restoring category {cname}: {cat_err}")

        # 2. Restore Manga
        for bm in backup_proto.backupManga:
            title = bm.title or "Untitled"
            source_id = str(bm.source)
            url = bm.url or ""
            
            # Match existing manga in library by ID, path, or title to prevent duplicates
            existing = None
            if url:
                existing = cursor.execute("SELECT id FROM library WHERE id = ? OR (path != '' AND path = ?)", (url, url)).fetchone()
            if not existing and title:
                existing = cursor.execute("SELECT id FROM library WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))", (title,)).fetchone()

            if existing:
                m_id = existing[0]
            elif url and not url.startswith("/") and not url.startswith("http"):
                m_id = url
            elif url.startswith("/manga/") or url.startswith("suwayomi_"):
                m_id = url.strip("/").replace("/", "_")
            else:
                clean_title_slug = re.sub(r'[^a-zA-Z0-9_-]+', '-', title.lower()).strip('-')
                m_id = f"{source_id}_{clean_title_slug}"

            cover_url = bm.thumbnailUrl or ""
            author = bm.author or ""
            artist = bm.artist or ""
            status = STATUS_MAP_INT_TO_STR.get(bm.status, "Ongoing")
            summary = bm.description or ""
            genres = json.dumps(list(bm.genre))

            # Categories
            assigned_cids = []
            for order in bm.categories:
                if order in cat_order_to_id:
                    assigned_cids.append(cat_order_to_id[order])
            if not assigned_cids:
                assigned_cids = ["default"]
            primary_cat = assigned_cids[0]

            # Chapters
            chapters_list = []
            for bc in bm.chapters:
                ch_id = bc.url or f"ch_{bc.chapterNumber}"
                ch_name = bc.name or f"Chapter {bc.chapterNumber}"
                is_read = bool(bc.read)
                is_bm = bool(bc.bookmark)
                p_idx = int(bc.lastPageRead)

                ch_dict = {
                    "id": ch_id,
                    "title": ch_name,
                    "name": ch_name,
                    "url": bc.url,
                    "chapter_number": bc.chapterNumber,
                    "is_read": is_read,
                    "is_bookmarked": is_bm,
                    "last_page_read": p_idx,
                    "page_index": p_idx,
                    "scanlator": bc.scanlator,
                    "date_upload": bc.dateUpload,
                    "date_fetch": bc.dateFetch,
                    "source": source_id,
                }
                chapters_list.append(ch_dict)

                if is_read or is_bm or p_idx > 0:
                    try:
                        cursor.execute("""
                            INSERT INTO reading_progress
                            (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, last_read_at, manga_title, cover_url, source, chapter_title, chapter_number)
                            VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(manga_id, chapter_id) DO UPDATE SET
                                is_read = MAX(excluded.is_read, reading_progress.is_read),
                                is_bookmarked = MAX(excluded.is_bookmarked, reading_progress.is_bookmarked),
                                page_index = MAX(excluded.page_index, reading_progress.page_index)
                        """, (
                            m_id, ch_id, p_idx, 1 if is_read else 0, 1 if is_bm else 0,
                            time.time(), title, cover_url, source_id, ch_name, str(bc.chapterNumber)
                        ))
                        restored_progress += 1
                    except Exception:
                        pass

            # Restore history
            for h in bm.history:
                if h.url and h.lastRead:
                    h_ts = float(h.lastRead) / 1000.0
                    cursor.execute("""
                        UPDATE reading_progress
                        SET last_read_at = MAX(COALESCE(last_read_at, 0), ?)
                        WHERE manga_id = ? AND chapter_id = ?
                    """, (h_ts, m_id, h.url))

            cursor.execute("""
                INSERT INTO library
                (id, source, title, cover_url, author, artist, status, summary, genres, path, favorite, category_id, category_ids, created_at, last_updated, chapter_count, chapters_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    cover_url = COALESCE(NULLIF(excluded.cover_url, ''), library.cover_url),
                    category_id = excluded.category_id,
                    category_ids = excluded.category_ids,
                    chapter_count = MAX(excluded.chapter_count, library.chapter_count),
                    chapters_json = COALESCE(excluded.chapters_json, library.chapters_json)
            """, (
                m_id, source_id, title, cover_url, author, artist, status, summary, genres,
                url, primary_cat, json.dumps(assigned_cids), time.time(), time.time(),
                len(chapters_list), json.dumps(chapters_list)
            ))
            restored_manga += 1

            # Update multi-category mapping
            cursor.execute("DELETE FROM manga_categories WHERE manga_id = ?", (m_id,))
            for cid in assigned_cids:
                cursor.execute("INSERT OR IGNORE INTO manga_categories (manga_id, category_id) VALUES (?, ?)", (m_id, cid))

        conn.commit()

        # Also forward to Suwayomi if running
        try:
            import requests
            files = {"backup": ("backup.tachibk", content, "application/octet-stream")}
            res = requests.post("http://127.0.0.1:4567/api/v1/backup/import", files=files, timeout=40)
            if res.status_code == 200:
                logger.info("Successfully mirrored .tachibk backup into Suwayomi engine.")
        except Exception as suw_err:
            logger.info(f"Suwayomi import mirror skipped: {suw_err}")

    except Exception as e:
        logger.error(f"Error restoring Mihon / Tachiyomi .tachibk backup: {e}")
        raise e
    finally:
        conn.close()

    return {
        "success": True,
        "manga_count": restored_manga,
        "category_count": restored_categories,
        "progress_count": restored_progress,
        "message": f"Successfully restored {restored_manga} manga, {restored_categories} categories, and {restored_progress} progress records from Mihon / Tachiyomi backup."
    }

def parse_backup_content(raw_bytes_or_str):
    """
    Parses backup from JSON string, JSON bytes, or gzip-compressed JSON.
    """
    if isinstance(raw_bytes_or_str, str):
        return json.loads(raw_bytes_or_str)

    if isinstance(raw_bytes_or_str, (bytes, bytearray)):
        if len(raw_bytes_or_str) >= 2 and raw_bytes_or_str[0] == 0x1F and raw_bytes_or_str[1] == 0x8B:
            try:
                decompressed = gzip.decompress(raw_bytes_or_str)
                return json.loads(decompressed.decode("utf-8"))
            except Exception as gz_err:
                raise ValueError(f"Could not parse compressed JSON backup: {gz_err}")
        else:
            return json.loads(raw_bytes_or_str.decode("utf-8"))

    raise ValueError("Invalid backup content format")


def restore_backup(backup_data, restore_settings=False):
    """
    Restores library manga, categories, reading progress, and settings
    from a parsed JSON backup object.
    """
    if not isinstance(backup_data, dict):
        raise ValueError("Backup data must be a valid JSON object")

    conn = get_db()
    cursor = conn.cursor()

    restored_categories = 0
    restored_manga = 0
    restored_progress = 0

    cat_id_name_map = {}

    # 1. RESTORE CATEGORIES
    raw_cats = backup_data.get("categories") or backup_data.get("backupCategories") or []
    for cat in raw_cats:
        cat_name = ""
        cat_id = None
        sort_order = 0

        if isinstance(cat, dict):
            cat_name = cat.get("name") or ""
            cat_id = cat.get("id")
            sort_order = int(cat.get("sort_order") or cat.get("order") or 0)
        elif isinstance(cat, str):
            cat_name = cat

        if not cat_name:
            continue

        if not cat_id:
            cat_id = re.sub(r'[^a-zA-Z0-9_-]', '_', cat_name.lower().strip()) or f"cat_{int(time.time()*1000)}"

        cat_id_name_map[cat_name.lower()] = cat_id

        try:
            cursor.execute("""
                INSERT INTO categories (id, name, sort_order) 
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order
            """, (cat_id, cat_name, sort_order))
            restored_categories += 1
        except Exception:
            try:
                cursor.execute("UPDATE categories SET sort_order = ? WHERE name = ?", (sort_order, cat_name))
            except Exception:
                pass

    conn.commit()

    # 2. RESTORE LIBRARY MANGA
    raw_manga_list = backup_data.get("library") or backup_data.get("backupManga") or backup_data.get("manga") or []
    
    for m in raw_manga_list:
        if not isinstance(m, dict):
            continue

        m_id = m.get("id")
        title = m.get("title") or "Untitled"
        url = str(m.get("url") or m.get("path") or m.get("key") or "")
        
        # Check existing match by ID, path, or title to prevent duplicates
        existing = None
        if m_id:
            existing = cursor.execute("SELECT id FROM library WHERE id = ?", (m_id,)).fetchone()
        if not existing and url:
            existing = cursor.execute("SELECT id FROM library WHERE id = ? OR (path != '' AND path = ?)", (url, url)).fetchone()
        if not existing and title:
            existing = cursor.execute("SELECT id FROM library WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))", (title,)).fetchone()
            
        if existing:
            m_id = existing[0]
        elif not m_id:
            src = str(m.get("source") or "unknown")
            clean_title_slug = re.sub(r'[^a-zA-Z0-9_-]+', '-', title.lower()).strip('-')
            m_id = f"{src}_{clean_title_slug}"
        source = str(m.get("source") or "local")
        cover_url = m.get("cover_url") or m.get("thumbnailUrl") or ""
        author = m.get("author") or ""
        artist = m.get("artist") or ""
        status = m.get("status") or "Ongoing"
        summary = m.get("summary") or m.get("description") or ""

        genres_val = m.get("genres") or m.get("genre") or []
        genres_str = json.dumps(genres_val) if isinstance(genres_val, list) else str(genres_val)
        
        path = m.get("path") or ""
        chapter_count = int(m.get("chapter_count") or len(m.get("chapters") or []))

        # Categories mapping
        cat_ids = m.get("category_ids") or []
        if isinstance(cat_ids, str):
            try:
                cat_ids = json.loads(cat_ids)
            except Exception:
                cat_ids = [cat_ids]
        
        if not cat_ids and m.get("category_id"):
            cat_ids = [m.get("category_id")]

        if not cat_ids and m.get("categories"):
            raw_c = m.get("categories")
            if isinstance(raw_c, list):
                for c_item in raw_c:
                    if isinstance(c_item, str) and c_item.lower() in cat_id_name_map:
                        cat_ids.append(cat_id_name_map[c_item.lower()])
                    elif isinstance(c_item, str):
                        cat_ids.append(c_item)

        if not cat_ids:
            cat_ids = ["default"]

        primary_cat = cat_ids[0] if cat_ids else "default"

        # Chapters
        chs = m.get("chapters_json") or m.get("chapters") or []
        chapters_str = json.dumps(chs) if isinstance(chs, list) else str(chs)

        created_at = float(m.get("created_at") or time.time())
        last_updated = float(m.get("last_updated") or time.time())

        try:
            cursor.execute("""
                INSERT INTO library 
                (id, source, title, cover_url, author, artist, status, summary, genres, path, favorite, category_id, category_ids, created_at, last_updated, chapter_count, chapters_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    cover_url = COALESCE(NULLIF(excluded.cover_url, ''), library.cover_url),
                    author = COALESCE(NULLIF(excluded.author, ''), library.author),
                    artist = COALESCE(NULLIF(excluded.artist, ''), library.artist),
                    status = COALESCE(NULLIF(excluded.status, ''), library.status),
                    summary = COALESCE(NULLIF(excluded.summary, ''), library.summary),
                    genres = COALESCE(NULLIF(excluded.genres, '[]'), library.genres),
                    category_id = excluded.category_id,
                    category_ids = excluded.category_ids,
                    chapter_count = MAX(excluded.chapter_count, library.chapter_count),
                    chapters_json = COALESCE(excluded.chapters_json, library.chapters_json)
            """, (
                m_id, source, title, cover_url, author, artist, status, summary, genres_str,
                path, primary_cat, json.dumps(cat_ids), created_at, last_updated,
                chapter_count, chapters_str
            ))
            restored_manga += 1

            cursor.execute("DELETE FROM manga_categories WHERE manga_id = ?", (m_id,))
            for cid in cat_ids:
                cursor.execute("INSERT OR IGNORE INTO manga_categories (manga_id, category_id) VALUES (?, ?)", (m_id, cid))

        except Exception as lib_err:
            logger.error(f"Error restoring manga {title} ({m_id}): {lib_err}")

        # Populate chapters progress if embedded
        if chs and isinstance(chs, list):
            for ch in chs:
                if not isinstance(ch, dict):
                    continue
                ch_id = ch.get("id") or ch.get("url")
                if not ch_id:
                    continue
                is_read = 1 if (ch.get("read") or ch.get("is_read")) else 0
                is_bm = 1 if (ch.get("bookmark") or ch.get("is_bookmarked")) else 0
                p_idx = int(ch.get("lastPageRead") or ch.get("page_index") or 0)
                
                cursor.execute("""
                    INSERT INTO reading_progress 
                    (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, last_read_at, manga_title, cover_url, source, chapter_title, chapter_number)
                    VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(manga_id, chapter_id) DO UPDATE SET
                        is_read = MAX(excluded.is_read, reading_progress.is_read),
                        is_bookmarked = MAX(excluded.is_bookmarked, reading_progress.is_bookmarked),
                        page_index = MAX(excluded.page_index, reading_progress.page_index)
                """, (
                    m_id, ch_id, p_idx, is_read, is_bm, time.time(),
                    title, cover_url, source, ch.get("name") or "", str(ch.get("chapterNumber") or "")
                ))
                restored_progress += 1

    conn.commit()

    # 3. RESTORE STANDALONE READING PROGRESS
    raw_progress = backup_data.get("reading_progress") or []
    for pr in raw_progress:
        if not isinstance(pr, dict):
            continue
        m_id = pr.get("manga_id")
        ch_id = pr.get("chapter_id")
        if not m_id or not ch_id:
            continue

        try:
            cursor.execute("""
                INSERT INTO reading_progress 
                (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, 
                 last_read_at, manga_title, cover_url, source, chapter_title, chapter_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(manga_id, chapter_id) DO UPDATE SET
                    page_index = excluded.page_index,
                    total_pages = MAX(excluded.total_pages, reading_progress.total_pages),
                    is_read = MAX(excluded.is_read, reading_progress.is_read),
                    is_bookmarked = MAX(excluded.is_bookmarked, reading_progress.is_bookmarked),
                    last_read_at = MAX(excluded.last_read_at, reading_progress.last_read_at)
            """, (
                m_id, ch_id, int(pr.get("page_index") or 0), int(pr.get("total_pages") or 0),
                1 if pr.get("is_read") else 0, 1 if pr.get("is_bookmarked") else 0,
                float(pr.get("last_read_at") or time.time()),
                pr.get("manga_title") or "", pr.get("cover_url") or "", pr.get("source") or "",
                pr.get("chapter_title") or "", str(pr.get("chapter_number") or "")
            ))
            restored_progress += 1
        except Exception as pr_err:
            logger.error(f"Error restoring progress record: {pr_err}")

    # 4. RESTORE SETTINGS (OPTIONAL)
    if restore_settings and "settings" in backup_data and isinstance(backup_data["settings"], dict):
        for k, v in backup_data["settings"].items():
            if k in ("download_dir", "local_paths"):
                existing_val = cursor.execute("SELECT value FROM settings WHERE key = ?", (k,)).fetchone()
                if existing_val and existing_val[0]:
                    continue
            v_str = json.dumps(v) if isinstance(v, (dict, list, bool, int, float)) else str(v)
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v_str))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "manga_count": restored_manga,
        "category_count": restored_categories,
        "progress_count": restored_progress,
        "message": f"Successfully restored {restored_manga} manga, {restored_categories} categories, and {restored_progress} progress records."
    }
