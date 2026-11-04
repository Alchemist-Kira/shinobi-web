import os
import re
import zipfile
import xml.etree.ElementTree as ET
from urllib.parse import quote

IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif')
ARCHIVE_EXTENSIONS = ('.cbz', '.zip')

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

def extract_chapter_number(name):
    # Match patterns like: Chapter 100, Ch. 100, Chapter 100.5, 100, etc.
    patterns = [
        r'Chapter\s*([0-9]+(?:\.[0-9]+)?)',
        r'Ch\.\s*([0-9]+(?:\.[0-9]+)?)',
        r'Ch\s*([0-9]+(?:\.[0-9]+)?)',
        r'#\s*([0-9]+(?:\.[0-9]+)?)',
        r'(?:^|[\s_\-\[])([0-9]+(?:\.[0-9]+)?)(?:$|[\s_\-\]\.])'
    ]
    for p in patterns:
        m = re.search(p, name, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                pass
    return 999999.0

def parse_comic_info_xml(xml_content):
    meta = {}
    try:
        root = ET.fromstring(xml_content)
        title = root.findtext('Title')
        series = root.findtext('Series')
        summary = root.findtext('Summary')
        genre = root.findtext('Genre')
        writer = root.findtext('Writer')
        penciller = root.findtext('Penciller')
        number = root.findtext('Number')
        web = root.findtext('Web')

        # Tachiyomi/Mihon specific tags
        status = None
        source = None
        for elem in root:
            if 'PublishingStatusTachiyomi' in elem.tag or 'Status' in elem.tag:
                status = elem.text
            if 'SourceMihon' in elem.tag or 'Source' in elem.tag:
                source = elem.text

        if series: meta['series'] = series.strip()
        if title: meta['title'] = title.strip()
        if summary: meta['summary'] = summary.strip()
        if genre: meta['genres'] = [g.strip() for g in genre.split(',') if g.strip()]
        if writer: meta['author'] = writer.strip()
        if penciller: meta['artist'] = penciller.strip()
        if number: meta['number'] = number.strip()
        if web: meta['web'] = web.strip()
        if status: meta['status'] = status.strip()
        if source: meta['source_name'] = source.strip()
    except Exception:
        pass
    return meta

class LocalScanner:
    @staticmethod
    def inspect_folder(folder_path):
        """
        Determines if folder_path is a single Manga folder (contains chapters)
        or a parent directory containing multiple Manga folders.
        """
        if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
            return []

        entries = os.listdir(folder_path)
        archives = [f for f in entries if f.lower().endswith(ARCHIVE_EXTENSIONS)]
        
        # If this folder directly has archive files, treat it as a single manga
        if len(archives) > 0:
            manga = LocalScanner.parse_manga_directory(folder_path)
            return [manga] if manga else []

        # Check if subfolders look like manga (contain archives or image subfolders)
        manga_list = []
        for entry in entries:
            sub_path = os.path.join(folder_path, entry)
            if os.path.isdir(sub_path):
                m = LocalScanner.parse_manga_directory(sub_path)
                if m and len(m.get('chapters', [])) > 0:
                    manga_list.append(m)

        return manga_list

    @staticmethod
    def parse_manga_directory(dir_path):
        if not os.path.exists(dir_path):
            return None

        folder_name = os.path.basename(os.path.normpath(dir_path))
        entries = os.listdir(dir_path)

        chapters = []
        comic_info = {}

        # 1. Look for .cbz or .zip files
        archive_files = [f for f in entries if f.lower().endswith(ARCHIVE_EXTENSIONS)]
        if archive_files:
            # Sort by chapter number
            archive_files.sort(key=lambda f: (extract_chapter_number(f), natural_sort_key(f)))

            for idx, arch_name in enumerate(archive_files):
                full_path = os.path.join(dir_path, arch_name)
                ch_num = extract_chapter_number(arch_name)
                ch_id = f"local_ch_{idx}_{arch_name}"

                chapters.append({
                    "id": ch_id,
                    "filename": arch_name,
                    "path": full_path,
                    "chapter_number": ch_num if ch_num != 999999.0 else (idx + 1),
                    "title": arch_name.replace('.cbz', '').replace('.zip', ''),
                    "type": "archive"
                })

            # Try to read ComicInfo from first archive or root
            if archive_files:
                first_archive_path = os.path.join(dir_path, archive_files[0])
                try:
                    with zipfile.ZipFile(first_archive_path, 'r') as zf:
                        if 'ComicInfo.xml' in zf.namelist():
                            xml_bytes = zf.read('ComicInfo.xml').decode('utf-8', errors='ignore')
                            comic_info = parse_comic_info_xml(xml_bytes)
                except Exception:
                    pass

        # 2. Look for chapter subdirectories if no archives
        if not chapters:
            subdirs = [f for f in entries if os.path.isdir(os.path.join(dir_path, f))]
            subdirs.sort(key=lambda s: (extract_chapter_number(s), natural_sort_key(s)))
            for idx, sname in enumerate(subdirs):
                ch_path = os.path.join(dir_path, sname)
                # verify it has images
                imgs = [img for img in os.listdir(ch_path) if img.lower().endswith(IMAGE_EXTENSIONS)]
                if imgs:
                    ch_num = extract_chapter_number(sname)
                    chapters.append({
                        "id": f"local_dir_{idx}_{sname}",
                        "filename": sname,
                        "path": ch_path,
                        "chapter_number": ch_num if ch_num != 999999.0 else (idx + 1),
                        "title": sname,
                        "type": "directory"
                    })

        if not chapters:
            return None

        # Determine metadata
        title = comic_info.get('series') or folder_name
        summary = comic_info.get('summary') or f"Local manga stored at {dir_path}"
        genres = comic_info.get('genres') or ["Manhwa", "Local"]
        status = comic_info.get('status') or "Completed"
        author = comic_info.get('author') or ""
        artist = comic_info.get('artist') or ""
        source_name = comic_info.get('source_name') or "Local Source"

        # Check for offline details.json or metadata.json saved during download
        for json_name in ["details.json", "metadata.json", "manga.json"]:
            jpath = os.path.join(dir_path, json_name)
            if os.path.exists(jpath):
                try:
                    import json
                    with open(jpath, "r", encoding="utf-8") as jf:
                        dj = json.load(jf)
                        if dj.get("title"): title = dj["title"]
                        if dj.get("summary"): summary = dj["summary"]
                        elif dj.get("description"): summary = dj["description"]
                        if dj.get("genres") and isinstance(dj["genres"], list): genres = dj["genres"]
                        if dj.get("status"): status = dj["status"]
                        if dj.get("author"): author = dj["author"]
                        if dj.get("artist"): artist = dj["artist"]
                        if dj.get("source_name"): source_name = dj["source_name"]
                        elif dj.get("source"): source_name = dj["source"].capitalize()
                    break
                except Exception:
                    pass

        # Unique manga ID based on path
        import hashlib
        manga_id = "local_" + hashlib.md5(dir_path.lower().encode('utf-8')).hexdigest()[:12]

        return {
            "id": manga_id,
            "source": "local",
            "source_name": source_name,
            "title": title,
            "folder_name": folder_name,
            "path": dir_path,
            "summary": summary,
            "genres": genres,
            "status": status,
            "author": author,
            "artist": artist,
            "cover_url": f"/api/local/manga/{manga_id}/cover",
            "chapter_count": len(chapters),
            "chapters": chapters
        }

    @staticmethod
    def get_chapter_pages(chapter_path, chapter_type="archive"):
        """
        Returns naturally sorted list of image file names inside chapter.
        """
        if chapter_type == "archive" or chapter_path.lower().endswith(ARCHIVE_EXTENSIONS):
            try:
                with zipfile.ZipFile(chapter_path, 'r') as zf:
                    namelist = [n for n in zf.namelist() if n.lower().endswith(IMAGE_EXTENSIONS) and not n.startswith('__MACOSX')]
                    namelist.sort(key=natural_sort_key)
                    return namelist
            except Exception as e:
                return []
        elif os.path.isdir(chapter_path):
            imgs = [f for f in os.listdir(chapter_path) if f.lower().endswith(IMAGE_EXTENSIONS)]
            imgs.sort(key=natural_sort_key)
            return imgs
        return []

    @staticmethod
    def read_page_bytes(chapter_path, page_name, chapter_type="archive"):
        """
        Reads and returns raw bytes of an image inside chapter archive or folder.
        """
        if chapter_type == "archive" or chapter_path.lower().endswith(ARCHIVE_EXTENSIONS):
            try:
                with zipfile.ZipFile(chapter_path, 'r') as zf:
                    return zf.read(page_name)
            except Exception:
                return None
        elif os.path.isdir(chapter_path):
            full_path = os.path.join(chapter_path, page_name)
            if os.path.exists(full_path):
                with open(full_path, 'rb') as f:
                    return f.read()
        return None
