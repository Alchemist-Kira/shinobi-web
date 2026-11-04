import os
import re
import sqlite3
import json
import time

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mihon_web.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        sort_order INTEGER DEFAULT 0
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS library (
        id TEXT PRIMARY KEY,
        source TEXT,
        title TEXT,
        cover_url TEXT,
        author TEXT,
        artist TEXT,
        status TEXT,
        summary TEXT,
        genres TEXT,
        path TEXT,
        favorite INTEGER DEFAULT 1,
        category_id TEXT DEFAULT 'default',
        created_at REAL,
        last_updated REAL
    )
    """)

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN category_id TEXT DEFAULT 'default'")
    except Exception:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS manga_categories (
        manga_id TEXT,
        category_id TEXT,
        PRIMARY KEY (manga_id, category_id)
    )
    """)

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN category_ids TEXT DEFAULT '[\"default\"]'")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN chapter_count INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN chapters_json TEXT")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN new_chapters_count INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN last_checked REAL DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN update_strategy TEXT DEFAULT 'smart'")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN tracking_json TEXT DEFAULT '{}'")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN fetch_interval INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE library ADD COLUMN next_update REAL DEFAULT 0")
    except Exception:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS manga_custom_metadata (
        manga_id TEXT PRIMARY KEY,
        custom_title TEXT,
        custom_author TEXT,
        custom_artist TEXT,
        custom_status TEXT,
        custom_summary TEXT,
        custom_genres TEXT,
        custom_cover_url TEXT,
        updated_at REAL
    )
    """)

    for col, col_t in [
        ("custom_title", "TEXT"),
        ("custom_author", "TEXT"),
        ("custom_artist", "TEXT"),
        ("custom_status", "TEXT"),
        ("custom_summary", "TEXT"),
        ("custom_genres", "TEXT"),
        ("custom_cover_url", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE library ADD COLUMN {col} {col_t}")
        except Exception:
            pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS manga_cache (
        id TEXT PRIMARY KEY,
        source TEXT,
        title TEXT,
        cover_url TEXT,
        author TEXT,
        artist TEXT,
        status TEXT,
        summary TEXT,
        genres TEXT,
        details_json TEXT,
        chapters_json TEXT,
        chapter_count INTEGER DEFAULT 0,
        last_updated REAL,
        in_library INTEGER DEFAULT 0,
        has_read INTEGER DEFAULT 0
    )
    """)

    # Ensure downloads folder is never treated as a local manga source folder
    try:
        row = cursor.execute("SELECT value FROM settings WHERE key = 'local_paths'").fetchone()
        if row and row[0]:
            paths = json.loads(row[0])
            cleaned_paths = [p for p in paths if not p.lower().rstrip("\\/").endswith("downloads")]
            if len(cleaned_paths) != len(paths):
                cursor.execute("UPDATE settings SET value = ? WHERE key = 'local_paths'", (json.dumps(cleaned_paths),))
    except Exception:
        pass

    # Clean up duplicate auto-added local entries that point to downloads
    try:
        cursor.execute("""
        DELETE FROM library 
        WHERE source = 'local' AND (
            path LIKE '%downloads%' OR path LIKE '%/downloads/%' OR path LIKE '%\\downloads\\%'
        )
        """)
    except Exception:
        pass

    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        default_cats = [
            ("default", "Default", 0),
            ("reading", "Reading", 1),
            ("completed", "Completed", 2),
            ("plan_to_read", "Plan to Read", 3)
        ]
        cursor.executemany("INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)", default_cats)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reading_progress (
        manga_id TEXT,
        chapter_id TEXT,
        page_index INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        is_bookmarked INTEGER DEFAULT 0,
        last_read_at REAL,
        PRIMARY KEY (manga_id, chapter_id)
    )
    """)

    try:
        cursor.execute("ALTER TABLE reading_progress ADD COLUMN is_bookmarked INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reading_progress_manga_last_read ON reading_progress (manga_id, last_read_at)")
    except Exception:
        pass

    for col_name, col_type in [
        ("manga_title", "TEXT"),
        ("cover_url", "TEXT"),
        ("source", "TEXT"),
        ("chapter_title", "TEXT"),
        ("chapter_number", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE reading_progress ADD COLUMN {col_name} {col_type}")
        except Exception:
            pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS download_tasks (
        id TEXT PRIMARY KEY,
        manga_id TEXT,
        manga_title TEXT,
        chapter_id TEXT,
        chapter_number TEXT,
        chapter_title TEXT,
        source TEXT,
        status TEXT,
        progress REAL DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        downloaded_pages INTEGER DEFAULT 0,
        error_message TEXT,
        cover_url TEXT,
        cleared INTEGER DEFAULT 0,
        created_at REAL,
        completed_at REAL
    )
    """)

    try:
        cursor.execute("ALTER TABLE download_tasks ADD COLUMN cover_url TEXT")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE download_tasks ADD COLUMN cleared INTEGER DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE download_tasks ADD COLUMN priority REAL DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE download_tasks ADD COLUMN scanlator TEXT DEFAULT ''")
    except Exception:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracker_credentials (
        service_id TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        username TEXT,
        user_id TEXT,
        avatar_url TEXT,
        expires_at REAL DEFAULT 0,
        extra_data TEXT DEFAULT '{}',
        created_at REAL,
        updated_at REAL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS manga_chapter_settings (
        manga_id TEXT PRIMARY KEY,
        settings_json TEXT,
        updated_at REAL
    )
    """)

    # Default settings
    default_download_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads")
    default_settings = {
        "download_dir": default_download_dir,
        "local_paths": json.dumps([
            "D:\\CP\\Reverse Enginnering\\Call of the Spear"
        ]),
        "reader_mode": "webtoon", # webtoon, paged-ltr, paged-rtl
        "reader_width": "800",   # 650, 800, 1000, 1200, full
        "reader_bg": "black",     # black, dark, paper
        "preload_count": "5",
        "auto_clear_downloads": "true"
    }

    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()

def get_setting(key, default=None):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row:
        return row["value"]
    return default

def set_setting(key, value):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

def get_manga_chapter_settings(manga_id):
    if not manga_id:
        return {}
    conn = get_db()
    raw_id = str(manga_id).strip()
    row = conn.execute("SELECT settings_json FROM manga_chapter_settings WHERE manga_id = ?", (raw_id,)).fetchone()
    if not row:
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                alt_id = raw_id[len(pfx):]
                row = conn.execute("SELECT settings_json FROM manga_chapter_settings WHERE manga_id = ?", (alt_id,)).fetchone()
                if row:
                    break
    conn.close()
    if row and row["settings_json"]:
        try:
            return json.loads(row["settings_json"])
        except Exception:
            return {}
    return {}

def set_manga_chapter_settings(manga_id, settings_dict):
    if not manga_id or not isinstance(settings_dict, dict):
        return
    conn = get_db()
    now_ts = time.time()
    raw_id = str(manga_id).strip()
    conn.execute("""
        INSERT INTO manga_chapter_settings (manga_id, settings_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(manga_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    """, (raw_id, json.dumps(settings_dict), now_ts))
    conn.commit()
    conn.close()

def get_manga_excluded_scanlators(manga_id):
    settings = get_manga_chapter_settings(manga_id)
    excluded = settings.get("excludedScanlators") or []
    if not isinstance(excluded, list):
        return set()
    return {str(s).lower().strip() for s in excluded if str(s).strip()}

def get_download_dir():
    default_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads")
    val = get_setting("download_dir")
    if val and os.path.isabs(val):
        return os.path.normpath(val)
    return os.path.normpath(default_dir)

def get_progress(manga_id, chapter_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM reading_progress WHERE manga_id = ? AND chapter_id = ?", (manga_id, chapter_id)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_manga_progress_summary(manga_id):
    conn = get_db()
    rows = conn.execute("SELECT chapter_id, is_read, is_bookmarked, page_index, total_pages, last_read_at FROM reading_progress WHERE manga_id = ?", (manga_id,)).fetchall()
    conn.close()
    return {r["chapter_id"]: dict(r) for r in rows}

def save_progress(manga_id, chapter_id, page_index=None, total_pages=None, is_read=None, is_bookmarked=None,
                  manga_title="", cover_url="", source="", chapter_title="", chapter_number="", force_is_read=False):
    conn = get_db()
    existing = conn.execute("SELECT * FROM reading_progress WHERE manga_id = ? AND chapter_id = ?", (manga_id, chapter_id)).fetchone()
    
    bm = is_bookmarked if is_bookmarked is not None else (existing["is_bookmarked"] if existing and "is_bookmarked" in existing.keys() else 0)
    read_val = is_read if is_read is not None else (existing["is_read"] if existing and "is_read" in existing.keys() else 0)
    
    # If chapter was previously marked read, never downgrade to unread during normal reading/scrolling
    if existing and existing["is_read"] == 1 and not force_is_read:
        read_val = 1

    p_idx = page_index if page_index is not None else (existing["page_index"] if existing and "page_index" in existing.keys() else 0)
    t_pages = total_pages if total_pages is not None else (existing["total_pages"] if existing and "total_pages" in existing.keys() else 0)

    m_title = manga_title or (existing["manga_title"] if existing and "manga_title" in existing.keys() and existing["manga_title"] else "")
    c_url = cover_url or (existing["cover_url"] if existing and "cover_url" in existing.keys() and existing["cover_url"] else "")
    src = source or (existing["source"] if existing and "source" in existing.keys() and existing["source"] else "")
    ch_title = chapter_title or (existing["chapter_title"] if existing and "chapter_title" in existing.keys() and existing["chapter_title"] else "")
    ch_num = str(chapter_number or (existing["chapter_number"] if existing and "chapter_number" in existing.keys() and existing["chapter_number"] else ""))

    # If manga is in library or cache, fallback title and cover
    if not m_title or not c_url or not src:
        lib_item = conn.execute("SELECT title, cover_url, source FROM library WHERE id = ?", (manga_id,)).fetchone()
        if lib_item:
            if not m_title: m_title = lib_item["title"]
            if not c_url: c_url = lib_item["cover_url"]
            if not src: src = lib_item["source"]
        else:
            cache_item = conn.execute("SELECT title, cover_url, source FROM manga_cache WHERE id = ?", (manga_id,)).fetchone()
            if cache_item:
                if not m_title: m_title = cache_item["title"]
                if not c_url: c_url = cache_item["cover_url"]
                if not src: src = cache_item["source"]

    now = time.time()
    last_read = now
    if is_bookmarked is not None and page_index is None and is_read is None:
        last_read = existing["last_read_at"] if existing and "last_read_at" in existing.keys() else None

    conn.execute("""
    INSERT OR REPLACE INTO reading_progress 
    (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, last_read_at, manga_title, cover_url, source, chapter_title, chapter_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (manga_id, chapter_id, p_idx, t_pages, read_val, bm, last_read, m_title, c_url, src, ch_title, ch_num))

    try:
        conn.execute("UPDATE manga_cache SET has_read = 1 WHERE id = ?", (manga_id,))
    except Exception:
        pass

    conn.commit()
    conn.close()

def get_reading_history(limit=100):
    conn = get_db()
    # Group by manga_id so each manga appears once (with its most recently read chapter), matching native Mihon
    rows = conn.execute("""
    SELECT r.*, l.title as lib_title, l.cover_url as lib_cover_url, l.source as lib_source
    FROM reading_progress r
    INNER JOIN (
        SELECT manga_id, MAX(last_read_at) as max_read_at
        FROM reading_progress
        WHERE last_read_at IS NOT NULL AND last_read_at > 0
        GROUP BY manga_id
    ) latest ON r.manga_id = latest.manga_id AND r.last_read_at = latest.max_read_at
    LEFT JOIN library l ON r.manga_id = l.id
    ORDER BY r.last_read_at DESC
    LIMIT ?
    """, (limit,)).fetchall()
    conn.close()

    result = []
    seen = set()
    for r in rows:
        item = dict(r)
        m_id = item["manga_id"]
        if m_id in seen:
            continue
        seen.add(m_id)
        item["title"] = item.get("manga_title") or item.get("lib_title") or item["manga_id"]
        item["cover_url"] = item.get("cover_url") or item.get("lib_cover_url") or "/static/img/default-cover.png"
        item["source"] = item.get("source") or item.get("lib_source") or "local"
        result.append(item)
    return result

def delete_history_item(manga_id, chapter_id=None):
    conn = get_db()
    if chapter_id:
        conn.execute("UPDATE reading_progress SET last_read_at = NULL, page_index = 0, is_read = 0 WHERE manga_id = ? AND chapter_id = ?", (manga_id, chapter_id))
    else:
        conn.execute("UPDATE reading_progress SET last_read_at = NULL, page_index = 0, is_read = 0 WHERE manga_id = ?", (manga_id,))
    conn.commit()
    conn.close()

def clear_all_history():
    conn = get_db()
    conn.execute("UPDATE reading_progress SET last_read_at = NULL, page_index = 0, is_read = 0")
    conn.commit()
    conn.close()

def bulk_update_progress(manga_id, chapter_ids, action):
    if not chapter_ids:
        return
    conn = get_db()
    now = time.time()
    for ch_id in chapter_ids:
        existing = conn.execute("SELECT * FROM reading_progress WHERE manga_id = ? AND chapter_id = ?", (manga_id, ch_id)).fetchone()
        if existing:
            if action == "mark_read":
                conn.execute("UPDATE reading_progress SET is_read = 1, last_read_at = ? WHERE manga_id = ? AND chapter_id = ?", (now, manga_id, ch_id))
            elif action == "mark_unread":
                conn.execute("UPDATE reading_progress SET is_read = 0, last_read_at = ? WHERE manga_id = ? AND chapter_id = ?", (now, manga_id, ch_id))
            elif action == "bookmark":
                conn.execute("UPDATE reading_progress SET is_bookmarked = 1 WHERE manga_id = ? AND chapter_id = ?", (manga_id, ch_id))
            elif action == "unbookmark":
                conn.execute("UPDATE reading_progress SET is_bookmarked = 0 WHERE manga_id = ? AND chapter_id = ?", (manga_id, ch_id))
        else:
            is_read = 1 if action == "mark_read" else 0
            is_bm = 1 if action == "bookmark" else 0
            conn.execute("""
            INSERT INTO reading_progress (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, last_read_at)
            VALUES (?, ?, 0, 0, ?, ?, ?)
            """, (manga_id, ch_id, is_read, is_bm, now))
    try:
        conn.execute("UPDATE manga_cache SET has_read = 1 WHERE id = ?", (manga_id,))
    except Exception:
        pass
    conn.commit()
    conn.close()

def get_categories():
    conn = get_db()
    rows = conn.execute("SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, name ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_category(name):
    clean_name = (name or "").strip()
    if not clean_name:
        return None
    cat_id = re.sub(r'[^a-zA-Z0-9_-]', '_', clean_name.lower().strip()) or f"cat_{int(time.time()*1000)}"
    conn = get_db()
    try:
        max_order_row = conn.execute("SELECT MAX(sort_order) FROM categories").fetchone()
        max_order = (max_order_row[0] or 0) if max_order_row else 0
        conn.execute("INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)", (cat_id, clean_name, max_order + 1))
        conn.commit()
        conn.close()
        return {"id": cat_id, "name": clean_name, "sort_order": max_order + 1}
    except Exception:
        conn.close()
        return None

def delete_category(cat_id):
    if cat_id == "default":
        return False
    conn = get_db()
    conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.execute("UPDATE library SET category_id = 'default' WHERE category_id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return True

def update_manga_categories(manga_id, category_ids):
    if not isinstance(category_ids, list):
        category_ids = [str(category_ids)] if category_ids else ["default"]
    if not category_ids:
        category_ids = ["default"]

    conn = get_db()
    conn.execute("DELETE FROM manga_categories WHERE manga_id = ?", (manga_id,))
    for cid in category_ids:
        conn.execute("INSERT OR IGNORE INTO manga_categories (manga_id, category_id) VALUES (?, ?)", (manga_id, cid))

    primary_cat = category_ids[0]
    conn.execute("UPDATE library SET category_id = ?, category_ids = ?, last_updated = ? WHERE id = ?",
                 (primary_cat, json.dumps(category_ids), time.time(), manga_id))
    conn.commit()
    conn.close()
    return True

def update_manga_category(manga_id, category_id):
    return update_manga_categories(manga_id, [category_id])

def get_library_manga():
    conn = get_db()
    cats_rows = conn.execute("SELECT id, name FROM categories").fetchall()
    cat_names_map = {r["id"]: r["name"] for r in cats_rows}

    mc_rows = conn.execute("SELECT manga_id, category_id FROM manga_categories").fetchall()
    manga_cats_map = {}
    for r in mc_rows:
        manga_cats_map.setdefault(r["manga_id"], []).append(r["category_id"])

    custom_rows = conn.execute("SELECT * FROM manga_custom_metadata").fetchall()
    custom_map = {r["manga_id"]: dict(r) for r in custom_rows}

    # Query last read timestamp per manga
    lr_rows = conn.execute("""
        SELECT manga_id, MAX(last_read_at) as max_read_at
        FROM reading_progress
        WHERE last_read_at IS NOT NULL AND last_read_at > 0
        GROUP BY manga_id
    """).fetchall()
    last_read_map = {r["manga_id"]: float(r["max_read_at"] or 0.0) for r in lr_rows}

    rows = conn.execute("""
    SELECT l.*, COALESCE(c.name, 'Default') as category_name
    FROM library l
    LEFT JOIN categories c ON l.category_id = c.id
    ORDER BY l.last_updated DESC, l.title ASC
    """).fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        m_id = item["id"]
        item["last_read_at"] = last_read_map.get(m_id, 0.0)

        cat_ids = manga_cats_map.get(m_id)
        if not cat_ids and item.get("category_ids"):
            try:
                cat_ids = json.loads(item["category_ids"])
            except Exception:
                pass
        if not cat_ids:
            cat_ids = [item.get("category_id") or "default"]

        item["category_ids"] = cat_ids
        item["category_id"] = cat_ids[0] if cat_ids else "default"
        item["category_names"] = [cat_names_map.get(cid, cid.title()) for cid in cat_ids]
        item["category_name"] = ", ".join(item["category_names"]) if item["category_names"] else "Default"

        if item.get("genres"):
            try:
                item["genres"] = json.loads(item["genres"])
            except Exception:
                item["genres"] = [g.strip() for g in item["genres"].split(",") if g.strip()]

        c_meta = custom_map.get(m_id)
        if c_meta:
            has_override = False
            if c_meta.get("custom_title"):
                item["original_title"] = item.get("title")
                item["title"] = c_meta["custom_title"]
                has_override = True
            if c_meta.get("custom_cover_url"):
                item["original_cover_url"] = item.get("cover_url")
                item["cover_url"] = c_meta["custom_cover_url"]
                has_override = True
            if c_meta.get("custom_author"):
                item["original_author"] = item.get("author")
                item["author"] = c_meta["custom_author"]
                has_override = True
            if c_meta.get("custom_artist"):
                item["original_artist"] = item.get("artist")
                item["artist"] = c_meta["custom_artist"]
                has_override = True
            if c_meta.get("custom_status"):
                item["original_status"] = item.get("status")
                item["status"] = c_meta["custom_status"]
                has_override = True
            if c_meta.get("custom_summary"):
                item["original_summary"] = item.get("summary")
                item["summary"] = c_meta["custom_summary"]
                has_override = True
            if c_meta.get("custom_genres"):
                item["original_genres"] = item.get("genres")
                try:
                    item["genres"] = json.loads(c_meta["custom_genres"])
                except Exception:
                    item["genres"] = [g.strip() for g in c_meta["custom_genres"].split(",") if g.strip()]
                has_override = True
            item["has_custom_metadata"] = has_override
            item["custom_metadata"] = c_meta

        result.append(item)
    return result

def calculate_effective_chapter_count(chapters_list):
    """
    Mihon-accurate chapter count calculation:
    When a manga has multiple scanlators (e.g. 'official' and 'unofficial'),
    do NOT combine or sum them! Instead, count only the scanlator with the most chapters.
    Also handles deduplication and sub-chapters (e.g. 1.2, 5.1).
    """
    if not chapters_list or not isinstance(chapters_list, list):
        return 0

    scan_groups = {}
    has_scanlator = False
    for ch in chapters_list:
        scan = (ch.get("scanlator") or "").strip().lower()
        if scan:
            has_scanlator = True
            scan_groups.setdefault(scan, []).append(ch)

    # If multiple scanlators exist, take only the scanlator with the most chapters
    if has_scanlator and len(scan_groups) > 1:
        return max(len(grp) for grp in scan_groups.values())

    # Fallback deduplication by unique chapter numbers if scanlators are untagged
    import re
    seen_numbers = set()
    parsed_count = 0
    for ch in chapters_list:
        num = ch.get("chapter_number")
        if num is None or num <= 0:
            m = re.search(r'(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)', f"{ch.get('title', '')} {ch.get('id', '')}", re.IGNORECASE)
            if not m:
                m = re.search(r'([0-9]+(?:\.[0-9]+)?)', f"{ch.get('title', '')} {ch.get('id', '')}")
            if m:
                try:
                    num = float(m.group(1))
                except Exception:
                    num = None
        if num is not None:
            seen_numbers.add(float(num))
            parsed_count += 1

    if seen_numbers and len(seen_numbers) < len(chapters_list) and parsed_count > len(chapters_list) * 0.5:
        return len(seen_numbers)

    return len(chapters_list)

def save_manga_cache(manga_dict, chapters_list=None, in_library=None, has_read=None):
    if not manga_dict or not manga_dict.get("id"):
        return False
    manga_id = manga_dict["id"]
    conn = get_db()
    existing = conn.execute("SELECT * FROM manga_cache WHERE id = ?", (manga_id,)).fetchone()
    now = time.time()

    # Determine in_library
    in_lib = in_library if in_library is not None else (existing["in_library"] if existing else 0)
    if not in_lib:
        lib_exists = conn.execute("SELECT id FROM library WHERE id = ?", (manga_id,)).fetchone()
        in_lib = 1 if lib_exists else 0

    # Determine has_read
    read_flag = has_read if has_read is not None else (existing["has_read"] if existing else 0)
    if not read_flag:
        read_exists = conn.execute("SELECT chapter_id FROM reading_progress WHERE manga_id = ? LIMIT 1", (manga_id,)).fetchone()
        read_flag = 1 if read_exists else 0

    existing_chapters_json = existing["chapters_json"] if existing and existing["chapters_json"] else None
    if chapters_list is not None and isinstance(chapters_list, list) and len(chapters_list) > 0:
        chapters_json = json.dumps(chapters_list)
        ch_count = calculate_effective_chapter_count(chapters_list)
    elif existing_chapters_json:
        chapters_json = existing_chapters_json
        try:
            old_chs = json.loads(existing_chapters_json)
            ch_count = calculate_effective_chapter_count(old_chs)
        except Exception:
            ch_count = existing["chapter_count"] or 0
    else:
        chapters_json = None
        ch_count = int(manga_dict.get("chapter_count") or 0)

    title = manga_dict.get("title") or (existing["title"] if existing else "")
    cover_url = manga_dict.get("cover_url") or (existing["cover_url"] if existing else "")
    source = manga_dict.get("source") or (existing["source"] if existing else "local")
    author = manga_dict.get("author") or (existing["author"] if existing else "")
    artist = manga_dict.get("artist") or (existing["artist"] if existing else "")
    status = manga_dict.get("status") or (existing["status"] if existing else "Ongoing")
    summary = manga_dict.get("summary") or manga_dict.get("description") or (existing["summary"] if existing else "")

    genres = manga_dict.get("genres")
    if genres is not None:
        genres_str = json.dumps(genres) if isinstance(genres, list) else str(genres)
    elif existing and existing["genres"]:
        genres_str = existing["genres"]
    else:
        genres_str = "[]"

    details = dict(manga_dict)
    if "chapters" in details:
        del details["chapters"]
    details_json = json.dumps(details)

    conn.execute("""
    INSERT OR REPLACE INTO manga_cache
    (id, source, title, cover_url, author, artist, status, summary, genres, details_json, chapters_json, chapter_count, last_updated, in_library, has_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (manga_id, source, title, cover_url, author, artist, status, summary, genres_str, details_json, chapters_json, ch_count, now, in_lib, read_flag))

    if in_lib and chapters_json:
        try:
            conn.execute("UPDATE library SET chapters_json = ?, chapter_count = ? WHERE id = ?", (chapters_json, ch_count, manga_id))
        except Exception:
            pass

    conn.commit()
    conn.close()
    return True

def get_cached_manga(manga_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM manga_cache WHERE id = ?", (manga_id,)).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM library WHERE id = ?", (manga_id,)).fetchone()
    c_row = conn.execute("SELECT * FROM manga_custom_metadata WHERE manga_id = ?", (manga_id,)).fetchone()
    conn.close()
    if not row:
        return None, None

    r_dict = dict(row)
    manga = None
    if r_dict.get("details_json"):
        try:
            manga = json.loads(r_dict["details_json"])
        except Exception:
            manga = None

    if not manga:
        genres = []
        try:
            genres = json.loads(r_dict.get("genres", "[]"))
        except Exception:
            pass
        manga = {
            "id": r_dict.get("id"),
            "source": r_dict.get("source"),
            "source_name": r_dict.get("source"),
            "title": r_dict.get("title"),
            "cover_url": r_dict.get("cover_url"),
            "description": r_dict.get("summary") or "",
            "summary": r_dict.get("summary") or "",
            "author": r_dict.get("author") or "",
            "artist": r_dict.get("artist") or "",
            "status": r_dict.get("status") or "Ongoing",
            "genres": genres,
            "chapter_count": r_dict.get("chapter_count") or 0
        }

    if c_row:
        c_meta = dict(c_row)
        manga["has_custom_metadata"] = True
        manga["custom_metadata"] = c_meta
        manga["original_title"] = manga.get("title")
        manga["original_cover_url"] = manga.get("cover_url")
        manga["original_author"] = manga.get("author")
        manga["original_artist"] = manga.get("artist")
        manga["original_status"] = manga.get("status")
        manga["original_summary"] = manga.get("summary") or manga.get("description")
        manga["original_genres"] = manga.get("genres")

        if c_meta.get("custom_title"):
            manga["title"] = c_meta["custom_title"]
        if c_meta.get("custom_cover_url"):
            manga["cover_url"] = c_meta["custom_cover_url"]
        if c_meta.get("custom_author"):
            manga["author"] = c_meta["custom_author"]
        if c_meta.get("custom_artist"):
            manga["artist"] = c_meta["custom_artist"]
        if c_meta.get("custom_status"):
            manga["status"] = c_meta["custom_status"]
        if c_meta.get("custom_summary"):
            manga["summary"] = c_meta["custom_summary"]
            manga["description"] = c_meta["custom_summary"]
        if c_meta.get("custom_genres"):
            try:
                manga["genres"] = json.loads(c_meta["custom_genres"])
            except Exception:
                manga["genres"] = [g.strip() for g in c_meta["custom_genres"].split(",") if g.strip()]

    chapters = None
    if r_dict.get("chapters_json"):
        try:
            chapters = json.loads(r_dict["chapters_json"])
        except Exception:
            chapters = None

    return manga, chapters

def get_custom_metadata(manga_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM manga_custom_metadata WHERE manga_id = ?", (manga_id,)).fetchone()
    conn.close()
    if row:
        res = dict(row)
        if res.get("custom_genres"):
            try:
                res["custom_genres"] = json.loads(res["custom_genres"])
            except Exception:
                res["custom_genres"] = [g.strip() for g in res["custom_genres"].split(",") if g.strip()]
        return res
    return None

def set_custom_metadata(manga_id, meta_dict):
    conn = get_db()
    now = time.time()
    custom_title = meta_dict.get("title") or meta_dict.get("custom_title")
    custom_author = meta_dict.get("author") or meta_dict.get("custom_author")
    custom_artist = meta_dict.get("artist") or meta_dict.get("custom_artist")
    custom_status = meta_dict.get("status") or meta_dict.get("custom_status")
    custom_summary = meta_dict.get("summary") or meta_dict.get("custom_summary")
    custom_cover_url = meta_dict.get("cover_url") or meta_dict.get("custom_cover_url")
    
    genres = meta_dict.get("genres") if "genres" in meta_dict else meta_dict.get("custom_genres")
    if genres is not None:
        genres_str = json.dumps(genres) if isinstance(genres, list) else str(genres)
    else:
        genres_str = None

    conn.execute("""
    INSERT OR REPLACE INTO manga_custom_metadata
    (manga_id, custom_title, custom_author, custom_artist, custom_status, custom_summary, custom_genres, custom_cover_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (manga_id, custom_title, custom_author, custom_artist, custom_status, custom_summary, genres_str, custom_cover_url, now))
    
    lib_row = conn.execute("SELECT id FROM library WHERE id = ?", (manga_id,)).fetchone()
    if lib_row:
        conn.execute("""
        UPDATE library SET
            custom_title = ?,
            custom_author = ?,
            custom_artist = ?,
            custom_status = ?,
            custom_summary = ?,
            custom_genres = ?,
            custom_cover_url = ?
        WHERE id = ?
        """, (custom_title, custom_author, custom_artist, custom_status, custom_summary, genres_str, custom_cover_url, manga_id))

    conn.commit()
    conn.close()
    return True

def reset_custom_metadata(manga_id):
    conn = get_db()
    conn.execute("DELETE FROM manga_custom_metadata WHERE manga_id = ?", (manga_id,))
    try:
        conn.execute("""
        UPDATE library SET
            custom_title = NULL,
            custom_author = NULL,
            custom_artist = NULL,
            custom_status = NULL,
            custom_summary = NULL,
            custom_genres = NULL,
            custom_cover_url = NULL
        WHERE id = ?
        """, (manga_id,))
    except Exception:
        pass
    conn.commit()
    conn.close()
    return True

def get_cached_chapters(manga_id):
    conn = get_db()
    row = conn.execute("SELECT chapters_json FROM manga_cache WHERE id = ? AND chapters_json IS NOT NULL", (manga_id,)).fetchone()
    if not row or not row["chapters_json"]:
        row = conn.execute("SELECT chapters_json FROM library WHERE id = ? AND chapters_json IS NOT NULL", (manga_id,)).fetchone()
    conn.close()
    if row and row["chapters_json"]:
        try:
            chs = json.loads(row["chapters_json"])
            if isinstance(chs, list) and len(chs) > 0:
                return chs
        except Exception:
            pass
    return None

def add_to_library(manga_dict):
    conn = get_db()
    genres_str = json.dumps(manga_dict.get("genres", []))
    now = time.time()
    cat_id = manga_dict.get("category_id") or "default"
    ch_count = int(manga_dict.get("chapter_count") or 0)
    chs = manga_dict.get("chapters")
    chapters_str = json.dumps(chs) if (chs and isinstance(chs, list) and len(chs) > 0) else None

    existing = conn.execute("SELECT category_id, chapter_count, chapters_json FROM library WHERE id = ?", (manga_dict["id"],)).fetchone()
    if existing:
        if existing["category_id"] and "category_id" not in manga_dict:
            cat_id = existing["category_id"]
        if not ch_count and existing["chapter_count"]:
            ch_count = existing["chapter_count"]
        if not chapters_str and ("chapters_json" in existing.keys() and existing["chapters_json"]):
            chapters_str = existing["chapters_json"]

    # If chapters not provided, check manga_cache
    if not chapters_str:
        cache_row = conn.execute("SELECT chapters_json, chapter_count FROM manga_cache WHERE id = ?", (manga_dict["id"],)).fetchone()
        if cache_row and cache_row["chapters_json"]:
            chapters_str = cache_row["chapters_json"]
            if not ch_count:
                ch_count = cache_row["chapter_count"] or 0

    if chs and isinstance(chs, list) and len(chs) > 0:
        ch_count = calculate_effective_chapter_count(chs)
    elif chapters_str:
        try:
            parsed = json.loads(chapters_str)
            if isinstance(parsed, list) and len(parsed) > 0:
                ch_count = calculate_effective_chapter_count(parsed)
        except Exception:
            pass

    try:
        conn.execute("""
        INSERT OR REPLACE INTO library 
        (id, source, title, cover_url, author, artist, status, summary, genres, path, favorite, category_id, created_at, last_updated, chapter_count, chapters_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            manga_dict["id"],
            manga_dict.get("source", "local"),
            manga_dict.get("title", "Untitled"),
            manga_dict.get("cover_url", ""),
            manga_dict.get("author", ""),
            manga_dict.get("artist", ""),
            manga_dict.get("status", "Ongoing"),
            manga_dict.get("summary", ""),
            genres_str,
            manga_dict.get("path", ""),
            1,
            cat_id,
            manga_dict.get("created_at", now),
            now,
            ch_count,
            chapters_str
        ))
    except Exception:
        conn.execute("""
        INSERT OR REPLACE INTO library 
        (id, source, title, cover_url, author, artist, status, summary, genres, path, favorite, category_id, created_at, last_updated, chapter_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            manga_dict["id"],
            manga_dict.get("source", "local"),
            manga_dict.get("title", "Untitled"),
            manga_dict.get("cover_url", ""),
            manga_dict.get("author", ""),
            manga_dict.get("artist", ""),
            manga_dict.get("status", "Ongoing"),
            manga_dict.get("summary", ""),
            genres_str,
            manga_dict.get("path", ""),
            1,
            cat_id,
            manga_dict.get("created_at", now),
            now,
            ch_count
        ))
    conn.commit()
    conn.close()

    cat_ids = manga_dict.get("category_ids")
    if cat_ids and isinstance(cat_ids, list):
        update_manga_categories(manga_dict["id"], cat_ids)
    elif cat_id:
        update_manga_categories(manga_dict["id"], [cat_id])

    # Also persist in manga_cache
    save_manga_cache(manga_dict, chapters_list=chs if (chs and isinstance(chs, list)) else (json.loads(chapters_str) if chapters_str else None), in_library=1)

def remove_from_library(manga_id):
    conn = get_db()
    conn.execute("DELETE FROM library WHERE id = ?", (manga_id,))
    conn.execute("DELETE FROM manga_categories WHERE manga_id = ?", (manga_id,))
    conn.execute("UPDATE manga_cache SET in_library = 0 WHERE id = ?", (manga_id,))
    conn.commit()
    conn.close()

def get_migration_sources_summary():
    """
    Returns list of distinct sources that have manga in the library, along with the manga count.
    """
    conn = get_db()
    rows = conn.execute("""
    SELECT source, COUNT(*) as manga_count
    FROM library
    WHERE favorite = 1 OR favorite IS NULL
    GROUP BY source
    ORDER BY manga_count DESC, source ASC
    """).fetchall()
    conn.close()
    return [{"source": r["source"], "manga_count": r["manga_count"]} for r in rows]

def get_migration_manga(source_id):
    """
    Returns all library manga belonging to a given source, enriched with read counts and download info.
    """
    conn = get_db()
    rows = conn.execute("""
    SELECT l.*, COALESCE(c.name, 'Default') as category_name
    FROM library l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.source = ? AND (l.favorite = 1 OR l.favorite IS NULL)
    ORDER BY l.last_updated DESC, l.title ASC
    """, (source_id,)).fetchall()

    # Query completed download counts
    try:
        dl_rows = conn.execute("SELECT manga_id, COUNT(*) as cnt FROM download_tasks WHERE status = 'completed' GROUP BY manga_id").fetchall()
        dl_map = {r["manga_id"]: r["cnt"] for r in dl_rows}
    except Exception:
        dl_map = {}

    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        m_id = item["id"]

        progress_map = get_manga_progress_summary(m_id)
        item["progress_summary"] = progress_map
        read_count = sum(1 for p in progress_map.values() if p.get("is_read"))
        item["read_chapters_count"] = read_count
        item["downloaded_count"] = dl_map.get(m_id, 0)
        item["has_downloads"] = (item["downloaded_count"] > 0) or (item.get("source") == "local")

        # Category parsing
        cat_ids = []
        if item.get("category_ids"):
            try:
                cat_ids = json.loads(item["category_ids"])
            except Exception:
                pass
        if not cat_ids:
            cat_ids = [item.get("category_id") or "default"]
        item["category_ids"] = cat_ids

        result.append(item)
    return result

def migrate_manga_record(current_id, target_id, target_source, replace=True, flags=None):
    """
    Executes manga migration conforming to Mihon's MigrateMangaUseCase:
    - Transfers chapter read status, bookmarks, and page progress
    - Transfers categories
    - Optionally deletes downloaded chapters of current manga
    - Replaces or copies current manga with target manga in library
    """
    from server.scanner import extract_chapter_number
    from server.sources import get_source
    from server.downloader import downloader_instance

    flags = flags or {}
    migrate_chapters = flags.get("chapters", True)
    migrate_categories = flags.get("categories", True)
    delete_downloads = flags.get("delete_downloads", False)

    conn = get_db()
    curr_row = conn.execute("SELECT * FROM library WHERE id = ?", (current_id,)).fetchone()
    if not curr_row:
        curr_row = conn.execute("SELECT * FROM manga_cache WHERE id = ?", (current_id,)).fetchone()

    # Get target manga details and chapters
    target_manga, target_chapters = get_cached_manga(target_id)
    if not target_manga or not target_chapters:
        src = get_source(target_source)
        if src:
            if not target_manga:
                try:
                    target_manga = src.get_details(target_id)
                except Exception:
                    pass
            if not target_chapters:
                try:
                    target_chapters = src.get_chapters(target_id, limit=10000)
                except Exception:
                    pass

    if not target_manga:
        target_manga = {
            "id": target_id,
            "source": target_source,
            "title": curr_row["title"] if curr_row else target_id,
            "cover_url": curr_row["cover_url"] if curr_row else "",
            "chapter_count": len(target_chapters) if target_chapters else 0
        }

    target_chapters = target_chapters or []
    transferred_chapters_count = 0

    # 1. Chapters read & bookmark transfer (Mihon matching algorithm)
    if migrate_chapters:
        curr_progress_rows = conn.execute("SELECT * FROM reading_progress WHERE manga_id = ?", (current_id,)).fetchall()
        
        max_chapter_read = None
        curr_by_num = {}
        curr_by_title = {}
        read_nums = set()
        bookmarked_nums = set()
        bookmarked_titles = set()

        for pr in curr_progress_rows:
            p_dict = dict(pr)
            num_val = None
            if p_dict.get("chapter_number") is not None:
                try:
                    num_val = float(p_dict["chapter_number"])
                except Exception:
                    num_val = extract_chapter_number(str(p_dict["chapter_number"]))
            if num_val is None or num_val == 999999.0:
                num_val = extract_chapter_number(p_dict.get("chapter_title", "") or p_dict.get("chapter_id", ""))

            if num_val > 0 and num_val != 999999.0:
                curr_by_num[num_val] = p_dict
                if p_dict.get("is_read"):
                    read_nums.add(num_val)
                    if max_chapter_read is None or num_val > max_chapter_read:
                        max_chapter_read = num_val
                if p_dict.get("is_bookmarked"):
                    bookmarked_nums.add(num_val)

            c_title = (p_dict.get("chapter_title") or "").strip().lower()
            if c_title:
                curr_by_title[c_title] = p_dict
                if p_dict.get("is_bookmarked"):
                    bookmarked_titles.add(c_title)

        now = time.time()
        for tch in target_chapters:
            tch_id = tch.get("id")
            if not tch_id:
                continue

            t_num = None
            if tch.get("chapter_number") is not None:
                try:
                    t_num = float(tch["chapter_number"])
                except Exception:
                    t_num = extract_chapter_number(str(tch["chapter_number"]))
            if t_num is None or t_num == 999999.0:
                t_num = extract_chapter_number(tch.get("title", "") or tch_id)

            t_title = (tch.get("title") or "").strip().lower()
            prev_match = (curr_by_num.get(t_num) if (t_num > 0 and t_num != 999999.0) else None) or curr_by_title.get(t_title)

            is_read = 0
            is_bm = 0
            p_idx = 0
            t_pages = 0

            if prev_match:
                is_bm = prev_match.get("is_bookmarked", 0)
                if prev_match.get("is_read"):
                    is_read = 1
                    p_idx = prev_match.get("page_index", 0)
                    t_pages = prev_match.get("total_pages", 0)

            # In Mihon: if chapter number <= maxChapterRead, mark read!
            if max_chapter_read is not None and t_num > 0 and t_num != 999999.0 and t_num <= max_chapter_read:
                is_read = 1

            if t_num in read_nums:
                is_read = 1
            if t_num in bookmarked_nums or t_title in bookmarked_titles:
                is_bm = 1

            if is_read or is_bm or p_idx > 0:
                prev_last_read = prev_match.get("last_read_at") if prev_match else None
                conn.execute("""
                INSERT OR REPLACE INTO reading_progress 
                (manga_id, chapter_id, page_index, total_pages, is_read, is_bookmarked, last_read_at, manga_title, cover_url, source, chapter_title, chapter_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    target_id,
                    tch_id,
                    p_idx,
                    t_pages,
                    is_read,
                    is_bm,
                    prev_last_read,
                    target_manga.get("title", ""),
                    target_manga.get("cover_url", ""),
                    target_source,
                    tch.get("title", ""),
                    str(t_num if (t_num > 0 and t_num != 999999.0) else "")
                ))
                transferred_chapters_count += 1

    # 2. Categories transfer
    target_cat_ids = ["default"]
    if migrate_categories and curr_row:
        cat_rows = conn.execute("SELECT category_id FROM manga_categories WHERE manga_id = ?", (current_id,)).fetchall()
        if cat_rows:
            target_cat_ids = [r["category_id"] for r in cat_rows]
        elif curr_row["category_ids"]:
            try:
                target_cat_ids = json.loads(curr_row["category_ids"])
            except Exception:
                target_cat_ids = [curr_row["category_id"] or "default"]
        else:
            target_cat_ids = [curr_row["category_id"] or "default"]

    # 3. Custom Metadata & Info transfer (Mihon custom info flag)
    migrate_custom_info = flags.get("custom_info", True)
    if migrate_custom_info:
        try:
            c_meta = conn.execute("SELECT * FROM manga_custom_metadata WHERE manga_id = ?", (current_id,)).fetchone()
            if c_meta:
                c_dict = dict(c_meta)
                conn.execute("""
                INSERT OR REPLACE INTO manga_custom_metadata 
                (manga_id, custom_title, custom_author, custom_artist, custom_status, custom_summary, custom_genres, custom_cover_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    target_id,
                    c_dict.get("custom_title"),
                    c_dict.get("custom_author"),
                    c_dict.get("custom_artist"),
                    c_dict.get("custom_status"),
                    c_dict.get("custom_summary"),
                    c_dict.get("custom_genres"),
                    c_dict.get("custom_cover_url")
                ))
                if c_dict.get("custom_title"):
                    target_manga["title"] = c_dict["custom_title"]
                if c_dict.get("custom_cover_url"):
                    target_manga["cover_url"] = c_dict["custom_cover_url"]
                if replace:
                    conn.execute("DELETE FROM manga_custom_metadata WHERE manga_id = ?", (current_id,))
        except Exception as e:
            print("Error transferring custom metadata during migration:", e)

    # 4. Add target to library
    target_payload = dict(target_manga)
    target_payload["source"] = target_source
    target_payload["favorite"] = 1
    target_payload["category_ids"] = target_cat_ids
    target_payload["category_id"] = target_cat_ids[0] if target_cat_ids else "default"
    target_payload["chapter_count"] = len(target_chapters) if target_chapters else (target_manga.get("chapter_count") or 0)
    target_payload["chapters"] = target_chapters
    if curr_row and replace:
        target_payload["created_at"] = curr_row["created_at"] or time.time()

    add_to_library(target_payload)
    update_manga_categories(target_id, target_cat_ids)

    # 5. Handle Replace vs Copy
    deleted_downloads_count = 0
    if replace:
        if delete_downloads:
            try:
                deleted_downloads_count = downloader_instance.delete_manga_downloads(current_id)
            except Exception as e:
                print("Error deleting downloads during migration:", e)

        try:
            conn.execute("DELETE FROM reading_progress WHERE manga_id = ?", (current_id,))
        except Exception:
            pass

        remove_from_library(current_id)

    conn.close()

    return {
        "success": True,
        "current_id": current_id,
        "target_id": target_id,
        "target_source": target_source,
        "replace": replace,
        "transferred_chapters_count": transferred_chapters_count,
        "deleted_downloads_count": deleted_downloads_count,
        "category_ids": target_cat_ids
    }

def get_reading_statistics():
    import datetime
    conn = get_db()
    
    # 1. Chapters and pages read
    ch_read_row = conn.execute("SELECT COUNT(*) as count FROM reading_progress WHERE is_read = 1").fetchone()
    chapters_read = ch_read_row["count"] if ch_read_row else 0

    pages_read_row = conn.execute("SELECT COALESCE(SUM(total_pages), 0) as total FROM reading_progress WHERE is_read = 1").fetchone()
    pages_read = int(pages_read_row["total"]) if pages_read_row else 0
    if pages_read == 0 and chapters_read > 0:
        pages_read = chapters_read * 22

    # 2. Reading time calculation: ~3.5 min per chapter or ~12s per page
    total_seconds = int(chapters_read * 210)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours > 0:
        duration_formatted = f"{hours}h {minutes}m"
    else:
        duration_formatted = f"{minutes}m"

    # 3. Manga counts
    lib_count_row = conn.execute("SELECT COUNT(*) as count FROM library").fetchone()
    manga_in_library = lib_count_row["count"] if lib_count_row else 0

    read_manga_row = conn.execute("SELECT COUNT(DISTINCT manga_id) as count FROM reading_progress WHERE is_read = 1").fetchone()
    manga_read_count = read_manga_row["count"] if read_manga_row else 0

    # 4. Status distribution
    status_rows = conn.execute("""
        SELECT COALESCE(NULLIF(status, ''), 'Ongoing') as status_name, COUNT(*) as count
        FROM library
        GROUP BY status_name
        ORDER BY count DESC
    """).fetchall()
    status_distribution = []
    for r in status_rows:
        s_count = r["count"]
        pct = round((s_count / manga_in_library * 100), 1) if manga_in_library > 0 else 0
        status_distribution.append({
            "status": r["status_name"].title(),
            "count": s_count,
            "percentage": pct
        })

    # 5. Source distribution
    # 5. Source distribution
    sw_map = {}
    try:
        from server.suwayomi_client import suwayomi_client
        if suwayomi_client.is_healthy():
            for sw in (suwayomi_client.get_sources() or []):
                sid = str(sw.get("id"))
                sname = sw.get("displayName") or sw.get("name")
                if sid and sname:
                    sw_map[sid] = sname
    except Exception:
        pass

    known_source_names = {
        "6247824327199706550": "Asura Scans",
        "6084907896154116083": "MangaFire",
        "8448310129093543312": "MangaPill",
        "2499283573021220255": "MangaDex",
        "1353606378087565589": "Manga18.me",
        "6244055465910932489": "Manga18.me",
        "499082788596590240": "Comic Asura",
        "0": "Local Storage",
        "local": "Local Storage",
        "asurascans": "Asura Scans",
        "asura": "Asura Scans",
        "mangafire": "MangaFire",
        "mangadex": "MangaDex",
        "mangapill": "MangaPill",
        "manga18": "Manga18",
    }
    known_source_names.update(sw_map)

    def resolve_source_label(raw_src):
        if not raw_src:
            return "Local Storage"
        s_val = str(raw_src).strip()
        if s_val in known_source_names:
            return known_source_names[s_val]
        s_low = s_val.lower()
        if s_low in known_source_names:
            return known_source_names[s_low]
        if s_low.startswith("asura"): return "Asura Scans"
        if s_low.startswith("mangafire"): return "MangaFire"
        if s_low.startswith("mangadex"): return "MangaDex"
        if s_low.startswith("mangapill"): return "MangaPill"
        if s_low.startswith("manga18"): return "Manga18"
        if s_low == "local": return "Local Storage"
        if s_low.startswith("suwayomi_"): return "Suwayomi"
        if s_low.isdigit(): return f"Source {s_low}"
        return s_val.title()

    source_rows = conn.execute("""
        SELECT COALESCE(NULLIF(source, ''), 'local') as source_raw, COUNT(*) as count
        FROM library
        GROUP BY source_raw
    """).fetchall()

    counts_by_source = {}
    for r in source_rows:
        label = resolve_source_label(r["source_raw"])
        counts_by_source[label] = counts_by_source.get(label, 0) + r["count"]

    source_distribution = []
    for label, src_count in sorted(counts_by_source.items(), key=lambda x: x[1], reverse=True):
        pct = round((src_count / manga_in_library * 100), 1) if manga_in_library > 0 else 0
        source_distribution.append({
            "source": label,
            "count": src_count,
            "percentage": pct
        })

    # 6. Category distribution
    cat_rows = conn.execute("""
        SELECT COALESCE(c.name, 'Default') as cat_name, COUNT(l.id) as count
        FROM library l
        LEFT JOIN categories c ON l.category_id = c.id
        GROUP BY cat_name
        ORDER BY count DESC
    """).fetchall()
    category_distribution = []
    for r in cat_rows:
        c_count = r["count"]
        pct = round((c_count / manga_in_library * 100), 1) if manga_in_library > 0 else 0
        category_distribution.append({
            "category": r["cat_name"],
            "count": c_count,
            "percentage": pct
        })

    # 7. Most read manga
    most_read_rows = conn.execute("""
        SELECT rp.manga_id,
               COALESCE(cm.custom_title, l.title, rp.manga_title, rp.manga_id) as title,
               COALESCE(cm.custom_cover_url, l.cover_url, rp.cover_url, '') as cover_url,
               COALESCE(l.source, rp.source, 'unknown') as source,
               COUNT(rp.chapter_id) as chapters_read
        FROM reading_progress rp
        LEFT JOIN library l ON rp.manga_id = l.id
        LEFT JOIN manga_custom_metadata cm ON rp.manga_id = cm.manga_id
        WHERE rp.is_read = 1
        GROUP BY rp.manga_id
        ORDER BY chapters_read DESC
        LIMIT 6
    """).fetchall()
    most_read_manga = []
    for r in most_read_rows:
        most_read_manga.append({
            "manga_id": r["manga_id"],
            "title": r["title"],
            "cover_url": r["cover_url"],
            "source": r["source"],
            "chapters_read": r["chapters_read"]
        })

    # 8. Activity over last 7 days
    now = time.time()
    day_seconds = 86400
    reading_activity_7_days = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(6, -1, -1):
        target_ts = now - (i * day_seconds)
        dt = datetime.datetime.fromtimestamp(target_ts)
        start_ts = datetime.datetime(dt.year, dt.month, dt.day, 0, 0, 0).timestamp()
        end_ts = start_ts + day_seconds
        day_str = dt.strftime("%b %d")
        weekday = day_names[dt.weekday()]

        cnt_row = conn.execute("""
            SELECT COUNT(*) as count 
            FROM reading_progress 
            WHERE is_read = 1 AND last_read_at >= ? AND last_read_at < ?
        """, (start_ts, end_ts)).fetchone()
        ch_day = cnt_row["count"] if cnt_row else 0
        reading_activity_7_days.append({
            "day": weekday,
            "date": day_str,
            "chapters": ch_day
        })

    conn.close()

    return {
        "chapters_read": chapters_read,
        "pages_read": pages_read,
        "total_seconds": total_seconds,
        "total_read_duration_formatted": duration_formatted,
        "manga_in_library": manga_in_library,
        "manga_read_count": manga_read_count,
        "status_distribution": status_distribution,
        "source_distribution": source_distribution,
        "category_distribution": category_distribution,
        "most_read_manga": most_read_manga,
        "reading_activity_7_days": reading_activity_7_days
    }

def update_chapter_download_flag(manga_id, chapter_id, is_downloaded):
    """Updates is_downloaded flag for a chapter in library and manga_cache tables."""
    conn = get_db()
    try:
        raw_id = manga_id or ""
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                raw_id = raw_id[len(pfx):]
                break

        for table in ["library", "manga_cache"]:
            rows = conn.execute(f"SELECT id, chapters_json FROM {table} WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchall()
            for r in rows:
                if r["chapters_json"]:
                    try:
                        chs = json.loads(r["chapters_json"])
                        changed = False
                        for c in chs:
                            if c.get("id") == chapter_id:
                                c["is_downloaded"] = bool(is_downloaded)
                                changed = True
                        if changed:
                            conn.execute(f"UPDATE {table} SET chapters_json = ? WHERE id = ?", (json.dumps(chs), r["id"]))
                    except Exception as je:
                        pass
        conn.commit()
    except Exception as e:
        print("[DB] Error in update_chapter_download_flag:", e)
    finally:
        conn.close()

def get_manga_tracking(manga_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS manga_tracking (manga_id TEXT PRIMARY KEY, tracking_json TEXT DEFAULT '{}', updated_at INTEGER)")
    row = cursor.execute("SELECT tracking_json FROM manga_tracking WHERE manga_id = ?", (manga_id,)).fetchone()
    if not row:
        row = cursor.execute("SELECT tracking_json FROM library WHERE id = ?", (manga_id,)).fetchone()
    conn.close()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return {}
    return {}

def set_manga_tracking(manga_id, tracking_data):
    conn = get_db()
    cursor = conn.cursor()
    data_str = json.dumps(tracking_data or {})
    cursor.execute("CREATE TABLE IF NOT EXISTS manga_tracking (manga_id TEXT PRIMARY KEY, tracking_json TEXT DEFAULT '{}', updated_at INTEGER)")
    cursor.execute("INSERT OR REPLACE INTO manga_tracking (manga_id, tracking_json, updated_at) VALUES (?, ?, ?)", (manga_id, data_str, int(time.time())))
    try:
        cursor.execute("UPDATE library SET tracking_json = ? WHERE id = ?", (data_str, manga_id))
    except Exception:
        pass
    conn.commit()
    conn.close()
    return tracking_data

def get_manga_update_strategy(manga_id):
    conn = get_db()
    cursor = conn.cursor()
    row = cursor.execute("SELECT update_strategy, fetch_interval, next_update FROM library WHERE id = ?", (manga_id,)).fetchone()
    conn.close()
    if row:
        return {
            "strategy": row[0] or "smart",
            "fetch_interval": row[1] or 0,
            "next_update": row[2] or 0
        }
    return {"strategy": "smart", "fetch_interval": 0, "next_update": 0}

def set_manga_update_strategy(manga_id, strategy="smart", fetch_interval=0, next_update=0):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE library 
        SET update_strategy = ?, 
            fetch_interval = ?, 
            next_update = ? 
        WHERE id = ?
    """, (strategy or 'smart', fetch_interval or 0, next_update or 0, manga_id))
    conn.commit()
    conn.close()
    return {"strategy": strategy, "fetch_interval": fetch_interval, "next_update": next_update}

def get_tracker_credentials(service_id=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracker_credentials (
        service_id TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        username TEXT,
        user_id TEXT,
        avatar_url TEXT,
        expires_at REAL DEFAULT 0,
        extra_data TEXT DEFAULT '{}',
        created_at REAL,
        updated_at REAL
    )
    """)
    if service_id:
        row = cursor.execute("SELECT service_id, access_token, refresh_token, username, user_id, avatar_url, expires_at, extra_data FROM tracker_credentials WHERE service_id = ?", (service_id.lower(),)).fetchone()
        conn.close()
        if row:
            return {
                "service_id": row[0],
                "access_token": row[1],
                "refresh_token": row[2],
                "username": row[3],
                "user_id": row[4],
                "avatar_url": row[5],
                "expires_at": row[6],
                "extra_data": json.loads(row[7] or "{}") if row[7] else {}
            }
        return None
    else:
        rows = cursor.execute("SELECT service_id, access_token, refresh_token, username, user_id, avatar_url, expires_at, extra_data FROM tracker_credentials").fetchall()
        conn.close()
        results = {}
        for r in rows:
            results[r[0]] = {
                "service_id": r[0],
                "access_token": r[1],
                "refresh_token": r[2],
                "username": r[3],
                "user_id": r[4],
                "avatar_url": r[5],
                "expires_at": r[6],
                "extra_data": json.loads(r[7] or "{}") if r[7] else {}
            }
        return results

def set_tracker_credential(service_id, data):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracker_credentials (
        service_id TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        username TEXT,
        user_id TEXT,
        avatar_url TEXT,
        expires_at REAL DEFAULT 0,
        extra_data TEXT DEFAULT '{}',
        created_at REAL,
        updated_at REAL
    )
    """)
    now = time.time()
    sid = service_id.lower()
    extra_json = json.dumps(data.get("extra_data") or {})
    cursor.execute("""
    INSERT OR REPLACE INTO tracker_credentials (
        service_id, access_token, refresh_token, username, user_id, avatar_url, expires_at, extra_data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM tracker_credentials WHERE service_id = ?), ?), ?)
    """, (
        sid,
        data.get("access_token") or "",
        data.get("refresh_token") or "",
        data.get("username") or "",
        data.get("user_id") or "",
        data.get("avatar_url") or "",
        data.get("expires_at") or 0,
        extra_json,
        sid,
        now,
        now
    ))
    conn.commit()
    conn.close()
    return get_tracker_credentials(sid)

def remove_tracker_credential(service_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tracker_credentials WHERE service_id = ?", (service_id.lower(),))
    conn.commit()
    conn.close()
    return True




