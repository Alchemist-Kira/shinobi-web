import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import quote
from server.sources.base import BaseSource

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://asurascans.com/"
}

ASURA_DOMAIN = "https://asurascans.com"
ASURA_API_URL = "https://api.asurascans.com/api"

SESSION = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=1)
SESSION.mount("https://", _adapter)
SESSION.mount("http://", _adapter)

ASURA_GENRES = [
    ("Action", "action"),
    ("Adventure", "adventure"),
    ("Comedy", "comedy"),
    ("Crazy MC", "crazy-mc"),
    ("Dark Fantasy", "dark-fantasy"),
    ("Demon", "demon"),
    ("Drama", "drama"),
    ("Dungeons", "dungeons"),
    ("Fantasy", "fantasy"),
    ("Game", "game"),
    ("Genius MC", "genius-mc"),
    ("Isekai", "isekai"),
    ("Magic", "magic"),
    ("Martial Arts", "martial-arts"),
    ("Murim", "murim"),
    ("Mystery", "mystery"),
    ("Necromancer", "necromancer"),
    ("Overpowered", "overpowered"),
    ("Psychological", "psychological"),
    ("Regression", "regression"),
    ("Reincarnation", "reincarnation"),
    ("Revenge", "revenge"),
    ("Romance", "romance"),
    ("School Life", "school-life"),
    ("Sci-fi", "sci-fi"),
    ("Shoujo", "shoujo"),
    ("Shounen", "shounen"),
    ("Slice of Life", "slice-of-life"),
    ("Supernatural", "supernatural"),
    ("System", "system"),
    ("Tower", "tower"),
    ("Tragedy", "tragedy"),
    ("Transmigration", "transmigration"),
    ("Villain", "villain"),
    ("Violence", "violence")
]

