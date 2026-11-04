import os
import json
import time
import logging
from server.db import get_db
from server.suwayomi_client import suwayomi_client

logger = logging.getLogger("extension_manager")

CACHE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "extensions_cache.json")
CACHE_TTL = 3600  # 1 hour

DEFAULT_REPOS = [
    {
        "id": "keiyoushi",
        "name": "Keiyoushi Extensions",
        "url": "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json",
        "website": "https://keiyoushi.github.io"
    }
]

class ExtensionManager:
    def __init__(self):
        self._cached_extensions = []
        self._last_fetch_time = 0
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        self._init_tables()
        self._load_disk_cache()

    def _init_tables(self):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS extension_repos (
            id TEXT PRIMARY KEY,
            name TEXT,
            url TEXT UNIQUE,
            enabled INTEGER DEFAULT 1,
            created_at REAL
        )
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS installed_extensions (
            pkg TEXT PRIMARY KEY,
            name TEXT,
            version TEXT,
            lang TEXT,
            icon_url TEXT,
            sources_json TEXT,
            installed_at REAL
        )
        """)

        for repo in DEFAULT_REPOS:
            cursor.execute("""
            INSERT OR IGNORE INTO extension_repos (id, name, url, enabled, created_at)
            VALUES (?, ?, ?, 1, ?)
            """, (repo["id"], repo["name"], repo["url"], time.time()))

        # Local storage placeholder
        cursor.execute("""
        INSERT OR IGNORE INTO installed_extensions (pkg, name, version, lang, icon_url, sources_json, installed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            "local.storage",
            "Local Storage",
            "1.0.0",
            "all",
            "/static/img/local-icon.png",
            json.dumps([{"id": "local", "name": "Local Storage", "language": "all", "homeUrl": ""}]),
            time.time()
        ))

        conn.commit()
        conn.close()

    def _load_disk_cache(self):
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._cached_extensions = data.get("extensions", [])
                    self._last_fetch_time = data.get("timestamp", 0)
            except Exception as e:
                logger.error(f"Could not load extensions cache: {e}")

    def _save_disk_cache(self):
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "timestamp": self._last_fetch_time,
                    "extensions": self._cached_extensions
                }, f)
        except Exception as e:
            logger.error(f"Could not save extensions cache: {e}")

    def get_repos(self):
        conn = get_db()
        rows = conn.execute("SELECT * FROM extension_repos ORDER BY created_at ASC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def add_repo(self, url, name=None):
        url = url.strip()
        if not name:
            name = "Extension Repository"
            if "keiyoushi" in url.lower():
                name = "Keiyoushi Extensions"

        repo_id = "repo_" + str(abs(hash(url)))[:8]
        conn = get_db()
        conn.execute("""
        INSERT OR REPLACE INTO extension_repos (id, name, url, enabled, created_at)
        VALUES (?, ?, ?, 1, ?)
        """, (repo_id, name, url, time.time()))
        conn.commit()
        conn.close()

        self._last_fetch_time = 0
        return {"id": repo_id, "name": name, "url": url}

    def remove_repo(self, repo_id):
        conn = get_db()
        conn.execute("DELETE FROM extension_repos WHERE id = ?", (repo_id,))
        conn.commit()
        conn.close()
        self._last_fetch_time = 0
        return True

    def fetch_all_extensions(self, force=False):
        now = time.time()
        if not force and self._cached_extensions and (now - self._last_fetch_time < CACHE_TTL):
            return self._cached_extensions

        try:
            if suwayomi_client.is_healthy():
                sw_exts = suwayomi_client.get_extensions()
                if sw_exts and len(sw_exts) > 0:
                    formatted = []
                    for e in sw_exts:
                        pkg = e.get("pkgName")
                        if not pkg:
                            continue
                        name = e.get("name") or pkg
                        lang = e.get("lang") or "all"
                        ver = e.get("versionName") or "1.0.0"
                        icon = f"/api/suwayomi/ext_icon/{pkg}" if e.get("iconUrl") else "/static/img/default-cover.png"
                        nsfw = bool(e.get("isNsfw", False))
                        installed = bool(e.get("installed", False))

                        formatted.append({
                            "pkg": pkg,
                            "name": name,
                            "version": ver,
                            "lang": lang,
                            "icon_url": icon,
                            "nsfw": nsfw,
                            "is_installed": installed,
                            "installed": installed,
                            "repo_name": "Keiyoushi"
                        })

                    formatted.sort(key=lambda x: x["name"].lower())
                    self._cached_extensions = formatted
                    self._last_fetch_time = now
                    self._save_disk_cache()
                    return self._cached_extensions
        except Exception as e:
            logger.error(f"Error fetching extensions from Suwayomi: {e}")

        return self._cached_extensions

    def get_installed(self):
        """Returns all installed extensions."""
        installed = []
        try:
            if suwayomi_client.is_healthy():
                sw_exts = suwayomi_client.get_extensions()
                for e in sw_exts:
                    if e.get("installed"):
                        e_lang = (e.get("lang") or "all").strip().lower()
                        if e_lang not in ("en", "all"):
                            continue
                        pkg = e.get("pkgName")
                        installed.append({
                            "pkg": pkg,
                            "name": e.get("name") or pkg,
                            "version": e.get("versionName") or "1.0.0",
                            "lang": e_lang,
                            "icon_url": f"/api/suwayomi/ext_icon/{pkg}",
                            "is_installed": True,
                            "installed": True
                        })
        except Exception as e:
            logger.error(f"Error querying installed extensions from Suwayomi: {e}")

        # Always include Local Storage
        if not any(x["pkg"] == "local.storage" for x in installed):
            installed.append({
                "pkg": "local.storage",
                "name": "Local Storage",
                "version": "1.0.0",
                "lang": "all",
                "icon_url": "/static/img/local-icon.png",
                "is_installed": True,
                "installed": True
            })

        return installed

    def install(self, pkg):
        if not pkg:
            raise ValueError("Missing package name")

        logger.info(f"Installing extension: {pkg}")
        try:
            if suwayomi_client.is_healthy():
                suwayomi_client.install_extension(pkg)
                # Invalidate sources cache
                import server.sources as s_module
                s_module._SUWAYOMI_SOURCE_CACHE.clear()
        except Exception as e:
            logger.warning(f"Note: Suwayomi could not install APK for {pkg} (saved as active source): {e}")

        # Save to DB record
        all_exts = self.fetch_all_extensions()
        ext = next((x for x in all_exts if x["pkg"] == pkg), None)

        conn = get_db()
        conn.execute("""
        INSERT OR REPLACE INTO installed_extensions 
        (pkg, name, version, lang, icon_url, sources_json, installed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            pkg,
            ext["name"] if ext else pkg,
            ext["version"] if ext else "1.0.0",
            ext["lang"] if ext else "all",
            ext["icon_url"] if ext else "",
            json.dumps([]),
            time.time()
        ))
        conn.commit()
        conn.close()

        # Invalidate cache
        self._last_fetch_time = 0
        return ext or {"pkg": pkg, "name": pkg, "is_installed": True}

    def uninstall(self, pkg):
        if pkg in ["local.storage", "local"]:
            raise ValueError("Core system sources cannot be uninstalled.")

        logger.info(f"Uninstalling extension: {pkg}")
        try:
            if suwayomi_client.is_healthy():
                suwayomi_client.uninstall_extension(pkg)
                import server.sources as s_module
                s_module._SUWAYOMI_SOURCE_CACHE.clear()
        except Exception as e:
            logger.error(f"Error uninstalling extension {pkg} via Suwayomi: {e}")

        conn = get_db()
        conn.execute("DELETE FROM installed_extensions WHERE pkg = ? OR pkg LIKE ?", (pkg, f"%.{pkg}"))
        conn.commit()
        conn.close()

        # Invalidate cache
        self._last_fetch_time = 0
        return True

    def search_extensions(self, query="", lang="all", page=1, limit=30):
        all_exts = self.fetch_all_extensions()

        # Build set of installed pkgs
        installed_pkgs = {x["pkg"] for x in self.get_installed()}

        q = query.lower().strip()
        filtered = []
        for ext in all_exts:
            ext_lang = (ext.get("lang") or "all").strip().lower()
            # Strictly restrict to English and All extensions
            if ext_lang not in ("en", "all"):
                continue

            if lang != "all" and ext_lang != lang.lower() and ext_lang != "all":
                continue
            if q:
                match_name = q in ext["name"].lower()
                match_pkg = q in ext["pkg"].lower()
                if not (match_name or match_pkg):
                    continue

            ext_copy = dict(ext)
            ext_copy["is_installed"] = ext["pkg"] in installed_pkgs
            filtered.append(ext_copy)

        total = len(filtered)
        start = (page - 1) * limit
        end = start + limit
        paged = filtered[start:end]

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit if limit > 0 else 1,
            "extensions": paged
        }

extension_manager = ExtensionManager()
