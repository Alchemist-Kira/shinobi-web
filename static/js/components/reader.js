// Webtoon & Manhwa Infinite Scroll Reader Component
const ReaderView = {
  manga: null,
  chapter: null,
  sortedChapters: [],
  loadedChapters: [],
  loadedChapterIds: new Set(),
  chapterPages: {}, // chId -> array of page URLs
  
  currentPage: 1,
  totalPages: 1,
  controlsVisible: true,
  isUsingSlider: false,
  lastScrollTop: 0,
  isLoadingNext: false,
  isLoadingPrev: false,

  showControls() {
    this.controlsVisible = true;
    const header = document.getElementById('reader-header');
    const bar = document.getElementById('reader-floating-bar');
    if (header) header.classList.remove('hidden');
    if (bar) bar.classList.remove('hidden');
  },

  hideControls() {
    if (this.isUsingSlider) return;
    this.controlsVisible = false;
    const header = document.getElementById('reader-header');
    const bar = document.getElementById('reader-floating-bar');
    if (header) header.classList.add('hidden');
    if (bar) bar.classList.add('hidden');
  },

  toggleControls() {
    const bar = document.getElementById('reader-floating-bar');
    const isHidden = !bar || bar.classList.contains('hidden');
    if (isHidden) {
      this.showControls();
    } else {
      this.hideControls();
    }
  },
  
  imgObserver: null,
  pageObserver: null,
  sentinelObserver: null,
  topSentinelObserver: null,
  chapterVisibilityObserver: null,

  settings: {
    mode: 'webtoon',   // webtoon, paged
    width: '800',      // 650, 800, 1000, 1200, full or custom px
    bg: 'black'        // black, dark, paper
  },
  readChapterIds: new Set(),

  isChapterRead(chapterId, pageIndex, totalPages) {
    if (this.readChapterIds && this.readChapterIds.has(chapterId)) {
      return 1;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`manga_progress_${this.manga?.id}`) || '{}');
      if (stored[chapterId]?.is_read === 1 || stored[chapterId]?.is_read === true) {
        if (this.readChapterIds) this.readChapterIds.add(chapterId);
        return 1;
      }
    } catch (e) {}
    if (totalPages > 0 && pageIndex >= totalPages) {
      if (this.readChapterIds) this.readChapterIds.add(chapterId);
      return 1;
    }
    return 0;
  },

  getCurrentStripWidth() {
    if (this.settings.width === 'full') return window.innerWidth;
    const num = parseInt(this.settings.width, 10);
    if (!isNaN(num) && num > 0) return num;
    const strip = document.getElementById('webtoon-strip');
    if (strip) {
      const rect = strip.getBoundingClientRect();
      if (rect && rect.width > 0) return Math.round(rect.width);
      const computed = parseInt(window.getComputedStyle(strip).maxWidth, 10);
      if (!isNaN(computed) && computed > 0) return computed;
    }
    return 800;
  },

  setStripWidth(width, updateSlider = true) {
    const strip = document.getElementById('webtoon-strip');
    const pagedImg = document.querySelector('.paged-img');

    if (width === 'full') {
      this.settings.width = 'full';
      if (strip) {
        strip.style.width = '100%';
        strip.style.maxWidth = '100%';
        strip.className = 'webtoon-strip width-full';
      }
      if (pagedImg) {
        pagedImg.style.width = '100%';
        pagedImg.style.maxWidth = '100%';
      }
      this.showWidthHud('Width: Full (100%)');
    } else {
      const maxW = window.innerWidth;
      const px = Math.max(350, Math.min(Math.round(Number(width)), maxW));
      if (px >= maxW - 20) {
        this.settings.width = 'full';
        if (strip) {
          strip.style.width = '100%';
          strip.style.maxWidth = '100%';
          strip.className = 'webtoon-strip width-full';
        }
        if (pagedImg) {
          pagedImg.style.width = '100%';
          pagedImg.style.maxWidth = '100%';
        }
        this.showWidthHud('Width: Full (100%)');
      } else {
        this.settings.width = String(px);
        if (strip) {
          strip.style.width = `${px}px`;
          strip.style.maxWidth = `${px}px`;
          strip.className = 'webtoon-strip';
        }
        if (pagedImg) {
          pagedImg.style.width = `${px}px`;
          pagedImg.style.maxWidth = `${px}px`;
        }
        this.showWidthHud(`Width: ${px}px`);
      }
    }

    if (updateSlider) {
      this.updateStripWidthSliderUI();
    }

    if (this._saveWidthTimer) clearTimeout(this._saveWidthTimer);
    this._saveWidthTimer = setTimeout(() => {
      try {
        localStorage.setItem('mihon_reader_width', this.settings.width);
      } catch (e) {}
      API.saveSettings({ reader_width: this.settings.width }).catch(() => {});
    }, 400);
  },

  updateStripWidthSliderUI() {
    const slider = document.getElementById('slider-strip-width');
    const badge = document.getElementById('strip-width-badge');
    const fullBtn = document.getElementById('btn-width-full');

    const isFull = this.settings.width === 'full';
    const numVal = isFull ? (slider ? parseInt(slider.max, 10) : 2000) : (parseInt(this.settings.width, 10) || 800);

    if (slider) {
      slider.value = numVal;
      const min = parseInt(slider.min, 10) || 400;
      const max = parseInt(slider.max, 10) || 2000;
      const pct = Math.max(0, Math.min(100, Math.round(((numVal - min) / (max - min)) * 100)));
      slider.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`;
    }

    if (badge) {
      badge.textContent = isFull ? 'Full' : `${this.settings.width}px`;
    }

    if (fullBtn) {
      fullBtn.classList.toggle('active', isFull);
    }
  },

  adjustStripWidth(delta) {
    const current = this.getCurrentStripWidth();
    let next = current + delta;
    if (next >= window.innerWidth - 30 && delta > 0) {
      this.setStripWidth('full');
    } else {
      next = Math.max(350, Math.min(next, window.innerWidth));
      this.setStripWidth(next);
    }
  },

  showWidthHud(text) {
    let hud = document.getElementById('reader-width-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'reader-width-hud';
      hud.className = 'reader-width-hud';
      const root = document.getElementById('reader-root') || document.body;
      root.appendChild(hud);
    }
    hud.textContent = text;
    hud.classList.add('visible');
    if (this._hudTimer) clearTimeout(this._hudTimer);
    this._hudTimer = setTimeout(() => {
      hud.classList.remove('visible');
    }, 1200);
  },

  setupWheelZoomListener() {
    if (this._handleWheel) {
      window.removeEventListener('wheel', this._handleWheel, { passive: false, capture: true });
    }
    this._handleWheel = (e) => {
      if (e.ctrlKey) {
        const isReaderActive = document.body.classList.contains('reader-active') ||
          (document.getElementById('reader-modal') && document.getElementById('reader-modal').style.display !== 'none');
        if (isReaderActive) {
          e.preventDefault();
          e.stopPropagation();
          // Scrolling up (negative deltaY) increases strip width; scrolling down decreases width
          const delta = e.deltaY < 0 ? 50 : -50;
          this.adjustStripWidth(delta);
        }
      }
    };
    window.addEventListener('wheel', this._handleWheel, { passive: false, capture: true });
  },

  saveReadingProgressDebounced(chapterId, pageIndex, totalPages) {
    if (this._progressSaveTimer) clearTimeout(this._progressSaveTimer);
    this._progressSaveTimer = setTimeout(() => {
      if (!this.manga) return;
      const ch = this.sortedChapters.find(c => c.id === chapterId) || this.chapter;
      const isRead = this.isChapterRead(chapterId, pageIndex, totalPages);

      // Update local storage progress cache immediately
      // Incognito Mode check: Never record progress or history when incognito is active
      const isIncognito = (typeof State !== 'undefined' && State.incognitoMode) || localStorage.getItem('shinobi_incognito') === 'true';
      if (isIncognito) {
        return;
      }

      try {
        const key = `manga_progress_${this.manga.id}`;
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        const prevRead = (stored[chapterId]?.is_read === 1 || this.readChapterIds?.has(chapterId)) ? 1 : 0;
        const finalIsRead = isRead || prevRead;
        if (finalIsRead && this.readChapterIds) {
          this.readChapterIds.add(chapterId);
        }
        stored[chapterId] = {
          chapter_id: chapterId,
          is_read: finalIsRead,
          is_bookmarked: stored[chapterId]?.is_bookmarked || 0,
          page_index: pageIndex,
          total_pages: totalPages,
          last_read_at: Date.now() / 1000
        };
        localStorage.setItem(key, JSON.stringify(stored));
      } catch (e) {}

      API.saveProgress({
        manga_id: this.manga.id,
        manga_title: this.manga.title || '',
        cover_url: this.manga.cover_url || '',
        source: this.manga.source || 'local',
        chapter_id: chapterId,
        chapter_title: ch?.title || `Chapter ${ch?.chapter_number || ''}`,
        chapter_number: ch?.chapter_number || 0,
        page_index: pageIndex,
        total_pages: totalPages,
        is_read: this.isChapterRead(chapterId, pageIndex, totalPages)
      }).then(() => {
        if (this.isChapterRead(chapterId, pageIndex, totalPages) && typeof MangaDetailView !== 'undefined' && MangaDetailView.syncReadingProgressToTrackers) {
          const chNum = Math.floor(ch?.chapter_number || 0);
          if (chNum > 0) {
            MangaDetailView.syncReadingProgressToTrackers(this.manga.id, chNum);
          }
        }
      }).catch(err => console.warn('Progress save failed:', err));
    }, 400);
  },

  async open(manga, chapter, startPage = 1) {
    this.isReaderOpen = true;
    this.manga = manga;
    this.chapter = chapter;
    this.startPage = parseInt(startPage || 1, 10);

    // Filter and sort chapters strictly respecting active manga preferences (e.g. excluded unofficial scanlators)
    let candidateChapters = [...(State.allChapters || [])];
    if (this.manga && this.manga.id) {
      let excludedScanlators = [];
      let filterScanlator = '';
      if (window.MangaDetailView && window.MangaDetailView.manga?.id === this.manga.id) {
        excludedScanlators = window.MangaDetailView.excludedScanlators || [];
        filterScanlator = window.MangaDetailView.filterScanlator || '';
      }
      if (!excludedScanlators.length) {
        try {
          const rawPref = localStorage.getItem(`mihon_chapter_settings_${this.manga.id}`);
          if (rawPref) {
            const parsed = JSON.parse(rawPref);
            if (Array.isArray(parsed.excludedScanlators)) excludedScanlators = parsed.excludedScanlators;
            if (parsed.filterScanlator) filterScanlator = parsed.filterScanlator;
          }
        } catch (e) {}
      }

      if (excludedScanlators.length > 0) {
        const excludedSet = new Set(excludedScanlators.map(s => (s || '').toLowerCase().trim()));
        candidateChapters = candidateChapters.filter(c => {
          if (c.id === chapter.id) return true;
          const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
          return !excludedSet.has(scan);
        });
      }
      if (filterScanlator) {
        const targetScan = filterScanlator.toLowerCase().trim();
        candidateChapters = candidateChapters.filter(c => {
          if (c.id === chapter.id) return true;
          const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
          return scan === targetScan;
        });
      }

      // Deduplicate chapters by chapter number if duplicate numbers exist (prefer official, but preserve current chapter)
      const seenNums = new Map();
      candidateChapters.forEach(c => {
        const chNum = (c.chapter_number != null && !isNaN(Number(c.chapter_number))) ? Number(c.chapter_number) : null;
        if (chNum === null || c.id === chapter.id) {
          seenNums.set(c.id, c);
        } else if (!seenNums.has(chNum)) {
          seenNums.set(chNum, c);
        } else {
          const existing = seenNums.get(chNum);
          if (existing.id !== chapter.id) {
            const exScan = (existing.scanlator || '').toLowerCase();
            const curScan = (c.scanlator || '').toLowerCase();
            if (!exScan.includes('official') && curScan.includes('official')) {
              seenNums.set(chNum, c);
            }
          }
        }
      });
      candidateChapters = Array.from(seenNums.values());
    }

    // Sort chapters ascending
    this.sortedChapters = candidateChapters.sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0));

    // Persist full manga details and chapters into SQLite cache so read status & details load immediately
    if (this.manga && this.manga.id) {
      API.cacheManga(this.manga.id, {
        manga: this.manga,
        chapters: this.sortedChapters,
        has_read: true
      }).catch(() => {});
    }

    // Initialize read chapters tracking so reading/scrolling an already read chapter NEVER marks it unread
    this.readChapterIds = new Set();
    if (this.sortedChapters) {
      this.sortedChapters.forEach(c => {
        if (c.is_read) this.readChapterIds.add(c.id);
      });
    }
    if (chapter && chapter.is_read) {
      this.readChapterIds.add(chapter.id);
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`manga_progress_${this.manga.id}`) || '{}');
      Object.entries(stored).forEach(([id, p]) => {
        if (p && (p.is_read === 1 || p.is_read === true)) {
          this.readChapterIds.add(id);
        }
      });
    } catch (e) {}
    if (window.MangaDetailView?.progressMap) {
      Object.entries(window.MangaDetailView.progressMap).forEach(([id, p]) => {
        if (p && (p.is_read === 1 || p.is_read === true)) {
          this.readChapterIds.add(id);
        }
      });
    }

    // Reset infinite scroll state
    this.loadedChapters = [];
    this.loadedChapterIds = new Set();
    this.chapterPages = {};
    this.isLoadingNext = false;
    this.isLoadingPrev = false;

    // Load saved settings
    if (State.settings.reader_mode) this.settings.mode = State.settings.reader_mode;
    if (State.settings.reader_width) {
      this.settings.width = State.settings.reader_width;
    } else {
      try {
        const savedW = localStorage.getItem('mihon_reader_width');
        if (savedW) this.settings.width = savedW;
      } catch (e) {}
    }
    if (State.settings.reader_bg) this.settings.bg = State.settings.reader_bg;

    const modal = document.getElementById('reader-modal');
    if (!modal) return;
    document.body.classList.add('reader-active');
    document.documentElement.classList.add('reader-active');
    modal.style.display = 'flex';

    this.renderContainer();
    this.setupWheelZoomListener();

    if (this.settings.mode === 'webtoon') {
      await this.initWebtoonStream(chapter);
    } else {
      await this.initPagedMode(chapter);
    }

    this.triggerDownloadAhead();
  },

  triggerDownloadAhead() {
    if (!this.manga || !this.chapter || this.manga.source === 'local') return;

    let aheadCount = 0;
    try {
      const settingVal = State.settings?.download_ahead || localStorage.getItem('shinobi_download_ahead');
      aheadCount = parseInt(settingVal || '0', 10);
    } catch (e) {
      aheadCount = 0;
    }

    if (aheadCount <= 0) return;

    const curIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
    if (curIdx === -1) return;

    const nextChapters = [];
    for (let i = curIdx + 1; i < this.sortedChapters.length && nextChapters.length < aheadCount; i++) {
      const candidate = this.sortedChapters[i];
      const isRead = this.isChapterRead(candidate.id, 0, 0);
      if (!isRead && !candidate.is_downloaded) {
        nextChapters.push({
          manga_id: this.manga.id,
          manga_title: this.manga.title || '',
          cover_url: this.manga.cover_url || '',
          source: this.manga.source,
          chapter_id: candidate.id,
          chapter_title: candidate.title || `Chapter ${candidate.chapter_number || ''}`,
          chapter_number: candidate.chapter_number || 0,
          scanlator: candidate.scanlator || ''
        });
      }
    }

    if (nextChapters.length > 0) {
      API.queueBulkDownloads(nextChapters).catch(err => {
        console.warn('Download ahead trigger failed:', err);
      });
    }
  },

  close(triggerHistory = true) {
    this.isReaderOpen = false;
    document.body.classList.remove('reader-active');
    document.documentElement.classList.remove('reader-active');
    const modal = document.getElementById('reader-modal');
    if (modal) modal.style.display = 'none';

    // Disconnect observers
    if (this.imgObserver) this.imgObserver.disconnect();
    if (this.pageObserver) this.pageObserver.disconnect();
    if (this.sentinelObserver) this.sentinelObserver.disconnect();
    if (this.topSentinelObserver) this.topSentinelObserver.disconnect();
    if (this.chapterVisibilityObserver) this.chapterVisibilityObserver.disconnect();

    if (this._handleKey) {
      window.removeEventListener('keydown', this._handleKey, true);
    }
    if (this._handleMouseMove) {
      window.removeEventListener('mousemove', this._handleMouseMove);
    }
    if (this._handleWheel) {
      window.removeEventListener('wheel', this._handleWheel, { passive: false, capture: true });
      this._handleWheel = null;
    }

    // Refresh MangaDetailView so read markers remain accurate without requiring page reload
    if (typeof MangaDetailView !== 'undefined' && MangaDetailView.manga && this.manga && MangaDetailView.manga.id === this.manga.id) {
      try {
        const stored = JSON.parse(localStorage.getItem(`manga_progress_${this.manga.id}`) || '{}');
        MangaDetailView.progressMap = { ...(MangaDetailView.progressMap || {}), ...stored };
        MangaDetailView.renderChapterRows();
        MangaDetailView.updateResumeButton();
      } catch (e) {}
    }

    if (triggerHistory && window.location.hash.startsWith('#/read')) {
      if (window.history.length > 1) {
        window.history.back();
      } else if (this.manga) {
        Router.navigate(`manga/${this.manga.source}/${this.manga.id}`);
      } else {
        Router.navigate('library');
      }
    }
  },

  renderContainer() {
    const modal = document.getElementById('reader-modal');
    modal.innerHTML = `
      <div class="reader-container bg-${this.settings.bg}" id="reader-root">
        <!-- Floating Header -->
        <header class="reader-header" id="reader-header">
          <div class="reader-header-left">
            <button id="reader-btn-exit" class="btn btn-secondary btn-icon-only" title="Exit (Esc)">
              <svg viewBox="0 0 24 24" class="nav-icon" style="width: 18px; height: 18px;">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="reader-titles">
              <div class="reader-title-row">
                <span class="reader-manga-title">${this.manga.title}</span>
                ${((typeof State !== 'undefined' && State.incognitoMode) || localStorage.getItem('shinobi_incognito') === 'true') ? `
                  <span class="incognito-reader-tag" title="Incognito mode active: Reading progress and history will not be saved">
                    <svg viewBox="0 0 24 24" style="width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 2.2; margin-right: 4px;">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    INCOGNITO
                  </span>
                ` : ''}
              </div>
              <span class="reader-chapter-title" id="reader-header-ch-title">${this.chapter.title || ('Chapter ' + this.chapter.chapter_number)}</span>
            </div>
          </div>

          <div class="reader-header-right">
            <select id="reader-chapter-select" class="chapter-select"></select>

            <button id="reader-btn-settings" class="btn btn-secondary btn-icon-only" title="Reader Settings">
              <svg viewBox="0 0 24 24" class="nav-icon" style="width: 18px; height: 18px;">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>

            <button id="reader-btn-fullscreen" class="btn btn-secondary btn-icon-only" title="Toggle Fullscreen (F)">
              <svg viewBox="0 0 24 24" class="nav-icon" style="width: 18px; height: 18px;">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
            </button>
          </div>
        </header>

        <!-- Reader Settings Drawer -->
        <div class="reader-settings-panel" id="reader-settings-panel">
          <div class="reader-settings-title">Reader Settings</div>

          <div class="reader-settings-row">
            <label>Reading Mode</label>
            <div class="btn-group" id="opt-reading-mode">
              <button class="btn-group-item ${this.settings.mode === 'webtoon' ? 'active' : ''}" data-val="webtoon">Webtoon</button>
              <button class="btn-group-item ${this.settings.mode === 'paged' ? 'active' : ''}" data-val="paged">Paged</button>
            </div>
          </div>

          <div class="reader-settings-row">
            <div class="reader-settings-label-row">
              <label for="slider-strip-width">Image Strip Width</label>
              <span class="strip-width-badge" id="strip-width-badge">${this.settings.width === 'full' ? 'Full' : (this.settings.width || '800') + 'px'}</span>
            </div>
            <div class="reader-strip-slider-container">
              <input type="range" 
                     id="slider-strip-width" 
                     class="reader-strip-slider" 
                     min="400" 
                     max="2000" 
                     step="25" 
                     value="${this.settings.width === 'full' ? '2000' : (parseInt(this.settings.width, 10) || 800)}" />
            </div>
            <div class="reader-slider-labels">
              <span class="reader-slider-min">400px</span>
              <div class="reader-slider-quick-actions">
                <button type="button" class="reader-slider-quick-btn" id="btn-width-reset">Default (800px)</button>
                <button type="button" class="reader-slider-quick-btn ${this.settings.width === 'full' ? 'active' : ''}" id="btn-width-full">Full Width</button>
              </div>
            </div>
          </div>

          <div class="reader-settings-row">
            <label>Background Theme</label>
            <div class="btn-group" id="opt-bg-theme">
              <button class="btn-group-item ${this.settings.bg === 'black' ? 'active' : ''}" data-val="black">Black</button>
              <button class="btn-group-item ${this.settings.bg === 'dark' ? 'active' : ''}" data-val="dark">Dark</button>
              <button class="btn-group-item ${this.settings.bg === 'paper' ? 'active' : ''}" data-val="paper">Paper</button>
            </div>
          </div>

          <div class="reader-settings-row">
            <label>Color Filter</label>
            <div class="btn-group" id="opt-color-filter">
              <button class="btn-group-item ${(!this.settings.filter || this.settings.filter === 'none') ? 'active' : ''}" data-val="none">Normal</button>
              <button class="btn-group-item ${this.settings.filter === 'inverted' ? 'active' : ''}" data-val="inverted">Inverted</button>
              <button class="btn-group-item ${this.settings.filter === 'grayscale' ? 'active' : ''}" data-val="grayscale">Grayscale</button>
            </div>
          </div>
        </div>

        <!-- Viewport Area -->
        <div class="reader-viewport mode-${this.settings.mode}" id="reader-viewport">
          <div class="webtoon-strip ${['650', '800', '1000', '1200', '1400', 'full'].includes(this.settings.width) ? 'width-' + this.settings.width : ''}" id="webtoon-strip" style="${this.settings.width === 'full' ? 'width: 100%; max-width: 100%;' : (this.settings.width ? `width: ${this.settings.width}px; max-width: ${this.settings.width}px;` : '')}">
            <div class="reader-chapter-init-loader" id="reader-initial-loading">
              <div class="reader-init-spinner"></div>
              <div class="reader-init-title">Loading ${this.chapter?.title || ('Chapter ' + (this.chapter?.chapter_number || ''))}...</div>
              <div class="reader-init-sub">Connecting to manga source</div>
            </div>
          </div>
        </div>

        <!-- Floating Bottom Mihon Slider Bar -->
        <div class="reader-floating-bar" id="reader-floating-bar">
          <button id="reader-btn-prev-ch" class="reader-circle-btn" title="Previous Chapter">
            <svg viewBox="0 0 24 24" class="slider-btn-icon">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          <div class="reader-slider-pill">
            <span class="slider-page-current" id="slider-page-current">1</span>
            <div class="slider-track-wrap">
              <input type="range" min="1" max="1" value="1" class="mihon-range-slider" id="mihon-range-slider" />
            </div>
            <span class="slider-page-total" id="slider-page-total">1</span>
          </div>

          <button id="reader-btn-next-ch" class="reader-circle-btn" title="Next Chapter">
            <svg viewBox="0 0 24 24" class="slider-btn-icon">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Populate Chapter Selector
    const select = document.getElementById('reader-chapter-select');
    select.innerHTML = this.sortedChapters.map(ch => {
      const isSelected = ch.id === this.chapter.id ? 'selected' : '';
      return `<option value="${ch.id}" ${isSelected}>${ch.title || ('Chapter ' + ch.chapter_number)}</option>`;
    }).join('');

    select.addEventListener('change', (e) => {
      const chObj = this.sortedChapters.find(c => c.id === e.target.value);
      if (chObj) {
        Router.navigate(`read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(chObj.id)}`);
      }
    });

    // Exit
    document.getElementById('reader-btn-exit').addEventListener('click', () => this.close());

    // Settings Toggle
    const settingsBtn = document.getElementById('reader-btn-settings');
    const settingsPanel = document.getElementById('reader-settings-panel');
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsPanel.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.classList.remove('open');
      }
    });

    // Settings options
    document.querySelectorAll('#opt-reading-mode .btn-group-item').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#opt-reading-mode .btn-group-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        this.settings.mode = b.getAttribute('data-val');
        this.applySettings();
      });
    });

    // Strip width slider & quick buttons
    const widthSlider = document.getElementById('slider-strip-width');
    const widthResetBtn = document.getElementById('btn-width-reset');
    const widthFullBtn = document.getElementById('btn-width-full');

    if (widthSlider) {
      this.updateStripWidthSliderUI();

      widthSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const maxVal = parseInt(e.target.max, 10);
        if (val >= maxVal - 25) {
          this.setStripWidth('full', false);
          const badge = document.getElementById('strip-width-badge');
          if (badge) badge.textContent = 'Full';
          if (widthFullBtn) widthFullBtn.classList.add('active');
        } else {
          this.setStripWidth(val, false);
          const badge = document.getElementById('strip-width-badge');
          if (badge) badge.textContent = `${val}px`;
          if (widthFullBtn) widthFullBtn.classList.remove('active');
        }
        const min = parseInt(widthSlider.min, 10) || 400;
        const max = parseInt(widthSlider.max, 10) || 2000;
        const pct = Math.max(0, Math.min(100, Math.round(((val - min) / (max - min)) * 100)));
        widthSlider.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${pct}%, rgba(255, 255, 255, 0.12) ${pct}%, rgba(255, 255, 255, 0.12) 100%)`;
      });
    }

    if (widthResetBtn) {
      widthResetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setStripWidth(800);
      });
    }

    if (widthFullBtn) {
      widthFullBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setStripWidth('full');
      });
    }

    document.querySelectorAll('#opt-bg-theme .btn-group-item').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#opt-bg-theme .btn-group-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        this.settings.bg = b.getAttribute('data-val');
        this.applySettings();
      });
    });

    document.querySelectorAll('#opt-color-filter .btn-group-item').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#opt-color-filter .btn-group-item').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const fVal = b.getAttribute('data-val');
        this.settings.filter = fVal;
        localStorage.setItem('mihon_reader_filter', fVal);
        const root = document.getElementById('reader-root');
        if (root) {
          root.classList.remove('filter-none', 'filter-inverted', 'filter-grayscale');
          if (fVal && fVal !== 'none') root.classList.add(`filter-${fVal}`);
        }
      });
    });

    // Fullscreen
    document.getElementById('reader-btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Previous / Next Chapter buttons
    const prevBtn = document.getElementById('reader-btn-prev-ch');
    const nextBtn = document.getElementById('reader-btn-next-ch');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.goToPrevChapter();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.goToNextChapter();
      });
    }

    this.updateChapterNavButtons();

    // Slider scrub listener
    const slider = document.getElementById('mihon-range-slider');
    const curLabel = document.getElementById('slider-page-current');
    const floatingBar = document.getElementById('reader-floating-bar');

    if (floatingBar) {
      floatingBar.addEventListener('click', (e) => e.stopPropagation());
      floatingBar.addEventListener('mousedown', (e) => e.stopPropagation());
      floatingBar.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }

    if (slider) {
      const startSlider = (e) => {
        this.isUsingSlider = true;
        this.showControls();
      };

      const endSlider = () => {
        this.showControls();
        setTimeout(() => {
          this.isUsingSlider = false;
        }, 300);
      };

      slider.addEventListener('pointerdown', startSlider);
      slider.addEventListener('mousedown', startSlider);
      slider.addEventListener('touchstart', startSlider, { passive: true });

      window.addEventListener('pointerup', endSlider);
      window.addEventListener('mouseup', endSlider);
      window.addEventListener('touchend', endSlider);

      slider.addEventListener('input', (e) => {
        this.isUsingSlider = true;
        this.showControls();

        const targetPage = parseInt(e.target.value, 10);
        if (curLabel) curLabel.textContent = targetPage;

        if (this.settings.mode === 'webtoon') {
          const targetEl = document.querySelector(`.webtoon-page-item[data-chapter-id="${this.chapter.id}"][data-index="${targetPage}"]`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
        } else {
          this.currentPage = targetPage;
          this.renderPagedView();
        }
      });

      slider.addEventListener('change', endSlider);
    }

    // Keyboard handlers
    if (this._handleKey) {
      window.removeEventListener('keydown', this._handleKey, true);
    }
    this._handleKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === '0') {
          this.setStripWidth(800);
        } else if (e.key === '=' || e.key === '+') {
          this.adjustStripWidth(50);
        } else if (e.key === '-' || e.key === '_') {
          this.adjustStripWidth(-50);
        }
        return;
      }
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        this.toggleControls();
      } else if (e.key === ' ' || e.key === 'j' || e.key === 'ArrowDown') {
        const vp = document.getElementById('reader-viewport');
        if (vp) vp.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
        this.hideControls();
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const vp = document.getElementById('reader-viewport');
        if (vp) vp.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
        this.hideControls();
      }
    };
    window.addEventListener('keydown', this._handleKey, true);

    // Mouse movement near top or bottom screen edge reveals controls
    if (this._handleMouseMove) {
      window.removeEventListener('mousemove', this._handleMouseMove);
    }
    this._handleMouseMove = (e) => {
      if (e.clientY > window.innerHeight - 150 || e.clientY < 80) {
        this.showControls();
      }
    };
    window.addEventListener('mousemove', this._handleMouseMove);

    // Tap or Left-Click anywhere on reader canvas to toggle controls
    const root = document.getElementById('reader-root');
    if (root) {
      // 1. Direct standard click for desktop mouse interaction
      root.addEventListener('click', (e) => {
        if (this.isUsingSlider) return;
        if (e.target.closest('#reader-header') ||
            e.target.closest('#reader-floating-bar') ||
            e.target.closest('#reader-settings-panel') ||
            e.target.closest('button') ||
            e.target.closest('select') ||
            e.target.closest('input')) {
          return;
        }
        this.toggleControls();
      });



      // 3. Touch tap detection for mobile/tablets
      let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
      root.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      }, { passive: true });

      root.addEventListener('touchend', (e) => {
        if (this.isUsingSlider) return;
        if (e.changedTouches && e.changedTouches[0]) {
          const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
          const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
          const duration = Date.now() - touchStartTime;
          if (dx < 15 && dy < 15 && duration < 450) {
            if (e.target.closest('#reader-header') ||
                e.target.closest('#reader-floating-bar') ||
                e.target.closest('#reader-settings-panel') ||
                e.target.closest('button') ||
                e.target.closest('select') ||
                e.target.closest('input')) {
              return;
            }
            this.toggleControls();
          }
        }
      });
    }
  },

  applySettings() {
    const root = document.getElementById('reader-root');
    const viewport = document.getElementById('reader-viewport');
    if (root) {
      root.className = `reader-container bg-${this.settings.bg}`;
    }
    if (viewport) {
      viewport.className = `reader-viewport mode-${this.settings.mode}`;
      const strip = viewport.querySelector('.webtoon-strip');
      if (strip) {
        if (this.settings.width === 'full') {
          strip.style.width = '100%';
          strip.style.maxWidth = '100%';
          strip.className = 'webtoon-strip width-full';
        } else {
          const num = parseInt(this.settings.width, 10);
          if (!isNaN(num) && num > 0) {
            strip.style.width = `${num}px`;
            strip.style.maxWidth = `${num}px`;
            strip.className = 'webtoon-strip';
          } else {
            strip.style.width = '';
            strip.style.maxWidth = '';
            strip.className = `webtoon-strip width-${this.settings.width}`;
          }
        }
      }
    }
    API.saveSettings({
      reader_mode: this.settings.mode,
      reader_width: this.settings.width,
      reader_bg: this.settings.bg
    });

    if (this.settings.mode === 'paged') {
      this.initPagedMode(this.chapter);
    }
  },

  // ----------------- INFINITE WEBTOON STREAM -----------------

  async initWebtoonStream(startChapter) {
    const strip = document.getElementById('webtoon-strip');
    const viewport = document.getElementById('reader-viewport');
    if (!strip || !viewport) return;

    strip.innerHTML = `
      <div class="reader-chapter-init-loader" id="reader-initial-loading">
        <div class="reader-init-spinner"></div>
        <div class="reader-init-title">Loading ${startChapter.title || ('Chapter ' + startChapter.chapter_number)}...</div>
        <div class="reader-init-sub">Connecting to manga source</div>
      </div>
    `;

    // Create Observers
    this.setupObservers(viewport);

    // Top Sentinel for loading previous chapters when scrolling up
    const topSentinel = document.createElement('div');
    topSentinel.className = 'infinite-scroll-top-sentinel';
    topSentinel.id = 'infinite-scroll-top-sentinel';
    topSentinel.style.height = '4px';
    topSentinel.style.width = '100%';
    strip.appendChild(topSentinel);

    // Append Bottom Sentinel & Loading elements
    const sentinel = document.createElement('div');
    sentinel.className = 'infinite-scroll-sentinel';
    sentinel.id = 'infinite-scroll-sentinel';

    const loader = document.createElement('div');
    loader.className = 'infinite-scroll-loading';
    loader.id = 'infinite-scroll-loading';
    loader.style.display = 'none';
    loader.innerHTML = `
      <div class="infinite-scroll-spinner"></div>
      <span>Loading next chapter...</span>
    `;

    strip.appendChild(sentinel);
    strip.appendChild(loader);

    // Setup Top Sentinel Observer for auto-loading previous chapters on scroll up
    if (this.topSentinelObserver) this.topSentinelObserver.disconnect();
    this.topSentinelObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isLoadingPrev) {
          this.loadPrevChapter();
        }
      });
    }, { root: viewport, rootMargin: '800px 0px' });

    this.topSentinelObserver.observe(topSentinel);

    // Setup Bottom Sentinel Observer for auto-loading next chapters
    if (this.sentinelObserver) this.sentinelObserver.disconnect();
    this.sentinelObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.isLoadingNext) {
          this.loadNextChapter();
        }
      });
    }, { root: viewport, rootMargin: '1400px 0px' });

    this.sentinelObserver.observe(sentinel);

    // Setup scroll hide/show controls & position tracking
    this.setupScrollListener(viewport);

    // Load initial chapter
    await this.appendChapterToStrip(startChapter, false);
  },

  setupObservers(viewport) {
    // 1. Lazy load image observer
    if (this.imgObserver) this.imgObserver.disconnect();
    this.imgObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          observer.unobserve(item);
          const img = item.querySelector('.webtoon-page-img, .paged-img');
          const src = img ? img.getAttribute('data-src') : null;
          const pageNum = parseInt(item.getAttribute('data-index') || '1', 10);
          const totalPages = parseInt(item.getAttribute('data-chapter-total') || '1', 10);
          if (img && src) {
            this.loadPageImage(item, img, src, pageNum, totalPages);
          }
        }
      });
    }, { root: viewport, rootMargin: '800px 0px' });

    // 2. Page & Chapter position observer
    if (this.pageObserver) this.pageObserver.disconnect();
    this.pageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const chId = entry.target.getAttribute('data-chapter-id');
          const pageIndex = parseInt(entry.target.getAttribute('data-index') || '1', 10);
          const chTotal = parseInt(entry.target.getAttribute('data-chapter-total') || '1', 10);

          if (chId && chId !== this.chapter.id) {
            this.onActiveChapterChanged(chId);
          }

          if (!this.isUsingSlider) {
            this.currentPage = pageIndex;
            this.totalPages = chTotal;

            const curLabel = document.getElementById('slider-page-current');
            const totLabel = document.getElementById('slider-page-total');
            const slider = document.getElementById('mihon-range-slider');

            if (curLabel) curLabel.textContent = pageIndex;
            if (totLabel) totLabel.textContent = chTotal;
            if (slider) {
              slider.max = chTotal;
              slider.value = pageIndex;
            }

            // Real-time debounced progress save with page position
            this.saveReadingProgressDebounced(chId, pageIndex, chTotal);
          }
        }
      });
    }, { root: viewport, threshold: 0.15 });
  },

  createPageElement(url, idx, totalPages, chapterId) {
    const pageNum = idx + 1;
    const item = document.createElement('div');
    item.className = 'webtoon-page-item';
    item.setAttribute('data-chapter-id', chapterId);
    item.setAttribute('data-index', pageNum);
    item.setAttribute('data-chapter-total', totalPages);

    item.innerHTML = `
      <div class="page-loading-container" id="page-loader-${chapterId}-${pageNum}">
        <div class="page-loading-spinner-ring indeterminate">
          <svg class="page-spinner-svg" viewBox="0 0 52 52">
            <circle class="page-spinner-bg" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
            <circle class="page-spinner-circle" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
          </svg>
        </div>
        <div class="page-loading-info">
          <span class="page-loading-number">Page ${pageNum} / ${totalPages}</span>
          <span class="page-loading-status" id="page-status-${chapterId}-${pageNum}">Connecting...</span>
        </div>
      </div>
      <img class="webtoon-page-img" data-src="${url}" alt="Page ${pageNum}" />
    `;

    return item;
  },

  async loadPageImage(item, img, url, pageNum, totalPages) {
    if (!item || !img || !url) return false;
    if (item.dataset.loadingState === 'done') return true;
    if (item.dataset.loadingState === 'loading') {
      return item._loadPromise || Promise.resolve(false);
    }
    item.dataset.loadingState = 'loading';

    const loader = item.querySelector('.page-loading-container');
    const ring = item.querySelector('.page-loading-spinner-ring');
    const circle = item.querySelector('.page-spinner-circle');
    const statusEl = item.querySelector('.page-loading-status');

    item._loadPromise = new Promise(async (resolve) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        if (totalBytes > 0 && ring) {
          ring.classList.remove('indeterminate');
        }

        if (!response.body) {
          this.fallbackDirectLoad(item, img, url, pageNum, totalPages).then(resolve);
          return;
        }

        const reader = response.body.getReader();
        const chunks = [];
        let receivedBytes = 0;
        let lastUpdate = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedBytes += value.length;

          const now = performance.now();
          if (now - lastUpdate > 40) {
            lastUpdate = now;
            if (totalBytes > 0) {
              const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
              const offset = 126 - (126 * pct) / 100;
              if (circle) circle.style.strokeDashoffset = offset;
              const kbLoaded = Math.round(receivedBytes / 1024);
              const kbTotal = Math.round(totalBytes / 1024);
              if (statusEl) statusEl.textContent = `${pct}% (${kbLoaded} / ${kbTotal} KB)`;
            } else {
              const kbLoaded = Math.round(receivedBytes / 1024);
              if (statusEl) statusEl.textContent = `${kbLoaded} KB loaded`;
            }
          }
        }

        // Final completion state
        if (totalBytes > 0 && circle) {
          circle.style.strokeDashoffset = 0;
        }
        if (statusEl) {
          const kbFinal = Math.round(receivedBytes / 1024);
          statusEl.textContent = totalBytes > 0 ? `100% (${kbFinal} KB)` : `${kbFinal} KB loaded`;
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const blob = new Blob(chunks, { type: contentType });
        const objectUrl = URL.createObjectURL(blob);

        img.onload = () => {
          img.classList.add('loaded');
          item.classList.add('has-loaded');
          item.dataset.loadingState = 'done';
          if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
              if (loader.parentNode) loader.remove();
            }, 320);
          }
          resolve(true);
        };

        img.onerror = () => {
          this.fallbackDirectLoad(item, img, url, pageNum, totalPages).then(resolve);
        };

        img.src = objectUrl;

      } catch (err) {
        console.warn(`Streaming fetch failed for page ${pageNum}, trying direct image load:`, err);
        this.fallbackDirectLoad(item, img, url, pageNum, totalPages).then(resolve);
      }
    });

    return item._loadPromise;
  },

  fallbackDirectLoad(item, img, url, pageNum, totalPages) {
    return new Promise((resolve) => {
      const loader = item.querySelector('.page-loading-container');
      const statusEl = item.querySelector('.page-loading-status');
      if (statusEl) statusEl.textContent = 'Loading...';

      img.onload = () => {
        img.classList.add('loaded');
        item.classList.add('has-loaded');
        item.dataset.loadingState = 'done';
        if (loader) {
          loader.classList.add('fade-out');
          setTimeout(() => {
            if (loader.parentNode) loader.remove();
          }, 320);
        }
        resolve(true);
      };

      img.onerror = () => {
        item.dataset.loadingState = 'error';
        if (loader) loader.remove();
        this.showPageError(item, img, url, pageNum, totalPages);
        resolve(false);
      };

      img.src = url;
    });
  },

  async startBackgroundPreloader(chapterId, chContainer, initialPageNum, totalPages) {
    // Background preloader loads pages one by one sequentially
    const order = [];
    for (let p = initialPageNum + 1; p <= totalPages; p++) {
      order.push(p);
    }
    for (let p = initialPageNum - 1; p >= 1; p--) {
      order.push(p);
    }

    for (const pageNum of order) {
      if (!this.isReaderOpen || !this.loadedChapterIds.has(chapterId)) break;

      const item = chContainer.querySelector(`.webtoon-page-item[data-index="${pageNum}"]`);
      if (!item) continue;

      if (item.dataset.loadingState === 'done') continue;
      if (item.dataset.loadingState === 'loading') {
        if (item._loadPromise) await item._loadPromise;
        continue;
      }

      const img = item.querySelector('.webtoon-page-img');
      const src = img?.getAttribute('data-src');
      if (img && src) {
        try {
          await this.loadPageImage(item, img, src, pageNum, totalPages);
        } catch (e) {}
        await new Promise(r => setTimeout(r, 40));
      }
    }
  },

  showPageError(item, img, url, pageNum, totalPages) {
    const oldErr = item.querySelector('.page-error-container');
    if (oldErr) oldErr.remove();

    const errBox = document.createElement('div');
    errBox.className = 'page-error-container';
    errBox.innerHTML = `
      <div class="page-error-icon">!</div>
      <div class="page-error-text">Failed to load Page ${pageNum}</div>
      <button class="page-retry-btn" type="button">Retry Page</button>
    `;

    const retryBtn = errBox.querySelector('.page-retry-btn');
    retryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      errBox.remove();
      item.dataset.loadingState = '';

      const newLoader = document.createElement('div');
      newLoader.className = 'page-loading-container';
      newLoader.innerHTML = `
        <div class="page-loading-spinner-ring indeterminate">
          <svg class="page-spinner-svg" viewBox="0 0 52 52">
            <circle class="page-spinner-bg" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
            <circle class="page-spinner-circle" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
          </svg>
        </div>
        <div class="page-loading-info">
          <span class="page-loading-number">Page ${pageNum} / ${totalPages}</span>
          <span class="page-loading-status">Retrying...</span>
        </div>
      `;
      item.appendChild(newLoader);
      this.loadPageImage(item, img, url, pageNum, totalPages);
    });

    item.appendChild(errBox);
  },

  setupScrollListener(viewport) {
    const root = document.getElementById('reader-root');

    // 1. User mouse wheel on reading canvas: scrolling up or down auto-hides controls
    viewport.addEventListener('wheel', (e) => {
      if (this.isUsingSlider) return;
      if (e.target.closest('#reader-header') || e.target.closest('#reader-floating-bar') || e.target.closest('#reader-settings-panel')) return;

      if (Math.abs(e.deltaY) > 8) {
        this.hideControls();
      }
    }, { passive: true });

    // 2. User touch swipe on reading canvas: swiping up or down auto-hides controls
    let touchStartY = 0;
    viewport.addEventListener('touchstart', (e) => {
      if (e.target.closest('#reader-header') || e.target.closest('#reader-floating-bar') || e.target.closest('#reader-settings-panel')) return;
      if (e.touches && e.touches[0]) {
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (this.isUsingSlider) return;
      if (e.target.closest('#reader-header') || e.target.closest('#reader-floating-bar') || e.target.closest('#reader-settings-panel')) return;

      if (e.touches && e.touches[0]) {
        const delta = Math.abs(touchStartY - e.touches[0].clientY);
        if (delta > 15) {
          this.hideControls();
        }
      }
    }, { passive: true });

  },

  async appendChapterToStrip(chapterObj, showTransition = true) {
    const strip = document.getElementById('webtoon-strip');
    const sentinel = document.getElementById('infinite-scroll-sentinel');
    if (!strip || !sentinel) return;

    if (this.loadedChapterIds.has(chapterObj.id)) return;
    this.loadedChapterIds.add(chapterObj.id);

    try {
      const pages = await API.getChapterPages(this.manga.source, chapterObj.id, this.manga?.id);
      this.chapterPages[chapterObj.id] = pages;
      const totalPages = pages.length;

      // Remove initial chapter loading spinner if present
      const initLoading = document.getElementById('reader-initial-loading');
      if (initLoading) initLoading.remove();

      // If this is a subsequent chapter, insert the Mihon transition divider
      if (showTransition && this.loadedChapters.length > 0) {
        const prevChapter = this.loadedChapters[this.loadedChapters.length - 1];
        const divider = document.createElement('div');
        divider.className = 'mihon-chapter-divider';
        divider.innerHTML = `
          <div class="mihon-divider-section">
            <span class="mihon-divider-label">Finished:</span>
            <div class="mihon-divider-item">
              <svg class="mihon-check-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span class="mihon-divider-ch-title">${prevChapter.title || ('Chapter ' + prevChapter.chapter_number)}</span>
            </div>
          </div>

          <div class="mihon-divider-section">
            <span class="mihon-divider-label">Next:</span>
            <div class="mihon-divider-item">
              <svg class="mihon-check-icon" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span class="mihon-divider-ch-title">${chapterObj.title || ('Chapter ' + chapterObj.chapter_number)}</span>
            </div>
          </div>
        `;
        strip.insertBefore(divider, sentinel);
      }

      // Create chapter container
      const chContainer = document.createElement('div');
      chContainer.className = 'webtoon-chapter-section';
      chContainer.setAttribute('data-chapter-id', chapterObj.id);

      pages.forEach((url, idx) => {
        const item = this.createPageElement(url, idx, totalPages, chapterObj.id);
        chContainer.appendChild(item);

        this.imgObserver.observe(item);
        this.pageObserver.observe(item);
      });

      strip.insertBefore(chContainer, sentinel);
      this.loadedChapters.push(chapterObj);

      const targetIndex = (this.loadedChapters.length === 1 && this.startPage > 1) ? this.startPage : 1;

      // 1. Immediately load the first/target page first
      const initialItem = chContainer.querySelector(`.webtoon-page-item[data-index="${targetIndex}"]`);
      if (initialItem) {
        const initImg = initialItem.querySelector('.webtoon-page-img');
        const initSrc = initImg?.getAttribute('data-src');
        if (initImg && initSrc) {
          this.loadPageImage(initialItem, initImg, initSrc, targetIndex, totalPages);
        }
      }

      // 2. In background, sequentially load other pages one by one before user scrolls to them
      this.startBackgroundPreloader(chapterObj.id, chContainer, targetIndex, totalPages);

      if (this.loadedChapters.length === 1) {
        this.onActiveChapterChanged(chapterObj.id);
        if (this.startPage > 1) {
          const scrollToTarget = () => {
            const targetEl = document.querySelector(`.webtoon-page-item[data-chapter-id="${chapterObj.id}"][data-index="${targetIndex}"]`);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
          };
          setTimeout(scrollToTarget, 80);
          setTimeout(scrollToTarget, 250);
          setTimeout(scrollToTarget, 600);
        }
      }

    } catch (err) {
      console.error(`Failed to load chapter ${chapterObj.id}:`, err);
    }
  },

  async loadNextChapter() {
    if (this.isLoadingNext) return;
    if (this.loadedChapters.length === 0) return;

    const lastLoaded = this.loadedChapters[this.loadedChapters.length - 1];
    const currIndex = this.sortedChapters.findIndex(c => c.id === lastLoaded.id);

    // Check if reached end of series
    if (currIndex === -1 || currIndex >= this.sortedChapters.length - 1) {
      // Show end of series divider
      if (!document.getElementById('end-of-series-divider')) {
        const strip = document.getElementById('webtoon-strip');
        const sentinel = document.getElementById('infinite-scroll-sentinel');
        if (strip && sentinel) {
          const endDiv = document.createElement('div');
          endDiv.id = 'end-of-series-divider';
          endDiv.className = 'mihon-chapter-divider';
          endDiv.innerHTML = `
            <div class="mihon-divider-section">
              <span class="mihon-divider-label">Finished:</span>
              <div class="mihon-divider-item">
                <svg class="mihon-check-icon" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span class="mihon-divider-ch-title">${lastLoaded.title || ('Chapter ' + lastLoaded.chapter_number)}</span>
              </div>
            </div>
            <div class="mihon-divider-end-note">There is no next chapter. You are completely caught up!</div>
          `;
          strip.insertBefore(endDiv, sentinel);
        }
      }
      if (this.sentinelObserver) this.sentinelObserver.disconnect();
      return;
    }

    const nextChapterObj = this.sortedChapters[currIndex + 1];
    this.isLoadingNext = true;

    const loader = document.getElementById('infinite-scroll-loading');
    if (loader) loader.style.display = 'flex';

    await this.appendChapterToStrip(nextChapterObj, true);

    if (loader) loader.style.display = 'none';
    this.isLoadingNext = false;
  },

  onActiveChapterChanged(chapterId) {
    const chObj = this.sortedChapters.find(c => c.id === chapterId);
    if (!chObj) return;

    this.chapter = chObj;

    // Update Header
    const titleEl = document.getElementById('reader-header-ch-title');
    if (titleEl) {
      titleEl.textContent = chObj.title || ('Chapter ' + chObj.chapter_number);
    }

    // Update Selector
    const select = document.getElementById('reader-chapter-select');
    if (select && select.value !== chObj.id) {
      select.value = chObj.id;
    }

    // Update Slider bounds
    const curLabel = document.getElementById('slider-page-current');
    const totLabel = document.getElementById('slider-page-total');
    const slider = document.getElementById('mihon-range-slider');
    const totalPgs = this.chapterPages[chObj.id]?.length || 1;

    const activePage = (chObj.id === this.chapter.id && this.startPage > 1) ? this.startPage : 1;
    this.currentPage = activePage;
    this.totalPages = totalPgs;

    if (totLabel) totLabel.textContent = totalPgs;
    if (slider) {
      slider.max = totalPgs;
      slider.value = activePage;
    }
    if (curLabel) curLabel.textContent = activePage;

    // Save current active progress with metadata (skip if in incognito mode)
    const isIncognitoMode = (typeof State !== 'undefined' && State.incognitoMode) || localStorage.getItem('shinobi_incognito') === 'true';
    if (!isIncognitoMode) {
      API.saveProgress({
        manga_id: this.manga.id,
        manga_title: this.manga.title || '',
        cover_url: this.manga.cover_url || '',
        source: this.manga.source || 'local',
        chapter_id: chObj.id,
        chapter_title: chObj.title || `Chapter ${chObj.chapter_number || ''}`,
        chapter_number: chObj.chapter_number || 0,
        page_index: activePage,
        total_pages: totalPgs,
        is_read: this.isChapterRead(chObj.id, activePage, totalPgs)
      });
    }

    // Update active chapter URL hash without polluting browser history stack
    if (this.manga) {
      const readHash = `#/read/${this.manga.source}/${this.manga.id}/${encodeURIComponent(chObj.id)}`;
      if (window.location.hash !== readHash) {
        history.replaceState(null, '', readHash);
      }
    }

    this.updateChapterNavButtons();
  },

  updateChapterNavButtons() {
    const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
    const prevBtn = document.getElementById('reader-btn-prev-ch');
    const nextBtn = document.getElementById('reader-btn-next-ch');

    if (prevBtn) {
      if (currIdx > 0) {
        prevBtn.style.opacity = '1';
        prevBtn.disabled = false;
        prevBtn.style.pointerEvents = 'auto';
      } else {
        prevBtn.style.opacity = '0.35';
        prevBtn.disabled = true;
        prevBtn.style.pointerEvents = 'none';
      }
    }

    if (nextBtn) {
      if (currIdx < this.sortedChapters.length - 1) {
        nextBtn.style.opacity = '1';
        nextBtn.disabled = false;
        nextBtn.style.pointerEvents = 'auto';
      } else {
        nextBtn.style.opacity = '0.35';
        nextBtn.disabled = true;
        nextBtn.style.pointerEvents = 'none';
      }
    }
  },

  async goToNextChapter() {
    if (this.settings.mode !== 'webtoon') {
      const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
      if (currIdx < this.sortedChapters.length - 1) {
        this.open(this.manga, this.sortedChapters[currIdx + 1]);
      }
      return;
    }

    const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
    if (currIdx >= this.sortedChapters.length - 1) return;

    const nextCh = this.sortedChapters[currIdx + 1];
    let chSection = document.querySelector(`.webtoon-chapter-section[data-chapter-id="${nextCh.id}"]`);

    if (!chSection) {
      await this.appendChapterToStrip(nextCh, true);
      chSection = document.querySelector(`.webtoon-chapter-section[data-chapter-id="${nextCh.id}"]`);
    }

    if (chSection) {
      chSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    this.onActiveChapterChanged(nextCh.id);
  },

  async goToPrevChapter() {
    if (this.settings.mode !== 'webtoon') {
      const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
      if (currIdx > 0) {
        this.open(this.manga, this.sortedChapters[currIdx - 1]);
      }
      return;
    }

    const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
    if (currIdx <= 0) return;

    const prevCh = this.sortedChapters[currIdx - 1];
    let chSection = document.querySelector(`.webtoon-chapter-section[data-chapter-id="${prevCh.id}"]`);

    if (!chSection) {
      await this.prependChapterToStrip(prevCh);
      chSection = document.querySelector(`.webtoon-chapter-section[data-chapter-id="${prevCh.id}"]`);
    }

    if (chSection) {
      chSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    this.onActiveChapterChanged(prevCh.id);
  },

  async loadPrevChapter() {
    if (this.isLoadingPrev) return;
    if (this.loadedChapters.length === 0) return;

    const firstLoaded = this.loadedChapters[0];
    const currIndex = this.sortedChapters.findIndex(c => c.id === firstLoaded.id);

    if (currIndex <= 0) {
      if (this.topSentinelObserver) this.topSentinelObserver.disconnect();
      return;
    }

    const prevChapterObj = this.sortedChapters[currIndex - 1];
    this.isLoadingPrev = true;

    await this.prependChapterToStrip(prevChapterObj);
    this.isLoadingPrev = false;
  },

  async prependChapterToStrip(chapterObj) {
    const strip = document.getElementById('webtoon-strip');
    const viewport = document.getElementById('reader-viewport');
    const topSentinel = document.getElementById('infinite-scroll-top-sentinel');
    if (!strip || !viewport) return;

    if (this.loadedChapterIds.has(chapterObj.id)) return;
    this.loadedChapterIds.add(chapterObj.id);

    try {
      const pages = await API.getChapterPages(this.manga.source, chapterObj.id, this.manga?.id);
      this.chapterPages[chapterObj.id] = pages;
      const totalPages = pages.length;

      // Create chapter container
      const chContainer = document.createElement('div');
      chContainer.className = 'webtoon-chapter-section';
      chContainer.setAttribute('data-chapter-id', chapterObj.id);

      pages.forEach((url, idx) => {
        const item = this.createPageElement(url, idx, totalPages, chapterObj.id);
        chContainer.appendChild(item);

        this.imgObserver.observe(item);
        this.pageObserver.observe(item);
      });

      // Divider between this prepended chapter and the chapter below it
      const nextChapter = this.loadedChapters[0];
      const divider = document.createElement('div');
      divider.className = 'mihon-chapter-divider';
      divider.innerHTML = `
        <div class="mihon-divider-section">
          <span class="mihon-divider-label">Finished:</span>
          <div class="mihon-divider-item">
            <svg class="mihon-check-icon" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span class="mihon-divider-ch-title">${chapterObj.title || ('Chapter ' + chapterObj.chapter_number)}</span>
          </div>
        </div>

        <div class="mihon-divider-section">
          <span class="mihon-divider-label">Next:</span>
          <div class="mihon-divider-item">
            <svg class="mihon-check-icon" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span class="mihon-divider-ch-title">${nextChapter ? (nextChapter.title || ('Chapter ' + nextChapter.chapter_number)) : ''}</span>
          </div>
        </div>
      `;

      // Measure scroll height before prepending
      const oldScrollHeight = viewport.scrollHeight;
      const oldScrollTop = viewport.scrollTop;

      // Insert chContainer and divider right after topSentinel
      if (topSentinel && topSentinel.nextSibling) {
        strip.insertBefore(chContainer, topSentinel.nextSibling);
        strip.insertBefore(divider, chContainer.nextSibling);
      } else {
        strip.prepend(divider);
        strip.prepend(chContainer);
      }

      // Seamless scroll anchoring compensation so reader position does not jump
      const heightDiff = viewport.scrollHeight - oldScrollHeight;
      viewport.scrollTop = oldScrollTop + heightDiff;

      this.loadedChapters.unshift(chapterObj);

    } catch (err) {
      console.error(`Failed to prepend chapter ${chapterObj.id}:`, err);
    }
  },

  // ----------------- PAGED MODE FALLBACK -----------------

  async initPagedMode(chapter) {
    const viewport = document.getElementById('reader-viewport');
    viewport.innerHTML = `
      <div class="reader-chapter-init-loader" id="reader-initial-loading">
        <div class="reader-init-spinner"></div>
        <div class="reader-init-title">Loading ${chapter.title || ('Chapter ' + chapter.chapter_number)}...</div>
        <div class="reader-init-sub">Connecting to manga source</div>
      </div>
    `;

    try {
      const pages = await API.getChapterPages(this.manga.source, chapter.id, this.manga?.id);
      this.pages = pages;
      this.totalPages = pages.length;
      this.currentPage = (this.startPage && this.startPage > 1 && this.startPage <= this.totalPages) ? this.startPage : 1;
      this.renderPagedView();
    } catch (e) {
      console.error(e);
    }
  },

  renderPagedView() {
    const viewport = document.getElementById('reader-viewport');
    if (!viewport) return;

    const pageUrl = this.pages[this.currentPage - 1];
    const pageNum = this.currentPage;
    const totalPages = this.totalPages;

    viewport.innerHTML = `
      <div class="paged-container" id="paged-box" data-index="${pageNum}" data-chapter-total="${totalPages}">
        <div class="page-loading-container" id="paged-loader">
          <div class="page-loading-spinner-ring indeterminate">
            <svg class="page-spinner-svg" viewBox="0 0 52 52">
              <circle class="page-spinner-bg" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
              <circle class="page-spinner-circle" cx="26" cy="26" r="20" fill="none" stroke-width="4"></circle>
            </svg>
          </div>
          <div class="page-loading-info">
            <span class="page-loading-number">Page ${pageNum} / ${totalPages}</span>
            <span class="page-loading-status" id="paged-status">Connecting...</span>
          </div>
        </div>
        <img class="paged-img" data-src="${pageUrl}" alt="Page ${pageNum}" />
      </div>
    `;

    const box = document.getElementById('paged-box');
    const img = box.querySelector('.paged-img');
    if (img && this.settings.width) {
      img.style.maxWidth = this.settings.width === 'full' ? '100%' : `${this.settings.width}px`;
    }
    this.loadPageImage(box, img, pageUrl, pageNum, totalPages);

    const curLabel = document.getElementById('slider-page-current');
    const totLabel = document.getElementById('slider-page-total');
    const slider = document.getElementById('mihon-range-slider');

    if (curLabel) curLabel.textContent = this.currentPage;
    if (totLabel) totLabel.textContent = this.totalPages;
    if (slider) {
      slider.max = this.totalPages;
      slider.value = this.currentPage;
    }

    box.addEventListener('click', (e) => {
      const rect = box.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width * 0.6) {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.renderPagedView();
        } else {
          // Next chapter in paged mode
          const currIdx = this.sortedChapters.findIndex(c => c.id === this.chapter.id);
          if (currIdx < this.sortedChapters.length - 1) {
            this.open(this.manga, this.sortedChapters[currIdx + 1]);
          }
        }
      } else if (x < rect.width * 0.4) {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderPagedView();
        }
      } else {
        this.toggleControls();
      }
    });

    const isIncognitoPaged = (typeof State !== 'undefined' && State.incognitoMode) || localStorage.getItem('shinobi_incognito') === 'true';
    if (!isIncognitoPaged) {
      const ch = this.sortedChapters.find(c => c.id === this.chapter.id) || this.chapter;
      API.saveProgress({
        manga_id: this.manga.id,
        manga_title: this.manga.title || '',
        cover_url: this.manga.cover_url || '',
        source: this.manga.source || 'local',
        chapter_id: this.chapter.id,
        chapter_title: ch?.title || `Chapter ${ch?.chapter_number || ''}`,
        chapter_number: ch?.chapter_number || 0,
        page_index: this.currentPage,
        total_pages: this.totalPages,
        is_read: this.isChapterRead(this.chapter.id, this.currentPage, this.totalPages)
      });
    }
  }
};

window.ReaderView = ReaderView;
