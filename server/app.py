import os
import io
import mimetypes
import zipfile
import requests
import re
import json
import uuid
import time
from urllib.parse import quote, unquote
from flask import Flask, request, jsonify, send_file, send_from_directory, Response, redirect
from flask_cors import CORS
from server import db
from server.scanner import LocalScanner, extract_chapter_number, parse_comic_info_xml, natural_sort_key
from server.sources import get_source, get_all_sources
from server.downloader import downloader_instance, get_valid_chapter_cbz_names, build_valid_filename
from server.suwayomi_client import suwayomi_client
from server import backup
from server.library_updater import library_updater

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads")

def get_downloads_dir():
    return db.get_download_dir()

def get_downloads_dirs():
    primary = get_downloads_dir()
    default_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads"))
    if primary != default_dir and os.path.isdir(default_dir):
        return [primary, default_dir]
    return [primary]

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
CORS(app)

# Ultra-fast in-memory RAM cache (mimics JVM in-memory heap in Mihon)
_RAM_CHAPTERS_CACHE = {}  # manga_id -> (timestamp, chapters_list)
_RAM_MANGA_CACHE = {}     # manga_id -> (timestamp, manga_dict)
_RAM_CACHE_TTL = 300      # 5 minutes

@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Initialize database
db.init_db()

def find_cbz_file(folder_path, ch_num_or_str=None, chapter_title=None, scanlator=None, chapter_id=None, has_duplicate_scans=False):
    if not folder_path or not os.path.isdir(folder_path):
        return None
    try:
        cbz_files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.cbz', '.zip'))]
    except Exception:
        return None
    if not cbz_files:
        return None

    # 1. Exact match against Mihon valid filenames
    valid_names = get_valid_chapter_cbz_names(
        chapter_name=chapter_title,
        chapter_number=ch_num_or_str,
        scanlator=scanlator,
        chapter_id=chapter_id,
        has_duplicate_scans=has_duplicate_scans
    )
    for f in cbz_files:
        if f.lower() in valid_names:
            return os.path.join(folder_path, f)

    if has_duplicate_scans or scanlator:
        return None

    # Fallback for single-scan non-duplicate chapters
    clean = str(ch_num_or_str).strip().rstrip('.') if ch_num_or_str is not None else ""
    if clean:
        for f in cbz_files:
            if f.lower() in (f"chapter {clean}.cbz".lower(), f"{clean}.cbz".lower(), f"ch. {clean}.cbz".lower()):
                return os.path.join(folder_path, f)
        try:
            val = float(clean)
            val_int = int(val)
            if val == val_int:
                for f in cbz_files:
                    if f.lower() in (f"chapter {val_int}.cbz".lower(), f"{val_int}.cbz".lower()):
                        return os.path.join(folder_path, f)
            for f in cbz_files:
                if abs(extract_chapter_number(f) - val) < 0.001:
                    return os.path.join(folder_path, f)
        except Exception:
            pass

    return None

def find_chapter_cbz(chapter_id, manga_id=None, manga_title=None, chapter_number=None, scanlator=None, chapter_title=None, has_duplicate_scans=False):
    """Accurately finds a downloaded CBZ/ZIP archive on disk for a given chapter."""
    cbz_path = None
    clean_id = unquote(chapter_id)
    conn = db.get_db()
    task = conn.execute(
        "SELECT * FROM download_tasks WHERE chapter_id = ? OR chapter_id = ?",
        (chapter_id, clean_id)
    ).fetchone()
    
    manga_row = None
    if task:
        manga_row = conn.execute("SELECT * FROM library WHERE id = ?", (task["manga_id"],)).fetchone()
    conn.close()

    ch_num = chapter_number
    if ch_num is None and task and task["chapter_number"] is not None:
        ch_num = task["chapter_number"]
    if ch_num is None:
        ch_num = extract_chapter_number(chapter_id)

    task_scan = scanlator
    if not task_scan and task and "scanlator" in task.keys() and task["scanlator"]:
        task_scan = task["scanlator"]

    task_title_str = chapter_title
    if not task_title_str and task and "chapter_title" in task.keys() and task["chapter_title"]:
        task_title_str = task["chapter_title"]

    folder_candidates = []
    if task:
        if manga_row and manga_row["path"] and os.path.isdir(manga_row["path"]):
            folder_candidates.append(manga_row["path"])
        t_title = task["manga_title"] if ("manga_title" in task.keys() and task["manga_title"]) else None
        if t_title:
            sanitized_manga = downloader_instance._sanitize_filename(t_title) or "Downloaded Manga"
            for dl_dir in get_downloads_dirs():
                folder_candidates.append(os.path.join(dl_dir, sanitized_manga))
                folder_candidates.append(os.path.join(dl_dir, t_title))

    if manga_title:
        for dl_dir in get_downloads_dirs():
            folder_candidates.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(manga_title)))
            folder_candidates.append(os.path.join(dl_dir, manga_title))

    raw_m_id = manga_id or ""
    if manga_id:
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_m_id.startswith(pfx):
                raw_m_id = raw_m_id[len(pfx):]
                break
        for dl_dir in get_downloads_dirs():
            folder_candidates.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(raw_m_id)))
            folder_candidates.append(os.path.join(dl_dir, raw_m_id))

        if not manga_title:
            try:
                conn_t = db.get_db()
                row_t = conn_t.execute("SELECT title FROM library WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_m_id, f"%{raw_m_id}%")).fetchone()
                if not row_t:
                    row_t = conn_t.execute("SELECT title FROM manga_cache WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_m_id, f"%{raw_m_id}%")).fetchone()
                conn_t.close()
                if row_t and row_t["title"]:
                    manga_title = row_t["title"]
                    for dl_dir in get_downloads_dirs():
                        folder_candidates.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(manga_title)))
                        folder_candidates.append(os.path.join(dl_dir, manga_title))
            except Exception:
                pass

    # Test folder candidates first
    for f_cand in folder_candidates:
        if f_cand and os.path.isdir(f_cand):
            cbz_path = find_cbz_file(f_cand, ch_num_or_str=ch_num, chapter_title=task_title_str, scanlator=task_scan, chapter_id=chapter_id, has_duplicate_scans=has_duplicate_scans)
            if cbz_path and os.path.exists(cbz_path):
                return cbz_path

    # Scan downloads folders
    for dl_dir in get_downloads_dirs():
        if os.path.isdir(dl_dir):
            for sub in os.listdir(dl_dir):
                sub_dir = os.path.join(dl_dir, sub)
                if not os.path.isdir(sub_dir):
                    continue
                matched = False
                det_path = os.path.join(sub_dir, "details.json")
                if os.path.exists(det_path):
                    try:
                        with open(det_path, "r", encoding="utf-8") as f:
                            d_json = json.load(f)
                            if manga_id and d_json.get("id") in (manga_id, raw_m_id):
                                matched = True
                            elif manga_title and d_json.get("title", "").lower() == manga_title.lower():
                                matched = True
                    except Exception:
                        pass
                elif manga_title and (sub.lower() in manga_title.lower() or manga_title.lower() in sub.lower()):
                    matched = True
                elif chapter_id and (sub.lower() in chapter_id.lower()):
                    matched = True

                if matched:
                    cbz_path = find_cbz_file(sub_dir, ch_num_or_str=ch_num, chapter_title=task_title_str, scanlator=task_scan, chapter_id=chapter_id, has_duplicate_scans=has_duplicate_scans)
                    if cbz_path and os.path.exists(cbz_path):
                        return cbz_path

    # Scan library folders
    try:
        conn = db.get_db()
        all_lib = conn.execute("SELECT * FROM library WHERE path IS NOT NULL").fetchall()
        conn.close()
        for l_row in all_lib:
            if (manga_id and l_row["id"] == manga_id) or (l_row["id"] in chapter_id) or (l_row["path"] and os.path.basename(l_row["path"]).lower() in chapter_id.lower()):
                cbz_path = find_cbz_file(l_row["path"], ch_num_or_str=ch_num, chapter_title=task_title_str, scanlator=task_scan, chapter_id=chapter_id, has_duplicate_scans=has_duplicate_scans)
                if cbz_path and os.path.exists(cbz_path):
                    return cbz_path
    except Exception:
        pass

    return None

def _enrich_chapters_with_status(manga_id, chapters):
    if not chapters:
        return chapters
    try:
        progress_map = db.get_manga_progress_summary(manga_id)
        
        raw_id = manga_id
        for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
            if raw_id.startswith(pfx):
                raw_id = raw_id[len(pfx):]
                break

        conn = db.get_db()
        m_title = ""
        row_lib = conn.execute("SELECT title, path FROM library WHERE id = ? OR id LIKE ?", (manga_id, f"%{raw_id}%")).fetchone()
        if row_lib and row_lib["title"]:
            m_title = row_lib["title"]
        else:
            row_c = conn.execute("SELECT title FROM manga_cache WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchone()
            if row_c and row_c["title"]:
                m_title = row_c["title"]

        dl_rows = conn.execute(
            "SELECT id, chapter_id, chapter_number, manga_title, scanlator, chapter_title FROM download_tasks WHERE (manga_id = ? OR manga_id = ? OR manga_id LIKE ?) AND status = 'completed'", 
            (manga_id, raw_id, f"%{raw_id}%")
        ).fetchall()
        conn.close()

        # Count occurrences of each chapter number to detect multiple scans (e.g. official vs unofficial)
        from collections import Counter
        num_counts = Counter()
        title_counts = Counter()
        for ch in chapters:
            c_num = ch.get("chapter_number")
            try:
                c_num_float = float(c_num) if c_num is not None else 0.0
            except (ValueError, TypeError):
                c_num_float = extract_chapter_number(ch.get("title", ""))
            if c_num_float > 0 and c_num_float != 999999.0:
                num_counts[c_num_float] += 1
            t_clean = (ch.get("title") or "").strip().lower()
            if t_clean:
                title_counts[t_clean] += 1

        # Reconcile download_tasks: verify the physical file on disk actually exists!
        dl_ids = set()
        stale_task_ids = []
        for r in dl_rows:
            cid = r["chapter_id"]
            c_num = r["chapter_number"]
            task_title = r["manga_title"] or m_title
            t_scan = r["scanlator"] if "scanlator" in r.keys() else ""
            t_ch_title = r["chapter_title"] if "chapter_title" in r.keys() else ""
            c_num_fl = extract_chapter_number(str(c_num))
            has_dup = (c_num_fl > 0 and num_counts[c_num_fl] > 1)
            cbz_path = find_chapter_cbz(cid, manga_id=manga_id, manga_title=task_title, chapter_number=c_num, scanlator=t_scan, chapter_title=t_ch_title, has_duplicate_scans=has_dup)
            if cbz_path and os.path.exists(cbz_path):
                dl_ids.add(cid)
            else:
                stale_task_ids.append(r["id"])

        if stale_task_ids:
            try:
                conn_prune = db.get_db()
                conn_prune.executemany("DELETE FROM download_tasks WHERE id = ?", [(tid,) for tid in stale_task_ids])
                conn_prune.commit()
                conn_prune.close()
            except Exception as pe:
                print("Error pruning stale download tasks:", pe)

        # Check candidate folders on disk
        candidate_folders = []
        for dl_dir in get_downloads_dirs():
            if m_title:
                candidate_folders.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(m_title)))
                candidate_folders.append(os.path.join(dl_dir, m_title))
            if raw_id:
                candidate_folders.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(raw_id)))
                candidate_folders.append(os.path.join(dl_dir, raw_id))

        disk_files = set()
        for folder in candidate_folders:
            if folder and os.path.isdir(folder):
                for f in os.listdir(folder):
                    if f.lower().endswith(('.cbz', '.zip')):
                        disk_files.add(f.lower())

        for ch in chapters:
            cid = ch.get("id")
            p = progress_map.get(cid) or {}
            ch["is_read"] = bool(p.get("is_read"))
            ch["is_bookmarked"] = bool(p.get("is_bookmarked"))
            
            c_num = ch.get("chapter_number")
            try:
                c_num_float = float(c_num) if c_num is not None else 0.0
            except (ValueError, TypeError):
                c_num_float = extract_chapter_number(ch.get("title", ""))

            t_clean = (ch.get("title") or "").strip().lower()
            has_multiple_scans = (c_num_float > 0 and num_counts[c_num_float] > 1) or (t_clean and title_counts[t_clean] > 1)
            
            if cid in dl_ids:
                ch["is_downloaded"] = True
            elif disk_files:
                valid_cbz_names = get_valid_chapter_cbz_names(
                    chapter_name=ch.get("title"),
                    chapter_number=c_num_float,
                    scanlator=ch.get("scanlator"),
                    chapter_id=cid,
                    has_duplicate_scans=has_multiple_scans
                )
                ch["is_downloaded"] = any(name in disk_files for name in valid_cbz_names)
                if ch["is_downloaded"]:
                    dl_ids.add(cid)
            else:
                ch["is_downloaded"] = False
    except Exception as e:
        print("Error enriching chapters:", e)
    return chapters

