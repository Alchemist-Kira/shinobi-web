import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import quote
from server.sources.base import BaseSource

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://mangapill.com/"
}

class MangaPillSource(BaseSource):
    @property
    def id(self) -> str:
        return "mangapill"

    @property
    def name(self) -> str:
        return "MangaPill"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def icon_url(self) -> str:
        return "https://mangapill.com/static/favicon/favicon.ico"

    def _clean_id(self, href: str) -> str:
        # e.g. /manga/2/one-piece -> 2/one-piece
        return href.replace("/manga/", "").strip("/")

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        q = (query or "").strip()
        url = f"https://mangapill.com/search?q={quote(q)}&page={page}" if q else f"https://mangapill.com/search?page={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return {"items": [], "total": 0, "has_more": False}

            soup = BeautifulSoup(resp.text, "html.parser")
            items = []
            
            # Cards are in container with links
            manga_links = soup.select("a[href^='/manga/']")
            seen_ids = set()
            for a in manga_links:
                href = a.get("href", "")
                m_id = self._clean_id(href)
                if not m_id or m_id in seen_ids:
                    continue
                
                title = a.text.strip()
                parent = a.find_parent("div")
                img = parent.select_one("img") if parent else None
                cover = img.get("data-src") or img.get("src") if img else None
                
                # Sometimes the first <a> is empty (the image wrapper) and the next <a> has the title
                if not title:
                    sibling_title = parent.select_one("a.my-3, div a") if parent else None
                    if sibling_title and sibling_title.text.strip():
                        title = sibling_title.text.strip()
                    else:
                        title = m_id.split("/")[-1].replace("-", " ").title()

                seen_ids.add(m_id)
                items.append({
                    "id": f"mangapill_{m_id.replace('/', '_')}",
                    "raw_id": m_id,
                    "source": "mangapill",
                    "source_name": "MangaPill",
                    "title": title,
                    "cover_url": f"/api/proxy/image?url={quote(cover)}" if cover else "/static/img/default-cover.png",
                    "summary": "",
                    "genres": [],
                    "status": "Ongoing"
                })

            return {
                "items": items[:limit],
                "total": len(items),
                "has_more": len(items) >= limit
            }
        except Exception as e:
            print("MangaPill search error:", e)
            return {"items": [], "total": 0, "has_more": False}

    def get_filters(self) -> list:
        return [
            {
                "id": "type",
                "name": "Type",
                "type": "select",
                "values": ["All", "Manga", "Novel", "One-Shot", "Doujinshi", "Manhua"],
                "keys": ["", "manga", "novel", "one-shot", "doujinshi", "manhua"],
                "default": ""
            },
            {
                "id": "status",
                "name": "Status",
                "type": "select",
                "values": ["All", "Publishing", "Finished", "On Hiatus", "Discontinued"],
                "keys": ["", "publishing", "finished", "on hiatus", "discontinued"],
                "default": ""
            }
        ]

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        url = f"https://mangapill.com/search?page={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return {"items": [], "total": 0, "has_more": False}

            soup = BeautifulSoup(resp.text, "html.parser")
            items = []
            seen_ids = set()
            for a in soup.select("a[href^='/manga/']"):
                href = a.get("href", "")
                m_id = self._clean_id(href)
                if not m_id or m_id in seen_ids:
                    continue

                title = a.text.strip()
                parent = a.find_parent("div")
                img = parent.select_one("img") if parent else None
                cover = img.get("data-src") or img.get("src") if img else None

                if not title:
                    sibling = parent.select_one("a.line-clamp-2, a.my-3") if parent else None
                    if sibling and sibling.text.strip():
                        title = sibling.text.strip()
                    else:
                        title = m_id.split("/")[-1].replace("-", " ").title()

                seen_ids.add(m_id)
                items.append({
                    "id": f"mangapill_{m_id.replace('/', '_')}",
                    "raw_id": m_id,
                    "source": "mangapill",
                    "source_name": "MangaPill",
                    "title": title,
                    "cover_url": f"/api/proxy/image?url={quote(cover)}" if cover else "/static/img/default-cover.png",
                    "summary": "",
                    "genres": [],
                    "status": "Ongoing"
                })

            return {
                "items": items[:limit],
                "total": max(100, page * limit + 24),
                "page": page,
                "limit": limit,
                "has_more": len(items) >= limit
            }
        except Exception as e:
            print("MangaPill get_latest error:", e)
            return {"items": [], "total": 0, "has_more": False}

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        if kwargs.get("sort") == "latest" or kwargs.get("order") == "latest":
            return self.get_latest(page=page, limit=limit, **kwargs)
        try:
            resp = requests.get("https://mangapill.com/", headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return {"items": [], "total": 0, "has_more": False}

            soup = BeautifulSoup(resp.text, "html.parser")
            items = []
            seen_ids = set()
            for a in soup.select("a[href^='/manga/']"):
                href = a.get("href", "")
                m_id = self._clean_id(href)
                if not m_id or m_id in seen_ids:
                    continue
                
                title = a.text.strip()
                parent = a.find_parent("div")
                img = parent.select_one("img") if parent else None
                cover = img.get("data-src") or img.get("src") if img else None
                
                if not title:
                    sibling = parent.select_one("a.line-clamp-2, a.my-3") if parent else None
                    if sibling and sibling.text.strip():
                        title = sibling.text.strip()
                    else:
                        title = m_id.split("/")[-1].replace("-", " ").title()

                seen_ids.add(m_id)
                items.append({
                    "id": f"mangapill_{m_id.replace('/', '_')}",
                    "raw_id": m_id,
                    "source": "mangapill",
                    "source_name": "MangaPill",
                    "title": title,
                    "cover_url": f"/api/proxy/image?url={quote(cover)}" if cover else "/static/img/default-cover.png",
                    "summary": "",
                    "genres": [],
                    "status": "Ongoing"
                })

            return {
                "items": items[:limit],
                "total": len(items),
                "has_more": False
            }
        except Exception as e:
            print("MangaPill get_popular error:", e)
            return {"items": [], "total": 0, "has_more": False}

    def get_details(self, manga_id: str) -> dict:
        raw_id = manga_id.replace("mangapill_", "").replace("_", "/")
        url = f"https://mangapill.com/manga/{raw_id}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return {}

            soup = BeautifulSoup(resp.text, "html.parser")
            h1 = soup.select_one("h1")
            title = h1.text.strip() if h1 else raw_id.split("/")[-1].replace("-", " ").title()

            img = soup.select_one("img[data-src], img[src*='file/mangapill']")
            cover = img.get("data-src") or img.get("src") if img else None

            # Summary
            p_desc = soup.select_one("p.text-sm.text-secondary") or soup.select_one(".description")
            summary = p_desc.text.strip() if p_desc else ""

            # Genres
            genres = [g.text.strip() for g in soup.select("a[href^='/genre/'], a[href*='genre']") if g.text.strip()]

            # Status
            status = "Ongoing"
            for div in soup.select("div.text-sm"):
                if "status" in div.text.lower():
                    status = div.text.split(":")[-1].strip()

            # Chapters
            chapters = self.get_chapters(manga_id)

            return {
                "id": manga_id,
                "raw_id": raw_id,
                "source": "mangapill",
                "source_name": "MangaPill",
                "title": title,
                "cover_url": f"/api/proxy/image?url={quote(cover)}" if cover else "/static/img/default-cover.png",
                "summary": summary,
                "genres": genres,
                "status": status,
                "chapters": chapters
            }
        except Exception as e:
            print("MangaPill get_details error:", e)
            return {}

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0) -> list:
        raw_id = manga_id.replace("mangapill_", "").replace("_", "/")
        url = f"https://mangapill.com/manga/{raw_id}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return []

            soup = BeautifulSoup(resp.text, "html.parser")
            chap_links = soup.select("a[href^='/chapters/']")
            chapters = []
            for i, a in enumerate(chap_links):
                href = a.get("href", "")
                c_id = href.replace("/chapters/", "").strip("/")
                ch_title = a.text.strip()
                
                # Extract chapter number
                num_match = re.search(r"chapter\s*([\d\.]+)", ch_title, re.IGNORECASE)
                ch_num = num_match.group(1) if num_match else str(len(chap_links) - i)

                chapters.append({
                    "id": f"mangapill_{c_id}",
                    "raw_id": c_id,
                    "title": ch_title,
                    "chapter_number": ch_num,
                    "release_date": "",
                    "scanlator": "MangaPill",
                    "source": "mangapill"
                })

            return chapters[offset:offset + limit]
        except Exception as e:
            print("MangaPill get_chapters error:", e)
            return []

    def get_chapter_pages(self, chapter_id: str) -> list:
        raw_id = chapter_id.replace("mangapill_", "")
        url = f"https://mangapill.com/chapters/{raw_id}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                return []

            soup = BeautifulSoup(resp.text, "html.parser")
            imgs = soup.select("img[data-src], img.reader-img")
            pages = []
            for img in imgs:
                src = img.get("data-src") or img.get("src")
                if src:
                    proxied = f"/api/proxy/image?url={quote(src)}&referer={quote('https://mangapill.com/')}"
                    pages.append(proxied)

            return pages
        except Exception as e:
            print("MangaPill get_chapter_pages error:", e)
            return []
