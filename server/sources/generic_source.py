import os
import json
import re
import base64
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote, unquote, urlparse, parse_qs
from server.sources.base import BaseSource

EXTENSIONS_CACHE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "extensions_cache.json"
)

# In-memory URL cache to preserve exact links during runtime
_PERSISTENT_URL_CACHE = {}

INVALID_TITLES = {
    "18+", "+18", "18", "hot", "new", "raw", "up", "top", "adult", "mature",
    "colored", "color", "uncensored", "censored", "completed", "ongoing",
    "manga", "manhwa", "manhua", "comic", "comics", "webtoon", "webtoons",
    "browse", "home", "latest", "popular", "random", "bookmark", "bookmarks",
    "login", "sign in", "signin", "register", "signup", "discord", "blog",
    "recruitment", "terms", "terms of service", "first chapter", "latest chapter",
    "last chapter", "read now", "read more", "details", "view", "rating", "score", "views",
    "read", "read first", "read last", "trending", "recommended", "featured",
    "all", "genre", "genres", "telegram", "telegramgroup", "features", "changelog",
    "donate", "faq", "search", "filter", "more", "menu", "next", "prev", "previous",
    "close", "official", "contact", "support", "about", "rules", "dmca", "privacy",
    "privacy policy", "disclaimer", "rss", "feed", "vip", "premium", "free",
    "hd", "full", "scan", "scans", "translation", "translator",
    "advanced search", "advanced-search", "notification", "notifications",
    "manhwa raw", "raw", "manga list", "series list", "all chapters", "chapter list"
}

NON_MANGA_PATTERNS = [
    r'/genre/', r'/tag/', r'/category/', r'/author/', r'/user/',
    r'/login', r'/register', r'/bookmark', r'/history', r'/contact',
    r'/privacy', r'/dmca', r'/terms', r'/filter', r'/page/', r'/blog',
    r'/random', r'/recruitment', r'/info', r'/discord', r'/telegram',
    r'/features', r'/changelog', r'/donate', r'/search', r'/faq',
    r'/about', r'/rules', r'/official', r'/support', r'/feed', r'/rss',
    r'advanced-search', r'/notification', r'/notifications',
    r'/list-manga/?$', r'/manga-list/?$', r'/manhwa-raw/?$',
    r't\.me/', r'reddit\.com', r'twitter\.com', r'facebook\.com', r'patreon\.com'
]

def is_chapter_href(href: str) -> bool:
    h = href.lower()
    return bool(
        re.search(r'/(?:chapter|ch|ep|episode)[-_/]?\d+', h) or
        re.search(r'[-_/]chapter[-_]?\d+', h) or
        re.search(r'/c\d+(?:[-_.]\d+)?(?:/|$)', h)
    )

def is_valid_manga_title(t: str) -> bool:
    if not t:
        return False
    t_clean = re.sub(r'[\s\u200b\ufeff]+', ' ', t).strip()
    if len(t_clean) < 2:
        return False
    t_lower = t_clean.lower()
    if t_lower in INVALID_TITLES:
        return False
    # Reject strings with only digits/punctuation
    if re.match(r'^[\d\s\.\,\-\+\#\*\/\(\)\:\%\★\☆\–\—\<\>\[\]\|\_\@\!]+$', t_clean):
        return False
    # Reject strings starting with chapter/volume
    if re.match(r'^(?:chapter|ch\.?|episode|ep\.?|vol\.?|volume)\s*\d+', t_lower):
        return False
    # Reject relative times
    if re.search(r'^\d+\s*(?:sec|min|hour|day|week|month|year)s?\s*ago$', t_lower):
        return False
    return True

def clean_title_text(t: str) -> str:
    if not t:
        return ""
    t = t.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    t = re.sub(r'[\s\u200b\ufeff]+', ' ', t).strip()
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    for l in lines:
        if is_valid_manga_title(l):
            return l
    return lines[0] if lines else t

def extract_title_from_card(c, a, full_href: str) -> str:
    """Extract and validate clean manga title from HTML card."""
    # 1. Heading tags inside the card
    for h in c.select("h1, h2, h3, h4, h5"):
        ht = clean_title_text(h.get_text())
        if is_valid_manga_title(ht):
            return ht

    # 2. Dedicated title containers, strictly skipping badges, tags, ratings
    for el in c.select(".series-title, .manga-title, .item-title, .entry-title, .post-title, .tt, .title, .title-large, .title-default, .card-title"):
        classes = " ".join(el.get("class", [])).lower()
        if any(b in classes for b in ["badge", "label", "tag", "meta", "chapter", "rate", "score", "rating", "genre", "status"]):
            continue
        elt = clean_title_text(el.get_text())
        if is_valid_manga_title(elt):
            return elt

    # 3. Anchor title attribute
    if a.get("title"):
        at = clean_title_text(a.get("title"))
        if is_valid_manga_title(at):
            return at

    # 4. Check image alt and title in the card (themes consistently store clean title in alt)
    for img in c.find_all("img"):
        alt = clean_title_text(img.get("alt", ""))
        if is_valid_manga_title(alt):
            return alt
        img_title = clean_title_text(img.get("title", ""))
        if is_valid_manga_title(img_title):
            return img_title

    # 5. Check other anchors inside the card
    for sub_a in c.find_all("a"):
        sat = clean_title_text(sub_a.get_text())
        if is_valid_manga_title(sat):
            return sat

    # 6. Fallback from slug
    slug = full_href.rstrip("/").split("/")[-1]
    slug = re.sub(r'^(?:manga|series|comic)[-_]', '', slug, flags=re.I)
    return slug.replace("-", " ").title()