def sync_downloads_to_library():
    try:
        conn = db.get_db()
        for dl_dir in get_downloads_dirs():
            if not os.path.isdir(dl_dir):
                continue

            for item in os.listdir(dl_dir):
                folder_path = os.path.join(dl_dir, item)
                if not os.path.isdir(folder_path):
                    continue

            cbz_files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.cbz', '.zip'))]
            if not cbz_files:
                continue

            cbz_files.sort(key=lambda f: (extract_chapter_number(f), natural_sort_key(f)))

            details = {}
            det_path = os.path.join(folder_path, "details.json")
            if os.path.exists(det_path):
                try:
                    with open(det_path, "r", encoding="utf-8") as f:
                        details = json.load(f)
                except Exception:
                    pass

            comic_info = {}
            first_cbz = os.path.join(folder_path, cbz_files[0])
            try:
                with zipfile.ZipFile(first_cbz, "r") as zf:
                    if "ComicInfo.xml" in zf.namelist():
                        xml = zf.read("ComicInfo.xml").decode("utf-8", errors="ignore")
                        comic_info = parse_comic_info_xml(xml)
            except Exception:
                pass

            source_name = (comic_info.get("source_name") or details.get("source_name") or details.get("source") or "local").strip()
            s_lower = source_name.lower().replace(" ", "").replace("-", "")
            if "mangadex" in s_lower:
                source_id = "mangadex"
            elif "asura" in s_lower:
                source_id = "asurascans"
            elif "mangafire" in s_lower:
                source_id = "mangafire"
            elif "mangapill" in s_lower:
                source_id = "mangapill"
            elif "manga18" in s_lower:
                source_id = "manga18fx"
            else:
                source_id = "local"

            title = details.get("title") or comic_info.get("series") or comic_info.get("title") or item
            existing = conn.execute("SELECT * FROM library WHERE path = ? OR title = ?", (folder_path, title)).fetchone()
            if existing:
                manga_id = existing["id"]
                source_id = existing["source"] or source_id
            else:
                slug = re.sub(r'[^a-zA-Z0-9]+', '-', title).strip('-').lower()
                manga_id = details.get("id") or f"{source_id}_{slug}"

            # Ensure cover exists
            has_cover = any(os.path.isfile(os.path.join(folder_path, c)) for c in ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"])
            if not has_cover:
                try:
                    with zipfile.ZipFile(first_cbz, "r") as zf:
                        imgs = [f for f in zf.namelist() if not f.endswith(".xml") and not f.startswith("__MACOSX") and any(f.lower().endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
                        imgs.sort(key=natural_sort_key)
                        if imgs:
                            with open(os.path.join(folder_path, "cover.jpg"), "wb") as cov_f:
                                cov_f.write(zf.read(imgs[0]))
                except Exception:
                    pass

            cover_url = f"/api/downloads/{quote(item)}/cover"
            desc = details.get("summary") or comic_info.get("summary") or ""
            author = details.get("author") or comic_info.get("author") or ""
            artist = details.get("artist") or comic_info.get("artist") or ""
            status = details.get("status") or comic_info.get("status") or "Completed"
            genres = json.dumps(details.get("genres") or comic_info.get("genres") or [])

            if not existing:
                conn.execute(
                    "INSERT INTO library (id, title, source, cover_url, summary, author, artist, status, genres, path, chapter_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (manga_id, title, source_id, cover_url, desc, author, artist, status, genres, folder_path, len(cbz_files))
                )
            else:
                conn.execute(
                    "UPDATE library SET path = ?, cover_url = ?, chapter_count = MAX(COALESCE(chapter_count, 0), ?) WHERE id = ?",
                    (folder_path, cover_url, len(cbz_files), manga_id)
                )

            existing_tasks = conn.execute("SELECT id, chapter_id, chapter_number FROM download_tasks WHERE manga_id = ?", (manga_id,)).fetchall()
            existing_nums = {str(r["chapter_number"]).strip().rstrip('.'): r["chapter_id"] for r in existing_tasks}

            for cbz_file in cbz_files:
                ch_num = extract_chapter_number(cbz_file)
                ch_num_str = str(int(ch_num)) if ch_num.is_integer() else str(ch_num)
                if ch_num == 999999.0:
                    ch_num_str = cbz_file.replace('.cbz', '').replace('.zip', '')
                if ch_num_str not in existing_nums:
                    ch_id = f"{manga_id}_chapter_{ch_num_str}"
                    task_id = str(uuid.uuid4())
                    ch_title = cbz_file.replace('.cbz', '').replace('.zip', '')
                    now = time.time()
                    try:
                        conn.execute(
                            "INSERT INTO download_tasks (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, created_at, completed_at, cover_url, cleared) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 100, 0, 0, ?, ?, ?, 1)",
                            (task_id, manga_id, title, ch_id, ch_num_str, ch_title, source_id, now, now, cover_url)
                        )
                    except Exception:
                        conn.execute(
                            "INSERT INTO download_tasks (id, manga_id, manga_title, chapter_id, chapter_number, chapter_title, source, status, progress, total_pages, downloaded_pages, created_at, completed_at, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 100, 0, 0, ?, ?, ?)",
                            (task_id, manga_id, title, ch_id, ch_num_str, ch_title, source_id, now, now, cover_url)
                        )
                    existing_nums[ch_num_str] = ch_id

        conn.commit()
        conn.close()
    except Exception as e:
        print("Error syncing downloads to library:", e)

@app.route("/")
def index():
    return send_file(os.path.join(STATIC_DIR, "index.html"))

@app.route("/api/downloads/<path:folder_name>/cover", methods=["GET"])
def api_download_cover(folder_name):
    for dl_dir in get_downloads_dirs():
        folder_path = os.path.join(dl_dir, folder_name)
        if os.path.isdir(folder_path):
            for cname in ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]:
                cpath = os.path.join(folder_path, cname)
                if os.path.isfile(cpath):
                    content_type = mimetypes.guess_type(cpath)[0] or "image/jpeg"
                    return send_file(cpath, mimetype=content_type)
            cbz_files = [f for f in os.listdir(folder_path) if f.lower().endswith((".cbz", ".zip"))]
            if cbz_files:
                cbz_files.sort(key=lambda x: (extract_chapter_number(x), natural_sort_key(x)))
                first_cbz = os.path.join(folder_path, cbz_files[0])
                try:
                    with zipfile.ZipFile(first_cbz, "r") as zf:
                        imgs = [f for f in zf.namelist() if not f.endswith(".xml") and not f.startswith("__MACOSX") and any(f.lower().endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
                        imgs.sort(key=natural_sort_key)
                        if imgs:
                            data = zf.read(imgs[0])
                            try:
                                with open(os.path.join(folder_path, "cover.jpg"), "wb") as cov_f:
                                    cov_f.write(data)
                            except Exception:
                                pass
                            content_type = mimetypes.guess_type(imgs[0])[0] or "image/jpeg"
                            return Response(data, mimetype=content_type, headers={"Cache-Control": "public, max-age=604800"})
                except Exception:
                    pass

    # Fallback: check if manga has an online cover in library or manga_cache by title or folder_name
    try:
        clean_name = unquote(folder_name).strip()
        conn = db.get_db()
        row = conn.execute("""
            SELECT cover_url FROM library 
            WHERE (title = ? OR id = ? OR id LIKE ?) 
              AND cover_url IS NOT NULL 
              AND cover_url != '' 
              AND cover_url NOT LIKE '/api/downloads/%'
            ORDER BY (CASE WHEN cover_url LIKE '/api/proxy/%' OR cover_url LIKE 'http%' THEN 0 ELSE 1 END)
            LIMIT 1
        """, (clean_name, clean_name, f"%{clean_name}%")).fetchone()
        
        if not row:
            row = conn.execute("""
                SELECT cover_url FROM manga_cache 
                WHERE (title = ? OR id = ? OR id LIKE ?) 
                  AND cover_url IS NOT NULL 
                  AND cover_url != '' 
                  AND cover_url NOT LIKE '/api/downloads/%'
                ORDER BY (CASE WHEN cover_url LIKE '/api/proxy/%' OR cover_url LIKE 'http%' THEN 0 ELSE 1 END)
                LIMIT 1
            """, (clean_name, clean_name, f"%{clean_name}%")).fetchone()
        conn.close()

        if row and row["cover_url"]:
            return redirect(row["cover_url"])
    except Exception:
        pass

    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

# ----------------- SUWAYOMI PROXY ROUTES -----------------

@app.route("/api/suwayomi/thumbnail/<path:manga_id>", methods=["GET"])
def api_suwayomi_thumbnail(manga_id):
    raw_id = str(manga_id).replace("suwayomi_", "")
    url = f"{suwayomi_client.base_url}/api/v1/manga/{raw_id}/thumbnail"
    try:
        r = requests.get(url, stream=True, timeout=12)
        if r.status_code == 200:
            return Response(r.iter_content(chunk_size=16384), content_type=r.headers.get("content-type", "image/jpeg"), headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        pass
    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

@app.route("/api/suwayomi/icon/<source_id>", methods=["GET"])
def api_suwayomi_icon(source_id):
    try:
        sources = suwayomi_client.get_sources()
        match = next((s for s in sources if str(s.get("id")) == str(source_id)), None)
        if match and match.get("iconUrl"):
            url = f"{suwayomi_client.base_url}{match['iconUrl']}"
            r = requests.get(url, stream=True, timeout=10)
            if r.status_code == 200:
                return Response(r.iter_content(chunk_size=16384), content_type=r.headers.get("content-type", "image/png"), headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        pass
    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

@app.route("/api/suwayomi/ext_icon/<path:pkg>", methods=["GET"])
def api_suwayomi_ext_icon(pkg):
    url = f"{suwayomi_client.base_url}/api/v1/extension/icon/{quote(pkg)}"
    try:
        r = requests.get(url, stream=True, timeout=10)
        if r.status_code == 200:
            return Response(r.iter_content(chunk_size=16384), content_type=r.headers.get("content-type", "image/png"), headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        pass
    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

@app.route("/api/suwayomi/manga/<manga_id>/chapter/<chapter_index>/page/<page_index>", methods=["GET"])
def api_suwayomi_page(manga_id, chapter_index, page_index):
    raw_id = str(manga_id).replace("suwayomi_", "")
    url = f"{suwayomi_client.base_url}/api/v1/manga/{raw_id}/chapter/{chapter_index}/page/{page_index}"
    try:
        r = requests.get(url, stream=True, timeout=30)
        if r.status_code == 200:
            return Response(r.iter_content(chunk_size=16384), content_type=r.headers.get("content-type", "image/jpeg"), headers={"Cache-Control": "public, max-age=604800"})
    except Exception as e:
        print(f"Error streaming Suwayomi page {manga_id}/{chapter_index}/{page_index}:", e)
    return jsonify({"error": "Page failed to load"}), 404

# ----------------- SOURCES API -----------------

@app.route("/api/sources", methods=["GET"])
def api_get_sources():
    return jsonify(get_all_sources())

@app.route("/api/sources/<source_id>/filters", methods=["GET"])
def api_source_filters(source_id):
    src = get_source(source_id)
    if not src:
        return jsonify({"error": "Source not found"}), 404
    if hasattr(src, "get_filters"):
        return jsonify(src.get_filters())
    return jsonify([])

def _extract_request_kwargs(req):
    kwargs = {}
    for k, v in req.args.lists():
        if k in ("page", "limit", "q"):
            continue
        clean_k = k[:-2] if k.endswith("[]") else k
        if len(v) == 1 and not k.endswith("[]"):
            val = v[0]
            kwargs[clean_k] = val
            kwargs[k] = val
        else:
            kwargs[clean_k] = v
            kwargs[k] = v
    filters_json = req.args.get("filters")
    if filters_json:
        try:
            import json as _json
            parsed = _json.loads(filters_json)
            if isinstance(parsed, dict):
                kwargs.update(parsed)
        except Exception:
            pass
    return kwargs

@app.route("/api/sources/<source_id>/popular", methods=["GET"])
def api_source_popular(source_id):
    src = get_source(source_id)
    if not src:
        return jsonify({"error": "Source not found"}), 404
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 24))
    kwargs = _extract_request_kwargs(request)
    res = src.get_popular(page=page, limit=limit, **kwargs)
    return jsonify(res)

@app.route("/api/sources/<source_id>/latest", methods=["GET"])
def api_source_latest(source_id):
    src = get_source(source_id)
    if not src:
        return jsonify({"error": "Source not found"}), 404
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 24))
    kwargs = _extract_request_kwargs(request)
    if hasattr(src, "get_latest"):
        res = src.get_latest(page=page, limit=limit, **kwargs)
    elif hasattr(src, "get_popular"):
        res = src.get_popular(page=page, limit=limit, order="latest", sort="latest", **kwargs)
    else:
        res = {"total": 0, "page": page, "limit": limit, "items": []}
    return jsonify(res)

@app.route("/api/sources/<source_id>/search", methods=["GET"])
def api_source_search(source_id):
    src = get_source(source_id)
    if not src:
        return jsonify({"error": "Source not found"}), 404
    query = request.args.get("q", "")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 24))
    kwargs = _extract_request_kwargs(request)
    res = src.search(query=query, page=page, limit=limit, **kwargs)
    return jsonify(res)

@app.route("/api/sources/<source_id>/manga/<path:manga_id>", methods=["GET"])
def api_manga_details(source_id, manga_id):
    force_refresh = request.args.get("refresh") in ("1", "true")

    # 0. Ultra-fast RAM Cache (0.1ms instant return)
    now = time.time()
    if not force_refresh and manga_id in _RAM_MANGA_CACHE:
        ts, m_data = _RAM_MANGA_CACHE[manga_id]
        if now - ts < _RAM_CACHE_TTL:
            return jsonify(m_data)

    # 1. Instant cache / library lookup if not explicitly refreshing
    if not force_refresh:
        cached_manga, cached_chs = db.get_cached_manga(manga_id)
        if cached_manga:
            # Check if cover_url is a dead download link
            cov = cached_manga.get("cover_url") or ""
            is_dead_cover = False
            if cov.startswith("/api/downloads/"):
                folder_name = unquote(cov.replace("/api/downloads/", "").replace("/cover", "")).strip()
                has_disk_cover = False
                for dl_dir in get_downloads_dirs():
                    fpath = os.path.join(dl_dir, folder_name)
                    if os.path.isdir(fpath) and (any(os.path.isfile(os.path.join(fpath, c)) for c in ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]) or any(f.lower().endswith(('.cbz', '.zip')) for f in os.listdir(fpath))):
                        has_disk_cover = True
                        break
                if not has_disk_cover:
                    is_dead_cover = True

            summ = cached_manga.get("summary") or ""
            is_corrupt_summary = any(x in summ for x in ["out of ", "Rating\n", "Author(s)\n", "Rank \n"])
            if not is_corrupt_summary and not is_dead_cover:
                conn = db.get_db()
                lib_row = conn.execute("SELECT id FROM library WHERE id = ?", (manga_id,)).fetchone()
                conn.close()
                cached_manga["in_library"] = bool(lib_row)
                if cached_chs and len(cached_chs) > 0:
                    cached_manga["chapters"] = _enrich_chapters_with_status(manga_id, cached_chs)
                _RAM_MANGA_CACHE[manga_id] = (time.time(), cached_manga)
                return jsonify(cached_manga)

    src = get_source(source_id)
    manga = None
    if src:
        try:
            manga = src.get_details(manga_id, refresh=force_refresh)
        except TypeError:
            manga = src.get_details(manga_id)
        except Exception:
            manga = None

    if manga:
        conn = db.get_db()
        lib_row = conn.execute("SELECT id FROM library WHERE id = ?", (manga_id,)).fetchone()
        conn.close()
        manga["in_library"] = bool(lib_row)
        # Persist fetched details to SQLite cache
        db.save_manga_cache(manga, in_library=1 if lib_row else None)
        c_meta = db.get_custom_metadata(manga_id)
        if c_meta:
            manga["has_custom_metadata"] = True
            manga["custom_metadata"] = c_meta
            manga["original_title"] = manga.get("title")
            manga["original_cover_url"] = manga.get("cover_url")
            manga["original_author"] = manga.get("author")
            manga["original_artist"] = manga.get("artist")
            manga["original_status"] = manga.get("status")
            manga["original_summary"] = manga.get("summary")
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
                manga["genres"] = c_meta["custom_genres"]
        _RAM_MANGA_CACHE[manga_id] = (time.time(), manga)
        return jsonify(manga)

    # Fallback to DB / library if source failed or manga not found online
    cached_manga, cached_chs = db.get_cached_manga(manga_id)
    if cached_manga:
        conn = db.get_db()
        lib_row = conn.execute("SELECT id FROM library WHERE id = ?", (manga_id,)).fetchone()
        conn.close()
        cached_manga["in_library"] = bool(lib_row)
        if cached_chs and len(cached_chs) > 0:
            cached_manga["chapters"] = _enrich_chapters_with_status(manga_id, cached_chs)
        _RAM_MANGA_CACHE[manga_id] = (time.time(), cached_manga)
        return jsonify(cached_manga)

    return jsonify({"error": "Manga not found"}), 404

