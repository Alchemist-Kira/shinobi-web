// Mihon-style Global Multi-Source Search Component
const GlobalSearchView = {
  query: '',
  sources: [],
  sourceStates: {}, // sourceId -> { status: 'idle'|'loading'|'success'|'error', items: [], total: 0, error: '' }
  onlyWithResults: false,
  isSearching: false,
  searchAbortController: null,

  async init() {
    this.onlyWithResults = localStorage.getItem('mihon_global_search_only_results') === 'true';
  },

  async render(initialQuery = '', targetContainer = null) {
    const container = targetContainer || document.getElementById('browse-globalsearch-section') || document.getElementById('view-globalsearch');
    if (!container) return;

    if (initialQuery && initialQuery !== this.query) {
      this.query = initialQuery;
    }

    container.innerHTML = `
      <div class="global-search-container" style="max-width: 1400px; margin: 0 auto; padding-bottom: 60px;">
        <!-- Global Search Header & Controls -->
        <div class="global-search-header" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px 24px; margin-bottom: 24px;">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <div style="position: relative; flex: 1; min-width: 260px;">
              <svg viewBox="0 0 24 24" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; fill: none; stroke: var(--text-muted); stroke-width: 2;">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input 
                type="text" 
                id="global-search-input" 
                class="search-input" 
                placeholder="Search across all installed sources..." 
                value="${this.escapeHtml(this.query)}" 
                style="width: 100%; padding-left: 42px; height: 44px; font-size: 0.95rem; border-radius: 8px;"
              />
              ${this.query ? `
                <button id="btn-global-clear" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 4px;">
                  ✕
                </button>
              ` : ''}
            </div>

            <button id="btn-global-search-run" class="btn btn-primary" style="height: 44px; padding: 0 22px; font-weight: 600;">
              Search
            </button>
          </div>

          <!-- Options & Progress Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-muted); cursor: pointer; user-select: none;">
                <input type="checkbox" id="check-only-results" ${this.onlyWithResults ? 'checked' : ''} style="cursor: pointer;" />
                Only show sources with results
              </label>

              <span id="global-search-status-text" style="font-size: 0.84rem; color: var(--text-muted);">
                ${this.getStatusText()}
              </span>
            </div>

            <div id="global-search-progress-wrap" style="display: ${this.isSearching ? 'block' : 'none'}; width: 200px;">
              <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                <div id="global-search-progress-bar" style="height: 100%; width: 0%; background: var(--accent-primary); transition: width 0.25s ease;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Suggestions (if empty) -->
        ${!this.query ? `
          <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
              Global Multi-Source Search
            </div>
            <p style="font-size: 0.9rem; max-width: 500px; margin: 0 auto 20px;">
              Search across all installed extensions at once. Results appear concurrently as each source responds.
            </p>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <span style="font-size: 0.85rem; align-self: center; margin-right: 4px;">Suggestions:</span>
              ${['Solo Leveling', 'Omniscient Reader', 'One Piece', 'Tower of God', 'Monster', 'Return of the Mount Hua'].map(s => `
                <button class="btn btn-secondary global-suggest-btn" data-query="${s}" style="padding: 4px 12px; font-size: 0.82rem; border-radius: 20px;">
                  ${s}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Sources Results List Container -->
        <div id="global-search-sources-list" style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Dynamically populated -->
        </div>
      </div>
    `;

    this.bindEvents();

    if (this.query) {
      this.executeSearch(this.query);
    } else {
      this.renderSourceCards();
    }
  },

  getStatusText() {
    if (!this.sources.length) return '';
    const completed = Object.values(this.sourceStates).filter(s => s.status === 'success' || s.status === 'error').length;
    if (this.isSearching) {
      return `Searching... (${completed}/${this.sources.length} sources finished)`;
    }
    if (this.query) {
      const withResults = Object.values(this.sourceStates).filter(s => s.status === 'success' && s.items.length > 0).length;
      return `Completed search across ${this.sources.length} sources (${withResults} found results)`;
    }
    return `${this.sources.length} installed sources ready`;
  },

  bindEvents() {
    const input = document.getElementById('global-search-input');
    const runBtn = document.getElementById('btn-global-search-run');
    const clearBtn = document.getElementById('btn-global-clear');
    const onlyCheck = document.getElementById('check-only-results');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = input.value.trim();
          if (q) this.executeSearch(q);
        }
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const q = (input ? input.value : this.query).trim();
        if (q) this.executeSearch(q);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.query = '';
        if (input) input.value = '';
        this.sourceStates = {};
        this.render();
      });
    }

    if (onlyCheck) {
      onlyCheck.addEventListener('change', (e) => {
        this.onlyWithResults = e.target.checked;
        localStorage.setItem('mihon_global_search_only_results', this.onlyWithResults ? 'true' : 'false');
        this.renderSourceCards();
      });
    }

    document.querySelectorAll('.global-suggest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query');
        if (q) {
          this.query = q;
          if (input) input.value = q;
          this.executeSearch(q);
        }
      });
    });
  },

  async executeSearch(query) {
    if (!query) return;
    this.query = query;

    // Abort previous search if in progress
    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();

    // Fetch sources list if not loaded
    try {
      if (!this.sources || this.sources.length === 0) {
        const allSources = await API.getSources();
        // Include external sources (exclude local CBZ from online global search)
        // If an extension provides both ALL and EN variants, prioritize ALL
        const extMap = new Map();
        for (const s of allSources) {
          if (s.id === 'local') continue;
          const key = s.pkg || s.base_name || s.name.replace(/\s*\([A-Z0-9-]+\)\s*$/i, '').trim();
          if (!extMap.has(key)) {
            extMap.set(key, s);
          } else {
            const existing = extMap.get(key);
            const sLang = (s.lang || '').trim().toLowerCase();
            const exLang = (existing.lang || '').trim().toLowerCase();
            if (sLang === 'all' && exLang !== 'all') {
              extMap.set(key, s);
            }
          }
        }
        this.sources = Array.from(extMap.values());
      }
    } catch (e) {
      console.error('Failed to get sources for global search:', e);
      return;
    }

    this.isSearching = true;
    this.sourceStates = {};
    for (const src of this.sources) {
      this.sourceStates[src.id] = {
        status: 'loading',
        items: [],
        total: 0,
        error: ''
      };
    }

    this.updateStatusHeader();
    this.renderSourceCards();

    let completed = 0;
    const total = this.sources.length;

    // Search all sources concurrently
    const searchPromises = this.sources.map(async (src) => {
      try {
        const res = await API.searchManga(src.id, query, 1);
        this.sourceStates[src.id] = {
          status: 'success',
          items: res.items || [],
          total: res.total || (res.items ? res.items.length : 0),
          error: ''
        };
      } catch (err) {
        console.warn(`Global search error for ${src.id}:`, err);
        this.sourceStates[src.id] = {
          status: 'error',
          items: [],
          total: 0,
          error: err.message || 'Search failed'
        };
      } finally {
        completed++;
        this.updateSourceCard(src.id);
        this.updateStatusHeader(completed, total);
      }
    });

    await Promise.allSettled(searchPromises);
    this.isSearching = false;
    this.updateStatusHeader(completed, total);
  },

  updateStatusHeader(completed = 0, total = 0) {
    const statusText = document.getElementById('global-search-status-text');
    if (statusText) {
      statusText.textContent = this.getStatusText();
    }

    const progressWrap = document.getElementById('global-search-progress-wrap');
    const progressBar = document.getElementById('global-search-progress-bar');
    if (progressWrap && progressBar && total > 0) {
      if (this.isSearching) {
        progressWrap.style.display = 'block';
        const pct = Math.round((completed / total) * 100);
        progressBar.style.width = `${pct}%`;
      } else {
        progressBar.style.width = '100%';
        setTimeout(() => {
          if (progressWrap) progressWrap.style.display = 'none';
        }, 500);
      }
    }
  },

  renderSourceCards() {
    const listWrap = document.getElementById('global-search-sources-list');
    if (!listWrap) return;

    if (!this.query) {
      listWrap.innerHTML = '';
      return;
    }

    const rendered = [];
    for (const src of this.sources) {
      const state = this.sourceStates[src.id] || { status: 'idle', items: [], total: 0 };
      
      // If "only show with results" is active, skip empty completed sources
      if (this.onlyWithResults && state.status === 'success' && state.items.length === 0) {
        continue;
      }

      rendered.push(this.createSourceCardHtml(src, state));
    }

    if (rendered.length === 0 && !this.isSearching) {
      listWrap.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle); color: var(--text-muted);">
          No results found for "${this.escapeHtml(this.query)}" across installed sources.
        </div>
      `;
      return;
    }

    listWrap.innerHTML = rendered.join('');
    this.bindSourceCardEvents();
  },

  updateSourceCard(sourceId) {
    const cardEl = document.getElementById(`global-source-row-${sourceId}`);
    const src = this.sources.find(s => s.id === sourceId);
    if (!src) return;

    const state = this.sourceStates[sourceId];
    if (this.onlyWithResults && state && state.status === 'success' && state.items.length === 0) {
      if (cardEl) cardEl.remove();
      return;
    }

    if (cardEl) {
      cardEl.outerHTML = this.createSourceCardHtml(src, state);
      this.bindSingleSourceEvents(sourceId);
    } else {
      // Append if it wasn't there
      const listWrap = document.getElementById('global-search-sources-list');
      if (listWrap) {
        const div = document.createElement('div');
        div.innerHTML = this.createSourceCardHtml(src, state);
        listWrap.appendChild(div.firstElementChild);
        this.bindSingleSourceEvents(sourceId);
      }
    }
  },

  createSourceCardHtml(source, state) {
    const hasItems = state.status === 'success' && state.items.length > 0;
    const isLoading = state.status === 'loading';
    const isError = state.status === 'error';
    const isEmpty = state.status === 'success' && state.items.length === 0;

    return `
      <div class="global-source-section" id="global-source-row-${source.id}" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 18px; transition: border-color 0.2s;">
        <!-- Source Header Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 10px; cursor: pointer;" class="btn-open-source" data-source-id="${source.id}">
            <img 
              src="${source.icon_url || '/static/img/default-cover.png'}" 
              alt="${this.escapeHtml(source.name)}" 
              style="width: 28px; height: 28px; border-radius: 6px; object-fit: contain; background: rgba(0,0,0,0.3); padding: 2px;"
              onerror="this.src='/static/img/default-cover.png'"
            />
            <div>
              <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>${this.escapeHtml(source.name)}</span>
                <span style="font-size: 0.72rem; padding: 2px 6px; background: rgba(255,255,255,0.08); border-radius: 4px; color: var(--text-muted); font-weight: normal;">
                  ${(source.lang || 'EN').toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            ${isLoading ? `
              <span style="font-size: 0.8rem; color: var(--accent-primary); display: flex; align-items: center; gap: 6px;">
                <span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span>
                Searching...
              </span>
            ` : hasItems ? `
              <span style="font-size: 0.82rem; color: var(--accent-primary); font-weight: 600; background: rgba(99, 102, 241, 0.12); padding: 3px 8px; border-radius: 6px;">
                ${state.items.length} ${state.items.length === 1 ? 'result' : 'results'}
              </span>
            ` : isEmpty ? `
              <span style="font-size: 0.8rem; color: var(--text-muted);">No results</span>
            ` : isError ? `
              <span style="font-size: 0.8rem; color: #ef4444;">Failed</span>
              <button class="btn btn-secondary btn-retry-source" data-source-id="${source.id}" style="padding: 2px 8px; font-size: 0.75rem;">Retry</button>
            ` : ''}

            <button class="btn btn-secondary btn-open-source" data-source-id="${source.id}" style="padding: 5px 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;" title="View all in source catalog">
              <span>Open</span>
              <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <!-- Content Area: Horizontal Card Rail / Loading Skeletons -->
        ${isLoading ? `
          <div style="display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px;">
            ${[1, 2, 3, 4, 5].map(() => `
              <div style="flex: 0 0 140px; width: 140px;">
                <div style="width: 140px; height: 200px; background: rgba(255,255,255,0.05); border-radius: 8px; animation: pulse 1.5s infinite;"></div>
                <div style="height: 14px; width: 80%; background: rgba(255,255,255,0.05); border-radius: 4px; margin-top: 8px;"></div>
              </div>
            `).join('')}
          </div>
        ` : hasItems ? `
          <div class="global-card-rail" style="display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px; scroll-behavior: smooth;">
            ${state.items.map(m => `
              <div 
                class="global-manga-card" 
                data-source-id="${source.id}" 
                data-manga-id="${m.id}" 
                style="flex: 0 0 140px; width: 140px; cursor: pointer; transition: transform 0.18s ease;"
              >
                <div style="position: relative; width: 140px; height: 200px; border-radius: 8px; overflow: hidden; background: #181926; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                  <img 
                    src="${m.cover_url || '/static/img/default-cover.png'}" 
                    alt="${this.escapeHtml(m.title)}" 
                    loading="lazy" 
                    style="width: 100%; height: 100%; object-fit: cover;"
                    onerror="this.src='/static/img/default-cover.png'"
                  />
                  ${m.status ? `
                    <span style="position: absolute; bottom: 6px; left: 6px; font-size: 0.68rem; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); color: #fff; padding: 2px 6px; border-radius: 4px;">
                      ${this.escapeHtml(m.status)}
                    </span>
                  ` : ''}
                </div>
                <div style="margin-top: 8px; font-size: 0.85rem; font-weight: 500; color: var(--text-primary); line-height: 1.25; max-height: 2.5em; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${this.escapeHtml(m.title)}">
                  ${this.escapeHtml(m.title)}
                </div>
              </div>
            `).join('')}
          </div>
        ` : isEmpty ? `
          <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: rgba(0,0,0,0.15); border-radius: 8px;">
            No manga found in ${this.escapeHtml(source.name)} for "${this.escapeHtml(this.query)}"
          </div>
        ` : isError ? `
          <div style="padding: 16px; text-align: center; color: #f87171; font-size: 0.85rem; background: rgba(239, 68, 68, 0.08); border-radius: 8px;">
            ${this.escapeHtml(state.error || 'Failed to search source')}
          </div>
        ` : ''}
      </div>
    `;
  },

  bindSourceCardEvents() {
    this.sources.forEach(s => this.bindSingleSourceEvents(s.id));
  },

  bindSingleSourceEvents(sourceId) {
    const cardEl = document.getElementById(`global-source-row-${sourceId}`);
    if (!cardEl) return;

    // Click manga cards to open MangaDetailView
    cardEl.querySelectorAll('.global-manga-card').forEach(item => {
      item.addEventListener('click', () => {
        const src = item.getAttribute('data-source-id');
        const mId = item.getAttribute('data-manga-id');
        if (src && mId) {
          Router.navigate(`manga/${src}/${mId}`);
        }
      });
    });

    // Click open source
    cardEl.querySelectorAll('.btn-open-source').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = btn.getAttribute('data-source-id');
        if (src && typeof BrowseView.openSource === 'function') {
          BrowseView.openSource(src, this.query);
        } else if (src) {
          BrowseView.currentSource = src;
          BrowseView.catalogQuery = this.query;
          BrowseView.activeSubTab = 'sources';
          BrowseView.sourcesViewMode = 'catalog';
          Router.navigate('browse');
          BrowseView.render();
        }
      });
    });

    // Retry button
    const retryBtn = cardEl.querySelector('.btn-retry-source');
    if (retryBtn) {
      retryBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.sourceStates[sourceId] = { status: 'loading', items: [], total: 0, error: '' };
        this.updateSourceCard(sourceId);
        try {
          const res = await API.searchManga(sourceId, this.query, 1);
          this.sourceStates[sourceId] = {
            status: 'success',
            items: res.items || [],
            total: res.total || 0,
            error: ''
          };
        } catch (err) {
          this.sourceStates[sourceId] = {
            status: 'error',
            items: [],
            total: 0,
            error: err.message || 'Retry failed'
          };
        }
        this.updateSourceCard(sourceId);
        this.updateStatusHeader();
      });
    }
  },

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
