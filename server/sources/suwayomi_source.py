import json
import logging
from server.sources.base import BaseSource
from server.suwayomi_client import suwayomi_client

logger = logging.getLogger("suwayomi_source")

class SuwayomiSource(BaseSource):
    def __init__(self, source_info):
        """
        source_info: dict from Suwayomi /api/v1/source/list or /api/v1/source/{id}
        """
        self._raw_info = source_info
        self._source_id = str(source_info.get("id"))
        self._name = source_info.get("displayName") or source_info.get("name") or f"Source {self._source_id}"
        self._lang = source_info.get("lang") or "all"
        self._icon_url = f"/api/suwayomi/icon/{source_info.get('id')}" if source_info.get("iconUrl") else "/static/img/default-cover.png"
        self._supports_latest = bool(source_info.get("supportsLatest", True))
        self._pkg = source_info.get("pkgName") or ""

    @property
    def id(self) -> str:
        return self._source_id

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> str:
        return self._raw_info.get("version") or "1.0.0"

    @property
    def icon_url(self) -> str:
        return self._icon_url

    @property
    def lang(self) -> str:
        return self._lang

    @property
    def pkg(self) -> str:
        return self._pkg

    @property
    def supports_latest(self) -> bool:
        return self._supports_latest

    def _normalize_filter_item(self, f_item, position, parent_id=None):
        f_type = f_item.get("type", "").lower()
        inner = f_item.get("filter", {})
        name = inner.get("name", "")
        state = inner.get("state")
        values = inner.get("displayValues") or inner.get("values") or []

        curr_id = f"{parent_id}_{position}" if parent_id else f"filter_{position}"

        if f_type == "group":
            children = []
            for c_idx, child in enumerate(state or []):
                if isinstance(child, dict):
                    c_norm = self._normalize_filter_item(child, c_idx, parent_id=curr_id)
                    children.append(c_norm)
            return {
                "type": "group",
                "id": curr_id,
                "position": position,
                "name": name,
                "state": children,
                "default": [dict(c) for c in children]
            }

        return {
            "type": f_type,
            "id": curr_id,
            "position": position,
            "name": name,
            "state": state,
            "default": state,
            "values": values
        }

    def get_filters(self) -> list:
        try:
            raw_filters = suwayomi_client.get_filters(self._source_id)
            normalized = []
            for pos, f in enumerate(raw_filters):
                norm = self._normalize_filter_item(f, pos)
                normalized.append(norm)
            return normalized
        except Exception as e:
            logger.error(f"Error fetching filters for source {self._source_id}: {e}")
            return []

    def _format_manga_item(self, m):
        m_id = str(m.get("id"))
        thumbnail = m.get("thumbnailUrl")
        cover_url = f"/api/suwayomi/thumbnail/{m_id}" if thumbnail else "/static/img/default-cover.png"

        status_str = (m.get("status") or "").upper()
        status = "Completed" if status_str == "COMPLETED" else "Ongoing"

        return {
            "id": f"suwayomi_{m_id}",
            "title": m.get("title") or "Untitled",
            "cover_url": cover_url,
            "url": m.get("realUrl") or m.get("url") or "",
            "status": status,
            "source": self.id,
            "source_name": self.name
        }

    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        try:
            data = suwayomi_client.get_popular(self._source_id, page=page)
            raw_list = data.get("mangaList") or []
            has_next = bool(data.get("hasNextPage", False))
            items = [self._format_manga_item(m) for m in raw_list]
            return {
                "items": items,
                "page": page,
                "limit": limit,
                "total": 9999 if has_next else (page * len(items)),
                "has_next": has_next
            }
        except Exception as e:
            logger.error(f"Error getting popular from source {self._source_id}: {e}")
            return {"items": [], "page": page, "limit": limit, "total": 0, "has_next": False}

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        try:
            data = suwayomi_client.get_latest(self._source_id, page=page)
            raw_list = data.get("mangaList") or []
            has_next = bool(data.get("hasNextPage", False))
            items = [self._format_manga_item(m) for m in raw_list]
            return {
                "items": items,
                "page": page,
                "limit": limit,
                "total": 9999 if has_next else (page * len(items)),
                "has_next": has_next
            }
        except Exception as e:
            logger.error(f"Error getting latest from source {self._source_id}: {e}")
            return {"items": [], "page": page, "limit": limit, "total": 0, "has_next": False}

    def _build_filter_changes(self, kwargs):
        """
        Translates query kwargs and frontend filter params into Suwayomi's FilterChange list:
        [{ "position": int, "state": str }]
        """
        changes = []
        raw_filters = self.get_filters()
        if not raw_filters:
            return changes

        # Check if direct filter_changes or filters JSON was sent
        filters_json = kwargs.get("filters")
        if filters_json:
            try:
                if isinstance(filters_json, str):
                    filters_json = json.loads(filters_json)
                if isinstance(filters_json, list):
                    # Frontend sent serialized list of filter objects
                    for idx, f in enumerate(filters_json):
                        pos = f.get("position", idx)
                        st = f.get("state")
                        if st is not None:
                            changes.append({"position": pos, "state": str(st)})
                    return changes
            except Exception:
                pass

        # Process filter_N keys from query parameters
        for pos, f in enumerate(raw_filters):
            f_id = f.get("id") or f"filter_{pos}"
            f_type = f.get("type")

            if f_type == "select":
                val = kwargs.get(f_id) or kwargs.get(f.get("name", "").lower())
                if val is not None:
                    if isinstance(val, str) and not val.isdigit() and val in f.get("values", []):
                        val_idx = f["values"].index(val)
                    else:
                        try:
                            val_idx = int(val)
                        except Exception:
                            val_idx = 0
                    if val_idx != int(f.get("default") or 0):
                        changes.append({"position": pos, "state": str(val_idx)})

            elif f_type == "checkbox":
                val = kwargs.get(f_id)
                if val is not None:
                    bool_val = str(val).lower() in ("1", "true", "yes")
                    if bool_val != bool(f.get("default")):
                        changes.append({"position": pos, "state": "true" if bool_val else "false"})

            elif f_type == "tristate":
                val = kwargs.get(f_id)
                if val is not None:
                    try:
                        int_val = int(val)
                        if int_val != int(f.get("default") or 0):
                            changes.append({"position": pos, "state": str(int_val)})
                    except Exception:
                        pass

            elif f_type == "text":
                val = kwargs.get(f_id)
                if val is not None and str(val).strip():
                    if str(val).strip() != str(f.get("default") or "").strip():
                        changes.append({"position": pos, "state": str(val).strip()})

            elif f_type == "sort":
                sort_idx = kwargs.get(f"{f_id}_idx") or kwargs.get(f_id)
                ascending = str(kwargs.get("ascending", "false")).lower() in ("1", "true")
                if sort_idx is not None:
                    try:
                        s_i = int(sort_idx)
                        def_idx = f.get("default", {}).get("index") if isinstance(f.get("default"), dict) else 0
                        def_asc = f.get("default", {}).get("ascending", False) if isinstance(f.get("default"), dict) else False
                        if s_i != def_idx or ascending != def_asc:
                            changes.append({
                                "position": pos,
                                "state": json.dumps({"index": s_i, "ascending": ascending})
                            })
                    except Exception:
                        pass

            elif f_type == "group":
                # Group item changes
                children = f.get("state") or []
                for c_idx, child in enumerate(children):
                    c_id = child.get("id") or f"{f_id}_{c_idx}"
                    c_val = kwargs.get(c_id)
                    if c_val is not None:
                        c_default = child.get("default")
                        c_type = child.get("type")
                        if c_type == "checkbox":
                            bool_val = str(c_val).lower() in ("1", "true", "yes")
                            if bool_val != bool(c_default):
                                changes.append({
                                    "position": pos,
                                    "state": json.dumps({"position": c_idx, "state": "true" if bool_val else "false"})
                                })
                        elif c_type == "tristate":
                            try:
                                int_val = int(c_val)
                                if int_val != int(c_default or 0):
                                    changes.append({
                                        "position": pos,
                                        "state": json.dumps({"position": c_idx, "state": str(int_val)})
                                    })
                            except Exception:
                                pass

        return changes

    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        try:
            filter_changes = self._build_filter_changes(kwargs)
            data = suwayomi_client.search(
                self._source_id,
                query=query or "",
                page=page,
                filter_changes=filter_changes
            )
            raw_list = data.get("mangaList") or []
            has_next = bool(data.get("hasNextPage", False))
            items = [self._format_manga_item(m) for m in raw_list]
            return {
                "items": items,
                "page": page,
                "limit": limit,
                "total": 9999 if has_next else (page * len(items)),
                "has_next": has_next
            }
        except Exception as e:
            logger.error(f"Error searching source {self._source_id}: {e}")
            return {"items": [], "page": page, "limit": limit, "total": 0, "has_next": False}

    def get_details(self, manga_id: str, refresh: bool = False, **kwargs) -> dict:
        raw_id = str(manga_id).replace("suwayomi_", "")
        try:
            if refresh:
                try:
                    suwayomi_client.fetch_manga_and_chapters_online(raw_id)
                except Exception as ex:
                    logger.warning(f"Failed to fetch online details update for {raw_id}: {ex}")

            m = suwayomi_client.get_manga(raw_id)
            if not m:
                return {}

            status_str = (m.get("status") or "").upper()
            status = "Completed" if status_str == "COMPLETED" else "Ongoing"

            return {
                "id": f"suwayomi_{raw_id}",
                "title": m.get("title") or "Untitled",
                "cover_url": f"/api/suwayomi/thumbnail/{raw_id}",
                "summary": m.get("description") or "",
                "description": m.get("description") or "",
                "author": m.get("author") or "",
                "artist": m.get("artist") or "",
                "status": status,
                "genres": m.get("genre") or [],
                "source": self.id,
                "source_name": self.name,
                "url": m.get("realUrl") or m.get("url") or ""
            }
        except Exception as e:
            logger.error(f"Error getting manga details for {manga_id}: {e}")
            return {}

    def get_chapters(self, manga_id: str, limit: int = 10000, offset: int = 0, refresh: bool = False, **kwargs) -> list:
        raw_id = str(manga_id).replace("suwayomi_", "")
        try:
            if refresh:
                try:
                    suwayomi_client.fetch_manga_and_chapters_online(raw_id)
                except Exception as ex:
                    logger.warning(f"Failed to fetch online chapter update for {raw_id}: {ex}")
            else:
                # If chapters haven't been fetched in over 15 minutes (900s), check/fetch online
                try:
                    meta = suwayomi_client.get_manga_online_status(raw_id)
                    if meta:
                        age = int(meta.get("chaptersAge") or 0)
                        if age > 900:
                            logger.info(f"Manga {raw_id} chaptersAge={age}s (>900s), auto-refreshing from online extension...")
                            suwayomi_client.fetch_manga_and_chapters_online(raw_id)
                except Exception as ex:
                    logger.debug(f"Could not check manga age: {ex}")

            raw_chapters = suwayomi_client.get_chapters(raw_id)
            chapters = []
            for ch in raw_chapters:
                ch_idx = ch.get("index")
                ch_num = ch.get("chapterNumber")
                if ch_num is None or ch_num < 0:
                    ch_num = float(ch_idx) if ch_idx is not None else 0.0

                ch_name = ch.get("name") or f"Chapter {ch_num}"
                chapters.append({
                    "id": f"suwayomi_{raw_id}_{ch_idx}",
                    "manga_id": f"suwayomi_{raw_id}",
                    "chapter_number": ch_num,
                    "title": ch_name,
                    "url": ch.get("realUrl") or ch.get("url") or "",
                    "date_upload": ch.get("uploadDate", ""),
                    "scanlator": ch.get("scanlator") or "",
                    "is_downloaded": bool(ch.get("downloaded", False))
                })

            return chapters[offset: offset + limit]
        except Exception as e:
            logger.error(f"Error getting chapters for {manga_id}: {e}")
            return []

    def get_chapter_pages(self, chapter_id: str) -> list:
        """
        chapter_id: format 'suwayomi_{manga_id}_{chapter_index}'
        """
        parts = str(chapter_id).split("_")
        if len(parts) >= 3 and parts[0] == "suwayomi":
            manga_id = parts[1]
            chapter_index = parts[2]
        else:
            return []

        try:
            ch_data = suwayomi_client.get_chapter(manga_id, chapter_index)
            if not ch_data:
                return []

            page_count = ch_data.get("pageCount") or 0
            if page_count <= 0:
                # Trigger fetch by loading page 0 if not yet initialized
                try:
                    p0 = suwayomi_client.get_chapter_page_url(manga_id, chapter_index, 0)
                    with urllib.request.urlopen(p0, timeout=10) as _:
                        pass
                    # Re-fetch chapter info to get updated pageCount
                    ch_data = suwayomi_client.get_chapter(manga_id, chapter_index)
                    page_count = ch_data.get("pageCount") or 0
                except Exception:
                    pass

            return [
                f"/api/suwayomi/manga/{manga_id}/chapter/{chapter_index}/page/{i}"
                for i in range(page_count)
            ]
        except Exception as e:
            logger.error(f"Error getting chapter pages for {chapter_id}: {e}")
            return []