@app.route("/api/sources/<source_id>/manga/<path:manga_id>/chapters", methods=["GET"])
def api_manga_chapters(source_id, manga_id):
    force_refresh = request.args.get("refresh") in ("1", "true")
    limit = int(request.args.get("limit", 10000))
    offset = int(request.args.get("offset", 0))

    # 0. Ultra-fast RAM Cache (0.1ms instant return)
    now = time.time()
    if not force_refresh and manga_id in _RAM_CHAPTERS_CACHE:
        ts, ch_data = _RAM_CHAPTERS_CACHE[manga_id]
        if now - ts < _RAM_CACHE_TTL:
            return jsonify(_enrich_chapters_with_status(manga_id, ch_data[offset: offset + limit]))

    # 1. Instant cached chapters lookup if not explicitly refreshing
    if not force_refresh:
        cached_chs = db.get_cached_chapters(manga_id)
        if cached_chs and len(cached_chs) > 0:
            _RAM_CHAPTERS_CACHE[manga_id] = (time.time(), cached_chs)
            return jsonify(_enrich_chapters_with_status(manga_id, cached_chs[offset: offset + limit]))

    chapters = []
    src = get_source(source_id)
    if src:
        try:
            chapters = src.get_chapters(manga_id, limit=limit, offset=offset, refresh=force_refresh) or []
        except TypeError:
            chapters = src.get_chapters(manga_id, limit=limit, offset=offset) or []
        except Exception:
            chapters = []

    if chapters and len(chapters) > 0:
        _RAM_CHAPTERS_CACHE[manga_id] = (time.time(), chapters)
        # Cache full chapter list in SQLite
        db.save_manga_cache({"id": manga_id, "source": source_id}, chapters_list=chapters)
        try:
            conn_ch = db.get_db()
            conn_ch.execute("UPDATE library SET chapter_count = ? WHERE id = ?", (db.calculate_effective_chapter_count(chapters), manga_id))
            conn_ch.commit()
            conn_ch.close()
        except Exception:
            pass
        return jsonify(_enrich_chapters_with_status(manga_id, chapters))

    # If online source returned no chapters (e.g. offline or error), fall back to cache / disk
    cached_chs = db.get_cached_chapters(manga_id)
    if cached_chs and len(cached_chs) > 0:
        _RAM_CHAPTERS_CACHE[manga_id] = (time.time(), cached_chs)
        return jsonify(_enrich_chapters_with_status(manga_id, cached_chs[offset: offset + limit]))

    # Downloaded files fallback
    conn = db.get_db()
    row = conn.execute("SELECT * FROM library WHERE id = ? OR id LIKE ?", (manga_id, f"%{manga_id}%")).fetchone()
    tasks = conn.execute("SELECT * FROM download_tasks WHERE manga_id = ? AND status = 'completed'", (manga_id,)).fetchall()
    conn.close()

    folder_path = None
    if row and row["path"] and os.path.isdir(row["path"]):
        folder_path = row["path"]
    elif row:
        for dl_dir in get_downloads_dirs():
            if os.path.isdir(dl_dir):
                for sub in os.listdir(dl_dir):
                    sub_dir = os.path.join(dl_dir, sub)
                    if os.path.isdir(sub_dir) and (sub.lower() in row["title"].lower() or row["title"].lower() in sub.lower()):
                        folder_path = sub_dir
                        break
            if folder_path:
                break

    if folder_path and os.path.isdir(folder_path):
        cbz_files = [f for f in os.listdir(folder_path) if f.lower().endswith(('.cbz', '.zip'))]
        cbz_files.sort(key=lambda f: (extract_chapter_number(f), natural_sort_key(f)), reverse=True)
        task_by_num = {str(t["chapter_number"]).strip().rstrip('.'): t for t in tasks}

        for idx, f in enumerate(cbz_files):
            ch_num = extract_chapter_number(f)
            ch_num_str = str(int(ch_num)) if ch_num.is_integer() else str(ch_num)
            if ch_num == 999999.0:
                ch_num_str = str(len(cbz_files) - idx)
            t = task_by_num.get(ch_num_str)
            ch_id = t["chapter_id"] if t else f"{manga_id}_chapter_{ch_num_str}"
            ch_title = t["chapter_title"] if (t and t["chapter_title"]) else f.replace('.cbz', '').replace('.zip', '')
            chapters.append({
                "id": ch_id,
                "manga_id": manga_id,
                "chapter_number": ch_num if ch_num != 999999.0 else float(ch_num_str),
                "title": ch_title,
                "url": "",
                "date_upload": "",
                "scanlator": "",
                "is_downloaded": True
            })

    if chapters and len(chapters) > 0:
        db.save_manga_cache({"id": manga_id, "source": source_id}, chapters_list=chapters)

    return jsonify(_enrich_chapters_with_status(manga_id, chapters))

@app.route("/api/manga/<path:manga_id>/cache", methods=["POST"])
def api_cache_manga(manga_id):
    payload = request.json or {}
    manga = payload.get("manga") or {}
    if not manga.get("id"):
        manga["id"] = manga_id
    chapters = payload.get("chapters")
    has_read = payload.get("has_read")
    in_library = payload.get("in_library")
    db.save_manga_cache(manga, chapters_list=chapters, in_library=in_library, has_read=has_read)
    return jsonify({"success": True})

