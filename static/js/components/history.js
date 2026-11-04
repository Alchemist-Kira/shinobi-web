// Mihon Web Reading History Component
const HistoryView = {
  historyItems: [],
  filterQuery: '',

  async render() {
    const container = document.getElementById('view-history');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
        Loading reading history...
      </div>
    `;

    try {
      this.historyItems = await API.getHistory();
      this.renderContent(container);
    } catch (err) {
      console.error('Failed to load history:', err);
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--accent-red);">
          Failed to load reading history.
        </div>
      `;
    }
  },

  renderContent(container) {
    container.innerHTML = `
      <div class="history-container">
        <!-- Unified History Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">History</h1>
            </div>

            <div class="lib-toolbar-actions">
              <div class="lib-search-shell">
                <svg viewBox="0 0 24 24" class="lib-search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  id="history-search-input" 
                  class="lib-search-input" 
                  placeholder="Search reading history..." 
                  value="${this.escapeHtml(this.filterQuery)}" 
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="lib-search-clear" id="btn-history-search-clear" type="button" title="Clear search (Esc)" style="display: ${this.filterQuery ? 'inline-flex' : 'none'};">
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <kbd class="lib-search-kbd" title="Press / to search">/</kbd>
              </div>

              <button class="lib-action-btn" id="btn-clear-all-history" type="button" title="Clear Entire Reading History" style="color: var(--accent-red);">
                <svg viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Bottom Row: Navigation Underline Tabs -->
          <div class="lib-tabs-track">
            <button class="lib-nav-tab active" type="button">
              <span class="lib-tab-label">Recent Activity</span>
              <span class="lib-tab-count" id="history-total-count">${this.historyItems.length}</span>
              <span class="lib-tab-indicator"></span>
            </button>
          </div>
        </header>

        <!-- Content Area -->
        <div class="history-content-area">
          <div id="history-list-container">
            ${this.renderHistoryGroups()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
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

  renderHistoryGroups() {
    let items = [...this.historyItems];
    if (this.filterQuery) {
      const q = this.filterQuery.toLowerCase();
      items = items.filter(item => 
        (item.title || '').toLowerCase().includes(q) || 
        (item.chapter_title || '').toLowerCase().includes(q) ||
        (item.chapter_number || '').toString().includes(q)
      );
    }

    if (items.length === 0) {
      return `
        <div style="text-align: center; padding: 70px 20px; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg); margin-top: 10px;">
          <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
            ${this.filterQuery ? 'No matching reading history found' : 'No Reading History Yet'}
          </div>
          <p style="font-size: 0.85rem; max-width: 420px; margin: 0 auto; line-height: 1.5;">
            ${this.filterQuery ? 'Try a different search keyword.' : 'Chapters you read will automatically appear here with progress tracking so you can resume anytime.'}
          </p>
        </div>
      `;
    }

    const groups = {
      Today: [],
      Yesterday: [],
      'Last 7 Days': [],
      Older: []
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const last7DaysStart = todayStart - (86400 * 7);

    items.forEach(item => {
      const t = item.last_read_at || 0;
      if (t >= todayStart) {
        groups.Today.push(item);
      } else if (t >= yesterdayStart) {
        groups.Yesterday.push(item);
      } else if (t >= last7DaysStart) {
        groups['Last 7 Days'].push(item);
      } else {
        groups.Older.push(item);
      }
    });

    return Object.entries(groups)
      .filter(([_, groupItems]) => groupItems.length > 0)
      .map(([groupName, groupItems]) => `
        <div class="history-group-wrap">
          <div class="history-date-header">
            <span>${groupName}</span>
            <span style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted);">(${groupItems.length})</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${groupItems.map(item => this.renderHistoryItem(item)).join('')}
          </div>
        </div>
      `).join('');
  },

  renderHistoryItem(item) {
    const isFinished = !!item.is_read;
    const pageIndex = item.page_index || 1;
    const totalPages = item.total_pages || 0;
    
    let progressBadge = '';
    let progressPercent = 0;
    if (isFinished) {
      progressBadge = `<span style="font-size: 0.72rem; background: rgba(16, 185, 129, 0.12); color: #34d399; padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 600;">Completed</span>`;
      progressPercent = 100;
    } else if (totalPages > 0) {
      progressPercent = Math.min(100, Math.round((pageIndex / totalPages) * 100));
      progressBadge = `<span style="font-size: 0.72rem; background: rgba(var(--accent-primary-rgb), 0.12); color: var(--accent-primary); padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 600;">p. ${pageIndex}/${totalPages}</span>`;
    } else if (pageIndex > 1) {
      progressBadge = `<span style="font-size: 0.72rem; background: rgba(var(--accent-primary-rgb), 0.12); color: var(--accent-primary); padding: 2px 7px; border-radius: var(--radius-sm); font-weight: 600;">p. ${pageIndex}</span>`;
    } else {
      progressBadge = `<span style="font-size: 0.72rem; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 7px; border-radius: var(--radius-sm);">Started</span>`;
    }

    const timeFormatted = this.formatTime(item.last_read_at);
    let chTitle = item.chapter_title || (item.chapter_number ? `Chapter ${item.chapter_number}` : 'Chapter');

    return `
      <div 
        class="history-card-row" 
        data-manga-id="${item.manga_id}" 
        data-chapter-id="${item.chapter_id}"
        data-source="${item.source || 'local'}"
        data-page="${pageIndex}"
      >
        <div class="history-cover-wrap btn-open-manga" style="cursor: pointer;" title="Open Manga Details">
          <img 
            class="history-cover-img"
            src="${item.cover_url || '/static/img/default-cover.png'}" 
            alt="${this.escapeHtml(item.title)}" 
            loading="lazy"
            onerror="this.src='/static/img/default-cover.png'"
          />
        </div>

        <div class="history-info-block">
          <a class="history-manga-title btn-open-manga" style="cursor: pointer;" title="${this.escapeHtml(item.title)}">
            ${this.escapeHtml(item.title)}
          </a>
          <div class="history-ch-title" title="${this.escapeHtml(chTitle)}">
            ${this.escapeHtml(chTitle)}
          </div>
          <div class="history-meta-line">
            ${progressBadge}
            ${totalPages > 0 && !isFinished ? `
              <div class="history-progress-track" title="${progressPercent}% read">
                <div class="history-progress-fill" style="width: ${progressPercent}%;"></div>
              </div>
            ` : ''}
            <span>${timeFormatted}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <button 
            class="btn btn-primary btn-resume-reading" 
            data-manga-id="${item.manga_id}" 
            data-chapter-id="${item.chapter_id}"
            data-source="${item.source || 'local'}"
            data-page="${pageIndex}"
            style="padding: 6px 14px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;"
            title="Resume reading from page ${pageIndex}"
          >
            <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Resume</span>
          </button>

          <button 
            class="btn btn-secondary btn-delete-history" 
            data-manga-id="${item.manga_id}" 
            data-chapter-id="${item.chapter_id}"
            title="Remove from history"
            style="padding: 6px 9px; color: var(--text-muted);"
          >
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  },

  bindEvents() {
    const input = document.getElementById('history-search-input');
    const clearSearchBtn = document.getElementById('btn-history-search-clear');

    if (input) {
      input.addEventListener('input', (e) => {
        this.filterQuery = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.style.display = this.filterQuery ? 'inline-flex' : 'none';
        }
        const container = document.getElementById('history-list-container');
        if (container) {
          container.innerHTML = this.renderHistoryGroups();
          this.bindRowEvents();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.filterQuery = '';
          input.value = '';
          if (clearSearchBtn) clearSearchBtn.style.display = 'none';
          input.blur();
          const container = document.getElementById('history-list-container');
          if (container) {
            container.innerHTML = this.renderHistoryGroups();
            this.bindRowEvents();
          }
        }
      });
    }

    if (clearSearchBtn && input) {
      clearSearchBtn.addEventListener('click', () => {
        this.filterQuery = '';
        input.value = '';
        clearSearchBtn.style.display = 'none';
        input.focus();
        const container = document.getElementById('history-list-container');
        if (container) {
          container.innerHTML = this.renderHistoryGroups();
          this.bindRowEvents();
        }
      });
    }

    // '/' keyboard shortcut to focus history search
    if (!this._hasBoundSlashShortcut) {
      this._hasBoundSlashShortcut = true;
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && State.currentTab === 'history') {
          const activeTag = (document.activeElement?.tagName || '').toLowerCase();
          if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            const hInput = document.getElementById('history-search-input');
            if (hInput) {
              hInput.focus();
              hInput.select();
            }
          }
        }
      });
    }

    const clearBtn = document.getElementById('btn-clear-all-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear your entire reading history?')) return;
        try {
          await API.clearHistory();
          this.historyItems = [];
          this.render();
          State.showToast('Reading history cleared');
        } catch (err) {
          console.error('Failed to clear history:', err);
          State.showToast('Failed to clear history');
        }
      });
    }

    this.bindRowEvents();
  },

  bindRowEvents() {
    const listContainer = document.getElementById('history-list-container');
    if (!listContainer) return;

    // Open manga details
    listContainer.querySelectorAll('.btn-open-manga').forEach(el => {
      el.addEventListener('click', () => {
        const row = el.closest('.history-card-row');
        if (!row) return;
        const mangaId = row.getAttribute('data-manga-id');
        const source = row.getAttribute('data-source') || 'local';
        Router.navigate(`manga/${source}/${mangaId}`);
      });
    });

    // Resume reading
    listContainer.querySelectorAll('.btn-resume-reading').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mangaId = btn.getAttribute('data-manga-id');
        const chapterId = btn.getAttribute('data-chapter-id');
        const source = btn.getAttribute('data-source') || 'local';
        const page = parseInt(btn.getAttribute('data-page') || '1', 10);
        
        Router.navigate(`read/${source}/${mangaId}/${encodeURIComponent(chapterId)}?page=${page}`);
      });
    });

    // Delete single entry
    listContainer.querySelectorAll('.btn-delete-history').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const mangaId = btn.getAttribute('data-manga-id');
        const chapterId = btn.getAttribute('data-chapter-id');
        
        try {
          await API.deleteHistoryItem(mangaId);
          this.historyItems = this.historyItems.filter(
            item => item.manga_id !== mangaId
          );
          
          const row = btn.closest('.history-card-row');
          if (row) {
            row.style.opacity = '0';
            row.style.transform = 'translateX(10px)';
            setTimeout(() => {
              const container = document.getElementById('history-list-container');
              if (container) {
                container.innerHTML = this.renderHistoryGroups();
                this.bindRowEvents();
              }
              const countEl = document.getElementById('history-total-count');
              if (countEl) {
                countEl.textContent = `${this.historyItems.length} manga`;
              }
            }, 180);
          }
          State.showToast('Removed manga from history');
        } catch (err) {
          console.error('Failed to remove history item:', err);
          State.showToast('Failed to remove manga from history');
        }
      });
    });
  },

  formatTime(timestamp) {
    if (!timestamp) return 'Recently';
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  }
};
