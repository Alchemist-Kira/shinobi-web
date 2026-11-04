import json
from server.sources.base import BaseSource
from server.scanner import LocalScanner
from server import db

class LocalSource(BaseSource):
    @property
    def id(self) -> str:
        return "local"

    @property
    def name(self) -> str:
        return "Local Storage"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def icon_url(self) -> str:
        return "/static/img/ic_local_source.png"

    @property
    def supports_latest(self) -> bool:
        return False

    def _get_local_folders(self):
        raw_paths = db.get_setting("local_paths", "[]")
        try:
            paths = json.loads(raw_paths)
            return [p for p in paths if not p.lower().rstrip("\\/").endswith("downloads")]
        except Exception:
            return []

    def get_all_manga(self):
        paths = self._get_local_folders()
        all_manga = []
        seen_ids = set()
        for p in paths:
            results = LocalScanner.inspect_folder(p)
            for m in results:
                if m["id"] not in seen_ids:
                    seen_ids.add(m["id"])
                    all_manga.append(m)
        return all_manga

    def search(self, query: str = "", page: int = 1, limit: int = 50, **kwargs) -> dict:
        manga_list = self.get_all_manga()
        if query and query.strip():
            q = query.strip().lower()
            manga_list = [m for m in manga_list if q in m["title"].lower() or any(q in g.lower() for g in m.get("genres", []))]
        
        offset = (page - 1) * limit
        items = manga_list[offset:offset + limit]
        return {
            "total": len(manga_list),
            "page": page,
            "limit": limit,
            "items": items
        }

    def get_popular(self, page: int = 1, limit: int = 50, **kwargs) -> dict:
        return self.search("", page, limit, **kwargs)

    def get_details(self, manga_id: str) -> dict:
        manga_list = self.get_all_manga()
        for m in manga_list:
            if m["id"] == manga_id:
                return m
        return None

    def get_chapters(self, manga_id: str, limit: int = 500, offset: int = 0) -> list:
        m = self.get_details(manga_id)
        if not m:
            return []
        chapters = m.get("chapters", [])
        return chapters[offset:offset + limit]

    def get_chapter_pages(self, chapter_id: str) -> list:
        # Find chapter across local manga
        manga_list = self.get_all_manga()
        for m in manga_list:
            for ch in m.get("chapters", []):
                if ch["id"] == chapter_id:
                    pages = LocalScanner.get_chapter_pages(ch["path"], ch.get("type", "archive"))
                    # Return API endpoints for each page
                    return [f"/api/local/chapter/{ch['id']}/page/{idx}" for idx in range(len(pages))]
        return []