@app.route("/api/sources/<source_id>/chapter/<path:chapter_id>/pages", methods=["GET"])
def api_chapter_pages(source_id, chapter_id):
    manga_id = request.args.get("manga_id")
    manga_title = request.args.get("manga_title")
    chapter_number = request.args.get("chapter_number")

    # Offline-first: Check if chapter has been downloaded locally
    try:
        cbz_path = find_chapter_cbz(chapter_id, manga_id=manga_id, manga_title=manga_title, chapter_number=chapter_number)
        if cbz_path and os.path.exists(cbz_path):
            with zipfile.ZipFile(cbz_path, "r") as zf:
                images = [f for f in zf.namelist() if not f.endswith(".xml") and not f.startswith("__MACOSX") and any(f.lower().endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
                images.sort(key=natural_sort_key)
                if images:
                    sub_folder = quote(os.path.basename(os.path.dirname(cbz_path)))
                    return jsonify([f"/api/downloads/chapter/{quote(chapter_id, safe='')}/page/{idx}?cbz={sub_folder}" for idx in range(len(images))])
    except Exception as e:
        print("Error checking local downloaded chapter pages:", e)

    src = get_source(source_id)
    if not src:
        return jsonify({"error": "Source not found"}), 404
    pages = src.get_chapter_pages(chapter_id)
    return jsonify(pages)

@app.route("/api/downloads/chapter/<path:chapter_id>/page/<int:page_idx>", methods=["GET"])
def api_downloaded_chapter_page(chapter_id, page_idx):
    try:
        cbz_folder_hint = request.args.get("cbz")
        cbz_path = None
        if cbz_folder_hint:
            for dl_dir in get_downloads_dirs():
                hint_dir = os.path.join(dl_dir, unquote(cbz_folder_hint))
                if os.path.isdir(hint_dir):
                    ch_num = extract_chapter_number(chapter_id)
                    cbz_path = find_cbz_file(hint_dir, ch_num)
                    if cbz_path:
                        break

        if not cbz_path or not os.path.exists(cbz_path):
            manga_id = request.args.get("manga_id")
            cbz_path = find_chapter_cbz(chapter_id, manga_id=manga_id)

        if not cbz_path or not os.path.exists(cbz_path):
            return jsonify({"error": "Downloaded file missing from disk"}), 404

        with zipfile.ZipFile(cbz_path, "r") as zf:
            images = [f for f in zf.namelist() if not f.endswith(".xml") and not f.startswith("__MACOSX") and any(f.lower().endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.avif'))]
            images.sort(key=natural_sort_key)
            if 0 <= page_idx < len(images):
                img_name = images[page_idx]
                data = zf.read(img_name)
                content_type = mimetypes.guess_type(img_name)[0] or "image/jpeg"
                return Response(data, mimetype=content_type, headers={"Cache-Control": "public, max-age=604800"})
    except Exception as e:
        print("Error streaming downloaded chapter page:", e)

    return jsonify({"error": "Page not found"}), 404

# ----------------- LOCAL CONTENT STREAMING -----------------

COVERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "covers")
os.makedirs(COVERS_DIR, exist_ok=True)

@app.route("/api/covers/<path:filename>", methods=["GET"])
def api_serve_cover(filename):
    cover_path = os.path.join(COVERS_DIR, filename)
    if os.path.isfile(cover_path):
        content_type = mimetypes.guess_type(cover_path)[0] or "image/jpeg"
        return send_file(cover_path, mimetype=content_type)
    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

@app.route("/api/manga/<path:manga_id>/metadata", methods=["GET"])
def api_get_manga_metadata(manga_id):
    custom = db.get_custom_metadata(manga_id)
    cached_manga, _ = db.get_cached_manga(manga_id)
    return jsonify({
        "manga_id": manga_id,
        "custom": custom,
        "manga": cached_manga,
        "has_custom": bool(custom)
    })

@app.route("/api/manga/<path:manga_id>/metadata", methods=["POST"])
def api_save_manga_metadata(manga_id):
    data = request.get_json() or {}
    db.set_custom_metadata(manga_id, data)
    cached_manga, _ = db.get_cached_manga(manga_id)
    return jsonify({
        "success": True,
        "manga": cached_manga
    })

@app.route("/api/manga/<path:manga_id>/metadata/reset", methods=["POST"])
def api_reset_manga_metadata(manga_id):
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', manga_id)
    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        custom_file = os.path.join(COVERS_DIR, f"custom_{safe_id}{ext}")
        if os.path.isfile(custom_file):
            try:
                os.remove(custom_file)
            except Exception:
                pass
    db.reset_custom_metadata(manga_id)
    cached_manga, _ = db.get_cached_manga(manga_id)
    return jsonify({
        "success": True,
        "manga": cached_manga
    })

@app.route("/api/manga/<path:manga_id>/cover/upload", methods=["POST"])
def api_upload_manga_cover(manga_id):
    if "cover" not in request.files:
        return jsonify({"error": "No cover file uploaded"}), 400
    file = request.files["cover"]
    if not file or not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', manga_id)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    target_filename = f"custom_{safe_id}{ext}"
    target_path = os.path.join(COVERS_DIR, target_filename)
    file.save(target_path)

    cover_url = f"/api/covers/{target_filename}?t={int(time.time())}"
    db.set_custom_metadata(manga_id, {"cover_url": cover_url})
    cached_manga, _ = db.get_cached_manga(manga_id)
    return jsonify({
        "success": True,
        "cover_url": cover_url,
        "manga": cached_manga
    })

@app.route("/api/manga/<path:manga_id>/tracking", methods=["GET"])
def api_get_manga_tracking(manga_id):
    tracking = db.get_manga_tracking(manga_id)
    return jsonify(tracking or {})

@app.route("/api/manga/<path:manga_id>/tracking", methods=["POST"])
def api_save_manga_tracking(manga_id):
    data = request.get_json() or {}
    saved = db.set_manga_tracking(manga_id, data)
    return jsonify({"success": True, "tracking": saved})

@app.route("/api/tracking/search", methods=["GET"])
def api_tracking_search():
    service = request.args.get("service", "anilist").lower()
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify([])

    results = []
    headers = {"User-Agent": "ShinobiReader/1.0", "Accept": "application/json"}

    if service in ("anilist", "al"):
        try:
            payload = {
                "query": """
                query ($search: String) {
                    Page(page: 1, perPage: 8) {
                        media(search: $search, type: MANGA) {
                            id
                            title { romaji english native }
                            coverImage { medium large }
                            chapters
                            averageScore
                            status
                            siteUrl
                            format
                        }
                    }
                }
                """,
                "variables": {"search": query}
            }
            resp = requests.post("https://graphql.anilist.co", json=payload, headers=headers, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data", {}).get("Page", {}).get("media", [])
                for item in items:
                    title_obj = item.get("title") or {}
                    title = title_obj.get("english") or title_obj.get("romaji") or title_obj.get("native") or query
                    cover = (item.get("coverImage") or {}).get("large") or (item.get("coverImage") or {}).get("medium")
                    score_val = item.get("averageScore")
                    results.append({
                        "id": str(item.get("id")),
                        "service": "AniList",
                        "title": title,
                        "cover": cover,
                        "total_chapters": item.get("chapters") or 0,
                        "score": round(score_val / 10, 1) if score_val is not None else 0,
                        "status": item.get("status") or "Ongoing",
                        "url": item.get("siteUrl") or f"https://anilist.co/manga/{item.get('id')}",
                        "format": item.get("format") or "MANGA"
                    })
        except Exception as e:
            print("AniList search error:", e)

    elif service in ("kitsu",):
        try:
            resp = requests.get(
                "https://kitsu.io/api/edge/manga",
                params={"filter[text]": query, "page[limit]": 8},
                headers={"User-Agent": "ShinobiReader/1.0", "Accept": "application/vnd.api+json"},
                timeout=8
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("data", []):
                    attr = item.get("attributes", {})
                    score_str = attr.get("averageRating")
                    score = round(float(score_str) / 10, 1) if score_str else 0
                    results.append({
                        "id": str(item.get("id")),
                        "service": "Kitsu",
                        "title": attr.get("canonicalTitle") or query,
                        "cover": (attr.get("posterImage") or {}).get("medium") or (attr.get("posterImage") or {}).get("small"),
                        "total_chapters": attr.get("chapterCount") or 0,
                        "score": score,
                        "status": attr.get("status") or "current",
                        "url": f"https://kitsu.io/manga/{item.get('id')}",
                        "format": attr.get("subtype") or "manga"
                    })
        except Exception as e:
            print("Kitsu search error:", e)

    elif service in ("myanimelist", "mal"):
        # 1. Try MyAnimeList official prefix search (fast, reliable, no rate limits/blocks)
        try:
            resp = requests.get(
                "https://myanimelist.net/search/prefix.json",
                params={"type": "manga", "keyword": query, "v": "1"},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json"
                },
                timeout=6
            )
            if resp.status_code == 200:
                data = resp.json()
                for cat in data.get("categories", []):
                    if cat.get("type") == "manga":
                        for item in cat.get("items", []):
                            payload = item.get("payload") or {}
                            score_val = 0.0
                            try:
                                score_val = float(payload.get("score") or 0.0)
                            except Exception:
                                pass
                            results.append({
                                "id": str(item.get("id")),
                                "service": "MyAnimeList",
                                "title": item.get("name") or query,
                                "cover": item.get("image_url") or item.get("thumbnail_url"),
                                "total_chapters": 0,
                                "score": score_val,
                                "status": payload.get("status") or "Publishing",
                                "url": item.get("url") or f"https://myanimelist.net/manga/{item.get('id')}",
                                "format": payload.get("media_type") or "Manga"
                            })
        except Exception as e:
            print("MAL prefix search error:", e)

        # 2. If no results or prefix failed, check if user has MAL OAuth token
        if not results:
            creds = db.get_tracker_credentials()
            mal_cred = creds.get("myanimelist") or {}
            token = mal_cred.get("access_token")
            if token:
                try:
                    resp = requests.get(
                        "https://api.myanimelist.net/v2/manga",
                        params={"q": query, "limit": 10, "fields": "id,title,main_picture,num_chapters,mean,status,media_type"},
                        headers={"Authorization": f"Bearer {token}", "User-Agent": "ShinobiReader/1.0"},
                        timeout=6
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for node_wrap in data.get("data", []):
                            node = node_wrap.get("node", {})
                            results.append({
                                "id": str(node.get("id")),
                                "service": "MyAnimeList",
                                "title": node.get("title") or query,
                                "cover": (node.get("main_picture") or {}).get("large") or (node.get("main_picture") or {}).get("medium"),
                                "total_chapters": node.get("num_chapters") or 0,
                                "score": node.get("mean") or 0.0,
                                "status": node.get("status") or "Publishing",
                                "url": f"https://myanimelist.net/manga/{node.get('id')}",
                                "format": (node.get("media_type") or "manga").upper()
                            })
                except Exception as e:
                    print("MAL official API search error:", e)

        # 3. Fallback to Jikan if still no results
        if not results:
            try:
                resp = requests.get(
                    "https://api.jikan.moe/v4/manga",
                    params={"q": query, "limit": 8},
                    headers=headers,
                    timeout=5
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("data", []):
                        results.append({
                            "id": str(item.get("mal_id")),
                            "service": "MyAnimeList",
                            "title": item.get("title") or query,
                            "cover": (item.get("images") or {}).get("jpg", {}).get("image_url"),
                            "total_chapters": item.get("chapters") or 0,
                            "score": item.get("score") or 0,
                            "status": item.get("status") or "Publishing",
                            "url": item.get("url") or f"https://myanimelist.net/manga/{item.get('mal_id')}",
                            "format": item.get("type") or "Manga"
                        })
            except Exception as e:
                print("MAL Jikan search fallback error:", e)

    elif service in ("mangaupdates", "mu"):
        try:
            resp = requests.post(
                "https://api.mangaupdates.com/v1/series/search",
                json={"search": query, "stype": "title", "perpage": 8},
                headers={"Content-Type": "application/json", "User-Agent": "ShinobiReader/1.0"},
                timeout=6
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("results", []):
                    rec = item.get("record") or {}
                    img_obj = rec.get("image") or {}
                    img_url = (img_obj.get("url") or {}).get("thumb") or (img_obj.get("url") or {}).get("original")
                    score_val = rec.get("bayesian_rating") or 0
                    results.append({
                        "id": str(rec.get("series_id")),
                        "service": "MangaUpdates",
                        "title": rec.get("title") or query,
                        "cover": img_url,
                        "total_chapters": 0,
                        "score": round(float(score_val), 1) if score_val else 0,
                        "status": "Ongoing",
                        "url": rec.get("url") or f"https://www.mangaupdates.com/series/{rec.get('series_id')}",
                        "format": rec.get("type") or "Manga"
                    })
        except Exception as e:
            print("MangaUpdates search error:", e)

    elif service in ("bangumi", "bgm"):
        try:
            resp = requests.get(
                f"https://api.bgm.tv/search/subject/{requests.utils.quote(query)}",
                params={"type": 1},
                headers={"User-Agent": "ShinobiReader/1.0"},
                timeout=6
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("list", [])[:8]:
                    img_dict = item.get("images") or {}
                    img_url = img_dict.get("medium") or img_dict.get("common") or img_dict.get("large")
                    results.append({
                        "id": str(item.get("id")),
                        "service": "Bangumi",
                        "title": item.get("name_cn") or item.get("name") or query,
                        "cover": img_url,
                        "total_chapters": 0,
                        "score": 0,
                        "status": "Ongoing",
                        "url": item.get("url") or f"https://bgm.tv/subject/{item.get('id')}",
                        "format": "MANGA"
                    })
        except Exception as e:
            print("Bangumi search error:", e)

    return jsonify(results)

# -------------------------------------------------------------
# Tracking OAuth & Remote Sync Routes
# -------------------------------------------------------------
TRACKER_SERVICES_CONFIG = [
    {"id": "anilist", "name": "AniList", "auth_type": "oauth_token", "oauth_url": "https://anilist.co/api/v2/oauth/authorize?client_id=386&response_type=token"},
    {"id": "myanimelist", "name": "MyAnimeList", "auth_type": "oauth_token", "oauth_url": "https://myanimelist.net"},
    {"id": "kitsu", "name": "Kitsu", "auth_type": "oauth_token", "oauth_url": "https://kitsu.io"},
    {"id": "mangaupdates", "name": "MangaUpdates", "auth_type": "credentials", "oauth_url": "https://www.mangaupdates.com"},
    {"id": "shikimori", "name": "Shikimori", "auth_type": "oauth_token", "oauth_url": "https://shikimori.me"},
    {"id": "bangumi", "name": "Bangumi", "auth_type": "oauth_token", "oauth_url": "https://bgm.tv/dev/app"}
]

@app.route("/api/tracking/accounts", methods=["GET"])
def api_get_tracking_accounts():
    creds = db.get_tracker_credentials()
    accounts = []
    for s in TRACKER_SERVICES_CONFIG:
        c = creds.get(s["id"])
        is_logged = bool(c and c.get("access_token"))
        accounts.append({
            "id": s["id"],
            "name": s["name"],
            "auth_type": s["auth_type"],
            "oauth_url": s["oauth_url"],
            "logged_in": is_logged,
            "username": c.get("username", "") if is_logged else "",
            "avatar_url": c.get("avatar_url", "") if is_logged else "",
            "user_id": c.get("user_id", "") if is_logged else ""
        })
    return jsonify(accounts)

@app.route("/api/tracking/oauth/start/<service>", methods=["GET"])
def api_tracking_oauth_start(service):
    sid = service.lower()
    host_url = request.host_url.rstrip("/")
    callback_url = f"{host_url}/api/tracking/oauth/callback"

    state_payload = json.dumps({
        "service": sid,
        "redirectUrl": callback_url,
        "clientName": "Shinobi"
    })
    encoded_state = quote(state_payload)
    auth_url = None

    # Check if Suwayomi server is running locally and provides dynamic authUrl
    try:
        tracker_id_map = {"myanimelist": 1, "mal": 1, "anilist": 2, "shikimori": 4, "bangumi": 5}
        target_id = tracker_id_map.get(sid)
        if target_id:
            s_res = requests.post("http://127.0.0.1:4567/api/graphql", json={
                "query": "{ trackers { nodes { id name authUrl } } }"
            }, timeout=2)
            if s_res.status_code == 200:
                nodes = s_res.json().get("data", {}).get("trackers", {}).get("nodes", [])
                for node in nodes:
                    if node.get("id") == target_id and node.get("authUrl"):
                        base_auth = node["authUrl"]
                        sep = "&" if "?" in base_auth else "?"
                        if target_id == 2 or sid in ("anilist", "al"):
                            # AniList client 16186 uses default redirect_uri=https://suwayomi.org/tracker-oauth
                            # Include state so suwayomi.org bounces the token back to localhost:8787
                            if "state=" not in base_auth:
                                base_auth += f"{sep}state={encoded_state}"
                            auth_url = base_auth
                        else:
                            if "redirect_uri=" not in base_auth:
                                base_auth += f"{sep}redirect_uri=https://suwayomi.org/tracker-oauth"
                                sep = "&"
                            if "state=" not in base_auth:
                                base_auth += f"{sep}state={encoded_state}"
                            auth_url = base_auth
                        break
    except Exception:
        pass

    # Direct fallback URLs
    if not auth_url:
        if sid in ("anilist", "al"):
            auth_url = f"https://anilist.co/api/v2/oauth/authorize?client_id=16186&response_type=token&state={encoded_state}"
        elif sid in ("shikimori", "shiki"):
            auth_url = f"https://shikimori.io/oauth/authorize?client_id=qTrMBF5HtM_33Pv2Vm2fFmEaBUI_c3LvohyJ0beQ9pA&redirect_uri=https://suwayomi.org/tracker-oauth&response_type=code&state={encoded_state}"
        elif sid in ("bangumi", "bgm"):
            auth_url = f"https://bgm.tv/oauth/authorize?client_id=bgm376667faf473119bb&response_type=code&redirect_uri=https://suwayomi.org/tracker-oauth&state={encoded_state}"

    if not auth_url:
        return jsonify({"success": False, "error": f"OAuth not supported for {service}"}), 400

    return jsonify({"success": True, "auth_url": auth_url})

@app.route("/api/tracking/oauth/callback", methods=["GET"])
def api_tracking_oauth_callback():
    token = request.args.get("access_token")
    state_raw = request.args.get("state")
    code = request.args.get("code")
    service = "anilist"

    if state_raw:
        try:
            state_data = json.loads(state_raw)
            if isinstance(state_data, dict):
                service = state_data.get("service") or service
        except Exception:
            pass

    # If neither token nor code are in query params, browser hash may contain #access_token=...
    if not token and not code:
        return """<!DOCTYPE html>
<html>
<head><title>Connecting to Tracker...</title></head>
<body style="background:#18181b;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;">
    <div style="display:inline-block;width:32px;height:32px;border:3px solid rgba(255,255,255,0.2);border-top-color:#02A9FF;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:12px;"></div>
    <div style="font-size:0.95rem;font-weight:600;">Processing authorization...</div>
    <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
  </div>
  <script>
    if (window.location.hash) {
      var hash = window.location.hash.substring(1);
      window.location.href = window.location.pathname + '?' + hash;
    } else {
      document.body.innerHTML = '<div style="color:#ef4444;text-align:center;">No authorization credentials received. Please try again.</div>';
    }
  </script>
</body>
</html>
"""

    success = False
    error_msg = ""
    user_name = "User"

    if token:
        if service in ("anilist", "al"):
            try:
                query = """
                query {
                    Viewer {
                        id
                        name
                        avatar { medium }
                    }
                }
                """
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "ShinobiReader/1.0"
                }
                res = requests.post("https://graphql.anilist.co", json={"query": query}, headers=headers, timeout=10)
                if res.status_code == 200:
                    v = res.json().get("data", {}).get("Viewer") or {}
                    user_name = v.get("name", "AniList User")
                    db.set_tracker_credential("anilist", {
                        "access_token": token,
                        "username": user_name,
                        "user_id": str(v.get("id", "")),
                        "avatar_url": (v.get("avatar") or {}).get("medium", "")
                    })
                    success = True
                else:
                    error_msg = res.json().get("errors", [{}])[0].get("message", "AniList authorization failed")
            except Exception as e:
                error_msg = str(e)
        else:
            db.set_tracker_credential(service.lower(), {
                "access_token": token,
                "username": f"{service.capitalize()} User",
                "user_id": "",
                "avatar_url": ""
            })
            success = True
            user_name = f"{service.capitalize()} User"

    elif code:
        tracker_id_map = {"myanimelist": 1, "mal": 1, "anilist": 2, "shikimori": 4, "bangumi": 5}
        t_id = tracker_id_map.get(service.lower(), 1)
        full_callback = request.url
        try:
            suwa_q = """
            mutation ($input: LoginTrackerOAuthInput!) {
                loginTrackerOAuth(input: $input) {
                    tracker {
                        id
                        name
                        isLoggedIn
                    }
                }
            }
            """
            s_res = requests.post("http://127.0.0.1:4567/api/graphql", json={
                "query": suwa_q,
                "variables": {"input": {"trackerId": t_id, "callbackUrl": full_callback}}
            }, timeout=8)
            if s_res.status_code == 200 and not s_res.json().get("errors"):
                success = True
                user_name = f"{service.capitalize()} User"
                db.set_tracker_credential(service.lower(), {
                    "access_token": f"suwayomi_{t_id}",
                    "username": user_name,
                    "user_id": "",
                    "avatar_url": ""
                })
            else:
                error_msg = "OAuth exchange failed"
        except Exception as e:
            error_msg = str(e)

    if success:
        return f"""<!DOCTYPE html>
<html>
<head><title>Authorization Successful</title></head>
<body style="background:#18181b;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:20px;">
    <div style="font-size:2.2rem;margin-bottom:8px;color:#22c55e;">&#10004;</div>
    <h2 style="margin:0 0 8px 0;font-size:1.25rem;">Connected to {service.capitalize()}!</h2>
    <p style="color:#a1a1aa;font-size:0.88rem;margin:0;">Logged in as <strong>{user_name}</strong>. Closing window...</p>
    <script>
      try {{
        if (window.opener) {{
          window.opener.postMessage({{
            type: 'TRACKER_OAUTH_SUCCESS',
            service: '{service.lower()}',
            username: '{user_name}'
          }}, '*');
        }}
      }} catch(e) {{}}
      setTimeout(function() {{ window.close(); }}, 1000);
    </script>
  </div>
</body>
</html>
"""
    else:
        return f"""<!DOCTYPE html>
<html>
<head><title>Authorization Failed</title></head>
<body style="background:#18181b;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:20px;">
    <div style="font-size:2.2rem;margin-bottom:8px;color:#ef4444;">&#10008;</div>
    <h2 style="margin:0 0 8px 0;font-size:1.25rem;">Authorization Failed</h2>
    <p style="color:#fca5a5;font-size:0.85rem;margin:0 0 16px 0;">{error_msg or "Could not authenticate with service."}</p>
    <button onclick="window.close()" style="padding:7px 16px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:6px;cursor:pointer;">Close</button>
  </div>
</body>
</html>
"""

@app.route("/api/tracking/accounts/<service>/login", methods=["POST"])
def api_tracking_account_login(service):
    sid = service.lower()
    data = request.get_json() or {}
    token = data.get("token", "").strip()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if sid in ("anilist", "al"):
        if not token:
            return jsonify({"success": False, "error": "Token is required"}), 400
        if "access_token=" in token:
            try:
                import re
                match = re.search(r"access_token=([^&]+)", token)
                if match:
                    token = match.group(1)
            except Exception:
                pass

        try:
            query = """
            query {
                Viewer {
                    id
                    name
                    avatar { medium }
                }
            }
            """
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.post("https://graphql.anilist.co", json={"query": query}, headers=headers, timeout=10)
            if res.status_code != 200:
                err_msg = res.json().get("errors", [{}])[0].get("message", "Authentication failed")
                return jsonify({"success": False, "error": f"AniList error: {err_msg}"}), 401
            v = res.json().get("data", {}).get("Viewer") or {}
            saved = db.set_tracker_credential("anilist", {
                "access_token": token,
                "username": v.get("name", "AniList User"),
                "user_id": str(v.get("id", "")),
                "avatar_url": (v.get("avatar") or {}).get("medium", "")
            })
            return jsonify({"success": True, "account": saved})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    elif sid in ("mangaupdates", "mu"):
        if not username or not password:
            return jsonify({"success": False, "error": "Username and password are required"}), 400
        try:
            resp = requests.put(
                "https://api.mangaupdates.com/v1/account/login",
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json", "User-Agent": "ShinobiReader/1.0"},
                timeout=10
            )
            if resp.status_code == 200:
                j = resp.json()
                ctx = j.get("context", {})
                session_token = ctx.get("session_token", "")
                uid = ctx.get("uid", "")
                saved = db.set_tracker_credential("mangaupdates", {
                    "access_token": session_token,
                    "username": username,
                    "user_id": str(uid),
                    "avatar_url": ""
                })
                return jsonify({"success": True, "account": saved})
            else:
                reason = resp.json().get("reason", "Login failed")
                return jsonify({"success": False, "error": reason}), 401
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    elif sid in ("bangumi", "bgm"):
        if not token:
            return jsonify({"success": False, "error": "Access token is required"}), 400
        try:
            resp = requests.get(
                "https://api.bgm.tv/v0/me",
                headers={"Authorization": f"Bearer {token}", "User-Agent": "ShinobiReader/1.0"},
                timeout=8
            )
            if resp.status_code == 200:
                me = resp.json()
                saved = db.set_tracker_credential("bangumi", {
                    "access_token": token,
                    "username": me.get("nickname") or me.get("username") or "Bangumi User",
                    "user_id": str(me.get("id", "")),
                    "avatar_url": (me.get("avatar") or {}).get("medium", "")
                })
                return jsonify({"success": True, "account": saved})
            else:
                return jsonify({"success": False, "error": "Invalid Bangumi token"}), 401
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    elif sid in ("myanimelist", "mal"):
        if not token:
            return jsonify({"success": False, "error": "Access token is required"}), 400
        try:
            resp = requests.get(
                "https://api.myanimelist.net/v2/users/@me",
                headers={"Authorization": f"Bearer {token}", "User-Agent": "ShinobiReader/1.0"},
                timeout=8
            )
            if resp.status_code == 200:
                me = resp.json()
                saved = db.set_tracker_credential("myanimelist", {
                    "access_token": token,
                    "username": me.get("name") or "MAL User",
                    "user_id": str(me.get("id", "")),
                    "avatar_url": me.get("picture", "")
                })
                return jsonify({"success": True, "account": saved})
            else:
                return jsonify({"success": False, "error": "Invalid MyAnimeList token"}), 401
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    elif sid in ("kitsu",):
        if not token:
            return jsonify({"success": False, "error": "Token is required"}), 400
        try:
            resp = requests.get(
                "https://kitsu.io/api/edge/users?filter[self]=true",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.api+json", "User-Agent": "ShinobiReader/1.0"},
                timeout=8
            )
            if resp.status_code == 200:
                data_list = resp.json().get("data", [])
                user_obj = data_list[0] if data_list else {}
                attrs = user_obj.get("attributes") or {}
                saved = db.set_tracker_credential("kitsu", {
                    "access_token": token,
                    "username": attrs.get("name") or "Kitsu User",
                    "user_id": str(user_obj.get("id", "")),
                    "avatar_url": (attrs.get("avatar") or {}).get("medium", "")
                })
                return jsonify({"success": True, "account": saved})
            else:
                return jsonify({"success": False, "error": "Invalid Kitsu token"}), 401
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    elif sid in ("shikimori", "shiki"):
        if not token:
            return jsonify({"success": False, "error": "Access token is required"}), 400
        try:
            resp = requests.get(
                "https://shikimori.one/api/users/whoami",
                headers={"Authorization": f"Bearer {token}", "User-Agent": "ShinobiReader/1.0"},
                timeout=8
            )
            if resp.status_code == 200:
                me = resp.json()
                saved = db.set_tracker_credential("shikimori", {
                    "access_token": token,
                    "username": me.get("nickname") or "Shikimori User",
                    "user_id": str(me.get("id", "")),
                    "avatar_url": (me.get("avatar") or "")
                })
                return jsonify({"success": True, "account": saved})
            else:
                return jsonify({"success": False, "error": "Invalid Shikimori token"}), 401
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    else:
        return jsonify({"success": False, "error": f"Unknown service: {service}"}), 400

@app.route("/api/tracking/accounts/<service>/logout", methods=["POST"])
def api_tracking_account_logout(service):
    db.remove_tracker_credential(service)
    return jsonify({"success": True, "service": service})

def sync_remote_tracker_entry(service_id, tracker_id, status="Reading", chapters_read=0, score=0):
    sid = service_id.lower()
    cred = db.get_tracker_credentials(sid)
    if not cred or not cred.get("access_token"):
        return {"success": False, "error": "Not logged in to service"}

    token = cred["access_token"]
    if sid in ("anilist", "al"):
        try:
            status_map = {
                "reading": "CURRENT",
                "completed": "COMPLETED",
                "on hold": "PAUSED",
                "dropped": "DROPPED",
                "plan to read": "PLANNING",
                "rereading": "REPEATING"
            }
            ani_status = status_map.get((status or "reading").lower(), "CURRENT")
            query = """
            mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
                SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
                    id
                    status
                    progress
                    score
                }
            }
            """
            variables = {
                "mediaId": int(tracker_id),
                "status": ani_status,
                "progress": int(chapters_read or 0)
            }
            if score and float(score) > 0:
                variables["score"] = float(score)

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.post("https://graphql.anilist.co", json={"query": query, "variables": variables}, headers=headers, timeout=8)
            if res.status_code == 200:
                return {"success": True, "service": "AniList", "data": res.json()}
            else:
                err = res.json().get("errors", [{}])[0].get("message", "AniList sync error")
                return {"success": False, "service": "AniList", "error": err}
        except Exception as e:
            return {"success": False, "service": "AniList", "error": str(e)}

    elif sid in ("bangumi", "bgm"):
        try:
            type_map = {
                "reading": 3,
                "completed": 2,
                "on hold": 4,
                "dropped": 5,
                "plan to read": 1
            }
            payload = {
                "type": type_map.get((status or "reading").lower(), 3),
                "ep_status": int(chapters_read or 0)
            }
            if score and float(score) > 0:
                payload["rate"] = int(round(float(score)))
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.post(f"https://api.bgm.tv/v0/users/-/collections/{tracker_id}", json=payload, headers=headers, timeout=8)
            return {"success": res.status_code in (200, 201, 202), "service": "Bangumi"}
        except Exception as e:
            return {"success": False, "service": "Bangumi", "error": str(e)}

    elif sid in ("mangaupdates", "mu"):
        try:
            status_list_map = {
                "reading": 0,
                "plan to read": 1,
                "completed": 2,
                "dropped": 3,
                "on hold": 4
            }
            list_id = status_list_map.get((status or "reading").lower(), 0)
            payload = [{
                "series": {"id": int(tracker_id)},
                "list_id": list_id,
                "status": {"chapter": int(chapters_read or 0)}
            }]
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.post("https://api.mangaupdates.com/v1/lists/series", json=payload, headers=headers, timeout=8)
            return {"success": res.status_code == 200, "service": "MangaUpdates"}
        except Exception as e:
            return {"success": False, "service": "MangaUpdates", "error": str(e)}

    elif sid in ("myanimelist", "mal"):
        try:
            status_map = {
                "reading": "reading",
                "completed": "completed",
                "on hold": "on_hold",
                "dropped": "dropped",
                "plan to read": "plan_to_read",
                "rereading": "reading"
            }
            mal_status = status_map.get((status or "reading").lower(), "reading")
            data = {
                "status": mal_status,
                "num_chapters_read": int(chapters_read or 0)
            }
            if score and float(score) > 0:
                data["score"] = int(round(float(score)))
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.put(f"https://api.myanimelist.net/v2/manga/{tracker_id}/my_list_status", data=data, headers=headers, timeout=8)
            return {"success": res.status_code in (200, 201), "service": "MyAnimeList"}
        except Exception as e:
            return {"success": False, "service": "MyAnimeList", "error": str(e)}

    elif sid in ("shikimori", "shiki"):
        try:
            status_map = {
                "reading": "watching",
                "completed": "completed",
                "on hold": "on_hold",
                "dropped": "dropped",
                "plan to read": "planned",
                "rereading": "rewatching"
            }
            shiki_status = status_map.get((status or "reading").lower(), "watching")
            payload = {
                "user_rate": {
                    "target_id": int(tracker_id),
                    "target_type": "Manga",
                    "status": shiki_status,
                    "chapters": int(chapters_read or 0)
                }
            }
            if score and float(score) > 0:
                payload["user_rate"]["score"] = int(round(float(score)))
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "ShinobiReader/1.0"
            }
            res = requests.post("https://shikimori.one/api/v2/user_rates", json=payload, headers=headers, timeout=8)
            return {"success": res.status_code in (200, 201), "service": "Shikimori"}
        except Exception as e:
            return {"success": False, "service": "Shikimori", "error": str(e)}

    return {"success": False, "error": f"Remote sync not implemented for {service_id}"}

@app.route("/api/tracking/sync/<path:manga_id>", methods=["POST"])
def api_sync_tracking(manga_id):
    data = request.get_json() or {}
    service = data.get("service")
    tracker_id = data.get("tracker_id")
    status = data.get("status", "Reading")
    chapters_read = data.get("chapters_read", 0)
    score = data.get("score", 0)

    if not service or not tracker_id:
        return jsonify({"success": False, "error": "Missing service or tracker_id"}), 400

    result = sync_remote_tracker_entry(service, tracker_id, status=status, chapters_read=chapters_read, score=score)
    return jsonify(result)


@app.route("/api/manga/<path:manga_id>/update-strategy", methods=["GET"])
def api_get_manga_update_strategy(manga_id):
    info = db.get_manga_update_strategy(manga_id)
    return jsonify(info if isinstance(info, dict) else {"strategy": info, "fetch_interval": 0, "next_update": 0})

@app.route("/api/manga/<path:manga_id>/update-strategy", methods=["POST"])
def api_save_manga_update_strategy(manga_id):
    data = request.get_json() or {}
    strategy = data.get("strategy", "smart")
    fetch_interval = data.get("fetch_interval", 0)
    next_update = data.get("next_update", 0)
    saved = db.set_manga_update_strategy(manga_id, strategy, fetch_interval, next_update)
    return jsonify({"success": True, "data": saved})

@app.route("/api/statistics", methods=["GET"])
def api_get_statistics():
    stats = db.get_reading_statistics()
    return jsonify(stats)

@app.route("/api/local/manga/<manga_id>/cover", methods=["GET"])
def api_local_cover(manga_id):
    src = get_source("local")
    manga = src.get_details(manga_id)
    if not manga:
        return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")
    
    manga_path = manga.get("path")
    # 1. Check if an explicit cover image file exists in the manga folder
    if manga_path and os.path.isdir(manga_path):
        cover_names = [
            "cover.jpg", "cover.jpeg", "cover.png", "cover.webp",
            "folder.jpg", "folder.jpeg", "folder.png", "folder.webp",
            "poster.jpg", "poster.jpeg", "poster.png", "poster.webp",
            "thumb.jpg", "thumb.jpeg", "thumb.png", "thumb.webp"
        ]
        for cname in cover_names:
            cpath = os.path.join(manga_path, cname)
            if os.path.isfile(cpath):
                content_type = mimetypes.guess_type(cpath)[0] or "image/jpeg"
                return send_file(cpath, mimetype=content_type)
        
        # Check any file in folder starting with cover., folder., poster., or thumb.
        try:
            for fname in os.listdir(manga_path):
                lower_fname = fname.lower()
                if lower_fname.startswith(("cover.", "folder.", "poster.", "thumb.")) and lower_fname.endswith((".jpg", ".jpeg", ".png", ".webp")):
                    cpath = os.path.join(manga_path, fname)
                    if os.path.isfile(cpath):
                        content_type = mimetypes.guess_type(cpath)[0] or "image/jpeg"
                        return send_file(cpath, mimetype=content_type)
        except Exception:
            pass

    # 2. Check cached cover in COVERS_DIR
    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        cached_file = os.path.join(COVERS_DIR, f"{manga_id}{ext}")
        if os.path.isfile(cached_file):
            content_type = mimetypes.guess_type(cached_file)[0] or "image/jpeg"
            return send_file(cached_file, mimetype=content_type)

    # 3. Attempt to fetch official cover from MangaDex online
    title = manga.get("title") or manga.get("folder_name")
    if title:
        try:
            import re
            from server.sources.mangadex_source import MangaDexSource
            md = MangaDexSource()
            res = md.search(title, limit=5)
            target_cover_url = None
            if res.get("items"):
                norm_title = re.sub(r'[^a-zA-Z0-9]', '', title).lower()
                for item in res["items"]:
                    item_norm = re.sub(r'[^a-zA-Z0-9]', '', item.get("title", "")).lower()
                    if norm_title in item_norm or item_norm in norm_title:
                        if item.get("cover_url") and not item["cover_url"].endswith("default-cover.png"):
                            target_cover_url = item["cover_url"]
                            break
                if not target_cover_url and res["items"][0].get("cover_url"):
                    if not res["items"][0]["cover_url"].endswith("default-cover.png"):
                        target_cover_url = res["items"][0]["cover_url"]

            if target_cover_url:
                cr = requests.get(target_cover_url, headers={"User-Agent": "MihonWeb/1.0"}, timeout=8)
                if cr.status_code == 200 and len(cr.content) > 1024:
                    saved = False
                    if manga_path and os.path.isdir(manga_path):
                        try:
                            cpath = os.path.join(manga_path, "cover.jpg")
                            with open(cpath, "wb") as f:
                                f.write(cr.content)
                            saved = True
                        except Exception:
                            pass
                    if not saved:
                        cached_file = os.path.join(COVERS_DIR, f"{manga_id}.jpg")
                        with open(cached_file, "wb") as f:
                            f.write(cr.content)

                    content_type = mimetypes.guess_type(target_cover_url)[0] or "image/jpeg"
                    return Response(cr.content, mimetype=content_type)
        except Exception as e:
            print("Auto cover lookup error:", e)

    # 4. Fallback: first page of first chapter only if no other cover found
    if manga.get("chapters"):
        first_chapter = manga["chapters"][0]
        pages = LocalScanner.get_chapter_pages(first_chapter["path"], first_chapter.get("type", "archive"))
        if pages:
            img_bytes = LocalScanner.read_page_bytes(first_chapter["path"], pages[0], first_chapter.get("type", "archive"))
            if img_bytes:
                content_type = mimetypes.guess_type(pages[0])[0] or "image/jpeg"
                return Response(img_bytes, mimetype=content_type)

    return send_file(os.path.join(STATIC_DIR, "img", "default-cover.png"), mimetype="image/png")

@app.route("/api/local/manga/<manga_id>/cover", methods=["POST"])
def api_local_upload_cover(manga_id):
    src = get_source("local")
    manga = src.get_details(manga_id)
    if not manga:
        return jsonify({"error": "Manga not found"}), 404

    manga_path = manga.get("path")
    file = request.files.get("file")
    url = request.form.get("url") or (request.json.get("url") if request.is_json else None)

    img_bytes = None
    if file:
        img_bytes = file.read()
    elif url:
        try:
            r = requests.get(url, headers={"User-Agent": "MihonWeb/1.0"}, timeout=10)
            if r.status_code == 200:
                img_bytes = r.content
        except Exception as e:
            return jsonify({"error": f"Failed to download image from URL: {str(e)}"}), 400

    if not img_bytes:
        return jsonify({"error": "No image file or URL provided"}), 400

    saved = False
    if manga_path and os.path.isdir(manga_path):
        try:
            cpath = os.path.join(manga_path, "cover.jpg")
            with open(cpath, "wb") as f:
                f.write(img_bytes)
            saved = True
        except Exception:
            pass

    cached_file = os.path.join(COVERS_DIR, f"{manga_id}.jpg")
    with open(cached_file, "wb") as f:
        f.write(img_bytes)

    import time
    return jsonify({
        "success": True,
        "message": "Cover updated successfully",
        "cover_url": f"/api/local/manga/{manga_id}/cover?t={int(time.time())}"
    })

@app.route("/api/local/chapter/<chapter_id>/page/<int:page_idx>", methods=["GET"])
def api_local_page(chapter_id, page_idx):
    src = get_source("local")
    all_manga = src.get_all_manga()
    for m in all_manga:
        for ch in m.get("chapters", []):
            if ch["id"] == chapter_id:
                pages = LocalScanner.get_chapter_pages(ch["path"], ch.get("type", "archive"))
                if 0 <= page_idx < len(pages):
                    img_name = pages[page_idx]
                    data = LocalScanner.read_page_bytes(ch["path"], img_name, ch.get("type", "archive"))
                    if data:
                        content_type = mimetypes.guess_type(img_name)[0] or "image/jpeg"
                        return Response(data, mimetype=content_type, headers={"Cache-Control": "public, max-age=86400"})
    return jsonify({"error": "Page not found"}), 404

# ----------------- PROXY IMAGE STREAMING -----------------

@app.route("/api/proxy/image", methods=["GET"])
def api_proxy_image():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "Missing url"}), 400
    try:
        referer = request.args.get("referer")
        if not referer:
            if "mangapill" in url or "readdetectiveconan" in url:
                referer = "https://mangapill.com/"
            elif "asura" in url:
                referer = "https://asuracomic.net/"
            elif "manga18" in url:
                referer = "https://manga18fx.com/"
            elif "mangafire" in url or "brzimg" in url or "mfcdn" in url:
                referer = "https://mangafire.to/"
            else:
                from urllib.parse import urlparse
                p = urlparse(url)
                referer = f"{p.scheme}://{p.netloc}/" if p.netloc else "https://mangadex.org/"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": referer
        }
        resp = requests.get(url, headers=headers, stream=True, timeout=15)
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            resp_headers = {
                "Cache-Control": "public, max-age=604800",
                "Access-Control-Expose-Headers": "Content-Length"
            }
            if "Content-Length" in resp.headers:
                resp_headers["Content-Length"] = resp.headers["Content-Length"]
            return Response(
                resp.iter_content(chunk_size=32768),
                content_type=content_type,
                headers=resp_headers
            )
        return Response(f"Proxy upstream returned {resp.status_code}", status=resp.status_code)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- LIBRARY & PROGRESS -----------------

@app.route("/api/library", methods=["GET"])
def api_get_library():
    # Automatically sync downloads folder into library & download tasks
    sync_downloads_to_library()

    # Merge DB library with local manga
    db_items = db.get_library_manga()
    local_manga = get_source("local").get_all_manga()

    # Automatically add any detected local manga to library if not present
    existing_ids = {item["id"] for item in db_items}
    for lm in local_manga:
        if lm["id"] not in existing_ids:
            db.add_to_library(lm)
            existing_ids.add(lm["id"])

    # Re-fetch merged library
    items = db.get_library_manga()
    local_map = {lm["id"]: lm for lm in local_manga}

    # Query completed download counts per manga
    try:
        conn_dl = db.get_db()
        dl_rows = conn_dl.execute("SELECT manga_id, COUNT(*) as cnt FROM download_tasks WHERE status = 'completed' GROUP BY manga_id").fetchall()
        conn_dl.close()
        dl_map = {r["manga_id"]: r["cnt"] for r in dl_rows}
    except Exception:
        dl_map = {}

    for item in items:
        # Calculate read progress & unread count
        progress_map = db.get_manga_progress_summary(item["id"])
        item["progress_summary"] = progress_map
        read_count = sum(1 for p in progress_map.values() if p.get("is_read"))
        item["read_chapters_count"] = read_count

        # Attach last read timestamp
        max_lr = float(item.get("last_read_at") or 0.0)
        if progress_map:
            for p in progress_map.values():
                val = float(p.get("last_read_at") or 0.0)
                if val > max_lr:
                    max_lr = val
        item["last_read_at"] = max_lr

        # Attach downloaded count
        if item.get("source") == "local":
            item["downloaded_count"] = local_map[item["id"]].get("chapter_count", 0) if item["id"] in local_map else (item.get("chapter_count") or 0)
        else:
            item["downloaded_count"] = dl_map.get(item["id"], 0)

        # Attach chapter count
        if item["id"] in local_map:
            item["chapter_count"] = local_map[item["id"]].get("chapter_count", 0)
        else:
            ch_count = item.get("chapter_count") or 0
            if not ch_count and item.get("source"):
                try:
                    src = get_source(item["source"])
                    if src:
                        chs = src.get_chapters(item["id"], limit=500)
                        if chs:
                            ch_count = len(chs)
                            conn_db = db.get_db()
                            conn_db.execute("UPDATE library SET chapter_count = ? WHERE id = ?", (ch_count, item["id"]))
                            conn_db.commit()
                            conn_db.close()
                except Exception:
                    pass
            item["chapter_count"] = ch_count
        item["new_chapters_count"] = int(item.get("new_chapters_count") or 0)
        item["last_checked"] = float(item.get("last_checked") or 0.0)

        # Ensure cover_url is not pointing to a missing download folder
        cov = item.get("cover_url") or ""
        if cov.startswith("/api/downloads/"):
            folder_name = unquote(cov.replace("/api/downloads/", "").replace("/cover", "")).strip()
            has_disk = False
            for dl_dir in get_downloads_dirs():
                fpath = os.path.join(dl_dir, folder_name)
                if os.path.isdir(fpath) and (any(os.path.isfile(os.path.join(fpath, c)) for c in ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"]) or any(f.lower().endswith(('.cbz', '.zip')) for f in os.listdir(fpath))):
                    has_disk = True
                    break
            if not has_disk:
                m_cache, _ = db.get_cached_manga(item["id"])
                cache_cov = (m_cache or {}).get("cover_url")
                if cache_cov and not cache_cov.startswith("/api/downloads/"):
                    item["cover_url"] = cache_cov

    return jsonify(items)

@app.route("/api/library/update", methods=["POST"])
def api_update_library():
    data = request.json or {}
    skip_completed = data.get("skip_completed")
    auto_download = data.get("auto_download")
    force_all = data.get("force_all", False)
    res = library_updater.trigger_update(skip_completed=skip_completed, auto_download_count=auto_download, force_all=force_all)
    return jsonify(res)

@app.route("/api/library/update/status", methods=["GET"])
def api_update_library_status():
    return jsonify(library_updater.get_status())

@app.route("/api/library/<path:manga_id>/clear-new", methods=["POST"])
def api_clear_new_chapters(manga_id):
    conn = db.get_db()
    conn.execute("UPDATE library SET new_chapters_count = 0 WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, unquote(manga_id), f"%{manga_id}%"))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/library/add", methods=["POST"])
def api_add_library():
    payload = request.json or {}
    manga_id = payload.get("id")
    if not manga_id:
        return jsonify({"error": "Missing id"}), 400
    
    # Fetch details and chapter_count if missing
    if payload.get("source"):
        try:
            src = get_source(payload.get("source"))
            if src:
                if not payload.get("title"):
                    details = src.get_details(manga_id)
                    if details:
                        payload.update(details)
                if not payload.get("chapters"):
                    cached_chs = db.get_cached_chapters(manga_id)
                    if cached_chs:
                        payload["chapters"] = cached_chs
                        payload["chapter_count"] = len(cached_chs)
                    else:
                        chs = src.get_chapters(manga_id, limit=10000)
                        if chs:
                            payload["chapters"] = chs
                            payload["chapter_count"] = len(chs)
                elif not payload.get("chapter_count") and payload.get("chapters"):
                    payload["chapter_count"] = len(payload["chapters"])
        except Exception:
            pass

    db.add_to_library(payload)
    return jsonify({"success": True})

@app.route("/api/library/<path:manga_id>", methods=["DELETE"])
def api_remove_library(manga_id):
    delete_chapters = request.args.get("delete_chapters") == "true"
    delete_from_lib = request.args.get("delete_from_library", "true") == "true"
    if request.is_json and request.json:
        if "delete_chapters" in request.json:
            delete_chapters = bool(request.json.get("delete_chapters"))
        if "delete_from_library" in request.json:
            delete_from_lib = bool(request.json.get("delete_from_library"))

    deleted_count = 0
    if delete_chapters:
        deleted_count = downloader_instance.delete_manga_downloads(manga_id)

    if delete_from_lib:
        db.remove_from_library(manga_id)

    return jsonify({"success": True, "deleted_chapters_count": deleted_count})

@app.route("/api/manga/<path:manga_id>/chapter/<path:chapter_id>/download", methods=["DELETE"])
def api_delete_chapter_download(manga_id, chapter_id):
    ch_num = request.args.get("chapter_number")
    scanlator = request.args.get("scanlator", "")
    success = downloader_instance.delete_chapter_download(manga_id, chapter_id, chapter_number=ch_num, scanlator=scanlator)
    return jsonify({"success": True, "deleted": success})

@app.route("/api/manga/<path:manga_id>/downloads", methods=["DELETE"])
def api_delete_manga_downloads(manga_id):
    deleted_count = downloader_instance.delete_manga_downloads(manga_id)
    return jsonify({"success": True, "deleted_count": deleted_count})

# ----------------- CATEGORIES API -----------------

@app.route("/api/categories", methods=["GET"])
def api_get_categories():
    return jsonify(db.get_categories())

@app.route("/api/categories", methods=["POST"])
def api_add_category():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    cat = db.add_category(name)
    if not cat:
        return jsonify({"error": "Category already exists or failed to create"}), 400
    return jsonify(cat)

@app.route("/api/categories/<cat_id>", methods=["DELETE"])
def api_delete_category(cat_id):
    if cat_id == "default":
        return jsonify({"error": "Cannot delete default category"}), 400
    success = db.delete_category(cat_id)
    return jsonify({"success": success})

@app.route("/api/library/<path:manga_id>/category", methods=["POST"])
def api_set_library_category(manga_id):
    data = request.json or {}
    category_ids = data.get("category_ids")
    if category_ids is None and "category_id" in data:
        category_ids = [data["category_id"]]
    category_ids = category_ids or ["default"]
    db.update_manga_categories(manga_id, category_ids)
    return jsonify({"success": True, "category_ids": category_ids})

# ----------------- BATCH OPERATIONS API -----------------

@app.route("/api/library/batch/category", methods=["POST"])
def api_batch_set_library_category():
    data = request.json or {}
    manga_ids = data.get("manga_ids") or []
    category_ids = data.get("category_ids") or ["default"]
    for m_id in manga_ids:
        db.update_manga_categories(m_id, category_ids)
    return jsonify({"success": True, "count": len(manga_ids)})

@app.route("/api/library/batch/mark-read", methods=["POST"])
def api_batch_mark_read():
    data = request.json or {}
    manga_ids = data.get("manga_ids") or []
    is_read = bool(data.get("is_read", True))
    conn = db.get_db()
    for m_id in manga_ids:
        row = conn.execute("SELECT title, cover_url, source, chapters_json FROM library WHERE id = ?", (m_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT title, cover_url, source, chapters_json FROM manga_cache WHERE id = ?", (m_id,)).fetchone()
        if row and row["chapters_json"]:
            try:
                chs = json.loads(row["chapters_json"])
                for ch in chs:
                    cid = ch.get("id") or ch.get("url")
                    c_num = ch.get("chapter_number") or ""
                    c_title = ch.get("title") or ch.get("name") or ""
                    db.save_progress(
                        manga_id=m_id,
                        chapter_id=cid,
                        is_read=1 if is_read else 0,
                        manga_title=row["title"] or "",
                        cover_url=row["cover_url"] or "",
                        source=row["source"] or "",
                        chapter_title=c_title,
                        chapter_number=str(c_num),
                        force_is_read=True
                    )
            except Exception as e:
                print(f"Error in batch mark read for {m_id}:", e)
    conn.close()
    return jsonify({"success": True, "count": len(manga_ids)})

@app.route("/api/library/batch/download", methods=["POST"])
def api_batch_download_next():
    data = request.json or {}
    manga_ids = data.get("manga_ids") or []
    count = int(data.get("count", 1))
    queued_total = 0
    conn = db.get_db()
    for m_id in manga_ids:
        row = conn.execute("SELECT title, cover_url, source, chapters_json FROM library WHERE id = ?", (m_id,)).fetchone()
        if not row or not row["chapters_json"]:
            continue
        try:
            chs = json.loads(row["chapters_json"])
            progress_map = db.get_manga_progress_summary(m_id)
            excluded_scans = db.get_manga_excluded_scanlators(m_id)
            unread_chs = [
                c for c in chs
                if not progress_map.get(c.get("id"), {}).get("is_read")
                and (c.get("scanlator") or "unofficial").lower().strip() not in excluded_scans
            ]
            # Deduplicate by chapter number (prefer official)
            seen_nums = {}
            for c in unread_chs:
                num = extract_chapter_number(str(c.get("chapter_number") or c.get("title") or "0"))
                if num not in seen_nums or "official" in str(c.get("scanlator", "")).lower():
                    seen_nums[num] = c
            deduped = sorted(seen_nums.values(), key=lambda c: extract_chapter_number(str(c.get("chapter_number") or c.get("title") or "0")))
            to_download = deduped[:count]
            for ch in to_download:
                cid = ch.get("id") or ch.get("url")
                c_num = ch.get("chapter_number") or 0.0
                c_title = ch.get("title") or ch.get("name") or f"Chapter {c_num}"
                c_scan = str(ch.get("scanlator", "") or "").strip()
                t_id = downloader_instance.add_to_queue(
                    manga_id=m_id,
                    chapter_id=cid,
                    manga_title=row["title"],
                    chapter_title=c_title,
                    chapter_number=c_num,
                    cover_url=row["cover_url"],
                    source=row["source"],
                    scanlator=c_scan
                )
                if t_id:
                    queued_total += 1
        except Exception as e:
            print(f"Error queuing batch download for {m_id}:", e)
    conn.close()
    return jsonify({"success": True, "queued_count": queued_total})

@app.route("/api/library/batch/remove", methods=["POST"])
def api_batch_remove_library():
    data = request.json or {}
    manga_ids = data.get("manga_ids") or []
    delete_chapters = bool(data.get("delete_chapters", False))
    deleted_chapters_total = 0
    for m_id in manga_ids:
        if delete_chapters:
            deleted_chapters_total += downloader_instance.delete_manga_downloads(m_id)
        db.remove_from_library(m_id)
    return jsonify({"success": True, "removed_count": len(manga_ids), "deleted_chapters_count": deleted_chapters_total})

@app.route("/api/manga/<path:manga_id>/chapters/batch/mark", methods=["POST"])
def api_manga_chapters_batch_mark(manga_id):
    data = request.json or {}
    chapter_ids = data.get("chapter_ids") or []
    is_read = data.get("is_read")
    is_bookmarked = data.get("is_bookmarked")
    manga_title = data.get("manga_title", "")
    cover_url = data.get("cover_url", "")
    source = data.get("source", "")

    for cid in chapter_ids:
        db.save_progress(
            manga_id=manga_id,
            chapter_id=cid,
            is_read=1 if is_read else (0 if is_read is False else None),
            is_bookmarked=1 if is_bookmarked else (0 if is_bookmarked is False else None),
            manga_title=manga_title,
            cover_url=cover_url,
            source=source,
            force_is_read=(is_read is not None)
        )
    return jsonify({"success": True, "count": len(chapter_ids)})

@app.route("/api/manga/<path:manga_id>/chapters/batch/download", methods=["POST"])
def api_manga_chapters_batch_download(manga_id):
    data = request.json or {}
    chapters = data.get("chapters") or []
    manga_title = data.get("manga_title", "")
    cover_url = data.get("cover_url", "")
    source = data.get("source", "")
    excluded_scans = db.get_manga_excluded_scanlators(manga_id)
    queued = 0
    for ch in chapters:
        c_scan = str(ch.get("scanlator", "") or "").strip()
        if excluded_scans and (c_scan or "unofficial").lower() in excluded_scans:
            continue
        cid = ch.get("id") or ch.get("url")
        c_num = ch.get("chapter_number") or 0.0
        c_title = ch.get("title") or ch.get("name") or f"Chapter {c_num}"
        t_id = downloader_instance.add_to_queue(
            manga_id=manga_id,
            chapter_id=cid,
            manga_title=manga_title,
            chapter_title=c_title,
            chapter_number=c_num,
            cover_url=cover_url,
            source=source,
            scanlator=c_scan
        )
        if t_id:
            queued += 1
    return jsonify({"success": True, "queued_count": queued})

@app.route("/api/manga/<path:manga_id>/chapters/batch/delete", methods=["POST"])
def api_manga_chapters_batch_delete(manga_id):
    data = request.json or {}
    chapters = data.get("chapters") or []
    deleted = 0
    for ch in chapters:
        cid = ch.get("id") or ch.get("url")
        c_num = ch.get("chapter_number")
        c_scan = ch.get("scanlator") or ""
        if downloader_instance.delete_chapter_download(manga_id, cid, chapter_number=c_num, scanlator=c_scan):
            deleted += 1
    return jsonify({"success": True, "deleted_count": deleted})

@app.route("/api/manga/<path:manga_id>/chapter-settings", methods=["GET"])
def api_get_manga_chapter_settings(manga_id):
    settings = db.get_manga_chapter_settings(manga_id)
    return jsonify(settings)

@app.route("/api/manga/<path:manga_id>/chapter-settings", methods=["POST"])
def api_set_manga_chapter_settings(manga_id):
    data = request.json or {}
    db.set_manga_chapter_settings(manga_id, data)
    return jsonify({"success": True})

@app.route("/api/manga/<path:manga_id>/downloads/delete-by-scanlator", methods=["POST"])
def api_delete_manga_downloads_by_scanlator(manga_id):
    data = request.json or {}
    scanlator = data.get("scanlator", "").strip()
    if not scanlator:
        return jsonify({"error": "Scanlator parameter is required"}), 400
    deleted_count = downloader_instance.delete_manga_downloads_by_scanlator(manga_id, scanlator)
    return jsonify({"success": True, "deleted_count": deleted_count})

# ----------------- MIGRATION API -----------------

@app.route("/api/migration/sources", methods=["GET"])
def api_get_migration_sources():
    raw_sources = db.get_migration_sources_summary()
    all_sources = get_all_sources()
    src_map = {s["id"]: s for s in all_sources}
    
    result = []
    for item in raw_sources:
        sid = item["source"]
        src_meta = src_map.get(sid) or {}
        result.append({
            "id": sid,
            "name": src_meta.get("name") or sid.title(),
            "icon_url": src_meta.get("icon_url") or "/static/img/default-cover.png",
            "lang": src_meta.get("lang") or "all",
            "manga_count": item["manga_count"]
        })
    return jsonify(result)

@app.route("/api/migration/manga", methods=["GET"])
def api_get_migration_manga():
    source_id = request.args.get("source")
    if not source_id:
        return jsonify({"error": "Missing source parameter"}), 400
    manga_list = db.get_migration_manga(source_id)
    return jsonify(manga_list)

@app.route("/api/migration/migrate", methods=["POST"])
def api_migrate_manga():
    data = request.json or {}
    current_manga_id = data.get("current_manga_id") or data.get("current_id")
    target_manga_id = data.get("target_manga_id") or data.get("target_id")
    target_source = data.get("target_source") or data.get("source")
    replace = bool(data.get("replace", True))
    flags = data.get("flags") or {
        "chapters": True,
        "categories": True,
        "custom_info": True,
        "delete_downloads": False
    }

    if not current_manga_id or not target_manga_id or not target_source:
        return jsonify({"error": "Missing required migration parameters"}), 400

    try:
        res = db.migrate_manga_record(
            current_id=current_manga_id,
            target_id=target_manga_id,
            target_source=target_source,
            replace=replace,
            flags=flags
        )
        return jsonify(res)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/migration/batch-migrate", methods=["POST"])
def api_batch_migrate_manga():
    data = request.json or {}
    migrations = data.get("migrations") or []
    if not migrations:
        return jsonify({"error": "No migrations provided"}), 400

    results = []
    for item in migrations:
        c_id = item.get("current_manga_id") or item.get("current_id")
        t_id = item.get("target_manga_id") or item.get("target_id")
        t_src = item.get("target_source") or item.get("source")
        replace = bool(item.get("replace", True))
        flags = item.get("flags") or {"chapters": True, "categories": True, "custom_info": True, "delete_downloads": False}

        if c_id and t_id and t_src:
            try:
                res = db.migrate_manga_record(c_id, t_id, t_src, replace=replace, flags=flags)
                results.append(res)
            except Exception as e:
                results.append({"success": False, "current_id": c_id, "error": str(e)})

    return jsonify({"success": True, "results": results, "total": len(results)})

@app.route("/api/manga/<path:manga_id>/downloaded_chapters", methods=["GET"])
def api_manga_downloaded_chapters(manga_id):
    conn = db.get_db()
    rows = conn.execute("SELECT chapter_id FROM download_tasks WHERE manga_id = ? AND status = 'completed'", (manga_id,)).fetchall()
    conn.close()
    return jsonify([r["chapter_id"] for r in rows])

@app.route("/api/manga/<path:manga_id>/download_status", methods=["GET"])
def api_manga_download_status(manga_id):
    conn = db.get_db()

    raw_id = manga_id
    for pfx in ["asura_", "asurascans_", "mangafire_", "mangadex_", "mangapill_", "manga18_"]:
        if raw_id.startswith(pfx):
            raw_id = raw_id[len(pfx):]
            break

    m_title = ""
    row_lib = conn.execute("SELECT title FROM library WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchone()
    if row_lib and row_lib["title"]:
        m_title = row_lib["title"]
    else:
        row_c = conn.execute("SELECT title FROM manga_cache WHERE id = ? OR id = ? OR id LIKE ?", (manga_id, raw_id, f"%{raw_id}%")).fetchone()
        if row_c and row_c["title"]:
            m_title = row_c["title"]

    query_parts = ["manga_id = ?", "manga_id = ?", "manga_id LIKE ?"]
    params = [manga_id, raw_id, f"%{raw_id}%"]
    if m_title:
        query_parts.extend(["manga_title = ?", "manga_title LIKE ?"])
        params.extend([m_title, f"%{m_title}%"])

    sql = f"SELECT id, chapter_id, chapter_number, manga_title, scanlator, chapter_title, status, progress, total_pages, downloaded_pages FROM download_tasks WHERE ({' OR '.join(query_parts)})"
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()

    completed = set()
    completed_numbers = set()
    active = {}

    stale_ids = []
    for r in rows:
        ch_id = r["chapter_id"]
        st = r["status"]
        ch_num = extract_chapter_number(str(r["chapter_number"])) if r["chapter_number"] is not None else 0.0
        t_scan = r["scanlator"] if "scanlator" in r.keys() else ""
        t_title = r["chapter_title"] if "chapter_title" in r.keys() else ""

        if st == "completed":
            cbz_path = find_chapter_cbz(ch_id, manga_id=manga_id, manga_title=m_title, chapter_number=ch_num, scanlator=t_scan, chapter_title=t_title)
            if cbz_path and os.path.exists(cbz_path):
                completed.add(ch_id)
                if ch_num > 0 and ch_num != 999999.0 and not t_scan:
                    completed_numbers.add(ch_num)
            else:
                stale_ids.append(r["id"])
        elif st in ("downloading", "pending", "paused"):
            active[ch_id] = {
                "task_id": r["id"],
                "status": st,
                "progress": float(r["progress"] or 0),
                "total_pages": int(r["total_pages"] or 0),
                "downloaded_pages": int(r["downloaded_pages"] or 0)
            }

    if stale_ids:
        try:
            conn_prune = db.get_db()
            conn_prune.executemany("DELETE FROM download_tasks WHERE id = ?", [(tid,) for tid in stale_ids])
            conn_prune.commit()
            conn_prune.close()
        except Exception:
            pass

    # Check physical downloaded CBZ files on disk
    try:
        candidates = []
        for dl_dir in get_downloads_dirs():
            if m_title:
                candidates.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(m_title)))
                candidates.append(os.path.join(dl_dir, m_title))
            candidates.append(os.path.join(dl_dir, downloader_instance._sanitize_filename(raw_id)))
            candidates.append(os.path.join(dl_dir, raw_id))

            if os.path.isdir(dl_dir):
                for sub in os.listdir(dl_dir):
                    sub_dir = os.path.join(dl_dir, sub)
                    if not os.path.isdir(sub_dir):
                        continue
                    det_path = os.path.join(sub_dir, "details.json")
                    if os.path.exists(det_path):
                        try:
                            with open(det_path, "r", encoding="utf-8") as f:
                                d_json = json.load(f)
                                if d_json.get("id") in (manga_id, raw_id) or (m_title and d_json.get("title", "").lower() == m_title.lower()):
                                    if sub_dir not in candidates:
                                        candidates.append(sub_dir)
                        except Exception:
                            pass
                    elif m_title and (sub.lower() in m_title.lower() or m_title.lower() in sub.lower()):
                        if sub_dir not in candidates:
                            candidates.append(sub_dir)

        # Only scan disk files if no completed tasks exist in DB (e.g. locally imported manga)
        if not completed:
            for folder in candidates:
                if folder and os.path.isdir(folder):
                    for f in os.listdir(folder):
                        if f.lower().endswith(('.cbz', '.zip')):
                            f_base = os.path.splitext(f)[0].lower()
                            if '_' not in f_base and '(' not in f_base and not any(tag in f_base for tag in ['official', 'unofficial']):
                                c_num = extract_chapter_number(f)
                                if c_num > 0 and c_num != 999999.0:
                                    completed_numbers.add(c_num)
    except Exception as e:
        print("Error checking disk in api_manga_download_status:", e)

    return jsonify({
        "completed": list(completed),
        "completed_numbers": list(completed_numbers),
        "active": active
    })

@app.route("/api/progress/<path:manga_id>", methods=["GET"])
def api_get_progress(manga_id):
    return jsonify(db.get_manga_progress_summary(manga_id))

@app.route("/api/progress", methods=["POST"])
def api_save_progress():
    data = request.json or {}
    manga_id = data.get("manga_id")
    chapter_id = data.get("chapter_id")
    page_index = data.get("page_index")
    total_pages = data.get("total_pages")
    is_read = (1 if data.get("is_read") else 0) if "is_read" in data else None
    is_bookmarked = (1 if data.get("is_bookmarked") else 0) if "is_bookmarked" in data else None
    manga_title = data.get("manga_title", "")
    cover_url = data.get("cover_url", "")
    source = data.get("source", "")
    chapter_title = data.get("chapter_title", "")
    chapter_number = data.get("chapter_number", "")
    force_is_read = bool(data.get("force_is_read") or data.get("force", False))

    if not manga_id or not chapter_id:
        return jsonify({"error": "Missing manga_id or chapter_id"}), 400

    # 1. Incognito mode check (bypass progress and history logging)
    is_incognito = bool(data.get("incognito")) or (request.headers.get("X-Incognito") == "true")
    if is_incognito:
        if is_bookmarked is not None and page_index is None and is_read is None:
            db.save_progress(
                manga_id=manga_id,
                chapter_id=chapter_id,
                is_bookmarked=is_bookmarked,
                manga_title=manga_title,
                cover_url=cover_url,
                source=source,
                chapter_title=chapter_title,
                chapter_number=chapter_number
            )
        return jsonify({"success": True, "incognito": True})

    db.save_progress(
        manga_id=manga_id,
        chapter_id=chapter_id,
        page_index=page_index,
        total_pages=total_pages,
        is_read=is_read,
        is_bookmarked=is_bookmarked,
        manga_title=manga_title,
        cover_url=cover_url,
        source=source,
        chapter_title=chapter_title,
        chapter_number=chapter_number,
        force_is_read=force_is_read
    )

    # 2. Auto-delete read downloads if chapter is completed and setting is enabled
    is_finished = bool(force_is_read or (is_read == 1) or (page_index is not None and total_pages is not None and page_index >= total_pages))
    if is_finished:
        auto_del = db.get_setting("auto_delete_read_downloads", "false").lower() == "true"
        if auto_del:
            try:
                downloader_instance.delete_chapter_download(manga_id, chapter_id, chapter_number=chapter_number)
            except Exception as e:
                print("Error auto-deleting read chapter:", e)

        # 3. Auto-sync reading progress to authenticated remote trackers (Mihon behavior)
        try:
            def _bg_sync_trackers():
                track_data = db.get_manga_tracking(manga_id)
                if track_data and isinstance(track_data, dict):
                    c_num = 0
                    try:
                        import re
                        m_ch = re.search(r"(\d+(?:\.\d+)?)", str(chapter_number or ""))
                        if m_ch:
                            c_num = int(float(m_ch.group(1)))
                    except Exception:
                        pass
                    changed = False
                    for s_name, item in track_data.items():
                        if isinstance(item, dict) and item.get("linked") and item.get("id"):
                            new_chs = max(int(item.get("chapters_read") or 0), c_num) if c_num > 0 else int(item.get("chapters_read") or 0)
                            if new_chs != item.get("chapters_read"):
                                item["chapters_read"] = new_chs
                                changed = True
                            sync_remote_tracker_entry(
                                s_name,
                                item["id"],
                                status=item.get("status", "Reading"),
                                chapters_read=new_chs,
                                score=item.get("score", 0)
                            )
                    if changed:
                        db.set_manga_tracking(manga_id, track_data)
            threading.Thread(target=_bg_sync_trackers, daemon=True).start()
        except Exception as e:
            print("Tracking auto-sync error:", e)


    # If manga details or chapters provided in payload, save to manga_cache
    if data.get("manga") or data.get("chapters"):
        m_info = data.get("manga") or {
            "id": manga_id,
            "title": manga_title,
            "cover_url": cover_url,
            "source": source
        }
        db.save_manga_cache(m_info, chapters_list=data.get("chapters"), has_read=1)

    return jsonify({"success": True})

@app.route("/api/history", methods=["GET"])
def api_get_history():
    return jsonify(db.get_reading_history())

@app.route("/api/history/clear", methods=["POST"])
def api_clear_history():
    db.clear_all_history()
    return jsonify({"success": True})

@app.route("/api/history/<path:manga_id>", methods=["DELETE"])
def api_delete_manga_history(manga_id):
    db.delete_history_item(manga_id)
    return jsonify({"success": True})

@app.route("/api/history/<path:manga_id>/<path:chapter_id>", methods=["DELETE"])
def api_delete_history_item(manga_id, chapter_id):
    db.delete_history_item(manga_id, chapter_id)
    return jsonify({"success": True})

@app.route("/api/progress/bulk", methods=["POST"])
def api_bulk_progress():
    data = request.json or {}
    manga_id = data.get("manga_id")
    chapter_ids = data.get("chapter_ids", [])
    action = data.get("action", "mark_read")
    if not manga_id or not chapter_ids:
        return jsonify({"error": "Missing manga_id or chapter_ids"}), 400
    db.bulk_update_progress(manga_id, chapter_ids, action)
    return jsonify({"success": True, "count": len(chapter_ids)})

# ----------------- DOWNLOADS API -----------------

@app.route("/api/downloads", methods=["GET"])
def api_get_downloads():
    filter_status = request.args.get("filter")
    include_completed = request.args.get("include_completed") in ("1", "true")
    tasks = downloader_instance.get_all_tasks(include_completed=include_completed, filter_status=filter_status)
    return jsonify(tasks)

@app.route("/api/downloads/queue", methods=["POST"])
def api_queue_download():
    data = request.json or {}
    manga_id = data.get("manga_id")
    manga_title = data.get("manga_title", "Untitled")
    chapter_id = data.get("chapter_id")
    chapter_number = data.get("chapter_number", 0)
    chapter_title = data.get("chapter_title", "Chapter")
    source = data.get("source", "mangadex")
    cover_url = data.get("cover_url", "")
    to_top = bool(data.get("to_top", False))
    scanlator = data.get("scanlator", "")

    if not manga_id or not chapter_id:
        return jsonify({"error": "Missing required fields"}), 400

    task_id = downloader_instance.add_to_queue(
        manga_id=manga_id,
        manga_title=manga_title,
        chapter_id=chapter_id,
        chapter_number=chapter_number,
        chapter_title=chapter_title,
        source=source,
        cover_url=cover_url,
        to_top=to_top,
        scanlator=scanlator
    )
    return jsonify({"success": True, "task_id": task_id})

@app.route("/api/downloads/queue-bulk", methods=["POST"])
def api_queue_downloads_bulk():
    data = request.json or {}
    items = data.get("chapters") or []
    if not items:
        return jsonify({"error": "No chapters provided"}), 400
    queued_ids = downloader_instance.add_bulk_to_queue(items)
    return jsonify({"success": True, "count": len(queued_ids), "task_ids": queued_ids})

@app.route("/api/downloads/<task_id>/pause", methods=["POST"])
def api_pause_download(task_id):
    downloader_instance.pause_task(task_id)
    return jsonify({"success": True})

@app.route("/api/downloads/<task_id>/resume", methods=["POST"])
def api_resume_download(task_id):
    downloader_instance.resume_task(task_id)
    return jsonify({"success": True})

@app.route("/api/downloads/<task_id>/retry", methods=["POST"])
def api_retry_download(task_id):
    downloader_instance.retry_task(task_id)
    return jsonify({"success": True})

@app.route("/api/downloads/<task_id>/reorder", methods=["POST"])
def api_reorder_download(task_id):
    data = request.json or {}
    to_top = data.get("to_top", True)
    downloader_instance.reorder_task(task_id, to_top=to_top)
    return jsonify({"success": True})

@app.route("/api/downloads/tasks/reorder-all", methods=["POST"])
def api_reorder_all_task_downloads():
    data = request.json or {}
    order = data.get("order", [])
    success = downloader_instance.reorder_tasks_order(order)
    return jsonify({"success": success})

@app.route("/api/downloads/manga/reorder-all", methods=["POST"])
def api_reorder_all_manga_downloads():
    data = request.json or {}
    order = data.get("order", [])
    success = downloader_instance.reorder_mangas_order(order)
    return jsonify({"success": success})

@app.route("/api/downloads/manga/<path:manga_id>/reorder", methods=["POST"])
def api_reorder_manga_downloads(manga_id):
    data = request.json or {}
    action = data.get("action", "top")
    success = downloader_instance.reorder_manga(manga_id, action=action)
    return jsonify({"success": success})

@app.route("/api/downloads/manga/<path:manga_id>/pause", methods=["POST"])
def api_pause_manga_downloads(manga_id):
    success = downloader_instance.pause_manga(manga_id)
    return jsonify({"success": success})

@app.route("/api/downloads/manga/<path:manga_id>/resume", methods=["POST"])
def api_resume_manga_downloads(manga_id):
    success = downloader_instance.resume_manga(manga_id)
    return jsonify({"success": success})

@app.route("/api/downloads/manga/<path:manga_id>/cancel", methods=["POST"])
def api_cancel_manga_downloads(manga_id):
    success = downloader_instance.cancel_manga(manga_id)
    return jsonify({"success": success})

@app.route("/api/downloads/<task_id>", methods=["DELETE"])
def api_cancel_download(task_id):
    downloader_instance.cancel_task(task_id)
    return jsonify({"success": True})

@app.route("/api/downloads/clear-finished", methods=["POST"])
def api_clear_finished_downloads():
    downloader_instance.clear_finished()
    return jsonify({"success": True})

@app.route("/api/downloads/pause-all", methods=["POST"])
def api_pause_all_downloads():
    downloader_instance.pause_all()
    return jsonify({"success": True})

@app.route("/api/downloads/resume-all", methods=["POST"])
def api_resume_all_downloads():
    downloader_instance.resume_all()
    return jsonify({"success": True})

@app.route("/api/downloads/auto-resume", methods=["POST"])
def api_auto_resume_downloads():
    count = downloader_instance.auto_resume_pending_or_interrupted()
    return jsonify({"success": True, "resumed_count": count})

@app.route("/api/downloads/cancel-all", methods=["POST"])
def api_cancel_all_downloads():
    downloader_instance.cancel_all()
    return jsonify({"success": True})

# ----------------- SYSTEM & FILESYSTEM BROWSER API -----------------

def get_system_drives():
    import sys, string
    drives = []
    if sys.platform == "win32":
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                drives.append(drive)
    else:
        drives.append("/")
    return drives

def open_native_folder_dialog(initial_dir="", title="Select Folder"):
    import sys, subprocess, os

    # 1. Windows: Real Native Windows Explorer IFileOpenDialog via pick_folder.ps1
    if sys.platform == "win32":
        try:
            ps_script_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "pick_folder.ps1"))
            if os.path.isfile(ps_script_path):
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy", "Bypass",
                    "-File", ps_script_path,
                    "-InitialDir", initial_dir or "",
                    "-Title", title or "Select Folder"
                ]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                chosen = res.stdout.strip()
                if chosen and os.path.isdir(chosen):
                    return os.path.normpath(chosen)
        except Exception as e:
            print("[System] Native Windows Explorer dialog error:", e)

    # 2. Tkinter cross-platform fallback
    try:
        import json
        py_code = f"""
import sys, os, json
try:
    import tkinter as tk
    from tkinter import filedialog as fd
    root = tk.Tk()
    root.withdraw()
    kwargs = {{"title": {json.dumps(title)}}}
    init_d = {json.dumps(initial_dir)}
    if init_d and os.path.isdir(init_d):
        kwargs["initialdir"] = init_d
    path = fd.askdirectory(**kwargs)
    root.destroy()
    if path:
        print(os.path.normpath(path))
except Exception:
    pass
"""
        res = subprocess.run([sys.executable, "-c", py_code], capture_output=True, text=True, timeout=180)
        chosen = res.stdout.strip()
        if chosen and os.path.isdir(chosen):
            return os.path.normpath(chosen)
    except Exception as e:
        print("[System] Tkinter dialog fallback error:", e)

    return None

@app.route("/api/system/list-dir", methods=["GET"])
def api_system_list_dir():
    target_path = request.args.get("path", "").strip()
    drives = get_system_drives()

    if not target_path or not os.path.exists(target_path):
        target_path = db.get_download_dir()
        if not target_path or not os.path.exists(target_path):
            target_path = drives[0] if drives else os.path.abspath(os.sep)

    target_path = os.path.abspath(target_path)
    folders = []
    try:
        with os.scandir(target_path) as it:
            for entry in it:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        name = entry.name
                        if not name.startswith('$') and not name.startswith('.'):
                            folders.append({
                                "name": name,
                                "path": os.path.normpath(entry.path)
                            })
                except (PermissionError, OSError):
                    continue
    except (PermissionError, OSError):
        pass

    folders.sort(key=lambda x: x["name"].lower())
    parent = os.path.dirname(target_path)
    if parent == target_path:
        parent = None

    return jsonify({
        "current_path": os.path.normpath(target_path),
        "parent_path": os.path.normpath(parent) if parent else None,
        "drives": drives,
        "folders": folders
    })

@app.route("/api/system/create-folder", methods=["POST"])
def api_system_create_folder():
    data = request.json or {}
    parent_path = data.get("parent_path", "").strip()
    folder_name = data.get("folder_name", "").strip()

    if not parent_path or not os.path.isdir(parent_path):
        return jsonify({"error": "Invalid parent path"}), 400
    if not folder_name or re.search(r'[\\/:*?"<>|]', folder_name):
        return jsonify({"error": "Invalid folder name"}), 400

    new_dir = os.path.join(parent_path, folder_name)
    try:
        os.makedirs(new_dir, exist_ok=True)
        return jsonify({"success": True, "path": os.path.normpath(new_dir)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/system/open-explorer", methods=["POST"])
def api_system_open_explorer():
    data = request.json or {}
    path = data.get("path", "").strip()
    if not path or not os.path.exists(path):
        path = get_downloads_dir()
    try:
        path = os.path.normpath(path)
        os.makedirs(path, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(path)
        else:
            subprocess.Popen(["xdg-open", path])
        return jsonify({"success": True, "path": path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/system/locate-folder", methods=["POST"])
def api_system_locate_folder():
    data = request.json or {}
    folder_name = data.get("folder_name", "").strip()
    sample_files = data.get("sample_files", [])

    if not folder_name:
        return jsonify({"success": False, "error": "Folder name required"}), 400

    candidates = []
    cur_dl = db.get_download_dir()
    if cur_dl and os.path.exists(cur_dl):
        candidates.append(os.path.dirname(cur_dl))
        candidates.append(cur_dl)

    try:
        local_paths = json.loads(db.get_setting("local_paths", "[]"))
        for lp in local_paths:
            if lp and os.path.exists(lp):
                candidates.append(os.path.dirname(lp))
                candidates.append(lp)
    except Exception:
        pass

    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates.append(workspace)
    candidates.append(os.path.dirname(workspace))

    home = os.path.expanduser("~")
    for sub in ["Downloads", "Documents", "Desktop"]:
        sp = os.path.join(home, sub)
        if os.path.exists(sp):
            candidates.append(sp)

    for d in get_system_drives():
        if os.path.exists(d):
            candidates.append(d)

    seen = set()
    unique_candidates = []
    for c in candidates:
        norm = os.path.normpath(c).lower()
        if norm not in seen and os.path.isdir(c):
            seen.add(norm)
            unique_candidates.append(os.path.normpath(c))

    for c in unique_candidates:
        if os.path.basename(c).lower() == folder_name.lower():
            return jsonify({"success": True, "path": c})
        direct_child = os.path.join(c, folder_name)
        if os.path.isdir(direct_child):
            return jsonify({"success": True, "path": direct_child})

    for c in unique_candidates:
        try:
            with os.scandir(c) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if entry.name.lower() == folder_name.lower():
                                return jsonify({"success": True, "path": os.path.normpath(entry.path)})
                            sub_child = os.path.join(entry.path, folder_name)
                            if os.path.isdir(sub_child):
                                return jsonify({"success": True, "path": os.path.normpath(sub_child)})
                    except (PermissionError, OSError):
                        continue
        except (PermissionError, OSError):
            continue

    return jsonify({"success": False, "folder_name": folder_name})

@app.route("/api/system/browse-folder", methods=["POST"])
def api_system_browse_folder():
    data = request.json or {}
    initial_dir = data.get("initial_dir", "").strip()
    title = data.get("title", "Select Folder")
    selected_path = open_native_folder_dialog(initial_dir=initial_dir, title=title)
    if selected_path:
        return jsonify({"success": True, "path": selected_path})
    return jsonify({"success": False, "cancelled": True})

# ----------------- SETTINGS API -----------------

@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    import json
    default_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads"))
    return jsonify({
        "download_dir": get_downloads_dir(),
        "default_download_dir": default_dir,
        "local_paths": json.loads(db.get_setting("local_paths", "[]")),
        "reader_mode": db.get_setting("reader_mode", "webtoon"),
        "reader_width": db.get_setting("reader_width", "800"),
        "reader_bg": db.get_setting("reader_bg", "black"),
        "preload_count": db.get_setting("preload_count", "5"),
        "accent_color": db.get_setting("accent_color", "teal"),
        "auto_backup_frequency": db.get_setting("auto_backup_frequency", "off"),
        "library_update_frequency": db.get_setting("library_update_frequency", "12h"),
        "library_update_skip_completed": db.get_setting("library_update_skip_completed", "true"),
        "library_update_auto_download": db.get_setting("library_update_auto_download", "0"),
        "last_library_update_time": db.get_setting("last_library_update_time", "0"),
        "auto_delete_read_downloads": db.get_setting("auto_delete_read_downloads", "false"),
        "download_ahead": db.get_setting("download_ahead", "0"),
        "library_filter_settings": db.get_setting("library_filter_settings", "")
    })

@app.route("/api/settings", methods=["POST"])
def api_save_settings():
    import json
    data = request.json or {}
    for k, v in data.items():
        if k == "local_paths":
            db.set_setting(k, json.dumps(v))
        elif k == "download_dir":
            v_str = str(v).strip()
            if v_str:
                try:
                    os.makedirs(v_str, exist_ok=True)
                except Exception:
                    pass
                db.set_setting(k, os.path.normpath(v_str))
            else:
                db.set_setting(k, "")
        else:
            db.set_setting(k, str(v))
    return jsonify({"success": True})

# ----------------- EXTENSIONS & REPOS API -----------------
from server.extension_manager import extension_manager

@app.route("/api/extensions", methods=["GET"])
def api_get_extensions():
    query = request.args.get("q", "")
    lang = request.args.get("lang", "all")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 40))
    force = request.args.get("force", "0") == "1"
    if force:
        extension_manager.fetch_all_extensions(force=True)
    return jsonify(extension_manager.search_extensions(query=query, lang=lang, page=page, limit=limit))

@app.route("/api/extensions/installed", methods=["GET"])
def api_get_installed_extensions():
    return jsonify(extension_manager.get_installed())

@app.route("/api/extensions/install", methods=["POST"])
def api_install_extension():
    data = request.json or {}
    pkg = data.get("pkg")
    if not pkg:
        return jsonify({"error": "Missing package name"}), 400
    try:
        ext = extension_manager.install(pkg)
        return jsonify({"success": True, "extension": ext})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/extensions/uninstall", methods=["POST"])
def api_uninstall_extension():
    data = request.json or {}
    pkg = data.get("pkg") or data.get("source_id") or data.get("id") or data.get("source")
    if not pkg:
        return jsonify({"error": "Missing package name"}), 400
    try:
        extension_manager.uninstall(pkg)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/extensions/repos", methods=["GET"])
def api_get_extension_repos():
    return jsonify(extension_manager.get_repos())

@app.route("/api/extensions/repos", methods=["POST"])
def api_add_extension_repo():
    data = request.json or {}
    url = data.get("url")
    name = data.get("name")
    if not url:
        return jsonify({"error": "Missing repository URL"}), 400
    try:
        repo = extension_manager.add_repo(url, name)
        return jsonify({"success": True, "repo": repo})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/extensions/repos/<repo_id>", methods=["DELETE"])
def api_delete_extension_repo(repo_id):
    extension_manager.remove_repo(repo_id)
    return jsonify({"success": True})

# ----------------- BACKUP & RESTORE ROUTES -----------------

@app.route("/api/backup/create", methods=["POST"])
def api_create_backup():
    try:
        save_disk = True
        if request.is_json and request.json:
            save_disk = request.json.get("save_to_disk", True)
        backup_data, filepath = backup.create_backup(save_to_disk=save_disk)
        filename = os.path.basename(filepath) if filepath else None
        return jsonify({
            "success": True,
            "filename": filename,
            "download_url": f"/api/backup/download/{quote(filename)}" if filename else None,
            "backup": backup_data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/backup/list", methods=["GET"])
def api_list_backups():
    try:
        backups = backup.list_backups()
        return jsonify(backups)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/backup/download/<path:filename>", methods=["GET"])
def api_download_backup(filename):
    fpath = backup.get_backup_path(filename)
    if not fpath:
        return jsonify({"error": "Backup file not found"}), 404
    mimetype = "application/x-tachiyomi-backup" if filename.endswith(".tachibk") else "application/octet-stream"
    return send_file(fpath, as_attachment=True, download_name=os.path.basename(fpath), mimetype=mimetype)

@app.route("/api/backup/<path:filename>", methods=["DELETE"])
def api_delete_backup(filename):
    try:
        success = backup.delete_backup(filename)
        if success:
            return jsonify({"success": True})
        return jsonify({"error": "Backup file not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/backup/restore", methods=["POST"])
def api_restore_backup():
    try:
        restore_settings = False
        backup_data = None

        if "file" in request.files:
            uploaded = request.files["file"]
            content = uploaded.read()
            restore_settings = request.form.get("restore_settings", "false").lower() == "true"
            fname = (uploaded.filename or "").lower()
            if fname.endswith(".tachibk") or backup.is_tachiyomi_protobuf_backup(content):
                result = backup.restore_tachiyomi_apk_backup(content)
                return jsonify(result)
            backup_data = backup.parse_backup_content(content)
        elif request.is_json and request.json:
            req = request.json
            restore_settings = bool(req.get("restore_settings", False))
            if "filename" in req:
                fpath = backup.get_backup_path(req["filename"])
                if not fpath:
                    return jsonify({"error": "Specified backup file does not exist"}), 404
                with open(fpath, "rb") as bf:
                    content = bf.read()
                fname = req["filename"].lower()
                if fname.endswith(".tachibk") or backup.is_tachiyomi_protobuf_backup(content):
                    result = backup.restore_tachiyomi_apk_backup(content)
                    return jsonify(result)
                backup_data = backup.parse_backup_content(content)
            elif "backup_data" in req:
                backup_data = req["backup_data"]

        if not backup_data:
            return jsonify({"error": "No backup file or data provided"}), 400

        result = backup.restore_backup(backup_data, restore_settings=restore_settings)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

backup.start_auto_backup_scheduler()
library_updater.start_background_scheduler()

def create_app():
    return app