class AsuraScansSource(BaseSource):
    @property
    def id(self) -> str:
        return "asurascans"

    @property
    def name(self) -> str:
        return "Asura Scans"

    @property
    def version(self) -> str:
        return "1.6.69"

    @property
    def icon_url(self) -> str:
        return "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/en/asurascans/res/mipmap-xhdpi/ic_launcher.png"

    def _extract_title(self, raw_text: str) -> str:
        clean = re.sub(r'^\d+(\.\d+)?', '', (raw_text or '').strip()).strip()
        return clean or "Untitled Manhwa"

    def _clean_summary(self, html_text: str) -> str:
        if not html_text:
            return ""
        clean = re.sub(r'<[^>]+>', ' ', html_text)
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean

    def get_filters(self) -> list:
        return [
            {
                "id": "sort",
                "name": "Sort By",
                "type": "select",
                "values": ["Popular", "Latest Update", "Rating", "Title (A-Z)", "Newest"],
                "keys": ["popular", "latest", "rating", "title", "update"],
                "default": "popular"
            },
            {
                "id": "status",
                "name": "Status",
                "type": "select",
                "values": ["All", "Ongoing", "Completed", "Hiatus", "Dropped", "Axed"],
                "keys": ["", "ongoing", "completed", "hiatus", "dropped", "axed"],
                "default": ""
            },
            {
                "id": "type",
                "name": "Type",
                "type": "select",
                "values": ["All", "Manhwa", "Manhua", "Manga"],
                "keys": ["", "manhwa", "manhua", "manga"],
                "default": ""
            },
            {
                "id": "genres",
                "name": "Genres",
                "type": "group",
                "state": [
                    {"type": "tristate", "id": slug, "name": name, "state": 0, "default": 0}
                    for name, slug in ASURA_GENRES
                ]
            },
            {
                "id": "min_chapters",
                "name": "Min Chapters",
                "type": "text",
                "placeholder": "e.g. 10",
                "default": ""
            }
        ]

    def _fetch_series_api(self, page: int = 1, limit: int = 24, search: str = "",
                           sort: str = "popular", order: str = "desc",
                           status: str = "", type_: str = "", genres: str = "",
                           min_chapters: str = "") -> dict:
        try:
            offset = max(0, (page - 1) * limit)
            params = {
                "limit": limit,
                "offset": offset
            }

            if search:
                params["search"] = search
            if sort:
                params["sort"] = sort
            if order:
                params["order"] = order
            if status and status != "all":
                params["status"] = status
            if type_ and type_ != "all":
                params["type"] = type_
            if genres and genres not in ("all", "All Genres"):
                params["genres"] = genres
            if min_chapters:
                params["min_chapters"] = min_chapters

            resp = SESSION.get(f"{ASURA_API_URL}/series", headers=HEADERS, params=params, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                series_list = data.get("data", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                meta = data.get("meta", {}) if isinstance(data, dict) else {}
                total = meta.get("total") or len(series_list)

                items = []
                seen = set()

                for it in series_list:
                    slug = it.get("slug") or str(it.get("id"))
                    public_url = it.get("public_url") or f"/comics/{slug}"
                    raw_id = public_url.replace("/comics/", "").strip("/")
                    if not raw_id:
                        raw_id = slug
                    if raw_id in seen:
                        continue
                    seen.add(raw_id)

                    title = it.get("title") or self._extract_title(slug.replace("-", " ").title())
                    cover = it.get("cover") or it.get("thumbnail") or ""

                    genres_raw = it.get("genres", [])
                    if isinstance(genres_raw, list):
                        genre_names = [g.get("name") if isinstance(g, dict) else str(g) for g in genres_raw]
                    else:
                        genre_names = ["Action", "Manhwa", "Fantasy"]

                    summary = self._clean_summary(it.get("description") or "")
                    ch_count = it.get("chapter_count", 0)

                    items.append({
                        "id": f"asura_{raw_id}",
                        "raw_id": raw_id,
                        "source": "asurascans",
                        "source_name": "Asura Scans",
                        "title": title,
                        "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(ASURA_DOMAIN + '/')}" if cover else "/static/img/default-cover.png",
                        "summary": summary,
                        "genres": genre_names,
                        "status": (it.get("status") or "Ongoing").title(),
                        "chapter_count": ch_count
                    })

                return {
                    "items": items,
                    "total": total,
                    "page": page,
                    "limit": limit
                }
        except Exception as e:
            print("Asura API error:", e)

        # Fallback to web scrape if API is temporarily unavailable
        return self._fetch_web_fallback(page=page, limit=limit, sort=sort, search=search)

    def _fetch_web_fallback(self, page: int = 1, limit: int = 24, sort: str = "popular", search: str = "") -> dict:
        try:
            url = f"{ASURA_DOMAIN}/browse/comics"
            r = SESSION.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                r = SESSION.get(ASURA_DOMAIN, headers=HEADERS, timeout=12)
                if r.status_code != 200:
                    return {"items": [], "total": 0, "page": page, "limit": limit}
            r.encoding = "utf-8"

            soup = BeautifulSoup(r.text, "html.parser")
            items = []
            seen = set()
            q_lower = search.lower().strip() if search else ""

            for a in soup.select("a[href*='/comics/']"):
                href = a.get("href", "")
                if "/chapter/" in href:
                    continue
                m_id = href.replace("/comics/", "").strip("/")
                if not m_id or m_id in seen:
                    continue

                raw_title = a.text.strip()
                title = self._extract_title(raw_title)

                img = a.select_one("img") or (a.parent and a.parent.select_one("img"))
                cover = img.get("src") or img.get("data-src") if img else None

                if (not title or title == "Untitled Manhwa") and a.parent:
                    t_el = a.parent.select_one("h3, h4, span, div")
                    if t_el:
                        title = self._extract_title(t_el.text.strip())

                if not title or title == "Untitled Manhwa":
                    slug_clean = re.sub(r'-[a-f0-9]{6,}$', '', m_id)
                    title = slug_clean.replace("-", " ").title()

                if q_lower and (q_lower not in title.lower() and q_lower not in m_id.lower()):
                    continue

                seen.add(m_id)
                items.append({
                    "id": f"asura_{m_id}",
                    "raw_id": m_id,
                    "source": "asurascans",
                    "source_name": "Asura Scans",
                    "title": title,
                    "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(ASURA_DOMAIN + '/')}" if cover else "/static/img/default-cover.png",
                    "summary": "",
                    "genres": ["Action", "Manhwa", "Fantasy"],
                    "status": "Ongoing"
                })

            return {
                "items": items[:limit],
                "total": len(items),
                "page": page,
                "limit": limit
            }
        except Exception as e:
            print("Asura web fallback error:", e)
            return {"items": [], "total": 0, "page": page, "limit": limit}

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        sort = kwargs.get("sort") or kwargs.get("order") or "popular"
        if sort not in ["popular", "latest", "rating", "title", "update"]:
            sort = "popular"
        order = "asc" if kwargs.get("ascending") in (True, "true", "1") or kwargs.get("order") == "asc" else "desc"
        return self._fetch_series_api(page=page, limit=limit, sort=sort, order=order, **kwargs)

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        return self._fetch_series_api(page=page, limit=limit, sort="latest", order="desc", **kwargs)

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        sort = kwargs.get("sort") or kwargs.get("order") or "popular"
        if sort == "views":
            sort = "popular"
        elif sort == "alphabet":
            sort = "title"

        order = "asc" if kwargs.get("ascending") in (True, "true", "1") or kwargs.get("order") == "asc" else "desc"
        status = kwargs.get("status", "")
        if status == "all":
            status = ""
        type_ = kwargs.get("type") or kwargs.get("types", "")
        if type_ == "all":
            type_ = ""

        raw_genres = kwargs.get("genres") or kwargs.get("genre") or kwargs.get("genres_in") or ""
        if isinstance(raw_genres, list):
            genres = ",".join(raw_genres)
        else:
            genres = str(raw_genres)
        if genres in ("all", "All Genres"):
            genres = ""

        min_chapters = str(kwargs.get("min_chapters") or "")

        return self._fetch_series_api(
            page=page,
            limit=limit,
            search=(query or "").strip(),
            sort=sort,
            order=order,
            status=status,
            type_=type_,
            genres=genres,
            min_chapters=min_chapters
        )

    def get_details(self, manga_id: str) -> dict:
        raw_id = manga_id.replace("asura_", "")
        url = f"{ASURA_DOMAIN}/comics/{raw_id}"
        try:
            r = SESSION.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200 or r.url.rstrip("/") == ASURA_DOMAIN:
                # Retry without random suffix, it redirects to new random suffix
                base_slug = re.sub(r'-[a-f0-9]{6,}$', '', raw_id)
                retry_url = f"{ASURA_DOMAIN}/comics/{base_slug}"
                r = SESSION.get(retry_url, headers=HEADERS, timeout=12)
                if r.status_code != 200 or r.url.rstrip("/") == ASURA_DOMAIN:
                    fallback_title = base_slug.replace("-", " ").title()
                    return {
                        "id": manga_id,
                        "raw_id": raw_id,
                        "source": "asurascans",
                        "source_name": "Asura Scans",
                        "title": fallback_title,
                        "cover_url": "/static/img/default-cover.png",
                        "summary": "",
                        "genres": ["Action", "Fantasy", "Manhwa"],
                        "status": "Ongoing",
                        "chapters": []
                    }

            r.encoding = "utf-8"
            soup = BeautifulSoup(r.text, "html.parser")

            # Extract title
            title = ""
            for h in soup.find_all(["h1", "h2", "h3"]):
                classes = h.get("class", [])
                if "sr-only" in classes:
                    continue
                txt = h.text.strip()
                if "asura scans" in txt.lower() or "read free manga" in txt.lower():
                    continue
                if txt and len(txt) > 1:
                    title = self._extract_title(txt)
                    break

            if not title or title == "Untitled Manhwa":
                slug_clean = re.sub(r'-[a-f0-9]{6,}$', '', raw_id)
                title = slug_clean.replace("-", " ").title()

            img = soup.select_one("img[src*='asura-images/covers'], img[alt*='poster'], img[src*='covers']")
            cover = img.get("src") if img else None

            # Synopsis
            summary_paras = []
            for p in soup.find_all("p"):
                txt = p.text.strip()
                if len(txt) > 25 and not any(k in txt.lower() for k in ["cookie", "rights reserved", "asura scans", "advertisement"]):
                    summary_paras.append(txt)
            summary = "\n\n".join(summary_paras[:4]) if summary_paras else ""

            # Genres
            genres = []
            for g in soup.select("a[href*='/genres/'], a[class*='border-white/5']"):
                gt = g.text.strip()
                if gt and gt not in genres and len(gt) < 25:
                    genres.append(gt)
            if not genres:
                genres = ["Action", "Fantasy", "Manhwa"]

            # Actual resolved public slug from final redirected URL
            final_raw_id = raw_id
            if "/comics/" in r.url:
                final_raw_id = r.url.split("/comics/")[-1].strip("/") or raw_id

            chapters = self.get_chapters(manga_id, custom_slug=final_raw_id)

            return {
                "id": manga_id,
                "raw_id": final_raw_id,
                "source": "asurascans",
                "source_name": "Asura Scans",
                "title": title,
                "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(ASURA_DOMAIN + '/')}" if cover else "/static/img/default-cover.png",
                "summary": summary,
                "genres": genres,
                "status": "Ongoing",
                "chapters": chapters
            }
        except Exception as e:
            print("Asura get_details error:", e)
            return {}

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0, custom_slug: str = "") -> list:
        raw_id = custom_slug or manga_id.replace("asura_", "")
        url = f"{ASURA_DOMAIN}/comics/{raw_id}"
        try:
            r = SESSION.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200 or r.url.rstrip("/") == ASURA_DOMAIN:
                base_slug = re.sub(r'-[a-f0-9]{6,}$', '', raw_id)
                retry_url = f"{ASURA_DOMAIN}/comics/{base_slug}"
                r = SESSION.get(retry_url, headers=HEADERS, timeout=12)
                if r.status_code != 200 or r.url.rstrip("/") == ASURA_DOMAIN:
                    return []

            r.encoding = "utf-8"
            soup = BeautifulSoup(r.text, "html.parser")
            ch_links = soup.select("a[href*='/chapter/']")
            chapters = []
            seen = set()

            clean_base = re.sub(r'-[a-f0-9]{6,}$', '', raw_id)

            for a in ch_links:
                href = a.get("href", "")
                if href in seen:
                    continue
                # Ensure chapter link belongs to this comic and is not a navigation button
                if (clean_base not in href and raw_id not in href) or a.get("data-continue-link") is not None:
                    continue
                seen.add(href)

                date_el = a.select_one("span[class*='text-white/40'], span.text-sm, span[class*='text-zinc']")
                rel_date = date_el.text.strip() if date_el else ""

                title_el = a.select_one("span.font-medium, div.min-w-0 span, h3, h4")
                if title_el:
                    ch_title = title_el.text.strip()
                else:
                    ch_title = a.text.strip()
                    if rel_date and ch_title.endswith(rel_date):
                        ch_title = ch_title[:-len(rel_date)].strip()

                num_m = re.search(r'/chapter/([\d\.]+)', href)
                if not num_m:
                    num_m = re.search(r"chapter\s*([\d\.]+)", ch_title, re.IGNORECASE)
                ch_num = num_m.group(1) if num_m else "1"

                ch_slug = href.replace("/comics/", "").strip("/")

                chapters.append({
                    "id": f"asura_ch_{ch_slug.replace('/', '_')}",
                    "raw_id": ch_slug,
                    "title": ch_title,
                    "chapter_number": ch_num,
                    "release_date": rel_date,
                    "scanlator": "Asura Scans",
                    "source": "asurascans"
                })

            return chapters[offset:offset + limit]
        except Exception as e:
            print("Asura get_chapters error:", e)
            return []

    def get_chapter_pages(self, chapter_id: str) -> list:
        raw_slug = chapter_id.replace("asura_ch_", "").replace("_", "/")
        url = f"{ASURA_DOMAIN}/comics/{raw_slug}"
        try:
            r = SESSION.get(url, headers=HEADERS, timeout=12)
            if r.status_code != 200:
                return []

            soup = BeautifulSoup(r.text, "html.parser")
            imgs = [
                img.get("src") for img in soup.select("img")
                if img.get("src") and ("asura-images/chapters" in img.get("src") or "chapter" in img.get("src") or "storage" in img.get("src"))
                and "covers" not in img.get("src")
            ]
            
            pages = []
            for im in imgs:
                pages.append(f"/api/proxy/image?url={quote(im)}&referer={quote(ASURA_DOMAIN + '/')}")
            return pages
        except Exception as e:
            print("Asura get_chapter_pages error:", e)
            return []
