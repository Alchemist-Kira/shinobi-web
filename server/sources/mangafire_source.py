import base64
import requests
import re
from urllib.parse import quote, urlencode
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from server.sources.base import BaseSource

# MangaFire VRF Encryption Constants (from Tachiyomi / Mihon extension)
TABLE_1 = "yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A=="
KEY_1 = "0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA="

TABLE_2 = "IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA=="
KEY_2 = "AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ=="

TABLE_3 = "NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ=="
KEY_3 = "DELOJgPsVaCcblDtTGMdHzM="

STAGES = [
    (base64.b64decode(TABLE_1), base64.b64decode(KEY_1), 0x5A),
    (base64.b64decode(TABLE_2), base64.b64decode(KEY_2), 0x35),
    (base64.b64decode(TABLE_3), base64.b64decode(KEY_3), 0xBA)
]

def _encrypt_stage(data: bytearray, table: bytes, key: bytes, iv: int) -> bytearray:
    out = bytearray(len(data))
    prev = iv
    key_size = len(key)
    for i in range(len(data)):
        prev = table[(data[i] ^ key[i % key_size] ^ prev) & 0xFF]
        out[i] = prev
    return out

def _vrf_sign(path: str) -> str:
    data = bytearray(path.encode('utf-8'))
    for table, key, iv in STAGES:
        data = _encrypt_stage(data, table, key, iv)
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


