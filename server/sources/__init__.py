import os
import json
import logging
from server.sources.local_source import LocalSource
from server.sources.mangadex_source import MangaDexSource
from server.sources.mangapill_source import MangaPillSource
from server.sources.asura_source import AsuraScansSource
from server.sources.mangafire_source import MangaFireSource
from server.sources.manga18_source import Manga18Source
from server.sources.suwayomi_source import SuwayomiSource
from server.suwayomi_client import suwayomi_client
from server.db import get_db

logger = logging.getLogger("sources_registry")

_LOCAL_SOURCES = {
    "local": LocalSource(),
    "mangadex": MangaDexSource(),
    "mangapill": MangaPillSource(),
    "asurascans": AsuraScansSource(),
    "mangafire": MangaFireSource(),
    "manga18": Manga18Source()
}

DEDICATED_PKG_MAP = {
    "local.storage": "local"
}

_SUWAYOMI_SOURCE_CACHE = {}

def get_source(source_id: str):
    """
    Get source instance by ID, package name, or extension name.
    """
    if not source_id:
        return None

    sid = str(source_id).strip()
    raw_sid = sid.replace("suwayomi_", "")
    clean_sid = sid.lower().replace(" ", "").replace(".", "").replace("-", "")
    clean_raw_sid = raw_sid.lower().replace(" ", "").replace(".", "").replace("-", "")

    # 1. Local and dedicated scrapers priority
    if clean_sid in ("local", "localstorage"):
        return _LOCAL_SOURCES["local"]
    if sid.lower() in _LOCAL_SOURCES:
        return _LOCAL_SOURCES[sid.lower()]
    if clean_sid in ("asura", "asurascans"):
        return _LOCAL_SOURCES.get("asurascans")
    if clean_sid in ("mangafire", "mangafireto"):
        return _LOCAL_SOURCES.get("mangafire")
    if clean_sid in ("manga18", "manga18fx"):
        return _LOCAL_SOURCES.get("manga18")

    # 2. Check Suwayomi runtime sources
    try:
        if suwayomi_client.is_healthy():
            sw_sources = suwayomi_client.get_sources()
            for s in sw_sources:
                s_id = str(s.get("id"))
                if s_id == "0":
                    continue  # Suwayomi internal local stub

                s_name = (s.get("name") or "").strip()
                s_disp = (s.get("displayName") or "").strip()
                s_pkg = (s.get("pkgName") or "").strip()

                s_clean_name = s_name.lower().replace(" ", "").replace(".", "").replace("-", "")
                s_clean_disp = s_disp.lower().replace(" ", "").replace(".", "").replace("-", "")
                s_clean_pkg = s_pkg.lower().replace(" ", "").replace(".", "").replace("-", "")
                s_pkg_suffix = s_pkg.split(".")[-1].lower() if "." in s_pkg else s_pkg.lower()

                if (raw_sid == s_id or
                    sid == s_id or
                    clean_sid == s_clean_name or
                    clean_sid == s_clean_disp or
                    clean_sid == s_clean_pkg or
                    clean_sid == s_pkg_suffix or
                    clean_raw_sid == s_clean_name or
                    clean_raw_sid == s_clean_disp or
                    clean_raw_sid == s_clean_pkg or
                    clean_raw_sid == s_pkg_suffix):

                    if s_id not in _SUWAYOMI_SOURCE_CACHE:
                        _SUWAYOMI_SOURCE_CACHE[s_id] = SuwayomiSource(s)
                    return _SUWAYOMI_SOURCE_CACHE[s_id]
    except Exception as e:
        logger.error(f"Error querying Suwayomi sources in get_source: {e}")

    # 3. Direct dedicated registry fallback
    if sid.lower() in _LOCAL_SOURCES:
        return _LOCAL_SOURCES[sid.lower()]
    if clean_sid in _LOCAL_SOURCES:
        return _LOCAL_SOURCES[clean_sid]

    return None

def get_all_sources():
    """
    Returns list of all available sources: local storage + installed Suwayomi extensions.
    """
    sources_dict = {}

    # 1. Always include Local Storage
    local_src = _LOCAL_SOURCES["local"]
    sources_dict["local"] = {
        "id": "local",
        "name": local_src.name,
        "version": local_src.version,
        "icon_url": local_src.icon_url,
        "lang": "all",
        "pkg": "local.storage",
        "supports_latest": False
    }

    # 2. Add all installed Suwayomi sources
    try:
        if suwayomi_client.is_healthy():
            sw_sources = suwayomi_client.get_sources()
            for s in sw_sources:
                s_id = str(s.get("id"))
                if s_id == "0":
                    continue  # Suwayomi internal local stub

                s_disp = s.get("displayName") or s.get("name") or f"Source {s_id}"
                s_base = s.get("name") or s_disp
                s_lang = (s.get("lang") or "all").strip().lower()

                # Strictly allow only English and All sources; hide all other languages
                if s_lang not in ("en", "all", "local"):
                    continue

                s_pkg = s.get("pkgName") or ""
                if not s_pkg:
                    icon_val = s.get("iconUrl") or ""
                    if "/extension/icon/" in icon_val:
                        s_pkg = icon_val.split("/extension/icon/")[-1]
                    elif "/icon/" in icon_val:
                        s_pkg = icon_val.split("/icon/")[-1]

                s_icon = f"/api/suwayomi/icon/{s_id}" if s.get("iconUrl") else "/static/img/default-cover.png"
                supports_latest = bool(s.get("supportsLatest", True))

                sources_dict[s_id] = {
                    "id": s_id,
                    "name": s_disp,
                    "base_name": s_base,
                    "version": s.get("version", "1.0.0"),
                    "icon_url": s_icon,
                    "lang": s_lang,
                    "pkg": s_pkg,
                    "supports_latest": supports_latest
                }
    except Exception as e:
        logger.error(f"Error querying Suwayomi sources in get_all_sources: {e}")

    return list(sources_dict.values())
