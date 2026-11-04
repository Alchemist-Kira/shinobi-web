import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import quote
from server.sources.base import BaseSource

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://manga18fx.com/"
}

class Manga18Source(BaseSource):
    BASE_URL = "https://manga18fx.com"

    @property
    def id(self) -> str:
        return "manga18"

    @property
    def name(self) -> str:
        return "Manga18"

    @property
    def version(self) -> str:
        return "1.3.0"

    @property
    def icon_url(self) -> str:
        return "https://manga18fx.com/favicon.ico"

    def get_filters(self) -> list:
        return [
            {
                "id": "sort",
                "name": "Sort By",
                "type": "select",
                "values": ["Popular", "Latest Updates"],
                "keys": ["popular", "latest"],
                "default": "popular"
            },
            {
                "id": "genre",
                "name": "Genre",
                "type": "select",
                "values": [
                    "All", "Manhwa", "Manhua", "Uncensored Manhwa", "Drama", "Action",
                    "Romance", "Harem", "Seinen", "School Life", "Mature", "Psychological",
                    "Tragedy", "Ecchi", "Comedy", "Fantasy", "Supernatural", "Isekai",
                    "Shoujo", "Adventure", "Shounen", "Mystery", "Thriller", "Reincarnation"
                ],
                "keys": [
                    "all", "manhwa", "manhua", "uncensored-manhwa", "drama", "action",
                    "romance", "harem", "seinen", "school-life", "mature", "psychological",
                    "tragedy", "ecchi", "comedy", "fantasy", "supernatural", "isekai",
                    "shoujo", "adventure", "shounen", "mystery", "thriller", "reincarnation"
                ],
                "default": "all"
            }
        ]

    def _parse_items_from_soup(self, soup: BeautifulSoup, selector: str = ".bsx-item, .hot-item, .item, .thumb-manga") -> list:
        items = []
        seen = set()
        for item in soup.select(selector):
            a = item.select_one("a")
            img = item.select_one("img")
            if not a or not a.get("href"):
                continue

            href = a.get("href", "").strip("/")
            slug = href.split("/")[-1]
            if not slug or slug in seen:
                continue
            seen.add(slug)

            title_el = item.select_one(".manga-adult-title, .title, h3, h4")
            title = title_el.text.strip() if title_el else a.get("title", slug.replace("-", " ").title())
            cover = img.get("data-src") or img.get("src") if img else ""
            if cover and not cover.startswith("http"):
                cover = f"{self.BASE_URL}/{cover.lstrip('/')}"

            items.append({
                "id": f"manga18_{slug}",
                "source": "manga18",
                "source_name": "Manga18",
                "title": title,
                "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(self.BASE_URL)}" if cover else "/static/img/default-cover.png",
                "status": "Ongoing",
                "chapter_count": 0
            })
        return items

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        url = f"{self.BASE_URL}/page/{page}" if page > 1 else self.BASE_URL
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return {"total": 0, "page": page, "limit": limit, "items": []}

            soup = BeautifulSoup(r.text, "html.parser")
            # In page 1, hot-item are the trending/popular titles
            selector = ".trending-block .hot-item, .bsx-item" if page == 1 else ".bsx-item, .hot-item"
            items = self._parse_items_from_soup(soup, selector)

            return {
                "total": max(100, page * limit + 24),
                "page": page,
                "limit": limit,
                "items": items[:limit] if items else []
            }
        except Exception as e:
            print("Manga18 get_popular error:", e)
            return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        url = f"{self.BASE_URL}/page/{page}" if page > 1 else self.BASE_URL
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return {"total": 0, "page": page, "limit": limit, "items": []}

            soup = BeautifulSoup(r.text, "html.parser")
            # Latest updates are in the main listupd section (page-item or bsx-item)
            selector = ".listupd:not(.trending-block) .bsx-item, .page-item .bsx-item"
            items = self._parse_items_from_soup(soup, selector)
            if not items:
                items = self._parse_items_from_soup(soup, ".bsx-item")

            return {
                "total": max(100, page * limit + 24),
                "page": page,
                "limit": limit,
                "items": items[:limit] if items else []
            }
        except Exception as e:
            print("Manga18 get_latest error:", e)
            return {"total": 0, "page": page, "limit": limit, "items": []}

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        q = (query or "").strip()
        genre = kwargs.get("genre", "")

        # Check if user filtered by genre
        if genre and genre != "all":
            url = f"{self.BASE_URL}/manga-genre/{quote(genre)}"
            if page > 1:
                url += f"?page={page}"
        elif q:
            url = f"{self.BASE_URL}/search?q={quote(q)}&page={page}"
        elif kwargs.get("sort") == "latest" or kwargs.get("order") == "latest":
            return self.get_latest(page=page, limit=limit, **kwargs)
        else:
            return self.get_popular(page=page, limit=limit, **kwargs)

        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return {"total": 0, "page": page, "limit": limit, "items": []}

            soup = BeautifulSoup(r.text, "html.parser")
            items = self._parse_items_from_soup(soup, ".bsx-item, .item, .thumb-manga, .page-item")

            return {
                "total": len(items) if len(items) < limit else max(100, page * limit + 24),
                "page": page,
                "limit": limit,
                "items": items[:limit]
            }
        except Exception as e:
            print("Manga18 search error:", e)
            return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_details(self, manga_id: str) -> dict:
        slug = manga_id.replace("manga18_", "")
        url = f"{self.BASE_URL}/manga/{slug}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return None

            soup = BeautifulSoup(r.text, "html.parser")
            h1 = soup.select_one("h1")
            title = h1.text.strip() if h1 else slug.replace("-", " ").title()

            cover = ""
            img = soup.select_one(".summary_image img, .thumb-manga img, .cover img, .detail-thumb img, img[src*='webtoon'], img[data-src*='webtoon']")
            if img:
                cover = img.get("data-src") or img.get("src") or ""
            if cover and not cover.startswith("http"):
                cover = f"{self.BASE_URL}/{cover.lstrip('/')}"

            # Extract actual description from specific synopsis container (.dsct)
            summary = ""
            desc = soup.select_one(".dsct, .panel-story-info-description, .summary__content, .manga-excerpt")
            if desc:
                # Remove nested buttons, scripts, show-more links
                for el in desc.select("script, style, button, a.show-more, a[class*='more']"):
                    el.decompose()
                raw_summary = desc.get_text("\n").strip()
                # Clean up repeated title prefixes
                if raw_summary.lower().startswith(title.lower()):
                    raw_summary = raw_summary[len(title):].lstrip(" :\n-\t").strip()
                # Remove trailing Show more / Read more
                raw_summary = re.sub(r'(?i)\s*(?:Show more|Show less|Read more|Read less)\s*$', '', raw_summary).strip()
                # Ignore if matched breadcrumbs like "Home"
                if raw_summary.lower() not in ("home", "manga", "index", ""):
                    summary = raw_summary

            # Extract actual genres from the manga's detail section
            genres = []
            genre_elements = soup.select(".genres-content a, .tab-summary a[href*='/manga-genre/'], .post-content a[href*='/manga-genre/']")
            for g in genre_elements:
                txt = g.text.strip()
                if txt and txt not in genres and len(txt) < 35:
                    genres.append(txt)


            # Extract metadata (Author, Artist, Status)
            author = ""
            artist = ""
            status = "Ongoing"
            for item in soup.select(".post-content_item"):
                h = item.select_one(".summary-heading")
                c = item.select_one(".summary-content")
                if h and c:
                    ht = h.text.strip().lower()
                    ct = c.text.strip()
                    if "author" in ht:
                        author = ct
                    elif "artist" in ht:
                        artist = ct
                    elif "status" in ht:
                        status = ct

            chapters = self.get_chapters(manga_id)

            return {
                "id": f"manga18_{slug}",
                "source": "manga18",
                "source_name": "Manga18",
                "title": title,
                "summary": summary or f"Read {title} on Manga18.",
                "genres": genres,
                "author": author,
                "artist": artist,
                "status": status or "Ongoing",
                "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(self.BASE_URL)}" if cover else "/static/img/default-cover.png",
                "chapter_count": len(chapters),
                "chapters": chapters
            }
        except Exception as e:
            print("Manga18 get_details error:", e)
            return None

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0) -> list:
        slug = manga_id.replace("manga18_", "")
        url = f"{self.BASE_URL}/manga/{slug}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return []

            soup = BeautifulSoup(r.text, "html.parser")
            chapters = []
            seen_hrefs = set()

            for a in soup.find_all("a"):
                href = a.get("href", "")
                if slug in href and "chapter" in href and href not in seen_hrefs:
                    seen_hrefs.add(href)
                    raw_text = a.text.strip()
                    ch_num_match = re.search(r'(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)', raw_text, re.I)
                    if not ch_num_match:
                        ch_num_match = re.search(r'chapter-([0-9]+(?:\.[0-9]+)?)', href, re.I)

                    ch_num = float(ch_num_match.group(1)) if ch_num_match else (len(chapters) + 1.0)
                    ch_id = href.lstrip("/")

                    chapters.append({
                        "id": f"manga18_{ch_id}",
                        "source": "manga18",
                        "title": raw_text or f"Chapter {ch_num}",
                        "chapter_number": ch_num,
                        "url": href if href.startswith("http") else f"{self.BASE_URL}/{ch_id}"
                    })

            chapters.sort(key=lambda c: c["chapter_number"], reverse=True)
            return chapters
        except Exception as e:
            print("Manga18 get_chapters error:", e)
            return []

    def get_chapter_pages(self, chapter_id: str) -> list:
        clean_id = chapter_id.replace("manga18_", "")
        url = clean_id if clean_id.startswith("http") else f"{self.BASE_URL}/{clean_id.lstrip('/')}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return []

            soup = BeautifulSoup(r.text, "html.parser")
            pages = []
            for img in soup.select(".read-content img, .chapter-content img, .page-break img, .text-left img, img[data-src*='upload'], img[src*='upload']"):
                src = img.get("data-src") or img.get("src") or ""
                if src:
                    if not src.startswith("http"):
                        src = f"{self.BASE_URL}/{src.lstrip('/')}"
                    pages.append(f"/api/proxy/image?url={quote(src)}&referer={quote(self.BASE_URL)}")

            return pages
        except Exception as e:
            print("Manga18 get_chapter_pages error:", e)
            return []