class MangaFireSource(BaseSource):
    BASE_URL = "https://mangafire.to"

    @property
    def id(self) -> str:
        return "mangafire"

    @property
    def name(self) -> str:
        return "MangaFire"

    @property
    def version(self) -> str:
        return "2.0.0"

    @property
    def icon_url(self) -> str:
        return "https://mangafire.to/assets/mangafire/favicon.svg"

    @property
    def supports_latest(self) -> bool:
        return True

    def _call_api(self, endpoint: str, params: list = None) -> dict:
        params = params or []
        params_sorted = sorted(params, key=lambda x: x[0])
        sub_path = endpoint.replace("/api", "")

        query_parts = []
        last_key = ""
        idx = 0
        for k, v in params_sorted:
            new_k = k
            if k.endswith("[]"):
                if last_key != k:
                    idx = 0
                last_key = k
                new_k = k.replace("[]", f"[{idx}]")
                idx += 1
            query_parts.append(f"{new_k}={v}")

        path_to_sign = sub_path + ("?" + "&".join(query_parts) if query_parts else "")
        vrf = _vrf_sign(path_to_sign)

        url = f"{self.BASE_URL}{endpoint}"
        if params:
            url += "?" + urlencode(params) + f"&vrf={quote(vrf)}"
        else:
            url += f"?vrf={quote(vrf)}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://mangafire.to/",
            "Accept": "application/json"
        }

        r = requests.get(url, headers=headers, timeout=12)
        if r.status_code == 200:
            return r.json()
        return {}

    def _extract_hid(self, manga_id: str) -> str:
        raw = manga_id.replace("mangafire_", "").strip()
        if "-" in raw:
            candidate = raw.split("-")[0]
            if len(candidate) <= 10:
                return candidate
        return raw

    @staticmethod
    def _clean_synopsis(synopsis_html: str) -> str:
        if not synopsis_html:
            return ""
        h = re.sub(r'<br\s*/?>', '\n', synopsis_html, flags=re.I)
        h = re.sub(r'</(p|div|li|h[1-6])>', '\n', h, flags=re.I)
        soup = BeautifulSoup(h, "html.parser")
        text = soup.get_text()
        lines = [line.strip() for line in text.split("\n")]
        reconnected = []
        for line in lines:
            if not line:
                if reconnected and reconnected[-1] != "":
                    reconnected.append("")
                continue
            if line in (",", ";", ":", ")") and reconnected and reconnected[-1] != "":
                reconnected[-1] = reconnected[-1] + line
            else:
                reconnected.append(line)
        cleaned = "\n".join(reconnected)
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
        return cleaned


    def get_filters(self) -> list:
        return [
            {
                "id": "sort",
                "name": "Sort by",
                "type": "select",
                "values": [
                    "Best match", "Most viewed · 30 days", "Most viewed · all time",
                    "Latest update", "Recently added", "Highest rated",
                    "Title (A–Z)", "Title (Z–A)", "Most followed"
                ],
                "keys": [
                    "relevance:desc", "views_30d:desc", "views_total:desc",
                    "chapter_updated_at:desc", "created_at:desc", "score:desc",
                    "title:asc", "title:desc", "follows_total:desc"
                ],
                "default": "relevance:desc"
            },
            {
                "id": "types",
                "name": "Type",
                "type": "group",
                "state": [
                    {"type": "checkbox", "id": "manga", "name": "Manga", "state": False, "default": False},
                    {"type": "checkbox", "id": "manhwa", "name": "Manhwa", "state": False, "default": False},
                    {"type": "checkbox", "id": "manhua", "name": "Manhua", "state": False, "default": False}
                ]
            },
            {
                "id": "genres",
                "name": "Genres",
                "type": "group",
                "state": [
                    {"type": "tristate", "id": "1", "name": "Action", "state": 0, "default": 0},
                    {"type": "tristate", "id": "78", "name": "Adventure", "state": 0, "default": 0},
                    {"type": "tristate", "id": "5", "name": "Comedy", "state": 0, "default": 0},
                    {"type": "tristate", "id": "268921", "name": "Crime", "state": 0, "default": 0},
                    {"type": "tristate", "id": "6", "name": "Drama", "state": 0, "default": 0},
                    {"type": "tristate", "id": "79", "name": "Fantasy", "state": 0, "default": 0},
                    {"type": "tristate", "id": "268922", "name": "Historical", "state": 0, "default": 0},
                    {"type": "tristate", "id": "530", "name": "Horror", "state": 0, "default": 0},
                    {"type": "tristate", "id": "13", "name": "Isekai", "state": 0, "default": 0},
                    {"type": "tristate", "id": "539", "name": "Magic", "state": 0, "default": 0},
                    {"type": "tristate", "id": "534", "name": "Martial Arts", "state": 0, "default": 0},
                    {"type": "tristate", "id": "22", "name": "Mystery", "state": 0, "default": 0},
                    {"type": "tristate", "id": "536", "name": "Psychological", "state": 0, "default": 0},
                    {"type": "tristate", "id": "26", "name": "Romance", "state": 0, "default": 0},
                    {"type": "tristate", "id": "28", "name": "Sci-Fi", "state": 0, "default": 0},
                    {"type": "tristate", "id": "538", "name": "Slice of Life", "state": 0, "default": 0},
                    {"type": "tristate", "id": "34", "name": "Sports", "state": 0, "default": 0},
                    {"type": "tristate", "id": "76", "name": "Supernatural", "state": 0, "default": 0},
                    {"type": "tristate", "id": "38", "name": "Thriller", "state": 0, "default": 0},
                    {"type": "tristate", "id": "268927", "name": "Tragedy", "state": 0, "default": 0}
                ]
            },
            {
                "id": "status",
                "name": "Status",
                "type": "select",
                "values": ["All", "Releasing", "Completed", "On Hiatus"],
                "keys": ["all", "releasing", "finished", "on_hiatus"],
                "default": "all"
            }
        ]

    def _format_items(self, api_items: list) -> list:
        items = []
        for it in api_items:
            hid = it.get("hid")
            if not hid:
                continue
            slug = it.get("slug")
            manga_id = f"mangafire_{hid}-{slug}" if slug else f"mangafire_{hid}"
            title = it.get("title") or (slug.replace("-", " ").title() if slug else "Unknown")
            poster = it.get("poster") or {}
            cover = poster.get("large") or poster.get("medium") or poster.get("small") or ""
            cover_proxy = f"/api/proxy/image?url={quote(cover)}&referer={quote('https://mangafire.to/')}" if cover else "/static/img/default-cover.png"

            items.append({
                "id": manga_id,
                "source": "mangafire",
                "source_name": "MangaFire",
                "title": title,
                "cover_url": cover_proxy,
                "status": "Ongoing",
                "chapter_count": 0
            })
        return items

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        params = [
            ("content_rating[]", "safe"),
            ("content_rating[]", "suggestive"),
            ("limit", str(max(24, limit))),
            ("order[views_30d]", "desc"),
            ("page", str(page))
        ]
        data = self._call_api("/api/titles", params)
        items = self._format_items(data.get("items", []))
        meta = data.get("meta") or {}
        has_next = meta.get("hasNext", True)
        total = meta.get("lastPage", page + (1 if has_next else 0)) * limit

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items[:limit]
        }

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        params = [
            ("content_rating[]", "safe"),
            ("content_rating[]", "suggestive"),
            ("limit", str(max(24, limit))),
            ("order[chapter_updated_at]", "desc"),
            ("page", str(page))
        ]
        data = self._call_api("/api/titles", params)
        items = self._format_items(data.get("items", []))
        meta = data.get("meta") or {}
        has_next = meta.get("hasNext", True)
        total = meta.get("lastPage", page + (1 if has_next else 0)) * limit

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items[:limit]
        }

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        q = (query or "").strip()
        params = [
            ("content_rating[]", "safe"),
            ("content_rating[]", "suggestive"),
            ("limit", str(max(24, limit))),
            ("page", str(page))
        ]

        # Sorting
        sort_val = kwargs.get("sort") or kwargs.get("order")
        if not sort_val:
            sort_val = "relevance:desc" if q else "views_30d:desc"
        if ":" in str(sort_val):
            sort_field, sort_dir = str(sort_val).split(":", 1)
            params.append((f"order[{sort_field}]", sort_dir))
        elif sort_val == "most_viewed":
            params.append(("order[views_30d]", "desc"))
        elif sort_val == "recently_updated" or sort_val == "latest":
            params.append(("order[chapter_updated_at]", "desc"))
        else:
            params.append(("order[relevance]", "desc"))

        if q:
            params.append(("keyword", q))

        # Types filter
        types = kwargs.get("types") or kwargs.get("type")
        if isinstance(types, list):
            for t in types:
                if t: params.append(("types[]", str(t).lower()))
        elif isinstance(types, str) and types and types != "all":
            params.append(("types[]", types.lower()))

        # Genres filter
        genres_in = kwargs.get("genres_in") or kwargs.get("genre") or kwargs.get("genres")
        if isinstance(genres_in, list):
            for g in genres_in:
                if g: params.append(("genres_in[]", str(g)))
        elif isinstance(genres_in, str) and genres_in and genres_in != "all":
            params.append(("genres_in[]", genres_in))

        genres_ex = kwargs.get("genres_ex")
        if isinstance(genres_ex, list):
            for g in genres_ex:
                if g: params.append(("genres_ex[]", str(g)))

        # Status filter
        status = kwargs.get("status") or kwargs.get("statuses")
        if isinstance(status, list):
            for st in status:
                if st and st != "all": params.append(("statuses[]", str(st).lower()))
        elif isinstance(status, str) and status and status != "all":
            params.append(("statuses[]", status.lower()))

        data = self._call_api("/api/titles", params)
        items = self._format_items(data.get("items", []))
        meta = data.get("meta") or {}
        has_next = meta.get("hasNext", False)
        total = meta.get("lastPage", page + (1 if has_next else 0)) * limit if items else len(items)

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items[:limit]
        }

    def get_details(self, manga_id: str) -> dict:
        hid = self._extract_hid(manga_id)
        data = self._call_api(f"/api/titles/{hid}")
        m_data = data.get("data")

        # If not found directly, try to search by keyword to resolve hid
        if not m_data:
            clean_q = manga_id.replace("mangafire_", "").replace("-", " ")
            s_data = self._call_api("/api/titles", [("keyword", clean_q), ("limit", "5"), ("page", "1")])
            s_items = s_data.get("items", [])
            if s_items:
                resolved_hid = s_items[0].get("hid")
                if resolved_hid:
                    hid = resolved_hid
                    data = self._call_api(f"/api/titles/{hid}")
                    m_data = data.get("data")

        if not m_data:
            return None

        title = m_data.get("title") or "Unknown"
        poster = m_data.get("poster") or {}
        cover = poster.get("large") or poster.get("medium") or poster.get("small") or ""
        cover_proxy = f"/api/proxy/image?url={quote(cover)}&referer={quote('https://mangafire.to/')}" if cover else "/static/img/default-cover.png"

        authors = [a.get("title") for a in m_data.get("authors", []) if a.get("title")]
        artists = [a.get("title") for a in m_data.get("artists", []) if a.get("title")]
        genres = [g.get("title") for g in (m_data.get("genres", []) + m_data.get("themes", [])) if g.get("title")]

        synopsis_html = m_data.get("synopsisHtml") or ""
        desc = self._clean_synopsis(synopsis_html)

        raw_status = (m_data.get("status") or "").lower()
        status_map = {
            "releasing": "Ongoing",
            "finished": "Completed",
            "on_hiatus": "On Hiatus",
            "discontinued": "Cancelled"
        }
        status = status_map.get(raw_status, "Ongoing")

        return {
            "id": manga_id,
            "source": "mangafire",
            "source_name": "MangaFire",
            "title": title,
            "cover_url": cover_proxy,
            "description": desc,
            "summary": desc,
            "author": ", ".join(authors),
            "artist": ", ".join(artists),
            "genres": genres,
            "status": status,
            "chapter_count": 0
        }

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0) -> list:
        hid = self._extract_hid(manga_id)
        chapters = []
        page = 1

        while len(chapters) < limit:
            params = [
                ("language", "en"),
                ("limit", "100"),
                ("order", "desc"),
                ("page", str(page)),
                ("sort", "number")
            ]
            data = self._call_api(f"/api/titles/{hid}/chapters", params)
            items = data.get("items", [])
            if not items:
                # If first page failed, resolve hid via keyword
                if page == 1:
                    clean_q = manga_id.replace("mangafire_", "").replace("-", " ")
                    s_data = self._call_api("/api/titles", [("keyword", clean_q), ("limit", "5"), ("page", "1")])
                    s_items = s_data.get("items", [])
                    if s_items and s_items[0].get("hid") and s_items[0]["hid"] != hid:
                        hid = s_items[0]["hid"]
                        continue
                break

            for c in items:
                ch_id = c.get("id")
                if not ch_id:
                    continue
                ch_num = float(c.get("number") or 0)
                ch_name = (c.get("name") or "").strip()
                ch_title = f"Chapter {c.get('number')}"
                if ch_name:
                    ch_title += f": {ch_name}"

                scanlator = (c.get("type") or c.get("scanlator") or "unofficial").strip().lower()
                created_at = c.get("createdAt") or c.get("updatedAt") or 0
                rel_date = ""
                if created_at:
                    try:
                        ts = int(created_at)
                        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                        rel_date = dt.strftime("%d/%m/%Y")
                    except Exception:
                        rel_date = ""

                chapters.append({
                    "id": f"mangafire_ch_{ch_id}",
                    "manga_id": manga_id,
                    "chapter_number": ch_num,
                    "title": ch_title,
                    "url": f"/api/sources/mangafire/chapter/mangafire_ch_{ch_id}/pages",
                    "date_upload": created_at,
                    "release_date": rel_date,
                    "scanlator": scanlator
                })

            meta = data.get("meta") or {}
            last_page = meta.get("lastPage", 1)
            if page >= last_page or not meta.get("hasNext", False):
                break
            page += 1

        return chapters[offset: offset + limit]

    def get_chapter_pages(self, chapter_id: str) -> list:
        raw_id = chapter_id.replace("mangafire_ch_", "").split("-")[0]
        data = self._call_api(f"/api/chapters/{raw_id}")
        pages = data.get("data", {}).get("pages", [])
        page_urls = []

        for p in pages:
            url = p.get("url")
            if url:
                page_urls.append(f"/api/proxy/image?url={quote(url)}&referer={quote('https://mangafire.to/')}")

        return page_urls
