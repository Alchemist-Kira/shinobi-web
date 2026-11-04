// Mihon Web Migration Component — Conforming to Mihon Android Migration Architecture
const MigrationView = {
  activeView: 'sources', // 'sources' | 'manga_list' | 'search'
  sourcesList: [],
  sourcesSort: 'count', // 'count' | 'name'
  sourcesSortAsc: false,
  sourceSearchQuery: '',

  // Manga list state for selected source
  selectedSourceId: null,
  selectedSourceName: '',
  selectedSourceMeta: null,
  mangaList: [],
  mangaSearchQuery: '',
  selectedMangaIds: new Set(),

  // Single manga migration state
  migratingCurrentManga: null,
  searchQuery: '',
  targetSources: [],
  selectedTargetSourceId: 'all',
  searchResults: {}, // sourceId -> { status, items, error }
  isSearching: false,
  searchAbortController: null,

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  async init() {
    try {
      this.targetSources = await API.getSources();
    } catch (e) {
      console.warn('Could not load sources for migration:', e);
    }
  },

  async render(targetContainer = null) {
    const container = targetContainer || document.getElementById('browse-migration-section') || document.getElementById('view-migration');
    if (!container) return;

    if (this.activeView === 'sources') {
      await this.renderSourcesView(container);
    } else if (this.activeView === 'manga_list') {
      await this.renderMangaListView(container);
    } else if (this.activeView === 'search') {
      this.renderSearchView(container);
    }
  },

  // ==========================================
  // VIEW 1: SOURCES LIST (MigrateSourceTab)
  // ==========================================
  async renderSourcesView(container) {
    container.innerHTML = `
      <div class="migration-container" style="max-width: 1200px; margin: 0 auto; padding-bottom: 60px;">
        <!-- Header & Explanation -->
        <div class="migration-header-card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 22px 24px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(124, 58, 237, 0.15); color: var(--accent-primary); display: flex; align-items: center; justify-content: center;">
                  <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                    <path d="M16 3h5v5"></path>
                    <path d="M4 20L21 3"></path>
                    <path d="M21 16v5h-5"></path>
                    <path d="M15 15l6 6"></path>
                    <path d="M4 4l5 5"></path>
                  </svg>
                </div>
                <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0;">Source Migration</h2>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 6px; max-width: 650px;">
                Seamlessly transfer your library manga, read progress, bookmarks, and categories from one source to another without losing history.
              </p>
            </div>

            <div style="display: flex; gap: 10px; align-items: center;">
              <button class="btn btn-secondary" id="btn-refresh-migration-sources" style="padding: 7px 14px; font-size: 0.84rem; gap: 6px;" title="Refresh library sources">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <!-- Filter & Sort Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap; gap: 12px;">
            <div style="position: relative; width: 300px;">
              <svg viewBox="0 0 24 24" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; fill: none; stroke: var(--text-muted); stroke-width: 2;">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                id="migration-source-search" 
                class="search-input" 
                placeholder="Search sources with library manga..." 
                value="${this.escapeHtml(this.sourceSearchQuery)}" 
                style="width: 100%; padding-left: 36px; height: 38px; font-size: 0.86rem; border-radius: 8px;"
              />
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.82rem; color: var(--text-muted);">Sort by:</span>
              <select id="migration-source-sort" class="catalog-select" style="font-size: 0.82rem; padding: 6px 12px; height: 38px;">
                <option value="count_desc" ${this.sourcesSort === 'count' && !this.sourcesSortAsc ? 'selected' : ''}>Most Manga First</option>
                <option value="count_asc" ${this.sourcesSort === 'count' && this.sourcesSortAsc ? 'selected' : ''}>Fewest Manga First</option>
                <option value="name_asc" ${this.sourcesSort === 'name' && this.sourcesSortAsc ? 'selected' : ''}>Name (A-Z)</option>
                <option value="name_desc" ${this.sourcesSort === 'name' && !this.sourcesSortAsc ? 'selected' : ''}>Name (Z-A)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Sources Grid / List -->
        <div id="migration-sources-list" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            Loading sources with library manga...
          </div>
        </div>
      </div>
    `;

    this.bindSourcesEvents();
    await this.loadSourcesData();
  },

  async loadSourcesData() {
    const listContainer = document.getElementById('migration-sources-list');
    if (!listContainer) return;

    try {
      this.sourcesList = await API.getMigrationSources();
      this.updateBrowseBadge();
      this.renderSourcesList();
    } catch (e) {
      console.error('Failed to load migration sources:', e);
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); color: #f87171;">
            Failed to load library sources for migration. Please try again.
          </div>
        `;
      }
    }
  },

  updateBrowseBadge() {
    const countBadge = document.getElementById('migration-source-count');
    if (countBadge) {
      const count = (this.sourcesList || []).length;
      if (count > 0) {
        countBadge.style.display = 'inline-block';
        countBadge.textContent = count;
      } else {
        countBadge.style.display = 'none';
      }
    }
  },

  renderSourcesList() {
    const listContainer = document.getElementById('migration-sources-list');
    if (!listContainer) return;

    let items = [...(this.sourcesList || [])];

    // Filter by query
    if (this.sourceSearchQuery && this.sourceSearchQuery.trim()) {
      const q = this.sourceSearchQuery.toLowerCase().trim();
      items = items.filter(s => (s.name || s.id).toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q));
    }

    // Sort
    items.sort((a, b) => {
      if (this.sourcesSort === 'count') {
        const diff = (b.manga_count || 0) - (a.manga_count || 0);
        return this.sourcesSortAsc ? -diff : diff;
      } else {
        const nameA = (a.name || a.id).toLowerCase();
        const nameB = (b.name || b.id).toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return this.sourcesSortAsc ? cmp : -cmp;
      }
    });

    if (items.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); color: var(--text-muted);">
          <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
            ${this.sourceSearchQuery ? 'No matching sources found' : 'No library manga to migrate'}
          </div>
          <p style="font-size: 0.88rem; max-width: 440px; margin: 0 auto;">
            ${this.sourceSearchQuery ? 'Try clearing your search query.' : 'Add titles from online sources or local storage to your library to use source migration.'}
          </p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = items.map(s => `
      <div 
        class="migration-source-item" 
        data-source-id="${s.id}" 
        style="
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          background: var(--bg-surface); 
          border: 1px solid var(--border-subtle); 
          border-radius: var(--radius-md); 
          padding: 16px 20px; 
          cursor: pointer; 
          transition: all 0.18s ease;
        "
        onmouseenter="this.style.borderColor='var(--accent-primary)'; this.style.transform='translateX(4px)';"
        onmouseleave="this.style.borderColor='var(--border-subtle)'; this.style.transform='translateX(0)';"
      >
        <div style="display: flex; align-items: center; gap: 14px;">
          <img 
            src="${s.icon_url || '/static/img/default-cover.png'}" 
            alt="${this.escapeHtml(s.name)}" 
            style="width: 40px; height: 40px; border-radius: 8px; object-fit: contain; background: rgba(0,0,0,0.3); padding: 4px;"
            onerror="this.src='/static/img/default-cover.png'"
          />
          <div>
            <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span>${this.escapeHtml(s.name)}</span>
              <span style="font-size: 0.72rem; padding: 2px 7px; background: rgba(255,255,255,0.08); border-radius: 4px; color: var(--text-muted); font-weight: normal; text-transform: uppercase;">
                ${s.lang || 'all'}
              </span>
            </div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 3px;">
              Source ID: <code style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">${s.id}</code>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="
            font-size: 0.84rem; 
            font-weight: 600; 
            color: var(--accent-primary); 
            background: rgba(124, 58, 237, 0.12); 
            padding: 4px 12px; 
            border-radius: var(--radius-full);
          ">
            ${s.manga_count} ${s.manga_count === 1 ? 'manga' : 'manga'}
          </span>

          <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-surface-elevated); display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </div>
    `).join('');

    listContainer.querySelectorAll('.migration-source-item').forEach(item => {
      item.addEventListener('click', () => {
        const srcId = item.getAttribute('data-source-id');
        if (srcId) {
          this.openSource(srcId);
        }
      });
    });
  },

  bindSourcesEvents() {
    const searchInput = document.getElementById('migration-source-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.sourceSearchQuery = e.target.value;
        this.renderSourcesList();
      });
    }

    const sortSelect = document.getElementById('migration-source-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'count_desc') {
          this.sourcesSort = 'count';
          this.sourcesSortAsc = false;
        } else if (val === 'count_asc') {
          this.sourcesSort = 'count';
          this.sourcesSortAsc = true;
        } else if (val === 'name_asc') {
          this.sourcesSort = 'name';
          this.sourcesSortAsc = true;
        } else if (val === 'name_desc') {
          this.sourcesSort = 'name';
          this.sourcesSortAsc = false;
        }
        this.renderSourcesList();
      });
    }

    const refreshBtn = document.getElementById('btn-refresh-migration-sources');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadSourcesData();
      });
    }
  },

  // ==========================================
  // VIEW 2: MANGA LIST FOR SOURCE (MigrateMangaScreen)
  // ==========================================
  async openSource(sourceId) {
    this.selectedSourceId = sourceId;
    const sMeta = (this.sourcesList || []).find(s => s.id === sourceId);
    this.selectedSourceName = sMeta ? sMeta.name : sourceId.title();
    this.selectedSourceMeta = sMeta;
    this.selectedMangaIds.clear();
    this.mangaSearchQuery = '';
    this.activeView = 'manga_list';
    await this.render();
  },

  async renderMangaListView(container) {
    container.innerHTML = `
      <div class="migration-container" style="max-width: 1200px; margin: 0 auto; padding-bottom: 80px;">
        <!-- Top Navigation & Action Bar -->
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 18px 24px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <button class="btn btn-secondary" id="btn-back-to-migration-sources" style="padding: 7px 12px; font-size: 0.84rem; gap: 6px;">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>All Sources</span>
              </button>

              <div style="display: flex; align-items: center; gap: 10px;">
                <img 
                  src="${this.selectedSourceMeta?.icon_url || '/static/img/default-cover.png'}" 
                  alt="${this.escapeHtml(this.selectedSourceName)}" 
                  style="width: 28px; height: 28px; border-radius: 6px; object-fit: contain; background: rgba(0,0,0,0.3); padding: 2px;"
                  onerror="this.src='/static/img/default-cover.png'"
                />
                <div>
                  <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0;">${this.escapeHtml(this.selectedSourceName)}</h2>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 1px;">
                    Select manga to migrate to a new source
                  </div>
                </div>
              </div>
            </div>

            <!-- Selection Tools & Batch Migrate Button -->
            <div style="display: flex; align-items: center; gap: 10px;">
              <button class="btn btn-secondary" id="btn-toggle-select-all-manga" style="padding: 6px 12px; font-size: 0.82rem;">
                Select All
              </button>

              <button 
                class="btn btn-primary" 
                id="btn-batch-migrate" 
                style="display: none; padding: 7px 16px; font-size: 0.84rem; font-weight: 600; gap: 7px;"
              >
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <path d="M16 3h5v5"></path>
                  <path d="M4 20L21 3"></path>
                  <path d="M21 16v5h-5"></path>
                  <path d="M15 15l6 6"></path>
                  <path d="M4 4l5 5"></path>
                </svg>
                <span id="btn-batch-migrate-label">Migrate Selected</span>
              </button>
            </div>
          </div>

          <!-- Search Filter Input -->
          <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
            <div style="position: relative; width: 100%;">
              <svg viewBox="0 0 24 24" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; fill: none; stroke: var(--text-muted); stroke-width: 2;">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                id="migration-manga-filter" 
                class="search-input" 
                placeholder="Filter manga in ${this.escapeHtml(this.selectedSourceName)}..." 
                value="${this.escapeHtml(this.mangaSearchQuery)}" 
                style="width: 100%; padding-left: 36px; height: 38px; font-size: 0.86rem; border-radius: 8px;"
              />
            </div>
          </div>
        </div>

        <!-- Manga Items Grid -->
        <div id="migration-manga-grid" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            Loading library manga...
          </div>
        </div>
      </div>
    `;

    this.bindMangaListEvents();
    await this.loadMangaListData();
  },

  async loadMangaListData() {
    const grid = document.getElementById('migration-manga-grid');
    if (!grid) return;

    try {
      this.mangaList = await API.getMigrationManga(this.selectedSourceId);
      this.renderMangaGrid();
    } catch (e) {
      console.error('Failed to load manga for source:', e);
      if (grid) {
        grid.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); color: #f87171;">
            Failed to load manga list for this source.
          </div>
        `;
      }
    }
  },

  renderMangaGrid() {
    const grid = document.getElementById('migration-manga-grid');
    if (!grid) return;

    let items = [...(this.mangaList || [])];

    if (this.mangaSearchQuery && this.mangaSearchQuery.trim()) {
      const q = this.mangaSearchQuery.toLowerCase().trim();
      items = items.filter(m => (m.title || '').toLowerCase().includes(q) || (m.author || '').toLowerCase().includes(q));
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); color: var(--text-muted);">
          No manga found for "${this.escapeHtml(this.mangaSearchQuery)}" in this source.
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map(m => {
      const isSelected = this.selectedMangaIds.has(m.id);
      const chCount = m.chapter_count || 0;
      const readCount = m.read_chapters_count || 0;
      const unreadCount = Math.max(0, chCount - readCount);

      return `
        <div 
          class="migration-manga-row ${isSelected ? 'selected' : ''}" 
          data-manga-id="${m.id}"
          style="
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            background: ${isSelected ? 'rgba(124, 58, 237, 0.08)' : 'var(--bg-surface)'}; 
            border: 1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}; 
            border-radius: var(--radius-md); 
            padding: 12px 18px; 
            transition: all 0.16s ease;
          "
        >
          <!-- Left: Selection Checkbox & Manga Details -->
          <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
            <input 
              type="checkbox" 
              class="manga-select-checkbox" 
              data-manga-id="${m.id}" 
              ${isSelected ? 'checked' : ''} 
              style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);"
            />

            <img 
              src="${m.cover_url || '/static/img/default-cover.png'}" 
              alt="${this.escapeHtml(m.title)}" 
              loading="lazy" 
              style="width: 48px; height: 68px; border-radius: 6px; object-fit: cover; background: #111; flex-shrink: 0;"
              onerror="this.src='/static/img/default-cover.png'"
            />

            <div style="flex: 1; min-width: 0; padding-right: 12px;">
              <div 
                style="font-weight: 600; font-size: 0.96rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;"
                title="${this.escapeHtml(m.title)}"
                class="manga-title-click"
                data-manga-id="${m.id}"
              >
                ${this.escapeHtml(m.title)}
              </div>

              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.8rem; color: var(--text-secondary); flex-wrap: wrap;">
                ${m.author ? `<span>${this.escapeHtml(m.author)}</span> <span>•</span>` : ''}
                <span>${chCount} chapters</span>
                <span>•</span>
                <span style="color: ${unreadCount > 0 ? 'var(--accent-primary)' : 'var(--text-muted)'}; font-weight: 500;">
                  ${readCount} read (${unreadCount} unread)
                </span>
                ${m.category_name ? `
                  <span style="font-size: 0.72rem; padding: 1px 7px; background: rgba(255,255,255,0.06); border-radius: 4px; color: var(--text-muted);">
                    ${this.escapeHtml(m.category_name)}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Right: Individual Migrate Button -->
          <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
            <button 
              class="btn btn-secondary btn-migrate-single" 
              data-manga-id="${m.id}" 
              style="padding: 6px 14px; font-size: 0.82rem; font-weight: 600; gap: 6px;"
              title="Search for a replacement in another source"
            >
              <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M16 3h5v5"></path>
                <path d="M4 20L21 3"></path>
                <path d="M21 16v5h-5"></path>
                <path d="M15 15l6 6"></path>
                <path d="M4 4l5 5"></path>
              </svg>
              <span>Migrate</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.bindMangaRowEvents();
    this.updateBatchButton();
  },

  bindMangaRowEvents() {
    const grid = document.getElementById('migration-manga-grid');
    if (!grid) return;

    // Checkbox changes
    grid.querySelectorAll('.manga-select-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const mId = cb.getAttribute('data-manga-id');
        if (e.target.checked) {
          this.selectedMangaIds.add(mId);
        } else {
          this.selectedMangaIds.delete(mId);
        }
        this.renderMangaGrid();
      });
    });

    // Clicking single migrate button
    grid.querySelectorAll('.btn-migrate-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mId = btn.getAttribute('data-manga-id');
        const manga = (this.mangaList || []).find(m => m.id === mId);
        if (manga) {
          this.openSearchForManga(manga);
        }
      });
    });

    // Clicking title to open search
    grid.querySelectorAll('.manga-title-click').forEach(t => {
      t.addEventListener('click', () => {
        const mId = t.getAttribute('data-manga-id');
        const manga = (this.mangaList || []).find(m => m.id === mId);
        if (manga) {
          this.openSearchForManga(manga);
        }
      });
    });
  },

  bindMangaListEvents() {
    const backBtn = document.getElementById('btn-back-to-migration-sources');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.activeView = 'sources';
        this.render();
      });
    }

    const filterInput = document.getElementById('migration-manga-filter');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.mangaSearchQuery = e.target.value;
        this.renderMangaGrid();
      });
    }

    const selectAllBtn = document.getElementById('btn-toggle-select-all-manga');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        if (this.selectedMangaIds.size === (this.mangaList || []).length) {
          this.selectedMangaIds.clear();
          selectAllBtn.textContent = 'Select All';
        } else {
          (this.mangaList || []).forEach(m => this.selectedMangaIds.add(m.id));
          selectAllBtn.textContent = 'Deselect All';
        }
        this.renderMangaGrid();
      });
    }

    const batchBtn = document.getElementById('btn-batch-migrate');
    if (batchBtn) {
      batchBtn.addEventListener('click', () => {
        if (this.selectedMangaIds.size > 0) {
          this.openBatchMigrateModal();
        }
      });
    }
  },

  updateBatchButton() {
    const batchBtn = document.getElementById('btn-batch-migrate');
    const label = document.getElementById('btn-batch-migrate-label');
    const selectAllBtn = document.getElementById('btn-toggle-select-all-manga');

    if (selectAllBtn) {
      const isAll = (this.mangaList || []).length > 0 && this.selectedMangaIds.size === (this.mangaList || []).length;
      selectAllBtn.textContent = isAll ? 'Deselect All' : 'Select All';
    }

    if (batchBtn && label) {
      if (this.selectedMangaIds.size > 0) {
        batchBtn.style.display = 'inline-flex';
        label.textContent = `Migrate (${this.selectedMangaIds.size})`;
      } else {
        batchBtn.style.display = 'none';
      }
    }
  },

  // ==========================================
  // VIEW 3: MIGRATION SEARCH (MigrateSearchScreen)
  // ==========================================
  openSearchForManga(manga) {
    this.migratingCurrentManga = manga;
    this.searchQuery = manga.title || '';
    this.searchResults = {};
    this.isSearching = false;
    this.selectedTargetSourceId = 'all';

    // Open search overlay modal or view
    this.renderSearchModal();
    this.runGlobalSearch();
  },

  renderSearchModal() {
    let modal = document.getElementById('migration-search-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'migration-search-modal';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
    }

    const m = this.migratingCurrentManga;
    const sourcesOptions = (this.targetSources || [])
      .filter(s => s.id !== m.source) // filter out current source
      .map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${(s.lang || 'all').toUpperCase()})</option>`)
      .join('');

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 1000px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg);">
        <!-- Top Search Bar Header -->
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface-elevated);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--accent-primary); font-weight: 700;">Migrate Manga</span>
                <span style="font-size: 0.76rem; color: var(--text-muted);">•</span>
                <span style="font-size: 0.78rem; padding: 2px 7px; background: rgba(255,255,255,0.08); border-radius: 4px; color: var(--text-secondary);">
                  From: ${this.escapeHtml(m.source_name || m.source)}
                </span>
              </div>
              <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">
                ${this.escapeHtml(m.title)}
              </h2>
            </div>

            <button id="btn-close-migration-search" class="btn btn-secondary" style="padding: 6px 10px; font-size: 0.84rem;">
              ✕
            </button>
          </div>

          <!-- Search controls -->
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <div style="position: relative; flex: 1; min-width: 260px;">
              <svg viewBox="0 0 24 24" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; fill: none; stroke: var(--text-muted); stroke-width: 2;">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                id="modal-migrate-search-input" 
                class="search-input" 
                placeholder="Search matching manga in other sources..." 
                value="${this.escapeHtml(this.searchQuery)}" 
                style="width: 100%; padding-left: 38px; height: 42px; font-size: 0.9rem; border-radius: 8px;"
              />
            </div>

            <select id="modal-migrate-source-select" class="catalog-select" style="height: 42px; font-size: 0.86rem; min-width: 170px;">
              <option value="all">Search All Sources</option>
              ${sourcesOptions}
            </select>

            <button id="btn-modal-migrate-run-search" class="btn btn-primary" style="height: 42px; padding: 0 20px; font-weight: 600;">
              Search
            </button>
          </div>

          <!-- Progress indicator -->
          <div id="migrate-search-progress-wrap" style="display: none; margin-top: 12px;">
            <div style="height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
              <div id="migrate-search-progress-bar" style="height: 100%; width: 0%; background: var(--accent-primary); transition: width 0.2s ease;"></div>
            </div>
          </div>
        </div>

        <!-- Search Results Scroll Area -->
        <div id="migrate-search-results-list" style="flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 18px;">
          <!-- Dynamically populated -->
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    document.getElementById('btn-close-migration-search').addEventListener('click', () => {
      modal.style.display = 'none';
      if (this.searchAbortController) {
        this.searchAbortController.abort();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        if (this.searchAbortController) {
          this.searchAbortController.abort();
        }
      }
    });

    const searchInput = document.getElementById('modal-migrate-search-input');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.searchQuery = searchInput.value.trim();
        this.runGlobalSearch();
      }
    });

    const sourceSelect = document.getElementById('modal-migrate-source-select');
    sourceSelect.addEventListener('change', (e) => {
      this.selectedTargetSourceId = e.target.value;
      this.runGlobalSearch();
    });

    document.getElementById('btn-modal-migrate-run-search').addEventListener('click', () => {
      this.searchQuery = searchInput.value.trim();
      this.runGlobalSearch();
    });
  },

  async runGlobalSearch() {
    if (!this.searchQuery || !this.searchQuery.trim()) return;

    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();

    const resultsList = document.getElementById('migrate-search-results-list');
    const progressWrap = document.getElementById('migrate-search-progress-wrap');
    const progressBar = document.getElementById('migrate-search-progress-bar');

    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.width = '10%';

    this.isSearching = true;
    this.searchResults = {};

    // Filter available candidate sources
    let sourcesToSearch = (this.targetSources || []).filter(s => s.id !== this.migratingCurrentManga.source);
    if (this.selectedTargetSourceId !== 'all') {
      sourcesToSearch = sourcesToSearch.filter(s => s.id === this.selectedTargetSourceId);
    }

    if (sourcesToSearch.length === 0) {
      resultsList.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--text-muted);">
          No other sources available to search. Install extensions from Browse -> Extensions.
        </div>
      `;
      if (progressWrap) progressWrap.style.display = 'none';
      return;
    }

    // Initialize state
    sourcesToSearch.forEach(s => {
      this.searchResults[s.id] = { status: 'loading', items: [], error: '' };
    });

    this.renderSearchResultsCards();

    let completed = 0;
    const total = sourcesToSearch.length;

    // Concurrently search all target sources
    await Promise.all(
      sourcesToSearch.map(async (src) => {
        try {
          const res = await API.searchSource(src.id, this.searchQuery, 1);
          const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
          this.searchResults[src.id] = { status: 'success', items: items, error: '' };
        } catch (err) {
          if (err.name !== 'AbortError') {
            this.searchResults[src.id] = { status: 'error', items: [], error: err.message || 'Failed' };
          }
        } finally {
          completed++;
          if (progressBar) {
            progressBar.style.width = `${Math.round((completed / total) * 100)}%`;
          }
          this.updateSearchSourceCard(src.id);
        }
      })
    );

    this.isSearching = false;
    setTimeout(() => {
      if (progressWrap) progressWrap.style.display = 'none';
    }, 400);
  },

  renderSearchResultsCards() {
    const listWrap = document.getElementById('migrate-search-results-list');
    if (!listWrap) return;

    let sourcesToSearch = (this.targetSources || []).filter(s => s.id !== this.migratingCurrentManga.source);
    if (this.selectedTargetSourceId !== 'all') {
      sourcesToSearch = sourcesToSearch.filter(s => s.id === this.selectedTargetSourceId);
    }

    listWrap.innerHTML = sourcesToSearch.map(src => {
      const state = this.searchResults[src.id] || { status: 'loading', items: [] };
      return this.createSearchSourceSectionHtml(src, state);
    }).join('');

    this.bindSearchResultClickEvents();
  },

  updateSearchSourceCard(sourceId) {
    const cardEl = document.getElementById(`migrate-source-row-${sourceId}`);
    const src = (this.targetSources || []).find(s => s.id === sourceId);
    if (!src) return;

    const state = this.searchResults[sourceId] || { status: 'idle', items: [] };
    if (cardEl) {
      cardEl.outerHTML = this.createSearchSourceSectionHtml(src, state);
      this.bindSearchResultCardSingle(sourceId);
    }
  },

  createSearchSourceSectionHtml(source, state) {
    const hasItems = state.status === 'success' && state.items.length > 0;
    const isLoading = state.status === 'loading';
    const isError = state.status === 'error';
    const isEmpty = state.status === 'success' && state.items.length === 0;

    return `
      <div class="migrate-source-result-section" id="migrate-source-row-${source.id}" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img 
              src="${source.icon_url || '/static/img/default-cover.png'}" 
              alt="${this.escapeHtml(source.name)}" 
              style="width: 26px; height: 26px; border-radius: 6px; object-fit: contain; background: rgba(0,0,0,0.3); padding: 2px;"
              onerror="this.src='/static/img/default-cover.png'"
            />
            <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">${this.escapeHtml(source.name)}</span>
            <span style="font-size: 0.72rem; padding: 1px 6px; background: rgba(255,255,255,0.06); border-radius: 4px; color: var(--text-muted); text-transform: uppercase;">
              ${source.lang || 'all'}
            </span>
          </div>

          <div>
            ${isLoading ? `
              <span style="font-size: 0.8rem; color: var(--accent-primary); display: flex; align-items: center; gap: 6px;">
                <span class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
                Searching...
              </span>
            ` : hasItems ? `
              <span style="font-size: 0.8rem; color: var(--accent-primary); font-weight: 600; background: rgba(124, 58, 237, 0.12); padding: 2px 8px; border-radius: 4px;">
                ${state.items.length} ${state.items.length === 1 ? 'match' : 'matches'}
              </span>
            ` : isEmpty ? `
              <span style="font-size: 0.8rem; color: var(--text-muted);">No match</span>
            ` : isError ? `
              <span style="font-size: 0.8rem; color: #ef4444;">Search failed</span>
            ` : ''}
          </div>
        </div>

        <!-- Content: Horizontal Match Rail -->
        ${isLoading ? `
          <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px;">
            ${[1, 2, 3].map(() => `
              <div style="flex: 0 0 120px; width: 120px;">
                <div style="width: 120px; height: 170px; background: rgba(255,255,255,0.04); border-radius: 6px; animation: pulse 1.5s infinite;"></div>
                <div style="height: 12px; width: 80%; background: rgba(255,255,255,0.04); border-radius: 4px; margin-top: 6px;"></div>
              </div>
            `).join('')}
          </div>
        ` : hasItems ? `
          <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-behavior: smooth;">
            ${state.items.map(m => `
              <div 
                class="migrate-candidate-card" 
                data-source-id="${source.id}" 
                data-target-id="${m.id}" 
                style="flex: 0 0 125px; width: 125px; cursor: pointer; transition: transform 0.16s ease;"
                onmouseenter="this.style.transform='translateY(-3px)';"
                onmouseleave="this.style.transform='translateY(0)';"
              >
                <div style="position: relative; width: 125px; height: 175px; border-radius: 6px; overflow: hidden; background: #111; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                  <img 
                    src="${m.cover_url || '/static/img/default-cover.png'}" 
                    alt="${this.escapeHtml(m.title)}" 
                    loading="lazy" 
                    style="width: 100%; height: 100%; object-fit: cover;"
                    onerror="this.src='/static/img/default-cover.png'"
                  />
                  <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%);"></div>
                  <div style="position: absolute; bottom: 6px; left: 6px; right: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.68rem; color: #fff; font-weight: 600;">
                      ${m.status || ''}
                    </span>
                    <span style="font-size: 0.7rem; font-weight: 700; color: var(--accent-primary); background: #fff; border-radius: 4px; padding: 1px 5px;">
                      Select
                    </span>
                  </div>
                </div>
                <div style="margin-top: 6px; font-size: 0.82rem; font-weight: 500; color: var(--text-primary); line-height: 1.2; max-height: 2.4em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${this.escapeHtml(m.title)}">
                  ${this.escapeHtml(m.title)}
                </div>
              </div>
            `).join('')}
          </div>
        ` : isEmpty ? `
          <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.82rem; background: rgba(0,0,0,0.1); border-radius: 6px;">
            No results in ${this.escapeHtml(source.name)}
          </div>
        ` : isError ? `
          <div style="padding: 12px; text-align: center; color: #f87171; font-size: 0.82rem; background: rgba(239, 68, 68, 0.08); border-radius: 6px;">
            ${this.escapeHtml(state.error || 'Failed to search')}
          </div>
        ` : ''}
      </div>
    `;
  },

  bindSearchResultClickEvents() {
    (this.targetSources || []).forEach(s => this.bindSearchResultCardSingle(s.id));
  },

  bindSearchResultCardSingle(sourceId) {
    const cardEl = document.getElementById(`migrate-source-row-${sourceId}`);
    if (!cardEl) return;

    cardEl.querySelectorAll('.migrate-candidate-card').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target-id');
        const state = this.searchResults[sourceId];
        const targetManga = state?.items?.find(m => m.id === targetId);
        if (targetManga && this.migratingCurrentManga) {
          this.openMigrateDialog(this.migratingCurrentManga, targetManga, sourceId);
        }
      });
    });
  },

  // ==========================================
  // VIEW 4: MIGRATE MANGA DIALOG (MigrateMangaDialog)
  // ==========================================
  openMigrateDialog(currentManga, targetManga, targetSourceId) {
    let dialogModal = document.getElementById('migrate-action-dialog');
    if (!dialogModal) {
      dialogModal = document.createElement('div');
      dialogModal.id = 'migrate-action-dialog';
      dialogModal.className = 'modal-backdrop';
      dialogModal.style.zIndex = '10005';
      document.body.appendChild(dialogModal);
    }

    const targetSrcMeta = (this.targetSources || []).find(s => s.id === targetSourceId);
    const targetSourceName = targetSrcMeta ? targetSrcMeta.name : targetSourceId;
    const hasDownloads = (currentManga.downloaded_count || 0) > 0 || currentManga.source === 'local';
    const currChapters = currentManga.chapter_count || currentManga.chapters?.length || 0;
    const currRead = currentManga.read_chapters_count || 0;
    const targetChapters = targetManga.chapter_count || targetManga.chapters?.length || null;

    dialogModal.innerHTML = `
      <div class="modal-dialog" style="max-width: 640px; width: 92%; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg);">
        <!-- Title Header -->
        <div style="padding: 20px 24px 16px; border-bottom: 1px solid var(--border-subtle);">
          <h3 style="font-size: 1.18rem; font-weight: 700; color: var(--text-primary); margin: 0;">
            What to include in migration
          </h3>
          <p style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px;">
            Configure what reading data and metadata will be migrated to the target manga.
          </p>
        </div>

        <div style="padding: 20px 24px; max-height: 70vh; overflow-y: auto;">
          <!-- Visual Manga Comparison Card -->
          <div style="
            display: grid; 
            grid-template-columns: 1fr auto 1fr; 
            align-items: center; 
            gap: 16px; 
            background: var(--bg-surface-elevated); 
            border: 1px solid var(--border-subtle); 
            border-radius: var(--radius-md); 
            padding: 16px; 
            margin-bottom: 14px;
          ">
            <!-- Current Manga -->
            <div style="display: flex; gap: 10px; align-items: center; min-width: 0;">
              <img 
                src="${currentManga.cover_url || '/static/img/default-cover.png'}" 
                alt="${this.escapeHtml(currentManga.title)}" 
                style="width: 48px; height: 68px; border-radius: 6px; object-fit: cover; flex-shrink: 0;"
                onerror="this.src='/static/img/default-cover.png'"
              />
              <div style="min-width: 0;">
                <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Current</div>
                <div style="font-weight: 600; font-size: 0.86rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(currentManga.title)}">
                  ${this.escapeHtml(currentManga.title)}
                </div>
                <div style="font-size: 0.76rem; color: var(--accent-primary); margin-top: 2px;">
                  ${this.escapeHtml(currentManga.source_name || currentManga.source)}
                </div>
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                  ${currChapters > 0 ? `${currChapters} ch.` : 'Unknown ch.'} ${currRead > 0 ? `(${currRead} read)` : ''}
                </div>
              </div>
            </div>

            <!-- Direction Arrow -->
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(124, 58, 237, 0.15); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>

            <!-- Target Manga -->
            <div style="display: flex; gap: 10px; align-items: center; min-width: 0;">
              <img 
                src="${targetManga.cover_url || '/static/img/default-cover.png'}" 
                alt="${this.escapeHtml(targetManga.title)}" 
                style="width: 48px; height: 68px; border-radius: 6px; object-fit: cover; flex-shrink: 0;"
                onerror="this.src='/static/img/default-cover.png'"
              />
              <div style="min-width: 0;">
                <div style="font-size: 0.72rem; color: var(--accent-primary); font-weight: 600; text-transform: uppercase;">Target</div>
                <div style="font-weight: 600; font-size: 0.86rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(targetManga.title)}">
                  ${this.escapeHtml(targetManga.title)}
                </div>
                <div style="font-size: 0.76rem; color: var(--accent-primary); margin-top: 2px;">
                  ${this.escapeHtml(targetSourceName)}
                </div>
                <div id="dialog-target-ch-count" style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                  ${targetChapters !== null ? `${targetChapters} ch.` : 'Checking chapters...'}
                </div>
              </div>
            </div>
          </div>

          <!-- Chapter Discrepancy Warning Box (Mihon-standard safety feature) -->
          <div 
            id="dialog-chapter-discrepancy-warning" 
            style="
              display: ${targetChapters !== null && currChapters > 0 && targetChapters < currChapters ? 'flex' : 'none'}; 
              align-items: center; 
              gap: 10px; 
              padding: 10px 14px; 
              background: rgba(245, 158, 11, 0.12); 
              border: 1px solid rgba(245, 158, 11, 0.35); 
              border-radius: var(--radius-md); 
              margin-bottom: 16px;
              color: #fbbf24;
              font-size: 0.8rem;
            "
          >
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; flex-shrink: 0;">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span id="dialog-chapter-discrepancy-text">
              Target source has fewer chapters than current source (${targetChapters || '?'} vs ${currChapters}). Reading progress for higher chapters will not be transferred.
            </span>
          </div>

          <!-- Migration Flags Checkboxes (Mihon standard flags) -->
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;">
            <!-- Chapters Flag -->
            <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;">
              <input type="checkbox" id="flag-migrate-chapters" checked style="width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent-primary); cursor: pointer;" />
              <div>
                <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">Migrate Chapters</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                  Transfers chapter read status, bookmarks, and last read page progress by matching chapter numbers.
                </div>
              </div>
            </label>

            <!-- Categories Flag -->
            <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;">
              <input type="checkbox" id="flag-migrate-categories" checked style="width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent-primary); cursor: pointer;" />
              <div>
                <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">Migrate Categories</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                  Transfers library category assignments from the current manga to the target manga.
                </div>
              </div>
            </label>

            <!-- Custom Info Flag -->
            <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;">
              <input type="checkbox" id="flag-migrate-custom-info" checked style="width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent-primary); cursor: pointer;" />
              <div>
                <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">Migrate Custom Manga Info</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                  Transfers custom cover, title, description, author, artist, and genre overrides.
                </div>
              </div>
            </label>

            <!-- Delete Downloads Flag (Only shown if current has downloads) -->
            ${hasDownloads ? `
              <label style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;">
                <input type="checkbox" id="flag-delete-downloads" style="width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent-red, #ef4444); cursor: pointer;" />
                <div>
                  <div style="font-weight: 600; font-size: 0.88rem; color: var(--accent-red, #ef4444);">Delete downloaded chapters</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                    Permanently deletes downloaded CBZ archives and tasks of the current manga upon migration.
                  </div>
                </div>
              </label>
            ` : ''}
          </div>

          <div id="migration-executing-spinner" style="display: none; text-align: center; padding: 16px; color: var(--accent-primary); font-size: 0.9rem;">
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span>
              <span>Migrating manga and syncing chapters...</span>
            </div>
          </div>
        </div>

        <!-- Confirm Action Buttons -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface-elevated); flex-wrap: wrap; gap: 10px;">
          <!-- Show Target Preview Button -->
          <button id="btn-dialog-show-manga" class="btn btn-secondary" style="font-size: 0.84rem; padding: 8px 14px;">
            Show Manga
          </button>

          <div style="display: flex; gap: 10px; align-items: center;">
            <button id="btn-dialog-cancel" class="btn btn-secondary" style="font-size: 0.84rem; padding: 8px 14px;">
              Cancel
            </button>

            <!-- Copy Button (Keep current, add target) -->
            <button id="btn-dialog-copy" class="btn btn-secondary" style="font-size: 0.84rem; padding: 8px 16px; font-weight: 600;" title="Add target to library with progress, but keep original manga in library">
              Copy
            </button>

            <!-- Migrate Button (Replace current with target) -->
            <button id="btn-dialog-migrate" class="btn btn-primary" style="font-size: 0.84rem; padding: 8px 20px; font-weight: 600;" title="Replace original manga in library with target manga">
              Migrate
            </button>
          </div>
        </div>
      </div>
    `;

    dialogModal.style.display = 'flex';

    // Dynamically fetch target manga details/chapters count if not yet loaded
    if (!targetManga.chapter_count && !targetManga.chapters) {
      API.getMangaDetails(targetSourceId, targetManga.id).then(details => {
        if (details) {
          const tCount = details.chapter_count || (details.chapters ? details.chapters.length : 0);
          targetManga.chapter_count = tCount;
          targetManga.chapters = details.chapters;
          const countEl = document.getElementById('dialog-target-ch-count');
          if (countEl) countEl.textContent = `${tCount} ch.`;

          const warnBox = document.getElementById('dialog-chapter-discrepancy-warning');
          const warnText = document.getElementById('dialog-chapter-discrepancy-text');
          if (warnBox && currChapters > 0 && tCount > 0 && tCount < currChapters) {
            warnBox.style.display = 'flex';
            if (warnText) {
              warnText.textContent = `Target source has fewer chapters than current source (${tCount} vs ${currChapters}). Reading progress for higher chapters will not be transferred.`;
            }
          }
        }
      }).catch(() => {});
    }

    // Cancel
    const closeDialog = () => {
      dialogModal.style.display = 'none';
    };
    document.getElementById('btn-dialog-cancel').addEventListener('click', closeDialog);

    // Show Manga Preview
    document.getElementById('btn-dialog-show-manga').addEventListener('click', () => {
      closeDialog();
      const sModal = document.getElementById('migration-search-modal');
      if (sModal) sModal.style.display = 'none';
      Router.navigate(`manga/${targetSourceId}/${targetManga.id}`);
    });

    // Execute Copy
    document.getElementById('btn-dialog-copy').addEventListener('click', () => {
      this.executeMigration({
        currentManga,
        targetManga,
        targetSourceId,
        replace: false,
        onDone: () => {
          closeDialog();
          const sModal = document.getElementById('migration-search-modal');
          if (sModal) sModal.style.display = 'none';
        }
      });
    });

    // Execute Migrate (Replace)
    document.getElementById('btn-dialog-migrate').addEventListener('click', () => {
      this.executeMigration({
        currentManga,
        targetManga,
        targetSourceId,
        replace: true,
        onDone: () => {
          closeDialog();
          const sModal = document.getElementById('migration-search-modal');
          if (sModal) sModal.style.display = 'none';
        }
      });
    });
  },

  async executeMigration({ currentManga, targetManga, targetSourceId, replace, onDone }) {
    const chaptersFlag = document.getElementById('flag-migrate-chapters')?.checked ?? true;
    const categoriesFlag = document.getElementById('flag-migrate-categories')?.checked ?? true;
    const customInfoFlag = document.getElementById('flag-migrate-custom-info')?.checked ?? true;
    const deleteDownloadsFlag = document.getElementById('flag-delete-downloads')?.checked ?? false;

    const spinner = document.getElementById('migration-executing-spinner');
    if (spinner) spinner.style.display = 'block';

    const btnMigrate = document.getElementById('btn-dialog-migrate');
    const btnCopy = document.getElementById('btn-dialog-copy');
    if (btnMigrate) btnMigrate.disabled = true;
    if (btnCopy) btnCopy.disabled = true;

    try {
      const payload = {
        current_manga_id: currentManga.id,
        target_manga_id: targetManga.id,
        target_source: targetSourceId,
        replace: replace,
        flags: {
          chapters: chaptersFlag,
          categories: categoriesFlag,
          custom_info: customInfoFlag,
          delete_downloads: deleteDownloadsFlag
        }
      };

      const res = await API.migrateManga(payload);

      // Refresh global library state
      try {
        State.library = await API.getLibrary();
      } catch (e) {}

      State.showToast(replace ? `Migrated "${currentManga.title}" to ${targetSourceId}!` : `Copied "${currentManga.title}" to ${targetSourceId}!`);

      if (typeof onDone === 'function') onDone();

      // If active view is manga detail of migrated manga, navigate to new target
      if (State.currentTab === 'manga_detail' && MangaDetailView.manga && MangaDetailView.manga.id === currentManga.id) {
        Router.navigate(`manga/${targetSourceId}/${targetManga.id}`, true);
      } else if (this.activeView === 'manga_list') {
        await this.loadMangaListData();
      } else if (this.activeView === 'sources') {
        await this.loadSourcesData();
      }
    } catch (err) {
      console.error('Migration error:', err);
      State.showToast(`Migration failed: ${err.message || 'Unknown error'}`);
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (btnMigrate) btnMigrate.disabled = false;
      if (btnCopy) btnCopy.disabled = false;
    }
  },

  // ==========================================
  // VIEW 5: BATCH MIGRATION MODAL
  // ==========================================
  openBatchMigrateModal() {
    let modal = document.getElementById('batch-migrate-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'batch-migrate-modal';
      modal.className = 'modal-backdrop';
      modal.style.zIndex = '10006';
      document.body.appendChild(modal);
    }

    const count = this.selectedMangaIds.size;
    const sourcesOptions = (this.targetSources || [])
      .filter(s => s.id !== this.selectedSourceId)
      .map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${(s.lang || 'all').toUpperCase()})</option>`)
      .join('');

    modal.innerHTML = `
      <div class="modal-dialog" style="max-width: 580px; width: 92%; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg);">
        <div style="padding: 20px 24px 16px; border-bottom: 1px solid var(--border-subtle);">
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0;">
            Batch Migrate (${count} titles)
          </h3>
          <p style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px;">
            Migrate selected titles from ${this.escapeHtml(this.selectedSourceName)} to another source.
          </p>
        </div>

        <div style="padding: 20px 24px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 0.86rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
              Select Target Source:
            </label>
            <select id="batch-target-source-select" class="catalog-select" style="width: 100%; height: 42px; font-size: 0.88rem;">
              ${sourcesOptions}
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.86rem; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" id="batch-flag-chapters" checked style="width: 17px; height: 17px; accent-color: var(--accent-primary);" />
              <span>Migrate reading progress and bookmarks</span>
            </label>

            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.86rem; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" id="batch-flag-categories" checked style="width: 17px; height: 17px; accent-color: var(--accent-primary);" />
              <span>Migrate categories</span>
            </label>

            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.86rem; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" id="batch-flag-custom-info" checked style="width: 17px; height: 17px; accent-color: var(--accent-primary);" />
              <span>Migrate custom manga info (custom cover, title, metadata)</span>
            </label>

            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.86rem; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" id="batch-flag-delete-downloads" style="width: 17px; height: 17px; accent-color: var(--accent-red, #ef4444);" />
              <span style="color: var(--accent-red, #ef4444);">Delete downloaded chapters of original manga</span>
            </label>

            <label style="display: flex; align-items: center; gap: 10px; font-size: 0.86rem; color: var(--text-primary); cursor: pointer; padding-top: 6px; border-top: 1px solid var(--border-subtle);">
              <input type="checkbox" id="batch-flag-replace" checked style="width: 17px; height: 17px; accent-color: var(--accent-primary);" />
              <span>Replace originals in library (uncheck to Copy)</span>
            </label>
          </div>

          <!-- Progress Bar area -->
          <div id="batch-progress-section" style="display: none; padding: 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.84rem; margin-bottom: 6px;">
              <span id="batch-progress-status-text" style="color: var(--text-primary); font-weight: 500;">Starting migration...</span>
              <span id="batch-progress-pct" style="color: var(--accent-primary); font-weight: 600;">0%</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div id="batch-progress-bar" style="height: 100%; width: 0%; background: var(--accent-primary); transition: width 0.2s ease;"></div>
            </div>
            <div id="batch-log" style="font-size: 0.78rem; color: var(--text-muted); margin-top: 8px; max-height: 80px; overflow-y: auto;"></div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface-elevated);">
          <button id="btn-batch-modal-cancel" class="btn btn-secondary" style="font-size: 0.84rem; padding: 8px 14px;">
            Cancel
          </button>
          <button id="btn-batch-modal-start" class="btn btn-primary" style="font-size: 0.84rem; padding: 8px 20px; font-weight: 600;">
            Start Migration
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    document.getElementById('btn-batch-modal-cancel').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    document.getElementById('btn-batch-modal-start').addEventListener('click', () => {
      this.runBatchMigration();
    });
  },

  async runBatchMigration() {
    const targetSourceId = document.getElementById('batch-target-source-select')?.value;
    const chaptersFlag = document.getElementById('batch-flag-chapters')?.checked ?? true;
    const categoriesFlag = document.getElementById('batch-flag-categories')?.checked ?? true;
    const customInfoFlag = document.getElementById('batch-flag-custom-info')?.checked ?? true;
    const deleteDownloadsFlag = document.getElementById('batch-flag-delete-downloads')?.checked ?? false;
    const replaceFlag = document.getElementById('batch-flag-replace')?.checked ?? true;

    if (!targetSourceId) return;

    const progressSection = document.getElementById('batch-progress-section');
    const progressBar = document.getElementById('batch-progress-bar');
    const progressText = document.getElementById('batch-progress-status-text');
    const progressPct = document.getElementById('batch-progress-pct');
    const logBox = document.getElementById('batch-log');
    const startBtn = document.getElementById('btn-batch-modal-start');
    const cancelBtn = document.getElementById('btn-batch-modal-cancel');

    if (progressSection) progressSection.style.display = 'block';
    if (startBtn) startBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const selectedManga = (this.mangaList || []).filter(m => this.selectedMangaIds.has(m.id));
    const total = selectedManga.length;
    let completed = 0;
    let successful = 0;

    for (const manga of selectedManga) {
      if (progressText) progressText.textContent = `Searching match for "${manga.title}"...`;
      if (logBox) logBox.innerHTML += `<div>Searching match for: <b>${this.escapeHtml(manga.title)}</b>...</div>`;

      try {
        // Search target source for best match
        const searchRes = await API.searchSource(targetSourceId, manga.title, 1);
        const candidates = Array.isArray(searchRes?.items) ? searchRes.items : (Array.isArray(searchRes) ? searchRes : []);
        
        let match = null;
        if (candidates.length > 0) {
          // Exact title or first match
          const cleanTitle = manga.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          match = candidates.find(c => c.title.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTitle) || candidates[0];
        }

        if (match) {
          if (progressText) progressText.textContent = `Migrating "${manga.title}" -> "${match.title}"...`;
          await API.migrateManga({
            current_manga_id: manga.id,
            target_manga_id: match.id,
            target_source: targetSourceId,
            replace: replaceFlag,
            flags: {
              chapters: chaptersFlag,
              categories: categoriesFlag,
              custom_info: customInfoFlag,
              delete_downloads: deleteDownloadsFlag
            }
          });
          successful++;
          if (logBox) logBox.innerHTML += `<div style="color: var(--accent-green);">Matched & migrated to: <b>${this.escapeHtml(match.title)}</b></div>`;
        } else {
          if (logBox) logBox.innerHTML += `<div style="color: #f59e0b;">No match found for "${this.escapeHtml(manga.title)}" in target source. Skipped.</div>`;
        }
      } catch (err) {
        console.error(`Error migrating ${manga.title}:`, err);
        if (logBox) logBox.innerHTML += `<div style="color: #ef4444;">Failed to migrate "${this.escapeHtml(manga.title)}": ${err.message}</div>`;
      }

      completed++;
      const pct = Math.round((completed / total) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressPct) progressPct.textContent = `${pct}%`;
      if (logBox) logBox.scrollTop = logBox.scrollHeight;
    }

    if (progressText) progressText.textContent = `Batch migration finished: ${successful} of ${total} migrated!`;
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Close';
    }

    State.showToast(`Batch migration completed: ${successful} / ${total} migrated!`);

    // Refresh state
    try {
      State.library = await API.getLibrary();
    } catch (e) {}

    this.selectedMangaIds.clear();
    await this.loadMangaListData();
  }
};