def get_home_url_from_cache(pkg: str) -> str:
    """Find the real target website URL for a Keiyoushi package name from cache."""
    if not pkg:
        return ""
    try:
        if os.path.exists(EXTENSIONS_CACHE_FILE):
            with open(EXTENSIONS_CACHE_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
                exts = d.get("extensions", []) if isinstance(d, dict) else d
                for e in exts:
                    if e.get("pkg") == pkg:
                        sources = e.get("sources", [])
                        if sources and isinstance(sources, list):
                            return sources[0].get("homeUrl") or sources[0].get("baseUrl") or ""
    except Exception as e:
        print(f"Error looking up homeUrl for {pkg}:", e)
    return ""

class GenericExtensionSource(BaseSource):
    """
    Universal Dynamic Source Scraper for installed Mihon / Tachiyomi extensions.
    Connects directly to the extension's actual website (homeUrl).
    NEVER duplicates MangaDex.
    """
    def __init__(self, source_id: str, name: str, icon_url: str = "", version: str = "1.0.0",
                 lang: str = "all", home_url: str = "", pkg: str = ""):
        self._id = source_id
        self._name = name
        self._version = version
        self._lang = lang
        self._icon_url = icon_url or "https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/default.png"
        self._pkg = pkg

        # Resolve actual website URL
        resolved_url = home_url or get_home_url_from_cache(pkg)
        self._home_url = resolved_url.rstrip("/") if resolved_url else ""
        self._headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": (self._home_url + "/") if self._home_url else "https://google.com/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }
        self._session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=1)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    @property
    def id(self) -> str:
        return self._id

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> str:
        return self._version

    @property
    def icon_url(self) -> str:
        return self._icon_url

    def get_filters(self) -> list:
        return [
            {
                "id": "sort",
                "name": "Sort By",
                "type": "select",
                "values": ["Most Popular", "Latest Uploads", "Rating", "Title (A-Z)"],
                "keys": ["views", "latest", "rating", "alphabet"],
                "default": "views"
            },
            {
                "id": "status",
                "name": "Status",
                "type": "select",
                "values": ["All", "Ongoing", "Completed"],
                "keys": ["all", "ongoing", "completed"],
                "default": "all"
            },
            {
                "id": "genres",
                "name": "Genres",
                "type": "group",
                "state": [
                    {"type": "tristate", "id": g.lower().replace(" ", "-"), "name": g, "state": 0, "default": 0}
                    for g in [
                        "Action", "Adult", "Adventure", "Comedy", "Doujinshi", "Drama",
                        "Ecchi", "Fantasy", "Full Color", "Harem", "Horror", "Isekai",
                        "Manhua", "Manhwa", "Martial Arts", "Mature", "Mystery", "Psychological",
                        "Romance", "School Life", "Sci-Fi", "Seinen", "Shoujo", "Shounen",
                        "Slice of Life", "Supernatural", "Thriller", "Uncensored", "Webtoons"
                    ]
                ]
            }
        ]

    def _clean_img_url(self, raw_url: str) -> str:
        if not raw_url:
            return ""
        if "/_next/image?url=" in raw_url:
            try:
                parsed = urlparse(raw_url)
                qs = parse_qs(parsed.query)
                if "url" in qs:
                    raw_url = qs["url"][0]
            except Exception:
                pass
        return urljoin(self._home_url, raw_url) if self._home_url else raw_url

    def _parse_cards_from_soup(self, soup: BeautifulSoup, section_hint: str = None) -> list:
        items = []
        seen = set()

        # If section hint provided (e.g. popular vs latest on homepage), search prioritized container first
        scoped_soup = soup
        if section_hint == "popular":
            for sel in [
                "[class*='popular']", "[id*='popular']", "[class*='trending']", "[id*='trending']",
                "[class*='hot']", "[id*='hot']", "[class*='top-']", "[id*='top-']", "[class*='ranking']",
                ".mostview", ".populer", ".bestseller"
            ]:
                match = soup.select_one(sel)
                if match and len(match.find_all("a")) >= 3:
                    scoped_soup = match
                    break
        elif section_hint == "latest":
            for sel in [
                "[class*='latest']", "[id*='latest']", "[class*='recent']", "[id*='recent']",
                "[class*='update']", "[id*='update']", "[class*='new-']", ".releases", ".terbaru"
            ]:
                match = soup.select_one(sel)
                if match and len(match.find_all("a")) >= 3:
                    scoped_soup = match
                    break

        # 1. Search common card elements across popular manga theme architectures
        card_selectors = [
            "div[class*='SeriesCard']", "div[class*='seriesCard']", "div[class*='series-card']",
            "div[class*='manga-card']", ".bsx", ".bs", ".story_item", ".unit", ".item", ".entry",
            ".manga-item", ".thumb-item-flow", ".content-genres-item", "article", ".page-item-detail",
            "div[class*='manga-item']", ".itemupdate", ".list-truyen-item-wrap", ".story-item",
            ".list-story-item", ".truyen-list", ".novel-item", ".manga", ".comic",
            ".grid > a[href*='manga']", ".flex-wrap.flex a[href*='manga']"
        ]
        cards = scoped_soup.select(", ".join(card_selectors))

        # Fallback to general anchors with manga/series paths
        if not cards:
            cards = scoped_soup.select("a[href*='/series/'], a[href*='/manga/'], a[href*='/comic/'], a[href*='/story/'], a[href*='/title/']")
        if not cards:
            cards = scoped_soup.find_all("a")

        # If scoped section produced fewer than 3 cards, fallback to full page
        if len(cards) < 3 and scoped_soup is not soup:
            full_cards = soup.select(", ".join(card_selectors)) or soup.find_all("a")
            if len(full_cards) > len(cards):
                cards = full_cards

        for c in cards:
            if c.name == "a":
                a = c
            else:
                # Find candidate anchors prioritizing manga/series title links over chapter links
                a_candidates = c.select(
                    "h1 a, h2 a, h3 a, h4 a, .series-title a, .manga-title a, .item-title a, .entry-title a, .post-title a, .title a, "
                    "a[href*='/manga/'], a[href*='/series/'], a[href*='/comic/'], a[href*='/story/'], a[href*='/title/']"
                ) or c.find_all("a")

                a = None
                for cand in a_candidates:
                    h = cand.get("href", "")
                    if h and h != "#" and not is_chapter_href(h) and not any(re.search(pat, h, re.I) for pat in NON_MANGA_PATTERNS):
                        a = cand
                        break

            if not a or not a.get("href"):
                continue

            href = a.get("href", "")
            if not href or href == "#" or href.startswith("javascript:"):
                continue

            # Skip chapter links and non-manga navigation
            if is_chapter_href(href):
                continue
            if any(re.search(pat, href, re.I) for pat in NON_MANGA_PATTERNS):
                continue

            href_lower = href.lower().rstrip("/")
            if href_lower in ("", self._home_url.lower(), "/browse", "/manga", "/series", "/home", "/"):
                continue

            full_href = urljoin(self._home_url, href) if self._home_url else href
            if full_href in seen:
                continue

            # Extract validated title
            title = extract_title_from_card(c, a, full_href)
            if not is_valid_manga_title(title):
                continue

            # Extract cover image
            img = c.find("img") if c.name != "a" else a.find("img")
            if not img and c.name == "a":
                card_parent = a.find_parent(lambda tag: tag.name == "div" and any(k in " ".join(tag.get("class", [])).lower() for k in ["card", "series", "item", "manga", "thumb", "outer"]))
                if card_parent:
                    img = card_parent.find("img")

            cover = ""
            if img:
                raw_cover = (
                    img.get("data-src") or img.get("data-lazy-src") or
                    img.get("data-original") or img.get("srcset") or
                    img.get("src") or ""
                )
                if raw_cover and " " in raw_cover:
                    raw_cover = raw_cover.split()[0]
                cover = self._clean_img_url(raw_cover)

            seen.add(full_href)

            # Encode URL deterministically into manga_id
            rel_path = full_href.replace(self._home_url, "").strip("/") if self._home_url else full_href
            slug = full_href.rstrip("/").split("/")[-1]
            manga_id = f"{self._id}___{rel_path.replace('/', '___')}"

            # Cache URL in memory
            _PERSISTENT_URL_CACHE[manga_id] = full_href
            _PERSISTENT_URL_CACHE[f"{self._id}_{slug}"] = full_href

            items.append({
                "id": manga_id,
                "source": self._id,
                "source_name": self._name,
                "title": title,
                "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(self._home_url)}" if cover else "/static/img/default-cover.png",
                "status": "Ongoing",
                "chapter_count": 0
            })

        return items

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        if not self._home_url:
            return {"total": 0, "page": page, "limit": limit, "items": []}

        if kwargs.get("sort") == "latest" or kwargs.get("order") == "latest":
            return self.get_latest(page=page, limit=limit, **kwargs)

        candidates = []
        if page == 1:
            candidates = [
                # Comic Asura / Advanced Search theme
                f"{self._home_url}/advanced-search?sort=rating",
                f"{self._home_url}/advanced-search?page=1&sort=rating",
                # MangaDistrict / Madara /series/ substring
                f"{self._home_url}/series/?m_orderby=views",
                # Manga18 Club
                f"{self._home_url}/list-manga/1?order_by=views",
                f"{self._home_url}/list-manga?order_by=views",
                # Manga18 Me / Raw / Manga-List
                f"{self._home_url}/manhwa-raw",
                f"{self._home_url}/manga-list?sort=views",
                # MangaThemesia / WP-MangaStream popular
                f"{self._home_url}/manga/?order=popular",
                # Madara popular
                f"{self._home_url}/manga/?m_orderby=views",
                f"{self._home_url}/?s=&post_type=wp-manga&m_orderby=views",
                # Standard / Custom CMS popular
                f"{self._home_url}/popular",
                f"{self._home_url}/browse?order=views",
                f"{self._home_url}/browse?sort=popular",
                f"{self._home_url}/ranking",
                f"{self._home_url}/hot",
                f"{self._home_url}/top",
                f"{self._home_url}/browse",
                f"{self._home_url}/manga",
                f"{self._home_url}/series",
                self._home_url
            ]
        else:
            candidates = [
                # Comic Asura / Advanced Search theme
                f"{self._home_url}/advanced-search?page={page}&sort=rating",
                # MangaDistrict / Madara /series/ substring
                f"{self._home_url}/series/page/{page}/?m_orderby=views",
                # Manga18 Club
                f"{self._home_url}/list-manga/{page}?order_by=views",
                # Manga18 Me / Raw / Manga-List
                f"{self._home_url}/manhwa-raw?page={page}",
                f"{self._home_url}/manga-list?page={page}&sort=views",
                # MangaThemesia / WP-MangaStream popular
                f"{self._home_url}/manga/?page={page}&order=popular",
                f"{self._home_url}/manga/page/{page}/?order=popular",
                # Madara popular
                f"{self._home_url}/manga/page/{page}/?m_orderby=views",
                f"{self._home_url}/page/{page}/?s=&post_type=wp-manga&m_orderby=views",
                # Standard / Custom CMS popular
                f"{self._home_url}/popular?page={page}",
                f"{self._home_url}/browse?order=views&page={page}",
                f"{self._home_url}/browse?sort=popular&page={page}",
                f"{self._home_url}/ranking?page={page}",
                f"{self._home_url}/browse?page={page}",
                f"{self._home_url}/page/{page}",
                f"{self._home_url}/manga?page={page}",
                f"{self._home_url}/series?page={page}"
            ]

        for url in candidates:
            try:
                r = self._session.get(url, headers=self._headers, timeout=10)
                if r.status_code == 200 and len(r.text) > 500:
                    soup = BeautifulSoup(r.text, "html.parser")
                    is_home = url.rstrip("/") == self._home_url.rstrip("/")
                    items = self._parse_cards_from_soup(soup, section_hint="popular" if is_home else "")
                    if items:
                        return {
                            "total": max(100, page * limit + 24),
                            "page": page,
                            "limit": limit,
                            "items": items[:limit]
                        }
            except Exception as e:
                print(f"[{self._name}] Error fetching popular from {url}:", e)
                continue

        return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        if not self._home_url:
            return {"total": 0, "page": page, "limit": limit, "items": []}

        candidates = []
        if page == 1:
            candidates = [
                # Comic Asura / Advanced Search theme
                f"{self._home_url}/advanced-search?sort=latest",
                f"{self._home_url}/advanced-search?page=1&sort=latest",
                # MangaDistrict / Madara /series/ substring
                f"{self._home_url}/series/?m_orderby=latest",
                # Manga18 Club
                f"{self._home_url}/list-manga/1?order_by=latest",
                f"{self._home_url}/list-manga?order_by=latest",
                # Manga18 Me / Manga-List
                f"{self._home_url}/manga-list?sort=latest",
                # MangaThemesia / WP-MangaStream latest
                f"{self._home_url}/manga/?order=update",
                # Madara latest
                f"{self._home_url}/manga/?m_orderby=latest",
                f"{self._home_url}/?s=&post_type=wp-manga&m_orderby=latest",
                # Standard / Custom CMS latest
                f"{self._home_url}/latest-updates",
                f"{self._home_url}/latest",
                f"{self._home_url}/updates",
                f"{self._home_url}/browse?order=update",
                f"{self._home_url}/browse?sort=latest",
                self._home_url
            ]
        else:
            candidates = [
                # Comic Asura / Advanced Search theme
                f"{self._home_url}/advanced-search?page={page}&sort=latest",
                # MangaDistrict / Madara /series/ substring
                f"{self._home_url}/series/page/{page}/?m_orderby=latest",
                # Manga18 Club
                f"{self._home_url}/list-manga/{page}?order_by=latest",
                # Manga18 Me / Manga-List
                f"{self._home_url}/manga-list?page={page}&sort=latest",
                # MangaThemesia / WP-MangaStream latest
                f"{self._home_url}/manga/?page={page}&order=update",
                f"{self._home_url}/manga/page/{page}/?order=update",
                # Madara latest
                f"{self._home_url}/manga/page/{page}/?m_orderby=latest",
                f"{self._home_url}/page/{page}/?s=&post_type=wp-manga&m_orderby=latest",
                # Standard / Custom CMS latest
                f"{self._home_url}/latest-updates?page={page}",
                f"{self._home_url}/latest?page={page}",
                f"{self._home_url}/updates?page={page}",
                f"{self._home_url}/browse?order=update&page={page}",
                f"{self._home_url}/browse?sort=latest&page={page}"
            ]

        for url in candidates:
            try:
                r = self._session.get(url, headers=self._headers, timeout=10)
                if r.status_code == 200 and len(r.text) > 500:
                    soup = BeautifulSoup(r.text, "html.parser")
                    is_home = url.rstrip("/") == self._home_url.rstrip("/")
                    items = self._parse_cards_from_soup(soup, section_hint="latest" if is_home else "")
                    if items:
                        return {
                            "total": max(100, page * limit + 24),
                            "page": page,
                            "limit": limit,
                            "items": items[:limit]
                        }
            except Exception as e:
                print(f"[{self._name}] Error fetching latest from {url}:", e)
                continue

        return {"total": 0, "page": page, "limit": limit, "items": []}

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        if not self._home_url:
            return {"total": 0, "page": page, "limit": limit, "items": []}

        q = (query or "").strip()
        sort = kwargs.get("sort") or kwargs.get("order") or "views"
        if sort == "popular":
            sort = "views"
        elif sort == "title":
            sort = "alphabet"
        elif sort == "latest":
            sort = "latest"

        mt_order = "popular" if sort in ("views", "popular") else ("update" if sort in ("latest", "update") else ("title" if sort == "alphabet" else "rating"))

        status = kwargs.get("status", "")
        if status == "all": status = ""
        type_ = kwargs.get("type") or kwargs.get("types", "")
        if type_ == "all": type_ = ""

        raw_genres = kwargs.get("genres") or kwargs.get("genre") or kwargs.get("genres_in") or []
        if isinstance(raw_genres, str):
            genre_list = [g.strip().lower().replace(" ", "-") for g in raw_genres.split(",") if g.strip() and g.lower() not in ("all", "all genres")]
        elif isinstance(raw_genres, list):
            genre_list = [str(g).strip().lower().replace(" ", "-") for g in raw_genres if g and str(g).lower() not in ("all", "all genres")]
        else:
            genre_list = []

        # 1. MangaThemesia Search URL
        mt_params = []
        if q: mt_params.append(f"title={quote(q)}")
        if mt_order: mt_params.append(f"order={quote(mt_order)}")
        if status: mt_params.append(f"status={quote(status)}")
        if type_: mt_params.append(f"type={quote(type_)}")
        for g in genre_list: mt_params.append(f"genre%5B%5D={quote(g)}")
        if page > 1: mt_params.append(f"page={page}")
        mt_qs = "&".join(mt_params)
        mt_url = f"{self._home_url}/manga/?{mt_qs}"

        # 2. Madara Search URL
        madara_url = f"{self._home_url}/page/{page}/?s={quote(q)}&post_type=wp-manga&m_orderby={quote(sort)}" if page > 1 else f"{self._home_url}/?s={quote(q)}&post_type=wp-manga&m_orderby={quote(sort)}"
        if status: madara_url += f"&status%5B%5D={quote(status)}"
        for g in genre_list: madara_url += f"&genre%5B%5D={quote(g)}"

        # 3. Standard Filter / Browse URL
        std_params = []
        if q: std_params.append(f"q={quote(q)}")
        if sort: std_params.append(f"sort={quote(sort)}")
        if status: std_params.append(f"status={quote(status)}")
        if genre_list: std_params.append(f"genres={quote(','.join(genre_list))}")
        if page > 1: std_params.append(f"page={page}")
        std_qs = "&".join(std_params)

        search_candidates = [
            mt_url,
            madara_url,
            f"{self._home_url}/filter?{std_qs}",
            f"{self._home_url}/browse?{std_qs}",
            f"{self._home_url}/advanced-search/?name={quote(q)}&page={page}" if q else f"{self._home_url}/advanced-search/?page={page}",
            f"{self._home_url}/search?q={quote(q)}&page={page}" if q else f"{self._home_url}/search?page={page}",
            f"{self._home_url}/?s={quote(q)}&page={page}"
        ]

        q_words = [w for w in re.split(r'\W+', q.lower()) if len(w) > 1] if q else []
        best_items = []

        for url in search_candidates:
            try:
                r = self._session.get(url, headers=self._headers, timeout=10)
                if r.status_code == 200 and len(r.text) > 500:
                    soup = BeautifulSoup(r.text, "html.parser")
                    items = self._parse_cards_from_soup(soup)
                    if items:
                        if q_words:
                            matched = [it for it in items if any(w in it["title"].lower() for w in q_words)]
                            if matched:
                                q_lower = q.lower()
                                matched.sort(key=lambda it: (
                                    0 if it["title"].lower() == q_lower else
                                    1 if it["title"].lower().startswith(q_lower) else
                                    2 if q_lower in it["title"].lower() else 3
                                ))
                                return {
                                    "total": len(matched) if len(matched) < limit else max(100, page * limit + 24),
                                    "page": page,
                                    "limit": limit,
                                    "items": matched[:limit]
                                }
                            if not best_items:
                                best_items = items
                        else:
                            return {
                                "total": max(100, page * limit + 24),
                                "page": page,
                                "limit": limit,
                                "items": items[:limit]
                            }
            except Exception:
                continue

        if not q and best_items:
            return {
                "total": max(100, page * limit + 24),
                "page": page,
                "limit": limit,
                "items": best_items[:limit]
            }

        return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_details(self, manga_id: str) -> dict:
        manga_url = _PERSISTENT_URL_CACHE.get(manga_id)

        # Decode from ID if encoded with ___
        if not manga_url and "___" in manga_id and self._home_url:
            parts = manga_id.split("___")[1:]
            rel_path = "/".join(parts)
            manga_url = f"{self._home_url}/{rel_path}"

        if not manga_url and self._home_url:
            slug = manga_id.replace(f"{self._id}_", "")
            for pattern in [f"{self._home_url}/series/{slug}", f"{self._home_url}/manga/{slug}"]:
                try:
                    head = self._session.head(pattern, headers=self._headers, timeout=1.5, allow_redirects=True)
                    if head.status_code == 200:
                        manga_url = pattern
                        break
                except Exception:
                    pass
            if not manga_url:
                manga_url = f"{self._home_url}/series/{slug}"

        if not manga_url:
            return None

        try:
            r = self._session.get(manga_url, headers=self._headers, timeout=12)
            if r.status_code != 200:
                return None
            r.encoding = "utf-8"

            soup = BeautifulSoup(r.text, "html.parser")

            # Decompose badge elements inside title elements to prevent "18+", "Hot", etc. pollution
            for b in soup.select(".manga-title-badges, [class*='badge'], .label, .status-label"):
                if b.find_parent(["h1", "h2", "h3", ".post-title", ".entry-title", ".series-title"]):
                    b.decompose()

            # Find title element
            title_el = (
                soup.select_one("h1") or
                soup.select_one(".post-title h1, .entry-title, .series-title, .item-title, .manga-title") or
                soup.find("h2")
            )
            raw_title = clean_title_text(title_el.get_text()) if title_el else ""
            if not is_valid_manga_title(raw_title):
                og_title = soup.select_one("meta[property='og:title']")
                if og_title and og_title.get("content"):
                    cleaned_og = clean_title_text(og_title["content"].split("|")[0].split("-")[0])
                    if is_valid_manga_title(cleaned_og):
                        raw_title = cleaned_og
                if not is_valid_manga_title(raw_title):
                    raw_title = manga_id.split("___")[-1].replace("-", " ").title()

            cover = ""
            cover_el = soup.select_one(".poster img, .cover img, .thumb img, img[class*='poster'], img[class*='cover'], img[data-src*='cover'], img[src*='thumbnail']")
            if cover_el:
                cover = cover_el.get("data-src") or cover_el.get("src") or ""
            if not cover:
                for img in soup.find_all("img"):
                    src = img.get("src") or img.get("data-src") or ""
                    if any(x in src.lower() for x in ["cover", "thumb", "poster", "thumbnail", "storage"]):
                        cover = src
                        break

            cover = self._clean_img_url(cover)

            summary = ""
            # Specifically target synopsis containers. NEVER select general containers like .post-content or .summary which hold metadata tables!
            desc = (
                soup.select_one(".description-summary .summary__content") or
                soup.select_one(".description-summary") or
                soup.select_one(".manga-excerpt") or
                soup.select_one(".dsct") or
                soup.select_one(".panel-story-info-description") or
                soup.select_one(".synopsis-content, .synopsis_content, [class*='synopsis-content']") or
                soup.select_one(".synopsis, [class*='synopsis']") or
                soup.select_one(".entry-content.entry-content-single") or
                soup.select_one(".manga-info p.description, p.description")
            )
            if desc:
                # Remove nested buttons, scripts, ads, show-more links, headers, comments
                for tag in desc.select("button, a.show-more, a[class*='more'], script, style, .show-more, h1, h2, h3, h4, .comments, .comment, .c-content-readmore"):
                    tag.decompose()
                raw_summary = desc.get_text("\n").strip()
                # Clean up if starts with title
                if raw_title and raw_summary.lower().startswith(raw_title.lower()):
                    raw_summary = raw_summary[len(raw_title):].lstrip(" :\n-\t").strip()
                # Remove trailing Show more / Show less / Read more / etc.
                raw_summary = re.sub(r'(?i)\s*(?:Show more|Show less|Read more|Read less|Read online|Full summary)\s*$', '', raw_summary).strip()
                raw_summary = re.sub(r'\n{3,}', '\n\n', raw_summary).strip()
                
                # Check for metadata bleeding (e.g. "out of 876", "Rating", "Author(s)", "Rank 1st")
                is_metadata = any(re.search(pat, raw_summary, re.IGNORECASE) for pat in [
                    r'\bout of\s+\d+',
                    r'\bRank\s+\d+',
                    r'\bAuthor\(s\)',
                    r'\bArtist\(s\)',
                    r'\bAlternative\b'
                ])
                if not is_metadata and raw_summary.lower() not in ("home", "manga", "index", ""):
                    summary = raw_summary

            if not summary:
                # Fallback: inspect clean narrative paragraphs
                for p in soup.select("article p, .entry-content p, .story-info p"):
                    pt = p.get_text().strip()
                    if len(pt) > 50 and not any(k in pt.lower() for k in ["author", "rating", "artist", "copyright", "all rights reserved", "alternative", "out of "]):
                        summary = pt
                        break

            # Extract actual genres from detail section
            genres = []
            for a in soup.select(".genres-content a, .genre-item a, .manga-info a[href*='/genre/'], .manga-info a[href*='/publication-genre/'], .manga-info a[href*='/manga-genre/'], .post-content a[href*='/genre/'], .post-content a[href*='/publication-genre/'], a[href*='/publication-genre/'], a[href*='/genre/'], a[href*='/tag/']"):
                t = a.text.strip()
                if t and t not in genres and len(t) < 35:
                    genres.append(t)

            # Extract Author, Artist, Status
            author = ""
            artist = ""
            status = "Ongoing"
            for item in soup.select(".post-content_item, .summary-item"):
                h = item.select_one(".summary-heading, .heading")
                c = item.select_one(".summary-content, .content")
                if h and c:
                    ht = h.text.strip().lower()
                    ct = c.text.strip()
                    if "author" in ht:
                        author = ct
                    elif "artist" in ht:
                        artist = ct
                    elif "status" in ht:
                        status = ct

            chapters = self._parse_chapters_from_soup(soup, manga_url)

            return {
                "id": manga_id,
                "source": self._id,
                "source_name": self._name,
                "title": raw_title,
                "summary": summary or f"Read {raw_title} on {self._name}.",
                "genres": genres,
                "author": author,
                "artist": artist,
                "status": status or "Ongoing",
                "cover_url": f"/api/proxy/image?url={quote(cover)}&referer={quote(self._home_url)}" if cover else "/static/img/default-cover.png",
                "chapter_count": len(chapters),
                "chapters": chapters
            }
        except Exception as e:
            print(f"[{self._name}] get_details error for {manga_id}:", e)
            return None

    def _parse_chapters_from_soup(self, soup: BeautifulSoup, base_page_url: str) -> list:
        chapters = []
        seen = set()

        for a in soup.find_all("a"):
            href = a.get("href", "")
            if not href or href == "#" or href.startswith("javascript:"):
                continue

            full_href = urljoin(base_page_url, href)
            if full_href in seen or full_href.rstrip("/") == base_page_url.rstrip("/"):
                continue

            href_lower = href.lower()
            text_lower = a.text.lower().strip()

            # Exclude comments, replies, profiles, tags, and non-manga navigation
            if any(x in href_lower for x in ["#comment", "/comment", "cancel-reply", "respond", "/user/", "/author/", "/genre/", "/tag/", "/category/"]):
                continue
            if any(re.search(pat, href, re.I) for pat in NON_MANGA_PATTERNS):
                continue
            if any(x in text_lower for x in ["reply", "cancel reply", "leave a reply", "login", "register", "first chapter", "latest chapter", "last chapter", "read first", "read latest", "read last", "all chapters", "chapter list"]):
                continue

            # Must have actual chapter indicators in href (reject other manga links that have chapter numbers in badges)
            is_ch = (
                is_chapter_href(href_lower) or
                "/chapter-" in href_lower or "/chapter/" in href_lower or
                bool(re.search(r'[-_/]chapter[-_]?\d+', href_lower)) or
                "/ch-" in href_lower or "/read/" in href_lower or
                (base_page_url.replace(self._home_url, "").strip("/") in full_href and len(full_href.rstrip("/").split("/")) > len(base_page_url.rstrip("/").split("/")))
            )

            if not is_ch or len(text_lower) == 0:
                continue

            # Extra safety: if it looks like a manga link and has no chapter slug, skip it
            if ("/manga/" in href_lower or "/series/" in href_lower) and not any(k in href_lower for k in ["/chapter", "chapter-", "ch-", "/c-"]):
                continue

            seen.add(full_href)

            # Separate title and release date
            spans = [s.text.strip() for s in a.find_all("span") if s.text.strip()]
            ch_title = spans[0] if spans else a.text.strip()
            release_date = spans[1] if len(spans) >= 2 else ""

            # Detect date strings in title
            date_match = re.search(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b', ch_title, re.I)
            if not date_match:
                date_match = re.search(r'\b\d+\s+(?:days?|hours?|months?|weeks?|years?)\s+ago\b', ch_title, re.I)

            if date_match:
                if not release_date:
                    release_date = date_match.group(0)
                ch_title = ch_title[:date_match.start()].strip()

            ch_num_match = re.search(r'(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)', ch_title or href, re.I)
            if not ch_num_match:
                ch_num_match = re.search(r'([0-9]+(?:\.[0-9]+)?)', href)

            ch_num = float(ch_num_match.group(1)) if ch_num_match else (len(chapters) + 1.0)

            rel_path = full_href.replace(self._home_url, "").strip("/") if self._home_url else full_href
            slug = full_href.rstrip("/").split("/")[-1]
            ch_id = f"{self._id}___{rel_path.replace('/', '___')}"

            # Cache chapter URL
            _PERSISTENT_URL_CACHE[ch_id] = full_href
            _PERSISTENT_URL_CACHE[f"{self._id}_{slug}"] = full_href

            chapters.append({
                "id": ch_id,
                "source": self._id,
                "title": ch_title or f"Chapter {ch_num}",
                "release_date": release_date,
                "chapter_number": ch_num,
                "url": full_href
            })

        chapters.sort(key=lambda c: c["chapter_number"], reverse=True)
        return chapters

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0) -> list:
        manga = self.get_details(manga_id)
        if manga and manga.get("chapters"):
            return manga["chapters"][offset:offset + limit]
        return []

    def get_chapter_pages(self, chapter_id: str) -> list:
        ch_url = _PERSISTENT_URL_CACHE.get(chapter_id)

        # Decode from ID if encoded with ___
        if not ch_url and "___" in chapter_id and self._home_url:
            parts = chapter_id.split("___")[1:]
            rel_path = "/".join(parts)
            ch_url = f"{self._home_url}/{rel_path}"

        if not ch_url and self._home_url:
            slug = chapter_id.replace(f"{self._id}_", "")
            ch_url = f"{self._home_url}/{slug}"

        if not ch_url:
            return []

        try:
            r = self._session.get(ch_url, headers=self._headers, timeout=12)
            if r.status_code != 200:
                return []

            pages = []
            seen = set()

            # 1. Check base64 script arrays (e.g. slides_p_path on Manga18 Club / 18porncomic)
            slides_match = re.search(r'slides_p_path\s*=\s*\[(.*?)\]', r.text, re.S)
            if slides_match:
                raw_items = re.findall(r'["\']([^"\']+)["\']', slides_match.group(1))
                for item in raw_items:
                    try:
                        decoded = base64.b64decode(item).decode('utf-8', errors='ignore').strip()
                        if decoded.startswith("http") and decoded not in seen:
                            seen.add(decoded)
                            pages.append(f"/api/proxy/image?url={quote(decoded)}&referer={quote(self._home_url)}")
                    except Exception:
                        pass

            # 2. Check JSON images in scripts (ts_reader, chapImages)
            if not pages:
                ts_match = re.search(r'ts_reader\.run\((\{.*?\})\)', r.text, re.S)
                if ts_match:
                    try:
                        ts_data = json.loads(ts_match.group(1))
                        sources = ts_data.get("sources", [])
                        for s in sources:
                            for img_url in s.get("images", []):
                                if img_url and img_url not in seen:
                                    seen.add(img_url)
                                    pages.append(f"/api/proxy/image?url={quote(img_url)}&referer={quote(self._home_url)}")
                    except Exception:
                        pass

            # 3. Standard DOM reader image selectors
            if not pages:
                soup = BeautifulSoup(r.text, "html.parser")
                dom_selectors = [
                    ".read-content img", ".reading-content img", ".chapter-content img",
                    "#readerarea img", ".readerarea img", "#reader img", "#pages img", ".page-break img", ".text-left img",
                    "div[class*='chapter'] img", "#chapter_boxImages img", ".image_story img",
                    ".image-chapter img", "img[id*='image-']", ".viewer-cnt img",
                    "img.object-cover", "img[class*='object-cover']"
                ]
                selected_imgs = soup.select(", ".join(dom_selectors))
                if not selected_imgs:
                    # Generic chapter page image scanner: find content images with series/chapters
                    selected_imgs = [img for img in soup.find_all("img") if any(k in (img.get("src") or img.get("data-src") or "").lower() for k in ["/uploads/", "/chapters/", "/series/", "cdn.", "storage", "2xstorage", "waitst"])]

                for img in selected_imgs:
                    raw_src = img.get("data-src") or img.get("data-lazy-src") or img.get("src") or ""
                    clean_src = self._clean_img_url(raw_src.strip())
                    if clean_src and clean_src not in seen and not any(x in clean_src.lower() for x in ["logo", "banner", "/ad/", "advert", "facebook", "twitter", "read_on_flame", "thumbnail", "icon", "avatar", "star", "arrow", ".svg", "report"]):
                        seen.add(clean_src)
                        pages.append(f"/api/proxy/image?url={quote(clean_src)}&referer={quote(self._home_url)}")

            return pages
        except Exception as e:
            print(f"[{self._name}] get_chapter_pages error:", e)
            return []
