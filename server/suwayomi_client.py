import os
import sys
import time
import json
import socket
import logging
import subprocess
from urllib.parse import quote
import requests
from requests.adapters import HTTPAdapter

logger = logging.getLogger("suwayomi_client")

SUWAYOMI_PORT = 4567
SUWAYOMI_BASE = f"http://127.0.0.1:{SUWAYOMI_PORT}"
JAR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "suwayomi-server.jar")

class SuwayomiClient:
    def __init__(self, base_url=SUWAYOMI_BASE, jar_path=JAR_PATH):
        self.base_url = base_url.rstrip("/")
        self.jar_path = jar_path
        self._proc = None
        self._session = requests.Session()
        adapter = HTTPAdapter(pool_connections=25, pool_maxsize=25)
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)

    def is_port_in_use(self, port=SUWAYOMI_PORT):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            return s.connect_ex(("127.0.0.1", port)) == 0

    def is_healthy(self):
        try:
            res = self._session.get(
                f"{self.base_url}/api/v1/source/list",
                headers={"User-Agent": "MihonWeb/1.0"},
                timeout=3.0
            )
            return res.status_code == 200
        except Exception:
            return False

    def ensure_server(self, timeout=45):
        """
        Ensures Suwayomi-Server is running. If not, spawns the JAR and waits for health.
        """
        if self.is_healthy():
            return True

        if not os.path.isfile(self.jar_path):
            raise FileNotFoundError(f"Suwayomi-Server JAR not found at {self.jar_path}")

        print("Starting Suwayomi-Server headless background process...")
        cmd = [
            "java",
            "-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false",
            "-Dsuwayomi.tachidesk.config.server.systemTrayEnabled=false",
            f"-Dsuwayomi.tachidesk.config.server.port={SUWAYOMI_PORT}",
            "-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1",
            "-jar",
            self.jar_path
        ]

        # Spawn detached on Windows
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)

        self._proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags
        )

        start_time = time.time()
        while time.time() - start_time < timeout:
            time.sleep(1.5)
            if self.is_healthy():
                print(f"Suwayomi-Server is up and ready at {self.base_url}")
                return True

        raise TimeoutError(f"Suwayomi-Server did not become healthy within {timeout} seconds")

    def _request(self, endpoint, method="GET", data=None, params=None, timeout=30):
        url = f"{self.base_url}{endpoint}"
        headers = {
            "User-Agent": "MihonWeb/1.0",
            "Accept": "application/json"
        }

        try:
            res = self._session.request(
                method=method,
                url=url,
                json=data if data is not None else None,
                params=params,
                headers=headers,
                timeout=timeout
            )
            if res.status_code >= 400:
                logger.error(f"Suwayomi API Error {res.status_code} on {method} {url}: {res.text}")
                raise RuntimeError(f"Suwayomi API error {res.status_code}: {res.text}")
            if not res.content:
                return None
            try:
                return res.json()
            except Exception:
                return res.content
        except Exception as e:
            logger.error(f"Suwayomi Connection Error on {method} {url}: {e}")
            raise

    # ----------------- EXTENSIONS -----------------

    def get_extensions(self):
        """Returns all extensions from repo with installed state."""
        return self._request("/api/v1/extension/list") or []

    def install_extension(self, pkg_name):
        """Installs and compiles extension APK into JVM runtime."""
        return self._request(f"/api/v1/extension/install/{quote(pkg_name)}", method="GET", timeout=60)

    def uninstall_extension(self, pkg_name):
        """Uninstalls and unloads extension."""
        return self._request(f"/api/v1/extension/uninstall/{quote(pkg_name)}", method="GET", timeout=30)

    # ----------------- SOURCES -----------------

    def get_sources(self):
        """Returns list of all installed sources."""
        return self._request("/api/v1/source/list") or []

    def get_source(self, source_id):
        return self._request(f"/api/v1/source/{source_id}")

    def get_filters(self, source_id):
        """Returns raw filter list from Suwayomi for given source."""
        return self._request(f"/api/v1/source/{source_id}/filters") or []

    def get_popular(self, source_id, page=1):
        return self._request(f"/api/v1/source/{source_id}/popular/{page}") or {}

    def get_latest(self, source_id, page=1):
        return self._request(f"/api/v1/source/{source_id}/latest/{page}") or {}

    def search(self, source_id, query="", page=1, filter_changes=None):
        """
        Executes quick-search with optional filter changes.
        filter_changes: list of {"position": int, "state": str}
        """
        payload = {
            "searchTerm": query or "",
            "filter": filter_changes or []
        }
        return self._request(
            f"/api/v1/source/{source_id}/quick-search",
            method="POST",
            data=payload,
            params={"pageNum": page},
            timeout=40
        ) or {}

    # ----------------- MANGA & CHAPTERS -----------------

    def get_manga(self, manga_id):
        return self._request(f"/api/v1/manga/{manga_id}")

    def get_chapters(self, manga_id):
        return self._request(f"/api/v1/manga/{manga_id}/chapters") or []

    def get_chapter(self, manga_id, chapter_index):
        return self._request(f"/api/v1/manga/{manga_id}/chapter/{chapter_index}")

    def get_chapter_page_url(self, manga_id, chapter_index, page_index):
        return f"{self.base_url}/api/v1/manga/{manga_id}/chapter/{chapter_index}/page/{page_index}"

    # ----------------- GRAPHQL & ONLINE SYNC -----------------

    def graphql(self, query, variables=None, timeout=30):
        """Executes a GraphQL query/mutation on Suwayomi Server."""
        url = f"{self.base_url}/api/graphql"
        headers = {
            "User-Agent": "MihonWeb/1.0",
            "Content-Type": "application/json"
        }
        try:
            res = self._session.post(
                url,
                json={"query": query, "variables": variables or {}},
                headers=headers,
                timeout=timeout
            )
            if res.status_code >= 400:
                logger.error(f"Suwayomi GraphQL Error {res.status_code}: {res.text}")
                return None
            data = res.json()
            if "errors" in data and data["errors"]:
                logger.error(f"Suwayomi GraphQL Error payload: {data['errors']}")
            return data.get("data")
        except Exception as e:
            logger.error(f"Suwayomi GraphQL request failed: {e}")
            return None

    def fetch_manga_and_chapters_online(self, manga_id, timeout=60):
        """
        Triggers Suwayomi extension engine to scrape and sync latest manga details and chapters online.
        """
        try:
            m_id = int(str(manga_id).replace("suwayomi_", ""))
        except (ValueError, TypeError):
            return None

        q = """
        mutation FetchOnline($id: Int!) {
          fetchMangaAndChapters(input: { id: $id, fetchChapters: true, fetchManga: true }) {
            manga {
              id
              title
            }
          }
        }
        """
        return self.graphql(q, variables={"id": m_id}, timeout=timeout)

    def get_manga_online_status(self, manga_id):
        """Returns chaptersAge and inLibrary metadata from Suwayomi."""
        try:
            m_id = int(str(manga_id).replace("suwayomi_", ""))
        except (ValueError, TypeError):
            return None

        q = """
        query GetMangaAge($id: Int!) {
          manga(id: $id) {
            id
            title
            chaptersAge
            inLibrary
          }
        }
        """
        data = self.graphql(q, variables={"id": m_id}, timeout=10)
        return data.get("manga") if data else None

suwayomi_client = SuwayomiClient()

