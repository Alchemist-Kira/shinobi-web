// Mihon Web Library View Component
const LibraryView = {
  activeFilter: 'all',
  searchQuery: '',
  categories: [],
  isSelectMode: false,
  selectedIds: new Set(),

  settings: {
    // Filter tri-state: 'any' | 'included' | 'excluded'
    filterDownloaded: 'any',
    filterUnread: 'any',
    filterStarted: 'any',
    filterBookmarked: 'any',
    filterCompleted: 'any',
    filterSource: 'any', // 'any' | 'local' | 'online'

    // Sort: 'alphabetical' | 'total_chapters' | 'last_read' | 'last_updated' | 'unread_count' | 'date_added'
    sortType: 'alphabetical',
    sortAsc: true,

    // Display: 'comfortable' | 'compact' | 'cover_only' | 'list'
    displayMode: 'comfortable',
    showUnreadBadge: true,
    showCategoryBadge: true,

    // Active Category Filter: 'all' | 'cat:<id>'
    activeFilter: 'all'
  },
  activeOptionsTab: 'filter',

  loadSettings() {
    try {
      let parsed = null;
      const s = localStorage.getItem('mihon_library_settings');
      if (s) {
        parsed = JSON.parse(s);
      } else if (typeof State !== 'undefined' && State.settings && State.settings.library_filter_settings) {
        try {
          parsed = JSON.parse(State.settings.library_filter_settings);
        } catch (e) {}
      }

      if (parsed) {
        this.settings = { ...this.settings, ...parsed };
        if (parsed.activeFilter) {
          this.activeFilter = parsed.activeFilter;
        }
      }
    } catch (e) {}
  },

  saveSettings() {
    try {
      this.settings.activeFilter = this.activeFilter || 'all';
      const serialized = JSON.stringify(this.settings);
      localStorage.setItem('mihon_library_settings', serialized);

      // Async synchronize to backend server settings for cross-device & cross-session persistence
      if (typeof API !== 'undefined' && API.saveSettings) {
        API.saveSettings({ library_filter_settings: serialized }).catch(() => {});
      }
    } catch (e) {}
  },

  hasActiveFilters() {
    const s = this.settings;
    return s.filterDownloaded !== 'any' ||
           s.filterUnread !== 'any' ||
           s.filterStarted !== 'any' ||
           s.filterBookmarked !== 'any' ||
           s.filterCompleted !== 'any' ||
           s.filterSource !== 'any';
  },

  resetFilters() {
    this.settings.filterDownloaded = 'any';
    this.settings.filterUnread = 'any';
    this.settings.filterStarted = 'any';
    this.settings.filterBookmarked = 'any';
    this.settings.filterCompleted = 'any';
    this.settings.filterSource = 'any';
    this.saveSettings();
    this.renderGrid();
    this.updateFilterButtonState();
  },

  updateFilterButtonState() {
    const btn = document.getElementById('btn-library-filter');
    const dot = document.getElementById('library-filter-dot');
    const hasFilters = this.hasActiveFilters();
    if (btn) btn.classList.toggle('has-active-filters', hasFilters);
    if (dot) dot.style.display = hasFilters ? 'inline-block' : 'none';
  },

  async render() {
    const container = document.getElementById('view-library');
    if (!container) return;

    this.loadSettings();

    try {
      this.categories = await API.getCategories();
    } catch (err) {
      console.warn('Could not load categories:', err);
      this.categories = [{ id: 'default', name: 'Default', sort_order: 0 }];
    }

    // Validate that if activeFilter points to a specific category, that category still exists
    if (this.activeFilter && this.activeFilter.startsWith('cat:')) {
      const targetCatId = this.activeFilter.replace('cat:', '');
      const exists = (this.categories || []).some(c => c.id === targetCatId);
      if (!exists) {
        this.activeFilter = 'all';
        this.settings.activeFilter = 'all';
        this.saveSettings();
      }
    }

    container.innerHTML = `
      <div class="lib-wrapper">
        <!-- Unified Library Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">Library</h1>
            </div>

            <div class="lib-toolbar-actions">
              <!-- Integrated Search Box with Shortcut Badge & Clear Button -->
              <div class="lib-search-shell">
                <svg viewBox="0 0 24 24" class="lib-search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  id="library-search-input" 
                  class="lib-search-input" 
                  placeholder="Search library, title or author..." 
                  value="${this.escapeHtml(this.searchQuery)}"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="lib-search-clear" id="btn-library-search-clear" type="button" title="Clear search (Esc)" style="display: ${this.searchQuery ? 'inline-flex' : 'none'};">
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <kbd class="lib-search-kbd" title="Press / to focus search">/</kbd>
              </div>

              <!-- Quick Action Icon Buttons -->
              <button class="lib-action-btn ${this.hasActiveFilters() ? 'has-active-filters' : ''}" id="btn-library-filter" type="button" title="Filter, Sort & Display Settings">
                <svg viewBox="0 0 24 24">
                  <line x1="4" y1="21" x2="4" y2="14"></line>
                  <line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line>
                  <line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line>
                  <line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
                <span class="lib-action-dot" id="library-filter-dot" style="display: ${this.hasActiveFilters() ? 'block' : 'none'};"></span>
              </button>

              <button class="lib-action-btn" id="btn-update-library" type="button" title="Scan & Check Updates">
                <svg viewBox="0 0 24 24" id="update-library-icon">
                  <path d="M21.5 2v6h-6"></path>
                  <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
              </button>

              <button class="lib-action-btn" id="btn-manage-categories" type="button" title="Manage Categories">
                <svg viewBox="0 0 24 24">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
              </button>

              <button class="lib-action-btn ${State.incognitoMode ? 'incognito-active' : ''}" id="btn-toggle-incognito-lib" type="button" title="Incognito Mode: Suspends history & progress tracking">
                <svg viewBox="0 0 24 24">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <!-- Bottom Row: Navigation Tabs with Live Counts & Underline Indicator -->
          <div class="lib-tabs-track" id="library-tabs-header">
            ${this.renderTabsHtml()}
          </div>
        </header>

        <!-- Library Content Area -->
        <div class="lib-content-area">
          <!-- Manga Grid -->
          <div class="manga-grid" id="library-grid">
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
              Loading collection...
            </div>
          </div>
        </div>

        <!-- Floating Batch Action Bar -->
        <div id="library-batch-bar" class="floating-batch-bar ${this.isSelectMode ? 'active' : ''}">
          <div class="batch-bar-count" id="batch-bar-count-text">${this.selectedIds.size} Selected</div>
          <button class="batch-bar-btn" id="btn-batch-select-all" type="button" title="Select or deselect all items in current view">
            <span id="btn-batch-select-all-text">Select All</span>
          </button>
          <button class="batch-bar-btn" id="btn-batch-category" type="button" title="Assign categories to selected manga">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Category</span>
          </button>
          <button class="batch-bar-btn" id="btn-batch-mark-read" type="button" title="Mark all chapters as read">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Mark Read</span>
          </button>
          <button class="batch-bar-btn" id="btn-batch-mark-unread" type="button" title="Mark all chapters as unread">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
            <span>Mark Unread</span>
          </button>
          <button class="batch-bar-btn" id="btn-batch-download" type="button" title="Download next unread chapter">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download Next</span>
          </button>
          <button class="batch-bar-btn btn-batch-danger" id="btn-batch-remove" type="button" title="Remove selected from library">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Remove</span>
          </button>
          <button class="batch-bar-btn" id="btn-batch-cancel" type="button" style="margin-left: 6px;">
            <span>Done</span>
          </button>
        </div>
      </div>
    `;

    this.bindTabEvents();

    const searchInput = document.getElementById('library-search-input');
    const clearBtn = document.getElementById('btn-library-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (clearBtn) {
          clearBtn.style.display = this.searchQuery ? 'inline-flex' : 'none';
        }
        this.renderGrid();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.searchQuery = '';
          searchInput.value = '';
          if (clearBtn) clearBtn.style.display = 'none';
          searchInput.blur();
          this.renderGrid();
        } else if (e.key === 'Enter') {
          const q = searchInput.value.trim();
          if (q && !this.getFilteredManga().length) {
            Router.navigate(`globalsearch/${encodeURIComponent(q)}`);
          }
        }
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        this.searchQuery = '';
        searchInput.value = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        this.renderGrid();
      });
    }

    // Keyboard shortcut: '/' to focus library search
    if (!this._hasBoundSlashShortcut) {
      this._hasBoundSlashShortcut = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && State.currentTab === 'library') {
          const activeTag = (document.activeElement?.tagName || '').toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            const sInput = document.getElementById('library-search-input');
            if (sInput) {
              sInput.focus();
              sInput.select();
            }
          }
        }
      });
    }

    const filterBtn = document.getElementById('btn-library-filter');
    if (filterBtn) {
      filterBtn.addEventListener('click', () => {
        this.openLibraryOptionsModal();
      });
    }

    const manageBtn = document.getElementById('btn-manage-categories');
    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        this.openManageCategoriesModal();
      });
    }

    const updateBtn = document.getElementById('btn-update-library');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        this.handleUpdateLibrary();
      });
    }

    const selectToggleBtn = document.getElementById('btn-toggle-select-mode');
    if (selectToggleBtn) {
      selectToggleBtn.addEventListener('click', () => {
        this.toggleSelectMode();
      });
    }

    const incognitoBtn = document.getElementById('btn-toggle-incognito-lib');
    if (incognitoBtn) {
      incognitoBtn.addEventListener('click', () => {
        State.incognitoMode = !State.incognitoMode;
        localStorage.setItem('shinobi_incognito', State.incognitoMode ? 'true' : 'false');
        incognitoBtn.classList.toggle('incognito-active', State.incognitoMode);
        const topBtn = document.getElementById('btn-toggle-incognito');
        const topText = document.getElementById('incognito-btn-text');
        if (topBtn) {
          topBtn.style.color = State.incognitoMode ? '#c084fc' : '';
          topBtn.style.borderColor = State.incognitoMode ? 'rgba(168, 85, 247, 0.6)' : '';
          topBtn.style.background = State.incognitoMode ? 'rgba(168, 85, 247, 0.18)' : '';
        }
        if (topText) {
          topText.textContent = State.incognitoMode ? 'Incognito ON' : 'Incognito';
        }
        if (typeof Toast !== 'undefined') {
          Toast.show(
            State.incognitoMode ? 'Incognito Mode enabled' : 'Incognito Mode disabled',
            State.incognitoMode ? 'info' : 'success'
          );
        }
      });
    }

    // Batch Bar Events
    const btnBatchCancel = document.getElementById('btn-batch-cancel');
    if (btnBatchCancel) {
      btnBatchCancel.addEventListener('click', () => this.toggleSelectMode(false));
    }

    const btnBatchSelectAll = document.getElementById('btn-batch-select-all');
    if (btnBatchSelectAll) {
      btnBatchSelectAll.addEventListener('click', () => this.handleBatchSelectAll());
    }

    const btnBatchCat = document.getElementById('btn-batch-category');
    if (btnBatchCat) {
      btnBatchCat.addEventListener('click', () => this.openBatchCategoryModal());
    }

    const btnBatchRead = document.getElementById('btn-batch-mark-read');
    if (btnBatchRead) {
      btnBatchRead.addEventListener('click', () => this.handleBatchMarkRead(true));
    }

    const btnBatchUnread = document.getElementById('btn-batch-mark-unread');
    if (btnBatchUnread) {
      btnBatchUnread.addEventListener('click', () => this.handleBatchMarkRead(false));
    }

    const btnBatchDl = document.getElementById('btn-batch-download');
    if (btnBatchDl) {
      btnBatchDl.addEventListener('click', () => this.handleBatchDownloadNext());
    }

    const btnBatchRm = document.getElementById('btn-batch-remove');
    if (btnBatchRm) {
      btnBatchRm.addEventListener('click', () => this.handleBatchRemove());
    }

    await this.loadData();
  },

  toggleSelectMode(enable) {
    this.isSelectMode = (enable !== undefined) ? !!enable : !this.isSelectMode;
    if (!this.isSelectMode) {
      this.selectedIds.clear();
      const grid = document.getElementById('library-grid');
      if (grid) {
        grid.querySelectorAll('.manga-card.selected').forEach(c => c.classList.remove('selected'));
      }
    }
    const bar = document.getElementById('library-batch-bar');
    if (bar) bar.classList.toggle('active', this.isSelectMode);

    this.updateBatchBar();
  },

  updateBatchBar() {
    const countText = document.getElementById('batch-bar-count-text');
    if (countText) {
      countText.textContent = `${this.selectedIds.size} Selected`;
    }
    const selectAllText = document.getElementById('btn-batch-select-all-text');
    if (selectAllText) {
      const visibleItems = this.getFilteredManga();
      const allSelected = visibleItems.length > 0 && visibleItems.every(m => this.selectedIds.has(m.id));
      selectAllText.textContent = allSelected ? 'Deselect All' : 'Select All';
    }
    const btnMarkRead = document.getElementById('btn-batch-mark-read');
    const btnMarkUnread = document.getElementById('btn-batch-mark-unread');
    if (btnMarkRead && btnMarkUnread && this.selectedIds.size > 0) {
      let hasUnread = false;
      let hasRead = false;
      for (const id of this.selectedIds) {
        const m = (State.library || []).find(item => item.id === id);
        if (m) {
          const unread = this.getFilteredUnreadCount(m);
          if (unread > 0) hasUnread = true;
          if ((m.read_chapters_count || 0) > 0) hasRead = true;
        }
      }
      btnMarkRead.style.display = hasUnread ? 'inline-flex' : 'none';
      btnMarkUnread.style.display = hasRead ? 'inline-flex' : 'none';
    } else if (btnMarkRead && btnMarkUnread) {
      btnMarkRead.style.display = '';
      btnMarkUnread.style.display = '';
    }
    const bar = document.getElementById('library-batch-bar');
    if (bar && this.isSelectMode) {
      bar.classList.add('active');
    }
  },

  getFilteredManga() {
    let items = State.library || [];
    if (this.activeFilter && this.activeFilter.startsWith('cat:')) {
      const targetCatId = this.activeFilter.replace('cat:', '');
      items = items.filter(m => {
        const ids = Array.isArray(m.category_ids) && m.category_ids.length > 0
          ? m.category_ids
          : [(m.category_id || 'default')];
        return ids.includes(targetCatId);
      });
    }

    const s = this.settings;
    if (s.filterDownloaded === 'included') items = items.filter(m => (m.downloaded_count || 0) > 0 || m.source === 'local');
    else if (s.filterDownloaded === 'excluded') items = items.filter(m => !((m.downloaded_count || 0) > 0 || m.source === 'local'));

    if (s.filterUnread === 'included') items = items.filter(m => this.getFilteredUnreadCount(m) > 0);
    else if (s.filterUnread === 'excluded') items = items.filter(m => this.getFilteredUnreadCount(m) === 0);

    if (s.filterStarted === 'included') items = items.filter(m => (m.read_chapters_count || 0) > 0);
    else if (s.filterStarted === 'excluded') items = items.filter(m => (m.read_chapters_count || 0) === 0);

    if (s.filterBookmarked === 'included') items = items.filter(m => !!(m.has_bookmarks || m.is_bookmarked));
    else if (s.filterBookmarked === 'excluded') items = items.filter(m => !(m.has_bookmarks || m.is_bookmarked));

    if (s.filterCompleted === 'included') items = items.filter(m => (m.status || '').toLowerCase() === 'completed');
    else if (s.filterCompleted === 'excluded') items = items.filter(m => (m.status || '').toLowerCase() !== 'completed');

    if (s.filterSource === 'local') items = items.filter(m => m.source === 'local');
    else if (s.filterSource === 'online') items = items.filter(m => m.source !== 'local');

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(m => (m.title || '').toLowerCase().includes(q));
    }
    return items;
  },

  handleBatchSelectAll() {
    const visible = this.getFilteredManga();
    const allSelected = visible.length > 0 && visible.every(m => this.selectedIds.has(m.id));
    const grid = document.getElementById('library-grid');
    if (allSelected) {
      visible.forEach(m => this.selectedIds.delete(m.id));
      if (grid) {
        grid.querySelectorAll('.manga-card.selected').forEach(c => c.classList.remove('selected'));
      }
      if (this.selectedIds.size === 0) {
        this.toggleSelectMode(false);
        return;
      }
    } else {
      visible.forEach(m => this.selectedIds.add(m.id));
      if (grid) {
        grid.querySelectorAll('.manga-card').forEach(c => c.classList.add('selected'));
      }
    }
    this.updateBatchBar();
  },

  openBatchCategoryModal() {
    if (this.selectedIds.size === 0) {
      if (typeof Toast !== 'undefined') Toast.show('No manga selected', 'info');
      return;
    }
    const container = this.getModalHost();
    const categoryListHtml = (this.categories || []).map(cat => {
      return `
        <label class="category-choice-item" data-cat-id="${cat.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="cat-batch-checkbox" data-cat-id="${cat.id}" style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;" />
            <span style="font-weight: 500; font-size: 0.92rem; color: #fff;">${this.escapeHtml(cat.name)}</span>
          </div>
        </label>
      `;
    }).join('');

    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="batch-cat-backdrop">
        <div class="mihon-dialog-card" style="max-width: 420px;">
          <div class="mihon-dialog-header">
            <div>
              <div class="mihon-dialog-title">Assign Categories</div>
              <div class="mihon-dialog-subtitle">Set categories for ${this.selectedIds.size} selected titles</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-batch-cat">&times;</button>
          </div>
          <div class="mihon-dialog-body" style="display: flex; flex-direction: column; max-height: 360px; overflow-y: auto;">
            ${categoryListHtml}
          </div>
          <div class="mihon-dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
            <button class="btn btn-secondary" id="btn-cancel-batch-cat">Cancel</button>
            <button class="btn btn-primary" id="btn-save-batch-cat" style="padding: 6px 18px; font-weight: 600;">Apply to ${this.selectedIds.size} Manga</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { container.innerHTML = ''; };
    document.getElementById('batch-cat-backdrop').onclick = (e) => { if (e.target.id === 'batch-cat-backdrop') close(); };
    document.getElementById('btn-close-batch-cat').onclick = close;
    document.getElementById('btn-cancel-batch-cat').onclick = close;

    document.getElementById('btn-save-batch-cat').onclick = async () => {
      const selectedCats = Array.from(container.querySelectorAll('.cat-batch-checkbox:checked')).map(cb => cb.getAttribute('data-cat-id'));
      if (selectedCats.length === 0) {
        selectedCats.push('default');
      }
      try {
        await API.batchSetCategories(Array.from(this.selectedIds), selectedCats);
        if (typeof Toast !== 'undefined') Toast.show(`Updated categories for ${this.selectedIds.size} titles`, 'success');
        close();
        this.toggleSelectMode(false);
        await this.loadData();
      } catch (err) {
        if (typeof Toast !== 'undefined') Toast.show('Failed to update categories', 'error');
      }
    };
  },

  async handleBatchMarkRead(isRead) {
    if (this.selectedIds.size === 0) {
      if (typeof Toast !== 'undefined') Toast.show('No manga selected', 'info');
      return;
    }
    const count = this.selectedIds.size;
    try {
      await API.batchMarkRead(Array.from(this.selectedIds), isRead);
      if (typeof Toast !== 'undefined') Toast.show(`Marked ${count} titles as ${isRead ? 'read' : 'unread'}`, 'success');
      this.toggleSelectMode(false);
      await this.loadData();
    } catch (err) {
      if (typeof Toast !== 'undefined') Toast.show('Failed to update reading status', 'error');
    }
  },

  async handleBatchDownloadNext() {
    if (this.selectedIds.size === 0) {
      if (typeof Toast !== 'undefined') Toast.show('No manga selected', 'info');
      return;
    }
    const count = this.selectedIds.size;
    try {
      const res = await API.batchDownloadNext(Array.from(this.selectedIds), 1);
      if (typeof Toast !== 'undefined') Toast.show(`Queued ${res.queued_count || count} chapter download(s) across selected titles`, 'success');
      this.toggleSelectMode(false);
    } catch (err) {
      if (typeof Toast !== 'undefined') Toast.show('Failed to queue downloads', 'error');
    }
  },

  async handleBatchRemove() {
    if (this.selectedIds.size === 0) {
      if (typeof Toast !== 'undefined') Toast.show('No manga selected', 'info');
      return;
    }
    const count = this.selectedIds.size;
    const container = this.getModalHost();
    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="batch-rm-backdrop">
        <div class="mihon-dialog-card" style="max-width: 420px;">
          <div class="mihon-dialog-header">
            <div>
              <div class="mihon-dialog-title" style="color: var(--accent-red);">Remove from Library</div>
              <div class="mihon-dialog-subtitle">Are you sure you want to remove ${count} selected titles?</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-batch-rm">&times;</button>
          </div>
          <div class="mihon-dialog-body" style="padding-top: 10px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px 0;">
              <input type="checkbox" id="batch-rm-delete-files" style="width: 17px; height: 17px; accent-color: var(--accent-red);" />
              <span style="font-size: 0.88rem; color: var(--text-secondary);">Also delete downloaded chapters from disk</span>
            </label>
          </div>
          <div class="mihon-dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
            <button class="btn btn-secondary" id="btn-cancel-batch-rm">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-batch-rm" style="background: var(--accent-red); border-color: var(--accent-red); padding: 6px 18px; font-weight: 600;">Remove</button>
          </div>
        </div>
      </div>
    `;

    const close = () => { container.innerHTML = ''; };
    document.getElementById('batch-rm-backdrop').onclick = (e) => { if (e.target.id === 'batch-rm-backdrop') close(); };
    document.getElementById('btn-close-batch-rm').onclick = close;
    document.getElementById('btn-cancel-batch-rm').onclick = close;

    document.getElementById('btn-confirm-batch-rm').onclick = async () => {
      const deleteChapters = document.getElementById('batch-rm-delete-files').checked;
      try {
        await API.batchRemoveFromLibrary(Array.from(this.selectedIds), deleteChapters);
        if (typeof Toast !== 'undefined') Toast.show(`Removed ${count} titles from library`, 'success');
        close();
        this.toggleSelectMode(false);
        await this.loadData();
      } catch (err) {
        if (typeof Toast !== 'undefined') Toast.show('Failed to remove selected titles', 'error');
      }
    };
  },

  async handleUpdateLibrary() {
    const btn = document.getElementById('btn-update-library');
    const icon = document.getElementById('update-library-icon');
    const text = document.getElementById('update-library-text');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    if (icon) icon.classList.add('spin-rotating');
    if (text) text.textContent = 'Starting...';

    try {
      const res = await API.updateLibrary();
      if (!res.success && !res.is_updating) {
        if (typeof Toast !== 'undefined') Toast.show(res.message || 'Could not start library update', 'error');
        btn.disabled = false;
        if (icon) icon.classList.remove('spin-rotating');
        if (text) text.textContent = 'Check Updates';
        return;
      }

      const pollTimer = setInterval(async () => {
        try {
          const status = await API.getLibraryUpdateStatus();
          if (status.is_updating) {
            const prog = status.progress || {};
            if (text) {
              const cur = prog.current || 0;
              const tot = prog.total || 0;
              text.textContent = tot > 0 ? `Checking (${cur}/${tot})...` : 'Checking...';
            }
          } else {
            clearInterval(pollTimer);
            btn.disabled = false;
            if (icon) icon.classList.remove('spin-rotating');
            if (text) text.textContent = 'Check Updates';

            await this.loadData();
            const lastRes = status.last_result || {};
            const newCh = lastRes.new_chapters_total || 0;
            const updatedManga = lastRes.updated_manga_count || 0;
            if (typeof Toast !== 'undefined') {
              if (newCh > 0) {
                Toast.show(`Found ${newCh} new chapter${newCh > 1 ? 's' : ''} across ${updatedManga} title${updatedManga > 1 ? 's' : ''}`, 'success');
              } else {
                Toast.show('Library is up to date', 'info');
              }
            }
          }
        } catch (pollErr) {
          console.error('Error polling update status:', pollErr);
        }
      }, 1500);
    } catch (err) {
      console.error('Update error:', err);
      if (typeof Toast !== 'undefined') Toast.show('Failed to check library updates', 'error');
      btn.disabled = false;
      if (icon) icon.classList.remove('spin-rotating');
      if (text) text.textContent = 'Check Updates';
    }
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

  getCategoryCount(catId) {
    const library = State.library || [];
    if (catId === 'all') return library.length;
    return library.filter(m => {
      const ids = Array.isArray(m.category_ids) && m.category_ids.length > 0
        ? m.category_ids
        : [(m.category_id || 'default')];
      return ids.includes(catId);
    }).length;
  },

  renderTabsHtml() {
    const allCount = this.getCategoryCount('all');
    let html = `
      <button class="lib-nav-tab ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all" type="button">
        <span class="lib-tab-label">All</span>
        <span class="lib-tab-count">${allCount}</span>
        <span class="lib-tab-indicator"></span>
      </button>
    `;

    // Add category tabs
    (this.categories || []).forEach(cat => {
      const filterKey = `cat:${cat.id}`;
      const isActive = this.activeFilter === filterKey;
      const count = this.getCategoryCount(cat.id);
      html += `
        <button class="lib-nav-tab ${isActive ? 'active' : ''}" data-filter="${filterKey}" type="button">
          <span class="lib-tab-label">${this.escapeHtml(cat.name)}</span>
          <span class="lib-tab-count">${count}</span>
          <span class="lib-tab-indicator"></span>
        </button>
      `;
    });

    return html;
  },

  bindTabEvents() {
    const tabsContainer = document.getElementById('library-tabs-header');
    if (!tabsContainer) return;

    tabsContainer.querySelectorAll('.lib-nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.lib-nav-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.getAttribute('data-filter');
        this.saveSettings();
        this.renderGrid();
      });
    });
  },

  updateTabs() {
    const tabsContainer = document.getElementById('library-tabs-header');
    if (tabsContainer) {
      tabsContainer.innerHTML = this.renderTabsHtml();
      this.bindTabEvents();
    }
  },

  async loadData() {
    try {
      this.loadSettings();
      const items = await API.getLibrary();
      State.library = items;
      this.updateTabs();
      this.updateStatsRibbon();
      this.renderGrid();
    } catch (err) {
      console.error('Failed to load library:', err);
      const grid = document.getElementById('library-grid');
      if (grid) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent-red);">
            Failed to load library items. Please check server.
          </div>
        `;
      }
    }
  },

  updateStatsRibbon() {
    // Stats section removed from Library view
  },

  getFilteredChapterCount(manga) {
    if (!manga) return 0;
    // 1. Check cached filtered count from manga_detail
    const cached = localStorage.getItem(`mihon_chapter_filtered_count_${manga.id}`);
    if (cached !== null) {
      const parsed = parseInt(cached, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }

    // 2. Check per-manga filter settings from localStorage
    const rawSettings = localStorage.getItem(`mihon_chapter_settings_${manga.id}`);
    if (rawSettings && manga.chapters_json) {
      try {
        const s = JSON.parse(rawSettings);
        let chs = typeof manga.chapters_json === 'string' ? JSON.parse(manga.chapters_json) : manga.chapters_json;
        if (Array.isArray(chs) && chs.length > 0) {
          // Excluded scanlators filter
          if (Array.isArray(s.excludedScanlators) && s.excludedScanlators.length > 0) {
            const excluded = new Set(s.excludedScanlators.map(x => (x || '').toLowerCase().trim()));
            chs = chs.filter(c => {
              const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
              return !excluded.has(scan);
            });
          }
          // Downloaded filter
          if (s.filterDownloaded) {
            chs = chs.filter(c => !!c.is_downloaded || manga.source === 'local');
          }
          // Unread filter
          if (s.filterUnread && manga.progress_summary) {
            chs = chs.filter(c => !(manga.progress_summary[c.id]?.is_read ?? c.is_read));
          }
          // Bookmarked filter
          if (s.filterBookmarked && manga.progress_summary) {
            chs = chs.filter(c => !!(manga.progress_summary[c.id]?.is_bookmarked ?? c.is_bookmarked));
          }
          return chs.length;
        }
      } catch (e) {}
    }

    return manga.chapter_count || 0;
  },

  getFilteredUnreadCount(manga) {
    if (!manga) return 0;
    const rawSettings = localStorage.getItem(`mihon_chapter_settings_${manga.id}`);
    if (rawSettings && manga.chapters_json) {
      try {
        const s = JSON.parse(rawSettings);
        let chs = typeof manga.chapters_json === 'string' ? JSON.parse(manga.chapters_json) : manga.chapters_json;
        if (Array.isArray(chs) && chs.length > 0) {
          if (Array.isArray(s.excludedScanlators) && s.excludedScanlators.length > 0) {
            const excluded = new Set(s.excludedScanlators.map(x => (x || '').toLowerCase().trim()));
            chs = chs.filter(c => {
              const scan = (c.scanlator || 'unofficial').toLowerCase().trim();
              return !excluded.has(scan);
            });
          }
          if (s.filterDownloaded) {
            chs = chs.filter(c => !!c.is_downloaded || manga.source === 'local');
          }
          if (s.filterBookmarked && manga.progress_summary) {
            chs = chs.filter(c => !!(manga.progress_summary[c.id]?.is_bookmarked ?? c.is_bookmarked));
          }
          return chs.filter(c => !(manga.progress_summary?.[c.id]?.is_read ?? c.is_read)).length;
        }
      } catch (e) {}
    }
    return Math.max(0, (manga.chapter_count || 0) - (manga.read_chapters_count || 0));
  },

  getLastReadTime(manga) {
    if (!manga) return 0;
    const rawVal = Number(manga.last_read_at);
    if (!isNaN(rawVal) && rawVal > 0) return rawVal;

    if (manga.progress_summary && typeof manga.progress_summary === 'object') {
      let maxRead = 0;
      for (const chId in manga.progress_summary) {
        const p = manga.progress_summary[chId];
        const t = p?.last_read_at ? Number(p.last_read_at) : 0;
        if (t > maxRead) maxRead = t;
      }
      if (maxRead > 0) return maxRead;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(`manga_progress_${manga.id}`) || '{}');
      let maxRead = 0;
      for (const chId in stored) {
        const p = stored[chId];
        const t = p?.last_read_at ? Number(p.last_read_at) : 0;
        if (t > maxRead) maxRead = t;
      }
      if (maxRead > 0) return maxRead;
    } catch (e) {}

    return 0;
  },

  renderGrid() {
    const grid = document.getElementById('library-grid');
    if (!grid) return;

    let items = State.library ? [...State.library] : [];

    // Category filter
    if (this.activeFilter && this.activeFilter.startsWith('cat:')) {
      const targetCatId = this.activeFilter.replace('cat:', '');
      items = items.filter(m => {
        const ids = Array.isArray(m.category_ids) && m.category_ids.length > 0
          ? m.category_ids
          : [(m.category_id || 'default')];
        return ids.includes(targetCatId);
      });
    }

    const s = this.settings;
    if (s.filterDownloaded === 'included') items = items.filter(m => (m.downloaded_count || 0) > 0 || m.source === 'local');
    else if (s.filterDownloaded === 'excluded') items = items.filter(m => !((m.downloaded_count || 0) > 0 || m.source === 'local'));

    if (s.filterUnread === 'included') items = items.filter(m => this.getFilteredUnreadCount(m) > 0);
    else if (s.filterUnread === 'excluded') items = items.filter(m => this.getFilteredUnreadCount(m) === 0);

    if (s.filterStarted === 'included') items = items.filter(m => (m.read_chapters_count || 0) > 0);
    else if (s.filterStarted === 'excluded') items = items.filter(m => (m.read_chapters_count || 0) === 0);

    if (s.filterBookmarked === 'included') items = items.filter(m => !!(m.has_bookmarks || m.is_bookmarked));
    else if (s.filterBookmarked === 'excluded') items = items.filter(m => !(m.has_bookmarks || m.is_bookmarked));

    if (s.filterCompleted === 'included') items = items.filter(m => (m.status || '').toLowerCase() === 'completed');
    else if (s.filterCompleted === 'excluded') items = items.filter(m => (m.status || '').toLowerCase() !== 'completed');

    if (s.filterSource === 'local') items = items.filter(m => m.source === 'local');
    else if (s.filterSource === 'online') items = items.filter(m => m.source !== 'local');

    // Search query
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(m => (m.title || '').toLowerCase().includes(q));
    }

    // Sort
    const sortType = s.sortType || 'alphabetical';
    const isAsc = s.sortAsc !== false;
    items.sort((a, b) => {
      let diff = 0;
      switch (sortType) {
        case 'alphabetical':
          diff = (a.title || '').localeCompare(b.title || '');
          break;
        case 'total_chapters':
          diff = this.getFilteredChapterCount(a) - this.getFilteredChapterCount(b);
          if (diff === 0) return (a.title || '').localeCompare(b.title || '');
          break;
        case 'last_read': {
          const aTime = this.getLastReadTime(a);
          const bTime = this.getLastReadTime(b);
          if (aTime > 0 && bTime === 0) return -1;
          if (aTime === 0 && bTime > 0) return 1;
          if (aTime === 0 && bTime === 0) {
            return (a.title || '').localeCompare(b.title || '');
          }
          if (aTime !== bTime) {
            return isAsc ? (aTime - bTime) : (bTime - aTime);
          }
          return (a.title || '').localeCompare(b.title || '');
        }
        case 'last_updated':
          diff = (a.last_updated || a.updated_at || a.last_update || 0) - (b.last_updated || b.updated_at || b.last_update || 0);
          if (diff === 0) return (a.title || '').localeCompare(b.title || '');
          break;
        case 'unread_count':
          diff = this.getFilteredUnreadCount(a) - this.getFilteredUnreadCount(b);
          if (diff === 0) return (a.title || '').localeCompare(b.title || '');
          break;
        case 'date_added':
          diff = (a.created_at || a.added_at || 0) - (b.created_at || b.added_at || 0);
          if (diff === 0) return (a.title || '').localeCompare(b.title || '');
          break;
        default:
          diff = (a.title || '').localeCompare(b.title || '');
      }
      return isAsc ? diff : -diff;
    });

    grid.className = 'manga-grid display-' + (s.displayMode || 'comfortable');

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 70px 20px; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg); margin-top: 10px;">
          <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
            ${this.searchQuery || this.hasActiveFilters() ? 'No matching manga found' : 'No manga in this category'}
          </div>
          <p style="font-size: 0.85rem; max-width: 420px; margin: 0 auto 16px auto; line-height: 1.5;">
            ${this.searchQuery || this.hasActiveFilters() ? 'Try adjusting your search query, clearing filters, or switching categories.' : 'Browse sources to find and bookmark your favorite titles into your library.'}
          </p>
          ${this.hasActiveFilters() ? `
            <button class="btn btn-secondary" id="btn-empty-clear-filters" style="font-size: 0.82rem; padding: 7px 16px; font-weight: 600; margin-right: 8px;">
              Reset Filters
            </button>
          ` : ''}
          <button class="btn btn-primary" onclick="Router.navigate('browse')" style="font-size: 0.82rem; padding: 7px 16px; font-weight: 600;">
            Browse Sources
          </button>
        </div>
      `;
      const btnClear = document.getElementById('btn-empty-clear-filters');
      if (btnClear) {
        btnClear.onclick = () => this.resetFilters();
      }
      return;
    }

    grid.innerHTML = items.map(manga => {
      if (manga && manga.id) {
        if (!window.__mangaQuickCache) window.__mangaQuickCache = new Map();
        window.__mangaQuickCache.set(manga.id, manga);
      }
      const filteredCount = this.getFilteredChapterCount(manga);
      const unreadCount = this.getFilteredUnreadCount(manga);
      const showUnread = s.showUnreadBadge !== false && unreadCount > 0;
      const showCategory = s.showCategoryBadge !== false;
      const coverUrl = manga.cover_url || '/static/img/default-cover.png';
      const sourceBadge = manga.source === 'local' ? 'Local' : (manga.source_name || 'Online');
      const categoryName = manga.category_name || 'Default';

      const isSelected = this.selectedIds.has(manga.id);

      return `
        <div class="manga-card ${isSelected ? 'selected' : ''}" data-id="${manga.id}" data-source="${manga.source}">
          <div class="manga-card-cover-wrap">
            <img class="manga-card-cover" src="${coverUrl}" alt="${this.escapeHtml(manga.title)}" loading="lazy" onerror="this.src='/static/img/default-cover.png'" />
            <button class="manga-card-menu-btn" data-manga-id="${manga.id}" title="Remove / Delete Options">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <span class="manga-badge">${this.escapeHtml(sourceBadge)}</span>
            ${showUnread ? `
              <span class="manga-card-badge-unread" title="${unreadCount} unread chapters">
                ${unreadCount}
              </span>
            ` : ''}
            ${showCategory ? `
              <button class="manga-category-pill" data-manga-id="${manga.id}" title="Change category">
                ${this.escapeHtml(categoryName)}
              </button>
            ` : ''}
          </div>
          <div class="manga-card-details">
            <h4 class="manga-card-title" title="${this.escapeHtml(manga.title)}">${this.escapeHtml(manga.title)}</h4>
            <div class="manga-card-sub">
              <span title="${filteredCount} chapters after filters">${filteredCount} ch</span>
              <button class="manga-quick-cat-btn" data-manga-id="${manga.id}" title="Assign category" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px;">
                <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2;">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <circle cx="7" cy="7" r="1.5"></circle>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card clicks & long-press
    grid.querySelectorAll('.manga-card').forEach(card => {
      let pressTimer = null;
      let isLongPressed = false;

      // Speculative preheat on hover/touch (Mihon-style zero-latency click)
      card.addEventListener('pointerenter', () => {
        const mId = card.getAttribute('data-id');
        const mSrc = card.getAttribute('data-source') || 'local';
        if (mId && typeof API !== 'undefined' && API.prefetchManga) {
          API.prefetchManga(mSrc, mId);
        }
      }, { once: true, passive: true });

      const startPress = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        isLongPressed = false;
        pressTimer = setTimeout(() => {
          isLongPressed = true;
          const mangaId = card.getAttribute('data-id');
          if (!mangaId) return;

          this.isSelectMode = true;
          this.selectedIds.add(mangaId);
          card.classList.add('selected');

          const bar = document.getElementById('library-batch-bar');
          if (bar) bar.classList.add('active');
          this.updateBatchBar();

          if (navigator.vibrate) {
            try { navigator.vibrate(50); } catch (err) {}
          }
        }, 450);
      };

      const cancelPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      card.addEventListener('mousedown', startPress);
      card.addEventListener('touchstart', startPress, { passive: true });
      card.addEventListener('mouseup', cancelPress);
      card.addEventListener('mouseleave', cancelPress);
      card.addEventListener('touchend', cancelPress);
      card.addEventListener('touchcancel', cancelPress);

      card.addEventListener('click', (e) => {
        if (isLongPressed) {
          e.preventDefault();
          e.stopPropagation();
          isLongPressed = false;
          return;
        }

        const mangaId = card.getAttribute('data-id');
        if (this.isSelectMode) {
          e.preventDefault();
          e.stopPropagation();
          if (this.selectedIds.has(mangaId)) {
            this.selectedIds.delete(mangaId);
            card.classList.remove('selected');
            if (this.selectedIds.size === 0) {
              this.toggleSelectMode(false);
              return;
            }
          } else {
            this.selectedIds.add(mangaId);
            card.classList.add('selected');
          }
          this.updateBatchBar();
          return;
        }

        if (e.target.closest('.manga-category-pill') || e.target.closest('.manga-quick-cat-btn') || e.target.closest('.manga-card-menu-btn')) {
          return;
        }
        const source = card.getAttribute('data-source') || 'local';
        const manga = (State.library || []).find(m => m.id === mangaId);
        if (manga && (manga.new_chapters_count || 0) > 0) {
          API.clearMangaNewChapters(mangaId).catch(() => {});
          manga.new_chapters_count = 0;
          const newBadge = card.querySelector('.manga-card-badge-new');
          if (newBadge) newBadge.remove();
        }
        Router.navigate(`manga/${source}/${mangaId}`);
      });
    });

    // Quick remove / delete button clicks
    grid.querySelectorAll('.manga-card-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mangaId = btn.getAttribute('data-manga-id');
        const manga = (State.library || []).find(m => m.id === mangaId);
        if (manga) {
          this.openRemoveMangaDialog(manga);
        }
      });
    });

    // Category pill & button clicks
    grid.querySelectorAll('.manga-category-pill, .manga-quick-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mangaId = btn.getAttribute('data-manga-id');
        const manga = (State.library || []).find(m => m.id === mangaId);
        if (manga) {
          this.openCategoryPickerModal(manga);
        }
      });
    });
  },

  getModalHost() {
    let host = document.getElementById('app-modal-root');
    if (!host) {
      host = document.getElementById('app-global-modal-host');
    }
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-global-modal-host';
      document.body.appendChild(host);
    }
    return host;
  },

  openLibraryOptionsModal() {
    const container = this.getModalHost();
    const s = this.settings;

    const renderTriStateIcon = (state) => {
      if (state === 'included') {
        return `<svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 3;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      }
      if (state === 'excluded') {
        return `<svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 3;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      }
      return '';
    };

    const sortOptions = [
      { id: 'alphabetical', label: 'Alphabetically' },
      { id: 'total_chapters', label: 'Total chapters' },
      { id: 'last_read', label: 'Last read' },
      { id: 'last_updated', label: 'Last update' },
      { id: 'unread_count', label: 'Unread count' },
      { id: 'date_added', label: 'Date added' }
    ];

    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="lib-options-backdrop">
        <div class="mihon-lib-settings-modal" id="lib-options-modal-card">
          <div class="mihon-tabs-nav">
            <button class="mihon-tab-btn ${this.activeOptionsTab === 'filter' ? 'active' : ''}" data-tab="filter">Filter</button>
            <button class="mihon-tab-btn ${this.activeOptionsTab === 'sort' ? 'active' : ''}" data-tab="sort">Sort</button>
            <button class="mihon-tab-btn ${this.activeOptionsTab === 'display' ? 'active' : ''}" data-tab="display">Display</button>
          </div>

          <!-- Filter Tab Content -->
          <div class="mihon-tab-content-pane" id="pane-filter" style="display: ${this.activeOptionsTab === 'filter' ? 'flex' : 'none'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span class="mihon-section-title" style="margin: 0;">Filters</span>
              <button class="mihon-filter-reset-btn" id="btn-reset-filters" type="button">Reset</button>
            </div>

            <div class="mihon-tristate-row state-${s.filterDownloaded}" data-key="filterDownloaded">
              <span class="mihon-tristate-label">Downloaded</span>
              <span class="mihon-tristate-icon">${renderTriStateIcon(s.filterDownloaded)}</span>
            </div>

            <div class="mihon-tristate-row state-${s.filterUnread}" data-key="filterUnread">
              <span class="mihon-tristate-label">Unread</span>
              <span class="mihon-tristate-icon">${renderTriStateIcon(s.filterUnread)}</span>
            </div>

            <div class="mihon-tristate-row state-${s.filterStarted}" data-key="filterStarted">
              <span class="mihon-tristate-label">Started</span>
              <span class="mihon-tristate-icon">${renderTriStateIcon(s.filterStarted)}</span>
            </div>

            <div class="mihon-tristate-row state-${s.filterBookmarked}" data-key="filterBookmarked">
              <span class="mihon-tristate-label">Bookmarked</span>
              <span class="mihon-tristate-icon">${renderTriStateIcon(s.filterBookmarked)}</span>
            </div>

            <div class="mihon-tristate-row state-${s.filterCompleted}" data-key="filterCompleted">
              <span class="mihon-tristate-label">Completed</span>
              <span class="mihon-tristate-icon">${renderTriStateIcon(s.filterCompleted)}</span>
            </div>

            <div class="mihon-section-title" style="margin-top: 10px;">Source</div>
            <div class="mihon-display-chips" style="margin-bottom: 0;">
              <button class="mihon-chip-btn ${s.filterSource === 'any' ? 'active' : ''}" data-source-filter="any">All</button>
              <button class="mihon-chip-btn ${s.filterSource === 'local' ? 'active' : ''}" data-source-filter="local">Local Only</button>
              <button class="mihon-chip-btn ${s.filterSource === 'online' ? 'active' : ''}" data-source-filter="online">Online Only</button>
            </div>
          </div>

          <!-- Sort Tab Content -->
          <div class="mihon-tab-content-pane" id="pane-sort" style="display: ${this.activeOptionsTab === 'sort' ? 'flex' : 'none'};">
            ${sortOptions.map(opt => {
              const isActive = s.sortType === opt.id;
              const isAsc = s.sortAsc !== false;
              return `
                <div class="mihon-sort-row ${isActive ? 'active' : ''}" data-sort="${opt.id}">
                  <span style="font-size: 0.92rem; font-weight: 500;">${opt.label}</span>
                  <span class="mihon-sort-icon">
                    ${isActive ? `
                      <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; transform: rotate(${isAsc ? '0deg' : '180deg'}); transition: transform 0.2s ease;">
                        <line x1="12" y1="19" x2="12" y2="5"></line>
                        <polyline points="5 12 12 5 19 12"></polyline>
                      </svg>
                    ` : ''}
                  </span>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Display Tab Content -->
          <div class="mihon-tab-content-pane" id="pane-display" style="display: ${this.activeOptionsTab === 'display' ? 'flex' : 'none'};">
            <span class="mihon-section-title">Display Mode</span>
            <div class="mihon-display-chips">
              <button class="mihon-chip-btn ${s.displayMode === 'comfortable' ? 'active' : ''}" data-display-mode="comfortable">Comfortable Grid</button>
              <button class="mihon-chip-btn ${s.displayMode === 'compact' ? 'active' : ''}" data-display-mode="compact">Compact Grid</button>
              <button class="mihon-chip-btn ${s.displayMode === 'cover_only' ? 'active' : ''}" data-display-mode="cover_only">Cover Only</button>
              <button class="mihon-chip-btn ${s.displayMode === 'list' ? 'active' : ''}" data-display-mode="list">List View</button>
            </div>

            <span class="mihon-section-title">Badges</span>
            <label class="mihon-checkbox-row">
              <span style="font-size: 0.92rem; font-weight: 500; color: #fff;">Category badges</span>
              <input type="checkbox" id="cb-opt-category-badge" ${s.showCategoryBadge !== false ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--accent-primary); cursor: pointer;" />
            </label>

            <label class="mihon-checkbox-row">
              <span style="font-size: 0.92rem; font-weight: 500; color: #fff;">Unread badges</span>
              <input type="checkbox" id="cb-opt-unread-badge" ${s.showUnreadBadge !== false ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--accent-primary); cursor: pointer;" />
            </label>
          </div>

          <div style="padding: 10px 18px; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; background: rgba(0,0,0,0.15);">
            <button class="btn btn-secondary" id="btn-close-lib-options" style="padding: 6px 16px; font-size: 0.84rem;">Close</button>
          </div>
        </div>
      </div>
    `;

    // Wire close handlers
    const close = () => { container.innerHTML = ''; };
    document.getElementById('lib-options-backdrop').onclick = (e) => {
      if (e.target.id === 'lib-options-backdrop') close();
    };
    document.getElementById('btn-close-lib-options').onclick = close;

    // Wire tab switching smoothly without recreating the modal DOM
    container.querySelectorAll('.mihon-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        this.activeOptionsTab = tab;
        container.querySelectorAll('.mihon-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
        ['filter', 'sort', 'display'].forEach(name => {
          const pane = document.getElementById(`pane-${name}`);
          if (pane) pane.style.display = (tab === name) ? 'flex' : 'none';
        });
      };
    });

    const nextTriState = (cur) => {
      if (cur === 'any') return 'included';
      if (cur === 'included') return 'excluded';
      return 'any';
    };

    // Wire tri-state row clicks in-place
    container.querySelectorAll('.mihon-tristate-row').forEach(row => {
      row.onclick = () => {
        const key = row.getAttribute('data-key');
        const nextVal = nextTriState(this.settings[key] || 'any');
        this.settings[key] = nextVal;
        row.className = `mihon-tristate-row state-${nextVal}`;
        const iconSpan = row.querySelector('.mihon-tristate-icon');
        if (iconSpan) iconSpan.innerHTML = renderTriStateIcon(nextVal);
        this.saveSettings();
        this.renderGrid();
        this.updateFilterButtonState();
      };
    });

    // Wire reset filters in-place
    const resetBtn = document.getElementById('btn-reset-filters');
    if (resetBtn) {
      resetBtn.onclick = () => {
        this.resetFilters();
        container.querySelectorAll('.mihon-tristate-row').forEach(r => {
          const key = r.getAttribute('data-key');
          const val = this.settings[key] || 'any';
          r.className = `mihon-tristate-row state-${val}`;
          const icon = r.querySelector('.mihon-tristate-icon');
          if (icon) icon.innerHTML = renderTriStateIcon(val);
        });
        container.querySelectorAll('[data-source-filter]').forEach(chip => {
          chip.classList.toggle('active', chip.getAttribute('data-source-filter') === this.settings.filterSource);
        });
      };
    }

    // Wire source filter chips in-place
    container.querySelectorAll('[data-source-filter]').forEach(chip => {
      chip.onclick = () => {
        this.settings.filterSource = chip.getAttribute('data-source-filter');
        container.querySelectorAll('[data-source-filter]').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-source-filter') === this.settings.filterSource);
        });
        this.saveSettings();
        this.renderGrid();
        this.updateFilterButtonState();
      };
    });

    // Wire sort rows in-place
    container.querySelectorAll('.mihon-sort-row').forEach(row => {
      row.onclick = () => {
        const sortKey = row.getAttribute('data-sort');
        if (this.settings.sortType === sortKey) {
          this.settings.sortAsc = !this.settings.sortAsc;
        } else {
          this.settings.sortType = sortKey;
          this.settings.sortAsc = (sortKey === 'alphabetical');
        }
        this.saveSettings();
        this.renderGrid();

        container.querySelectorAll('.mihon-sort-row').forEach(r => {
          const k = r.getAttribute('data-sort');
          const isActive = k === this.settings.sortType;
          r.classList.toggle('active', isActive);
          const icon = r.querySelector('.mihon-sort-icon');
          if (icon) {
            icon.innerHTML = isActive ? `
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; transform: rotate(${this.settings.sortAsc !== false ? '0deg' : '180deg'}); transition: transform 0.2s ease;">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            ` : '';
          }
        });
      };
    });

    // Wire display mode chips in-place
    container.querySelectorAll('[data-display-mode]').forEach(chip => {
      chip.onclick = () => {
        this.settings.displayMode = chip.getAttribute('data-display-mode');
        container.querySelectorAll('[data-display-mode]').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-display-mode') === this.settings.displayMode);
        });
        this.saveSettings();
        this.renderGrid();
      };
    });

    // Wire badge toggles
    const cbCategory = document.getElementById('cb-opt-category-badge');
    if (cbCategory) {
      cbCategory.onchange = (e) => {
        this.settings.showCategoryBadge = e.target.checked;
        this.saveSettings();
        this.renderGrid();
      };
    }
    const cbUnread = document.getElementById('cb-opt-unread-badge');
    if (cbUnread) {
      cbUnread.onchange = (e) => {
        this.settings.showUnreadBadge = e.target.checked;
        this.saveSettings();
        this.renderGrid();
      };
    }
  },

  openCategoryPickerModal(manga, onChanged) {
    const container = this.getModalHost();

    const currentCatIds = new Set(
      Array.isArray(manga.category_ids) && manga.category_ids.length > 0
        ? manga.category_ids
        : [manga.category_id || 'default']
    );

    const categoryListHtml = (this.categories || []).map(cat => {
      const isSelected = currentCatIds.has(cat.id);
      return `
        <label class="category-choice-item ${isSelected ? 'selected' : ''}" data-cat-id="${cat.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; border: 1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background: ${isSelected ? 'rgba(var(--accent-primary-rgb), 0.12)' : 'rgba(255,255,255,0.02)'}; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="cat-multi-checkbox" data-cat-id="${cat.id}" ${isSelected ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;" />
            <span style="font-weight: 500; font-size: 0.92rem; color: #fff;">${this.escapeHtml(cat.name)}</span>
          </div>
        </label>
      `;
    }).join('');

    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="category-picker-backdrop">
        <div class="mihon-dialog-card" style="max-width: 420px;">
          <div class="mihon-dialog-header">
            <div>
              <div class="mihon-dialog-title">Assign Categories</div>
              <div class="mihon-dialog-subtitle" title="${this.escapeHtml(manga.title)}">Select one or more categories for this manga</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-cat-picker">&times;</button>
          </div>
          <div class="mihon-dialog-body" style="display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; padding-right: 4px;">
            ${categoryListHtml}
          </div>
          <div class="mihon-dialog-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border-subtle); margin-top: 8px;">
            <button class="btn btn-secondary" id="btn-cancel-cat-picker">Cancel</button>
            <button class="btn btn-primary" id="btn-save-cat-picker" style="padding: 6px 18px; font-weight: 600;">Save</button>
          </div>
        </div>
      </div>
    `;

    // Close handlers
    const backdrop = document.getElementById('category-picker-backdrop');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) container.innerHTML = '';
    });
    document.getElementById('btn-close-cat-picker').addEventListener('click', () => {
      container.innerHTML = '';
    });
    const cancelBtn = document.getElementById('btn-cancel-cat-picker');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        container.innerHTML = '';
      });
    }

    // Toggle row style on checkbox change
    container.querySelectorAll('.cat-multi-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const row = cb.closest('.category-choice-item');
        if (row) {
          if (cb.checked) {
            row.classList.add('selected');
            row.style.borderColor = 'var(--accent-primary)';
            row.style.background = 'rgba(var(--accent-primary-rgb), 0.12)';
          } else {
            row.classList.remove('selected');
            row.style.borderColor = 'var(--border-subtle)';
            row.style.background = 'rgba(255,255,255,0.02)';
          }
        }
      });
    });

    // Save button handler
    const saveBtn = document.getElementById('btn-save-cat-picker');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const checkedBoxes = Array.from(container.querySelectorAll('.cat-multi-checkbox:checked'));
        let selectedCatIds = checkedBoxes.map(cb => cb.getAttribute('data-cat-id'));
        if (selectedCatIds.length === 0) {
          selectedCatIds = ['default'];
        }

        try {
          await API.setMangaCategories(manga.id, selectedCatIds);
          manga.category_ids = selectedCatIds;
          manga.category_id = selectedCatIds[0];
          const names = selectedCatIds.map(cid => {
            const cat = (this.categories || []).find(c => c.id === cid);
            return cat ? cat.name : 'Default';
          });
          manga.category_names = names;
          manga.category_name = names.join(', ');

          State.showToast(`Categories updated (${names.join(', ')})`);
          container.innerHTML = '';
          this.renderGrid();
          if (onChanged) onChanged(selectedCatIds, names.join(', '));
        } catch (err) {
          console.error('Failed to set categories:', err);
          State.showToast('Failed to update categories');
        }
      });
    }
  },

  openManageCategoriesModal() {
    const container = this.getModalHost();
    if (!container) return;

    const renderCategoriesList = () => {
      return (this.categories || []).map(cat => {
        const isDefault = cat.id === 'default';
        const count = (State.library || []).filter(m => (m.category_id || 'default') === cat.id).length;
        return `
          <div class="category-manage-row" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px;">
            <div>
              <span style="font-weight: 600; font-size: 0.92rem; color: #fff;">${this.escapeHtml(cat.name)}</span>
              <span style="font-size: 0.78rem; color: var(--text-muted); margin-left: 8px;">(${count} items)</span>
              ${isDefault ? '<span style="font-size: 0.72rem; color: var(--accent-primary); margin-left: 6px; font-weight: 500;">Default</span>' : ''}
            </div>
            ${!isDefault ? `
              <button class="btn btn-secondary btn-delete-cat" data-cat-id="${cat.id}" data-cat-name="${this.escapeHtml(cat.name)}" title="Delete Category" style="padding: 4px 10px; font-size: 0.78rem; color: var(--accent-red); border-color: rgba(239,68,68,0.3);">
                Delete
              </button>
            ` : ''}
          </div>
        `;
      }).join('');
    };

    container.innerHTML = `
      <div class="mihon-modal-backdrop" id="category-manage-backdrop">
        <div class="mihon-dialog-card" style="max-width: 440px;">
          <div class="mihon-dialog-header">
            <div>
              <div class="mihon-dialog-title">Manage Categories</div>
              <div class="mihon-dialog-subtitle">Create and organize custom library categories</div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-cat-manage">&times;</button>
          </div>
          <div class="mihon-dialog-body" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; gap: 8px;">
              <input type="text" id="new-category-input" class="search-input" placeholder="New category name (e.g. Manhwa, Favorites)" style="flex-grow: 1;" />
              <button class="btn btn-primary" id="btn-add-category" type="button" style="padding: 8px 16px; font-size: 0.85rem; white-space: nowrap;">
                Add
              </button>
            </div>

            <div id="manage-categories-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
              ${renderCategoriesList()}
            </div>
          </div>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('category-manage-backdrop');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) container.innerHTML = '';
    });
    document.getElementById('btn-close-cat-manage').addEventListener('click', () => {
      container.innerHTML = '';
    });

    const bindDeleteHandlers = () => {
      container.querySelectorAll('.btn-delete-cat').forEach(delBtn => {
        delBtn.addEventListener('click', async () => {
          const catId = delBtn.getAttribute('data-cat-id');
          const catName = delBtn.getAttribute('data-cat-name');
          if (confirm(`Delete category "${catName}"? Any manga in this category will move to Default.`)) {
            try {
              await API.deleteCategory(catId);
              this.categories = await API.getCategories();
              (State.library || []).forEach(m => {
                if (m.category_id === catId) {
                  m.category_id = 'default';
                  m.category_name = 'Default';
                }
              });
              const listEl = document.getElementById('manage-categories-list');
              if (listEl) {
                listEl.innerHTML = renderCategoriesList();
                bindDeleteHandlers();
              }
              this.updateTabs();
              this.renderGrid();
              this.updateStatsRibbon();
              State.showToast(`Category "${catName}" deleted`);
            } catch (err) {
              console.error('Failed to delete category:', err);
              State.showToast('Failed to delete category');
            }
          }
        });
      });
    };

    bindDeleteHandlers();

    // Add category handler
    const addBtn = document.getElementById('btn-add-category');
    const inputEl = document.getElementById('new-category-input');

    const handleAdd = async () => {
      const name = inputEl.value.trim();
      if (!name) return;

      try {
        await API.createCategory(name);
        inputEl.value = '';
        this.categories = await API.getCategories();
        const listEl = document.getElementById('manage-categories-list');
        if (listEl) {
          listEl.innerHTML = renderCategoriesList();
          bindDeleteHandlers();
        }
        this.updateTabs();
        this.updateStatsRibbon();
        State.showToast(`Category "${name}" created`);
      } catch (err) {
        console.error('Failed to create category:', err);
        State.showToast(err.message || 'Failed to create category');
      }
    };

    addBtn.addEventListener('click', handleAdd);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    });
  },

  // Mihon-style Remove Manga Dialog (Allows removing from library and/or deleting all downloaded chapters)
  openRemoveMangaDialog(manga) {
    if (!manga) return;
    const container = this.getModalHost();

    const isLocal = manga.source === 'local';
    const hasDownloaded = (manga.downloaded_count || 0) > 0 || isLocal;

    container.innerHTML = `
      <div class="mihon-dialog-backdrop" id="delete-library-backdrop">
        <div class="mihon-dialog" role="dialog" aria-modal="true">
          <h3 class="mihon-dialog-title">Remove</h3>
          <p class="mihon-dialog-subtitle">${this.escapeHtml(manga.title)}</p>
          
          <div class="mihon-dialog-content">
            <label class="mihon-dialog-checkbox-row">
              <input type="checkbox" id="cb-remove-library" class="mihon-dialog-checkbox" checked />
              <span class="mihon-dialog-label">From library</span>
            </label>

            ${!isLocal ? `
              <label class="mihon-dialog-checkbox-row">
                <input type="checkbox" id="cb-delete-downloads" class="mihon-dialog-checkbox" ${hasDownloaded ? 'checked' : ''} />
                <span class="mihon-dialog-label">Downloaded chapters</span>
              </label>
            ` : ''}
          </div>

          <div class="mihon-dialog-actions">
            <button class="btn btn-secondary" id="btn-dialog-cancel" style="padding: 8px 16px; font-size: 0.88rem;">Cancel</button>
            <button class="btn btn-primary" id="btn-dialog-confirm" style="padding: 8px 18px; font-size: 0.88rem; background: var(--accent-red, #ef4444); border-color: var(--accent-red, #ef4444);">OK</button>
          </div>
        </div>
      </div>
    `;

    const closeDialog = () => { container.innerHTML = ''; };
    container.querySelector('#delete-library-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'delete-library-backdrop') closeDialog();
    });
    container.querySelector('#btn-dialog-cancel')?.addEventListener('click', closeDialog);

    const cbLibrary = container.querySelector('#cb-remove-library');
    const cbDownloads = container.querySelector('#cb-delete-downloads');
    const confirmBtn = container.querySelector('#btn-dialog-confirm');

    const updateConfirmState = () => {
      const isAnyChecked = (cbLibrary && cbLibrary.checked) || (cbDownloads && cbDownloads.checked);
      confirmBtn.disabled = !isAnyChecked;
      confirmBtn.style.opacity = isAnyChecked ? '1' : '0.4';
    };

    if (cbLibrary) cbLibrary.addEventListener('change', updateConfirmState);
    if (cbDownloads) cbDownloads.addEventListener('change', updateConfirmState);
    updateConfirmState();

    confirmBtn.addEventListener('click', async () => {
      const deleteFromLib = cbLibrary ? cbLibrary.checked : false;
      const deleteChapters = cbDownloads ? cbDownloads.checked : false;
      closeDialog();

      try {
        if (deleteChapters && !deleteFromLib) {
          await API.deleteMangaDownloads(manga.id);
          Toast.show('Deleted downloaded chapters', 'info');
        } else {
          await API.removeFromLibrary(manga.id, {
            delete_from_library: deleteFromLib,
            delete_chapters: deleteChapters
          });
          Toast.show(deleteChapters ? 'Removed from library and deleted downloads' : 'Removed from library', 'info');
        }
        await this.loadData();
      } catch (err) {
        console.error('Error removing manga:', err);
        Toast.show('Failed to remove: ' + err.message, 'error');
      }
    });
  }
};
