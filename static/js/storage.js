// Shinobi Client-Side Storage Engine - IndexedDB & File System Access API
// 100% Client-Side: Supports saving all data directly to any drive/folder (e.g. E: drive) or browser IndexedDB.
const Storage = {
  DB_NAME: 'shinobi_fresh_db',
  DB_VERSION: 1,
  _db: null,
  _initPromise: null,
  dirHandle: null,
  storageMode: 'browser', // 'browser' or 'custom'

  async init() {
    if (this._db) return this._db;
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Library store
        if (!db.objectStoreNames.contains('library')) {
          const libStore = db.createObjectStore('library', { keyPath: 'id' });
          libStore.createIndex('source', 'source', { unique: false });
          libStore.createIndex('last_read_at', 'last_read_at', { unique: false });
          libStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 2. Categories store
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('sort_order', 'sort_order', { unique: false });
        }

        // 3. Reading progress store (composite key: manga_id + chapter_id)
        if (!db.objectStoreNames.contains('reading_progress')) {
          const progStore = db.createObjectStore('reading_progress', { keyPath: ['manga_id', 'chapter_id'] });
          progStore.createIndex('manga_id', 'manga_id', { unique: false });
          progStore.createIndex('last_read_at', 'last_read_at', { unique: false });
          progStore.createIndex('is_read', 'is_read', { unique: false });
        }

        // 4. Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 5. Custom Metadata store
        if (!db.objectStoreNames.contains('manga_custom_metadata')) {
          db.createObjectStore('manga_custom_metadata', { keyPath: 'manga_id' });
        }

        // 6. Chapter settings store
        if (!db.objectStoreNames.contains('manga_chapter_settings')) {
          db.createObjectStore('manga_chapter_settings', { keyPath: 'manga_id' });
        }

        // 7. Reading history store
        if (!db.objectStoreNames.contains('history')) {
          const histStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          histStore.createIndex('manga_id', 'manga_id', { unique: false });
          histStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 8. Cached manga store (for offline detail caching)
        if (!db.objectStoreNames.contains('manga_cache')) {
          db.createObjectStore('manga_cache', { keyPath: 'id' });
        }

        // 9. File System Handles store (stores directory handle to user's custom drive folder on E:, D:, etc.)
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });

    await this._initPromise;

    if (!this._startupDone) {
      this._startupDone = true;
      try {
        await this._loadSavedDirectoryHandle();
        await this._checkAndSeedData();
      } catch (e) {
        console.warn('Storage startup check skipped:', e);
      }
    }

    return this._db;
  },

  // -------------------------------------------------------------
  // Custom Drive & File System Access API
  // -------------------------------------------------------------
  async _loadSavedDirectoryHandle() {
    try {
      const handle = await this.get('handles', 'custom_storage_dir');
      if (handle && typeof handle.queryPermission === 'function') {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.dirHandle = handle;
          this.storageMode = 'custom';
          console.info(`Connected custom drive folder: ${handle.name}`);
        }
      }
    } catch (e) {
      console.warn('Could not restore directory handle:', e);
    }
  },

  async setDirectoryHandle(handle, explicitPath = '') {
    if (!handle) return false;
    await this.init();
    try {
      // Create standard Mihon directory tree inside selected drive folder
      try {
        await handle.getDirectoryHandle('downloads', { create: true });
        await handle.getDirectoryHandle('backups', { create: true });
        await handle.getDirectoryHandle('local', { create: true });
      } catch (subErr) {
        console.warn('Could not auto-create Mihon subdirectories:', subErr);
      }

      const tx = this._db.transaction(['handles', 'settings'], 'readwrite');
      tx.objectStore('handles').put(handle, 'custom_storage_dir');
      tx.objectStore('settings').put({ key: 'storage_mode', value: 'custom' });
      tx.objectStore('settings').put({ key: 'storage_folder_name', value: handle.name });

      if (explicitPath) {
        const cleanPath = explicitPath.replace(/[\\/]+$/, '');
        const dlPath = `${cleanPath}\\downloads`;
        const localPath = `${cleanPath}\\local`;
        tx.objectStore('settings').put({ key: 'storage_folder_path', value: cleanPath });
        tx.objectStore('settings').put({ key: 'download_dir', value: dlPath });
        tx.objectStore('settings').put({ key: 'local_paths', value: JSON.stringify([localPath]) });
        localStorage.setItem('shinobi_storage_folder_path', cleanPath);
        localStorage.setItem('shinobi_download_dir', dlPath);
      }

      this.dirHandle = handle;
      this.storageMode = 'custom';
      localStorage.setItem('shinobi_storage_mode', 'custom');
      localStorage.setItem('shinobi_storage_folder_name', handle.name);

      // If running with Python backend, synchronize download_dir & local_paths to server
      if (explicitPath) {
        try {
          const cleanPath = explicitPath.replace(/[\\/]+$/, '');
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              download_dir: `${cleanPath}\\downloads`,
              local_paths: [`${cleanPath}\\local`]
            })
          });
        } catch (serverErr) {
          console.warn('Could not notify server of new download path:', serverErr);
        }
      }

      // Check if this folder already contains saved data from another browser/session
      const hasExistingData = await this.hasDiskData(handle);
      if (hasExistingData) {
        console.info('Found existing data files in selected folder, importing into browser...');
        await this.importFromDisk(handle);
      } else {
        // Empty or new folder: export current records into the drive folder
        console.info('No prior data in folder, exporting current records to disk...');
        await this.syncAllToDisk();
      }
      return true;
    } catch (e) {
      console.error('Failed to set directory handle:', e);
      return false;
    }
  },

  async disconnectDirectoryHandle() {
    await this.init();
    try {
      const tx = this._db.transaction(['handles', 'settings'], 'readwrite');
      tx.objectStore('handles').delete('custom_storage_dir');
      tx.objectStore('settings').put({ key: 'storage_mode', value: 'browser' });
      tx.objectStore('settings').delete('storage_folder_name');

      this.dirHandle = null;
      this.storageMode = 'browser';
      localStorage.setItem('shinobi_storage_mode', 'browser');
      localStorage.removeItem('shinobi_storage_folder_name');
      return true;
    } catch (e) {
      console.error('Failed to disconnect directory handle:', e);
      return false;
    }
  },

  getStorageInfo() {
    return {
      mode: this.storageMode,
      folderName: this.dirHandle ? this.dirHandle.name : (localStorage.getItem('shinobi_storage_folder_name') || ''),
      hasHandle: !!this.dirHandle,
      supportsFSA: typeof window.showDirectoryPicker === 'function'
    };
  },

  // Write JSON file directly to custom drive folder on E:, D:, etc.
  async _writeDiskFile(filename, data) {
    if (!this.dirHandle) return;
    try {
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (e) {
      console.warn(`Could not write ${filename} to custom storage drive:`, e);
    }
  },

  async syncAllToDisk() {
    if (!this.dirHandle) return;
    try {
      const [lib, cats, prog, sett, meta, chSettings] = await Promise.all([
        this.getAll('library'),
        this.getAll('categories'),
        this.getAll('reading_progress'),
        this.getAll('settings'),
        this.getAll('manga_custom_metadata'),
        this.getAll('manga_chapter_settings')
      ]);

      await Promise.all([
        this._writeDiskFile('library.json', lib),
        this._writeDiskFile('categories.json', cats),
        this._writeDiskFile('progress.json', prog),
        this._writeDiskFile('settings.json', sett),
        this._writeDiskFile('metadata.json', meta),
        this._writeDiskFile('chapter_settings.json', chSettings)
      ]);
      console.info('Synced all database tables to custom drive folder.');
    } catch (e) {
      console.warn('Sync to drive folder encountered an issue:', e);
    }
  },

  // Read JSON file from a directory handle
  async _readDiskFile(filename, handle = this.dirHandle) {
    if (!handle) return null;
    try {
      const fileHandle = await handle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  },

  // Check if a directory handle has existing Shinobi backup/save files
  async hasDiskData(handle = this.dirHandle) {
    if (!handle) return false;
    try {
      const [lib, prog] = await Promise.all([
        this._readDiskFile('library.json', handle),
        this._readDiskFile('progress.json', handle)
      ]);
      const hasLib = Array.isArray(lib) && lib.length > 0;
      const hasProg = Array.isArray(prog) && prog.length > 0;
      return hasLib || hasProg;
    } catch (e) {
      return false;
    }
  },

  // Import existing data from a drive folder into IndexedDB
  async importFromDisk(handle = this.dirHandle) {
    if (!handle) return false;
    await this.init();
    try {
      const [lib, cats, prog, sett, meta, chSettings] = await Promise.all([
        this._readDiskFile('library.json', handle),
        this._readDiskFile('categories.json', handle),
        this._readDiskFile('progress.json', handle),
        this._readDiskFile('settings.json', handle),
        this._readDiskFile('metadata.json', handle),
        this._readDiskFile('chapter_settings.json', handle)
      ]);

      const hasData = (Array.isArray(lib) && lib.length > 0) || (Array.isArray(prog) && prog.length > 0);
      if (!hasData) return false;

      const tx = this._db.transaction([
        'categories', 'library', 'reading_progress', 'settings',
        'manga_custom_metadata', 'manga_chapter_settings'
      ], 'readwrite');

      if (Array.isArray(cats) && cats.length > 0) {
        const s = tx.objectStore('categories');
        await s.clear();
        cats.forEach(c => s.put(c));
      }

      if (Array.isArray(lib) && lib.length > 0) {
        const s = tx.objectStore('library');
        await s.clear();
        lib.forEach(m => s.put(m));
      }

      if (Array.isArray(prog) && prog.length > 0) {
        const s = tx.objectStore('reading_progress');
        await s.clear();
        prog.forEach(p => s.put(p));
      }

      if (Array.isArray(sett) && sett.length > 0) {
        const s = tx.objectStore('settings');
        sett.forEach(st => s.put(st));
      }

      if (Array.isArray(meta) && meta.length > 0) {
        const s = tx.objectStore('manga_custom_metadata');
        await s.clear();
        meta.forEach(m => s.put(m));
      }

      if (Array.isArray(chSettings) && chSettings.length > 0) {
        const s = tx.objectStore('manga_chapter_settings');
        await s.clear();
        chSettings.forEach(cs => s.put(cs));
      }

      await new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = (e) => rej(e);
      });

      console.info('Successfully imported all tables from custom drive folder into browser IndexedDB');
      return true;
    } catch (e) {
      console.warn('Failed to import data from drive folder:', e);
      return false;
    }
  },

  // -------------------------------------------------------------
  // Data Initialization (Starts Clean & Fresh)
  // -------------------------------------------------------------
  async _checkAndSeedData() {
    const cats = await this.getAll('categories');
    if (cats && cats.length > 0) {
      return; // Already initialized
    }

    // Initialize clean default categories
    await this.put('categories', { id: 'default', name: 'Default', sort_order: 0 });
    await this.put('categories', { id: 'reading', name: 'Reading', sort_order: 1 });
    await this.put('categories', { id: 'completed', name: 'Completed', sort_order: 2 });
    await this.put('categories', { id: 'plan_to_read', name: 'Plan to Read', sort_order: 3 });

    // Initialize clean default settings
    await this.put('settings', { key: 'reader_mode', value: 'webtoon' });
    await this.put('settings', { key: 'reader_width', value: '800' });
    await this.put('settings', { key: 'reader_bg', value: 'dark' });
    await this.put('settings', { key: 'accent_color', value: 'teal' });

    console.info('Fresh Shinobi database initialized with clean library.');
  },

  // Generic IndexedDB Helpers
  async get(storeName, key) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName, item, key = undefined) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readwrite');
      const req = key !== undefined ? tx.objectStore(storeName).put(item, key) : tx.objectStore(storeName).put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, key) {
    if (!this._db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  // -------------------------------------------------------------
  // Library API
  // -------------------------------------------------------------
  async getLibrary() {
    await this.init();
    const [mangaList, progressList, customMetaList] = await Promise.all([
      this.getAll('library'),
      this.getAll('reading_progress'),
      this.getAll('manga_custom_metadata')
    ]);

    const progMap = new Map();
    for (const p of progressList) {
      if (!progMap.has(p.manga_id)) progMap.set(p.manga_id, {});
      progMap.get(p.manga_id)[p.chapter_id] = p;
    }

    const metaMap = new Map();
    for (const m of customMetaList) {
      metaMap.set(m.manga_id, m);
    }

    return mangaList.map(manga => {
      const copy = { ...manga };
      const custom = metaMap.get(copy.id) || {};
      if (custom.custom_title) copy.title = custom.custom_title;
      if (custom.custom_cover_url) copy.cover_url = custom.custom_cover_url;
      if (custom.custom_author) copy.author = custom.custom_author;
      if (custom.custom_artist) copy.artist = custom.custom_artist;
      if (custom.custom_status) copy.status = custom.custom_status;
      if (custom.custom_summary) copy.summary = custom.custom_summary;
      if (custom.custom_genres) copy.genres = custom.custom_genres;

      if (typeof copy.category_ids === 'string') {
        try {
          copy.category_ids = JSON.parse(copy.category_ids);
        } catch (e) {
          copy.category_ids = [copy.category_id || 'default'];
        }
      }
      if (!Array.isArray(copy.category_ids) || copy.category_ids.length === 0) {
        copy.category_ids = [copy.category_id || 'default'];
      }

      copy.progress_summary = progMap.get(copy.id) || {};

      let chapters = [];
      if (copy.chapters_json) {
        try {
          chapters = typeof copy.chapters_json === 'string' ? JSON.parse(copy.chapters_json) : copy.chapters_json;
        } catch (e) {
          chapters = [];
        }
      }
      if (!copy.chapter_count) {
        copy.chapter_count = chapters.length;
      }

      let readCount = 0;
      let maxLastRead = copy.last_read_at || 0;
      for (const chId in copy.progress_summary) {
        const prog = copy.progress_summary[chId];
        if (prog.is_read) readCount++;
        if (prog.last_read_at && prog.last_read_at > maxLastRead) {
          maxLastRead = prog.last_read_at;
        }
      }
      copy.read_count = readCount;
      copy.unread_count = Math.max(0, (copy.chapter_count || chapters.length) - readCount);
      copy.last_read_at = maxLastRead;

      return copy;
    });
  },

  async addToLibrary(manga) {
    if (!manga || !manga.id) throw new Error('Invalid manga object');
    await this.init();

    const existing = await this.get('library', manga.id);
    const now = Date.now() / 1000;

    const item = {
      ...(existing || {}),
      ...manga,
      favorite: 1,
      created_at: (existing && existing.created_at) ? existing.created_at : now,
      last_updated: now,
      category_id: manga.category_id || (existing ? existing.category_id : 'default'),
      category_ids: Array.isArray(manga.category_ids) ? manga.category_ids : (existing?.category_ids || ['default'])
    };

    if (Array.isArray(item.category_ids)) {
      item.category_ids = JSON.stringify(item.category_ids);
    }
    if (Array.isArray(item.chapters_json)) {
      item.chapters_json = JSON.stringify(item.chapters_json);
    }

    await this.put('library', item);
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true, manga: item };
  },

  async removeFromLibrary(mangaId) {
    await this.delete('library', mangaId);
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true };
  },

  // -------------------------------------------------------------
  // Categories API
  // -------------------------------------------------------------
  async getCategories() {
    const list = await this.getAll('categories');
    return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  async createCategory(name) {
    if (!name || !name.trim()) throw new Error('Category name cannot be empty');
    const trimmed = name.trim();
    const existing = await this.getCategories();
    if (existing.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('Category already exists');
    }

    const id = 'cat_' + Date.now();
    const sort_order = existing.length;
    const cat = { id, name: trimmed, sort_order };
    await this.put('categories', cat);
    this._writeDiskFile('categories.json', await this.getAll('categories'));
    return { success: true, category: cat };
  },

  async deleteCategory(catId) {
    if (catId === 'default') throw new Error('Cannot delete Default category');
    await this.delete('categories', catId);

    const library = await this.getAll('library');
    for (const manga of library) {
      let ids = [];
      try {
        ids = typeof manga.category_ids === 'string' ? JSON.parse(manga.category_ids) : (manga.category_ids || []);
      } catch (e) {
        ids = [manga.category_id || 'default'];
      }
      if (ids.includes(catId)) {
        ids = ids.filter(id => id !== catId);
        if (ids.length === 0) ids.push('default');
        manga.category_ids = JSON.stringify(ids);
        manga.category_id = ids[0];
        await this.put('library', manga);
      }
    }

    this._writeDiskFile('categories.json', await this.getAll('categories'));
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true };
  },

  async setMangaCategories(mangaId, categoryIds) {
    const manga = await this.get('library', mangaId);
    if (!manga) return { success: false, error: 'Manga not found' };

    const cleanIds = Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : ['default'];
    manga.category_ids = JSON.stringify(cleanIds);
    manga.category_id = cleanIds[0];
    await this.put('library', manga);
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true };
  },

  async batchSetCategories(mangaIds, categoryIds) {
    for (const id of mangaIds) {
      await this.setMangaCategories(id, categoryIds);
    }
    return { success: true };
  },

  async batchMarkRead(mangaIds, isRead = true) {
    const now = Date.now() / 1000;
    for (const mangaId of mangaIds) {
      const manga = await this.get('library', mangaId);
      if (!manga) continue;

      let chapters = [];
      try {
        chapters = typeof manga.chapters_json === 'string' ? JSON.parse(manga.chapters_json) : (manga.chapters_json || []);
      } catch (e) {}

      for (const ch of chapters) {
        await this.put('reading_progress', {
          manga_id: mangaId,
          chapter_id: ch.id,
          page_index: 0,
          total_pages: 0,
          is_read: isRead ? 1 : 0,
          is_bookmarked: 0,
          last_read_at: isRead ? now : 0
        });
      }

      manga.last_read_at = isRead ? now : 0;
      await this.put('library', manga);
    }
    this._writeDiskFile('progress.json', await this.getAll('reading_progress'));
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true };
  },

  async batchRemoveFromLibrary(mangaIds) {
    for (const id of mangaIds) {
      await this.delete('library', id);
    }
    this._writeDiskFile('library.json', await this.getAll('library'));
    return { success: true };
  },

  // -------------------------------------------------------------
  // Reading Progress & History API
  // -------------------------------------------------------------
  async getProgress(mangaId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('reading_progress', 'readonly');
      const store = tx.objectStore('reading_progress');
      const index = store.index('manga_id');
      const req = index.getAll(mangaId);

      req.onsuccess = () => {
        const map = {};
        for (const item of (req.result || [])) {
          map[item.chapter_id] = item;
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async saveProgress(data) {
    if (!data || !data.manga_id || !data.chapter_id) return { success: false };
    await this.init();

    const now = Date.now() / 1000;
    const existing = await this.get('reading_progress', [data.manga_id, data.chapter_id]);

    const item = {
      manga_id: data.manga_id,
      chapter_id: data.chapter_id,
      page_index: data.page_index !== undefined ? data.page_index : (existing?.page_index || 0),
      total_pages: data.total_pages !== undefined ? data.total_pages : (existing?.total_pages || 0),
      is_read: data.is_read !== undefined ? (data.is_read ? 1 : 0) : (existing?.is_read ?? 0),
      is_bookmarked: data.is_bookmarked !== undefined ? (data.is_bookmarked ? 1 : 0) : (existing?.is_bookmarked ?? 0),
      last_read_at: now
    };

    await this.put('reading_progress', item);

    const manga = await this.get('library', data.manga_id);
    if (manga) {
      manga.last_read_at = now;
      await this.put('library', manga);
    }

    if (localStorage.getItem('shinobi_incognito') !== 'true') {
      await this.put('history', {
        manga_id: data.manga_id,
        chapter_id: data.chapter_id,
        manga_title: data.manga_title || manga?.title || '',
        chapter_title: data.chapter_title || '',
        chapter_number: data.chapter_number || '',
        cover_url: data.cover_url || manga?.cover_url || '',
        source: data.source || manga?.source || '',
        timestamp: now
      });
    }

    this._writeDiskFile('progress.json', await this.getAll('reading_progress'));
    return { success: true };
  },

  async getHistory(page = 1, limit = 50) {
    await this.init();
    const historyEntries = await this.getAll('history');
    const library = await this.getAll('library');
    const libMap = new Map(library.map(m => [m.id, m]));

    const latestPerManga = new Map();
    for (const h of historyEntries) {
      const prev = latestPerManga.get(h.manga_id);
      if (!prev || (h.timestamp || 0) > (prev.timestamp || 0)) {
        latestPerManga.set(h.manga_id, h);
      }
    }

    for (const m of library) {
      if (m.last_read_at && !latestPerManga.has(m.id)) {
        latestPerManga.set(m.id, {
          manga_id: m.id,
          manga_title: m.title,
          cover_url: m.cover_url,
          source: m.source,
          timestamp: m.last_read_at
        });
      }
    }

    const sorted = Array.from(latestPerManga.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const offset = (page - 1) * limit;
    const paginated = sorted.slice(offset, offset + limit);

    return paginated.map(item => {
      const lib = libMap.get(item.manga_id);
      return {
        manga_id: item.manga_id,
        chapter_id: item.chapter_id,
        title: item.manga_title || lib?.title || 'Unknown Manga',
        cover_url: item.cover_url || lib?.cover_url || '',
        source: item.source || lib?.source || '',
        last_read_at: item.timestamp,
        in_library: !!lib
      };
    });
  },

  async clearHistory() {
    await this.init();
    const tx = this._db.transaction(['history', 'reading_progress'], 'readwrite');
    tx.objectStore('history').clear();

    const progStore = tx.objectStore('reading_progress');
    const req = progStore.getAll();
    req.onsuccess = () => {
      for (const p of req.result || []) {
        p.last_read_at = 0;
        progStore.put(p);
      }
    };

    return { success: true };
  },

  // -------------------------------------------------------------
  // Settings API
  // -------------------------------------------------------------
  async getSettings() {
    const list = await this.getAll('settings');
    const settings = {};
    for (const item of list) {
      try {
        settings[item.key] = JSON.parse(item.value);
      } catch (e) {
        settings[item.key] = item.value;
      }
    }

    if (!settings.reader_mode) settings.reader_mode = 'webtoon';
    if (!settings.reader_width) settings.reader_width = '800';
    if (!settings.reader_bg) settings.reader_bg = 'dark';
    if (!settings.accent_color) settings.accent_color = localStorage.getItem('mihon_theme_accent') || 'teal';
    if (!settings.storage_mode) settings.storage_mode = this.storageMode;

    return settings;
  },

  async saveSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') return { success: false };
    for (const [k, v] of Object.entries(newSettings)) {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      await this.put('settings', { key: k, value: valStr });
      try {
        localStorage.setItem(`shinobi_${k}`, valStr);
      } catch (e) {}
    }
    this._writeDiskFile('settings.json', await this.getAll('settings'));
    return { success: true };
  },

  // -------------------------------------------------------------
  // Reading Statistics API
  // -------------------------------------------------------------
  async getStatistics() {
    const [library, progressList, categories] = await Promise.all([
      this.getAll('library'),
      this.getAll('reading_progress'),
      this.getAll('categories')
    ]);

    let chaptersRead = 0;
    let pagesRead = 0;
    const mangaReadSet = new Set();
    const mangaChapterCounts = {};

    for (const p of progressList) {
      if (p.is_read) {
        chaptersRead++;
        pagesRead += (p.total_pages || 25);
        mangaReadSet.add(p.manga_id);
        mangaChapterCounts[p.manga_id] = (mangaChapterCounts[p.manga_id] || 0) + 1;
      }
    }

    const totalMinutes = chaptersRead * 4;
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationFormatted = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    const statusCounts = {};
    for (const m of library) {
      const s = m.status || 'Ongoing';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: library.length > 0 ? Math.round((count / library.length) * 100) : 0
    }));

    const catMap = new Map(categories.map(c => [c.id, c.name]));
    const catCounts = {};
    for (const m of library) {
      let ids = ['default'];
      try {
        ids = typeof m.category_ids === 'string' ? JSON.parse(m.category_ids) : (m.category_ids || [m.category_id || 'default']);
      } catch (e) {}
      for (const id of ids) {
        const name = catMap.get(id) || id;
        catCounts[name] = (catCounts[name] || 0) + 1;
      }
    }
    const categoryDistribution = Object.entries(catCounts).map(([name, count]) => ({
      name,
      count,
      percentage: library.length > 0 ? Math.round((count / library.length) * 100) : 0
    }));

    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const readingActivity7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
      const dayEnd = dayStart + 86400;

      const count = progressList.filter(p => p.is_read && p.last_read_at >= dayStart && p.last_read_at < dayEnd).length;
      readingActivity7Days.push({
        day: days[d.getDay()],
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        chapters: count
      });
    }

    const libMap = new Map(library.map(m => [m.id, m]));
    const mostReadManga = Object.entries(mangaChapterCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([mId, chCount]) => {
        const m = libMap.get(mId) || {};
        return {
          id: mId,
          title: m.title || 'Unknown Manga',
          cover_url: m.cover_url || '',
          source: m.source || '',
          chapters_read: chCount
        };
      });

    return {
      chapters_read: chaptersRead,
      pages_read: pagesRead,
      total_read_duration_formatted: durationFormatted,
      manga_in_library: library.length,
      manga_read_count: mangaReadSet.size,
      status_distribution: statusDistribution,
      category_distribution: categoryDistribution,
      reading_activity_7_days: readingActivity7Days,
      most_read_manga: mostReadManga
    };
  },

  // -------------------------------------------------------------
  // Full Backup & Restore directly in Browser
  // -------------------------------------------------------------
  async createBackup() {
    await this.init();
    const [library, categories, reading_progress, settings, metadata, chapter_settings] = await Promise.all([
      this.getAll('library'),
      this.getAll('categories'),
      this.getAll('reading_progress'),
      this.getAll('settings'),
      this.getAll('manga_custom_metadata'),
      this.getAll('manga_chapter_settings')
    ]);

    const backupData = {
      version: 2,
      created_at: new Date().toISOString(),
      generator: 'Shinobi Web Serverless Edition',
      library,
      categories,
      reading_progress,
      settings,
      manga_custom_metadata: metadata,
      manga_chapter_settings: chapter_settings
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `shinobi_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    return {
      success: true,
      filename,
      download_url: url
    };
  },

  async restoreBackupFromFile(file) {
    if (!file) throw new Error('No file provided');
    const text = await file.text();
    const data = JSON.parse(text);

    await this.init();
    const tx = this._db.transaction([
      'library', 'categories', 'reading_progress', 'settings',
      'manga_custom_metadata', 'manga_chapter_settings'
    ], 'readwrite');

    let mCount = 0;
    let cCount = 0;

    if (Array.isArray(data.categories)) {
      const s = tx.objectStore('categories');
      data.categories.forEach(c => { s.put(c); cCount++; });
    }

    if (Array.isArray(data.library)) {
      const s = tx.objectStore('library');
      data.library.forEach(m => { s.put(m); mCount++; });
    }

    if (Array.isArray(data.reading_progress)) {
      const s = tx.objectStore('reading_progress');
      data.reading_progress.forEach(p => s.put(p));
    }

    if (Array.isArray(data.settings)) {
      const s = tx.objectStore('settings');
      data.settings.forEach(st => s.put(st));
    }

    if (Array.isArray(data.manga_custom_metadata)) {
      const s = tx.objectStore('manga_custom_metadata');
      data.manga_custom_metadata.forEach(m => s.put(m));
    }

    if (Array.isArray(data.manga_chapter_settings)) {
      const s = tx.objectStore('manga_chapter_settings');
      data.manga_chapter_settings.forEach(cs => s.put(cs));
    }

    await new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = (e) => rej(e);
    });

    await this.syncAllToDisk();

    return {
      success: true,
      manga_count: mCount,
      category_count: cCount,
      message: `Successfully restored ${mCount} manga and ${cCount} categories`
    };
  },

  // Chapter Settings & Custom Metadata
  async getChapterSettings(mangaId) {
    return (await this.get('manga_chapter_settings', mangaId)) || {};
  },

  async saveChapterSettings(mangaId, settings) {
    await this.put('manga_chapter_settings', { manga_id: mangaId, ...settings });
    this._writeDiskFile('chapter_settings.json', await this.getAll('manga_chapter_settings'));
    return { success: true };
  },

  async getMangaMetadata(mangaId) {
    return (await this.get('manga_custom_metadata', mangaId)) || {};
  },

  async saveMangaMetadata(mangaId, data) {
    await this.put('manga_custom_metadata', { manga_id: mangaId, ...data, updated_at: Date.now() / 1000 });
    this._writeDiskFile('metadata.json', await this.getAll('manga_custom_metadata'));
    return { success: true };
  },

  async resetMangaMetadata(mangaId) {
    await this.delete('manga_custom_metadata', mangaId);
    this._writeDiskFile('metadata.json', await this.getAll('manga_custom_metadata'));
    return { success: true };
  }
};

// Global Exposure and Immediate Initialization
if (typeof window !== 'undefined') {
  window.Storage = Storage;
  Storage.init().catch(console.error);
}
