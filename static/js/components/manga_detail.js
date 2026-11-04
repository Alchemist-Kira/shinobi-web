// Manga Detail View Component with Mihon-Accurate Filter/Sort/Display Bottom Sheet, Fresh Chapters, and Download Status
const MangaDetailView = {
  manga: null,
  chapters: [],
  progressMap: {},
  downloadedChapterIds: new Set(),
  downloadedChapterNumbers: new Set(),
  pendingDownloadIds: new Set(),
  selectedChapterIds: new Set(),
  lastClickedChapterIndex: -1,
  downloadTasksMap: {},
  downloadPollTimer: null,
  chapterNumberCounts: {},
  chapterTitleCounts: {},

  // Mihon Filter / Sort / Display options
  filterDownloaded: false,
  filterUnread: false,
  filterBookmarked: false,
  filterScanlator: '',
  excludedScanlators: [],
  sortMode: 'source', // 'source' | 'chapter_number' | 'upload_date' | 'alphabetical'
  sortAsc: false,
  displayMode: 'source_title', // 'source_title' | 'chapter_number'
  filterQuery: '',
  activeOptionsTab: 'filter', // 'filter' | 'sort' | 'display'
  isBackgroundLoading: false,
  renderedMangaId: null,

  open(source, mangaId) {
    return this.render(source, mangaId);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  getModalHost() {
    let host = document.getElementById('app-modal-root');
    if (!host) {
      host = document.getElementById('app-global-modal-host');
    }
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-modal-root';
      document.body.appendChild(host);
    }
    return host;
  },

  cleanSynopsis(summary) {
    if (!summary) return '';
    let text = String(summary)
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<p\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    if (text.toLowerCase() === 'home' || text.toLowerCase() === 'manga') return '';
    text = text
      .replace(/\n\s*,\s*/g, ', ')
      .replace(/\n\s*;\s*/g, '; ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  },

  renderSynopsisHtml(m) {
    const cleanSummary = this.cleanSynopsis(m?.summary || m?.description);
    const isLong = cleanSummary.length > 150 || (cleanSummary.match(/\n/g) || []).length >= 2;
    return `
      <p class="detail-synopsis ${isLong ? 'collapsed' : ''}" id="detail-synopsis">${this.escapeHtml(cleanSummary) || 'No synopsis available.'}</p>
      ${isLong ? `
        <button id="btn-toggle-synopsis" class="btn-toggle-synopsis" type="button" aria-expanded="false">
          <span id="synopsis-toggle-text">Read More</span>
          <svg viewBox="0 0 24 24" class="synopsis-arrow-icon">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      ` : ''}
    `;
  },

  bindSynopsisToggle() {
    const toggleBtn = document.getElementById('btn-toggle-synopsis');
    const synopsisEl = document.getElementById('detail-synopsis');
    if (!toggleBtn || !synopsisEl) return;

    toggleBtn.onclick = (e) => {
      e.preventDefault();
      const isCollapsed = synopsisEl.classList.contains('collapsed');
      if (isCollapsed) {
        synopsisEl.classList.remove('collapsed');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.classList.add('expanded');
        const textEl = toggleBtn.querySelector('#synopsis-toggle-text');
        if (textEl) textEl.textContent = 'Read Less';
      } else {
        synopsisEl.classList.add('collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.classList.remove('expanded');
        const textEl = toggleBtn.querySelector('#synopsis-toggle-text');
        if (textEl) textEl.textContent = 'Read More';
      }
    };
  },

  renderMetaSectionHtml(m) {
    if (!m) return '';
    const statusText = m.status || 'Ongoing';
    const statusLower = statusText.toLowerCase();
    let statusClass = 'status-ongoing';
    if (statusLower.includes('complete')) statusClass = 'status-completed';
    else if (statusLower.includes('hiatus') || statusLower.includes('hold')) statusClass = 'status-hiatus';
    else if (statusLower.includes('cancel')) statusClass = 'status-cancelled';

    const authorDisplay = (m.author && typeof m.author === 'string' && m.author.trim() && m.author.trim().toLowerCase() !== 'unknown') ? m.author.trim() : '';
    const sourceDisplay = m.source_name || m.source || '';
    const genres = Array.isArray(m.genres)
      ? [...new Set(m.genres.filter(g => g && typeof g === 'string' && g.trim() && g.trim().toLowerCase() !== 'home'))]
      : [];

    return `
      <div class="detail-info-line">
        <span class="info-status ${statusClass}">• ${this.escapeHtml(statusText)}</span>
        ${authorDisplay ? `
          <span class="info-dot">•</span>
          <span class="info-group">
            <span class="info-label">Author:</span>
            <strong class="info-value">${this.escapeHtml(authorDisplay)}</strong>
          </span>
        ` : ''}
        ${sourceDisplay ? `
          <span class="info-dot">•</span>
          <span class="info-group">
            <span class="info-label">Source:</span>
            <strong class="info-value">${this.escapeHtml(sourceDisplay)}</strong>
          </span>
        ` : ''}
        ${m.has_custom_metadata ? `
          <span class="info-dot">•</span>
          <span class="meta-custom-badge">Customized</span>
        ` : ''}
      </div>
      ${genres.length > 0 ? `
        <div class="detail-genre-row">
          ${genres.map(g => `
            <span class="genre-chip genre-clickable" data-genre="${encodeURIComponent(g)}" title="Search genre: ${this.escapeHtml(g)}">
              ${this.escapeHtml(g)}
            </span>
          `).join('')}
        </div>
      ` : ''}
    `;
  },

  bindGenreChips(container = document) {
    container.querySelectorAll('.genre-clickable').forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        const genreName = decodeURIComponent(chip.getAttribute('data-genre') || '');
        if (genreName && this.manga && this.manga.source) {
          Router.navigate(`source/${this.manga.source}?genre=${encodeURIComponent(genreName)}`);
        }
      };
    });
  },

  bindLibraryButtons() {
    const m = this.manga;
    if (!m) return;

    const libBtn = document.getElementById('btn-toggle-library');
    if (libBtn) {
      libBtn.onclick = async () => {
        if (this.isMangaInLibrary()) {
          await this.removeCurrentMangaFromLibrary();
        } else {
          await this.openAddToLibraryModal();
        }
      };
    }

    const mangaCatBtn = document.getElementById('btn-manga-category');
    if (mangaCatBtn) {
      mangaCatBtn.onclick = async () => {
        try {
          const cats = await API.getCategories();
          if (typeof LibraryView !== 'undefined') {
            LibraryView.categories = cats;
          }
        } catch (e) {}
        const currentLibItem = this.getLibraryItem() || m;
        if (typeof LibraryView !== 'undefined' && LibraryView.openCategoryPickerModal) {
          LibraryView.openCategoryPickerModal(currentLibItem, (newCatIds, newCatNames) => {
            this.updateLibraryButtonState();
          });
        }
      };
    }

    const migrateBtn = document.getElementById('btn-manga-migrate');
    if (migrateBtn) {
      migrateBtn.onclick = () => {
        if (typeof MigrationView !== 'undefined') {
          MigrationView.init().then(() => {
            const m = { ...this.manga };
            m.chapter_count = this.getDisplayChapterCount();
            m.read_chapters_count = this.readChapterIds ? this.readChapterIds.size : 0;
            m.downloaded_count = this.downloadedChapterIds ? this.downloadedChapterIds.size : 0;
            m.source_name = this.sourceName || m.source;
            MigrationView.openSearchForManga(m);
          });
        }
      };
    }

    const trackingBtn = document.getElementById('btn-manga-tracking');
    if (trackingBtn) {
      trackingBtn.onclick = () => {
        this.openTrackingModal();
      };
    }

    const smartUpdateBtn = document.getElementById('btn-manga-smart-update');
    if (smartUpdateBtn) {
      smartUpdateBtn.onclick = () => {
        this.openSmartUpdateModal();
      };
    }

    const webviewBtn = document.getElementById('btn-manga-webview');
    if (webviewBtn) {
      webviewBtn.onclick = () => {
        const url = m.url || m.source_url;
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else if (m.source === 'mangafire') {
          window.open(`https://mangafire.to/filter?keyword=${encodeURIComponent(m.title)}`, '_blank');
        } else if (m.source === 'asurascans') {
          window.open(`https://asuracomic.net/series?name=${encodeURIComponent(m.title)}`, '_blank');
        } else {
          Toast.show('No external URL available for this series', 'info');
        }
      };
    }
  },


  loadSavedSettings(mangaId) {
    // 1. Reset all manga-specific chapter filters to clean defaults
    this.filterDownloaded = false;
    this.filterUnread = false;
    this.filterBookmarked = false;
    this.filterScanlator = '';
    this.excludedScanlators = [];
    this.filterQuery = '';

    // 2. Load global default sort & display preferences (filters are NEVER global)
    let defaultSortMode = 'source';
    let defaultSortAsc = false;
    let defaultDisplayMode = 'source_title';

    try {
      const defaultRaw = localStorage.getItem('mihon_chapter_settings_default');
      if (defaultRaw) {
        const gd = JSON.parse(defaultRaw);
        if (gd.sortMode) defaultSortMode = gd.sortMode;
        if (typeof gd.sortAsc === 'boolean') defaultSortAsc = gd.sortAsc;
        if (gd.displayMode) defaultDisplayMode = gd.displayMode;
      }
    } catch (e) {
      console.error('Error parsing default chapter preferences:', e);
    }

    this.sortMode = defaultSortMode;
    this.sortAsc = defaultSortAsc;
    this.displayMode = defaultDisplayMode;

    // 3. Load manga-specific settings strictly for this mangaId
    if (mangaId) {
      const raw = localStorage.getItem(`mihon_chapter_settings_${mangaId}`);
      if (raw) {
        try {
          const s = JSON.parse(raw);
          this.filterDownloaded = !!s.filterDownloaded;
          this.filterUnread = !!s.filterUnread;
          this.filterBookmarked = !!s.filterBookmarked;
          this.filterScanlator = s.filterScanlator || '';
          this.excludedScanlators = Array.isArray(s.excludedScanlators) ? s.excludedScanlators : [];
          if (s.sortMode) this.sortMode = s.sortMode;
          if (typeof s.sortAsc === 'boolean') this.sortAsc = s.sortAsc;
          if (s.displayMode) this.displayMode = s.displayMode;
        } catch (e) {
          console.error(`Error parsing saved chapter settings for manga ${mangaId}:`, e);
        }
      } else {
        // Legacy fallback for sort direction
        const oldSort = localStorage.getItem(`mihon_chapter_sort_${mangaId}`);
        if (oldSort !== null) {
          this.sortAsc = oldSort === 'asc';
        }
      }

      // Sync settings with backend in background
      if (typeof API !== 'undefined' && API.getChapterSettings) {
        API.getChapterSettings(mangaId).then(remote => {
          if (remote && Array.isArray(remote.excludedScanlators) && remote.excludedScanlators.length > 0) {
            if (!this.excludedScanlators || this.excludedScanlators.length === 0) {
              this.excludedScanlators = remote.excludedScanlators;
              if (this.renderedMangaId === mangaId) {
                this.renderChapterRows();
                this.updateResumeButton();
              }
            }
          }
        }).catch(() => {});
      }
    }
  },

  saveSettings(mangaId) {
    if (!mangaId) return;

    // Save full per-manga settings (including manga-specific filters)
    const mangaData = {
      filterDownloaded: this.filterDownloaded,
      filterUnread: this.filterUnread,
      filterBookmarked: this.filterBookmarked,
      filterScanlator: this.filterScanlator,
      excludedScanlators: this.excludedScanlators,
      sortMode: this.sortMode,
      sortAsc: this.sortAsc,
      displayMode: this.displayMode
    };
    try {
      localStorage.setItem(`mihon_chapter_settings_${mangaId}`, JSON.stringify(mangaData));
    } catch (e) {}

    if (typeof API !== 'undefined' && API.saveChapterSettings) {
      API.saveChapterSettings(mangaId, mangaData).catch(err => {
        console.warn('Could not sync chapter settings to backend:', err);
      });
    }

    // Save ONLY display/sort preferences as default for new manga - NEVER manga filters!
    const globalDefaults = {
      sortMode: this.sortMode,
      sortAsc: this.sortAsc,
      displayMode: this.displayMode
    };
    try {
      localStorage.setItem('mihon_chapter_settings_default', JSON.stringify(globalDefaults));
    } catch (e) {}
  },

  getLibraryHeartIconSvg(inLib) {
    if (inLib) {
      return `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor; stroke: currentColor; stroke-width: 1.5;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  },

  renderSkeleton(container, source, mangaId) {
    container.innerHTML = `
      <div class="detail-header-nav">
        <button class="btn btn-secondary btn-icon-only" onclick="window.history.back()" title="Go back">
          <svg viewBox="0 0 24 24" class="nav-icon" style="width: 18px; height: 18px;">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-secondary);">Manga Details</span>
      </div>

      <div class="detail-hero manga-detail-hero" style="opacity: 0.85;">
        <div class="detail-cover-box detail-cover-wrap" style="width: 170px; height: 245px; background: rgba(255,255,255,0.06); border-radius: 8px;"></div>
        <div class="detail-content" style="flex: 1;">
          <div style="height: 28px; width: 55%; background: rgba(255,255,255,0.08); border-radius: 6px; margin-bottom: 14px;"></div>
          <div style="height: 18px; width: 35%; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 20px;"></div>
          <div style="height: 50px; width: 85%; background: rgba(255,255,255,0.03); border-radius: 6px;"></div>
        </div>
      </div>

      <div class="chapters-section" style="margin-top: 30px; text-align: center; padding: 40px; color: var(--text-muted);">
        <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 8px;">⟳</span> Loading manga details and latest chapters...
      </div>
    `;
  },

  async render(source, mangaId) {
    const container = document.getElementById('view-manga_detail') || document.getElementById('view-manga-detail');
    if (!container) return;

    this.cleanup();

    if (this.renderedMangaId !== mangaId) {
      this.renderedMangaId = null;
    }
    this.selectedChapterIds.clear();
    this.pendingDownloadIds.clear();
    this.loadSavedSettings(mangaId);

    // 1. Instant optimistic load: progress & downloads from localStorage & cache
    const cachedProgress = (() => {
      try {
        const s = localStorage.getItem('manga_progress_' + mangaId);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    })();

    const cachedDownloads = (() => {
      try {
        const s = localStorage.getItem('manga_downloads_' + mangaId);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    })();

    this.progressMap = cachedProgress || {};
    const initialDlIds = Array.isArray(cachedDownloads?.completed) ? cachedDownloads.completed : (Array.isArray(cachedDownloads) ? cachedDownloads : []);
    const initialDlNums = Array.isArray(cachedDownloads?.completed_numbers) ? cachedDownloads.completed_numbers : [];
    this.downloadedChapterIds = new Set(initialDlIds);
    this.downloadedChapterNumbers = new Set(initialDlNums);

    const cachedManga = (window.__mangaQuickCache && window.__mangaQuickCache.get(mangaId)) ||
      (State.library || []).find(it => it.id === mangaId) ||
      (() => {
        try {
          const s = sessionStorage.getItem('manga_browse_' + mangaId) || localStorage.getItem('manga_meta_' + mangaId);
          return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
      })();

    const cachedChapters = (() => {
      try {
        const s = localStorage.getItem('manga_chapters_' + mangaId);
        return s ? JSON.parse(s) : null;
      } catch (e) { return null; }
    })();

    if (Array.isArray(cachedChapters)) {
      cachedChapters.forEach(c => {
        if (c.is_read && !this.progressMap[c.id]) {
          this.progressMap[c.id] = { is_read: 1, is_bookmarked: c.is_bookmarked ? 1 : 0 };
        }
        if (cachedDownloads) {
          c.is_downloaded = this.downloadedChapterIds.has(c.id);
        } else if (c.is_downloaded) {
          this.downloadedChapterIds.add(c.id);
        }
      });
    }

    if (cachedManga) {
      this.manga = { ...cachedManga, source: cachedManga.source || source };
      this.chapters = Array.isArray(cachedChapters) ? cachedChapters : [];
      this.computeChapterDuplicates();
      this.isBackgroundLoading = true;
      // Paint immediately so title, thumbnail, grayed out read chapters, and download icons display with 0ms delay!
      this.renderContent(container);
    } else {
      this.renderSkeleton(container, source, mangaId);
    }

    this.stopDownloadPolling();
    this.downloadTasksMap = {};

    // Ensure State.library is loaded so in-library status is immediately accurate
    if (!State.library || State.library.length === 0) {
      API.getLibrary().then(lib => {
        State.library = lib || [];
        this.updateLibraryButtonState();
      }).catch(() => {});
    }

    // 2. Fast background lookup for SQLite progress & download status (resolves in ~5ms)
    // Run independently so we don't wait for remote online scrapers!
    Promise.all([
      API.getProgress(mangaId).catch(() => ({})),
      API.getMangaDownloadStatus(mangaId).catch(() => ({ completed: [], completed_numbers: [], active: {} }))
    ]).then(([freshProgress, dlStatus]) => {
      if (this.renderedMangaId !== mangaId && this.renderedMangaId !== null) return;
      this.progressMap = { ...this.progressMap, ...(freshProgress || {}) };
      const completedList = Array.isArray(dlStatus) ? dlStatus : (dlStatus?.completed || []);
      const completedNums = Array.isArray(dlStatus?.completed_numbers) ? dlStatus.completed_numbers : [];
      this.downloadedChapterIds = new Set(completedList);
      this.downloadedChapterNumbers = new Set(completedNums);
      this.downloadTasksMap = dlStatus?.active || {};

      if (Array.isArray(this.chapters)) {
        this.chapters.forEach(c => {
          c.is_downloaded = this.isChapterDownloaded(c);
        });
      }

      try {
        localStorage.setItem(`manga_progress_${mangaId}`, JSON.stringify(this.progressMap));
        localStorage.setItem(`manga_downloads_${mangaId}`, JSON.stringify({
          completed: Array.from(this.downloadedChapterIds),
          completed_numbers: Array.from(this.downloadedChapterNumbers)
        }));
        if (this.chapters && this.chapters.length > 0) {
          localStorage.setItem(`manga_chapters_${mangaId}`, JSON.stringify(this.chapters));
        }
      } catch (e) {}

      // Instant update of chapter rows for 0ms grayed-out effect
      this.renderChapterRows();
      this.updateResumeButton();

      if (Object.keys(this.downloadTasksMap).length > 0) {
        this.startDownloadPolling();
      }
    });

    // 3. Fast Fetch: Retrieve manga details and chapters concurrently (parallel pipeline)
    const detailsPromise = API.getMangaDetails(source, mangaId);
    const chaptersPromise = API.getMangaChapters(source, mangaId).catch(() => []);

    // Render manga details immediately as soon as metadata arrives
    detailsPromise.then(mDetails => {
      if (this.renderedMangaId !== mangaId && this.renderedMangaId !== null) return;
      if (!mDetails) return;
      this.manga = mDetails;
      if (Array.isArray(mDetails.chapters) && mDetails.chapters.length > 0 && (!this.chapters || this.chapters.length === 0)) {
        this.chapters = mDetails.chapters;
        this.isBackgroundLoading = false;
      }
      this.renderContent(container);
    }).catch(err => {
      console.error('Failed to load manga details:', err);
    });

    // Populate chapters immediately as soon as chapter list arrives
    chaptersPromise.then(chs => {
      if (this.renderedMangaId !== mangaId && this.renderedMangaId !== null) return;
      const mChapters = Array.isArray(chs) ? chs : [];
      if (mChapters.length > 0 || !this.chapters || this.chapters.length === 0) {
        this.chapters = mChapters;
      }
      this.isBackgroundLoading = false;
      this.computeChapterDuplicates();

      if (Array.isArray(this.chapters)) {
        this.chapters.forEach(c => {
          if (c.is_read && (!this.progressMap[c.id] || !this.progressMap[c.id].is_read)) {
            this.progressMap[c.id] = { ...this.progressMap[c.id], is_read: 1 };
          }
          if (c.is_downloaded) {
            this.downloadedChapterIds.add(c.id);
          } else {
            this.downloadedChapterIds.delete(c.id);
          }
        });
      }

      try {
        if (this.manga) {
          localStorage.setItem(`manga_meta_${mangaId}`, JSON.stringify(this.manga));
        }
        if (this.chapters && this.chapters.length > 0) {
          localStorage.setItem(`manga_chapters_${mangaId}`, JSON.stringify(this.chapters));
        }
        localStorage.setItem(`manga_progress_${mangaId}`, JSON.stringify(this.progressMap));
        localStorage.setItem(`manga_downloads_${mangaId}`, JSON.stringify({
          completed: Array.from(this.downloadedChapterIds),
          completed_numbers: Array.from(this.downloadedChapterNumbers)
        }));
      } catch (e) {}

      if (this.manga && this.chapters) {
        API.cacheManga(mangaId, {
          manga: this.manga,
          chapters: this.chapters
        }).catch(() => {});
      }

      this.renderChapterRows();
      this.updateResumeButton();
      if (Object.keys(this.downloadTasksMap).length > 0) {
        this.startDownloadPolling();
      }

      // Non-blocking background revalidation from online source (Mihon Stale-While-Revalidate)
      const refreshKey = 'manga_last_sync_' + mangaId;
      const lastSync = parseInt(sessionStorage.getItem(refreshKey) || '0', 10);
      const nowTs = Date.now();
      if (nowTs - lastSync > 15 * 60 * 1000) {
        sessionStorage.setItem(refreshKey, String(nowTs));
        API.getMangaChapters(source, mangaId, true).then(freshChs => {
          if (this.renderedMangaId !== mangaId && this.renderedMangaId !== null) return;
          if (Array.isArray(freshChs) && freshChs.length > 0) {
            const prevLen = this.chapters ? this.chapters.length : 0;
            if (freshChs.length !== prevLen) {
              this.chapters = freshChs;
              this.computeChapterDuplicates();
              this.renderChapterRows();
              this.updateResumeButton();
              const countEl = document.getElementById('chapters-title-count');
              if (countEl) countEl.textContent = `${this.getDisplayChapterCount()} Chapters`;
              if (freshChs.length > prevLen) {
                Toast.show(`Found ${freshChs.length - prevLen} new chapter(s)`, 'info');
              }
            }
          }
        }).catch(() => {});
      }
    });

    try {
      await Promise.all([detailsPromise, chaptersPromise]);
    } catch (err) {
      console.error('Failed to load manga details:', err);
      this.isBackgroundLoading = false;
      if (!this.manga) {
        container.innerHTML = `
          <div style="text-align: center; padding: 60px 20px; color: var(--accent-red);">
            Failed to load manga details: ${err.message}
            <div style="margin-top: 16px;">
              <button class="btn btn-secondary" onclick="window.history.back()">Go Back</button>
            </div>
          </div>
        `;
      }
    }
  },

  getResumeTarget() {
    if (!this.chapters || this.chapters.length === 0) {
      return { nextChapter: null, targetPage: 1, buttonLabel: '' };
    }

    // Build sets of read chapter IDs and read Chapter Numbers
    const readChapterIds = new Set();
    const readChapterNumbers = new Set();
    const chapterProgressMap = new Map();

    (this.chapters || []).forEach(c => {
      const p = this.progressMap[c.id];
      const chNum = this.extractChapterNumber(c);
      if (p) {
        if (!chapterProgressMap.has(chNum) || (p.page_index || 0) > (chapterProgressMap.get(chNum)?.page_index || 0)) {
          chapterProgressMap.set(chNum, p);
        }
      }
      const isRead = p ? (p.is_read === 1 || p.is_read === true) : (c.is_read === 1 || c.is_read === true);
      if (isRead) {
        readChapterIds.add(c.id);
        if (chNum > 0 || (c.title && !isNaN(chNum))) {
          readChapterNumbers.add(chNum);
        }
      }
    });

    const isChapterRead = (c) => {
      if (readChapterIds.has(c.id)) return true;
      const chNum = this.extractChapterNumber(c);
      if (readChapterNumbers.has(chNum)) return true;
      const p = this.progressMap[c.id];
      return p ? (p.is_read === 1 || p.is_read === true) : (c.is_read === 1 || c.is_read === true);
    };

    // Candidate chapters: apply scanlator filter (Mihon: applyScanlatorFilter = true)
    let candidates = [...this.chapters];
    if (this.excludedScanlators && this.excludedScanlators.length > 0) {
      const excluded = new Set(this.excludedScanlators.map(s => s.toLowerCase().trim()));
      const filtered = candidates.filter(c => {
        const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
        return !excluded.has(scan);
      });
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    // Deduplicate candidate chapters by chapter number (prefer official scanlator)
    const seenNumbers = new Map();
    candidates.forEach(c => {
      const num = this.extractChapterNumber(c);
      if (!seenNumbers.has(num)) {
        seenNumbers.set(num, c);
      } else {
        const existing = seenNumbers.get(num);
        const existingScan = (existing.scanlator || '').toLowerCase();
        const curScan = (c.scanlator || '').toLowerCase();
        if (!existingScan.includes('official') && curScan.includes('official')) {
          seenNumbers.set(num, c);
        }
      }
    });

    // Deduplicated candidates sorted ascending by chapter number
    const chaptersAsc = Array.from(seenNumbers.values()).sort((a, b) => {
      const na = this.extractChapterNumber(a);
      const nb = this.extractChapterNumber(b);
      if (na !== nb) return na - nb;
      return (this.chapters.indexOf(b) - this.chapters.indexOf(a));
    });

    // Find first unread chapter in serial order
    const firstUnread = chaptersAsc.find(ch => !isChapterRead(ch));

    let nextChapter = null;
    let targetPage = 1;
    let buttonLabel = '';

    if (firstUnread) {
      nextChapter = firstUnread;
      const chNum = this.extractChapterNumber(nextChapter);
      const p = this.progressMap[nextChapter.id] || chapterProgressMap.get(chNum);
      targetPage = (p && p.page_index > 1) ? p.page_index : 1;
      const clean = this.cleanChapterTitle(nextChapter.title) || (`Chapter ${nextChapter.chapter_number || chNum}`);
      buttonLabel = targetPage > 1 ? `Resume ${clean} (Page ${targetPage})` : `Read ${clean}`;
    } else if (chaptersAsc.length > 0) {
      nextChapter = chaptersAsc[0];
      targetPage = 1;
      const clean = this.cleanChapterTitle(nextChapter.title) || (`Chapter ${nextChapter.chapter_number || this.extractChapterNumber(nextChapter)}`);
      buttonLabel = `Re-read ${clean}`;
    }

    return { nextChapter, targetPage, buttonLabel };
  },

  updateResumeButton() {
    const actionsContainer = document.querySelector('.detail-actions');
    if (!actionsContainer) return;

    const { nextChapter, targetPage, buttonLabel } = this.getResumeTarget();
    let readResumeBtn = document.getElementById('btn-read-resume');
    const floatingBtn = document.getElementById('floating-read-resume');
    const floatingText = document.getElementById('floating-resume-text');

    if (nextChapter) {
      if (!readResumeBtn) {
        readResumeBtn = document.createElement('button');
        readResumeBtn.id = 'btn-read-resume';
        readResumeBtn.className = 'btn btn-primary';
        readResumeBtn.style.padding = '10px 24px';
        actionsContainer.prepend(readResumeBtn);
      }
      readResumeBtn.style.display = 'inline-flex';
      readResumeBtn.textContent = buttonLabel;
      readResumeBtn.onclick = () => {
        Router.navigate(`read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(nextChapter.id)}${targetPage > 1 ? '?page=' + targetPage : ''}`);
      };

      if (floatingText) {
        floatingText.textContent = 'Resume';
      }
    } else {
      if (readResumeBtn) {
        readResumeBtn.style.display = 'none';
      }
      if (floatingBtn) {
        floatingBtn.classList.remove('visible');
      }
    }

    this.updateFloatingButtonsVisibility();
  },

  bindFloatingResume() {
    const floatingBtn = document.getElementById('floating-read-resume');
    if (floatingBtn) {
      floatingBtn.onclick = () => {
        const { nextChapter, targetPage } = this.getResumeTarget();
        if (nextChapter && this.manga) {
          Router.navigate(`read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(nextChapter.id)}${targetPage > 1 ? '?page=' + targetPage : ''}`);
        }
      };
    }

    const scrollTopBtn = document.getElementById('btn-scroll-to-top');
    if (scrollTopBtn) {
      scrollTopBtn.onclick = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }

    if (this._onScrollHandler) {
      window.removeEventListener('scroll', this._onScrollHandler);
    }
    let ticking = false;
    this._onScrollHandler = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.updateFloatingButtonsVisibility();
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', this._onScrollHandler, { passive: true });
    this.updateFloatingButtonsVisibility();
  },

  updateFloatingButtonsVisibility() {
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    // 1. Go to top floating button
    const scrollTopBtn = document.getElementById('btn-scroll-to-top');
    if (scrollTopBtn) {
      if (this.selectedChapterIds && this.selectedChapterIds.size > 0) {
        scrollTopBtn.classList.remove('visible');
      } else if (scrollY > 300) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    }

    // 2. Floating Resume button
    this.updateFloatingResumeVisibility();
  },

  updateFloatingResumeVisibility() {
    const floatingBtn = document.getElementById('floating-read-resume');
    if (!floatingBtn) return;

    if (this.selectedChapterIds && this.selectedChapterIds.size > 0) {
      floatingBtn.classList.remove('visible');
      return;
    }

    const { nextChapter, buttonLabel } = this.getResumeTarget();
    if (!nextChapter) {
      floatingBtn.classList.remove('visible');
      return;
    }

    const floatingText = document.getElementById('floating-resume-text');
    if (floatingText) {
      floatingText.textContent = 'Resume';
    }

    const inlineBtn = document.getElementById('btn-read-resume');
    if (!inlineBtn || inlineBtn.style.display === 'none') {
      floatingBtn.classList.remove('visible');
      return;
    }

    // Top app bar height is 68px. When the inline button scrolls off screen (bottom passes 68px):
    const rect = inlineBtn.getBoundingClientRect();
    const hasLeftScreen = rect.bottom <= 68;
    if (hasLeftScreen) {
      floatingBtn.classList.add('visible');
    } else {
      floatingBtn.classList.remove('visible');
    }
  },

  cleanup() {
    if (this._onScrollHandler) {
      window.removeEventListener('scroll', this._onScrollHandler);
      this._onScrollHandler = null;
    }
    if (typeof this.stopDownloadPolling === 'function') {
      this.stopDownloadPolling();
    }
    const floatingBtn = document.getElementById('floating-read-resume');
    if (floatingBtn) {
      floatingBtn.classList.remove('visible');
    }
    const scrollTopBtn = document.getElementById('btn-scroll-to-top');
    if (scrollTopBtn) {
      scrollTopBtn.classList.remove('visible');
    }
  },

  updateDynamicHeader(m, libItem) {
    const titleCountEl = document.getElementById('chapters-title-count');
    if (titleCountEl) {
      titleCountEl.innerHTML = `${this.getDisplayChapterCount()} Chapters`;
    }

    const coverImg = document.getElementById('detail-cover-image');
    if (coverImg && m.cover_url && !coverImg.src.includes(m.cover_url)) {
      coverImg.src = m.cover_url;
    }

    const metaContainer = document.getElementById('detail-meta-container') || document.querySelector('.detail-meta-row');
    if (metaContainer) {
      metaContainer.className = 'detail-meta-container';
      metaContainer.id = 'detail-meta-container';
      metaContainer.innerHTML = this.renderMetaSectionHtml(m);
      this.bindGenreChips(metaContainer);
    }

    const synopsisContainer = document.querySelector('.synopsis-container');
    if (synopsisContainer) {
      synopsisContainer.innerHTML = this.renderSynopsisHtml(m);
      this.bindSynopsisToggle();
    }

    this.updateResumeButton();
    this.updateLibraryButtonState();
    this.bindLibraryButtons();
  },

  renderContent(container) {
    const m = this.manga;
    const libItem = (State.library || []).find(item => item.id === m.id);
    const isInLibrary = !!libItem;
    const categoryName = libItem ? (libItem.category_name || 'Default') : 'Default';
    const coverUrl = m.cover_url || '/static/img/default-cover.png';
    const genres = Array.isArray(m.genres) ? [...new Set(m.genres.filter(g => g && typeof g === 'string' && g.trim() && g.trim().toLowerCase() !== 'home'))] : [];

    const { nextChapter, targetPage, buttonLabel } = this.getResumeTarget();

    // If already rendered for this manga, do a soft update without destroying DOM or resetting scroll
    const isAlreadyRendered = this.renderedMangaId === m.id && !!document.getElementById('chapter-list-wrap');
    if (isAlreadyRendered) {
      this.updateDynamicHeader(m, libItem);
      this.renderChapterRows();
      return;
    }

    const prevScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    this.renderedMangaId = m.id;

    // Active filter count badge
    let activeFilterCount = 0;
    if (this.filterDownloaded) activeFilterCount++;
    if (this.filterUnread) activeFilterCount++;
    if (this.filterBookmarked) activeFilterCount++;
    if (this.filterScanlator) activeFilterCount++;

    container.innerHTML = `
      <div class="detail-header-nav">
        <button class="btn btn-secondary btn-icon-only" id="detail-back-btn" title="Go back">
          <svg viewBox="0 0 24 24" class="nav-icon" style="width: 18px; height: 18px;">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-secondary);">Manga Details</span>
      </div>

      <div class="detail-hero manga-detail-hero">
        <div class="detail-cover-box detail-cover-wrap">
          <img class="detail-cover-img" id="detail-cover-image" src="${coverUrl}" alt="${m.title}" />
          <div class="detail-cover-overlay">
            <button class="btn-change-cover" id="btn-change-cover" title="Change or customize cover image">Edit Cover</button>
          </div>
        </div>

        <div class="detail-content">
          <div class="detail-title-row" style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px;">
            <h1 class="detail-title" style="margin: 0; line-height: 1.25;">${m.title}</h1>
            <div class="detail-hero-top-actions" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              <button id="btn-manga-migrate" class="btn btn-secondary btn-icon-only" title="Migrate to another source" style="display: inline-flex; padding: 6px 10px; border-radius: 8px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <path d="M16 3h5v5"></path>
                  <path d="M4 20L21 3"></path>
                  <path d="M21 16v5h-5"></path>
                  <path d="M15 15l6 6"></path>
                  <path d="M4 4l5 5"></path>
                </svg>
              </button>
              ${m.source !== 'local' ? `
                <div class="download-dropdown-wrapper" id="download-dropdown-wrapper">
                  <button id="btn-download-menu" class="btn btn-secondary btn-icon-only" title="Download options" style="padding: 6px 10px; border-radius: 8px;">
                    <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </button>
                  <div id="download-dropdown-menu" class="download-dropdown-menu" style="display: none;">
                    <button class="dl-menu-item" data-action="next-1">Next chapter</button>
                    <button class="dl-menu-item" data-action="next-5">Next 5 chapters</button>
                    <button class="dl-menu-item" data-action="next-10">Next 10 chapters</button>
                    <button class="dl-menu-item" data-action="next-25">Next 25 chapters</button>
                    <button class="dl-menu-item" data-action="unread">Unread</button>
                    <button class="dl-menu-item" data-action="bookmarked">Bookmarked</button>
                  </div>
                </div>
              ` : ''}
              <button id="btn-edit-metadata-top" class="btn btn-secondary btn-icon-only" title="Edit manga info & custom cover" style="padding: 6px 10px; border-radius: 8px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="detail-meta-container" id="detail-meta-container">
            ${this.renderMetaSectionHtml(m)}
          </div>

          <div class="synopsis-container">
            ${this.renderSynopsisHtml(m)}
          </div>

          <div class="detail-actions">
            ${nextChapter ? `
              <button id="btn-read-resume" class="btn btn-primary" style="padding: 10px 24px;">
                ${buttonLabel}
              </button>
            ` : ''}

            <!-- 1. Add to library: Exact 42x42px square icon button like before -->
            <button id="btn-toggle-library" class="btn btn-secondary btn-icon-only ${isInLibrary ? 'in-library' : ''}" title="${isInLibrary ? 'In Library - Click to remove' : 'Add to Library'}">
              ${this.getLibraryHeartIconSvg(isInLibrary)}
            </button>

            <!-- 2. Update (Hourglass) BEFORE Tracking -->
            <button id="btn-manga-smart-update" class="btn btn-secondary" title="Update frequency and strategy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 22h14"></path>
                <path d="M5 2h14"></path>
                <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path>
                <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path>
              </svg>
              <span id="btn-smart-update-text">${this.calculateExpectedInterval(m, this.chapters)}</span>
            </button>

            <!-- 3. Tracking (Sync arrows) -->
            <button id="btn-manga-tracking" class="btn btn-secondary" title="Manage tracking services (AniList, MyAnimeList, etc.)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.5 2v6h-6"></path>
                <path d="M2.5 22v-6h6"></path>
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
              </svg>
              <span id="btn-tracking-text">Tracking</span>
            </button>

            <!-- 4. WebView (Globe) -->
            <button id="btn-manga-webview" class="btn btn-secondary" title="Open source website in browser">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>WebView</span>
            </button>
          </div>
        </div>
      </div>

      <div class="chapters-section">
        <div class="chapters-header">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="chapters-title-count" id="chapters-title-count">
              ${this.getDisplayChapterCount()} Chapters
            </div>
            <button id="btn-toggle-select-all" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;">
              Select All
            </button>
          </div>
          <div class="chapters-tools" style="display: flex; align-items: center; gap: 8px;">
            <input type="text" id="chapter-filter" class="chapter-filter-input" placeholder="Filter chapter..." />
            
            <button id="btn-chapter-refresh" class="btn btn-secondary btn-icon-only" style="padding: 6px 9px;" title="Refresh & check for updates from source">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </button>

            <!-- Mihon Filter / Sort / Display Options Trigger Button -->
            <button id="btn-chapter-options" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;" title="Chapter Filter, Sort & Display Options">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="7" y1="12" x2="17" y2="12"></line>
                <line x1="10" y1="18" x2="14" y2="18"></line>
              </svg>
              <span>Options</span>
              ${activeFilterCount > 0 ? `<span class="active-filter-badge" style="background: var(--accent-primary); color: #fff; font-size: 0.72rem; padding: 1px 6px; border-radius: 10px;">${activeFilterCount}</span>` : ''}
            </button>
          </div>
        </div>

        <div class="chapter-list" id="chapter-list-wrap"></div>
      </div>

      <!-- Sticky Bulk Chapter Actions Toolbar -->
      <div class="bulk-actions-toolbar" id="bulk-actions-toolbar" style="display: none;">
        <div class="bulk-actions-count" id="bulk-selected-count">0 Selected</div>
        <div class="bulk-actions-btns">
          <button class="btn btn-secondary" id="bulk-mark-read" style="padding: 6px 12px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Mark Read</span>
          </button>
          <button class="btn btn-secondary" id="bulk-mark-unread" style="padding: 6px 12px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
            <span>Mark Unread</span>
          </button>
          <button class="btn btn-secondary" id="bulk-bookmark" style="padding: 6px 12px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span id="bulk-bookmark-text">Bookmark</span>
          </button>
          ${m.source !== 'local' ? `
            <button class="btn btn-primary" id="bulk-download" style="padding: 6px 14px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download</span>
            </button>
            <button class="btn btn-secondary" id="bulk-delete-downloads" style="padding: 6px 12px; font-size: 0.82rem; color: var(--accent-red, #ef4444); border-color: rgba(239,68,68,0.3); display: inline-flex; align-items: center; gap: 6px;" title="Delete downloaded chapters">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </button>
          ` : ''}
          <button class="btn btn-secondary" id="bulk-cancel-selection" style="padding: 6px 10px; font-size: 0.82rem; display: inline-flex; align-items: center;" title="Cancel selection">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Floating Go to Top Button (Bottom Middle) -->
      <button id="btn-scroll-to-top" class="floating-scroll-top-btn" type="button" title="Go to top" aria-label="Go to top">
        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.5;" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>

      <!-- Floating Resume Button (Bottom Right Corner) -->
      <button id="floating-read-resume" class="floating-resume-btn" type="button" title="Resume reading">
        <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: currentColor; flex-shrink: 0;">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span id="floating-resume-text">Resume</span>
      </button>

      <!-- Container for Mihon Chapter Options Modal -->
      <div id="chapter-options-modal-container"></div>
    `;

    // Events
    document.getElementById('detail-back-btn').addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        Router.navigate('library');
      }
    });

    this.bindGenreChips(container);

    if (nextChapter) {
      const readResumeBtn = document.getElementById('btn-read-resume');
      if (readResumeBtn) {
        readResumeBtn.onclick = () => {
          Router.navigate(`read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(nextChapter.id)}${targetPage > 1 ? '?page=' + targetPage : ''}`);
        };
      }
    }

    this.bindLibraryButtons();
    this.updateTrackingButtonState();
    this.updateSmartUpdateButtonState();

    const changeCoverBtn = document.getElementById('btn-change-cover');
    if (changeCoverBtn) {
      changeCoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditMetadataModal();
      });
    }

    const editMetaBtn = document.getElementById('btn-edit-metadata');
    if (editMetaBtn) {
      editMetaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditMetadataModal();
      });
    }

    const editMetaTopBtn = document.getElementById('btn-edit-metadata-top');
    if (editMetaTopBtn) {
      editMetaTopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditMetadataModal();
      });
    }

    this.bindSynopsisToggle();

    // Download Options Dropdown in top-right hero corner
    const dlMenuBtn = document.getElementById('btn-download-menu');
    const dlMenu = document.getElementById('download-dropdown-menu');
    if (dlMenuBtn && dlMenu) {
      dlMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = dlMenu.style.display !== 'none';
        dlMenu.style.display = isShown ? 'none' : 'flex';
      });

      dlMenu.querySelectorAll('.dl-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.getAttribute('data-action');
          dlMenu.style.display = 'none';
          this.handleDownloadOption(action);
        });
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#download-dropdown-wrapper')) {
          dlMenu.style.display = 'none';
        }
      });
    }

    // Mihon Chapter Options Modal Button
    const optionsBtn = document.getElementById('btn-chapter-options');
    if (optionsBtn) {
      optionsBtn.addEventListener('click', () => {
        this.openChapterOptionsModal();
      });
    }

    const refreshBtn = document.getElementById('btn-chapter-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshFromSource();
      });
    }

    const filterInput = document.getElementById('chapter-filter');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.filterQuery = e.target.value.toLowerCase().trim();
        this.renderChapterRows();
      });
    }

    // Select All Toggle
    document.getElementById('btn-toggle-select-all').addEventListener('click', () => {
      const visibleChapters = this.getFilteredChapters();
      const allVisibleSelected = visibleChapters.length > 0 && visibleChapters.every(c => this.selectedChapterIds.has(c.id));
      if (allVisibleSelected) {
        visibleChapters.forEach(c => this.selectedChapterIds.delete(c.id));
      } else {
        visibleChapters.forEach(c => this.selectedChapterIds.add(c.id));
      }
      this.updateBulkToolbar();
      this.renderChapterRows();
    });

    // Bulk actions
    document.getElementById('bulk-mark-read').addEventListener('click', () => {
      const ids = Array.from(this.selectedChapterIds);
      ids.forEach(id => {
        if (!this.progressMap[id]) this.progressMap[id] = {};
        this.progressMap[id].is_read = 1;
        const ch = (this.chapters || []).find(c => c.id === id);
        if (ch) {
          const num = this.extractChapterNumber(ch);
          if (num > 0) {
            (this.chapters || []).forEach(c => {
              if (this.extractChapterNumber(c) === num) {
                if (!this.progressMap[c.id]) this.progressMap[c.id] = {};
                this.progressMap[c.id].is_read = 1;
              }
            });
          }
        }
      });
      try {
        localStorage.setItem(`manga_progress_${this.manga.id}`, JSON.stringify(this.progressMap));
      } catch (e) {}
      Toast.show(`Marked ${ids.length} chapters as read`, 'success');
      this.selectedChapterIds.clear();
      this.updateBulkToolbar();
      this.renderChapterRows();
      this.updateResumeButton();
      const totalReadNow = (this.chapters || []).filter(c => this.progressMap[c.id]?.is_read || c.is_read).length;
      this.syncReadingProgressToTrackers(this.manga.id, totalReadNow);

      API.bulkUpdateProgress({
        manga_id: this.manga.id,
        chapter_ids: ids,
        action: 'mark_read'
      }).catch(err => console.error('Bulk mark read failed:', err));
    });

    document.getElementById('bulk-mark-unread').addEventListener('click', () => {
      const ids = Array.from(this.selectedChapterIds);
      ids.forEach(id => {
        if (!this.progressMap[id]) this.progressMap[id] = {};
        this.progressMap[id].is_read = 0;
        const ch = (this.chapters || []).find(c => c.id === id);
        if (ch) {
          const num = this.extractChapterNumber(ch);
          if (num > 0) {
            (this.chapters || []).forEach(c => {
              if (this.extractChapterNumber(c) === num) {
                if (!this.progressMap[c.id]) this.progressMap[c.id] = {};
                this.progressMap[c.id].is_read = 0;
              }
            });
          }
        }
      });
      try {
        localStorage.setItem(`manga_progress_${this.manga.id}`, JSON.stringify(this.progressMap));
      } catch (e) {}
      Toast.show(`Marked ${ids.length} chapters as unread`, 'info');
      this.selectedChapterIds.clear();
      this.updateBulkToolbar();
      this.renderChapterRows();
      this.updateResumeButton();

      API.bulkUpdateProgress({
        manga_id: this.manga.id,
        chapter_ids: ids,
        action: 'mark_unread'
      }).catch(err => console.error('Bulk mark unread failed:', err));
    });

    document.getElementById('bulk-bookmark').addEventListener('click', async () => {
      const ids = Array.from(this.selectedChapterIds);
      const isUnbookmark = document.getElementById('bulk-bookmark')?.getAttribute('data-action') === 'unbookmark';
      const action = isUnbookmark ? 'unbookmark' : 'bookmark';
      const bmVal = isUnbookmark ? 0 : 1;

      await API.bulkUpdateProgress({
        manga_id: this.manga.id,
        chapter_ids: ids,
        action: action
      });
      ids.forEach(id => {
        if (!this.progressMap[id]) this.progressMap[id] = {};
        this.progressMap[id].is_bookmarked = bmVal;
      });
      try {
        localStorage.setItem(`manga_progress_${this.manga.id}`, JSON.stringify(this.progressMap));
      } catch (e) {}
      Toast.show(isUnbookmark ? `Removed bookmark from ${ids.length} chapter${ids.length > 1 ? 's' : ''}` : `Bookmarked ${ids.length} chapter${ids.length > 1 ? 's' : ''}`, 'success');
      this.selectedChapterIds.clear();
      this.updateBulkToolbar();
      this.renderChapterRows();
    });

    const bulkDlBtn = document.getElementById('bulk-download');
    if (bulkDlBtn) {
      bulkDlBtn.addEventListener('click', async () => {
        const ids = Array.from(this.selectedChapterIds);
        const selectedChapters = this.chapters
          .filter(c => ids.includes(c.id) && !this.downloadedChapterIds.has(c.id))
          .sort((a, b) => this.extractChapterNumber(a) - this.extractChapterNumber(b));

        if (selectedChapters.length === 0) {
          Toast.show('Selected chapters already downloaded', 'info');
          return;
        }

        selectedChapters.forEach(ch => {
          this.pendingDownloadIds.add(ch.id);
          this.updateChapterDownloadUI(ch.id, false, { status: 'pending' });
        });

        const items = selectedChapters.map(ch => ({
          manga_id: this.manga.id,
          manga_title: this.manga.title,
          chapter_id: ch.id,
          chapter_number: ch.chapter_number,
          chapter_title: ch.title,
          scanlator: ch.scanlator || '',
          source: this.manga.source,
          cover_url: this.manga.cover_url || ''
        }));

        try {
          await API.queueBulkDownloads(items);
          this.startDownloadPolling();
          Toast.show(`Queued ${items.length} chapters for download`, 'success');
        } catch (err) {
          Toast.show('Failed to queue downloads: ' + err.message, 'error');
        } finally {
          this.selectedChapterIds.clear();
          this.updateBulkToolbar();
          this.renderChapterRows();
        }
      });
    }

    const bulkDeleteBtn = document.getElementById('bulk-delete-downloads');
    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', async () => {
        const ids = Array.from(this.selectedChapterIds);
        const downloadedSelected = (this.chapters || []).filter(c => ids.includes(c.id) && this.isChapterDownloaded(c));

        if (downloadedSelected.length === 0) {
          Toast.show('No downloaded chapters selected to delete', 'info');
          return;
        }

        if (!confirm(`Delete downloads for ${downloadedSelected.length} selected chapter(s)?`)) {
          return;
        }

        try {
          for (const ch of downloadedSelected) {
            const chNum = this.extractChapterNumber(ch);
            await API.deleteChapterDownload(this.manga.id, ch.id, chNum, ch.scanlator || '');
            this.downloadedChapterIds.delete(ch.id);
            ch.is_downloaded = false;
            this.updateChapterDownloadUI(ch.id, false, null);
          }

          // Recalculate downloadedChapterNumbers
          this.downloadedChapterNumbers.clear();
          (this.chapters || []).forEach(c => {
            if (this.downloadedChapterIds.has(c.id)) {
              const num = this.extractChapterNumber(c);
              if (num > 0) this.downloadedChapterNumbers.add(num);
            }
          });

          try {
            localStorage.setItem(`manga_downloads_${this.manga.id}`, JSON.stringify({
              completed: Array.from(this.downloadedChapterIds),
              completed_numbers: Array.from(this.downloadedChapterNumbers)
            }));
            if (this.chapters && this.chapters.length > 0) {
              localStorage.setItem(`manga_chapters_${this.manga.id}`, JSON.stringify(this.chapters));
            }
          } catch (e) {}

          Toast.show(`Deleted ${downloadedSelected.length} chapter downloads`, 'info');
          this.selectedChapterIds.clear();
          this.updateBulkToolbar();
          this.renderChapterRows();
          await LibraryView.loadData();
        } catch (err) {
          console.error('Failed to delete bulk downloads:', err);
          Toast.show('Failed to delete some downloads: ' + err.message, 'error');
        }
      });
    }

    document.getElementById('bulk-cancel-selection').addEventListener('click', () => {
      this.selectedChapterIds.clear();
      this.updateBulkToolbar();
      this.renderChapterRows();
    });

    this.renderChapterRows();
    this.bindFloatingResume();
  },

  getValidCandidatesForDownload() {
    let candidates = [...(this.chapters || [])];

    // Filter by excluded scanlators
    if (this.excludedScanlators && this.excludedScanlators.length > 0) {
      const excluded = new Set(this.excludedScanlators.map(s => (s || '').toLowerCase().trim()));
      candidates = candidates.filter(c => {
        const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
        return !excluded.has(scan);
      });
    }

    // Filter by specific scanlator if active
    if (this.filterScanlator) {
      const targetScan = this.filterScanlator.toLowerCase().trim();
      candidates = candidates.filter(c => {
        const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
        return scan === targetScan;
      });
    }

    // Deduplicate candidate chapters by chapter number (prefer official scanlator)
    const seenNumbers = new Map();
    candidates.forEach(c => {
      const num = this.extractChapterNumber(c);
      if (!seenNumbers.has(num)) {
        seenNumbers.set(num, c);
      } else {
        const existing = seenNumbers.get(num);
        const existingScan = (existing.scanlator || '').toLowerCase();
        const curScan = (c.scanlator || '').toLowerCase();
        if (!existingScan.includes('official') && curScan.includes('official')) {
          seenNumbers.set(num, c);
        }
      }
    });

    return Array.from(seenNumbers.values());
  },

  handleDownloadOption(action) {
    if (!this.chapters || this.chapters.length === 0) {
      if (typeof Toast !== 'undefined') Toast.show('No chapters available to download', 'info');
      return;
    }

    const isDownloaded = (ch) => this.isChapterDownloaded(ch);

    const sortByReadingOrder = (list) => {
      return [...list].sort((a, b) => {
        const na = this.extractChapterNumber(a);
        const nb = this.extractChapterNumber(b);
        if (na !== nb) return na - nb;
        return (this.chapters.indexOf(a) - this.chapters.indexOf(b));
      });
    };

    const candidatePool = this.getValidCandidatesForDownload();

    if (action.startsWith('next-')) {
      const count = parseInt(action.replace('next-', ''), 10) || 1;
      const unreadUndownloaded = candidatePool.filter(ch => {
        const isRead = !!(this.progressMap[ch.id]?.is_read ?? ch.is_read);
        return !isRead && !isDownloaded(ch);
      });
      const sorted = sortByReadingOrder(unreadUndownloaded);
      const toQueue = sorted.slice(0, count);
      this.downloadChapterList(toQueue, count === 1 ? 'next unread chapter' : `next ${count} chapters`);
    } else if (action === 'unread') {
      const unreadUndownloaded = candidatePool.filter(ch => {
        const isRead = !!(this.progressMap[ch.id]?.is_read ?? ch.is_read);
        return !isRead && !isDownloaded(ch);
      });
      const sorted = sortByReadingOrder(unreadUndownloaded);
      this.downloadChapterList(sorted, 'unread');
    } else if (action === 'bookmarked') {
      const bookmarkedUndownloaded = candidatePool.filter(ch => {
        const isBookmarked = !!(this.progressMap[ch.id]?.is_bookmarked ?? ch.is_bookmarked);
        return isBookmarked && !isDownloaded(ch);
      });
      const sorted = sortByReadingOrder(bookmarkedUndownloaded);
      this.downloadChapterList(sorted, 'bookmarked');
    }
  },

  async downloadChapterList(chaptersToDownload, label) {
    if (!chaptersToDownload || chaptersToDownload.length === 0) {
      if (typeof Toast !== 'undefined') Toast.show(`No ${label} to download`, 'info');
      return;
    }

    const m = this.manga;
    chaptersToDownload.forEach(ch => {
      this.pendingDownloadIds.add(ch.id);
      this.updateChapterDownloadUI(ch.id, false, { status: 'pending' });
    });

    const items = chaptersToDownload.map((ch, idx) => ({
      manga_id: m.id,
      manga_title: m.title,
      chapter_id: ch.id,
      chapter_number: this.extractChapterNumber(ch),
      chapter_title: ch.title || `Chapter ${ch.chapter_number}`,
      source: m.source,
      scanlator: ch.scanlator || '',
      cover_url: m.cover_url || '',
      order_index: idx
    }));

    try {
      const BATCH_SIZE = 250;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await API.queueBulkDownloads(batch);
      }
      this.startDownloadPolling();
      if (typeof Toast !== 'undefined') {
        Toast.show(`Queued ${items.length} chapter${items.length > 1 ? 's' : ''} for download`, 'success');
      }
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.show('Failed to queue downloads: ' + err.message, 'error');
      }
    } finally {
      this.renderChapterRows();
    }
  },

  updateBulkToolbar() {
    const bar = document.getElementById('bulk-actions-toolbar');
    const countEl = document.getElementById('bulk-selected-count');
    const selectAllBtn = document.getElementById('btn-toggle-select-all');
    const btnMarkRead = document.getElementById('bulk-mark-read');
    const btnMarkUnread = document.getElementById('bulk-mark-unread');
    const btnBookmark = document.getElementById('bulk-bookmark');
    const btnDelete = document.getElementById('bulk-delete-downloads');

    if (!bar) return;
    const count = this.selectedChapterIds ? this.selectedChapterIds.size : 0;
    const visible = this.getFilteredChapters ? this.getFilteredChapters() : [];
    const allSelected = visible.length > 0 && visible.every(c => this.selectedChapterIds.has(c.id));

    if (count > 0) {
      bar.style.display = 'flex';
      if (countEl) countEl.textContent = `${count} Selected`;
      if (selectAllBtn) selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';

      let hasRead = false;
      let hasUnread = false;
      let hasBookmarked = false;
      let hasUnbookmarked = false;

      for (const chId of this.selectedChapterIds) {
        const ch = (this.chapters || []).find(c => c.id === chId);
        const isRead = !!(this.progressMap[chId]?.is_read ?? ch?.is_read);
        const isBm = !!(this.progressMap[chId]?.is_bookmarked ?? ch?.is_bookmarked);

        if (isRead) hasRead = true;
        else hasUnread = true;

        if (isBm) hasBookmarked = true;
        else hasUnbookmarked = true;
      }

      // If all selected chapters are read: show only "Mark Unread"
      // If all selected chapters are unread: show only "Mark Read"
      // If some are read and some are unread: show both
      if (btnMarkRead) {
        btnMarkRead.style.display = hasUnread ? 'inline-flex' : 'none';
      }
      if (btnMarkUnread) {
        btnMarkUnread.style.display = hasRead ? 'inline-flex' : 'none';
      }

      if (btnBookmark) {
        const textSpan = btnBookmark.querySelector('#bulk-bookmark-text') || btnBookmark;
        if (hasBookmarked && !hasUnbookmarked) {
          textSpan.textContent = 'Remove Bookmark';
          btnBookmark.setAttribute('data-action', 'unbookmark');
        } else {
          textSpan.textContent = 'Bookmark';
          btnBookmark.setAttribute('data-action', 'bookmark');
        }
      }

      if (btnDelete) {
        const hasDownloaded = (this.chapters || []).some(c => this.selectedChapterIds.has(c.id) && this.isChapterDownloaded(c));
        btnDelete.style.display = hasDownloaded ? 'inline-flex' : 'none';
      }
    } else {
      bar.style.display = 'none';
      if (selectAllBtn) selectAllBtn.textContent = 'Select All';
    }
    this.updateFloatingButtonsVisibility();
  },

  handleChapterSelect(index, isShift, explicitChecked = null) {
    const wrap = document.getElementById('chapter-list-wrap');
    if (!wrap) return;
    const allCheckboxes = Array.from(wrap.querySelectorAll('.chapter-checkbox'));
    const targetCb = allCheckboxes[index];
    if (!targetCb) return;

    const targetId = targetCb.getAttribute('data-ch-id');
    const currentlyChecked = this.selectedChapterIds.has(targetId);
    const newChecked = explicitChecked !== null ? explicitChecked : !currentlyChecked;

    if (isShift && this.lastClickedChapterIndex !== -1 && this.lastClickedChapterIndex !== index) {
      const start = Math.min(this.lastClickedChapterIndex, index);
      const end = Math.max(this.lastClickedChapterIndex, index);

      for (let i = start; i <= end; i++) {
        const cb = allCheckboxes[i];
        if (!cb) continue;
        const id = cb.getAttribute('data-ch-id');
        if (newChecked) {
          this.selectedChapterIds.add(id);
        } else {
          this.selectedChapterIds.delete(id);
        }
        cb.checked = newChecked;
        const row = cb.closest('.chapter-item');
        if (row) row.classList.toggle('selected', newChecked);
      }
    } else {
      if (newChecked) {
        this.selectedChapterIds.add(targetId);
      } else {
        this.selectedChapterIds.delete(targetId);
      }
      targetCb.checked = newChecked;
      const row = targetCb.closest('.chapter-item');
      if (row) row.classList.toggle('selected', newChecked);
    }

    this.lastClickedChapterIndex = index;
    this.updateBulkToolbar();
  },

  renderDownloadIndicator(chId, isDownloaded, isLocal) {
    if (isDownloaded || isLocal) {
      return `
        <span class="chapter-downloaded-indicator" data-ch-id="${chId}" title="${isLocal ? 'Local Manga (CBZ)' : 'Downloaded (Click to delete)'}" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(34, 197, 94, 0.12); color: var(--accent-green); cursor: ${isLocal ? 'default' : 'pointer'};">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: var(--accent-green); stroke-width: 2.2;" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 11 14 17 8"></polyline>
          </svg>
        </span>
      `;
    }

    const task = this.downloadTasksMap[chId];
    if (task) {
      if (task.status === 'downloading') {
        const pct = Math.max(0, Math.min(100, Math.round(task.progress || 0)));
        const circumference = 69.115;
        const offset = (circumference * (1 - pct / 100)).toFixed(2);
        const pagesInfo = task.total_pages ? `${task.downloaded_pages || 0}/${task.total_pages} pages` : `${pct}%`;
        return `
          <div class="chapter-circular-progress" title="Downloading: ${pct}% (${pagesInfo})" style="position: relative; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: default;">
            <svg viewBox="0 0 32 32" style="width: 32px; height: 32px; transform: rotate(-90deg);">
              <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.6"></circle>
              <circle class="circular-progress-bar" cx="16" cy="16" r="11" fill="none" stroke="var(--accent-primary)" stroke-width="2.6" stroke-linecap="round"
                stroke-dasharray="69.115"
                stroke-dashoffset="${offset}"
                style="transition: stroke-dashoffset 0.25s ease;"></circle>
            </svg>
            <span class="circular-progress-text">${pct}%</span>
          </div>
        `;
      } else if (task.status === 'pending') {
        return `
          <div class="chapter-circular-progress queued" data-ch-id="${chId}" title="Queued (Click to download first)" style="position: relative; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg viewBox="0 0 32 32" style="width: 32px; height: 32px; animation: spin 1.2s linear infinite;">
              <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.6"></circle>
              <circle cx="16" cy="16" r="11" fill="none" stroke="var(--accent-primary)" stroke-width="2.6" stroke-linecap="round"
                stroke-dasharray="69.115"
                stroke-dashoffset="48"></circle>
            </svg>
            <span style="position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); opacity: 0.85;"></span>
          </div>
        `;
      }
    }

    if (this.pendingDownloadIds.has(chId)) {
      return `
        <div class="chapter-circular-progress queued" data-ch-id="${chId}" title="Queued (Click to download first)" style="position: relative; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
          <svg viewBox="0 0 32 32" style="width: 32px; height: 32px; animation: spin 1.2s linear infinite;">
            <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.6"></circle>
            <circle cx="16" cy="16" r="11" fill="none" stroke="var(--accent-primary)" stroke-width="2.6" stroke-linecap="round"
              stroke-dasharray="69.115"
              stroke-dashoffset="48"></circle>
          </svg>
          <span style="position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); opacity: 0.85;"></span>
        </div>
      `;
    }

    return `
      <button class="btn btn-secondary btn-icon-only btn-download-chapter" data-ch-id="${chId}" title="Download Chapter">
        <svg viewBox="0 0 24 24" class="nav-icon" style="width: 16px; height: 16px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
    `;
  },

  startDownloadPolling() {
    this.stopDownloadPolling();
    this.pollDownloadStatus();
    this.downloadPollTimer = setInterval(() => {
      this.pollDownloadStatus();
    }, 1200);
  },

  stopDownloadPolling() {
    if (this.downloadPollTimer) {
      clearInterval(this.downloadPollTimer);
      this.downloadPollTimer = null;
    }
  },

  async pollDownloadStatus() {
    if (!this.manga || !this.manga.id) return;
    try {
      const res = await API.getMangaDownloadStatus(this.manga.id);
      if (!res) return;

      const completedIds = res.completed || [];
      const completedNums = res.completed_numbers || [];
      const activeMap = res.active || {};

      let hasActive = Object.keys(activeMap).length > 0;

      if (Array.isArray(completedNums)) {
        this.downloadedChapterNumbers = new Set(completedNums);
      }
      if (Array.isArray(completedIds)) {
        this.downloadedChapterIds = new Set(completedIds);
      }

      // Update completed IDs
      completedIds.forEach(id => {
        this.pendingDownloadIds.delete(id);
        delete this.downloadTasksMap[id];
        this.updateChapterDownloadUI(id, true);
      });

      // Also mark chapters matching completed_numbers ONLY if they don't have multiple scans and local
      if (this.chapters && Array.isArray(this.chapters)) {
        this.chapters.forEach(ch => {
          if (this.hasDuplicateScans(ch)) return;
          const chNum = this.extractChapterNumber(ch);
          if (this.manga?.source === 'local' && chNum > 0 && this.downloadedChapterNumbers.has(chNum)) {
            this.downloadedChapterIds.add(ch.id);
            this.pendingDownloadIds.delete(ch.id);
            delete this.downloadTasksMap[ch.id];
            this.updateChapterDownloadUI(ch.id, true);
          }
        });
      }

      // Update active downloads
      for (const [chId, info] of Object.entries(activeMap)) {
        this.downloadTasksMap[chId] = info;
        this.pendingDownloadIds.delete(chId);
        this.updateChapterDownloadUI(chId, false, info);
      }

      // Check for removed tasks
      for (const chId of Object.keys(this.downloadTasksMap)) {
        if (!activeMap[chId] && !completedIds.includes(chId)) {
          delete this.downloadTasksMap[chId];
          this.updateChapterDownloadUI(chId, false, null);
        }
      }

      if (!hasActive && this.pendingDownloadIds.size === 0) {
        this.stopDownloadPolling();
      }
    } catch (e) {
      // Ignore polling failure
    }
  },

  updateChapterDownloadUI(chId, isCompleted, activeInfo = null) {
    const wrap = document.getElementById('chapter-list-wrap');
    if (!wrap) return;
    const container = wrap.querySelector(`.chapter-dl-action-container[data-ch-id="${chId}"]`);
    if (!container) return;

    if (isCompleted) {
      container.innerHTML = `
        <span class="chapter-downloaded-indicator" data-ch-id="${chId}" title="Downloaded (Click to delete)" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(34, 197, 94, 0.12); color: var(--accent-green); cursor: pointer;">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: var(--accent-green); stroke-width: 2.2;" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 11 14 17 8"></polyline>
          </svg>
        </span>
      `;
      return;
    }

    if (activeInfo) {
      if (activeInfo.status === 'downloading') {
        const pct = Math.max(0, Math.min(100, Math.round(activeInfo.progress || 0)));
        const circumference = 69.115;
        const offset = (circumference * (1 - pct / 100)).toFixed(2);
        const pagesInfo = activeInfo.total_pages ? `${activeInfo.downloaded_pages || 0}/${activeInfo.total_pages} pages` : `${pct}%`;

        const bar = container.querySelector('.circular-progress-bar');
        const txt = container.querySelector('.circular-progress-text');
        if (bar && txt) {
          bar.setAttribute('stroke-dashoffset', offset);
          txt.textContent = `${pct}%`;
          container.querySelector('.chapter-circular-progress')?.setAttribute('title', `Downloading: ${pct}% (${pagesInfo})`);
        } else {
          container.innerHTML = `
            <div class="chapter-circular-progress" title="Downloading: ${pct}% (${pagesInfo})" style="position: relative; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: default;">
              <svg viewBox="0 0 32 32" style="width: 32px; height: 32px; transform: rotate(-90deg);">
                <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.6"></circle>
                <circle class="circular-progress-bar" cx="16" cy="16" r="11" fill="none" stroke="var(--accent-primary)" stroke-width="2.6" stroke-linecap="round"
                  stroke-dasharray="69.115"
                  stroke-dashoffset="${offset}"
                  style="transition: stroke-dashoffset 0.25s ease;"></circle>
              </svg>
              <span class="circular-progress-text">${pct}%</span>
            </div>
          `;
        }
        return;
      } else if (activeInfo.status === 'pending') {
        container.innerHTML = `
          <div class="chapter-circular-progress queued" data-ch-id="${chId}" title="Queued (Click to download first)" style="position: relative; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg viewBox="0 0 32 32" style="width: 32px; height: 32px; animation: spin 1.2s linear infinite;">
              <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2.6"></circle>
              <circle cx="16" cy="16" r="11" fill="none" stroke="var(--accent-primary)" stroke-width="2.6" stroke-linecap="round"
                stroke-dasharray="69.115"
                stroke-dashoffset="48"></circle>
            </svg>
            <span style="position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); opacity: 0.85;"></span>
          </div>
        `;
        return;
      }
    }

    // Default: Download button
    container.innerHTML = `
      <button class="btn btn-secondary btn-icon-only btn-download-chapter" data-ch-id="${chId}" title="Download Chapter">
        <svg viewBox="0 0 24 24" class="nav-icon" style="width: 16px; height: 16px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
    `;
  },

  cleanChapterTitle(title) {
    if (!title) return '';
    let clean = title;
    const dateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b|\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|(?:\b|\d)(?:hours?|days?|months?|years?|mins?|minutes?|weeks?|secs?|seconds?)\s+ago\b|(?:\b|\d)(?:last\s+(?:week|month|year|day)|yesterday|just\s+now)\b/i;
    clean = clean.replace(dateRegex, '').trim();
    clean = clean.replace(/[\s\-\–\—\:]+$/, '').trim();
    return clean || title;
  },

  extractChapterNumber(ch) {
    if (typeof ch.chapter_number === 'number' && !isNaN(ch.chapter_number) && ch.chapter_number > 0) {
      return ch.chapter_number;
    }
    const raw = `${ch.title || ''} ${ch.id || ''}`;
    const match = raw.match(/(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)/i) || raw.match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? parseFloat(match[1]) : 0;
  },

  calculateEffectiveChapterCount(chapters) {
    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) return 0;

    // Group chapters by scanlator (case-insensitive)
    const scanGroups = {};
    let hasScanlator = false;
    chapters.forEach(c => {
      const scan = (c.scanlator || '').trim().toLowerCase();
      if (scan) {
        hasScanlator = true;
        if (!scanGroups[scan]) scanGroups[scan] = [];
        scanGroups[scan].push(c);
      }
    });

    // If multiple scanlators exist (e.g. official and unofficial releases),
    // count only the scanlator with the most chapters, never combine them!
    if (hasScanlator && Object.keys(scanGroups).length > 1) {
      let maxCount = 0;
      for (const k in scanGroups) {
        if (scanGroups[k].length > maxCount) {
          maxCount = scanGroups[k].length;
        }
      }
      return maxCount;
    }

    // Deduplicate by chapter numbers for untagged duplicate releases (supports decimal chapters like 1.2, 5.1)
    const seenNumbers = new Set();
    let parsedCount = 0;
    chapters.forEach(c => {
      const num = this.extractChapterNumber(c);
      if (num != null && !isNaN(num) && num > 0) {
        seenNumbers.add(num);
        parsedCount++;
      }
    });

    if (seenNumbers.size > 0 && seenNumbers.size < chapters.length && parsedCount > chapters.length * 0.5) {
      return seenNumbers.size;
    }

    return chapters.length;
  },

  getDisplayChapterCount() {
    return this.calculateEffectiveChapterCount(this.chapters);
  },

  computeChapterDuplicates() {
    this.chapterNumberCounts = {};
    this.chapterTitleCounts = {};
    (this.chapters || []).forEach(c => {
      const num = this.extractChapterNumber(c);
      if (num > 0) {
        this.chapterNumberCounts[num] = (this.chapterNumberCounts[num] || 0) + 1;
      }
      const t = (c.title || '').trim().toLowerCase();
      if (t) {
        this.chapterTitleCounts[t] = (this.chapterTitleCounts[t] || 0) + 1;
      }
    });
  },

  hasDuplicateScans(ch) {
    if (!ch) return false;
    if (ch.scanlator && String(ch.scanlator).trim()) {
      return true;
    }
    const num = this.extractChapterNumber(ch);
    if (num > 0 && this.chapterNumberCounts && (this.chapterNumberCounts[num] || 0) > 1) {
      return true;
    }
    const t = (ch.title || '').trim().toLowerCase();
    if (t && this.chapterTitleCounts && (this.chapterTitleCounts[t] || 0) > 1) {
      return true;
    }
    return false;
  },

  isChapterDownloaded(ch) {
    if (!ch) return false;
    if (this.manga?.source === 'local') return true;
    if (this.downloadedChapterIds && this.downloadedChapterIds.has(ch.id)) return true;

    // NEVER fallback to chapter number if multiple scans share this number or title!
    if (this.hasDuplicateScans(ch)) {
      return false;
    }

    const chNum = this.extractChapterNumber(ch);
    if (chNum > 0 && this.downloadedChapterNumbers && this.downloadedChapterNumbers.has(chNum)) {
      return true;
    }
    return false;
  },

  formatChapterDate(ch) {
    if (ch.release_date) {
      const s = String(ch.release_date).trim();
      if (s.includes('ago') || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        return s;
      }
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return s;
    }
    const rawDate = ch.date_upload || ch.publish_at;
    if (rawDate) {
      if (typeof rawDate === 'number' || (!isNaN(Number(rawDate)) && !isNaN(parseFloat(rawDate)))) {
        const ts = Number(rawDate);
        const d = new Date(ts < 10000000000 ? ts * 1000 : ts);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return String(rawDate).split('T')[0];
    }
    return '';
  },

  // Mihon 3-tab Modal: Filter, Sort, Display (Instant tab switching with zero animation)
  openChapterOptionsModal() {
    const modalContainer = document.getElementById('chapter-options-modal-container');
    if (!modalContainer) return;

    const sortOptions = [
      { key: 'source', label: 'By source' },
      { key: 'chapter_number', label: 'By chapter number' },
      { key: 'upload_date', label: 'By upload date' },
      { key: 'alphabetical', label: 'Alphabetically' }
    ];

    const displayOptions = [
      { key: 'source_title', label: 'Source title' },
      { key: 'chapter_number', label: 'Chapter number' }
    ];

    const excludedCount = (this.excludedScanlators || []).length;
    const scanlatorSummary = excludedCount > 0 ? `${excludedCount} excluded` : 'All included';

    modalContainer.innerHTML = `
      <div class="mihon-modal-backdrop" id="chapter-options-backdrop">
        <div class="mihon-bottom-sheet" style="max-width: 440px; margin: auto; background: var(--bg-surface); border-radius: 16px 16px 0 0; border: 1px solid var(--border-subtle); box-shadow: 0 -8px 32px rgba(0,0,0,0.5); overflow: hidden;">
          
          <!-- Instant 3-tab Header (no transition animations) -->
          <div class="mihon-sheet-tabs" style="display: flex; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-elevated); transition: none !important;">
            <button class="mihon-sheet-tab ${this.activeOptionsTab === 'filter' ? 'active' : ''}" data-tab="filter" style="flex: 1; padding: 14px 10px; background: none; border: none; font-size: 0.92rem; font-weight: 600; color: ${this.activeOptionsTab === 'filter' ? 'var(--accent-primary)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeOptionsTab === 'filter' ? 'var(--accent-primary)' : 'transparent'}; cursor: pointer; transition: none !important;">
              Filter
            </button>
            <button class="mihon-sheet-tab ${this.activeOptionsTab === 'sort' ? 'active' : ''}" data-tab="sort" style="flex: 1; padding: 14px 10px; background: none; border: none; font-size: 0.92rem; font-weight: 600; color: ${this.activeOptionsTab === 'sort' ? 'var(--accent-primary)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeOptionsTab === 'sort' ? 'var(--accent-primary)' : 'transparent'}; cursor: pointer; transition: none !important;">
              Sort
            </button>
            <button class="mihon-sheet-tab ${this.activeOptionsTab === 'display' ? 'active' : ''}" data-tab="display" style="flex: 1; padding: 14px 10px; background: none; border: none; font-size: 0.92rem; font-weight: 600; color: ${this.activeOptionsTab === 'display' ? 'var(--accent-primary)' : 'var(--text-muted)'}; border-bottom: 2px solid ${this.activeOptionsTab === 'display' ? 'var(--accent-primary)' : 'transparent'}; cursor: pointer; transition: none !important;">
              Display
            </button>
          </div>

          <!-- Content Body (3 persistent panes with instant visibility toggle) -->
          <div class="mihon-sheet-body" style="padding: 16px 20px; max-height: 380px; overflow-y: auto; transition: none !important;">
            
            <!-- Pane 1: Filter -->
            <div class="mihon-sheet-pane" id="pane-options-filter" style="display: ${this.activeOptionsTab === 'filter' ? 'block' : 'none'}; transition: none !important;">
              <div class="mihon-options-list">
                <label class="mihon-option-row">
                  <input type="checkbox" id="opt-filter-downloaded" ${this.filterDownloaded ? 'checked' : ''} />
                  <span class="mihon-option-text">Downloaded</span>
                </label>
                <label class="mihon-option-row">
                  <input type="checkbox" id="opt-filter-unread" ${this.filterUnread ? 'checked' : ''} />
                  <span class="mihon-option-text">Unread</span>
                </label>
                <label class="mihon-option-row">
                  <input type="checkbox" id="opt-filter-bookmarked" ${this.filterBookmarked ? 'checked' : ''} />
                  <span class="mihon-option-text">Bookmarked</span>
                </label>

                <!-- Scanlator Option Row below Bookmarked -->
                <div class="mihon-option-row" id="row-filter-scanlator" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2;">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span class="mihon-option-text">Scanlator</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 0.82rem;">
                    <span id="scanlator-status-text">${scanlatorSummary}</span>
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- Pane 2: Sort -->
            <div class="mihon-sheet-pane" id="pane-options-sort" style="display: ${this.activeOptionsTab === 'sort' ? 'block' : 'none'}; transition: none !important;">
              <div class="mihon-options-list">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
                  <button id="btn-toggle-sort-direction" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem; display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                      ${this.sortAsc ? '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>' : '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>'}
                    </svg>
                    <span id="sort-direction-label">${this.sortAsc ? 'Ascending' : 'Descending'}</span>
                  </button>
                </div>
                ${sortOptions.map(opt => {
                  const isSelected = this.sortMode === opt.key;
                  return `
                    <div class="mihon-option-row sort-option-item ${isSelected ? 'selected' : ''}" data-sort-key="${opt.key}" style="cursor: pointer;">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="sort-indicator" style="display: inline-block; width: 16px;">
                          ${isSelected ? `
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: var(--accent-primary); stroke-width: 2.5;">
                              ${this.sortAsc ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
                            </svg>
                          ` : ''}
                        </span>
                        <span class="mihon-option-text" style="color: ${isSelected ? 'var(--accent-primary)' : 'inherit'}; font-weight: ${isSelected ? '600' : '400'};">${opt.label}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Pane 3: Display -->
            <div class="mihon-sheet-pane" id="pane-options-display" style="display: ${this.activeOptionsTab === 'display' ? 'block' : 'none'}; transition: none !important;">
              <div class="mihon-options-list">
                ${displayOptions.map(opt => {
                  const isSelected = this.displayMode === opt.key;
                  return `
                    <label class="mihon-option-row" style="cursor: pointer;">
                      <input type="radio" name="opt-display-mode" value="${opt.key}" ${isSelected ? 'checked' : ''} style="accent-color: var(--accent-primary);" />
                      <span class="mihon-option-text" style="color: ${isSelected ? 'var(--accent-primary)' : 'inherit'}; font-weight: ${isSelected ? '600' : '400'};">${opt.label}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

          </div>

          <!-- Footer with Done button -->
          <div class="mihon-sheet-footer" style="padding: 10px 20px 16px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--border-subtle);">
            <button class="btn btn-secondary" id="btn-close-options-sheet" style="padding: 6px 18px;">Done</button>
          </div>
        </div>
      </div>
    `;

    // Instant Tab Switching without re-rendering or animations
    modalContainer.querySelectorAll('.mihon-sheet-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.activeOptionsTab = targetTab;

        // Instant tab header styling
        modalContainer.querySelectorAll('.mihon-sheet-tab').forEach(b => {
          const isActive = b.getAttribute('data-tab') === targetTab;
          b.classList.toggle('active', isActive);
          b.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-muted)';
          b.style.borderBottom = isActive ? '2px solid var(--accent-primary)' : '2px solid transparent';
        });

        // Instant pane visibility toggle
        const pFilter = modalContainer.querySelector('#pane-options-filter');
        const pSort = modalContainer.querySelector('#pane-options-sort');
        const pDisplay = modalContainer.querySelector('#pane-options-display');
        if (pFilter) pFilter.style.display = targetTab === 'filter' ? 'block' : 'none';
        if (pSort) pSort.style.display = targetTab === 'sort' ? 'block' : 'none';
        if (pDisplay) pDisplay.style.display = targetTab === 'display' ? 'block' : 'none';
      });
    });

    // Filter events
    const cbDl = modalContainer.querySelector('#opt-filter-downloaded');
    if (cbDl) {
      cbDl.addEventListener('change', (e) => {
        this.filterDownloaded = e.target.checked;
        this.saveSettings(this.manga.id);
        this.renderChapterRows();
      });
    }
    const cbUnread = modalContainer.querySelector('#opt-filter-unread');
    if (cbUnread) {
      cbUnread.addEventListener('change', (e) => {
        this.filterUnread = e.target.checked;
        this.saveSettings(this.manga.id);
        this.renderChapterRows();
      });
    }
    const cbBm = modalContainer.querySelector('#opt-filter-bookmarked');
    if (cbBm) {
      cbBm.addEventListener('change', (e) => {
        this.filterBookmarked = e.target.checked;
        this.saveSettings(this.manga.id);
        this.renderChapterRows();
      });
    }

    // Open Exclude Scanlators popup when clicking Scanlator row
    const scanRow = modalContainer.querySelector('#row-filter-scanlator');
    if (scanRow) {
      scanRow.addEventListener('click', () => {
        this.openExcludeScanlatorsModal();
      });
    }

    // Sort events
    const updateSortUI = () => {
      const lbl = modalContainer.querySelector('#sort-direction-label');
      if (lbl) lbl.textContent = this.sortAsc ? 'Ascending' : 'Descending';

      modalContainer.querySelectorAll('.sort-option-item').forEach(el => {
        const key = el.getAttribute('data-sort-key');
        const isSelected = this.sortMode === key;
        el.classList.toggle('selected', isSelected);
        const txt = el.querySelector('.mihon-option-text');
        if (txt) {
          txt.style.color = isSelected ? 'var(--accent-primary)' : 'inherit';
          txt.style.fontWeight = isSelected ? '600' : '400';
        }
        const ind = el.querySelector('.sort-indicator');
        if (ind) {
          ind.innerHTML = isSelected ? `
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: var(--accent-primary); stroke-width: 2.5;">
              ${this.sortAsc ? '<polyline points="18 15 12 9 6 15"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
            </svg>
          ` : '';
        }
      });
    };

    const btnToggleDir = modalContainer.querySelector('#btn-toggle-sort-direction');
    if (btnToggleDir) {
      btnToggleDir.addEventListener('click', () => {
        this.sortAsc = !this.sortAsc;
        this.saveSettings(this.manga.id);
        updateSortUI();
        this.renderChapterRows();
      });
    }

    modalContainer.querySelectorAll('.sort-option-item').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.getAttribute('data-sort-key');
        if (this.sortMode === key) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortMode = key;
        }
        this.saveSettings(this.manga.id);
        updateSortUI();
        this.renderChapterRows();
      });
    });

    // Display events
    modalContainer.querySelectorAll('input[name="opt-display-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.displayMode = e.target.value;
        this.saveSettings(this.manga.id);
        this.renderChapterRows();
      });
    });

    // Close events
    const closeBtn = modalContainer.querySelector('#btn-close-options-sheet');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modalContainer.innerHTML = '';
      });
    }
    const backdrop = modalContainer.querySelector('#chapter-options-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          modalContainer.innerHTML = '';
        }
      });
    }
  },

  // Mihon Downloaded Chapter Dropdown Menu (Delete Download)
  openDownloadedChapterMenu(chId, anchorEl = null) {
    const ch = (this.chapters || []).find(c => c.id === chId);
    if (!ch) return;

    let popupContainer = document.getElementById('chapter-dl-modal-container');
    if (!popupContainer) {
      popupContainer = document.createElement('div');
      popupContainer.id = 'chapter-dl-modal-container';
      document.body.appendChild(popupContainer);
    }

    let top = 120;
    let right = 24;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const menuHeight = 56;
      if (rect.bottom + menuHeight > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuHeight);
      } else {
        top = rect.bottom + 4;
      }
      right = Math.max(16, window.innerWidth - rect.right);
    }

    popupContainer.innerHTML = `
      <div id="chapter-dl-backdrop" style="position: fixed; inset: 0; z-index: 1040; background: transparent;"></div>
      <div class="mihon-anchor-menu" style="position: fixed; top: ${top}px; right: ${right}px; z-index: 1050; min-width: 140px;">
        <div class="mihon-anchor-item danger" id="btn-dl-menu-delete" style="color: var(--accent-red, #ef4444); display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>Delete</span>
        </div>
      </div>
    `;

    const closeModal = () => { popupContainer.innerHTML = ''; };
    popupContainer.querySelector('#chapter-dl-backdrop')?.addEventListener('click', closeModal);

    const btnDelete = popupContainer.querySelector('#btn-dl-menu-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        closeModal();
        const chNum = this.extractChapterNumber(ch);
        try {
          await API.deleteChapterDownload(this.manga.id, ch.id, chNum, ch.scanlator || '');
          this.downloadedChapterIds.delete(ch.id);

          const hasOtherDownloaded = (this.chapters || []).some(other => 
            other.id !== ch.id && 
            this.downloadedChapterIds.has(other.id) && 
            this.extractChapterNumber(other) === chNum
          );
          if (!hasOtherDownloaded && chNum > 0 && this.downloadedChapterNumbers) {
            this.downloadedChapterNumbers.delete(chNum);
          }

          ch.is_downloaded = false;
          if (Array.isArray(this.chapters)) {
            const found = this.chapters.find(c => c.id === ch.id);
            if (found) found.is_downloaded = false;
          }

          try {
            localStorage.setItem(`manga_downloads_${this.manga.id}`, JSON.stringify({
              completed: Array.from(this.downloadedChapterIds),
              completed_numbers: Array.from(this.downloadedChapterNumbers)
            }));
            if (this.chapters && this.chapters.length > 0) {
              localStorage.setItem(`manga_chapters_${this.manga.id}`, JSON.stringify(this.chapters));
            }
          } catch (e) {}

          this.updateChapterDownloadUI(ch.id, false, null);
          this.renderChapterRows();
          Toast.show('Deleted download', 'info');
          if (typeof LibraryView !== 'undefined' && LibraryView.loadData) {
            LibraryView.loadData();
          }
        } catch (err) {
          console.error('Failed to delete chapter download:', err);
          Toast.show('Failed to delete download: ' + err.message, 'error');
        }
      });
    }
  },

  isMangaInLibrary(mangaId) {
    const targetId = mangaId || this.manga?.id;
    if (!targetId) return false;
    return (State.library || []).some(item => item.id === targetId);
  },

  getLibraryItem(mangaId) {
    const targetId = mangaId || this.manga?.id;
    if (!targetId) return null;
    return (State.library || []).find(item => item.id === targetId) || null;
  },

  updateLibraryButtonState() {
    const libBtn = document.getElementById('btn-toggle-library');
    const catBtn = document.getElementById('btn-manga-category');
    const catLabel = document.getElementById('manga-category-label');
    const migrateBtn = document.getElementById('btn-manga-migrate');
    const m = this.manga;
    if (!m) return;

    const libItem = this.getLibraryItem(m.id);
    const inLib = !!libItem;

    if (libBtn) {
      libBtn.innerHTML = this.getLibraryHeartIconSvg(inLib);
      if (inLib) {
        libBtn.classList.add('in-library');
        libBtn.title = 'In Library - Click to remove';
      } else {
        libBtn.classList.remove('in-library');
        libBtn.title = 'Add to Library';
      }
    }

    this.updateSmartUpdateButtonState();
    this.updateTrackingButtonState();

    const categoryName = libItem ? (libItem.category_name || 'Default') : 'Default';
    if (catBtn) {
      catBtn.style.display = inLib ? 'inline-flex' : 'none';
    }
    if (catLabel) {
      catLabel.textContent = `Category: ${categoryName}`;
    }
    if (migrateBtn) {
      migrateBtn.style.display = 'inline-flex';
    }
  },

  getMihonSmartUpdateInfo(m, chapters) {
    if (!m) return { nextUpdateDays: null, interval: 7, buttonText: 'Soon', isCustom: false, isCompleted: false };

    let savedConfig = { strategy: 'smart', fetch_interval: 0 };
    try {
      const raw = localStorage.getItem(`manga_smart_update_${m.id}`);
      if (raw) savedConfig = { ...savedConfig, ...JSON.parse(raw) };
    } catch (e) {}

    // Check if manga is completed or cancelled
    const status = (m.status || '').toLowerCase();
    const isCompleted = status.includes('complete') || status.includes('finish') || status.includes('cancel');
    if (isCompleted) {
      return {
        nextUpdateDays: null,
        interval: null,
        buttonText: 'N/A',
        isCustom: false,
        isCompleted: true
      };
    }

    // Determine interval (Mihon: FetchInterval.MAX_INTERVAL = 28)
    let interval = 7;
    let isCustom = false;
    const customVal = parseInt(savedConfig.fetch_interval || savedConfig.interval_days, 10);
    if (!isNaN(customVal) && customVal !== 0) {
      interval = Math.min(28, Math.max(1, Math.abs(customVal)));
      isCustom = true;
    } else if (chapters && chapters.length >= 2) {
      // Estimate interval from recent chapter release dates
      const timestamps = [];
      for (let i = 0; i < Math.min(chapters.length, 25); i++) {
        const ch = chapters[i];
        let ts = ch.date_upload || ch.date || ch.uploaded_at;
        if (ts) {
          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            if (!isNaN(parsed)) ts = parsed;
          }
          if (typeof ts === 'number' && ts > 0) {
            if (ts < 2000000000) ts *= 1000;
            timestamps.push(ts);
          }
        }
      }
      timestamps.sort((a, b) => b - a);
      if (timestamps.length >= 2) {
        const gaps = [];
        for (let i = 0; i < timestamps.length - 1; i++) {
          const diffDays = Math.round((timestamps[i] - timestamps[i + 1]) / 86400000);
          if (diffDays > 0 && diffDays <= 60) {
            gaps.push(diffDays);
          }
        }
        if (gaps.length > 0) {
          gaps.sort((a, b) => a - b);
          const medianGap = gaps[Math.floor((gaps.length - 1) / 2)];
          interval = Math.min(28, Math.max(1, medianGap));
        }
      }
    }

    // Determine latest release date (newest chapter date)
    let latestTs = 0;
    if (chapters && chapters.length > 0) {
      for (const ch of chapters) {
        let ts = ch.date_upload || ch.date || ch.uploaded_at;
        if (ts) {
          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            if (!isNaN(parsed)) ts = parsed;
          }
          if (typeof ts === 'number' && ts > 0) {
            if (ts < 2000000000) ts *= 1000;
            if (ts > latestTs) latestTs = ts;
          }
        }
      }
    }
    if (!latestTs) {
      latestTs = Date.now() - 7 * 86400000;
    }

    // Calculate next expected update
    const expectedNextTs = latestTs + interval * 86400000;
    const diffDays = Math.round((expectedNextTs - Date.now()) / 86400000);
    const nextUpdateDays = Math.max(0, diffDays);

    let buttonText = 'Soon';
    if (nextUpdateDays === 0) {
      buttonText = 'Soon';
    } else if (nextUpdateDays === 1) {
      buttonText = '1 day';
    } else {
      buttonText = `${nextUpdateDays} days`;
    }

    return {
      nextUpdateDays,
      interval,
      buttonText,
      isCustom,
      isCompleted: false
    };
  },

  calculateExpectedInterval(m, chapters) {
    return this.getMihonSmartUpdateInfo(m, chapters).buttonText;
  },

  updateSmartUpdateButtonState() {
    const btn = document.getElementById('btn-manga-smart-update');
    const textEl = document.getElementById('btn-smart-update-text');
    if (!btn || !this.manga) return;

    const info = this.getMihonSmartUpdateInfo(this.manga, this.chapters);

    if (info.isCustom) {
      btn.classList.add('customized-strategy');
    } else {
      btn.classList.remove('customized-strategy');
    }

    if (textEl) {
      textEl.textContent = info.buttonText;
    }

    btn.title = info.isCompleted
      ? 'This manga is completed'
      : (info.nextUpdateDays === 0
          ? `Expected update: Soon (checking around every ${info.interval} days)`
          : `Expected update in around ${info.buttonText} (checking around every ${info.interval} days)`);
  },

  updateTrackingButtonState() {
    const btn = document.getElementById('btn-manga-tracking');
    const textEl = document.getElementById('btn-tracking-text');
    if (!btn || !this.manga) return;

    let trackingData = {};
    try {
      const raw = localStorage.getItem(`manga_tracking_${this.manga.id}`);
      if (raw) trackingData = JSON.parse(raw);
    } catch (e) {}

    const trackedServices = Object.keys(trackingData).filter(k => trackingData[k] && trackingData[k].linked);
    const count = trackedServices.length;

    const existingLogo = btn.querySelector('.btn-tracker-logo-badge');
    if (existingLogo) existingLogo.remove();
    const svgIcon = btn.querySelector('svg');

    if (count > 0) {
      btn.classList.add('tracked');
      if (textEl) {
        textEl.textContent = count === 1 ? '1 tracker' : `${count} trackers`;
      }
      if (svgIcon) {
        svgIcon.style.display = 'block';
        svgIcon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
      }
      btn.title = `Tracked on ${trackedServices.join(', ')} - Click to manage`;
    } else {
      btn.classList.remove('tracked');
      if (textEl) textEl.textContent = 'Tracking';
      if (svgIcon) {
        svgIcon.style.display = 'block';
        svgIcon.innerHTML = `
          <path d="M21.5 2v6h-6"></path>
          <path d="M2.5 22v-6h6"></path>
          <path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
        `;
      }
      btn.title = 'Manage tracking services (AniList, MyAnimeList, etc.)';
    }
  },

  TRACKER_LOGOS: {
    AniList: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#1f2631"/><path d="m63.6,43.6 l-36.8,105h28.6l6.2,-18.2h31.2l6.1,18.1h28.5L90.7,43.6zM68.2,107.1 L77.1,78.1 86.9,107.1z" fill="#fefefe"/><path d="M127,148.5h32.5q6.3,0 6.4,-6.3v-14q-0.1,-6.4 -6.4,-6.5h-37.6V50q-0.1,-6.3 -6.4,-6.4h-14q-6.3,0.1 -6.4,6.4v7.8c-3.2,-9.8 31.8,90.7 32,90.7" fill="#02a9ff"/></svg>`,
    MyAnimeList: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#2f52a2"/><path d="M141.4,61.1h14.8v48.2h20.7l-3.4,13.1h-32.1zM129,60.7h-13c-5.2,0 -23.5,0 -31.6,20.2a59,59 0,0 0,5.6 50.4l12.4,-9s-5,-7 -7,-20.4L114,101.9l0.1,20.4h16.7L130.8,75.8h-16.5v13l-15.7,-0.1s2.6,-15.4 18.4,-15h15.6zM17,122.5L17,61h14.8l13.1,18.8L58.1,61h15v61.5L58,122.5L58,85.3l-13.1,17 -13,-17.1v37.3z" fill="#ffffff"/></svg>`,
    Kitsu: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#312631"/><path d="m113,51.3 l-2.2,0.2 -4.2,0.5 -1.5,0.2a59,59 0,0 0,-11.3 4L92,57v12.5l-0.2,13.7a10,10 0,0 1,-5.4 7.1,6 6,0 0,1 -3.5,0.8L80,91a189,189 0,0 1,-14.5 -5.5l-4.8,-1.9 -5.5,-1.8c-0.2,0 -1,0.8 -1.8,1.5l-2,1.7a199,199 0,0 0,-19 19.5,5 5,0 0,0 -1.5,4.3c0,0.8 1.3,2.5 2.2,2.9 1,0.5 2.4,0.6 3.3,0.3l2.5,-1.5a117,117 0,0 1,21.4 -11.9l2.2,-1 3,-1c2,0 4,1.5 4.4,3.2l0.2,0.8c0.3,0.3 -1.5,4.2 -2.2,4.9 -0.2,0.1 -0.3,0.4 -1.3,2.2l-0.7,1a64,64 0,0 0,-3.7 7.2l-0.8,1.7 -0.4,0.8 -0.9,2a98,98 0,0 0,-3.3 8.3c-1.4,4 -1.4,3.8 -1.4,5.2q0,2 1.6,3.3 0.8,0.8 2.3,0.8c1.9,0 2.8,-0.4 4.1,-2.2l2.6,-3.4a64,64 0,0 1,5.5 -6.6c1.5,-1.9 8.7,-9 10.5,-10.6a109,109 0,0 1,22.5 -16A125,125 0,0 1,138 86.6c3,-0.6 3.6,-0.6 4.6,0.6 0.7,0.7 0.6,2.4 -0.1,3.2a8,8 0,0 1,-3.7 1.5,76 76,0 0,0 -25.1,12 42,42 0,0 0,-6.8 5A66,66 0,0 0,89.5 132a51,51 0,0 0,-2.8 9.9,47 47,0 0,0 2.7,24c0.7,1.8 1.2,2.3 2.4,3 1.9,0.9 4.2,0.1 5.5,-2 3.6,-5.8 7.4,-9 15.5,-13l3,-1.4 0.7,-0.4 0.6,-0.3 1.8,-0.7 2.4,-1c1.4,-0.6 8.6,-4.3 9.7,-5l3.2,-2 3.6,-2.4 2.1,-1.4c2.6,-1.9 8,-7 10,-9.3l1,-1.3a44,44 0,0 0,5.8 -9.2,44 44,0 0,0 4.8,-21c0,-5 0,-5.9 -0.8,-9.5a48,48 0,0 0,-7.8 -18,47 47,0 0,0 -26,-18.1l-1.4,-0.3 -3,-0.7a69,69 0,0 0,-9.5 -0.7m-17.5,83.2a28,28 0,0 0,16.9 11.7l1,0.2 1.1,0.2q1.7,0.2 0.2,0.7a89,89 0,0 0,-13.2 7.3,34 34,0 0,0 -7.2,7.4c-0.7,1 -0.7,0.9 -1.7,-3.2a54,54 0,0 1,-1 -15,42 42,0 0,1 3.1,-10.3z" fill="#f75239"/><path d="M72.3,22.7c-1.5,0.3 -2.4,1.2 -3.9,3.5L66.6,30a30,30 0,0 0,-2.2 14.7c0.1,0.9 0.1,1 -1.1,1.6a50,50 0,0 0,-6.2 4.1l-1.6,1.3q-0.3,0.2 -1.6,-0.5a31,31 0,0 0,-16.7 -2.8c-4,0.6 -4.7,0.9 -5.6,2q-1.1,1.1 -1,2.7c0,1 0.6,2.8 1.2,3.4l1,1.2 0.6,1 1.5,1.7c3.5,4 8.3,8.5 12.5,11.3 4,2.6 5.5,3.3 12,5.8l8.4,3.3 1.7,0.6 3.6,1.4 2,0.8c2,0.9 5.3,2 6.4,2.2q1.3,0.4 2.3,0a4,4 0,0 0,2.7 -3,613 613,0 0,0 -0.4,-34.6 43,43 0,0 0,-1.4 -6.2L83,37c-0.5,-1.3 -4,-8.2 -5.2,-10.4 -1.8,-3.2 -3.3,-4.2 -5.5,-3.9m1,7.2c3,5.8 4.4,8.6 4.8,9.7 0.4,1.3 0.4,1.4 0,1.5h-0.7l-1,0.3 -1.7,0.4 -1.3,0.3 -0.6,0.2q-3,1 -3,0.8a15,15 0,0 1,0 -4.3l0.2,-1.9c0.3,-2.1 2.4,-7.4 3,-7.4zM44,54c2.4,0.3 6.3,1.5 7,2q0,0.4 -1.2,2l-1.6,2 -1.4,2 -1,1.6 -1.1,-1a76,76 0,0 1,-7.6 -8.6h1.3a26,26 0,0 1,5.6 0" fill="#f75239"/></svg>`,
    MangaUpdates: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#92a0ad"/><path d="M44.7,19h102.6A25.6,25.6 0,0 1,173 44.7v102.6a25.6,25.6 0,0 1,-25.7 25.7H44.7A25.6,25.6 0,0 1,19 147.3V44.7A25.6,25.6 0,0 1,44.7 19" fill="#cbd6e8"/><path d="M164.4,143.2q0,3.7 -0.5,7.5a22,22 0,0 1,-2.1 7q-1.5,3 -4.3,5.2a12,12 0,0 1,-7.4 2q-5.5,0 -8.5,-3.4a20,20 0,0 1,-3.8 -8.6,118 118,0 0,1 -2.3,-16.7l-1.6,-33.8a105,105 0,0 0,-2.8 -16.7,567 567,0 0,1 -8.5,26.3l-3.8,9.6a127,127 0,0 0,-5.2 17.8,175 175,0 0,1 -3,12.2q-0.7,2.2 -1.8,4.7 -0.8,2.4 -1.9,4.5a10,10 0,0 1,-2.2 3.1q-2.8,2.6 -6.7,3.3a26,26 0,0 1,-7 1,11 11,0 0,1 -9,-4 27,27 0,0 1,-4.9 -8.8,56 56,0 0,1 -1.9,-7.3l-1.5,-7.5q-2.3,-9.9 -5.4,-19.5 -3,-9.7 -5.6,-19.5 -3.5,7.8 -6.3,15.6a107,107 0,0 0,-4.7 28.6q0,6 -1.6,12.2 -1.2,4.5 -4,7 -2.6,2.6 -7.5,2.6a14,14 0,0 1,-12.2 -6.6q-1.7,-3 -2.4,-6.6 -0.5,-4 -0.5,-7.7 0,-8.2 2,-17.4 2.3,-9.5 5.1,-18.8l6.1,-18.7q3.4,-9.3 5.8,-17.2 2.3,-7.9 3.3,-15.5 1.2,-7.7 3,-15.5A26,26 0,0 1,55 31.4a21,21 0,0 1,5.6 -4q3,-1.5 6.8,-1.6 2.6,0 5.4,0.9a15,15 0,0 1,8.7 5.9q1.5,2.3 1.4,5.4 0,2.3 -0.4,4.5 -0.3,2.1 -0.3,4.4a271,271 0,0 0,10.6 74.9q7.2,-16.4 12,-33.5a1608,1608 0,0 0,12 -44.6q1.3,-5.1 3.7,-10 2.3,-4.5 5.6,-7.4 3.4,-3 8.7,-3a29,29 0,0 1,12.2 2.8q2.5,1.5 4.2,4 1.8,2.6 1.7,6.3 0,2.8 -0.3,5.6l-0.2,5.4a219,219 0,0 0,6.3 52q2.4,10.8 4,21.9 1.7,10.8 1.7,21.9" fill="#ff8c15"/></svg>`,
    Shikimori: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#343434"/><path d="m46,155.8 l-1.2,-0.5 -1,-0.5q0,-0.3 1,-1.3 3,-2.7 4.4,-4.7l1.7,-2.3c3,-3.2 6.8,-9.1 10,-15.2 2.1,-4 2.3,-4.3 2.5,-7.3a88,88 0,0 0,-1 -18.3c0,-0.2 -0.4,0 -3.8,1.4q-3.2,1.5 -3.7,2l-2,1.3c-1.6,0.8 -2,0.9 -4.7,0.3 -2.4,-0.5 -3.5,-1.1 -6,-3.3l-1,-1.1c0,-0.2 -1.1,-1.8 -2.6,-3.8l-0.7,-1 0.2,-1a9,9 0,0 0,0.2 -3.1l0.1,-2.3q0.2,-0.4 0.1,-1.1v-0.8l0.9,-0.4q0.8,-0.5 1.5,-0.4t1,-0.4q1.5,-1.5 2.7,-0.8c0.4,0.2 0.4,0.2 0.4,1.7 -0.1,1.7 0,1.7 1.2,2 1.3,0.2 3,0 7.4,-0.7 4,-0.8 9.6,-1.7 10.2,-1.7q0.4,0 1,-0.8l1.5,-1.5 0.8,-0.7h1.4c2.4,0.2 5.3,0.6 6.2,1 0.9,0.2 1,0.2 2.6,0l3.3,-0.5c4,-0.5 4.6,-0.6 4.8,-0.8q0,-0.1 0.4,0l0.7,-0.1c1.4,-0.8 1.6,-0.9 4,-1 1.2,0 2.6,0 3.3,-0.2 3,-0.6 12,-1.7 16.3,-2l1.6,-0.1 -0.2,-0.5q-0.4,-0.7 0,-0.7h2.3l0.8,-1.1 1,-1.4q0.1,-0.6 1.1,0.5l1.3,1.7 0.4,0.7h2.2l13,-0.3 5.2,0.5c0.8,0 0.8,0 -0.7,-2 -1,-1.3 -2.4,-2.6 -3.4,-3l-1,-0.6a11,11 0,0 0,-2.8 -1.1,14 14,0 0,1 -3.4,-1.6l-1.7,-0.3q-1.5,-0.4 -1.4,-0.6 0,-0.8 4.5,0.8 1.9,0.6 1.8,0.4 0,-0.3 -2.2,-1l-2.2,-1 0.2,-0.1q0.5,0 -0.4,-0.3 -0.5,0 -0.5,-0.4l-0.1,-0.2q-0.2,0 -0.1,-0.3v-0.2q-0.4,0 -1.3,1.6l-0.8,1L122,76.3l-1.4,-0.1q-0.3,0 -0.3,-0.3c0,-0.3 -0.2,-0.3 -2,-0.5L116,75.4q-0.4,0.3 -0.4,0t-0.8,-0.4l-7.1,-0.3q0,0.2 -0.2,0.3 -0.3,0.2 -0.4,-0.3c0,-0.5 0,-0.5 -1.3,-0.5l-1.2,0.1q0,0.2 0.2,0.2l0.8,0.3q0.5,0.4 1.1,0.4h0.7l0.2,0.2q0,0.2 -0.5,0.2h-2.5l0.7,0.1 1,0.6 0.3,0.5 -1,0.1 -1,0.3q-0.3,0.2 -0.1,-0.8v-0.9l-0.5,0.1 -1,0.4q-0.2,0.3 -1.4,0.2h-1l-0.2,-0.5q-0.2,-1.2 -0.8,-0.2 -0.4,0.5 -0.6,0.5t-0.2,0.3v0.3l-11.4,0.3 -1.3,0.2 0.6,0.1 1.2,0.1q1,0.4 -2.2,0.4c-2.6,0 -3,0.1 -2.5,0.5q0.4,0.2 -0.7,0.3l-1.7,0.1q-0.7,0 -0.4,0.2h1.1q1.4,0 0.6,0.4l-2,0.2c-1.6,0.1 -3.4,0.5 -3.7,0.9l-1,0.2 -1.5,0.1 -2.3,0.3q-1.8,0.2 -2.5,0.5c-0.5,0.2 -0.9,0.3 -5.1,0.2a36,36 0,0 1,-9.5 -1c-2.3,-0.5 -6.5,-2.8 -8.1,-4.4s-1.8,-2 -2.6,-6.4c-0.3,-2 -0.3,-2.6 -0.3,-5 0,-3.2 0.3,-4.1 1.4,-6.5 2.3,-4.9 5.7,-7.1 9.3,-6 1.6,0.4 3.3,0.7 4,0.7 1.1,0 3.3,0.4 3.5,0.6 0.3,0.4 -0.3,0.5 -3.1,0.5 -3.1,0.1 -3.8,0.3 -5.4,1a4,4 0,0 0,-2.3 2.5l-0.3,0.6 0.7,0.6q2.1,1.9 6.1,3l4.7,0.9 4.5,0.8 1.9,0.3c1.5,0.2 2.1,0.5 0.7,0.4h-0.5q0.3,0.3 1.4,0 1.7,-0.1 1.8,0.2l-0.2,0.1 -0.2,0.1 1.5,0.2 14.3,1.6q0.3,0 0,0.3 -0.6,0.2 0.5,0.4h1c0,-0.3 0.5,-0.3 2.3,-0.3 2.2,0 2.3,0 2.4,0.3q0.4,0.3 -0.6,0.5l-1,0.2 5.7,0.6c0.7,0 2.2,0 3.3,0.3 1.8,0.3 2.7,0.3 6,0.3a78,78 0,0 1,8.8 0.2q1,-0.2 1,0l1.8,0.4 2.7,0.6c1,0.3 4,0.8 6.4,1l3,0.6 2.8,0.7a20,20 0,0 1,7 3q4.4,2.3 5,8.6v1.5c-0.2,0.3 -0.2,0.3 1,0.6s2.5,1 2.4,1.2l-0.2,0.4c-0.1,0.4 0.9,1.4 1.5,1.7q0.7,0.1 1.1,0.5 0.6,0.3 0.5,1t0.6,1.6l1.2,1.5q0.9,0.7 0.3,1.8l-0.6,2.6c-0.5,2.5 -0.6,2.7 -2,3.4 -0.8,0.4 -1,0.5 -1.8,1.8q-1,1.3 0.7,2.3c0.8,0.6 -0.1,0.5 -1.5,-0.1q-1,-0.6 -2,0.3c-0.7,0.5 -1,0.5 -2.4,0.7h-1l-2,-1.3 -2.3,-1.3 -2.5,-1.1 -2.6,-1.5c-0.4,-0.2 -8.3,-2.4 -8.7,-2.4a42,42 0,0 1,3.4 11.7c0.6,4.3 1.5,9.9 1.8,10.7 0.8,2.4 2.2,4.6 6.1,9.7 3.7,4.8 8.1,10.7 8.4,11.4a25,25 0,0 1,1.6 5.8q0,0.3 -0.6,0.6 -1,0.1 -0.8,1.6 0,1 -2.1,3c-1,1 -1.3,1.2 -2,1.3 -1.1,0.2 -3.3,0.2 -4,0 -1.7,-0.5 -1.8,-0.6 -2,-1.2l-1,-1.3 -1.2,-1.7q-1.5,-2 -3.1,-2.8t-4.4,-2.8a11,11 0,0 1,-3 -3.6c-0.4,-0.7 -1,-1.8 -1.5,-2.4a13,13 0,0 1,-2.2 -4.6c-0.3,-1.4 -0.4,-1.7 -0.4,-5l-0.2,-11c-0.1,-8.1 -0.2,-8.3 -1,-11.5 -0.4,-1.6 -2.7,-9.3 -2.9,-9.4l-2,-0.2c-1.6,-0.2 -2.2,-0.2 -3.7,0q-1.8,0.4 -3.4,0.2l-1.6,0.1a234,234 0,0 1,4.9 22.7,44 44,0 0,1 0.1,9.9c-0.3,2.6 -0.6,4 -1.4,6a5,5 0,0 1,-1.6 2.5q-1.4,1.3 -1.3,2.2c0,0.6 -1.2,2.2 -1.8,2.6l-1,1 -0.8,1 -1,0.8q-1,1 -3,1.2c-2.3,0.1 -2.5,0 -5.2,-2.7l-3.7,-3.2q-1.4,-0.9 -1.5,-1.5c-0.3,-0.6 -2,-2.2 -3.3,-2.8q-0.9,-0.5 -1,-0.8 -0.2,-0.4 -1.1,-1l-1.2,-1.3 -0.6,-0.8q-0.4,-0.3 -0.7,-0.9l-0.8,-0.8q-0.4,-0.2 -0.3,-0.8v-0.8q-0.5,-0.4 0,-0.3l0.3,-0.1 -1.3,-1.7 -1.3,-1.7 2.1,1a91,91 0,0 0,9.8 4.2c2,0.9 2.7,1 3.4,0.5 1,-0.7 1,-1 1,-6.7 0.2,-5.7 0.4,-7.4 1,-12.6 0.3,-3 0.4,-4.2 0.4,-8.3l-0.1,-4.9a28,28 0,0 0,-7.2 1.2l-3.3,0.8 -2.9,0.6 -4,0.6 -3,0.3 -0.6,0.6 -1.6,1.1c-1,0.6 -1.2,0.8 -1.4,2q-0.7,4 0.8,9.4c0.6,2 0.9,2.5 1.9,4a14,14 0,0 1,2.4 8c0.1,2 0.1,2.3 0.5,3q0.5,0.8 0.5,1.1a8,8 0,0 1,-0.8 3.4l-0.5,1.1c-0.1,0.7 -1.4,1.8 -3,2.7a75,75 0,0 0,-7.4 7,51 51,0 0,1 -7.3,7q-1.3,1 -2.6,1.1l-1.4,0.3q-1.4,0.5 -2.3,0l-0.5,-0.4 -1,0.6c-1.2,0.7 -1.5,0.8 -1.8,0.5" fill="#ffffff"/></svg>`,
    Bangumi: `<svg viewBox="0 0 192 192" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" rx="36" fill="#2d2e2f"/><defs><linearGradient id="bgmGradModal" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FF3599"/><stop offset="100%" stop-color="#FF77AB"/></linearGradient></defs><path d="M129.89,-36.09a3.42,3.42 0,1 1,5.7 3.87L87.4,36.59A31.9,31.9 0,0 1,100.22 46.16L157.23,46.16a17.09,17.09 0,0 1,17.09 17.09l0,93.98a17.09,17.09 0,0 1,-17.09 17.09L67.98,174.32L43.88,192.54a5.7,5.7 0,0 1,-8.54 -7.01l5.35,-11.22L-6.81,174.32a25.06,25.06 0,0 1,-25.06 -25.06L-31.87,63.25a17.09,17.09 0,0 1,17.09 -17.09L50.66,46.16a31.9,31.9 0,0 1,10.77 -8.71L-6.13,-31.76a3.42,3.42 0,0 1,4.9 -4.78L68.49,34.94a31.9,31.9 0,0 1,11.96 -0.34zM40.47,187.99l18.06,-13.67L46.96,174.32zM-6.81,55.28a7.97,7.97 0,0 0,-7.97 7.97l0,86.01a7.97,7.97 0,0 0,7.97 7.97l164.04,0a7.97,7.97 0,0 0,7.97 -7.97L165.2,63.25a7.97,7.97 0,0 0,-7.97 -7.97z" fill="url(#bgmGradModal)"/><path d="M157.23,55.28a7.97,7.97 0,0 1,7.97 7.97l0,86.01a7.97,7.97 0,0 1,-7.97 7.97L81.08,157.23L40.47,187.99l14.7,-30.76L-6.81,157.23a7.97,7.97 0,0 1,-7.97 -7.97L-14.78,63.25a7.97,7.97 0,0 1,7.97 -7.97z" fill="#ffffff"/><path d="M93.44,92.3a2.28,2.28 0,0 1,1.94 3.42l-18.23,30.76a2.28,2.28 0,0 1,-3.87 0l-18.23,-30.76a2.28,2.28 0,0 1,1.94 -3.42zM145.84,119.07a2.28,2.28 0,0 1,0 4.56l-36.17,0a2.28,2.28 0,0 1,0 -4.56zM40.75,118.78a2.28,2.28 0,0 1,0 4.56L4.58,123.34a2.28,2.28 0,0 1,0 -4.56zM75.21,120.89 L89.45,96.85L60.97,96.85zM145.84,111.09a2.28,2.28 0,0 1,0 4.56l-36.17,0a2.28,2.28 0,0 1,0 -4.56zM40.75,110.81a2.28,2.28 0,0 1,0 4.56L4.58,115.37a2.28,2.28 0,0 1,0 -4.56zM144.98,78.51a2.28,2.28 0,1 1,1.71 4.21L118.9,94.01l27.8,11.28a2.28,2.28 0,1 1,-1.71 4.21l-33.04,-13.39a2.28,2.28 0,0 1,0 -4.21zM2.48,79.48a2.28,2.28 0,0 1,2.96 -1.25l33.04,13.39a2.28,2.28 0,0 1,0 4.21l-33.04,13.39a2.28,2.28 0,0 1,-1.71 -4.21l27.85,-11.28 -27.85,-11.28a2.28,2.28 0,0 1,-1.25 -2.96" fill="url(#bgmGradModal)"/></svg>`
  },

  async syncReadingProgressToTrackers(mangaId, chaptersRead) {
    if (!mangaId) return;
    try {
      let trackingData = {};
      const raw = localStorage.getItem(`manga_tracking_${mangaId}`);
      if (raw) trackingData = JSON.parse(raw);
      if (Object.keys(trackingData).length === 0) return;

      let changed = false;
      Object.keys(trackingData).forEach(serviceKey => {
        const item = trackingData[serviceKey];
        if (item && item.linked) {
          const newChs = Math.max(item.chapters_read || 0, chaptersRead || 0);
          if (newChs !== item.chapters_read) {
            item.chapters_read = newChs;
            changed = true;
          }
        }
      });

      if (changed) {
        localStorage.setItem(`manga_tracking_${mangaId}`, JSON.stringify(trackingData));
        await API.saveMangaTracking(mangaId, trackingData);
      }
    } catch (e) {}
  },

  async openTrackingModal() {
    const m = this.manga;
    if (!m) return;

    let trackingData = {};
    try {
      const raw = localStorage.getItem(`manga_tracking_${m.id}`);
      if (raw) trackingData = JSON.parse(raw);
    } catch (e) {}

    if (Object.keys(trackingData).length === 0) {
      try {
        const srv = await API.getMangaTracking(m.id);
        if (srv && Object.keys(srv).length > 0) {
          trackingData = srv;
          localStorage.setItem(`manga_tracking_${m.id}`, JSON.stringify(srv));
        }
      } catch (e) {}
    }

    let trackingAccounts = [];
    try {
      trackingAccounts = await API.getTrackingAccounts();
    } catch (e) {}

    const services = [
      { id: 'AniList', name: 'AniList', color: '#02A9FF', searchUrl: `https://anilist.co/search/manga?search=${encodeURIComponent(m.title)}` },
      { id: 'MyAnimeList', name: 'MyAnimeList', color: '#2E51A2', searchUrl: `https://myanimelist.net/manga.php?q=${encodeURIComponent(m.title)}` },
      { id: 'Kitsu', name: 'Kitsu', color: '#FD755C', searchUrl: `https://kitsu.io/manga?text=${encodeURIComponent(m.title)}` },
      { id: 'MangaUpdates', name: 'MangaUpdates', color: '#FF8C15', searchUrl: `https://www.mangaupdates.com/series.html?search=${encodeURIComponent(m.title)}` },
      { id: 'Shikimori', name: 'Shikimori', color: '#888888', searchUrl: `https://shikimori.me/mangas?search=${encodeURIComponent(m.title)}` },
      { id: 'Bangumi', name: 'Bangumi', color: '#F09199', searchUrl: `https://bgm.tv/subject_search/${encodeURIComponent(m.title)}?cat=1` }
    ];

    let readCount = 0;
    if (this.chapters && this.chapters.length > 0) {
      const readChapters = this.chapters.filter(c => this.progressMap[c.id]?.is_read || c.is_read);
      if (readChapters.length > 0) {
        let maxReadNum = 0;
        readChapters.forEach(c => {
          const n = this.extractChapterNumber(c);
          if (n > 0) {
            const floorN = Math.floor(n);
            if (floorN > maxReadNum) maxReadNum = floorN;
          }
        });
        readCount = maxReadNum > 0 ? maxReadNum : readChapters.length;
      }
    }
    const totalChapters = this.getDisplayChapterCount();

    let selectedServiceId = services.find(s => trackingData[s.id]?.linked)?.id || 'AniList';
    const searchState = {};
    const changingMode = {};

    const modalHost = this.getModalHost();
    modalHost.innerHTML = `
      <div class="mihon-modal-backdrop" id="tracking-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 20px; animation: none !important;">
        <div class="mihon-dialog-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 16px; width: 100%; max-width: 680px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); animation: none !important;">
          
          <div class="mihon-dialog-header" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
            <div>
              <div class="mihon-dialog-title" style="font-size: 1.15rem; font-weight: 700; color: #fff;">Tracking</div>
              <div class="mihon-dialog-subtitle" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">Sync status, progress & score with AniList, MyAnimeList, Kitsu, MangaUpdates, Shikimori & Bangumi</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-tracking" style="background: transparent; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
          </div>

          <div class="mihon-dialog-body" style="padding: 18px 22px; overflow-y: auto; max-height: calc(90vh - 70px); display: grid; grid-template-columns: 190px 1fr; gap: 18px;">
            <!-- Left Services List -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="font-size: 0.74rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px;">Trackers</div>
              <div id="tracking-tabs-container" style="display: flex; flex-direction: column; gap: 6px;"></div>
            </div>

            <!-- Right Service Panel -->
            <div id="tracking-panel-container" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 12px; padding: 14px; overflow-y: auto; max-height: calc(90vh - 110px);">
            </div>
          </div>
        </div>
      </div>
    `;

    modalHost.querySelector('#btn-close-tracking')?.addEventListener('click', () => { modalHost.innerHTML = ''; });
    modalHost.querySelector('#tracking-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'tracking-backdrop') modalHost.innerHTML = '';
    });

    const doSearch = async (serviceId, query) => {
      const q = (query || m.title || '').trim();
      if (!q) return;
      if (!searchState[serviceId]) {
        searchState[serviceId] = { query: q, loading: false, results: [], error: null, hasSearched: false };
      }
      searchState[serviceId].loading = true;
      searchState[serviceId].query = q;
      searchState[serviceId].error = null;
      renderModal();

      try {
        const res = await API.searchTracking(serviceId.toLowerCase(), q);
        searchState[serviceId].results = Array.isArray(res) ? res : [];
        searchState[serviceId].hasSearched = true;
      } catch (err) {
        searchState[serviceId].error = 'Failed to search tracker service. Please try again.';
        searchState[serviceId].results = [];
      } finally {
        searchState[serviceId].loading = false;
        renderModal();
      }
    };

    const renderModal = () => {
      const curService = services.find(s => s.id === selectedServiceId) || services[0];
      const curAcc = (trackingAccounts || []).find(a => a.id === curService.id.toLowerCase());
      const curTrack = trackingData[curService.id];
      const isLinked = !!(curTrack && curTrack.linked);
      const isChanging = !!changingMode[curService.id];
      const showSearchView = !isLinked || isChanging;

      const tabsHtml = services.map(s => {
        const isTracked = !!trackingData[s.id]?.linked;
        const isActive = s.id === selectedServiceId;
        const logoSvg = this.TRACKER_LOGOS[s.id] || '';
        return `
          <button type="button" class="tracking-tab-item ${isActive ? 'active' : ''}" data-service-id="${s.id}" style="
            display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 9px; border: 1px solid ${isActive ? s.color : 'var(--border-subtle, rgba(255,255,255,0.08))'}; background: ${isActive ? 'rgba(255,255,255,0.08)' : 'transparent'}; color: ${isActive ? '#fff' : 'var(--text-secondary, #94a3b8)'}; cursor: pointer; text-align: left; transition: all 0.15s ease;
          ">
            <span style="display: flex; align-items: center; gap: 10px; font-weight: 500; font-size: 0.88rem; min-width: 0;">
              <span style="width: 26px; height: 26px; flex-shrink: 0; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                ${logoSvg}
              </span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.name}</span>
            </span>
            ${isTracked ? `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(var(--accent-primary-rgb), 0.2); color: var(--accent-primary); font-weight: 700; flex-shrink: 0; margin-left: 6px;">Tracked</span>` : ''}
          </button>
        `;
      }).join('');

      let contentHtml = '';

      if (showSearchView) {
        const curSearch = searchState[curService.id] || { query: m.title || '', loading: false, results: [], error: null, hasSearched: false };
        let resultsListHtml = '';

        if (curSearch.loading) {
          resultsListHtml = `
            <div style="padding: 36px 20px; text-align: center; color: var(--text-secondary);">
              <div style="display: inline-block; width: 28px; height: 28px; border: 3px solid rgba(255,255,255,0.15); border-top-color: ${curService.color}; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px;"></div>
              <div style="font-size: 0.88rem; font-weight: 500;">Searching ${curService.name}...</div>
            </div>
          `;
        } else if (curSearch.error) {
          resultsListHtml = `
            <div style="padding: 24px; text-align: center; color: var(--accent-red, #ef4444); font-size: 0.85rem;">
              ${this.escapeHtml(curSearch.error)}
            </div>
          `;
        } else if (curSearch.hasSearched && curSearch.results.length === 0) {
          resultsListHtml = `
            <div style="padding: 30px 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
              No entries found on ${curService.name} for "${this.escapeHtml(curSearch.query)}".<br/>Try searching with an alternative title.
            </div>
          `;
        } else if (curSearch.results.length > 0) {
          resultsListHtml = `
            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; padding-right: 4px;">
              ${curSearch.results.map(item => `
                <div class="tracking-search-result-card" style="display: flex; gap: 12px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 8px; align-items: center; transition: background 0.15s ease;">
                  <img src="${item.cover || '/static/img/default-cover.png'}" alt="${this.escapeHtml(item.title)}" style="width: 48px; height: 68px; object-fit: cover; border-radius: 6px; background: rgba(0,0,0,0.3); flex-shrink: 0;" />
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 0.92rem; color: #fff; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(item.title)}">
                      ${this.escapeHtml(item.title)}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                      <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.08); color: var(--text-secondary); font-weight: 600;">${this.escapeHtml(item.format || 'MANGA')}</span>
                      <span style="font-size: 0.72rem; color: var(--text-muted);">${item.total_chapters ? `${item.total_chapters} chapters` : 'Ongoing'}</span>
                      ${item.score ? `<span style="font-size: 0.72rem; color: #fbbf24; font-weight: 600;">★ ${item.score}</span>` : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHtml(item.status || '')}</div>
                  </div>
                  <button type="button" class="btn btn-primary btn-track-select" data-item-id="${item.id}" style="padding: 6px 14px; font-size: 0.82rem; height: 34px; border-radius: 6px; background-color: #2563eb; color: #fff; border: none; cursor: pointer; flex-shrink: 0;">
                    Track
                  </button>
                </div>
              `).join('')}
            </div>
          `;
        }

        const curLogoSvg = this.TRACKER_LOGOS[curService.id] || '';
        const isLoggedIn = !!(curAcc && curAcc.logged_in);

        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="width: 32px; height: 32px; flex-shrink: 0; border-radius: 7px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                  ${curLogoSvg}
                </span>
                <div>
                  <div style="font-weight: 700; font-size: 1.05rem; color: #fff; line-height: 1.2;">Search ${curService.name}</div>
                  <div style="font-size: 0.74rem; color: var(--text-muted);">Link this manga to ${curService.name} entry</div>
                </div>
              </div>
              ${isChanging ? `
                <button type="button" class="btn btn-secondary" id="btn-cancel-change" style="font-size: 0.78rem; padding: 4px 10px; border-radius: 6px;">
                  Cancel
                </button>
              ` : `
                <a href="${curService.searchUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.78rem; color: var(--text-muted); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                  <span>Web search</span>
                  <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
              `}
            </div>

            ${!isLoggedIn ? `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.22); border-radius: 8px;">
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                  Account not connected. Log in to <strong>${curService.name}</strong> to track and sync progress.
                </div>
                <button type="button" class="btn btn-primary btn-tracker-direct-login" style="padding: 5px 12px; font-size: 0.78rem; border-radius: 6px; background-color: ${curService.color}; color: #fff; border: none; cursor: pointer; font-weight: 600; flex-shrink: 0; margin-left: 10px;">
                  Log In
                </button>
              </div>
            ` : ''}

            <!-- Search Form -->
            <form id="track-search-form" style="display: flex; gap: 8px;">
              <input type="text" id="track-search-input" value="${this.escapeHtml(curSearch.query)}" placeholder="Search manga title on ${curService.name}..." style="flex: 1; padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 6px; color: #fff; font-size: 0.88rem;" />
              <button type="submit" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem; border-radius: 6px; background-color: #2563eb; color: #fff; border: none; cursor: pointer;">
                Search
              </button>
            </form>

            <!-- Results -->
            <div id="track-search-results-box">
              ${resultsListHtml}
            </div>
          </div>
        `;
      } else {
        // Mihon Linked Card View
        const itemCover = curTrack.cover || m.cover_url || '/static/img/default-cover.png';
        const itemTitle = curTrack.title || m.title;
        const itemUrl = curTrack.tracking_url || `https://${curService.name.toLowerCase()}.com`;
        const itemFormat = curTrack.format || 'MANGA';
        const itemTotal = curTrack.total_chapters || totalChapters;
        const curLogoSvg = this.TRACKER_LOGOS[curService.id] || '';

        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <!-- Linked Media Card Banner -->
            <div style="display: flex; gap: 12px; padding: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 10px; align-items: flex-start; position: relative;">
              <img src="${itemCover}" alt="${this.escapeHtml(itemTitle)}" style="width: 52px; height: 74px; object-fit: cover; border-radius: 6px; box-shadow: 0 4px 8px rgba(0,0,0,0.4); flex-shrink: 0;" />
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
                  <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                    <span style="width: 18px; height: 18px; flex-shrink: 0; border-radius: 4px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center;">
                      ${curLogoSvg}
                    </span>
                    <span style="font-size: 0.74rem; padding: 2px 6px; border-radius: 4px; background: ${curService.color}22; color: ${curService.color}; font-weight: 700;">${curService.name}</span>
                    <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(var(--accent-primary-rgb), 0.15); color: var(--accent-primary); font-weight: 600;">Tracked</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${itemFormat}</span>
                  </div>
                  <button type="button" class="btn-track-unlink-btn" title="Unlink ${curService.name}" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; transition: all 0.15s ease;">
                    <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span>Unlink</span>
                  </button>
                </div>
                <div style="font-weight: 700; font-size: 0.95rem; color: #fff; margin-bottom: 4px; line-height: 1.3;">
                  <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;" title="Open on ${curService.name}">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(itemTitle)}</span>
                    <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; stroke: var(--text-muted); fill: none; stroke-width: 2; flex-shrink: 0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                  </a>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  ${itemTotal ? `${itemTotal} Chapters total` : 'Chapters total: Unknown'}
                </div>
              </div>
            </div>

            <!-- Account Sync Status Banner -->
            ${curAcc && curAcc.logged_in ? `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 12px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.22); border-radius: 8px; font-size: 0.78rem;">
                <div style="display: flex; align-items: center; gap: 7px; color: #22c55e; font-weight: 600;">
                  <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.5;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span>Remote Sync: Logged in as <strong>${this.escapeHtml(curAcc.username || 'User')}</strong></span>
                </div>
                <button type="button" class="btn-tracker-auth-switch" data-service="${curService.id}" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; text-decoration: underline; font-size: 0.72rem;">Switch</button>
              </div>
            ` : `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 12px; background: rgba(2, 169, 255, 0.07); border: 1px solid rgba(2, 169, 255, 0.2); border-radius: 8px; font-size: 0.78rem;">
                <div style="color: var(--text-secondary); font-size: 0.76rem;">
                  <span>Local tracking. Connect account to sync ${curService.name} profile.</span>
                </div>
                <button type="button" class="btn btn-secondary btn-tracker-connect-inline" data-service="${curService.id}" style="font-size: 0.74rem; padding: 3px 9px; border-radius: 5px; color: ${curService.color}; border-color: ${curService.color}55; font-weight: 600; cursor: pointer;">Connect</button>
              </div>
            `}

            <!-- Reading Status Dropdown -->
            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px;">Reading Status</label>
              <select id="track-status-select" class="form-input" style="width: 100%; padding: 7px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 6px; color: #fff; font-size: 0.85rem;">
                <option value="Reading" ${curTrack.status === 'Reading' ? 'selected' : ''}>Reading</option>
                <option value="Completed" ${curTrack.status === 'Completed' ? 'selected' : ''}>Completed</option>
                <option value="On Hold" ${curTrack.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                <option value="Dropped" ${curTrack.status === 'Dropped' ? 'selected' : ''}>Dropped</option>
                <option value="Plan to Read" ${curTrack.status === 'Plan to Read' ? 'selected' : ''}>Plan to Read</option>
                <option value="Rereading" ${curTrack.status === 'Rereading' ? 'selected' : ''}>Rereading</option>
              </select>
            </div>

            <!-- Chapter Progress Stepper -->
            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px;">
                Chapters Read ${itemTotal ? `<span style="font-weight: 400; color: var(--text-muted);">(out of ${itemTotal})</span>` : ''}
              </label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <button type="button" class="btn btn-secondary" id="btn-track-dec-ch" style="padding: 5px 12px; font-weight: 700; font-size: 1rem; border-radius: 6px;">-</button>
                <input type="number" id="track-ch-input" min="0" max="${itemTotal || 9999}" value="${curTrack.chapters_read ?? readCount}" style="width: 80px; text-align: center; padding: 6px 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 6px; color: #fff; font-size: 0.92rem; font-weight: 600;" />
                <button type="button" class="btn btn-secondary" id="btn-track-inc-ch" style="padding: 5px 12px; font-weight: 700; font-size: 1rem; border-radius: 6px;">+</button>
                <button type="button" class="btn btn-secondary" id="btn-track-max-ch" style="font-size: 0.75rem; padding: 5px 10px; border-radius: 6px;" title="Set to total chapters">Max</button>
              </div>
            </div>

            <!-- Score (0 to 10) -->
            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 5px;">Score (0.0 – 10.0)</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" id="track-score-input" min="0" max="10" step="0.5" value="${curTrack.score || ''}" placeholder="Score (e.g. 8.5)" style="flex: 1; padding: 7px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 6px; color: #fff; font-size: 0.85rem;" />
                <span style="color: #fbbf24; font-size: 1rem;">★</span>
              </div>
            </div>

            <!-- Dedicated Actions -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
              <button type="button" class="btn btn-primary" id="btn-track-save" style="width: 100%; padding: 9px 16px; border-radius: 6px; background-color: #2563eb; color: #fff; border: none; cursor: pointer; font-weight: 600; font-size: 0.88rem;">
                Save Changes
              </button>
              <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <a href="${itemUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 6px 10px; font-size: 0.78rem; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;">
                  <span>Open on ${curService.name}</span>
                  <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <button type="button" class="btn btn-secondary" id="btn-track-change-entry" style="padding: 6px 10px; font-size: 0.78rem; border-radius: 6px;">
                    Change Media
                  </button>
                  <button type="button" class="btn-track-unlink-btn" id="btn-track-unlink-bottom" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; border-radius: 6px; padding: 6px 10px; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s ease;">
                    <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span>Unlink</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      const tabsContainer = modalHost.querySelector('#tracking-tabs-container');
      const panelContainer = modalHost.querySelector('#tracking-panel-container');
      if (!tabsContainer || !panelContainer) return;

      tabsContainer.innerHTML = tabsHtml;
      panelContainer.innerHTML = contentHtml;

      // Event handlers for tabs
      tabsContainer.querySelectorAll('.tracking-tab-item').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedServiceId = btn.getAttribute('data-service-id');
          changingMode[selectedServiceId] = false;
          renderModal();
          // Auto search if unlinked and never searched
          if (!trackingData[selectedServiceId]?.linked && (!searchState[selectedServiceId] || !searchState[selectedServiceId].hasSearched)) {
            doSearch(selectedServiceId, m.title);
          }
        });
      });

      // Search view listeners
      const searchForm = modalHost.querySelector('#track-search-form');
      if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const queryVal = modalHost.querySelector('#track-search-input')?.value || '';
          doSearch(curService.id, queryVal);
        });
      }

      const performLinkAndSync = async (item, service, acc) => {
        trackingData[service.id] = {
          linked: true,
          id: String(item.id),
          title: item.title,
          cover: item.cover,
          total_chapters: item.total_chapters || totalChapters,
          format: item.format || 'MANGA',
          tracking_url: item.url,
          status: 'Reading',
          chapters_read: readCount,
          score: item.score || 0,
          updated_at: Date.now()
        };

        changingMode[service.id] = false;
        try {
          localStorage.setItem(`manga_tracking_${m.id}`, JSON.stringify(trackingData));
          await API.saveMangaTracking(m.id, trackingData);
        } catch (e) {}

        if (acc && acc.logged_in) {
          try {
            const syncRes = await API.syncRemoteTracking(m.id, {
              service: service.id,
              tracker_id: String(item.id),
              status: 'Reading',
              chapters_read: readCount,
              score: item.score || 0
            });
            if (syncRes && syncRes.success) {
              Toast.show(`Tracked & synced to ${service.name}!`, 'success');
            } else {
              Toast.show(`Linked to ${service.name}`, 'success');
            }
          } catch (e) {
            Toast.show(`Linked to ${service.name}`, 'success');
          }
        }
        this.updateTrackingButtonState();
        renderModal();
      };

      modalHost.querySelectorAll('.btn-track-select').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = btn.getAttribute('data-item-id');
          const curSearch = searchState[curService.id];
          const item = (curSearch?.results || []).find(r => String(r.id) === String(itemId));
          if (!item) return;

          // If not logged in: DO NOT do local tracking! Directly open login page / modal!
          if (!curAcc || !curAcc.logged_in) {
            Toast.show(`Please log in to ${curService.name} to track this manga`, 'info');
            TrackerAuth.openLoginModal(curService.id, async (freshAcc) => {
              try {
                trackingAccounts = await API.getTrackingAccounts();
              } catch (e) {}
              const updatedAcc = (trackingAccounts || []).find(a => a.id === curService.id.toLowerCase());
              if (updatedAcc && updatedAcc.logged_in) {
                await performLinkAndSync(item, curService, updatedAcc);
              }
            });
            return;
          }

          await performLinkAndSync(item, curService, curAcc);
        });
      });

      modalHost.querySelector('#btn-cancel-change')?.addEventListener('click', () => {
        changingMode[curService.id] = false;
        renderModal();
      });

      modalHost.querySelector('#btn-track-change-entry')?.addEventListener('click', () => {
        changingMode[curService.id] = true;
        renderModal();
        if (!searchState[curService.id] || !searchState[curService.id].hasSearched) {
          doSearch(curService.id, curTrack?.title || m.title);
        }
      });

      // Linked view listeners
      const chInput = modalHost.querySelector('#track-ch-input');
      const maxCh = curTrack?.total_chapters || totalChapters;
      modalHost.querySelector('#btn-track-dec-ch')?.addEventListener('click', () => {
        if (chInput) chInput.value = Math.max(0, (parseInt(chInput.value, 10) || 0) - 1);
      });
      modalHost.querySelector('#btn-track-inc-ch')?.addEventListener('click', () => {
        if (chInput) chInput.value = (parseInt(chInput.value, 10) || 0) + 1;
      });
      modalHost.querySelector('#btn-track-max-ch')?.addEventListener('click', () => {
        if (chInput && maxCh > 0) chInput.value = maxCh;
      });

      modalHost.querySelector('#btn-track-save')?.addEventListener('click', async () => {
        if (!curAcc || !curAcc.logged_in) {
          Toast.show(`Please log in to ${curService.name} to save and sync tracking`, 'info');
          TrackerAuth.openLoginModal(curService.id, async (freshAcc) => {
            try {
              trackingAccounts = await API.getTrackingAccounts();
            } catch (e) {}
            renderModal();
          });
          return;
        }

        const status = modalHost.querySelector('#track-status-select')?.value || 'Reading';
        const chs = parseInt(chInput?.value, 10) || 0;
        const score = parseFloat(modalHost.querySelector('#track-score-input')?.value) || 0;

        if (trackingData[curService.id]) {
          trackingData[curService.id].status = status;
          trackingData[curService.id].chapters_read = chs;
          trackingData[curService.id].score = score;
          trackingData[curService.id].updated_at = Date.now();
        }

        try {
          localStorage.setItem(`manga_tracking_${m.id}`, JSON.stringify(trackingData));
          await API.saveMangaTracking(m.id, trackingData);
        } catch (e) {}

        if (curAcc && curAcc.logged_in && curTrack?.id) {
          try {
            const syncRes = await API.syncRemoteTracking(m.id, {
              service: curService.id,
              tracker_id: curTrack.id,
              status: status,
              chapters_read: chs,
              score: score
            });
            if (syncRes && syncRes.success) {
              Toast.show(`Saved & synced to ${curService.name}!`, 'success');
            } else {
              Toast.show(`Saved to ${curService.name}`, 'info');
            }
          } catch (e) {
            Toast.show(`Saved to ${curService.name}`, 'info');
          }
        }

        this.updateTrackingButtonState();
        renderModal();
      });

      // Connect Account / Switch Account / Direct Login listeners
      modalHost.querySelectorAll('.btn-tracker-connect-inline, .btn-tracker-auth-switch, .btn-tracker-direct-login').forEach(btn => {
        btn.addEventListener('click', () => {
          const sId = btn.getAttribute('data-service') || curService.id;
          if (window.TrackerAuth) {
            window.TrackerAuth.openLoginModal(sId, async () => {
              try { trackingAccounts = await API.getTrackingAccounts(); } catch (e) {}
              renderModal();
            });
          }
        });
      });


      // Unlink handlers (works for banner button or bottom button)
      const executeUnlink = async () => {
        delete trackingData[curService.id];
        delete changingMode[curService.id];
        try {
          localStorage.setItem(`manga_tracking_${m.id}`, JSON.stringify(trackingData));
          await API.saveMangaTracking(m.id, trackingData);
        } catch (e) {}

        Toast.show(`Unlinked ${curService.name}`, 'info');
        this.updateTrackingButtonState();
        renderModal();
        doSearch(curService.id, m.title);
      };

      modalHost.querySelectorAll('.btn-track-unlink-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          executeUnlink();
        });
      });
    };

    renderModal();

    // Auto-search initial selected service if unlinked
    if (!trackingData[selectedServiceId]?.linked) {
      doSearch(selectedServiceId, m.title);
    }
  },

  async openSmartUpdateModal() {
    const m = this.manga;
    if (!m) return;

    let savedConfig = { strategy: 'smart', fetch_interval: 0 };
    try {
      const raw = localStorage.getItem(`manga_smart_update_${m.id}`);
      if (raw) savedConfig = { ...savedConfig, ...JSON.parse(raw) };
    } catch (e) {}

    try {
      const srv = await API.getMangaUpdateStrategy(m.id);
      if (srv) {
        if (typeof srv === 'object') {
          if (srv.fetch_interval !== undefined) savedConfig.fetch_interval = srv.fetch_interval;
          if (srv.strategy) savedConfig.strategy = srv.strategy;
        } else if (typeof srv === 'string') {
          savedConfig.strategy = srv;
        }
      }
    } catch (e) {}

    const info = this.getMihonSmartUpdateInfo(m, this.chapters);
    const selectedInterval = Math.abs(savedConfig.fetch_interval || savedConfig.interval_days || 0);

    const optionsHtml = [];
    optionsHtml.push(`<option value="0" ${selectedInterval === 0 ? 'selected' : ''}>Default</option>`);
    for (let d = 1; d <= 28; d++) {
      optionsHtml.push(`<option value="${d}" ${selectedInterval === d ? 'selected' : ''}>${d} ${d === 1 ? 'day' : 'days'}</option>`);
    }

    let predictionText = '';
    if (!info.isCompleted && info.nextUpdateDays !== null && info.interval !== null) {
      const nextDaysStr = info.nextUpdateDays === 0 ? 'soon' : (info.nextUpdateDays === 1 ? '1 day' : `${info.nextUpdateDays} days`);
      const intervalStr = info.interval === 1 ? '1 day' : `${info.interval} days`;
      predictionText = `New chapters predicted to be released in around ${nextDaysStr}, checking around every ${intervalStr}.`;
    } else {
      predictionText = 'This manga is either completed, or there is no predicted release date.';
    }

    const modalHost = this.getModalHost();
    modalHost.innerHTML = `
      <div class="mihon-modal-backdrop" id="smart-update-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 20px;">
        <div class="mihon-dialog-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 16px; width: 100%; max-width: 440px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
          
          <div class="mihon-dialog-header" style="display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
            <div class="mihon-dialog-title" style="font-size: 1.15rem; font-weight: 700; color: #fff;">Smart update</div>
            <button class="mihon-dialog-close" id="btn-close-smart-update" style="background: transparent; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
          </div>

          <div class="mihon-dialog-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 18px;">
            <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text-secondary, #cbd5e1);">
              ${this.escapeHtml(predictionText)}
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label for="select-custom-frequency" style="font-size: 0.85rem; font-weight: 600; color: #fff;">
                Custom update frequency:
              </label>
              <select id="select-custom-frequency" style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-subtle, rgba(255,255,255,0.15)); border-radius: 8px; color: #fff; font-size: 0.95rem; font-weight: 500; outline: none; cursor: pointer;">
                ${optionsHtml.join('')}
              </select>
            </div>
          </div>

          <div class="mihon-dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
            <button type="button" class="btn btn-secondary" id="btn-cancel-smart-update" style="padding: 8px 16px; border-radius: 6px; font-weight: 500;">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-save-smart-update" style="padding: 8px 20px; border-radius: 6px; font-weight: 600; background-color: #2563eb; color: #fff; border: none; cursor: pointer;">Save</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalHost.innerHTML = ''; };
    modalHost.querySelector('#btn-close-smart-update')?.addEventListener('click', closeModal);
    modalHost.querySelector('#btn-cancel-smart-update')?.addEventListener('click', closeModal);
    modalHost.querySelector('#smart-update-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'smart-update-backdrop') closeModal();
    });

    modalHost.querySelector('#btn-save-smart-update')?.addEventListener('click', async () => {
      const selectEl = modalHost.querySelector('#select-custom-frequency');
      const val = parseInt(selectEl?.value, 10) || 0;

      const newConfig = {
        strategy: 'smart',
        fetch_interval: val === 0 ? 0 : -val,
        interval_days: val
      };

      try {
        localStorage.setItem(`manga_smart_update_${m.id}`, JSON.stringify(newConfig));
        await API.saveMangaUpdateStrategy(m.id, newConfig);
      } catch (e) {}

      closeModal();
      this.updateSmartUpdateButtonState();
      Toast.show(val === 0 ? 'Reset update frequency to Default' : `Set custom update frequency to ${val} ${val === 1 ? 'day' : 'days'}`, 'success');
    });
  },

  async openEditMetadataModal() {
    const m = this.manga;
    if (!m) return;

    let customMeta = {};
    try {
      const res = await API.getMangaMetadata(m.id);
      customMeta = res.custom || {};
    } catch (e) {
      customMeta = m.custom_metadata || {};
    }

    const origTitle = m.original_title || m.title || '';
    const origAuthor = m.original_author || m.author || '';
    const origArtist = m.original_artist || m.artist || '';
    const origStatus = m.original_status || m.status || 'Ongoing';
    const origSummary = m.original_summary || m.summary || m.description || '';
    const origCover = m.original_cover_url || m.cover_url || '';
    const origGenres = Array.isArray(m.original_genres) ? m.original_genres : (Array.isArray(m.genres) ? m.genres : []);

    const curTitle = customMeta.custom_title || m.title || '';
    const curAuthor = customMeta.custom_author || m.author || '';
    const curArtist = customMeta.custom_artist || m.artist || '';
    const curStatus = customMeta.custom_status || m.status || 'Ongoing';
    const curSummary = customMeta.custom_summary || m.summary || m.description || '';
    const curCover = customMeta.custom_cover_url || m.cover_url || '';
    const curGenres = customMeta.custom_genres ? (Array.isArray(customMeta.custom_genres) ? customMeta.custom_genres : [customMeta.custom_genres]) : (Array.isArray(m.genres) ? m.genres : []);

    const hasAnyCustom = !!(
      customMeta.custom_title ||
      customMeta.custom_author ||
      customMeta.custom_artist ||
      customMeta.custom_status ||
      customMeta.custom_summary ||
      customMeta.custom_cover_url ||
      customMeta.custom_genres ||
      m.has_custom_metadata
    );

    let pendingCoverFile = null;
    let pendingResetCover = false;

    const modalHost = this.getModalHost();
    modalHost.innerHTML = `
      <div class="mihon-modal-backdrop" id="edit-meta-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 20px;">
        <div class="mihon-dialog-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 16px; width: 100%; max-width: 580px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
          
          <div class="mihon-dialog-header" style="display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
            <div>
              <div class="mihon-dialog-title" style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary, #fff);">Edit Manga Info</div>
              <div class="mihon-dialog-subtitle" style="font-size: 0.8rem; color: var(--text-muted, #a1a1aa); margin-top: 2px;">Customize title, cover, and details (Mihon compatible)</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-meta" style="background: transparent; border: none; font-size: 1.5rem; color: var(--text-muted, #a1a1aa); cursor: pointer; line-height: 1; padding: 4px;">&times;</button>
          </div>

          <div class="mihon-dialog-body" style="padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px;">
            
            <!-- Cover section -->
            <div style="display: flex; gap: 16px; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle, rgba(255,255,255,0.06)); border-radius: 12px; padding: 14px;">
              <img id="meta-cover-preview" src="${this.escapeHtml(curCover)}" alt="Cover preview" style="width: 72px; height: 104px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; background: #000;" onerror="this.src='/static/img/default-cover.png'" />
              <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Cover Image</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="btn btn-secondary" id="meta-btn-upload-cover" style="font-size: 0.8rem; padding: 6px 12px;">Upload File</button>
                  <input type="file" id="meta-file-input" accept="image/*" style="display: none;" />
                  ${customMeta.custom_cover_url ? `<button type="button" class="btn btn-secondary" id="meta-btn-reset-cover" style="font-size: 0.8rem; padding: 6px 12px; color: #ef4444;">Reset Cover</button>` : ''}
                </div>
                <input type="text" id="meta-cover-url-input" class="form-input" placeholder="Or paste image URL..." value="${this.escapeHtml(customMeta.custom_cover_url || '')}" style="font-size: 0.8rem; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 6px; color: #fff; width: 100%;" />
              </div>
            </div>

            <!-- Title -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="meta-title-input" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Title</label>
                ${customMeta.custom_title ? `<button type="button" id="meta-revert-title" style="background: none; border: none; font-size: 0.75rem; color: var(--accent-primary, #10b981); cursor: pointer; text-decoration: underline;">Revert to source</button>` : ''}
              </div>
              <input type="text" id="meta-title-input" class="form-input" value="${this.escapeHtml(curTitle)}" placeholder="Title" style="padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: rgba(0,0,0,0.25); color: #fff; font-size: 0.9rem;" />
            </div>

            <!-- Author & Artist -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label for="meta-author-input" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Author</label>
                <input type="text" id="meta-author-input" class="form-input" value="${this.escapeHtml(curAuthor)}" placeholder="Author" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: rgba(0,0,0,0.25); color: #fff; font-size: 0.88rem;" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label for="meta-artist-input" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Artist</label>
                <input type="text" id="meta-artist-input" class="form-input" value="${this.escapeHtml(curArtist)}" placeholder="Artist" style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: rgba(0,0,0,0.25); color: #fff; font-size: 0.88rem;" />
              </div>
            </div>

            <!-- Status & Genre Tags -->
            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px;">
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label for="meta-status-select" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Status</label>
                <select id="meta-status-select" style="padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: #27272a; color: #fff; font-size: 0.88rem; cursor: pointer;">
                  <option value="Ongoing" ${curStatus.toLowerCase() === 'ongoing' ? 'selected' : ''}>Ongoing</option>
                  <option value="Completed" ${curStatus.toLowerCase() === 'completed' ? 'selected' : ''}>Completed</option>
                  <option value="Hiatus" ${curStatus.toLowerCase() === 'hiatus' ? 'selected' : ''}>Hiatus</option>
                  <option value="Cancelled" ${curStatus.toLowerCase() === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label for="meta-genres-input" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Genre Tags</label>
                <input type="text" id="meta-genres-input" class="form-input" value="${this.escapeHtml(curGenres.join(', '))}" placeholder="Action, Adventure, Fantasy..." style="padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: rgba(0,0,0,0.25); color: #fff; font-size: 0.88rem;" />
              </div>
            </div>

            <!-- Synopsis / Summary -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label for="meta-summary-input" style="font-size: 0.84rem; font-weight: 600; color: var(--text-secondary, #d4d4d8);">Synopsis / Description</label>
              <textarea id="meta-summary-input" rows="4" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: rgba(0,0,0,0.25); color: #fff; font-size: 0.86rem; line-height: 1.5; resize: vertical; font-family: inherit;">${this.escapeHtml(curSummary)}</textarea>
            </div>

          </div>

          <div class="mihon-dialog-footer" style="padding: 16px 24px; border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2);">
            <div>
              ${hasAnyCustom ? `<button type="button" class="btn btn-secondary" id="meta-btn-reset-all" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.82rem; padding: 6px 14px;">Reset to Source</button>` : ''}
            </div>
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-secondary" id="meta-btn-cancel" style="padding: 7px 18px;">Cancel</button>
              <button type="button" class="btn btn-primary" id="meta-btn-save" style="padding: 7px 22px; font-weight: 600;">Save Changes</button>
            </div>
          </div>

        </div>
      </div>
    `;

    const backdrop = document.getElementById('edit-meta-backdrop');
    const closeBtn = document.getElementById('btn-close-meta');
    const cancelBtn = document.getElementById('meta-btn-cancel');
    const saveBtn = document.getElementById('meta-btn-save');
    const resetAllBtn = document.getElementById('meta-btn-reset-all');
    const uploadCoverBtn = document.getElementById('meta-btn-upload-cover');
    const fileInput = document.getElementById('meta-file-input');
    const resetCoverBtn = document.getElementById('meta-btn-reset-cover');
    const coverUrlInput = document.getElementById('meta-cover-url-input');
    const coverPreview = document.getElementById('meta-cover-preview');
    const revertTitleBtn = document.getElementById('meta-revert-title');

    const closeModal = () => {
      modalHost.innerHTML = '';
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop) closeModal();
      };
    }

    if (uploadCoverBtn && fileInput) {
      uploadCoverBtn.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          pendingCoverFile = file;
          pendingResetCover = false;
          coverPreview.src = URL.createObjectURL(file);
          coverUrlInput.value = '';
        }
      };
    }

    if (coverUrlInput) {
      coverUrlInput.oninput = () => {
        const url = coverUrlInput.value.trim();
        if (url) {
          pendingCoverFile = null;
          pendingResetCover = false;
          coverPreview.src = url;
        }
      };
    }

    if (resetCoverBtn) {
      resetCoverBtn.onclick = () => {
        pendingResetCover = true;
        pendingCoverFile = null;
        coverPreview.src = origCover || '/static/img/default-cover.png';
        coverUrlInput.value = '';
        Toast.show('Cover reset to source default on save', 'info');
      };
    }

    if (revertTitleBtn) {
      revertTitleBtn.onclick = () => {
        document.getElementById('meta-title-input').value = origTitle;
      };
    }

    if (resetAllBtn) {
      resetAllBtn.onclick = async () => {
        resetAllBtn.disabled = true;
        resetAllBtn.textContent = 'Resetting...';
        try {
          const res = await API.resetMangaMetadata(m.id);
          if (res.manga) {
            this.manga = res.manga;
          }
          if (Array.isArray(State.library)) {
            const idx = State.library.findIndex(item => item.id === m.id);
            if (idx !== -1) {
              State.library[idx] = { ...State.library[idx], ...this.manga };
            }
          }
          try {
            localStorage.setItem(`manga_meta_${m.id}`, JSON.stringify(this.manga));
          } catch (e) {}
          Toast.show('Metadata reset to original source values', 'info');
          closeModal();
          const cEl = document.getElementById('view-manga_detail') || document.getElementById('view-manga-detail');
          if (cEl) {
            this.renderedMangaId = null;
            this.renderContent(cEl);
          }
        } catch (err) {
          console.error('Error resetting metadata:', err);
          Toast.show('Failed to reset metadata: ' + err.message, 'error');
          resetAllBtn.disabled = false;
          resetAllBtn.textContent = 'Reset to Source';
        }
      };
    }

    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          let finalCoverUrl = coverUrlInput ? coverUrlInput.value.trim() : '';

          if (pendingCoverFile) {
            const uploadRes = await API.uploadMangaCover(m.id, pendingCoverFile);
            if (uploadRes.cover_url) {
              finalCoverUrl = uploadRes.cover_url;
            }
          } else if (pendingResetCover) {
            finalCoverUrl = '';
          } else if (!finalCoverUrl && customMeta.custom_cover_url) {
            finalCoverUrl = customMeta.custom_cover_url;
          }

          const rawGenres = document.getElementById('meta-genres-input')?.value || '';
          const parsedGenres = rawGenres.split(',').map(g => g.trim()).filter(Boolean);

          const payload = {
            title: document.getElementById('meta-title-input')?.value.trim() || origTitle,
            author: document.getElementById('meta-author-input')?.value.trim() || '',
            artist: document.getElementById('meta-artist-input')?.value.trim() || '',
            status: document.getElementById('meta-status-select')?.value || 'Ongoing',
            summary: document.getElementById('meta-summary-input')?.value.trim() || '',
            genres: parsedGenres,
            cover_url: finalCoverUrl
          };

          const updateRes = await API.saveMangaMetadata(m.id, payload);
          if (updateRes.manga) {
            this.manga = { ...this.manga, ...updateRes.manga };
          }
          if (Array.isArray(State.library)) {
            const idx = State.library.findIndex(item => item.id === m.id);
            if (idx !== -1) {
              State.library[idx] = { ...State.library[idx], ...this.manga };
            }
          }
          try {
            localStorage.setItem(`manga_meta_${m.id}`, JSON.stringify(this.manga));
          } catch (e) {}
          Toast.show('Manga metadata updated successfully', 'success');
          closeModal();
          const cEl = document.getElementById('view-manga_detail') || document.getElementById('view-manga-detail');
          if (cEl) {
            this.renderedMangaId = null;
            this.renderContent(cEl);
          }
        } catch (err) {
          console.error('Error saving custom metadata:', err);
          Toast.show('Failed to save metadata: ' + err.message, 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      };
    }
  },

  async openAddToLibraryModal() {
    const m = this.manga;
    if (!m) return;

    let categories = [];
    try {
      categories = await API.getCategories();
    } catch (e) {
      categories = [];
    }
    if (!categories || categories.length === 0) {
      categories = [
        { id: 'default', name: 'Default', sort_order: 0 },
        { id: 'reading', name: 'Reading', sort_order: 1 },
        { id: 'plan_to_read', name: 'Plan to Read', sort_order: 2 },
        { id: 'completed', name: 'Completed', sort_order: 3 }
      ];
    }

    let modalHost = this.getModalHost();

    // Default pre-selection: 'reading' or 'default'
    const defaultSelectedId = categories.some(c => c.id === 'reading') ? 'reading' : (categories[0]?.id || 'default');
    const selectedIds = new Set([defaultSelectedId]);

    const categoryRowsHtml = categories.map(cat => {
      const isSelected = selectedIds.has(cat.id);
      return `
        <label class="category-choice-item ${isSelected ? 'selected' : ''}" data-cat-id="${cat.id}" style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; border-radius: 8px; border: 1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background: ${isSelected ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'rgba(255,255,255,0.02)'}; margin-bottom: 8px; transition: border-color 0.15s ease, background 0.15s ease;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="cat-add-checkbox" data-cat-id="${cat.id}" ${isSelected ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;" />
            <span style="font-weight: 500; font-size: 0.92rem; color: #fff;">${this.escapeHtml(cat.name)}</span>
          </div>
          <span class="cat-selected-badge" style="font-size: 0.78rem; color: var(--accent-primary); font-weight: 600; display: ${isSelected ? 'inline' : 'none'};">Selected</span>
        </label>
      `;
    }).join('');

    modalHost.innerHTML = `
      <div class="mihon-modal-backdrop" id="add-to-lib-backdrop">
        <div class="mihon-dialog-card" style="max-width: 420px; width: 100%;">
          <div class="mihon-dialog-header">
            <div>
              <div class="mihon-dialog-title">Add to Library</div>
              <div class="mihon-dialog-subtitle" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">
                Choose category for ${this.escapeHtml(m.title)}
              </div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-add-lib">&times;</button>
          </div>

          <div class="mihon-dialog-body" style="display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; padding: 14px 4px 6px 0;">
            ${categoryRowsHtml}
          </div>

          <div class="mihon-dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
            <button class="btn btn-secondary" id="btn-cancel-add-lib">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-add-lib" style="padding: 6px 20px; font-weight: 600;">Add to Library</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalHost.innerHTML = ''; };

    const backdrop = document.getElementById('add-to-lib-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    const closeBtn = document.getElementById('btn-close-add-lib');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const cancelBtn = document.getElementById('btn-cancel-add-lib');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const updateRowState = (row, isChecked) => {
      const catId = row.getAttribute('data-cat-id');
      const badge = row.querySelector('.cat-selected-badge');
      if (isChecked) {
        selectedIds.add(catId);
        row.classList.add('selected');
        row.style.borderColor = 'var(--accent-primary)';
        row.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        if (badge) badge.style.display = 'inline';
      } else {
        selectedIds.delete(catId);
        row.classList.remove('selected');
        row.style.borderColor = 'var(--border-subtle)';
        row.style.background = 'rgba(255,255,255,0.02)';
        if (badge) badge.style.display = 'none';
      }
    };

    modalHost.querySelectorAll('.cat-add-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const row = cb.closest('.category-choice-item');
        if (row) {
          updateRowState(row, cb.checked);
        }
      });
    });

    const confirmBtn = document.getElementById('btn-confirm-add-lib');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Adding...';

        let chosenCatIds = Array.from(selectedIds);
        if (chosenCatIds.length === 0) {
          chosenCatIds = ['default'];
        }

        const chosenNames = chosenCatIds.map(cid => {
          const found = categories.find(c => c.id === cid);
          return found ? found.name : 'Default';
        });

        m.chapter_count = this.getDisplayChapterCount();
        m.category_ids = chosenCatIds;
        m.category_id = chosenCatIds[0];
        m.category_name = chosenNames.join(', ');

        try {
          await API.addToLibrary({
            ...m,
            category_ids: chosenCatIds,
            category_id: chosenCatIds[0],
            chapters: this.chapters
          });
          await API.setMangaCategories(m.id, chosenCatIds);

          // Reload library state
          const freshLibrary = await API.getLibrary();
          State.library = freshLibrary || [];

          Toast.show(`Added to library (${chosenNames.join(', ')})`, 'success');
          closeModal();
          this.updateLibraryButtonState();

          if (typeof LibraryView !== 'undefined' && LibraryView.loadData) {
            LibraryView.loadData().catch(() => {});
          }
        } catch (err) {
          console.error('Failed to add to library:', err);
          Toast.show('Failed to add to library: ' + err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Add to Library';
        }
      });
    }
  },

  async removeCurrentMangaFromLibrary() {
    const m = this.manga;
    if (!m) return;
    this.openRemoveFromLibraryDialog(m);
  },

  // Mihon RemoveMangaDialog ("Are you sure?")
  openRemoveFromLibraryDialog(m) {
    if (!m) return;
    let modalHost = this.getModalHost();

    modalHost.innerHTML = `
      <div class="mihon-dialog-backdrop" id="delete-library-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(2px);">
        <div class="mihon-dialog mihon-remove-dialog" role="dialog" aria-modal="true" style="background: #2b2c39; border-radius: 24px; padding: 24px; width: 90%; max-width: 320px; box-shadow: 0 16px 36px rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.06); animation: fadeIn 0.15s ease;">
          <h3 class="mihon-dialog-title" style="margin: 0 0 16px 0; font-size: 1.35rem; font-weight: 700; color: #ececf1; letter-spacing: -0.01em;">Are you sure?</h3>
          <p class="mihon-dialog-body" style="margin: 0 0 24px 0; font-size: 0.92rem; line-height: 1.45; color: #b4b8c7;">You are about to remove &quot;${this.escapeHtml(m.title)}&quot; from your library</p>
          
          <div class="mihon-dialog-actions" style="display: flex; justify-content: flex-end; align-items: center; gap: 16px;">
            <button type="button" id="btn-dialog-cancel" style="background: transparent; border: none; font-size: 0.92rem; font-weight: 600; color: #d1d5db; cursor: pointer; padding: 6px 12px; border-radius: 6px; transition: background 0.15s;">Cancel</button>
            <button type="button" id="btn-dialog-confirm" style="background: transparent; border: none; font-size: 0.92rem; font-weight: 600; color: var(--accent-primary); cursor: pointer; padding: 6px 12px; border-radius: 6px; transition: opacity 0.15s, background 0.15s;">Remove</button>
          </div>
        </div>
      </div>
    `;

    const closeDialog = () => { modalHost.innerHTML = ''; };
    modalHost.querySelector('#delete-library-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'delete-library-backdrop') closeDialog();
    });
    modalHost.querySelector('#btn-dialog-cancel')?.addEventListener('click', closeDialog);

    const confirmBtn = modalHost.querySelector('#btn-dialog-confirm');
    confirmBtn?.addEventListener('click', async () => {
      closeDialog();
      try {
        await API.removeFromLibrary(m.id, {
          delete_from_library: true,
          delete_chapters: false
        });
        State.library = (State.library || []).filter(item => item.id !== m.id);
        Toast.show('Removed from library', 'info');
        this.updateLibraryButtonState();
        if (typeof LibraryView !== 'undefined' && LibraryView.loadData) {
          LibraryView.loadData().catch(() => {});
        }
      } catch (err) {
        console.error('Error removing manga from library:', err);
        Toast.show('Failed to remove: ' + err.message, 'error');
      }
    });
  },

  // Mihon Anchor Popup: Queued/Downloading Chapter Action (Download Now or Cancel)
  openChapterDownloadModal(chId, anchorEl = null) {
    const ch = this.chapters.find(c => c.id === chId);
    if (!ch) return;

    const activeInfo = this.downloadTasksMap[chId] || (this.pendingDownloadIds.has(chId) ? { status: 'pending' } : null);
    const taskId = activeInfo?.task_id || chId;

    let popupContainer = document.getElementById('chapter-dl-modal-container');
    if (!popupContainer) {
      popupContainer = document.createElement('div');
      popupContainer.id = 'chapter-dl-modal-container';
      document.body.appendChild(popupContainer);
    }

    // Calculate popup position next to clicked download icon
    let top = 120;
    let right = 24;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const menuHeight = 96;
      if (rect.bottom + menuHeight > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuHeight);
      } else {
        top = rect.bottom + 4;
      }
      right = Math.max(16, window.innerWidth - rect.right);
    }

    popupContainer.innerHTML = `
      <!-- Invisible click-away backdrop: NO dark background, NO blur -->
      <div id="chapter-dl-backdrop" style="position: fixed; inset: 0; z-index: 1040; background: transparent;"></div>

      <!-- Anchor Menu directly positioned like Mihon native app -->
      <div class="mihon-anchor-menu" style="position: fixed; top: ${top}px; right: ${right}px; z-index: 1050;">
        <div class="mihon-anchor-item" id="btn-dl-modal-download-now">Start downloading now</div>
        <div class="mihon-anchor-item" id="btn-dl-modal-cancel">Cancel</div>
      </div>
    `;

    const closeModal = () => { popupContainer.innerHTML = ''; };
    popupContainer.querySelector('#chapter-dl-backdrop')?.addEventListener('click', closeModal);

    const btnNow = popupContainer.querySelector('#btn-dl-modal-download-now');
    if (btnNow) {
      btnNow.addEventListener('click', async () => {
        closeModal();
        try {
          await API.reorderDownload(taskId, true);
          Toast.show('Moved chapter to download now', 'info');
          this.startDownloadPolling();
        } catch (err) {
          console.error('Failed to reorder download:', err);
          Toast.show('Failed to prioritize download', 'error');
        }
      });
    }

    const btnCancel = popupContainer.querySelector('#btn-dl-modal-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', async () => {
        closeModal();
        this.pendingDownloadIds.delete(chId);
        delete this.downloadTasksMap[chId];
        this.updateChapterDownloadUI(chId, false, null);
        try {
          await API.cancelDownload(taskId);
          Toast.show('Download cancelled', 'info');
          this.startDownloadPolling();
        } catch (err) {
          console.error('Failed to cancel download:', err);
          Toast.show('Failed to cancel download', 'error');
        }
      });
    }
  },

  // Modal popup: Exclude scanlators
  openExcludeScanlatorsModal() {
    let popupContainer = document.getElementById('exclude-scanlators-modal-container');
    if (!popupContainer) {
      popupContainer = document.createElement('div');
      popupContainer.id = 'exclude-scanlators-modal-container';
      document.body.appendChild(popupContainer);
    }

    // Collect distinct scanlators from chapters
    const scanlatorSet = new Set();
    (this.chapters || []).forEach(c => {
      const s = (c.scanlator || '').trim();
      if (s) scanlatorSet.add(s);
    });
    if (scanlatorSet.size === 0) {
      scanlatorSet.add('official');
      scanlatorSet.add('unofficial');
    }
    const scanlatorsList = Array.from(scanlatorSet).sort();

    // Current excluded set
    const currentExcluded = new Set((this.excludedScanlators || []).map(s => s.toLowerCase()));

    popupContainer.innerHTML = `
      <div class="mihon-modal-backdrop" id="exclude-scanlators-backdrop" style="z-index: 1050; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.65);">
        <div class="mihon-modal-dialog" style="width: 100%; max-width: 380px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.6); overflow: hidden;">
          
          <!-- Header -->
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle);">
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600;">Exclude scanlators</h3>
          </div>

          <!-- Body with Checkboxes -->
          <div style="padding: 14px 20px; max-height: 280px; overflow-y: auto;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${scanlatorsList.map(s => {
                const isChecked = currentExcluded.has(s.toLowerCase());
                return `
                  <label class="mihon-option-row" style="cursor: pointer; padding: 10px 12px; display: flex; align-items: center; gap: 12px; border-radius: var(--radius-sm);">
                    <input type="checkbox" class="cb-scanlator-exclude" value="${s}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-primary);" />
                    <span class="mihon-option-text" style="font-size: 0.92rem; text-transform: capitalize;">${s}</span>
                  </label>
                `;
              }).join('')}
            </div>
            <label style="cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: var(--text-secondary); margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-subtle);">
              <input type="checkbox" id="cb-delete-excluded-downloads" style="width: 16px; height: 16px; accent-color: var(--accent-primary);" />
              <span>Delete downloaded chapters for excluded scanlator(s)</span>
            </label>
          </div>

          <!-- Footer with Reset, Cancel, and OK action buttons -->
          <div style="padding: 12px 20px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface-elevated);">
            <button class="btn btn-secondary" id="btn-scanlators-reset" style="padding: 6px 14px; font-size: 0.85rem;">Reset</button>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" id="btn-scanlators-cancel" style="padding: 6px 14px; font-size: 0.85rem;">Cancel</button>
              <button class="btn btn-primary" id="btn-scanlators-ok" style="padding: 6px 18px; font-size: 0.85rem;">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closePopup = () => {
      popupContainer.innerHTML = '';
    };

    // Reset button: unchecks all checkboxes
    const btnReset = popupContainer.querySelector('#btn-scanlators-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        popupContainer.querySelectorAll('.cb-scanlator-exclude').forEach(cb => {
          cb.checked = false;
        });
      });
    }

    // Cancel button: close without saving
    const btnCancel = popupContainer.querySelector('#btn-scanlators-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', closePopup);
    }

    // OK button: save excluded scanlators, re-filter, update UI, close
    const btnOk = popupContainer.querySelector('#btn-scanlators-ok');
    if (btnOk) {
      btnOk.addEventListener('click', async () => {
        const checkedValues = [];
        popupContainer.querySelectorAll('.cb-scanlator-exclude:checked').forEach(cb => {
          checkedValues.push(cb.value);
        });

        const deleteCb = popupContainer.querySelector('#cb-delete-excluded-downloads');
        const shouldDelete = deleteCb && deleteCb.checked;

        this.excludedScanlators = checkedValues;
        this.saveSettings(this.manga.id);
        this.renderChapterRows();
        this.updateResumeButton();

        // Update status text on the Scanlator row in chapter options modal if open
        const statusSpan = document.getElementById('scanlator-status-text');
        if (statusSpan) {
          statusSpan.textContent = checkedValues.length > 0 ? `${checkedValues.length} excluded` : 'All included';
        }

        closePopup();

        if (shouldDelete && checkedValues.length > 0 && this.manga && this.manga.id) {
          for (const scan of checkedValues) {
            try {
              const res = await API.deleteDownloadsByScanlator(this.manga.id, scan);
              if (res && res.deleted_count > 0) {
                Toast.show(`Deleted ${res.deleted_count} downloaded chapter(s) for ${scan}`, 'info');
              }
            } catch (err) {
              console.error('Failed to delete downloads for scanlator:', err);
            }
          }
          await this.loadDownloads();
          this.renderChapterRows();
        }
      });
    }

    // Backdrop click
    const backdrop = popupContainer.querySelector('#exclude-scanlators-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closePopup();
        }
      });
    }
  },

  getFilteredChapters() {
    let chs = [...(this.chapters || [])];

    // 1. Text Search Filter
    if (this.filterQuery) {
      chs = chs.filter(c => (c.title || '').toLowerCase().includes(this.filterQuery));
    }

    // 2. Downloaded Filter
    if (this.filterDownloaded) {
      chs = chs.filter(c => this.isChapterDownloaded(c));
    }

    // 3. Unread Filter
    if (this.filterUnread) {
      chs = chs.filter(c => !(this.progressMap[c.id]?.is_read ?? c.is_read));
    }

    // 4. Bookmarked Filter
    if (this.filterBookmarked) {
      chs = chs.filter(c => !!(this.progressMap[c.id]?.is_bookmarked ?? c.is_bookmarked));
    }

    // 5. Excluded Scanlators Filter
    if (this.excludedScanlators && this.excludedScanlators.length > 0) {
      const excluded = new Set(this.excludedScanlators.map(s => s.toLowerCase().trim()));
      chs = chs.filter(c => {
        const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
        return !excluded.has(scan);
      });
    }

    return chs;
  },

  renderChapterRows() {
    const wrap = document.getElementById('chapter-list-wrap');
    const titleCountEl = document.getElementById('chapters-title-count');
    if (!wrap) return;

    const prevScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    let chs = this.getFilteredChapters();
    if (this.manga && this.manga.id) {
      try {
        localStorage.setItem(`mihon_chapter_filtered_count_${this.manga.id}`, chs.length);
      } catch (e) {}
    }

    // Sorting
    chs.sort((a, b) => {
      let comparison = 0;
      if (this.sortMode === 'chapter_number') {
        const na = this.extractChapterNumber(a);
        const nb = this.extractChapterNumber(b);
        comparison = na - nb;
      } else if (this.sortMode === 'upload_date') {
        const getTs = (c) => {
          if (c.date_upload && !isNaN(Number(c.date_upload))) return Number(c.date_upload);
          const raw = c.date_upload || c.publish_at || c.release_date;
          if (!raw) return 0;
          const parsed = Date.parse(raw);
          return isNaN(parsed) ? 0 : parsed;
        };
        comparison = getTs(a) - getTs(b);
      } else if (this.sortMode === 'alphabetical') {
        const ta = a.title || '';
        const tb = b.title || '';
        comparison = ta.localeCompare(tb);
      } else {
        // 'source': Original index order
        const ia = this.chapters.indexOf(a);
        const ib = this.chapters.indexOf(b);
        comparison = ia - ib;
      }
      return this.sortAsc ? comparison : -comparison;
    });

    if (titleCountEl) {
      const effectiveTotal = this.getDisplayChapterCount();
      if (chs.length !== effectiveTotal) {
        titleCountEl.textContent = `${chs.length} / ${effectiveTotal} Chapters`;
      } else {
        titleCountEl.textContent = `${effectiveTotal} Chapters`;
      }
    }

    if (chs.length === 0) {
      if (this.isBackgroundLoading) {
        wrap.innerHTML = `
          <div class="circular-loading-container">
            <div class="circular-spinner"></div>
          </div>
        `;
      } else {
        wrap.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">No matching chapters.</div>`;
      }
      return;
    }

    this.computeChapterDuplicates();

    wrap.innerHTML = chs.map(ch => {
      const isRead = !!(this.progressMap[ch.id]?.is_read ?? ch.is_read);
      const isBookmarked = !!(this.progressMap[ch.id]?.is_bookmarked ?? ch.is_bookmarked);
      const isSelected = this.selectedChapterIds.has(ch.id);
      const isDownloaded = this.isChapterDownloaded(ch);
      const isPendingDl = this.pendingDownloadIds.has(ch.id);
      const isLocal = this.manga.source === 'local';

      let chRawTitle = ch.title || `Chapter ${ch.chapter_number}`;
      let releaseDate = this.formatChapterDate(ch);

      // Strip date from raw title if appended
      const dateRegex = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\b|\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|(?:\b|\d)(?:hours?|days?|months?|years?|mins?|minutes?|weeks?|secs?|seconds?)\s+ago\b|(?:\b|\d)(?:last\s+(?:week|month|year|day)|yesterday|just\s+now)\b/i;
      const dateMatch = chRawTitle.match(dateRegex);
      if (dateMatch) {
        if (!releaseDate) releaseDate = dateMatch[0].trim();
        chRawTitle = chRawTitle.replace(dateMatch[0], '').trim();
      }
      chRawTitle = chRawTitle.replace(/[\s\-\–\—\:]+$/, '').trim() || chRawTitle;

      // Format according to displayMode
      let chDisplayName = chRawTitle;
      if (this.displayMode === 'chapter_number') {
        const num = this.extractChapterNumber(ch);
        chDisplayName = num ? `Chapter ${num}` : chRawTitle;
      }

      const scanlator = (ch.scanlator || '').trim();

      return `
        <div class="chapter-item ${isRead ? 'read' : ''} ${isSelected ? 'selected' : ''}" data-ch-id="${ch.id}">
          <div class="chapter-item-left" style="display: flex; align-items: center; gap: 12px;">
            <input type="checkbox" class="chapter-checkbox" data-ch-id="${ch.id}" ${isSelected ? 'checked' : ''} />
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${isRead ? 'transparent' : 'var(--accent-primary)'}; border: 1px solid var(--accent-primary);"></span>
            <div>
              <div class="chapter-name" style="display: flex; align-items: center; gap: 6px;">
                ${isBookmarked ? `<span class="chapter-bookmark-badge" title="Bookmarked" style="display: inline-flex; align-items: center; color: #fbbf24;">
                  <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: #fbbf24; stroke: #fbbf24; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                  </svg>
                </span>` : ''}
                <span>${chDisplayName}</span>
              </div>
              <div class="chapter-subinfo" style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                ${releaseDate ? `<span class="chapter-release-date">${releaseDate}</span>` : (isLocal ? '<span class="chapter-release-date">Downloaded (CBZ)</span>' : '')}
                ${(releaseDate || isLocal) && scanlator ? '<span class="chapter-subinfo-sep" style="opacity: 0.5;">•</span>' : ''}
                ${scanlator ? `<span class="chapter-scanlator ${scanlator.toLowerCase() === 'official' ? 'official-tag' : 'unofficial-tag'}" style="${scanlator.toLowerCase() === 'official' ? 'color: var(--accent-primary); font-weight: 500;' : ''}">${scanlator}</span>` : ''}
              </div>
            </div>
          </div>

          <div class="chapter-item-actions">
            <!-- Bookmark Button -->
            <button class="btn btn-secondary btn-icon-only btn-bookmark-chapter ${isBookmarked ? 'bookmarked' : ''}" data-ch-id="${ch.id}" title="${isBookmarked ? 'Remove Bookmark' : 'Bookmark Chapter'}">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: ${isBookmarked ? '#fbbf24' : 'none'}; stroke: ${isBookmarked ? '#fbbf24' : 'currentColor'}; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>

            <!-- Download Status Slot -->
            <div class="chapter-dl-action-container" data-ch-id="${ch.id}" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
              ${this.renderDownloadIndicator(ch.id, isDownloaded, isLocal)}
            </div>

            <!-- Read Status Toggle -->
            <button class="btn btn-secondary btn-icon-only btn-toggle-read ${isRead ? 'is-read' : ''}" data-ch-id="${ch.id}" title="${isRead ? 'Mark as unread' : 'Mark as read'}">
              ${isRead ? `
                <svg viewBox="0 0 24 24" class="nav-icon" style="width: 16px; height: 16px; stroke: var(--accent-primary); fill: none; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ` : `
                <svg viewBox="0 0 24 24" class="nav-icon" style="width: 16px; height: 16px; stroke: var(--text-muted); fill: none; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              `}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Event Delegation (Mihon RecyclerView pattern: 1 listener on container instead of 5,000 per-row listeners)
    if (!wrap.getAttribute('data-delegated')) {
      wrap.setAttribute('data-delegated', 'true');

      let pressTimer = null;
      let isLongPressed = false;
      let touchStartX = 0;
      let touchStartY = 0;

      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      wrap.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.chapter-item');
        if (!item || e.target.closest('button') || e.target.closest('input') || e.target.closest('.chapter-dl-action-container')) return;
        isLongPressed = false;
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
        pressTimer = setTimeout(() => {
          isLongPressed = true;
          const allItems = Array.from(wrap.querySelectorAll('.chapter-item'));
          const idx = allItems.indexOf(item);
          this.handleChapterSelect(idx, false, null);
          if (navigator.vibrate) {
            try { navigator.vibrate(50); } catch (err) {}
          }
        }, 450);
      }, { passive: true });

      wrap.addEventListener('touchmove', (e) => {
        if (!pressTimer) return;
        const touch = e.touches && e.touches[0];
        if (touch && (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10)) {
          cancelPress();
        }
      }, { passive: true });

      wrap.addEventListener('touchend', cancelPress);
      wrap.addEventListener('touchcancel', cancelPress);

      wrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const item = e.target.closest('.chapter-item');
        if (!item || e.target.closest('button') || e.target.closest('input') || e.target.closest('.chapter-dl-action-container')) return;
        isLongPressed = false;
        pressTimer = setTimeout(() => {
          isLongPressed = true;
          const allItems = Array.from(wrap.querySelectorAll('.chapter-item'));
          const idx = allItems.indexOf(item);
          this.handleChapterSelect(idx, false, null);
        }, 450);
      });

      wrap.addEventListener('mouseup', cancelPress);
      wrap.addEventListener('mouseleave', cancelPress);

      wrap.addEventListener('click', async (e) => {
        if (isLongPressed) {
          e.preventDefault();
          e.stopPropagation();
          isLongPressed = false;
          return;
        }

        // 1. Checkbox click
        const cb = e.target.closest('.chapter-checkbox');
        if (cb) {
          e.stopPropagation();
          const allCbs = Array.from(wrap.querySelectorAll('.chapter-checkbox'));
          const idx = allCbs.indexOf(cb);
          this.handleChapterSelect(idx, e.shiftKey, cb.checked);
          return;
        }

        // 2. Bookmark button click
        const bmBtn = e.target.closest('.btn-bookmark-chapter');
        if (bmBtn) {
          e.stopPropagation();
          const chId = bmBtn.getAttribute('data-ch-id');
          if (!chId) return;
          const cur = !!(this.progressMap[chId]?.is_bookmarked ?? this.chapters.find(c => c.id === chId)?.is_bookmarked);
          const newBm = cur ? 0 : 1;
          if (!this.progressMap[chId]) this.progressMap[chId] = {};
          this.progressMap[chId].is_bookmarked = newBm;
          try {
            localStorage.setItem(`manga_progress_${this.manga.id}`, JSON.stringify(this.progressMap));
          } catch (err) {}
          bmBtn.classList.toggle('bookmarked', !!newBm);
          bmBtn.title = newBm ? 'Remove Bookmark' : 'Bookmark Chapter';
          const svg = bmBtn.querySelector('svg');
          if (svg) {
            svg.style.fill = newBm ? '#fbbf24' : 'none';
            svg.style.stroke = newBm ? '#fbbf24' : 'currentColor';
          }
          const row = bmBtn.closest('.chapter-item');
          if (row) {
            const nameEl = row.querySelector('.chapter-name');
            if (nameEl) {
              let bmBadge = nameEl.querySelector('.chapter-bookmark-badge');
              if (newBm && !bmBadge) {
                const badgeSpan = document.createElement('span');
                badgeSpan.className = 'chapter-bookmark-badge';
                badgeSpan.style.display = 'inline-flex';
                badgeSpan.style.alignItems = 'center';
                badgeSpan.style.color = '#fbbf24';
                badgeSpan.title = 'Bookmarked';
                badgeSpan.innerHTML = `<svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: #fbbf24; stroke: #fbbf24; stroke-width: 2;" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
                nameEl.prepend(badgeSpan);
              } else if (!newBm && bmBadge) {
                bmBadge.remove();
              }
            }
          }
          Toast.show(newBm ? 'Chapter bookmarked' : 'Bookmark removed', 'info');
          API.saveProgress({ manga_id: this.manga.id, chapter_id: chId, is_bookmarked: newBm }).catch(() => {});
          return;
        }

        // 3. Toggle read button click
        const readBtn = e.target.closest('.btn-toggle-read');
        if (readBtn) {
          e.stopPropagation();
          const chId = readBtn.getAttribute('data-ch-id');
          if (!chId) return;
          const ch = (this.chapters || []).find(c => c.id === chId) || { id: chId };
          const chNum = this.extractChapterNumber(ch);
          const isRead = !!(this.progressMap[chId]?.is_read ?? ch.is_read);
          const newRead = isRead ? 0 : 1;
          if (!this.progressMap[chId]) this.progressMap[chId] = {};
          this.progressMap[chId].is_read = newRead;
          if (this.chapters && chNum > 0) {
            this.chapters.forEach(c => {
              if (this.extractChapterNumber(c) === chNum) {
                if (!this.progressMap[c.id]) this.progressMap[c.id] = {};
                this.progressMap[c.id].is_read = newRead;
              }
            });
          }
          try {
            localStorage.setItem(`manga_progress_${this.manga.id}`, JSON.stringify(this.progressMap));
          } catch (err) {}
          this.renderChapterRows();
          this.updateResumeButton();
          Toast.show(newRead ? 'Marked as read' : 'Marked as unread', 'info');
          API.saveProgress({ manga_id: this.manga.id, chapter_id: chId, is_read: newRead, force_is_read: true }).catch(() => {});
          return;
        }

        // 4. Download action container click
        const dlContainer = e.target.closest('.chapter-dl-action-container');
        if (dlContainer) {
          e.stopPropagation();
          const chId = dlContainer.getAttribute('data-ch-id');
          if (!chId) return;

          const dlBtn = e.target.closest('.btn-download-chapter');
          if (dlBtn) {
            const ch = (this.chapters || []).find(c => c.id === chId);
            if (ch) {
              this.pendingDownloadIds.add(ch.id);
              this.updateChapterDownloadUI(ch.id, false, { status: 'pending' });
              this.startDownloadPolling();
              try {
                await API.queueDownload({
                  manga_id: this.manga.id,
                  manga_title: this.manga.title,
                  chapter_id: ch.id,
                  chapter_number: this.extractChapterNumber(ch),
                  chapter_title: ch.title,
                  source: this.manga.source,
                  scanlator: ch.scanlator || '',
                  cover_url: this.manga.cover_url || '',
                  to_top: true
                });
                Toast.show(`Queued ${ch.title || 'chapter'} to download first`, 'success');
              } catch (err) {
                this.pendingDownloadIds.delete(ch.id);
                this.updateChapterDownloadUI(ch.id, false, null);
                Toast.show('Failed to queue download', 'error');
              }
            }
            return;
          }

          const dlIndicator = e.target.closest('.chapter-downloaded-indicator');
          if (dlIndicator) {
            if (this.manga.source !== 'local') {
              this.openDownloadedChapterMenu(chId, wrap);
            }
            return;
          }

          const isQueuedOrDownloading = this.pendingDownloadIds.has(chId) ||
            (this.downloadTasksMap[chId] && ['downloading', 'pending'].includes(this.downloadTasksMap[chId].status));
          if (isQueuedOrDownloading) {
            this.openChapterDownloadModal(chId, wrap);
          }
          return;
        }

        // 5. Row item click (open reader or toggle selection)
        const item = e.target.closest('.chapter-item');
        if (item) {
          const allItems = Array.from(wrap.querySelectorAll('.chapter-item'));
          const idx = allItems.indexOf(item);
          if (e.shiftKey || (this.selectedChapterIds && this.selectedChapterIds.size > 0)) {
            e.preventDefault();
            this.handleChapterSelect(idx, e.shiftKey, null);
            return;
          }
          const chId = item.getAttribute('data-ch-id');
          const chObj = (this.chapters || []).find(c => c.id === chId);
          if (chObj) {
            const savedPage = this.progressMap[chId]?.page_index || 1;
            Router.navigate(`read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(chObj.id)}${savedPage > 1 ? '?page=' + savedPage : ''}`);
          }
        }
      });
    }

    this.updateBulkToolbar();

    if (prevScrollY > 0) {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }
  },

  renderChapterListSkeletonHtml() {
    return `
      <div class="circular-loading-container">
        <div class="circular-spinner"></div>
      </div>
    `;
  },

  async refreshFromSource() {
    if (!this.manga || !this.manga.source) return;
    const source = this.manga.source;
    const mangaId = this.manga.id;
    const refreshBtn = document.getElementById('btn-chapter-refresh');
    if (refreshBtn) refreshBtn.classList.add('loading-spin');
    Toast.show('Checking for updates from source...', 'info');
    try {
      const [mDetails, mChapters] = await Promise.all([
        API.getMangaDetails(source, mangaId, true),
        API.getMangaChapters(source, mangaId, true)
      ]);
      this.manga = mDetails;
      this.chapters = mChapters || [];
      this.computeChapterDuplicates();
      const container = document.getElementById('view-manga_detail') || document.getElementById('view-manga-detail');
      if (container) {
        this.renderContent(container);
      }
      sessionStorage.setItem('manga_last_sync_' + mangaId, String(Date.now()));
      Toast.show(`Updated: ${this.getDisplayChapterCount()} chapters found`, 'success');
    } catch (e) {
      Toast.show('Failed to refresh: ' + e.message, 'error');
    } finally {
      const btn = document.getElementById('btn-chapter-refresh');
      if (btn) btn.classList.remove('loading-spin');
    }
  }
};
