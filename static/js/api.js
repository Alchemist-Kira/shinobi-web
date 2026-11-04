// API Client Helper - Shinobi Web Serverless Edition
// Routes all library, progress, history, and settings storage to client-side IndexedDB
const API = {
  _ensureFreshState() {
    try {
      if (!localStorage.getItem('shinobi_fresh_start_clean_v3')) {
        localStorage.removeItem('shinobi_installed_sources');
        localStorage.removeItem('mihon_pinned_sources');
        localStorage.removeItem('shinobi_repo_exts_cache');
        localStorage.setItem('shinobi_fresh_start_clean_v3', 'true');
      }
    } catch (e) {}
  },

  isIncognito() {
    return (typeof State !== 'undefined' && State.incognitoMode) || localStorage.getItem('shinobi_incognito') === 'true';
  },

  async get(url, params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) {
        v.forEach(item => searchParams.append(k, item));
      } else {
        searchParams.append(k, v);
      }
    });
    const query = searchParams.toString();
    const fullUrl = query ? `${url}?${query}` : url;
    const headers = {};
    if (this.isIncognito()) {
      headers['X-Incognito'] = 'true';
    }
    try {
      const res = await fetch(fullUrl, { headers });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Fetch GET ${fullUrl} failed:`, err);
      throw err;
    }
  },

  async post(url, data = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.isIncognito()) {
      headers['X-Incognito'] = 'true';
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Fetch POST ${url} failed:`, err);
      throw err;
    }
  },

  async delete(url) {
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`Fetch DELETE ${url} failed:`, err);
      throw err;
    }
  },

  // -------------------------------------------------------------
  // Library & Categories (Client-Side IndexedDB Storage)
  // -------------------------------------------------------------
  getLibrary: async () => {
    if (window.Storage) return await Storage.getLibrary();
    try { return await API.get('/api/library'); } catch (e) { return []; }
  },

  addToLibrary: async (manga) => {
    if (window.Storage) return await Storage.addToLibrary(manga);
    return API.post('/api/library/add', manga);
  },

  removeFromLibrary: async (mangaId, options = {}) => {
    if (window.Storage) return await Storage.removeFromLibrary(mangaId);
    return API.delete(`/api/library/${encodeURIComponent(mangaId)}`);
  },

  deleteChapterDownload: async (mangaId, chapterId) => {
    return { success: true };
  },

  deleteMangaDownloads: async (mangaId) => {
    return { success: true };
  },

  deleteDownloadsByScanlator: async (mangaId, scanlator) => {
    return { success: true };
  },

  getChapterSettings: async (mangaId) => {
    if (window.Storage) return await Storage.getChapterSettings(mangaId);
    try { return await API.get(`/api/manga/${encodeURIComponent(mangaId)}/chapter-settings`); } catch (e) { return {}; }
  },

  saveChapterSettings: async (mangaId, settings) => {
    if (window.Storage) return await Storage.saveChapterSettings(mangaId, settings);
    return API.post(`/api/manga/${encodeURIComponent(mangaId)}/chapter-settings`, settings);
  },

  getCategories: async () => {
    if (window.Storage) return await Storage.getCategories();
    try { return await API.get('/api/categories'); } catch (e) { return []; }
  },

  createCategory: async (name) => {
    if (window.Storage) return await Storage.createCategory(name);
    return API.post('/api/categories', { name });
  },

  deleteCategory: async (catId) => {
    if (window.Storage) return await Storage.deleteCategory(catId);
    return API.delete(`/api/categories/${catId}`);
  },

  setMangaCategory: async (mangaId, categoryId) => {
    if (window.Storage) return await Storage.setMangaCategories(mangaId, [categoryId]);
    return API.post(`/api/library/${encodeURIComponent(mangaId)}/category`, { category_id: categoryId });
  },

  setMangaCategories: async (mangaId, categoryIds) => {
    if (window.Storage) return await Storage.setMangaCategories(mangaId, categoryIds);
    return API.post(`/api/library/${encodeURIComponent(mangaId)}/category`, { category_ids: categoryIds });
  },

  getDownloadedChapters: async (mangaId) => {
    return [];
  },

  updateLibrary: async (options = {}) => {
    return { success: true, message: 'Library is up to date' };
  },

  getLibraryUpdateStatus: async () => {
    return { is_updating: false, progress: { current: 0, total: 0 } };
  },

  clearMangaNewChapters: async (mangaId) => {
    return { success: true };
  },

  batchSetCategories: async (mangaIds, categoryIds) => {
    if (window.Storage) return await Storage.batchSetCategories(mangaIds, categoryIds);
    return API.post('/api/library/batch/category', { manga_ids: mangaIds, category_ids: categoryIds });
  },

  batchMarkRead: async (mangaIds, isRead = true) => {
    if (window.Storage) return await Storage.batchMarkRead(mangaIds, isRead);
    return API.post('/api/library/batch/mark-read', { manga_ids: mangaIds, is_read: isRead });
  },

  batchDownloadNext: async (mangaIds, count = 1) => {
    return { success: true };
  },

  batchRemoveFromLibrary: async (mangaIds, deleteChapters = false) => {
    if (window.Storage) return await Storage.batchRemoveFromLibrary(mangaIds);
    return API.post('/api/library/batch/remove', { manga_ids: mangaIds, delete_chapters: deleteChapters });
  },

  batchMarkChapters: async (mangaId, chapterIds, { is_read, is_bookmarked } = {}) => {
    if (window.Storage) {
      for (const chId of chapterIds) {
        await Storage.saveProgress({
          manga_id: mangaId,
          chapter_id: chId,
          is_read: is_read !== undefined ? (is_read ? 1 : 0) : undefined,
          is_bookmarked: is_bookmarked !== undefined ? (is_bookmarked ? 1 : 0) : undefined
        });
      }
      return { success: true };
    }
    return API.post(`/api/manga/${encodeURIComponent(mangaId)}/chapters/batch/mark`, { chapter_ids: chapterIds, is_read, is_bookmarked });
  },

  batchDownloadChapters: async (mangaId, chapters) => {
    return { success: true };
  },

  batchDeleteChapters: async (mangaId, chapters) => {
    return { success: true };
  },

  // -------------------------------------------------------------
  // Sources & Manga Browsing
  // -------------------------------------------------------------
  // Sources & Manga Browsing
  // -------------------------------------------------------------
  _getInstalledPkgList() {
    try {
      const raw = localStorage.getItem('shinobi_installed_sources');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  _saveInstalledPkgList(pkgs) {
    localStorage.setItem('shinobi_installed_sources', JSON.stringify(pkgs));
  },

  _parseRepoExtensions(rawJson, repoName = 'Keiyoushi') {
    let list = [];
    if (Array.isArray(rawJson)) {
      list = rawJson;
    } else if (rawJson && rawJson.extensionList && Array.isArray(rawJson.extensionList.extensions)) {
      list = rawJson.extensionList.extensions;
    } else if (rawJson && Array.isArray(rawJson.extensions)) {
      list = rawJson.extensions;
    }

    return list.map(item => {
      const pkg = item.packageName || item.pkg || item.id || '';
      const name = item.name || pkg;
      const ver = item.versionName || item.version || '1.0.0';
      const icon = item.resources?.iconUrl || item.icon_url || item.icon || '/static/img/default-cover.png';
      const apk = item.resources?.apkUrl || item.apk_url || '';
      const nsfw = item.contentWarning === 'CONTENT_WARNING_NSFW' || item.isNsfw || item.nsfw || false;

      let lang = 'en';
      if (item.sources && item.sources.length > 0) {
        lang = (item.sources[0].language || item.sources[0].lang || 'en').toLowerCase();
      } else if (pkg.includes('.en.')) {
        lang = 'en';
      } else if (pkg.includes('.all.')) {
        lang = 'all';
      } else if (item.lang) {
        lang = item.lang.toLowerCase();
      }

      return {
        pkg,
        name,
        version: ver,
        lang,
        icon_url: icon,
        apk_url: apk,
        nsfw,
        repo_name: repoName,
        sources: item.sources || [{ id: pkg, name, lang }]
      };
    }).filter(e => e.pkg && (e.lang === 'en' || e.lang === 'all'));
  },

  getSources: async () => {
    const localPkgs = new Set(API._getInstalledPkgList());

    // 1. Fetch server sources
    let serverSources = [];
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          serverSources = data;
        }
      }
    } catch (e) {}

    // 2. Fetch repo cache to unpack sources for client-side/newly installed extensions
    let allExts = [];
    try {
      const raw = localStorage.getItem('shinobi_repo_exts_cache');
      if (raw) allExts = JSON.parse(raw);
    } catch (e) {}

    const map = new Map();

    // Add all valid sources from server
    for (const s of serverSources) {
      if (s.id !== 'local' && s.pkg !== 'local.storage') {
        map.set(s.id, s);
        if (s.pkg) localPkgs.add(s.pkg);
      }
    }

    // Add all sources from installed packages recorded in localPkgs
    for (const pkg of localPkgs) {
      const foundExt = allExts.find(e => e.pkg === pkg);
      if (foundExt) {
        if (Array.isArray(foundExt.sources) && foundExt.sources.length > 0) {
          for (const s of foundExt.sources) {
            if (!map.has(s.id)) {
              map.set(s.id, {
                id: s.id || foundExt.pkg,
                name: s.name || foundExt.name,
                lang: (s.language || s.lang || foundExt.lang || 'en').toLowerCase(),
                pkg: foundExt.pkg,
                version: foundExt.version,
                icon_url: foundExt.icon_url,
                supports_latest: true
              });
            }
          }
        } else if (!map.has(foundExt.pkg)) {
          map.set(foundExt.pkg, {
            id: foundExt.pkg,
            name: foundExt.name,
            lang: foundExt.lang || 'en',
            pkg: foundExt.pkg,
            version: foundExt.version,
            icon_url: foundExt.icon_url,
            supports_latest: true
          });
        }
      }
    }

    // Sync back merged installed list
    API._saveInstalledPkgList(Array.from(localPkgs));

    const result = Array.from(map.values());

    // If local folder is configured, also include Local Storage
    const localPath = localStorage.getItem('shinobi_storage_folder_path') || localStorage.getItem('shinobi_local_folder');
    if (localPath) {
      result.unshift({
        id: 'local',
        name: 'Local Storage',
        lang: 'all',
        pkg: 'local.storage',
        icon_url: '/static/img/ic_local_source.png',
        supports_latest: false
      });
    }

    return result;
  },

  getExtensions: async (params = {}) => {
    // 1. Try local server first if running and has full extensions list
    if (params.force !== true && params.force !== 'true') {
      try {
        const q = new URLSearchParams(params).toString();
        const res = await fetch(`/api/extensions${q ? '?' + q : ''}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.extensions) && data.extensions.length > 5) {
            return data;
          }
        }
      } catch (e) {}
    }

    // 2. Fetch directly from Keiyoushi repository
    try {
      let cached = null;
      try {
        const rawCache = localStorage.getItem('shinobi_repo_exts_cache');
        if (rawCache && !params.force) {
          cached = JSON.parse(rawCache);
        }
      } catch (e) {}

      if (!cached || params.force === 'true' || params.force === true) {
        const repos = await API.getExtensionRepos();
        let allExts = [];
        for (const repo of repos) {
          let url = repo.url;
          if (url.includes('index.min.json')) {
            url = url.replace('index.min.json', 'index.json');
          }
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const json = await resp.json();
              const parsed = API._parseRepoExtensions(json, repo.name);
              allExts.push(...parsed);
            }
          } catch (err) {
            console.warn(`Failed to fetch repo ${repo.name}:`, err);
          }
        }

        if (allExts.length > 0) {
          allExts.sort((a, b) => a.name.localeCompare(b.name));
          cached = allExts;
          try {
            localStorage.setItem('shinobi_repo_exts_cache', JSON.stringify(cached));
          } catch (e) {}
        }
      }

      if (cached && cached.length > 0) {
        let list = [...cached];
        if (params.q) {
          const q = params.q.toLowerCase().trim();
          list = list.filter(e => e.name.toLowerCase().includes(q) || e.pkg.toLowerCase().includes(q));
        }
        if (params.lang && params.lang !== 'all') {
          list = list.filter(e => e.lang === params.lang || e.lang === 'all');
        }
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 40;
        const total = list.length;
        const pages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const paged = list.slice(start, start + limit);

        return {
          extensions: paged,
          total,
          page,
          pages
        };
      }
    } catch (e) {
      console.error('Failed to load extensions from repo:', e);
    }

    return {
      extensions: [],
      total: 0,
      pages: 1
    };
  },

  getInstalledExtensions: async () => {
    const installedPkgs = new Set(API._getInstalledPkgList());

    // Also query server installed extensions
    try {
      const res = await fetch('/api/extensions/installed');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const e of data) {
            if (e.pkg && e.pkg !== 'local.storage') {
              installedPkgs.add(e.pkg);
            }
          }
        }
      }
    } catch (e) {}

    API._saveInstalledPkgList(Array.from(installedPkgs));
    if (installedPkgs.size === 0) return [];

    let allExts = [];
    try {
      const raw = localStorage.getItem('shinobi_repo_exts_cache');
      if (raw) allExts = JSON.parse(raw);
    } catch (e) {}

    return Array.from(installedPkgs).map(pkg => {
      const found = allExts.find(e => e.pkg === pkg);
      return found || { pkg, name: pkg, is_installed: true, installed: true };
    });
  },

  installExtension: async (pkg) => {
    const list = API._getInstalledPkgList();
    if (!list.includes(pkg)) {
      list.push(pkg);
      API._saveInstalledPkgList(list);
    }
    try {
      await fetch('/api/extensions/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkg })
      });
    } catch (e) {}
    return { success: true };
  },

  uninstallExtension: async (pkg) => {
    try {
      let list = API._getInstalledPkgList();
      list = list.filter(p => p !== pkg && p !== pkg.replace('tachiyomi.en.', '') && !pkg.includes(p));
      API._saveInstalledPkgList(list);

      const pinned = new Set(JSON.parse(localStorage.getItem('mihon_pinned_sources') || '[]'));
      pinned.delete(pkg);
      pinned.delete(pkg.replace('tachiyomi.en.', ''));
      localStorage.setItem('mihon_pinned_sources', JSON.stringify(Array.from(pinned)));
    } catch (e) {}

    try {
      await fetch('/api/extensions/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkg })
      });
    } catch (e) {}
    return { success: true };
  },

  getExtensionRepos: async () => {
    try {
      const res = await fetch('/api/extensions/repos');
      if (res.ok) return await res.json();
    } catch (e) {}

    try {
      const raw = localStorage.getItem('shinobi_extension_repos');
      if (raw) return JSON.parse(raw);
    } catch (err) {}
    return [{
      id: 'keiyoushi',
      name: 'Keiyoushi (Official)',
      url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json'
    }];
  },

  addExtensionRepo: async (data) => {
    try {
      return await API.post('/api/extensions/repos', data);
    } catch (e) {
      const repos = await API.getExtensionRepos();
      const newRepo = {
        id: `repo_${Date.now()}`,
        name: data.name || 'Custom Repo',
        url: data.url
      };
      repos.push(newRepo);
      localStorage.setItem('shinobi_extension_repos', JSON.stringify(repos));
      return { success: true, repo: newRepo };
    }
  },

  deleteExtensionRepo: async (id) => {
    try {
      return await API.delete(`/api/extensions/repos/${id}`);
    } catch (e) {
      let repos = await API.getExtensionRepos();
      repos = repos.filter(r => r.id !== id);
      localStorage.setItem('shinobi_extension_repos', JSON.stringify(repos));
      return { success: true };
    }
  },

  _prefetchCache: new Map(),
  _prefetchTimer: new Map(),

  prefetchManga(sourceId, mangaId) {
    if (!sourceId || !mangaId) return;
    const key = `${sourceId}:${mangaId}`;
    if (this._prefetchCache.has(`details:${key}`)) return;
    if (this._prefetchTimer.has(key)) return;

    const timer = setTimeout(() => {
      this._prefetchTimer.delete(key);
      const detailsPromise = this.getMangaDetails(sourceId, mangaId);
      const chaptersPromise = this.getMangaChapters(sourceId, mangaId);
      this._prefetchCache.set(`details:${key}`, detailsPromise);
      this._prefetchCache.set(`chapters:${key}`, chaptersPromise);
      setTimeout(() => {
        this._prefetchCache.delete(`details:${key}`);
        this._prefetchCache.delete(`chapters:${key}`);
      }, 60000);
    }, 40);
    this._prefetchTimer.set(key, timer);
  },

  // Direct MangaDex Client Implementation (Zero Server Required)
  async _fetchMangaDex(endpoint) {
    const res = await fetch(`https://api.mangadex.org${endpoint}`);
    if (!res.ok) throw new Error(`MangaDex error ${res.status}`);
    return await res.json();
  },

  _formatMangaDexItem(item) {
    const attrs = item.attributes || {};
    const title = attrs.title?.en || (attrs.altTitles || []).find(a => a.en)?.en || Object.values(attrs.title || {})[0] || 'Untitled Manga';
    const coverRel = (item.relationships || []).find(r => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const cover_url = fileName ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg` : '/static/img/default-cover.png';
    const status = attrs.status ? attrs.status.charAt(0).toUpperCase() + attrs.status.slice(1) : 'Unknown';
    const genres = (attrs.tags || []).map(t => t.attributes?.name?.en).filter(Boolean);

    return {
      id: item.id,
      source: 'mangadex',
      title,
      cover_url,
      status,
      summary: attrs.description?.en || '',
      genres
    };
  },

  async getSourcePopular(sourceId, page = 1, options = {}) {
    if (sourceId === 'mangadex') {
      const offset = (page - 1) * 24;
      const data = await this._fetchMangaDex(`/manga?limit=24&offset=${offset}&includes[]=cover_art&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive`);
      return {
        manga: (data.data || []).map(item => this._formatMangaDexItem(item)),
        has_next: (data.offset + data.limit) < (data.total || 0)
      };
    }
    return API.get(`/api/sources/${sourceId}/popular`, { page, ...options });
  },

  async getSourceLatest(sourceId, page = 1, options = {}) {
    if (sourceId === 'mangadex') {
      const offset = (page - 1) * 24;
      const data = await this._fetchMangaDex(`/manga?limit=24&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive`);
      return {
        manga: (data.data || []).map(item => this._formatMangaDexItem(item)),
        has_next: (data.offset + data.limit) < (data.total || 0)
      };
    }
    return API.get(`/api/sources/${sourceId}/latest`, { page, ...options });
  },

  async searchSource(sourceId, q, page = 1, options = {}) {
    if (sourceId === 'mangadex') {
      const offset = (page - 1) * 24;
      const data = await this._fetchMangaDex(`/manga?title=${encodeURIComponent(q)}&limit=24&offset=${offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`);
      return {
        manga: (data.data || []).map(item => this._formatMangaDexItem(item)),
        has_next: (data.offset + data.limit) < (data.total || 0)
      };
    }
    return API.get(`/api/sources/${sourceId}/search`, { q, page, ...options });
  },

  getPopularManga(sourceId, page = 1, options = {}) {
    return this.getSourcePopular(sourceId, page, options);
  },

  getLatestManga(sourceId, page = 1, options = {}) {
    return this.getSourceLatest(sourceId, page, options);
  },

  searchManga(sourceId, q, page = 1, options = {}) {
    return this.searchSource(sourceId, q, page, options);
  },

  getSourceFilters(sourceId) {
    return { genres: [], sort: [] };
  },

  async getMangaDetails(sourceId, mangaId, refresh = false) {
    if (sourceId === 'mangadex') {
      const data = await this._fetchMangaDex(`/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`);
      if (!data.data) throw new Error('Manga not found');
      const formatted = this._formatMangaDexItem(data.data);
      const authorRel = (data.data.relationships || []).find(r => r.type === 'author');
      const artistRel = (data.data.relationships || []).find(r => r.type === 'artist');
      formatted.author = authorRel?.attributes?.name || '';
      formatted.artist = artistRel?.attributes?.name || '';
      return formatted;
    }
    return API.get(`/api/sources/${sourceId}/manga/${mangaId}${refresh ? '?refresh=1' : ''}`);
  },

  async getMangaChapters(sourceId, mangaId, refresh = false) {
    if (sourceId === 'mangadex') {
      const data = await this._fetchMangaDex(`/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=500`);
      return (data.data || []).map((ch, idx) => {
        const attrs = ch.attributes || {};
        const num = attrs.chapter ? String(attrs.chapter) : String(idx + 1);
        const title = attrs.title ? `Ch. ${num} - ${attrs.title}` : `Chapter ${num}`;
        return {
          id: ch.id,
          title,
          chapter_number: num,
          upload_date: attrs.publishAt ? new Date(attrs.publishAt).toLocaleDateString() : '',
          scanlator: 'MangaDex'
        };
      });
    }
    return API.get(`/api/sources/${sourceId}/manga/${mangaId}/chapters${refresh ? '?refresh=1' : ''}`);
  },

  async getChapterPages(sourceId, chapterId, mangaId = '') {
    if (sourceId === 'mangadex') {
      const data = await this._fetchMangaDex(`/at-home/server/${chapterId}`);
      if (!data.baseUrl || !data.chapter) throw new Error('Failed to load chapter pages');
      const hash = data.chapter.hash;
      const pages = (data.chapter.data || []).map((fn, idx) => ({
        index: idx,
        url: `${data.baseUrl}/data/${hash}/${fn}`
      }));
      return { pages };
    }
    const q = mangaId ? `?manga_id=${encodeURIComponent(mangaId)}` : '';
    return API.get(`/api/sources/${sourceId}/chapter/${chapterId}/pages${q}`);
  },

  cacheManga: async (mangaId, data) => ({ success: true }),

  getMangaMetadata: async (mangaId) => {
    if (window.Storage) return await Storage.getMangaMetadata(mangaId);
    return API.get(`/api/manga/${encodeURIComponent(mangaId)}/metadata`);
  },

  saveMangaMetadata: async (mangaId, data) => {
    if (window.Storage) return await Storage.saveMangaMetadata(mangaId, data);
    return API.post(`/api/manga/${encodeURIComponent(mangaId)}/metadata`, data);
  },

  resetMangaMetadata: async (mangaId) => {
    if (window.Storage) return await Storage.resetMangaMetadata(mangaId);
    return API.post(`/api/manga/${encodeURIComponent(mangaId)}/metadata/reset`);
  },

  uploadMangaCover: async (mangaId, file) => {
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    if (window.Storage) {
      await Storage.saveMangaMetadata(mangaId, { custom_cover_url: dataUrl });
      return { success: true, cover_url: dataUrl };
    }
    return { success: true };
  },

  // -------------------------------------------------------------
  // Progress & History (Client-Side IndexedDB Storage)
  // -------------------------------------------------------------
  getProgress: async (mangaId) => {
    if (window.Storage) return await Storage.getProgress(mangaId);
    try { return await API.get(`/api/progress/${mangaId}`); } catch (e) { return {}; }
  },

  saveProgress: async (data) => {
    if (window.Storage) return await Storage.saveProgress(data);
    return API.post('/api/progress', data);
  },

  bulkUpdateProgress: async (data) => {
    if (window.Storage && data && data.manga_id) {
      if (Array.isArray(data.chapter_ids)) {
        for (const chId of data.chapter_ids) {
          await Storage.saveProgress({
            manga_id: data.manga_id,
            chapter_id: chId,
            is_read: data.action === 'mark_read' ? 1 : (data.action === 'mark_unread' ? 0 : undefined)
          });
        }
      }
      return { success: true };
    }
    return API.post('/api/progress/bulk', data);
  },

  getHistory: async (page = 1, limit = 50) => {
    if (window.Storage) return await Storage.getHistory(page, limit);
    try { return await API.get('/api/history'); } catch (e) { return []; }
  },

  clearHistory: async () => {
    if (window.Storage) return await Storage.clearHistory();
    return API.post('/api/history/clear');
  },

  getStatistics: async () => {
    if (window.Storage) return await Storage.getStatistics();
    try { return await API.get('/api/statistics'); } catch (e) { return {}; }
  },

  deleteHistoryItem: async (mangaId, chapterId) => {
    return { success: true };
  },

  // -------------------------------------------------------------
  // Downloads (Mihon Downloader Integration)
  // -------------------------------------------------------------
  getDownloads: async (params = {}) => {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await fetch(`/api/downloads${q ? '?' + q : ''}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.active || []);
    } catch (e) {
      return [];
    }
  },
  getMangaDownloadStatus: async (mangaId) => {
    try {
      const res = await fetch(`/api/manga/${encodeURIComponent(mangaId)}/download_status`);
      if (!res.ok) return { count: 0 };
      return await res.json();
    } catch (e) {
      return { count: 0 };
    }
  },
  queueDownload: async (data) => {
    try {
      const res = await fetch('/api/downloads/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) return { success: false };
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  queueBulkDownloads: async (chapters) => {
    try {
      const res = await fetch('/api/downloads/queue-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapters })
      });
      if (!res.ok) return { success: false };
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  pauseDownload: async (taskId) => {
    try {
      const res = await fetch(`/api/downloads/${taskId}/pause`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  resumeDownload: async (taskId) => {
    try {
      const res = await fetch(`/api/downloads/${taskId}/resume`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  retryDownload: async (taskId) => {
    try {
      const res = await fetch(`/api/downloads/${taskId}/retry`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  reorderDownload: async (taskId, toTop = true) => {
    try {
      const res = await fetch(`/api/downloads/${taskId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_top: toTop })
      });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  reorderMangaDownloads: async (mangaId, action = 'top') => {
    try {
      const res = await fetch(`/api/downloads/manga/${mangaId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  reorderAllMangaDownloads: async (order) => {
    try {
      const res = await fetch('/api/downloads/manga/reorder-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  reorderAllTaskDownloads: async (order) => {
    try {
      const res = await fetch('/api/downloads/tasks/reorder-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  pauseMangaDownloads: async (mangaId) => {
    try {
      const res = await fetch(`/api/downloads/manga/${mangaId}/pause`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  resumeMangaDownloads: async (mangaId) => {
    try {
      const res = await fetch(`/api/downloads/manga/${mangaId}/resume`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  cancelMangaDownloads: async (mangaId) => {
    try {
      const res = await fetch(`/api/downloads/manga/${mangaId}/cancel`, { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  cancelDownload: async (taskId) => {
    try {
      const res = await fetch(`/api/downloads/${taskId}`, { method: 'DELETE' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  clearFinishedDownloads: async () => {
    try {
      const res = await fetch('/api/downloads/clear-finished', { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  pauseAllDownloads: async () => {
    try {
      const res = await fetch('/api/downloads/pause-all', { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  resumeAllDownloads: async () => {
    try {
      const res = await fetch('/api/downloads/resume-all', { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },
  autoResumeDownloads: async () => {
    try {
      const res = await fetch('/api/downloads/auto-resume', { method: 'POST' });
      return res.ok ? await res.json() : { count: 0 };
    } catch (e) { return { count: 0 }; }
  },
  cancelAllDownloads: async () => {
    try {
      const res = await fetch('/api/downloads/cancel-all', { method: 'POST' });
      return res.ok ? await res.json() : { success: false };
    } catch (e) { return { success: false }; }
  },

  // -------------------------------------------------------------
  // Migration API
  // -------------------------------------------------------------
  getMigrationSources: async () => {
    try {
      const res = await fetch('/api/migration/sources');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {}

    try {
      const library = window.Storage ? await Storage.getLibrary() : [];
      const sourcesMap = new Map();
      const allSources = await API.getSources();
      const metaMap = {};
      for (const s of allSources) {
        metaMap[s.id] = s;
      }

      for (const item of library) {
        const sid = item.source || item.source_id || 'unknown';
        if (!sourcesMap.has(sid)) {
          const sMeta = metaMap[sid] || {};
          sourcesMap.set(sid, {
            id: sid,
            name: sMeta.name || sid.toUpperCase(),
            icon_url: sMeta.icon_url || '/static/img/default-cover.png',
            lang: sMeta.lang || 'all',
            manga_count: 0
          });
        }
        sourcesMap.get(sid).manga_count += 1;
      }
      return Array.from(sourcesMap.values());
    } catch (e) {
      return [];
    }
  },

  getMigrationManga: async (sourceId) => {
    try {
      const res = await fetch(`/api/migration/manga?source=${encodeURIComponent(sourceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {}

    try {
      const library = window.Storage ? await Storage.getLibrary() : [];
      return library.filter(m => (m.source || m.source_id) === sourceId);
    } catch (e) {
      return [];
    }
  },

  migrateManga: async (data) => {
    try {
      const res = await fetch('/api/migration/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    try {
      if (window.Storage) {
        const currentId = data.current_manga_id || data.current_id;
        const targetId = data.target_manga_id || data.target_id;
        const targetSource = data.target_source || data.source;
        const replace = data.replace !== false;

        const details = await API.getMangaDetails(targetSource, targetId);
        if (details) {
          await Storage.addToLibrary(details);
          if (replace && currentId !== targetId) {
            await Storage.removeFromLibrary(currentId);
          }
        }
        return { success: true };
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
    return { success: false };
  },

  // -------------------------------------------------------------
  // Settings (Client-Side IndexedDB Storage)
  // -------------------------------------------------------------
  getSettings: async () => {
    if (window.Storage) return await Storage.getSettings();
    try { return await API.get('/api/settings'); } catch (e) { return {}; }
  },

  saveSettings: async (data) => {
    if (window.Storage) return await Storage.saveSettings(data);
    return API.post('/api/settings', data);
  },

  // -------------------------------------------------------------
  // Backup & Restore
  // -------------------------------------------------------------
  createBackup: async (saveToDisk = true) => {
    if (window.Storage) return await Storage.createBackup();
    return API.post('/api/backup/create', { save_to_disk: saveToDisk });
  },

  restoreBackupFromFile: async (file) => {
    if (window.Storage) return await Storage.restoreBackupFromFile(file);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/backup/restore', { method: 'POST', body: formData });
    return await res.json();
  },

  // Filesystem & Folder Picker
  listDirectory: () => Promise.resolve({ directories: [], files: [] }),
  browseNativeFolder: () => Promise.resolve({ path: '' }),
  openExplorer: () => Promise.resolve({ success: true }),
  locateFolder: () => Promise.resolve({ success: false }),

  // Tracking accounts
  getTrackingAccounts: async () => {
    return [
      { id: 'anilist', name: 'AniList', logged_in: false },
      { id: 'myanimelist', name: 'MyAnimeList', logged_in: false }
    ];
  },
  loginTrackingAccount: () => Promise.resolve({ success: true }),
  logoutTrackingAccount: () => Promise.resolve({ success: true }),
  getTrackingOAuthStartUrl: () => Promise.resolve({ url: '#' }),
  syncRemoteTracking: () => Promise.resolve({ success: true })
};

// Global Exposure
if (typeof window !== 'undefined') {
  window.API = API;
  API._ensureFreshState();
}
