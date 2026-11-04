import requests
from urllib.parse import urlencode, quote
from server.sources.base import BaseSource

MANGADEX_API_URL = "https://api.mangadex.org"
MANGADEX_COVER_URL = "https://uploads.mangadex.org/covers"

class MangaDexSource(BaseSource):
    @property
    def id(self) -> str:
        return "mangadex"

    @property
    def name(self) -> str:
        return "MangaDex"

    @property
    def version(self) -> str:
        return "1.2.0"

    @property
    def icon_url(self) -> str:
        return "https://mangadex.org/favicon.ico"

    def _get_title(self, attributes):
        title_map = attributes.get("title", {})
        if "en" in title_map and title_map["en"].strip():
            return title_map["en"].strip()
        
        # Check altTitles
        alt_titles = attributes.get("altTitles", [])
        for alt in alt_titles:
            if "en" in alt and alt["en"].strip():
                return alt["en"].strip()
            
        for k in ["ko-ro", "ja-ro", "ko", "ja"]:
            if k in title_map and title_map[k].strip():
                return title_map[k].strip()

        # Fallback to first available title
        for val in title_map.values():
            if val and val.strip():
                return val.strip()

        return "Untitled Manga"

    def _get_cover(self, manga_id, relationships):
        for rel in relationships:
            if rel.get("type") == "cover_art":
                file_name = rel.get("attributes", {}).get("fileName")
                if file_name:
                    raw_url = f"{MANGADEX_COVER_URL}/{manga_id}/{file_name}.512.jpg"
                    return f"/api/proxy/image?url={quote(raw_url)}&referer={quote('https://mangadex.org/')}"
        return None

    def _format_manga(self, item):
        manga_id = item["id"]
        attrs = item.get("attributes", {})
        title = self._get_title(attrs)
        cover_url = self._get_cover(manga_id, item.get("relationships", []))

        # Description
        desc_map = attrs.get("description", {})
        summary = desc_map.get("en", "")
        if not summary and desc_map:
            summary = next(iter(desc_map.values()))

        # Tags/genres
        tags = []
        for tag in attrs.get("tags", []):
            tag_name = tag.get("attributes", {}).get("name", {}).get("en")
            if tag_name:
                tags.append(tag_name)

        status = attrs.get("status", "unknown").capitalize()

        return {
            "id": f"mangadex_{manga_id}",
            "raw_id": manga_id,
            "source": "mangadex",
            "source_name": "MangaDex",
            "title": title,
            "cover_url": cover_url or "/static/img/default-cover.png",
            "summary": summary,
            "genres": tags,
            "status": status,
            "year": attrs.get("year"),
            "content_rating": attrs.get("contentRating")
        }

    GENRE_TAGS = {
        "action": "391b0423-d847-456f-aff0-8b0cfc03066b",
        "adventure": "87cc87cd-a395-47af-b27a-96614b631a4c",
        "comedy": "4d32cc48-9f00-4cca-9b5a-a839f0764984",
        "drama": "b9af3a63-0f4e-49e0-a111-cfde314d31e5",
        "fantasy": "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
        "horror": "cdad7e68-e419-4463-94c9-66d10acddae3",
        "isekai": "ace04997-f6bd-4329-8b0e-ad9376079330",
        "martial arts": "799c8342-a34f-4d45-9f40-e277ff88143d",
        "mystery": "ee968100-4191-4968-93d3-f82d72be7e46",
        "romance": "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
        "sci-fi": "25632c36-7755-4e33-ba90-47d01445ff51",
        "slice of life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
        "supernatural": "eabc5b52-d347-4020-9903-4750c8c91d6c",
        "thriller": "070e6744-3c70-4473-8022-d0c9bd71bb3f"
    }

    def get_filters(self) -> list:
        return [
            {
                "id": "sort",
                "name": "Sort By",
                "type": "select",
                "values": ["Most Popular", "Latest Uploads", "Highest Rated", "Title (A-Z)"],
                "keys": ["popular", "latest", "rating", "title"],
                "default": "popular"
            },
            {
                "id": "status",
                "name": "Status",
                "type": "select",
                "values": ["All", "Ongoing", "Completed", "Hiatus", "Cancelled"],
                "keys": ["all", "ongoing", "completed", "hiatus", "cancelled"],
                "default": "all"
            },
            {
                "id": "content_rating",
                "name": "Content Rating",
                "type": "select",
                "values": ["Safe & Suggestive", "Safe Only", "All Ratings (Erotica/Porn)"],
                "keys": ["safe,suggestive", "safe", "safe,suggestive,erotica,pornographic"],
                "default": "safe,suggestive"
            },
            {
                "id": "genres",
                "name": "Genres / Tags",
                "type": "group",
                "state": [
                    {"type": "tristate", "id": g.lower(), "name": g, "state": 0, "default": 0}
                    for g in [
                        "Action", "Adventure", "Comedy", "Drama", "Fantasy",
                        "Horror", "Isekai", "Martial Arts", "Mystery", "Romance",
                        "Sci-Fi", "Slice of Life", "Supernatural", "Thriller"
                    ]
                ]
            }
        ]

    def _apply_filters(self, params: dict, sort: str = "popular", status: str = "all", content_rating: str = "safe,suggestive", **kwargs):
        if sort == "latest":
            params["order[latestUploadedChapter]"] = "desc"
        elif sort == "title":
            params["order[title]"] = "asc"
        elif sort == "rating":
            params["order[rating]"] = "desc"
        else:
            params["order[followedCount]"] = "desc"

        if status and status != "all":
            if isinstance(status, list):
                params["status[]"] = [s.lower() for s in status if s and s != "all"]
            else:
                params["status[]"] = [status.lower()]

        if content_rating:
            if isinstance(content_rating, list):
                cr_list = [cr.strip().lower() for cr in content_rating if cr.strip()]
            else:
                cr_list = [cr.strip().lower() for cr in str(content_rating).split(",") if cr.strip()]
            if cr_list:
                params["contentRating[]"] = cr_list

        # Handle Included and Excluded tags
        raw_in = kwargs.get("genres_in") or kwargs.get("genre") or kwargs.get("genres") or []
        if isinstance(raw_in, str):
            raw_in = [g.strip().lower() for g in raw_in.split(",") if g.strip()]
        elif isinstance(raw_in, list):
            raw_in = [str(g).strip().lower() for g in raw_in]
        inc_uuids = [self.GENRE_TAGS[g] for g in raw_in if g in self.GENRE_TAGS]
        if inc_uuids:
            params["includedTags[]"] = inc_uuids

        raw_ex = kwargs.get("genres_ex") or []
        if isinstance(raw_ex, str):
            raw_ex = [g.strip().lower() for g in raw_ex.split(",") if g.strip()]
        elif isinstance(raw_ex, list):
            raw_ex = [str(g).strip().lower() for g in raw_ex]
        exc_uuids = [self.GENRE_TAGS[g] for g in raw_ex if g in self.GENRE_TAGS]
        if exc_uuids:
            params["excludedTags[]"] = exc_uuids

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        offset = (page - 1) * limit
        params = {
            "limit": limit,
            "offset": offset,
            "includes[]": ["cover_art"]
        }
        sort = kwargs.get("sort", "popular")
        status = kwargs.get("status", "all")
        content_rating = kwargs.get("content_rating", "safe,suggestive")
        self._apply_filters(params, sort=sort, status=status, content_rating=content_rating, **kwargs)

        if query and query.strip():
            params["title"] = query.strip()

        try:
            r = requests.get(f"{MANGADEX_API_URL}/manga", params=params, timeout=12)
            if r.status_code == 200:
                data = r.json()
                total = data.get("total", 0)
                items = [self._format_manga(item) for item in data.get("data", [])]
                return {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "items": items
                }
        except Exception as e:
            print("MangaDex search error:", e)

        return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        return self.search(query="", page=page, limit=limit, **kwargs)

        return {"total": 0, "page": page, "limit": limit, "items": []}

    def get_details(self, manga_id: str) -> dict:
        raw_id = manga_id.replace("mangadex_", "")
        params = {
            "includes[]": ["cover_art", "author", "artist"]
        }
        try:
            r = requests.get(f"{MANGADEX_API_URL}/manga/{raw_id}", params=params, timeout=12)
            if r.status_code == 200:
                data = r.json().get("data", {})
                formatted = self._format_manga(data)

                # Author & Artist
                for rel in data.get("relationships", []):
                    if rel.get("type") == "author":
                        formatted["author"] = rel.get("attributes", {}).get("name", "")
                    elif rel.get("type") == "artist":
                        formatted["artist"] = rel.get("attributes", {}).get("name", "")
                return formatted
        except Exception as e:
            print("MangaDex get_details error:", e)

        return None

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0) -> list:
        raw_id = manga_id.replace("mangadex_", "")
        chapters = []
        current_offset = offset
        page_size = 500

        while len(chapters) < limit:
            fetch_limit = min(page_size, limit - len(chapters))
            params = {
                "translatedLanguage[]": ["en"],
                "limit": fetch_limit,
                "offset": current_offset,
                "order[chapter]": "asc",
                "contentRating[]": ["safe", "suggestive", "erotica"],
                "includeExternalUrl": 0,
                "includes[]": ["scanlation_group"]
            }
            try:
                r = requests.get(f"{MANGADEX_API_URL}/manga/{raw_id}/feed", params=params, timeout=15)
                if r.status_code != 200:
                    break
                res_data = r.json()
                data = res_data.get("data", [])
                total = res_data.get("total", 0)
                if not data:
                    break

                for ch in data:
                    attrs = ch.get("attributes", {})
                    # Skip external URLs that don't have images on MangaDex
                    if attrs.get("externalUrl"):
                        continue
                    
                    ch_num = attrs.get("chapter")
                    try:
                        num_float = float(ch_num) if ch_num is not None else 0.0
                    except ValueError:
                        num_float = 0.0

                    title = attrs.get("title") or ""
                    full_title = f"Chapter {ch_num}" if ch_num else "Chapter"
                    if title:
                        full_title += f": {title}"

                    scanlator = ""
                    for rel in ch.get("relationships", []):
                        if rel.get("type") == "scanlation_group":
                            scanlator = (rel.get("attributes") or {}).get("name", "")
                            if scanlator:
                                break

                    chapters.append({
                        "id": f"mangadex_ch_{ch['id']}",
                        "raw_id": ch["id"],
                        "chapter_number": num_float,
                        "chapter_string": ch_num or "0",
                        "title": full_title,
                        "pages_count": attrs.get("pages", 0),
                        "publish_at": attrs.get("publishAt", ""),
                        "scanlator": scanlator
                    })

                current_offset += len(data)
                if current_offset >= total or len(data) < fetch_limit:
                    break
            except Exception as e:
                print("MangaDex get_chapters error:", e)
                break

        return chapters

    def get_chapter_pages(self, chapter_id: str) -> list:
        raw_id = chapter_id.replace("mangadex_ch_", "")
        try:
            r = requests.get(f"{MANGADEX_API_URL}/at-home/server/{raw_id}", timeout=15)
            if r.status_code == 200:
                data = r.json()
                base_url = data.get("baseUrl")
                ch_hash = data.get("chapter", {}).get("hash")
                file_names = data.get("chapter", {}).get("data", [])
                if not file_names:
                    file_names = data.get("chapter", {}).get("dataSaver", [])

                pages = []
                for f in file_names:
                    full_url = f"{base_url}/data/{ch_hash}/{f}"
                    # Return proxied URL so browser has zero CORS/405/referrer problems
                    pages.append(f"/api/proxy/image?url={full_url}")
                return pages
        except Exception as e:
            print("MangaDex get_chapter_pages error:", e)

        return []
