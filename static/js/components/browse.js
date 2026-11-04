// Browse, Sources & Extension Repository View Component
const BrowseView = {
  activeSubTab: 'sources', // 'sources' | 'extensions'
  sourcesViewMode: 'directory', // 'directory' | 'catalog'
  currentSource: 'mangadex',
  
  // Sources Directory State
  sourcesList: [],
  sourceSearchQuery: '',
  sourceLangFilter: 'all',
  pinnedSourceIds: new Set(JSON.parse(localStorage.getItem('mihon_pinned_sources') || '[]')),

  // Mihon Catalog State & Filters
  listing: {
    type: 'popular', // 'popular' | 'latest' | 'search'
    query: ''
  },
  currentFilters: [],
  sourceFiltersDefault: [],
  catalogPage: 1,
  catalogTotalPages: 1,
  isLoadingMore: false,

  // Extension Repository State
  extQuery: '',
  extLang: 'all',
  extStatus: 'all', // 'all' | 'installed' | 'available'
  extSort: 'name', // 'name' | 'installed_first'
  extPage: 1,
  installedPkgs: new Set(),
  availableExtensions: [],

  genresList: [
    'All Genres', 'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 
    'Horror', 'Isekai', 'Martial Arts', 'Mystery', 'Romance', 
    'Sci-Fi', 'Slice of Life', 'Supernatural', 'Thriller'
  ],

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  async render() {
    const container = document.getElementById('view-browse');
    if (!container) return;

    try {
      this.sourcesList = await API.getSources();
    } catch (e) {}

    const sourcesCount = (this.sourcesList || []).length;

    container.innerHTML = `
      <div class="browse-container">
        <!-- Unified Browse Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">Browse</h1>
            </div>

            <div class="lib-toolbar-actions">
              <button class="lib-action-btn" id="btn-manage-repos" type="button" title="Configure Extension Repositories">
                <svg viewBox="0 0 24 24">
                  <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Bottom Row: Navigation Underline Tabs -->
          <div class="lib-tabs-track">
            <button class="lib-nav-tab ${this.activeSubTab === 'sources' ? 'active' : ''}" id="subtab-sources" type="button">
              <span class="lib-tab-label">Sources</span>
              <span class="lib-tab-count" style="display: ${sourcesCount > 0 ? 'inline-block' : 'none'};">${sourcesCount}</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeSubTab === 'globalsearch' ? 'active' : ''}" id="subtab-globalsearch" type="button">
              <span class="lib-tab-label">Global Search</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeSubTab === 'extensions' ? 'active' : ''}" id="subtab-extensions" type="button">
              <span class="lib-tab-label">Extensions</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeSubTab === 'migration' ? 'active' : ''}" id="subtab-migration" type="button">
              <span class="lib-tab-label">Migration</span>
              <span class="lib-tab-count" id="migration-source-count" style="display: none;">0</span>
              <span class="lib-tab-indicator"></span>
            </button>
          </div>
        </header>

        <!-- Content Area -->
        <div class="browse-content-area">
          <!-- SOURCES TAB CONTAINER -->
          <div id="browse-sources-section" style="display: ${this.activeSubTab === 'sources' ? 'block' : 'none'};">
            ${this.sourcesViewMode === 'directory' ? this.renderSourcesDirectoryHtml() : this.renderSourceCatalogHtml()}
          </div>

          <!-- GLOBAL SEARCH TAB CONTAINER -->
          <div id="browse-globalsearch-section" style="display: ${this.activeSubTab === 'globalsearch' ? 'block' : 'none'};">
          </div>

          <!-- MIGRATION TAB CONTAINER -->
          <div id="browse-migration-section" style="display: ${this.activeSubTab === 'migration' ? 'block' : 'none'};">
          </div>

          <!-- EXTENSIONS TAB CONTAINER -->
          <div id="browse-extensions-section" style="display: ${this.activeSubTab === 'extensions' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <input type="text" id="ext-search-input" class="search-input" placeholder="Search 1,400+ extensions (e.g. Asura, Flame, Bato)..." style="width: 300px;" value="${this.extQuery}" />
            
            <select id="ext-status-select" class="catalog-select" style="min-width: 130px;">
              <option value="all" ${this.extStatus === 'all' ? 'selected' : ''}>All Extensions</option>
              <option value="installed" ${this.extStatus === 'installed' ? 'selected' : ''}>Installed Only</option>
              <option value="available" ${this.extStatus === 'available' ? 'selected' : ''}>Available Only</option>
            </select>

            <select id="ext-lang-select" class="catalog-select" style="max-width: 140px;">
              <option value="all" ${this.extLang === 'all' ? 'selected' : ''}>All (English & All)</option>
              <option value="en" ${this.extLang === 'en' ? 'selected' : ''}>English</option>
            </select>

            <button id="ext-search-btn" class="btn btn-primary" style="padding: 6px 14px;">Filter</button>
          </div>

          <div style="display: flex; gap: 8px; align-items: center;">
            <span id="ext-count-badge" style="font-size: 0.82rem; color: var(--text-muted);"></span>
            <button id="btn-refresh-extensions" class="btn btn-secondary" title="Fetch latest from repo">
              Sync Repos
            </button>
          </div>
        </div>

        <div class="extensions-grid" id="extensions-grid">
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
            Loading extension repository...
          </div>
        </div>
      </div>
      </div>
    </div>
    `;

    // Global Sub-tab toggles
    document.getElementById('subtab-sources').addEventListener('click', () => {
      this.activeSubTab = 'sources';
      this.render();
    });

    const globalSubtab = document.getElementById('subtab-globalsearch');
    if (globalSubtab) {
      globalSubtab.addEventListener('click', () => {
        this.activeSubTab = 'globalsearch';
        this.render();
      });
    }

    document.getElementById('subtab-extensions').addEventListener('click', () => {
      this.activeSubTab = 'extensions';
      this.render();
    });

    const migrationSubtab = document.getElementById('subtab-migration');
    if (migrationSubtab) {
      migrationSubtab.addEventListener('click', () => {
        this.activeSubTab = 'migration';
        this.render();
      });
    }

    document.getElementById('btn-manage-repos').addEventListener('click', () => {
      this.openRepoModal();
    });

    // Populate migration badge count in background
    if (typeof MigrationView !== 'undefined' && MigrationView.updateBrowseBadge) {
      MigrationView.init().then(() => {
        if (typeof API.getMigrationSources === 'function') {
          API.getMigrationSources().then(sList => {
            MigrationView.sourcesList = sList || [];
            MigrationView.updateBrowseBadge();
          }).catch(() => {});
        }
      });
    }

    if (this.activeSubTab === 'sources') {
      if (this.sourcesViewMode === 'directory') {
        await this.loadSourcesDirectory();
      } else {
        this.bindCatalogEvents();
        await this.loadCatalog();
      }
    } else if (this.activeSubTab === 'globalsearch') {
      const gContainer = document.getElementById('browse-globalsearch-section');
      if (gContainer && typeof GlobalSearchView !== 'undefined') {
        await GlobalSearchView.render(this.globalSearchQuery || GlobalSearchView.query || '', gContainer);
      }
    } else if (this.activeSubTab === 'migration') {
      const mContainer = document.getElementById('browse-migration-section');
      if (mContainer && typeof MigrationView !== 'undefined') {
        await MigrationView.render(mContainer);
      }
    } else {
      this.bindExtensionsEvents();
      await this.loadExtensions();
    }
  },

  // ----------------- SOURCES DIRECTORY VIEW -----------------

  renderSourcesDirectoryHtml() {
    return `
      <!-- Sources Directory Toolbar -->
      <div class="sources-toolbar-wrap">
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <div style="position: relative; width: 280px;">
            <input type="text" id="source-filter-input" class="search-input" placeholder="Filter installed sources..." style="width: 100%; padding-left: 32px; font-size: 0.84rem;" value="${this.escapeHtml(this.sourceSearchQuery)}" />
            <svg viewBox="0 0 24 24" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; fill: none; stroke: var(--text-muted); stroke-width: 2;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          
          <select id="source-lang-filter" class="catalog-select" style="font-size: 0.82rem; padding: 6px 12px;">
            <option value="all" ${this.sourceLangFilter === 'all' ? 'selected' : ''}>All (English & All)</option>
            <option value="en" ${this.sourceLangFilter === 'en' ? 'selected' : ''}>English Only</option>
            <option value="local" ${this.sourceLangFilter === 'local' ? 'selected' : ''}>Local Only</option>
          </select>

          <button id="btn-trigger-global-search" class="btn btn-secondary" style="font-size: 0.82rem; padding: 6px 14px; display: inline-flex; align-items: center; gap: 6px;" title="Search across all installed sources">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>Global Search</span>
          </button>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <span id="sources-count-label" style="font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono);"></span>
        </div>
      </div>

      <!-- Container: Pinned Sources -->
      <div id="pinned-sources-container" style="display: none; margin-bottom: 26px;">
        <div class="section-label" style="display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: #f59e0b; stroke: #f59e0b;">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>Pinned Sources</span>
        </div>
        <div class="sources-cards-grid" id="pinned-sources-grid"></div>
      </div>

      <!-- Container: All Installed Sources -->
      <div id="all-sources-container">
        <div id="global-search-banner-container"></div>
        <div class="section-label">Installed Catalogs</div>
        <div class="sources-cards-grid" id="all-sources-grid">
          <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: var(--text-muted);">
            Loading installed sources...
          </div>
        </div>
      </div>
    `;
  },

  async loadSourcesDirectory() {
    try {
      this.sourcesList = await API.getSources();
      const sourcesTabBadge = document.querySelector('#subtab-sources .lib-tab-count');
      const count = (this.sourcesList || []).length;
      if (sourcesTabBadge) {
        if (count > 0) {
          sourcesTabBadge.textContent = count;
          sourcesTabBadge.style.display = 'inline-block';
        } else {
          sourcesTabBadge.style.display = 'none';
        }
      }
      this.renderSourcesDirectoryList();

      const searchInput = document.getElementById('source-filter-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.sourceSearchQuery = e.target.value.toLowerCase().trim();
          this.renderSourcesDirectoryList();
        });
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const q = searchInput.value.trim();
            if (q) Router.navigate(`globalsearch/${encodeURIComponent(q)}`);
          }
        });
      }

      const globalBtn = document.getElementById('btn-trigger-global-search');
      if (globalBtn) {
        globalBtn.addEventListener('click', () => {
          const q = this.sourceSearchQuery || '';
          Router.navigate(q ? `globalsearch/${encodeURIComponent(q)}` : 'globalsearch');
        });
      }

      const langSelect = document.getElementById('source-lang-filter');
      if (langSelect) {
        langSelect.addEventListener('change', (e) => {
          this.sourceLangFilter = e.target.value;
          this.renderSourcesDirectoryList();
        });
      }
    } catch (e) {
      console.error('Error loading sources directory:', e);
    }
  },

  groupSources(sources) {
    const groups = new Map();
    for (const s of sources) {
      const isLocal = s.id === 'local' || s.pkg === 'local.storage';
      const sLang = (s.lang || 'all').trim().toLowerCase();

      // Strictly allow English, All, and Local; hide and discard everything else
      if (!isLocal && sLang !== 'en' && sLang !== 'all') {
        continue;
      }

      const extName = isLocal ? 'Local Storage' : (s.base_name || s.name.replace(/\s*\([A-Z0-9-]+\)\s*$/i, '')).trim();
      const key = isLocal ? 'local.storage' : (s.pkg && s.pkg !== '' ? s.pkg : extName.toLowerCase());

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          id: s.id,
          name: extName,
          base_name: s.base_name || extName,
          pkg: s.pkg || key,
          version: s.version || '1.0.0',
          icon_url: s.icon_url,
          isLocal,
          supports_latest: s.supports_latest,
          sources: []
        });
      }
      groups.get(key).sources.push(s);
    }

    const result = [];
    for (const g of groups.values()) {
      g.sources.sort((a, b) => {
        const la = (a.lang || '').trim().toLowerCase();
        const lb = (b.lang || '').trim().toLowerCase();
        if (la === 'all') return -1;
        if (lb === 'all') return 1;
        if (la === 'en') return -1;
        if (lb === 'en') return 1;
        return la.localeCompare(lb);
      });

      let activeSrc = null;
      if (this.sourceLangFilter && this.sourceLangFilter !== 'all') {
        activeSrc = g.sources.find(s => (s.lang || '').toLowerCase() === this.sourceLangFilter.toLowerCase());
      }
      if (!activeSrc) {
        activeSrc = g.sources[0];
      }
      g.activeSource = activeSrc;
      g.activeId = activeSrc ? activeSrc.id : g.id;
      result.push(g);
    }
    return result;
  },

  renderSourcesDirectoryList() {
    const pinnedContainer = document.getElementById('pinned-sources-container');
    const pinnedGrid = document.getElementById('pinned-sources-grid');
    const allGrid = document.getElementById('all-sources-grid');
    const countLabel = document.getElementById('sources-count-label');
    const bannerContainer = document.getElementById('global-search-banner-container');
    if (!allGrid) return;

    // Mihon style search globally prompt
    if (bannerContainer) {
      if (this.sourceSearchQuery) {
        bannerContainer.innerHTML = `
          <div id="btn-search-globally-banner" class="global-search-callout-banner">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: rgba(var(--accent-primary-rgb), 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <div>
                <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">
                  Search <strong>"${this.escapeHtml(this.sourceSearchQuery)}"</strong> across all sources
                </div>
                <div style="font-size: 0.76rem; color: var(--text-muted);">
                  Query all installed extensions simultaneously
                </div>
              </div>
            </div>
            <span class="callout-action-text" style="color: var(--accent-primary); font-size: 0.85rem; font-weight: 600;">Search Globally →</span>
          </div>
        `;
        const banner = document.getElementById('btn-search-globally-banner');
        if (banner) {
          banner.addEventListener('click', () => {
            Router.navigate(`globalsearch/${encodeURIComponent(this.sourceSearchQuery)}`);
          });
        }
      } else {
        bannerContainer.innerHTML = '';
      }
    }

    const allGroups = this.groupSources(this.sourcesList);

    const filtered = allGroups.filter(g => {
      const q = this.sourceSearchQuery;
      const matchQuery = !q || 
        g.name.toLowerCase().includes(q) || 
        g.key.toLowerCase().includes(q) || 
        g.sources.some(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));

      let matchLang = true;
      if (this.sourceLangFilter === 'local') {
        matchLang = g.isLocal;
      } else if (this.sourceLangFilter && this.sourceLangFilter !== 'all') {
        matchLang = g.isLocal || g.sources.some(s => (s.lang || '').toLowerCase() === this.sourceLangFilter.toLowerCase());
      }
      return matchQuery && matchLang;
    });

    const totalCatalogs = filtered.reduce((acc, g) => acc + g.sources.length, 0);
    if (countLabel) {
      countLabel.textContent = `${filtered.length} Extension${filtered.length === 1 ? '' : 's'} (${totalCatalogs} Catalogs)`;
    }

    if (filtered.length === 0) {
      allGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); color: var(--text-muted); margin: 20px 0;">
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
            ${this.sourceSearchQuery ? 'No matching sources found' : 'No sources installed'}
          </div>
          <p style="font-size: 0.88rem; max-width: 440px; margin: 0 auto 16px auto;">
            ${this.sourceSearchQuery ? 'Try adjusting your search filter or clear your query.' : 'Get started by installing extensions from the Extensions tab or adding your local manga folder.'}
          </p>
          ${!this.sourceSearchQuery ? `
            <button id="btn-browse-to-extensions" class="btn btn-primary" style="font-size: 0.85rem; padding: 8px 18px; border-radius: var(--radius-full); font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
              Browse Extensions
            </button>
          ` : ''}
        </div>
      `;
      const toExtBtn = document.getElementById('btn-browse-to-extensions');
      if (toExtBtn) {
        toExtBtn.addEventListener('click', () => {
          const extTabBtn = document.getElementById('subtab-extensions');
          if (extTabBtn) extTabBtn.click();
        });
      }
      if (pinnedContainer) pinnedContainer.style.display = 'none';
      return;
    }

    const pinnedSources = filtered.filter(g => this.pinnedSourceIds.has(g.key) || this.pinnedSourceIds.has(g.activeId));
    const otherSources = filtered.filter(g => !(this.pinnedSourceIds.has(g.key) || this.pinnedSourceIds.has(g.activeId)));

    // Render Pinned section
    if (pinnedSources.length > 0 && pinnedContainer && pinnedGrid) {
      pinnedContainer.style.display = 'block';
      pinnedGrid.innerHTML = pinnedSources.map(g => this.createSourceCardHtml(g, true)).join('');
    } else if (pinnedContainer) {
      pinnedContainer.style.display = 'none';
    }

    // Render All sources
    allGrid.innerHTML = (otherSources.length > 0 ? otherSources : filtered).map(g => this.createSourceCardHtml(g, this.pinnedSourceIds.has(g.key) || this.pinnedSourceIds.has(g.activeId))).join('');

    // Attach event listeners to source cards
    document.querySelectorAll('.source-directory-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.source-pin-btn') || e.target.closest('.btn-uninstall-source') || e.target.closest('.source-lang-pill')) {
          return;
        }
        const srcId = card.getAttribute('data-source');
        if (srcId) {
          this.openSourceCatalog(srcId, 'popular');
        }
      });
    });

    // Language pill click: directly opens that specific language catalog
    document.querySelectorAll('.source-lang-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const srcId = pill.getAttribute('data-source-id');
        if (srcId) {
          this.openSourceCatalog(srcId, 'popular');
        }
      });
    });

    // Uninstall click
    document.querySelectorAll('.btn-uninstall-source').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const pkg = btn.getAttribute('data-pkg');
        const srcName = btn.getAttribute('data-name') || pkg;
        if (!confirm(`Uninstall extension "${srcName}"?`)) return;

        btn.disabled = true;
        try {
          await API.uninstallExtension(pkg);
          this.pinnedSourceIds.delete(pkg);
          localStorage.setItem('mihon_pinned_sources', JSON.stringify(Array.from(this.pinnedSourceIds)));
          if (this.installedPkgs) {
            this.installedPkgs.delete(pkg);
          }
          if (window.Toast) Toast.show(`Uninstalled ${srcName}`, 'info');
          await this.loadSourcesDirectory();
        } catch (err) {
          if (window.Toast) Toast.show(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    // Pin click
    document.querySelectorAll('.source-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-key');
        if (this.pinnedSourceIds.has(key)) {
          this.pinnedSourceIds.delete(key);
        } else {
          this.pinnedSourceIds.add(key);
        }
        localStorage.setItem('mihon_pinned_sources', JSON.stringify(Array.from(this.pinnedSourceIds)));
        this.renderSourcesDirectoryList();
      });
    });
  },

  createSourceCardHtml(group, isPinned) {
    const isLocal = group.isLocal;
    const defaultIcon = isLocal ? '/static/img/ic_local_source.png' : '/static/img/default-cover.png';
    const iconUrl = isLocal ? '/static/img/ic_local_source.png' : (group.icon_url || defaultIcon);
    const activeSrc = group.activeSource || group.sources[0] || group;

    const visibleSources = (group.sources || []).filter(s => {
      const l = (s.lang || 'all').trim().toLowerCase();
      return isLocal || l === 'en' || l === 'all';
    });

    visibleSources.sort((a, b) => {
      const la = (a.lang || '').trim().toLowerCase();
      const lb = (b.lang || '').trim().toLowerCase();
      if (la === 'all') return -1;
      if (lb === 'all') return 1;
      if (la === 'en') return -1;
      if (lb === 'en') return 1;
      return la.localeCompare(lb);
    });

    let langBadgesHtml = '';
    if (isLocal) {
      langBadgesHtml = `<span class="source-lang-badge">LOCAL</span>`;
    } else if (visibleSources.length <= 1) {
      const target = visibleSources[0] || group;
      const l = (target.lang || 'EN').toUpperCase();
      langBadgesHtml = `<span class="source-lang-badge">${l}</span>`;
    } else {
      // Multiple English/All languages available in this extension (e.g. Manga18 has EN & ALL)
      langBadgesHtml = `
        <div class="source-lang-pills-row" style="display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap;">
          ${visibleSources.map(s => {
            const isSelected = s.id === activeSrc.id;
            const l = (s.lang || 'all').toUpperCase();
            return `
              <button 
                type="button" 
                class="source-lang-pill ${isSelected ? 'active' : ''}" 
                data-source-id="${s.id}" 
                title="${this.escapeHtml(s.name)}"
              >
                ${l}
              </button>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="source-directory-card" data-source="${activeSrc.id}" data-pkg="${group.pkg || ''}">
        <div class="source-card-main">
          <div class="source-card-icon-wrap">
            <img src="${iconUrl}" class="source-card-icon" onerror="this.src='${isLocal ? '/static/img/ic_local_source.png' : '/static/img/default-cover.png'}'" alt="${this.escapeHtml(group.name)}" />
          </div>
          <div class="source-card-info">
            <div class="source-card-title">${this.escapeHtml(group.name)}</div>
            <div class="source-card-badges" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 3px;">
              ${langBadgesHtml}
              <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">v${group.version || '1.0.0'}</span>
            </div>
          </div>
          <div class="source-card-tools" style="display: flex; align-items: center; gap: 6px;">
            ${!isLocal ? `
              <button class="source-action-btn btn-uninstall-source" data-pkg="${group.pkg || activeSrc.id}" data-name="${this.escapeHtml(group.name)}" title="Uninstall extension">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
            <button class="source-pin-btn ${isPinned ? 'pinned' : ''}" data-key="${group.key}" title="${isPinned ? 'Unpin Source' : 'Pin to Top'}">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: ${isPinned ? 'currentColor' : 'none'}; stroke: currentColor; stroke-width: 2;">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ----------------- MIHON FILTER & LISTING CORE -----------------

  normalizeFilters(rawFilters) {
    if (!Array.isArray(rawFilters)) return [];
    return rawFilters.map((f, idx) => {
      const type = (f.type || 'text').toLowerCase();
      const id = f.id || `filter_${idx}`;
      const name = f.name || '';

      if (type === 'header') {
        return { type: 'header', name };
      }
      if (type === 'separator') {
        return { type: 'separator', name };
      }
      if (type === 'select') {
        const values = f.values || [];
        const keys = f.keys || values;
        let defState = 0;
        if (typeof f.state === 'number') {
          defState = f.state;
        } else if (f.default !== undefined) {
          const kIdx = keys.indexOf(f.default);
          defState = kIdx !== -1 ? kIdx : 0;
        }
        return {
          type: 'select',
          id,
          name,
          values,
          keys,
          state: defState,
          default: defState
        };
      }
      if (type === 'text') {
        const defState = typeof f.state === 'string' ? f.state : (f.default || '');
        return {
          type: 'text',
          id,
          name,
          placeholder: f.placeholder || '',
          state: defState,
          default: defState
        };
      }
      if (type === 'checkbox') {
        const defState = typeof f.state === 'boolean' ? f.state : !!f.default;
        return {
          type: 'checkbox',
          id,
          name,
          state: defState,
          default: defState
        };
      }
      if (type === 'tristate') {
        const defState = typeof f.state === 'number' ? f.state : (f.default || 0);
        return {
          type: 'tristate',
          id,
          name,
          state: defState,
          default: defState
        };
      }
      if (type === 'sort') {
        const values = f.values || [];
        const keys = f.keys || values;
        const defState = f.state && typeof f.state === 'object' 
          ? { index: f.state.index || 0, ascending: !!f.state.ascending }
          : (f.default && typeof f.default === 'object' ? { index: f.default.index || 0, ascending: !!f.default.ascending } : { index: 0, ascending: false });
        return {
          type: 'sort',
          id,
          name,
          values,
          keys,
          state: { ...defState },
          default: { ...defState }
        };
      }
      if (type === 'group') {
        let childFilters = [];
        if (Array.isArray(f.state) && f.state.length > 0 && typeof f.state[0] === 'object') {
          childFilters = this.normalizeFilters(f.state);
        } else if (Array.isArray(f.items) && f.items.length > 0) {
          // If items are plain strings (e.g. genre names), make them TriState items by default (Mihon standard for genres)
          childFilters = f.items.map(item => {
            if (typeof item === 'object') return item;
            return {
              type: 'tristate',
              id: String(item).toLowerCase().replace(/\s+/g, '-'),
              name: String(item),
              state: 0,
              default: 0
            };
          });
        }
        return {
          type: 'group',
          id,
          name,
          state: childFilters,
          default: childFilters.map(c => ({ ...c }))
        };
      }
      return { type: 'text', id, name, state: '', default: '' };
    });
  },

  cloneFilters(filters) {
    return (filters || []).map(f => {
      if (f.type === 'group' && Array.isArray(f.state)) {
        return { ...f, state: this.cloneFilters(f.state) };
      }
      if (f.type === 'sort' && f.state && typeof f.state === 'object') {
        return { ...f, state: { ...f.state } };
      }
      return { ...f };
    });
  },

  resetFilters() {
    this.currentFilters = this.cloneFilters(this.sourceFiltersDefault);
  },

  countActiveFilters(filters = this.currentFilters) {
    let count = 0;
    (filters || []).forEach(f => {
      if (f.type === 'header' || f.type === 'separator') return;
      if (f.type === 'checkbox') {
        if (f.state !== f.default) count++;
      } else if (f.type === 'tristate') {
        if (f.state !== 0 && f.state !== f.default) count++;
      } else if (f.type === 'select') {
        if (f.state !== f.default) count++;
      } else if (f.type === 'text') {
        if (f.state && f.state.trim() !== (f.default || '').trim()) count++;
      } else if (f.type === 'sort') {
        if (f.state?.index !== f.default?.index || f.state?.ascending !== f.default?.ascending) count++;
      } else if (f.type === 'group' && Array.isArray(f.state)) {
        count += this.countActiveFilters(f.state);
      }
    });
    return count;
  },

  serializeFilters(filters = this.currentFilters) {
    const params = {};
    const genresIn = [];
    const genresEx = [];
    const types = [];
    const statuses = [];

    const processFilter = (f, parentGroup = null) => {
      if (f.type === 'header' || f.type === 'separator') return;

      if (f.type === 'tristate') {
        if (f.state !== (f.default || 0)) {
          if (f.state === 1) {
            genresIn.push(f.id || f.name);
          } else if (f.state === 2) {
            genresEx.push(f.id || f.name);
          }
          params[f.id] = f.state;
        }
      } else if (f.type === 'checkbox') {
        if (f.state !== f.default) {
          if (parentGroup?.id === 'types' || parentGroup?.name?.toLowerCase() === 'type') {
            if (f.state) types.push(f.id || f.name);
          } else if (parentGroup?.id === 'statuses' || parentGroup?.name?.toLowerCase() === 'status') {
            if (f.state) statuses.push(f.id || f.name);
          } else {
            params[f.id] = f.state;
          }
        }
      } else if (f.type === 'select') {
        if (f.state !== f.default) {
          if (f.keys && f.keys[f.state] !== undefined) {
            params[f.id] = f.keys[f.state];
          } else {
            params[f.id] = f.state;
          }
        }
      } else if (f.type === 'text') {
        if (f.state && f.state.trim() && f.state.trim() !== (f.default || '').trim()) {
          params[f.id] = f.state.trim();
        }
      } else if (f.type === 'sort') {
        if (f.state && f.state.index !== undefined) {
          if (f.state.index !== f.default?.index || f.state.ascending !== f.default?.ascending) {
            const key = f.keys ? f.keys[f.state.index] : f.state.index;
            params[f.id] = key;
            params.ascending = !!f.state.ascending;
          }
        }
      } else if (f.type === 'group' && Array.isArray(f.state)) {
        f.state.forEach(child => processFilter(child, f));
      }
    };

    (filters || []).forEach(f => processFilter(f, null));

    if (genresIn.length > 0) {
      params['genres_in[]'] = genresIn;
      params.genre = genresIn.join(',');
      params.genres = genresIn.join(',');
    }
    if (genresEx.length > 0) {
      params['genres_ex[]'] = genresEx;
    }
    if (types.length > 0) {
      params['types[]'] = types;
      params.type = types[0];
    }
    if (statuses.length > 0) {
      params['statuses[]'] = statuses;
      params.status = statuses[0];
    }

    return params;
  },

  async openSourceCatalog(sourceId, mode = 'popular', updateHash = true) {
    if (updateHash) {
      Router.navigate(`source/${sourceId}`);
      return;
    }

    this.currentSource = sourceId;
    this.catalogPage = 1;
    this.sourcesViewMode = 'catalog';

    if (!this.sourcesList || this.sourcesList.length === 0) {
      try {
        this.sourcesList = await API.getSources();
      } catch (e) {
        this.sourcesList = [];
      }
    }

    try {
      const rawFilters = await API.getSourceFilters(sourceId);
      this.sourceFiltersDefault = this.normalizeFilters(rawFilters);
    } catch (e) {
      this.sourceFiltersDefault = [];
    }

    this.currentFilters = this.cloneFilters(this.sourceFiltersDefault);
    this.listing = {
      type: mode || 'popular',
      query: ''
    };

    this.render();
  },

  async searchGenre(genreName, sourceId = null) {
    if (!this.sourcesList || this.sourcesList.length === 0) {
      try {
        this.sourcesList = await API.getSources();
      } catch (e) {}
    }

    if (sourceId && (sourceId !== this.currentSource || this.sourcesViewMode !== 'catalog')) {
      this.currentSource = sourceId;
      this.sourcesViewMode = 'catalog';
      try {
        const raw = await API.getSourceFilters(sourceId);
        this.sourceFiltersDefault = this.normalizeFilters(raw);
      } catch (e) {
        this.sourceFiltersDefault = [];
      }
    } else if (this.sourcesViewMode !== 'catalog') {
      this.sourcesViewMode = 'catalog';
      if (!this.sourceFiltersDefault || this.sourceFiltersDefault.length === 0) {
        try {
          const raw = await API.getSourceFilters(this.currentSource);
          this.sourceFiltersDefault = this.normalizeFilters(raw);
        } catch (e) {}
      }
    }

    this.resetFilters();
    let genreFound = false;
    const target = (genreName || '').trim().toLowerCase();

    for (const f of this.currentFilters) {
      if (f.type === 'group' && Array.isArray(f.state)) {
        for (const child of f.state) {
          const nameMatch = (child.name || '').toLowerCase() === target;
          const idMatch = (child.id || '').toLowerCase() === target;
          if (nameMatch || idMatch) {
            if (child.type === 'tristate') {
              child.state = 1; // Include
              genreFound = true;
              break;
            } else if (child.type === 'checkbox') {
              child.state = true;
              genreFound = true;
              break;
            }
          }
        }
      } else if (f.type === 'tristate') {
        const nameMatch = (f.name || '').toLowerCase() === target;
        const idMatch = (f.id || '').toLowerCase() === target;
        if (nameMatch || idMatch) {
          f.state = 1;
          genreFound = true;
          break;
        }
      } else if (f.type === 'checkbox') {
        const nameMatch = (f.name || '').toLowerCase() === target;
        const idMatch = (f.id || '').toLowerCase() === target;
        if (nameMatch || idMatch) {
          f.state = true;
          genreFound = true;
          break;
        }
      } else if (f.type === 'select') {
        const valIdx = (f.values || []).findIndex(v => (v || '').toLowerCase() === target);
        if (valIdx !== -1) {
          f.state = valIdx;
          genreFound = true;
          break;
        }
      }
      if (genreFound) break;
    }

    if (genreFound) {
      this.listing = { type: 'search', query: '' };
    } else {
      this.listing = { type: 'search', query: genreName };
    }

    this.catalogPage = 1;
    this.render();
  },

  getCurrentSourceName() {
    const cur = (this.sourcesList || []).find(s => String(s.id) === String(this.currentSource));
    return cur ? (cur.displayName || cur.name) : (this.currentSource || 'Source');
  },

  renderCatalogLoadingSkeleton() {
    return `
      <div class="circular-loading-container">
        <div class="circular-spinner"></div>
      </div>
    `;
  },

  // ----------------- SOURCE CATALOG VIEW (WITH MIHON FILTERS) -----------------

  renderSourceCatalogHtml() {
    const current = (this.sourcesList || []).find(s => String(s.id) === String(this.currentSource)) || { name: this.currentSource, icon_url: '', supports_latest: true };
    const supportsLatest = current.supports_latest !== false;
    const activeFiltersCount = this.countActiveFilters(this.currentFilters);
    const hasFilters = this.sourceFiltersDefault && this.sourceFiltersDefault.length > 0;

    const sourceSwitchOptions = (this.sourcesList || []).map(s => 
      `<option value="${s.id}" ${String(s.id) === String(this.currentSource) ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`
    ).join('');

    return `
      <!-- Catalog Navigation Bar -->
      <div class="catalog-top-bar">
        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <button class="btn btn-secondary" id="btn-back-to-sources" style="padding: 6px 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2;">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Sources</span>
          </button>

          <div class="catalog-source-header">
            <div class="source-card-icon-wrap" style="width: 32px; height: 32px;">
              <img src="${current.id === 'local' ? '/static/img/ic_local_source.png' : (current.icon_url || '/static/img/default-cover.png')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='${current.id === 'local' ? '/static/img/ic_local_source.png' : '/static/img/default-cover.png'}'" />
            </div>
            <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(current.name)}</span>
          </div>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          ${current.id !== 'local' ? `
            <button class="btn btn-secondary btn-uninstall-catalog-source" data-pkg="${current.pkg || current.id}" data-name="${this.escapeHtml(current.name)}" style="padding: 6px 12px; font-size: 0.82rem; color: var(--accent-red, #ef4444); border-color: rgba(239,68,68,0.25);" title="Uninstall this source">
              Uninstall
            </button>
          ` : ''}
          <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">Switch:</span>
          <select id="catalog-switch-source-select" class="catalog-select" style="min-width: 150px; font-size: 0.82rem; padding: 6px 12px;">
            ${sourceSwitchOptions}
          </select>
        </div>
      </div>

      <!-- Search Input Bar -->
      <div class="catalog-search-row">
        <div class="catalog-search-box">
          <svg viewBox="0 0 24 24" class="catalog-search-icon">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="catalog-search-input" class="search-input" placeholder="Search in ${this.escapeHtml(current.name)}..." value="${this.escapeHtml(this.listing.query || '')}" />
        </div>
        <button id="catalog-search-btn" class="btn btn-primary" style="padding: 7px 18px; font-weight: 600; font-size: 0.84rem;">Search</button>
        <button id="catalog-search-global-btn" class="btn btn-secondary" style="padding: 7px 14px; display: inline-flex; align-items: center; gap: 6px; font-size: 0.84rem;" title="Search all installed sources">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Global</span>
        </button>
      </div>

      <!-- Mihon Filter Chips Row -->
      <div class="mihon-quick-chips">
        <button class="mihon-quick-chip ${this.listing.type === 'popular' ? 'active' : ''}" id="btn-quick-popular" type="button" title="Popular Titles">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
          <span>Popular</span>
        </button>

        ${supportsLatest ? `
          <button class="mihon-quick-chip ${this.listing.type === 'latest' ? 'active' : ''}" id="btn-quick-latest" type="button" title="Latest Updates">
            <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"></path></svg>
            <span>Latest</span>
          </button>
        ` : ''}

        ${hasFilters ? `
          <button class="mihon-quick-chip ${this.listing.type === 'search' || activeFiltersCount > 0 ? 'active' : ''}" id="btn-open-source-filters" type="button" title="Filter Options">
            <svg viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"></path></svg>
            <span>Filter</span>
            ${activeFiltersCount > 0 ? `<span class="chip-badge">${activeFiltersCount}</span>` : ''}
          </button>
        ` : ''}
      </div>

      <!-- Manga Grid Results -->
      <div class="manga-grid" id="browse-grid">
        ${this.renderCatalogLoadingSkeleton(current.name)}
      </div>

      <!-- Infinite Scroll Sentinel & Loader -->
      <div id="catalog-infinite-sentinel" style="text-align: center; padding: 28px 0; margin-top: 10px;">
        <div id="catalog-infinite-spinner" style="display: none;">
          <div class="modern-inline-loader">
            <span class="inline-spinner-ring"></span>
            <span>Loading more titles...</span>
          </div>
        </div>
        <button id="btn-manual-load-more" class="btn btn-secondary" style="display: none; margin: 0 auto; padding: 8px 24px; font-size: 0.85rem;">
          Load More
        </button>
      </div>

      <!-- Mihon Filter Bottom Sheet Modal Container -->
      <div id="mihon-filter-modal-container"></div>
    `;
  },

  renderMihonFilterItemsHtml(filters) {
    let lastWasSeparator = false;

    return (filters || []).map((f, idx) => {
      if (f.type === 'header') {
        lastWasSeparator = false;
        return `<div class="mihon-filter-heading">${this.escapeHtml(f.name)}</div>`;
      }

      if (f.type === 'separator') {
        if (lastWasSeparator) return '';
        lastWasSeparator = true;
        return `<div class="mihon-filter-divider"></div>`;
      }
      lastWasSeparator = false;

      if (f.type === 'select') {
        const optionsHtml = (f.values || []).map((opt, i) => 
          `<option value="${i}" ${f.state === i ? 'selected' : ''}>${this.escapeHtml(opt)}</option>`
        ).join('');
        return `
          <div class="mihon-filter-select-field">
            <label class="mihon-field-label-text">${this.escapeHtml(f.name)}</label>
            <div class="mihon-select-wrap">
              <select class="mihon-modern-select" data-filter-idx="${idx}">
                ${optionsHtml}
              </select>
              <svg viewBox="0 0 24 24" class="mihon-select-chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>
        `;
      }

      if (f.type === 'text') {
        let ph = f.placeholder || '';
        if (!ph) {
          const lower = (f.name || '').toLowerCase();
          if (lower.includes('author') || lower.includes('artist')) ph = 'e.g. Eiichiro Oda';
          else if (lower.includes('from')) ph = 'e.g. 2018';
          else if (lower.includes('to')) ph = 'e.g. 2025';
          else if (lower.includes('chapter')) ph = 'e.g. 20';
          else ph = `Filter by ${lower}...`;
        }
        return `
          <div class="mihon-filter-text-field">
            <label class="mihon-field-label-text">${this.escapeHtml(f.name)}</label>
            <div class="mihon-input-wrap">
              <input type="text" class="mihon-modern-input" data-filter-idx="${idx}" value="${this.escapeHtml(f.state || '')}" placeholder="${this.escapeHtml(ph)}" />
            </div>
          </div>
        `;
      }

      if (f.type === 'checkbox') {
        return `
          <div class="mihon-filter-single-row">
            <button type="button" class="mihon-filter-chip ${f.state ? 'is-active is-checked' : ''}" data-action="toggle-checkbox" data-filter-idx="${idx}">
              <span class="mihon-chip-icon">${f.state ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
              <span class="mihon-chip-text">${this.escapeHtml(f.name)}</span>
            </button>
          </div>
        `;
      }

      if (f.type === 'tristate') {
        const state = f.state || 0;
        let iconHtml = '';
        if (state === 1) iconHtml = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        else if (state === 2) iconHtml = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        return `
          <div class="mihon-filter-single-row">
            <button type="button" class="mihon-filter-chip tristate ${state === 1 ? 'is-active is-included' : (state === 2 ? 'is-active is-excluded' : '')}" data-action="cycle-tristate" data-filter-idx="${idx}" data-state="${state}">
              <span class="mihon-chip-icon">${iconHtml}</span>
              <span class="mihon-chip-text">${this.escapeHtml(f.name)}</span>
            </button>
          </div>
        `;
      }

      if (f.type === 'sort') {
        const currentIdx = f.state?.index || 0;
        const ascending = !!f.state?.ascending;
        const itemsHtml = (f.values || []).map((v, sIdx) => {
          const isSelected = currentIdx === sIdx;
          return `
            <button type="button" class="mihon-filter-chip sort-chip ${isSelected ? 'is-active is-checked' : ''}" data-action="select-sort" data-filter-idx="${idx}" data-sort-idx="${sIdx}">
              <span class="mihon-chip-icon">${isSelected ? (ascending ? '↑' : '↓') : ''}</span>
              <span class="mihon-chip-text">${this.escapeHtml(v)}</span>
            </button>
          `;
        }).join('');

        return `
          <div class="mihon-filter-group-section">
            <div class="mihon-filter-group-header">
              <span class="mihon-group-title">${this.escapeHtml(f.name || 'Sort By')}</span>
            </div>
            <div class="mihon-chips-container">
              ${itemsHtml}
            </div>
          </div>
        `;
      }

      if (f.type === 'group') {
        const children = f.state || [];
        const activeCount = children.filter(c => c.type === 'checkbox' ? !!c.state : (c.state && c.state !== 0)).length;
        const isLargeGroup = children.length > 8;

        return `
          <div class="mihon-filter-group-section" data-group-idx="${idx}">
            <div class="mihon-filter-group-header ${isLargeGroup ? 'can-toggle' : ''}">
              <span class="mihon-group-title">${this.escapeHtml(f.name)}</span>
              <div class="mihon-group-header-meta">
                <span class="mihon-group-count-badge" style="${activeCount > 0 ? '' : 'display: none;'}">${activeCount} active</span>
                ${isLargeGroup ? `<svg viewBox="0 0 24 24" class="mihon-group-toggle-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>` : ''}
              </div>
            </div>
            <div class="mihon-chips-container ${isLargeGroup ? 'chips-scrollable' : ''}">
              ${children.map((child, cIdx) => {
                if (child.type === 'checkbox') {
                  return `
                    <button type="button" class="mihon-filter-chip ${child.state ? 'is-active is-checked' : ''}" data-action="toggle-group-checkbox" data-group-idx="${idx}" data-child-idx="${cIdx}">
                      <span class="mihon-chip-icon">${child.state ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
                      <span class="mihon-chip-text">${this.escapeHtml(child.name)}</span>
                    </button>
                  `;
                }
                if (child.type === 'tristate') {
                  const state = child.state || 0;
                  let iconHtml = '';
                  if (state === 1) iconHtml = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                  else if (state === 2) iconHtml = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                  return `
                    <button type="button" class="mihon-filter-chip tristate ${state === 1 ? 'is-active is-included' : (state === 2 ? 'is-active is-excluded' : '')}" data-action="cycle-group-tristate" data-group-idx="${idx}" data-child-idx="${cIdx}" data-state="${state}">
                      <span class="mihon-chip-icon">${iconHtml}</span>
                      <span class="mihon-chip-text">${this.escapeHtml(child.name)}</span>
                    </button>
                  `;
                }
                return '';
              }).join('')}
            </div>
          </div>
        `;
      }

      return '';
    }).join('');
  },

  attachMihonFilterEvents(container, filterList, onUpdate) {
    if (!container) return;

    // Toggle Collapsible Group Container
    container.querySelectorAll('.mihon-filter-group-header.can-toggle').forEach(header => {
      header.addEventListener('click', () => {
        const group = header.closest('.mihon-filter-group-section');
        if (group) group.classList.toggle('is-collapsed');
      });
    });

    // Standalone Select
    container.querySelectorAll('select[data-filter-idx]').forEach(sel => {
      sel.addEventListener('change', () => {
        const fIdx = parseInt(sel.getAttribute('data-filter-idx'), 10);
        if (filterList[fIdx]) {
          filterList[fIdx].state = parseInt(sel.value, 10);
          if (onUpdate) onUpdate();
        }
      });
    });

    // Standalone Text Input
    container.querySelectorAll('input[data-filter-idx]').forEach(inp => {
      inp.addEventListener('input', () => {
        const fIdx = parseInt(inp.getAttribute('data-filter-idx'), 10);
        if (filterList[fIdx]) {
          filterList[fIdx].state = inp.value;
          if (onUpdate) onUpdate();
        }
      });
    });

    // Standalone Checkbox
    container.querySelectorAll('[data-action="toggle-checkbox"]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const fIdx = parseInt(chip.getAttribute('data-filter-idx'), 10);
        const f = filterList[fIdx];
        if (f) {
          f.state = !f.state;
          chip.classList.toggle('is-active', f.state);
          chip.classList.toggle('is-checked', f.state);
          const iconEl = chip.querySelector('.mihon-chip-icon');
          if (iconEl) {
            iconEl.innerHTML = f.state ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '';
          }
          if (onUpdate) onUpdate();
        }
      });
    });

    // Standalone TriState
    container.querySelectorAll('[data-action="cycle-tristate"]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const fIdx = parseInt(chip.getAttribute('data-filter-idx'), 10);
        const f = filterList[fIdx];
        if (f) {
          f.state = ((f.state || 0) + 1) % 3;
          chip.setAttribute('data-state', f.state);
          chip.classList.remove('is-active', 'is-included', 'is-excluded');
          const iconEl = chip.querySelector('.mihon-chip-icon');
          if (f.state === 1) {
            chip.classList.add('is-active', 'is-included');
            if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          } else if (f.state === 2) {
            chip.classList.add('is-active', 'is-excluded');
            if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
          } else if (iconEl) {
            iconEl.innerHTML = '';
          }
          if (onUpdate) onUpdate();
        }
      });
    });

    // Group Checkbox Chip
    container.querySelectorAll('[data-action="toggle-group-checkbox"]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const gIdx = parseInt(chip.getAttribute('data-group-idx'), 10);
        const cIdx = parseInt(chip.getAttribute('data-child-idx'), 10);
        const child = filterList[gIdx]?.state?.[cIdx];
        if (child) {
          child.state = !child.state;
          chip.classList.toggle('is-active', child.state);
          chip.classList.toggle('is-checked', child.state);
          const iconEl = chip.querySelector('.mihon-chip-icon');
          if (iconEl) {
            iconEl.innerHTML = child.state ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '';
          }

          // Update section active badge
          const section = chip.closest('.mihon-filter-group-section');
          if (section) {
            const groupActiveCount = (filterList[gIdx]?.state || []).filter(c => c.type === 'checkbox' ? !!c.state : (c.state && c.state !== 0)).length;
            const badge = section.querySelector('.mihon-group-count-badge');
            if (badge) {
              badge.textContent = `${groupActiveCount} active`;
              badge.style.display = groupActiveCount > 0 ? '' : 'none';
            }
          }
          if (onUpdate) onUpdate();
        }
      });
    });

    // Group TriState Chip
    container.querySelectorAll('[data-action="cycle-group-tristate"]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const gIdx = parseInt(chip.getAttribute('data-group-idx'), 10);
        const cIdx = parseInt(chip.getAttribute('data-child-idx'), 10);
        const child = filterList[gIdx]?.state?.[cIdx];
        if (child) {
          child.state = ((child.state || 0) + 1) % 3;
          chip.setAttribute('data-state', child.state);
          chip.classList.remove('is-active', 'is-included', 'is-excluded');
          const iconEl = chip.querySelector('.mihon-chip-icon');
          if (child.state === 1) {
            chip.classList.add('is-active', 'is-included');
            if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          } else if (child.state === 2) {
            chip.classList.add('is-active', 'is-excluded');
            if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
          } else if (iconEl) {
            iconEl.innerHTML = '';
          }

          // Update section active badge
          const section = chip.closest('.mihon-filter-group-section');
          if (section) {
            const groupActiveCount = (filterList[gIdx]?.state || []).filter(c => c.type === 'checkbox' ? !!c.state : (c.state && c.state !== 0)).length;
            const badge = section.querySelector('.mihon-group-count-badge');
            if (badge) {
              badge.textContent = `${groupActiveCount} active`;
              badge.style.display = groupActiveCount > 0 ? '' : 'none';
            }
          }
          if (onUpdate) onUpdate();
        }
      });
    });

    // Sort Chips
    container.querySelectorAll('[data-action="select-sort"]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const fIdx = parseInt(chip.getAttribute('data-filter-idx'), 10);
        const sIdx = parseInt(chip.getAttribute('data-sort-idx'), 10);
        const f = filterList[fIdx];
        if (f) {
          if (f.state?.index === sIdx) {
            f.state.ascending = !f.state.ascending;
          } else {
            f.state = { index: sIdx, ascending: false };
          }
          const parentChips = chip.closest('.mihon-chips-container');
          if (parentChips) {
            parentChips.querySelectorAll('.sort-chip').forEach((btn, i) => {
              const isSelected = i === f.state.index;
              btn.classList.toggle('is-active', isSelected);
              btn.classList.toggle('is-checked', isSelected);
              const iconEl = btn.querySelector('.mihon-chip-icon');
              if (iconEl) {
                iconEl.textContent = isSelected ? (f.state.ascending ? '↑' : '↓') : '';
              }
            });
          }
          if (onUpdate) onUpdate();
        }
      });
    });
  },

  openFilterModal() {
    const container = document.getElementById('mihon-filter-modal-container');
    if (!container) return;

    if (!this.currentFilters || this.currentFilters.length === 0) {
      State.showToast('No filters available for this source');
      return;
    }

    let workingFilters = this.cloneFilters(this.currentFilters);

    const updateFilterCountBadge = () => {
      const activeCount = this.countActiveFilters(workingFilters);
      const countEl = document.getElementById('mihon-modal-active-count');
      const footerCount = document.getElementById('mihon-footer-filter-count');
      if (countEl) {
        countEl.textContent = `${activeCount} active`;
        countEl.style.display = activeCount > 0 ? '' : 'none';
      }
      if (footerCount) {
        footerCount.textContent = activeCount;
        footerCount.style.display = activeCount > 0 ? '' : 'none';
      }
    };

    const initialCount = this.countActiveFilters(workingFilters);

    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="mihon-filter-backdrop">
        <div class="mihon-filter-sheet" id="mihon-filter-sheet">
          <div class="mihon-filter-header">
            <div class="mihon-filter-header-left">
              <svg viewBox="0 0 24 24" class="mihon-filter-header-icon"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              <div class="mihon-filter-header-title">Filters</div>
              <span class="mihon-header-count-pill" id="mihon-modal-active-count" style="${initialCount > 0 ? '' : 'display: none;'}">${initialCount} active</span>
            </div>
            <div class="mihon-filter-header-right">
              <button type="button" class="mihon-filter-reset-link" id="btn-modal-reset-filter">Reset all</button>
              <button type="button" class="mihon-filter-close-btn" id="btn-modal-close-filter" aria-label="Close">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>

          <div class="mihon-filter-body" id="mihon-filter-dialog-body">
            ${this.renderMihonFilterItemsHtml(workingFilters)}
          </div>

          <div class="mihon-filter-footer">
            <button type="button" class="btn btn-secondary mihon-footer-reset-btn" id="btn-footer-reset-filter">Reset</button>
            <button type="button" class="btn btn-primary mihon-footer-apply-btn" id="btn-modal-apply-filter">
              <span>Filter</span>
              <span class="mihon-apply-badge" id="mihon-footer-filter-count" style="${initialCount > 0 ? '' : 'display: none;'}">${initialCount}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      container.innerHTML = '';
    };

    const backdrop = document.getElementById('mihon-filter-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    const closeBtn = document.getElementById('btn-modal-close-filter');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    const doReset = () => {
      workingFilters = this.cloneFilters(this.sourceFiltersDefault);
      const bodyEl = document.getElementById('mihon-filter-dialog-body');
      if (bodyEl) {
        bodyEl.innerHTML = this.renderMihonFilterItemsHtml(workingFilters);
        this.attachMihonFilterEvents(bodyEl, workingFilters, updateFilterCountBadge);
      }
      updateFilterCountBadge();
      State.showToast('Filters reset to defaults');
    };

    const resetTopBtn = document.getElementById('btn-modal-reset-filter');
    if (resetTopBtn) resetTopBtn.addEventListener('click', doReset);

    const resetFooterBtn = document.getElementById('btn-footer-reset-filter');
    if (resetFooterBtn) resetFooterBtn.addEventListener('click', doReset);

    const applyBtn = document.getElementById('btn-modal-apply-filter');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        this.currentFilters = workingFilters;
        closeModal();
        this.listing = {
          type: 'search',
          query: this.listing.query || ''
        };
        this.catalogPage = 1;
        this.render();
      });
    }

    const bodyEl = document.getElementById('mihon-filter-dialog-body');
    this.attachMihonFilterEvents(bodyEl, workingFilters, updateFilterCountBadge);
  },

  bindCatalogEvents() {
    const backBtn = document.getElementById('btn-back-to-sources');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.scrollObserver) this.scrollObserver.disconnect();
        Router.navigate('browse');
      });
    }

    const uninstallCatalogBtn = document.querySelector('.btn-uninstall-catalog-source');
    if (uninstallCatalogBtn) {
      uninstallCatalogBtn.addEventListener('click', async () => {
        const pkg = uninstallCatalogBtn.getAttribute('data-pkg');
        const name = uninstallCatalogBtn.getAttribute('data-name');
        if (!confirm(`Uninstall extension "${name}"?`)) return;
        uninstallCatalogBtn.disabled = true;
        try {
          await API.uninstallExtension(pkg);
          this.pinnedSourceIds.delete(this.currentSource);
          localStorage.setItem('mihon_pinned_sources', JSON.stringify(Array.from(this.pinnedSourceIds)));
          if (window.Toast) Toast.show(`Uninstalled ${name}`, 'info');
          this.sourcesViewMode = 'directory';
          Router.navigate('browse');
          this.render();
        } catch (err) {
          if (window.Toast) Toast.show(err.message, 'error');
          uninstallCatalogBtn.disabled = false;
        }
      });
    }

    const switchSelect = document.getElementById('catalog-switch-source-select');
    if (switchSelect) {
      switchSelect.addEventListener('change', (e) => {
        this.openSourceCatalog(e.target.value, 'popular');
      });
    }

    const searchInput = document.getElementById('catalog-search-input');
    const searchBtn = document.getElementById('catalog-search-btn');
    if (searchBtn && searchInput) {
      const doSearch = () => {
        const query = searchInput.value.trim();
        this.listing = { type: 'search', query };
        this.catalogPage = 1;
        this.render();
      };
      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

    const searchGlobalBtn = document.getElementById('catalog-search-global-btn');
    if (searchGlobalBtn) {
      searchGlobalBtn.addEventListener('click', () => {
        const q = (searchInput ? searchInput.value : this.listing.query || '').trim();
        Router.navigate(q ? `globalsearch/${encodeURIComponent(q)}` : 'globalsearch');
      });
    }

    const quickPopBtn = document.getElementById('btn-quick-popular');
    if (quickPopBtn) {
      quickPopBtn.addEventListener('click', () => {
        this.resetFilters();
        this.listing = { type: 'popular', query: '' };
        this.catalogPage = 1;
        this.render();
      });
    }

    const quickLatestBtn = document.getElementById('btn-quick-latest');
    if (quickLatestBtn) {
      quickLatestBtn.addEventListener('click', () => {
        this.resetFilters();
        this.listing = { type: 'latest', query: '' };
        this.catalogPage = 1;
        this.render();
      });
    }

    const filterBtn = document.getElementById('btn-open-source-filters');
    if (filterBtn) {
      filterBtn.addEventListener('click', () => {
        this.openFilterModal();
      });
    }

    const manualLoadMore = document.getElementById('btn-manual-load-more');
    if (manualLoadMore) {
      manualLoadMore.addEventListener('click', () => {
        this.loadMoreCatalog();
      });
    }
  },

  setupInfiniteScroll() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
    }

    const sentinel = document.getElementById('catalog-infinite-sentinel');
    if (!sentinel) return;

    this.scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.isLoadingMore && this.catalogPage < this.catalogTotalPages) {
        this.loadMoreCatalog();
      }
    }, { rootMargin: '400px' });

    this.scrollObserver.observe(sentinel);

    window.onscroll = () => {
      if (this.sourcesViewMode !== 'catalog') return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
        if (!this.isLoadingMore && this.catalogPage < this.catalogTotalPages) {
          this.loadMoreCatalog();
        }
      }
    };
  },

  async loadCatalog() {
    const grid = document.getElementById('browse-grid');
    if (!grid) return;

    this.isLoadingMore = false;
    this.catalogPage = 1;

    grid.innerHTML = this.renderCatalogLoadingSkeleton();

    try {
      let res;
      if (this.listing.type === 'popular') {
        res = await API.getPopularManga(this.currentSource, 1);
      } else if (this.listing.type === 'latest') {
        res = await API.getLatestManga(this.currentSource, 1);
      } else {
        const filterParams = this.serializeFilters(this.currentFilters);
        res = await API.searchManga(this.currentSource, this.listing.query || '', 1, filterParams);
      }

      const items = res.items || [];
      const total = res.total || 0;
      const limit = res.limit || 24;
      this.catalogTotalPages = Math.max(1, Math.ceil(total / limit));

      if (items.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">No titles found</div>
            <div style="font-size: 0.88rem;">Try clearing filters or search terms.</div>
          </div>
        `;
        return;
      }

      grid.innerHTML = items.map(manga => this.createMangaCard(manga)).join('');
      this.bindMangaCardClicks(grid);
      this.setupInfiniteScroll();

      const manualBtn = document.getElementById('btn-manual-load-more');
      if (manualBtn) {
        manualBtn.style.display = this.catalogTotalPages > 1 ? 'inline-block' : 'none';
      }
    } catch (e) {
      console.error('Error loading catalog:', e);
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent-red);">
          Failed to load source titles: ${e.message}
        </div>
      `;
    }
  },

  async loadMoreCatalog() {
    if (this.isLoadingMore || this.catalogPage >= this.catalogTotalPages) return;
    this.isLoadingMore = true;

    const spinner = document.getElementById('catalog-infinite-spinner');
    const manualBtn = document.getElementById('btn-manual-load-more');
    if (spinner) spinner.style.display = 'block';
    if (manualBtn) manualBtn.style.display = 'none';

    try {
      const nextPage = this.catalogPage + 1;
      let res;
      if (this.listing.type === 'popular') {
        res = await API.getPopularManga(this.currentSource, nextPage);
      } else if (this.listing.type === 'latest') {
        res = await API.getLatestManga(this.currentSource, nextPage);
      } else {
        const filterParams = this.serializeFilters(this.currentFilters);
        res = await API.searchManga(this.currentSource, this.listing.query || '', nextPage, filterParams);
      }

      const newItems = res.items || [];
      if (newItems.length > 0) {
        const grid = document.getElementById('browse-grid');
        if (grid) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newItems.map(m => this.createMangaCard(m)).join('');
          while (tempDiv.firstChild) {
            grid.appendChild(tempDiv.firstChild);
          }
          this.bindMangaCardClicks(grid);
        }
        this.catalogPage = nextPage;
      }
    } catch (e) {
      console.error('Error loading more catalog items:', e);
    } finally {
      this.isLoadingMore = false;
      if (spinner) spinner.style.display = 'none';
      if (manualBtn) {
        manualBtn.style.display = this.catalogPage < this.catalogTotalPages ? 'inline-block' : 'none';
      }
    }
  },

  bindMangaCardClicks(container) {
    container.querySelectorAll('.manga-card').forEach(card => {
      if (card.getAttribute('data-bound')) return;
      card.setAttribute('data-bound', 'true');
      const mangaId = card.getAttribute('data-id');
      const source = card.getAttribute('data-source');

      // Speculative preheat on hover/touch (Mihon-style zero-latency click)
      card.addEventListener('pointerenter', () => {
        API.prefetchManga(source, mangaId);
      }, { once: true, passive: true });

      card.addEventListener('click', () => {
        window.location.hash = `#/manga/${source}/${mangaId}`;
      });
    });
  },

  createMangaCard(manga) {
    if (manga && manga.id) {
      if (!window.__mangaQuickCache) window.__mangaQuickCache = new Map();
      window.__mangaQuickCache.set(manga.id, manga);
      try {
        sessionStorage.setItem('manga_browse_' + manga.id, JSON.stringify(manga));
      } catch (e) {}
    }
    const isLocal = manga.source === 'local';
    const statusClass = (manga.status || '').toLowerCase() === 'completed' ? 'completed' : 'ongoing';

    return `
      <div class="manga-card" data-id="${manga.id}" data-source="${manga.source}">
        <div class="manga-card-cover-wrap">
          <img 
            src="${manga.cover_url || '/static/img/default-cover.png'}" 
            alt="${manga.title}"
            class="manga-card-cover" 
            loading="lazy"
            onerror="this.src='/static/img/default-cover.png'"
          />
          <span class="manga-card-badge ${statusClass}">
            ${manga.status || 'Ongoing'}
          </span>
        </div>
        <div class="manga-card-info">
          <div class="manga-card-title" title="${manga.title}">${manga.title}</div>
          <div class="manga-card-source">${manga.source_name || manga.source}</div>
        </div>
      </div>
    `;
  },

  // ----------------- EXTENSIONS TAB -----------------

  bindExtensionsEvents() {
    const searchInput = document.getElementById('ext-search-input');
    const searchBtn = document.getElementById('ext-search-btn');
    const langSelect = document.getElementById('ext-lang-select');
    const statusSelect = document.getElementById('ext-status-select');
    const refreshBtn = document.getElementById('btn-refresh-extensions');

    if (searchBtn && searchInput) {
      const applyFilters = () => {
        this.extQuery = searchInput.value.trim();
        this.loadExtensions();
      };
      searchBtn.addEventListener('click', applyFilters);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyFilters();
      });
    }

    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        this.extLang = e.target.value;
        this.loadExtensions();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.extStatus = e.target.value;
        this.loadExtensions();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Syncing...';
        await this.loadExtensions(true);
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Sync Repos';
      });
    }
  },

  async loadExtensions(force = false) {
    const grid = document.getElementById('extensions-grid');
    const countBadge = document.getElementById('ext-count-badge');
    if (!grid) return;

    if (this.extObserver) {
      this.extObserver.disconnect();
    }

    this.extPage = 1;
    this.isExtLoadingMore = false;
    this.loadedExtensions = [];

    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        Loading extensions from repository...
      </div>
    `;

    try {
      // 1. Fetch installed extensions
      const installed = await API.getInstalledExtensions();
      this.installedPkgs = new Set(installed.map(e => e.pkg));

      // 2. Fetch extensions from repos (page 1)
      const res = await API.getExtensions({
        q: this.extQuery,
        lang: this.extLang,
        page: 1,
        limit: 40,
        force: force ? 'true' : 'false'
      });

      this.extTotalPages = res.pages || Math.max(1, Math.ceil((res.total || 0) / 40));
      this.extTotalCount = res.total || 0;

      let extensions = res.extensions || [];
      // Strictly restrict to English and All extensions
      extensions = extensions.filter(e => {
        const l = (e.lang || 'all').trim().toLowerCase();
        return l === 'en' || l === 'all';
      });

      if (this.extStatus === 'installed') {
        extensions = extensions.filter(e => this.installedPkgs.has(e.pkg));
      } else if (this.extStatus === 'available') {
        extensions = extensions.filter(e => !this.installedPkgs.has(e.pkg));
      }

      this.loadedExtensions = extensions;

      if (countBadge) {
        countBadge.textContent = `${this.loadedExtensions.length} of ${res.total || this.loadedExtensions.length} extensions`;
      }

      if (this.loadedExtensions.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">No extensions found</div>
            <div style="font-size: 0.88rem;">Try clearing filters or search queries.</div>
          </div>
        `;
        return;
      }

      grid.innerHTML = `
        ${this.loadedExtensions.map(ext => this.createExtensionCardHtml(ext)).join('')}
        <div id="ext-infinite-sentinel" style="grid-column: 1/-1; height: 30px;"></div>
        <div id="ext-infinite-spinner" style="grid-column: 1/-1; text-align: center; padding: 20px; display: none; color: var(--accent-cyan); font-weight: 600;">
          Loading more extensions...
        </div>
      `;

      this.bindExtensionCardButtons(grid);
      this.setupExtensionsInfiniteScroll();

    } catch (e) {
      console.error('Error loading extensions:', e);
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent-red);">
          Failed to load extension repository: ${e.message}
        </div>
      `;
    }
  },

  bindExtensionCardButtons(container) {
    container.querySelectorAll('.btn-install-action').forEach(btn => {
      if (btn.hasAttribute('data-bound')) return;
      btn.setAttribute('data-bound', 'true');

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pkg = btn.getAttribute('data-pkg');
        const isInstalled = btn.getAttribute('data-installed') === 'true';

        btn.disabled = true;
        if (isInstalled) {
          btn.textContent = 'Removing...';
          try {
            await API.uninstallExtension(pkg);
            this.installedPkgs.delete(pkg);
            btn.setAttribute('data-installed', 'false');
            btn.textContent = 'Install';
            btn.disabled = false;
            btn.classList.remove('btn-installed');
            btn.classList.add('btn-install');
            if (window.Toast) Toast.show('Extension uninstalled', 'info');
            await this.loadSourcesDirectory();
          } catch (err) {
            if (window.Toast) Toast.show(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Installed';
          }
        } else {
          btn.textContent = 'Installing...';
          try {
            await API.installExtension(pkg);
            this.installedPkgs.add(pkg);
            btn.setAttribute('data-installed', 'true');
            btn.textContent = 'Installed';
            btn.disabled = false;
            btn.classList.add('btn-installed');
            btn.classList.remove('btn-install');
            if (window.Toast) Toast.show('Extension installed! Available in Sources.', 'success');
            await this.loadSourcesDirectory();
          } catch (err) {
            if (window.Toast) Toast.show(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Install';
          }
        }
      });
    });
  },

  setupExtensionsInfiniteScroll() {
    if (this.extObserver) {
      this.extObserver.disconnect();
    }

    const sentinel = document.getElementById('ext-infinite-sentinel');
    if (!sentinel) return;

    this.extObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.isExtLoadingMore && this.extPage < this.extTotalPages) {
        this.loadMoreExtensions();
      }
    }, { rootMargin: '400px' });

    this.extObserver.observe(sentinel);

    // Fallback window scroll listener
    const origOnScroll = window.onscroll;
    window.onscroll = () => {
      if (origOnScroll) origOnScroll();
      if (this.activeSubTab === 'extensions') {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
          if (!this.isExtLoadingMore && this.extPage < this.extTotalPages) {
            this.loadMoreExtensions();
          }
        }
      }
    };
  },

  async loadMoreExtensions() {
    if (this.isExtLoadingMore || this.extPage >= this.extTotalPages) return;
    this.isExtLoadingMore = true;

    const spinner = document.getElementById('ext-infinite-spinner');
    const sentinel = document.getElementById('ext-infinite-sentinel');
    const countBadge = document.getElementById('ext-count-badge');
    const grid = document.getElementById('extensions-grid');
    if (spinner) spinner.style.display = 'block';

    try {
      const nextPage = this.extPage + 1;
      const res = await API.getExtensions({
        q: this.extQuery,
        lang: this.extLang,
        page: nextPage,
        limit: 40
      });

      this.extPage = nextPage;
      this.extTotalPages = res.pages || Math.max(1, Math.ceil((res.total || 0) / 40));

      let newExtensions = res.extensions || [];
      if (this.extStatus === 'installed') {
        newExtensions = newExtensions.filter(e => this.installedPkgs.has(e.pkg));
      } else if (this.extStatus === 'available') {
        newExtensions = newExtensions.filter(e => !this.installedPkgs.has(e.pkg));
      }

      if (newExtensions.length > 0 && grid && sentinel) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newExtensions.map(ext => this.createExtensionCardHtml(ext)).join('');
        
        while (tempDiv.firstChild) {
          grid.insertBefore(tempDiv.firstChild, sentinel);
        }

        this.loadedExtensions.push(...newExtensions);
        this.bindExtensionCardButtons(grid);
      }

      if (countBadge) {
        countBadge.textContent = `${this.loadedExtensions.length} of ${res.total || this.loadedExtensions.length} extensions`;
      }
    } catch (e) {
      console.error('Error loading more extensions:', e);
    } finally {
      if (spinner) spinner.style.display = 'none';
      this.isExtLoadingMore = false;
    }
  },

  createExtensionCardHtml(ext) {
    const isLocal = ext.pkg === 'local.storage' || ext.id === 'local';
    const isInstalled = this.installedPkgs.has(ext.pkg);
    const defaultIcon = isLocal ? '/static/img/ic_local_source.png' : 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/default.png';
    const iconUrl = isLocal ? '/static/img/ic_local_source.png' : (ext.icon_url || defaultIcon);

    return `
      <div class="extension-card">
        <div class="ext-card-left">
          <img src="${iconUrl}" class="ext-icon" onerror="this.src='${isLocal ? '/static/img/ic_local_source.png' : '/static/img/default-cover.png'}'" alt="${this.escapeHtml(ext.name)}" />
          <div class="ext-details">
            <div class="ext-name" title="${this.escapeHtml(ext.name)}">${this.escapeHtml(ext.name)}</div>
            <div class="ext-meta">
              <span class="source-lang-badge">${(ext.lang || 'all').toUpperCase()}</span>
              <span>v${ext.version || '1.0'}</span>
              ${ext.nsfw ? '<span class="ext-nsfw-badge">18+</span>' : ''}
            </div>
          </div>
        </div>

        <div class="ext-card-right">
          <button 
            class="btn-install-action ${isInstalled ? 'btn-installed' : 'btn-install'}" 
            data-pkg="${ext.pkg}" 
            data-installed="${isInstalled ? 'true' : 'false'}"
            title="${isInstalled ? 'Click to uninstall' : 'Install extension'}"
          >
            ${isInstalled ? 'Installed' : 'Install'}
          </button>
        </div>
      </div>
    `;
  },

  // ----------------- EXTENSION REPOSITORIES MODAL -----------------

  async openRepoModal() {
    const existing = document.getElementById('repo-modal-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'repo-modal-backdrop';
    backdrop.id = 'repo-modal-backdrop';

    backdrop.innerHTML = `
      <div class="repo-modal">
        <div class="repo-modal-header">
          <div class="repo-modal-title">Extension Repositories</div>
          <button class="btn btn-secondary" id="btn-close-repo-modal" style="padding: 6px 10px; border-radius: var(--radius-sm);" title="Close">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Manage external extension repositories. Keiyoushi is configured by default.
        </div>

        <div class="repo-list-wrap" id="repo-list-container">
          <div style="text-align: center; padding: 20px; color: var(--text-muted);">Loading repositories...</div>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary);">Add Custom Repository</div>
          <input type="text" id="new-repo-name" class="search-input" placeholder="Repository Name (e.g. My Custom Repo)" />
          <input type="text" id="new-repo-url" class="search-input" placeholder="Repository URL (e.g. https://.../index.min.json)" />
          <button class="btn btn-primary" id="btn-add-repo" style="align-self: flex-end; padding: 7px 18px; font-weight: 600;">Add Repository</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeBtn = document.getElementById('btn-close-repo-modal');
    closeBtn.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    await this.refreshRepoListModal();

    const addBtn = document.getElementById('btn-add-repo');
    addBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('new-repo-name');
      const urlInput = document.getElementById('new-repo-url');
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();

      if (!url) {
        Toast.show('Please provide a repository URL', 'warning');
        return;
      }

      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      try {
        await API.addExtensionRepo({ name: name || 'Custom Repo', url });
        Toast.show('Repository added successfully', 'success');
        nameInput.value = '';
        urlInput.value = '';
        await this.refreshRepoListModal();
        if (this.activeSubTab === 'extensions') {
          this.loadExtensions(true);
        }
      } catch (err) {
        Toast.show(err.message, 'error');
      } finally {
        addBtn.disabled = false;
        addBtn.textContent = 'Add Repository';
      }
    });
  },

  async refreshRepoListModal() {
    const container = document.getElementById('repo-list-container');
    if (!container) return;

    try {
      const repos = await API.getExtensionRepos();
      if (repos.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 16px; color: var(--text-muted);">No repositories added.</div>`;
        return;
      }

      container.innerHTML = repos.map(r => `
        <div class="repo-item">
          <div class="repo-info">
            <span class="repo-name">${r.name}</span>
            <span class="repo-url" title="${r.url}">${r.url}</span>
          </div>
          ${r.id !== 'keiyoushi' ? `
            <button class="btn btn-secondary btn-del-repo" data-id="${r.id}" style="padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
              Delete
            </button>
          ` : '<span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 600; padding: 2px 6px;">DEFAULT</span>'}
        </div>
      `).join('');

      container.querySelectorAll('.btn-del-repo').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          btn.disabled = true;
          try {
            await API.deleteExtensionRepo(id);
            Toast.show('Repository removed', 'info');
            await this.refreshRepoListModal();
            if (this.activeSubTab === 'extensions') {
              this.loadExtensions(true);
            }
          } catch (err) {
            Toast.show(err.message, 'error');
          }
        });
      });
    } catch (e) {
      container.innerHTML = `<div style="color: var(--accent-red); padding: 12px;">Error: ${e.message}</div>`;
    }
  }
};
