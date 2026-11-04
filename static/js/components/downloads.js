// Downloads View Component - Professional Manga WebApp Download Manager
const DownloadsView = {
  pollInterval: null,
  activeFilter: 'all', // 'all' | 'active' | 'completed' | 'failed'
  sortMode: 'default', // 'default' | 'chapter_asc' | 'chapter_desc' | 'newest' | 'oldest'
  viewMode: 'manga',   // 'manga' (Grouped by Manga, Mihon default) | 'flat'
  collapsedManga: new Set(),
  isDragging: false,

  loadCollapsedState() {
    try {
      const raw = localStorage.getItem('mihon_dl_collapsed_manga');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.collapsedManga = new Set(arr.map(String));
          return;
        }
      }
    } catch (e) {
      console.error('Error loading collapsed manga state:', e);
    }
    this.collapsedManga = new Set();
  },

  saveCollapsedState() {
    try {
      localStorage.setItem('mihon_dl_collapsed_manga', JSON.stringify(Array.from(this.collapsedManga)));
    } catch (e) {
      console.error('Error saving collapsed manga state:', e);
    }
  },

  async render() {
    this.loadCollapsedState();
    const container = document.getElementById('view-downloads');
    if (!container) return;

    container.innerHTML = `
      <div class="downloads-wrapper">
        <!-- Unified Downloads Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">Downloads</h1>
              <span id="dl-live-status-dot" class="dl-live-dot" title="Active download worker pulse" style="margin-left: 8px;"></span>
            </div>
          </div>

          <!-- Bottom Row: Navigation Underline Tabs and Action Buttons -->
          <div class="lib-tabs-row">
            <div class="lib-tabs-track">
              <button class="lib-nav-tab dl-filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all" type="button">
                <span class="lib-tab-label">All</span>
                <span id="count-all" class="lib-tab-count">0</span>
                <span class="lib-tab-indicator"></span>
              </button>
              <button class="lib-nav-tab dl-filter-btn ${this.activeFilter === 'active' ? 'active' : ''}" data-filter="active" type="button">
                <span class="lib-tab-label">Active</span>
                <span id="count-active" class="lib-tab-count">0</span>
                <span class="lib-tab-indicator"></span>
              </button>
              <button class="lib-nav-tab dl-filter-btn ${this.activeFilter === 'completed' ? 'active' : ''}" data-filter="completed" type="button">
                <span class="lib-tab-label">Completed</span>
                <span id="count-completed" class="lib-tab-count">0</span>
                <span class="lib-tab-indicator"></span>
              </button>
              <button class="lib-nav-tab dl-filter-btn ${this.activeFilter === 'failed' ? 'active' : ''}" data-filter="failed" type="button">
                <span class="lib-tab-label">Failed</span>
                <span id="count-failed" class="lib-tab-count">0</span>
                <span class="lib-tab-indicator"></span>
              </button>
            </div>

            <div class="lib-toolbar-actions">
              <button id="btn-toggle-all-downloads" class="lib-action-btn" type="button" title="Pause or Resume All Downloads">
                <svg id="icon-toggle-all" viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <span id="label-toggle-all" style="display: none;">Pause All</span>
              </button>

              <button id="btn-clear-finished" class="lib-action-btn" type="button" title="Clear Finished & Failed Tasks">
                <svg viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>

              <button id="btn-cancel-all" class="lib-action-btn" type="button" title="Cancel All Downloads" style="color: var(--accent-red);">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <!-- Content Area -->
        <div class="downloads-content-area">
          <!-- Top Overview Stats Ribbon -->
          <div class="dl-stats-grid">
          <div class="dl-stat-card">
            <div class="dl-stat-icon-wrap">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
            <div>
              <div class="dl-stat-label">Active Queue</div>
              <div id="stat-active-chapters" class="dl-stat-value">0</div>
            </div>
          </div>

          <div class="dl-stat-card">
            <div class="dl-stat-icon-wrap">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
            </div>
            <div>
              <div class="dl-stat-label">Queued Manga</div>
              <div id="stat-active-manga" class="dl-stat-value">0</div>
            </div>
          </div>

          <div class="dl-stat-card">
            <div class="dl-stat-icon-wrap">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <div>
              <div class="dl-stat-label">Completed</div>
              <div id="stat-completed" class="dl-stat-value">0</div>
            </div>
          </div>

          <div class="dl-stat-card">
            <div class="dl-stat-icon-wrap">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div>
              <div class="dl-stat-label">Errors</div>
              <div id="stat-failed" class="dl-stat-value">0</div>
            </div>
          </div>
        </div>

        <!-- Controls Toolbar -->
        <div class="dl-controls-bar">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <!-- Segmented View Mode Controller -->
            <div class="dl-segmented-control">
              <button id="btn-view-manga" class="dl-segmented-btn ${this.viewMode === 'manga' ? 'active' : ''}">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span>By Manga</span>
              </button>
              <button id="btn-view-flat" class="dl-segmented-btn ${this.viewMode === 'flat' ? 'active' : ''}">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                <span>All Chapters</span>
              </button>
            </div>
          </div>

          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <!-- Sort Menu -->
            <select id="dl-sort-select" class="catalog-select" style="padding: 6px 12px; font-size: 0.8rem; min-width: 135px;">
              <option value="default" ${this.sortMode === 'default' ? 'selected' : ''}>Queue Order</option>
              <option value="chapter_asc" ${this.sortMode === 'chapter_asc' ? 'selected' : ''}>Chapter (Ascending)</option>
              <option value="chapter_desc" ${this.sortMode === 'chapter_desc' ? 'selected' : ''}>Chapter (Descending)</option>
              <option value="newest" ${this.sortMode === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="oldest" ${this.sortMode === 'oldest' ? 'selected' : ''}>Oldest First</option>
            </select>

            <!-- Auto-clear finished toggle switch -->
            <label class="dl-switch-label" title="Automatically remove finished tasks from active queue">
              <input type="checkbox" id="cb-auto-clear" class="dl-switch-input" checked />
              <span class="dl-switch-track"></span>
              <span>Auto-clear finished</span>
            </label>
          </div>
        </div>

        <!-- Downloads Queue Container -->
        <div id="downloads-list" class="dl-queue-container">
          <div class="dl-empty-state">
            <svg class="dl-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <div class="dl-empty-title">Loading queue...</div>
          </div>
        </div>
        </div>
      </div>
    `;

    this.bindGlobalEvents();
    await this.loadTasks();

    // Start auto polling
    clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      if (State.currentTab === 'downloads') {
        this.loadTasks(false);
      } else {
        clearInterval(this.pollInterval);
      }
    }, 1800);
  },

  bindGlobalEvents() {
    // View mode switchers
    const btnManga = document.getElementById('btn-view-manga');
    const btnFlat = document.getElementById('btn-view-flat');
    if (btnManga && btnFlat) {
      btnManga.addEventListener('click', () => {
        this.viewMode = 'manga';
        btnManga.classList.add('active');
        btnFlat.classList.remove('active');
        this.renderTaskList();
      });
      btnFlat.addEventListener('click', () => {
        this.viewMode = 'flat';
        btnFlat.classList.add('active');
        btnManga.classList.remove('active');
        this.renderTaskList();
      });
    }

    // Filter pills
    document.querySelectorAll('.dl-filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeFilter = btn.getAttribute('data-filter');
        document.querySelectorAll('.dl-filter-btn').forEach(b => {
          if (b.getAttribute('data-filter') === this.activeFilter) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
        await this.loadTasks();
      });
    });

    // Auto-clear switch toggle
    const cbAutoClear = document.getElementById('cb-auto-clear');
    if (cbAutoClear) {
      API.getSettings().then(s => {
        if (s && s.auto_clear_downloads !== undefined) {
          cbAutoClear.checked = s.auto_clear_downloads === 'true' || s.auto_clear_downloads === true;
        }
      }).catch(() => {});

      cbAutoClear.addEventListener('change', async (e) => {
        const val = e.target.checked ? 'true' : 'false';
        await API.saveSettings({ auto_clear_downloads: val });
        Toast.show(e.target.checked ? 'Auto-clear finished enabled' : 'Auto-clear finished disabled', 'info');
      });
    }

    // Sort Select
    const sortSelect = document.getElementById('dl-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortMode = e.target.value;
        this.renderTaskList();
      });
    }

    // Toggle All (Pause / Resume)
    const toggleAllBtn = document.getElementById('btn-toggle-all-downloads');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', async () => {
        const isPaused = toggleAllBtn.getAttribute('data-action') === 'resume';
        try {
          if (isPaused) {
            await API.resumeAllDownloads();
            Toast.show('All downloads resumed', 'success');
          } else {
            await API.pauseAllDownloads();
            Toast.show('All downloads paused', 'info');
          }
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    }

    // Clear Finished
    const clearBtn = document.getElementById('btn-clear-finished');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        try {
          await API.clearFinishedDownloads();
          Toast.show('Cleared finished downloads', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    }

    // Cancel All
    const cancelAllBtn = document.getElementById('btn-cancel-all');
    if (cancelAllBtn) {
      cancelAllBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to cancel all downloads in queue?')) return;
        try {
          await API.cancelAllDownloads();
          Toast.show('All downloads cancelled', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    }
  },

  async loadTasks(showLoading = true) {
    if (this.isDragging) return;
    const list = document.getElementById('downloads-list');
    if (!list) return;

    try {
      const queryParams = {};
      if (this.activeFilter === 'completed') {
        queryParams.filter = 'completed';
      } else if (this.activeFilter === 'failed') {
        queryParams.filter = 'failed';
      }
      const tasks = await API.getDownloads(queryParams);
      State.downloads = tasks || [];

      // Update counters
      const activeTasks = State.downloads.filter(t => t.status === 'downloading' || t.status === 'pending');
      const completedTasks = State.downloads.filter(t => t.status === 'completed');
      const failedTasks = State.downloads.filter(t => t.status === 'failed');

      // Count unique mangas in active queue
      const activeMangas = new Set(activeTasks.map(t => t.manga_id)).size;

      // Update Top Overview Stats Ribbon
      const statActCh = document.getElementById('stat-active-chapters');
      if (statActCh) statActCh.textContent = activeTasks.length;
      const statActMg = document.getElementById('stat-active-manga');
      if (statActMg) statActMg.textContent = activeMangas;
      const statComp = document.getElementById('stat-completed');
      if (statComp) statComp.textContent = completedTasks.length;
      const statFail = document.getElementById('stat-failed');
      if (statFail) statFail.textContent = failedTasks.length;

      // Update Filter Pill Counters
      const countAll = document.getElementById('count-all');
      if (countAll) countAll.textContent = State.downloads.length;
      const countActive = document.getElementById('count-active');
      if (countActive) countActive.textContent = activeTasks.length;
      const countCompleted = document.getElementById('count-completed');
      if (countCompleted) countCompleted.textContent = completedTasks.length;
      const countFailed = document.getElementById('count-failed');
      if (countFailed) countFailed.textContent = failedTasks.length;

      // Update Live Pulse Dot
      const liveDot = document.getElementById('dl-live-status-dot');
      if (liveDot) {
        if (State.downloads.some(t => t.status === 'downloading')) {
          liveDot.classList.add('active');
        } else {
          liveDot.classList.remove('active');
        }
      }

      // Update toggle-all button state
      const toggleAllBtn = document.getElementById('btn-toggle-all-downloads');
      const labelToggle = document.getElementById('label-toggle-all');
      const iconToggle = document.getElementById('icon-toggle-all');
      if (toggleAllBtn && labelToggle && iconToggle) {
        const hasActive = State.downloads.some(t => t.status === 'downloading' || t.status === 'pending');
        const hasPaused = State.downloads.some(t => t.status === 'paused');

        if (hasPaused && !hasActive) {
          toggleAllBtn.setAttribute('data-action', 'resume');
          labelToggle.textContent = 'Resume All';
          iconToggle.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        } else {
          toggleAllBtn.setAttribute('data-action', 'pause');
          labelToggle.textContent = 'Pause All';
          iconToggle.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        }
      }

      // Update badge in navbar
      Navbar.updateBadge('downloads', activeTasks.length);

      this.renderTaskList();
    } catch (err) {
      console.error('Failed to load downloads:', err);
    }
  },

  renderTaskList() {
    const list = document.getElementById('downloads-list');
    if (!list) return;

    let tasks = [...(State.downloads || [])];

    // Filter
    if (this.activeFilter === 'active') {
      tasks = tasks.filter(t => t.status === 'downloading' || t.status === 'pending' || t.status === 'paused');
    } else if (this.activeFilter === 'completed') {
      tasks = tasks.filter(t => t.status === 'completed');
    } else if (this.activeFilter === 'failed') {
      tasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
    }

    if (tasks.length === 0) {
      let emptyTitle = 'Queue is empty';
      let emptyMsg = 'No downloads in progress. Download chapters from any manga details page to read offline in CBZ format.';
      if (this.activeFilter === 'active') {
        emptyTitle = 'No active downloads';
        emptyMsg = 'All queued downloads have finished or no downloads are currently active.';
      } else if (this.activeFilter === 'completed') {
        emptyTitle = 'No completed downloads';
        emptyMsg = 'Completed chapters will appear here once packaging finishes.';
      } else if (this.activeFilter === 'failed') {
        emptyTitle = 'No failed downloads';
        emptyMsg = 'Your download queue is healthy with no reported errors.';
      }

      list.innerHTML = `
        <div class="dl-empty-state">
          <svg class="dl-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <div class="dl-empty-title">${emptyTitle}</div>
          <div class="dl-empty-desc">${emptyMsg}</div>
          <a href="#/library" class="btn btn-primary" style="padding: 7px 18px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 8px;">
            <span>Go to Library</span>
          </a>
        </div>
      `;
      return;
    }

    if (this.viewMode === 'manga') {
      this.renderMangaGroupedList(list, tasks);
    } else {
      this.renderFlatTaskList(list, tasks);
    }
  },

  renderMangaGroupedList(list, tasks) {
    // Group tasks by manga_id preserving queue priority
    const mangaGroups = [];
    const mangaMap = new Map();

    tasks.forEach(task => {
      let group = mangaMap.get(task.manga_id);
      if (!group) {
        group = {
          manga_id: task.manga_id,
          manga_title: task.manga_title || 'Untitled Manga',
          cover_url: task.cover_url || '/static/img/default-cover.png',
          source: task.source || 'mangadex',
          tasks: [],
          active_task: null,
          has_pending: false,
          has_paused: false,
          completed_count: 0,
          failed_count: 0
        };
        mangaMap.set(task.manga_id, group);
        mangaGroups.push(group);
      }
      group.tasks.push(task);

      if (task.status === 'downloading') {
        group.active_task = task;
      }
      if (task.status === 'pending') {
        group.has_pending = true;
      }
      if (task.status === 'paused') {
        group.has_paused = true;
      }
      if (task.status === 'completed') {
        group.completed_count++;
      }
      if (task.status === 'failed' || task.status === 'cancelled') {
        group.failed_count++;
      }
    });

    const totalGroups = mangaGroups.length;

    list.innerHTML = mangaGroups.map((group, groupIdx) => {
      const isCollapsed = this.collapsedManga.has(String(group.manga_id));
      const mangaUrl = `#/manga/${group.source}/${group.manga_id}`;

      // Calculate overall progress for this manga group
      const totalChs = group.tasks.length;
      let totalProgressUnits = 0;
      group.tasks.forEach(t => {
        if (t.status === 'completed') totalProgressUnits += 100;
        else if (t.status === 'downloading') totalProgressUnits += (t.progress || 0);
      });
      const groupOverallPct = totalChs > 0 ? Math.round(totalProgressUnits / totalChs) : 0;

      let mangaStatusText = `${totalChs} chapters in queue`;
      let mangaStatusColor = 'var(--text-muted)';
      let barClass = 'active';

      if (group.active_task) {
        const curTask = group.active_task;
        const curPct = Math.round(curTask.progress || 0);
        const curPages = curTask.total_pages ? ` (${curTask.downloaded_pages || 0}/${curTask.total_pages} pages)` : '';
        mangaStatusText = `Downloading: ${curTask.chapter_title} • ${curPct}%${curPages}`;
        mangaStatusColor = 'var(--accent-cyan)';
        barClass = 'active';
      } else if (group.has_pending) {
        const pendingCount = group.tasks.filter(t => t.status === 'pending').length;
        mangaStatusText = `${pendingCount} chapters waiting in queue`;
        mangaStatusColor = 'var(--text-secondary)';
        barClass = 'active';
      } else if (group.has_paused) {
        mangaStatusText = `Paused (${group.tasks.filter(t => t.status === 'paused').length} chapters)`;
        mangaStatusColor = '#fbbf24';
        barClass = 'paused';
      } else if (group.completed_count === totalChs) {
        mangaStatusText = `All ${totalChs} chapters completed`;
        mangaStatusColor = 'var(--accent-green)';
        barClass = 'done';
      }

      const canMoveTop = groupIdx > 0 && (group.has_pending || group.active_task);

      return `
        <div class="manga-download-group" data-manga-id="${group.manga_id}" draggable="true">
          <!-- Manga Group Header Card -->
          <div class="manga-group-header">
            <!-- Drag Handle for Manga Priority Reordering -->
            <div class="drag-handle manga-drag-handle" title="Drag and drop to reorder manga download priority">
              <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: currentColor;">
                <circle cx="9" cy="6" r="1.6"></circle>
                <circle cx="15" cy="6" r="1.6"></circle>
                <circle cx="9" cy="12" r="1.6"></circle>
                <circle cx="15" cy="12" r="1.6"></circle>
                <circle cx="9" cy="18" r="1.6"></circle>
                <circle cx="15" cy="18" r="1.6"></circle>
              </svg>
            </div>

            <!-- Cover Thumbnail -->
            <a href="${mangaUrl}" class="dl-cover-wrap" title="${group.manga_title}">
              <img src="${group.cover_url}" class="dl-cover-img" onerror="this.src='/static/img/default-cover.png'" alt="${group.manga_title}" />
            </a>

            <!-- Manga Info -->
            <div class="dl-manga-info">
              <div class="dl-manga-title-row">
                <a href="${mangaUrl}" class="dl-manga-title">
                  ${group.manga_title}
                </a>
                <span class="dl-source-pill">
                  ${group.source}
                </span>
                <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: 500;">
                  (${group.completed_count}/${totalChs} done)
                </span>
              </div>

              <div class="dl-status-line" style="color: ${mangaStatusColor};">
                ${group.active_task ? '<span class="dl-live-dot active" style="width: 7px; height: 7px;"></span>' : ''}
                <span>${mangaStatusText}</span>
              </div>

              <!-- Multi-color glowing progress bar -->
              <div class="dl-progress-track">
                <div class="dl-progress-bar ${barClass}" style="width: ${groupOverallPct}%;"></div>
              </div>
            </div>

            <!-- Manga Reorder & Group Controls -->
            <div class="dl-action-group">
              ${canMoveTop ? `
                <button class="dl-icon-btn btn-manga-top" data-manga-id="${group.manga_id}" title="Download this series first (Move to Top)">
                  <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.4;">
                    <line x1="4" y1="5" x2="20" y2="5"></line>
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
              ` : ''}

              ${(group.active_task || group.has_pending) ? `
                <button class="dl-icon-btn btn-manga-pause" data-manga-id="${group.manga_id}" title="Pause manga downloads">
                  <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                </button>
              ` : ''}

              ${group.has_paused ? `
                <button class="dl-icon-btn btn-manga-resume" data-manga-id="${group.manga_id}" title="Resume manga downloads">
                  <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
              ` : ''}

              <button class="dl-icon-btn btn-danger btn-manga-cancel" data-manga-id="${group.manga_id}" title="Cancel all queued chapters of this manga">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>

              <!-- Collapse / Expand chevron -->
              <button class="dl-icon-btn btn-manga-toggle-collapse" data-manga-id="${group.manga_id}" title="${isCollapsed ? 'Expand Chapters' : 'Collapse Chapters'}">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1);">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- Collapsible Chapter Rows Inside Manga -->
          <div class="manga-chapters-container" style="display: ${isCollapsed ? 'none' : 'flex'};">
            ${group.tasks.map(task => this.renderChapterRowHTML(task, false)).join('')}
          </div>
        </div>
      `;
    }).join('');

    this.bindRowEvents(list);
  },

  renderFlatTaskList(list, tasks) {
    if (this.sortMode === 'chapter_asc') {
      tasks.sort((a, b) => (parseFloat(a.chapter_number) || 0) - (parseFloat(b.chapter_number) || 0));
    } else if (this.sortMode === 'chapter_desc') {
      tasks.sort((a, b) => (parseFloat(b.chapter_number) || 0) - (parseFloat(a.chapter_number) || 0));
    } else if (this.sortMode === 'newest') {
      tasks.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    } else if (this.sortMode === 'oldest') {
      tasks.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    }

    list.innerHTML = `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); overflow: hidden;">
        ${tasks.map(task => this.renderChapterRowHTML(task, true)).join('')}
      </div>
    `;
    this.bindRowEvents(list);
  },

  renderChapterRowHTML(task, showCover = true) {
    const isLive = task.status === 'downloading' || task.status === 'pending';
    const isPaused = task.status === 'paused';
    const isFailed = task.status === 'failed';
    const isCompleted = task.status === 'completed';
    const isDownloading = task.status === 'downloading';
    const coverUrl = task.cover_url || '/static/img/default-cover.png';
    const mangaUrl = `#/manga/${task.source}/${task.manga_id}`;

    let statusDisplay = '';
    if (isDownloading) {
      const pct = Math.round(task.progress || 0);
      const pageInfo = task.total_pages ? ` (${task.downloaded_pages || 0}/${task.total_pages})` : '';
      statusDisplay = `
        <div style="text-align: right; min-width: 120px; flex-shrink: 0;">
          <div style="font-size: 0.72rem; font-weight: 500; color: var(--accent-primary); display: flex; align-items: center; justify-content: flex-end; gap: 5px;">
            <span class="dl-live-dot active" style="width: 5px; height: 5px;"></span>
            <span>Downloading${pageInfo}</span>
          </div>
          <div style="width: 90px; height: 3px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden; margin-top: 4px; margin-left: auto;">
            <div style="width: ${pct}%; height: 100%; background: var(--accent-primary); transition: width 0.24s cubic-bezier(0.23, 1, 0.32, 1);"></div>
          </div>
          <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; font-family: var(--font-mono);">${pct}%</div>
        </div>
      `;
    } else if (isCompleted) {
      const pInfo = task.total_pages || task.downloaded_pages ? ` • ${task.total_pages || task.downloaded_pages}p` : '';
      statusDisplay = `
        <div style="text-align: right; min-width: 90px; flex-shrink: 0; font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">
          Done${pInfo}
        </div>
      `;
    } else if (isFailed) {
      statusDisplay = `
        <div style="text-align: right; min-width: 90px; flex-shrink: 0; font-size: 0.74rem; color: var(--accent-red);">
          Failed
        </div>
      `;
    } else if (isPaused) {
      statusDisplay = `
        <div style="text-align: right; min-width: 90px; flex-shrink: 0; font-size: 0.74rem; color: var(--text-muted);">
          Paused
        </div>
      `;
    } else {
      statusDisplay = `
        <div style="text-align: right; min-width: 90px; flex-shrink: 0; font-size: 0.74rem; color: var(--text-muted);">
          Queued
        </div>
      `;
    }

    return `
      <div class="download-task-item" data-id="${task.id}" draggable="true">
        <!-- Drag Handle for Chapter Priority -->
        <div class="drag-handle chapter-drag-handle" title="Drag to reorder chapter priority">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
            <circle cx="9" cy="6" r="1.3"></circle>
            <circle cx="15" cy="6" r="1.3"></circle>
            <circle cx="9" cy="12" r="1.3"></circle>
            <circle cx="15" cy="12" r="1.3"></circle>
            <circle cx="9" cy="18" r="1.3"></circle>
            <circle cx="15" cy="18" r="1.3"></circle>
          </svg>
        </div>

        ${showCover ? `
          <a href="${mangaUrl}" class="dl-cover-wrap" style="width: 34px; height: 48px;">
            <img src="${coverUrl}" class="dl-cover-img" onerror="this.src='/static/img/default-cover.png'" alt="${task.manga_title}" />
          </a>
        ` : `
          <div class="dl-ch-badge">
            Ch. ${task.chapter_number || '?'}
          </div>
        `}

        <!-- Details & Chapter Info -->
        <div style="flex: 1; min-width: 0;">
          ${showCover ? `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <a href="${mangaUrl}" style="font-weight: 600; font-size: 0.88rem; color: #fff; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${task.manga_title}
              </a>
              <span class="dl-source-pill" style="font-size: 0.62rem; padding: 1px 5px;">
                ${task.source}
              </span>
            </div>
          ` : ''}

          <div class="dl-task-title">
            ${task.chapter_title}
          </div>

          ${task.error_message ? `
            <div style="font-size: 0.74rem; color: var(--accent-red); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${task.error_message}">
              Error: ${task.error_message}
            </div>
          ` : ''}
        </div>

        <!-- Progress & Status -->
        ${statusDisplay}

        <!-- Actions -->
        <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">
          ${task.status === 'pending' ? `
            <button class="dl-icon-btn btn-task-reorder" data-id="${task.id}" title="Download this chapter next (Move to Top)">
              <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <line x1="4" y1="5" x2="20" y2="5"></line>
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
          ` : ''}

          ${isLive ? `
            <button class="dl-icon-btn btn-task-pause" data-id="${task.id}" title="Pause Download">
              <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
          ` : ''}

          ${isPaused ? `
            <button class="dl-icon-btn btn-task-resume" data-id="${task.id}" title="Resume Download">
              <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: currentColor;">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
          ` : ''}

          ${isFailed ? `
            <button class="dl-icon-btn btn-task-retry" data-id="${task.id}" title="Retry Download">
              <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
          ` : ''}

          <button class="dl-icon-btn btn-danger btn-task-cancel" data-id="${task.id}" title="${isCompleted ? 'Remove from List' : 'Cancel Download'}">
            <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.2;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  },

  bindRowEvents(list) {
    // Manga Group Controls
    list.querySelectorAll('.btn-manga-top').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mangaId = btn.getAttribute('data-manga-id');
        try {
          await API.reorderMangaDownloads(mangaId, 'top');
          Toast.show('Moved manga to download first', 'success');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });



    list.querySelectorAll('.btn-manga-pause').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mangaId = btn.getAttribute('data-manga-id');
        try {
          await API.pauseMangaDownloads(mangaId);
          Toast.show('Paused manga downloads', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-manga-resume').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mangaId = btn.getAttribute('data-manga-id');
        try {
          await API.resumeMangaDownloads(mangaId);
          Toast.show('Resumed manga downloads', 'success');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-manga-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mangaId = btn.getAttribute('data-manga-id');
        if (!confirm('Cancel all queued chapters of this manga?')) return;
        try {
          await API.cancelMangaDownloads(mangaId);
          Toast.show('Cancelled manga downloads', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    const toggleCollapse = (mangaId) => {
      const idStr = String(mangaId);
      if (this.collapsedManga.has(idStr)) {
        this.collapsedManga.delete(idStr);
      } else {
        this.collapsedManga.add(idStr);
      }
      this.saveCollapsedState();
      this.renderTaskList();
    };

    list.querySelectorAll('.btn-manga-toggle-collapse').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mangaId = btn.getAttribute('data-manga-id');
        if (mangaId) toggleCollapse(mangaId);
      });
    });

    list.querySelectorAll('.manga-group-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, .drag-handle')) return;
        const groupEl = header.closest('.manga-download-group');
        if (!groupEl) return;
        const mangaId = groupEl.getAttribute('data-manga-id');
        if (mangaId) toggleCollapse(mangaId);
      });
    });

    // Individual Chapter Controls
    list.querySelectorAll('.btn-task-pause').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await API.pauseDownload(id);
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-task-resume').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await API.resumeDownload(id);
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-task-retry').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await API.retryDownload(id);
          Toast.show('Retrying download...', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-task-reorder').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await API.reorderDownload(id, true);
          Toast.show('Moved chapter to download first', 'info');
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    list.querySelectorAll('.btn-task-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await API.cancelDownload(id);
          await this.loadTasks();
        } catch (e) {
          Toast.show(e.message, 'error');
        }
      });
    });

    this.setupDragAndDrop(list);
  },

  setupDragAndDrop(list) {
    // 1. Reordering Manga Groups
    const mangaGroups = list.querySelectorAll('.manga-download-group');
    let draggedManga = null;

    mangaGroups.forEach(groupEl => {
      groupEl.addEventListener('dragstart', (e) => {
        // If drag started inside an individual chapter row, skip manga drag
        if (e.target.closest('.download-task-item')) return;

        draggedManga = groupEl;
        this.isDragging = true;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', groupEl.getAttribute('data-manga-id'));
        setTimeout(() => groupEl.classList.add('is-dragging'), 0);
      });

      groupEl.addEventListener('dragover', (e) => {
        if (!draggedManga || draggedManga === groupEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = groupEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          groupEl.classList.add('drag-over-top');
          groupEl.classList.remove('drag-over-bottom');
        } else {
          groupEl.classList.add('drag-over-bottom');
          groupEl.classList.remove('drag-over-top');
        }
      });

      groupEl.addEventListener('dragleave', () => {
        groupEl.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      groupEl.addEventListener('drop', async (e) => {
        if (!draggedManga || draggedManga === groupEl) return;
        e.preventDefault();
        const isTop = groupEl.classList.contains('drag-over-top');
        groupEl.classList.remove('drag-over-top', 'drag-over-bottom');

        if (isTop) {
          list.insertBefore(draggedManga, groupEl);
        } else {
          list.insertBefore(draggedManga, groupEl.nextSibling);
        }

        const newOrder = Array.from(list.querySelectorAll('.manga-download-group'))
          .map(el => el.getAttribute('data-manga-id'))
          .filter(Boolean);

        try {
          await API.reorderAllMangaDownloads(newOrder);
          Toast.show('Updated manga download priority', 'success');
        } catch (err) {
          Toast.show('Failed to save priority: ' + err.message, 'error');
        }
      });

      groupEl.addEventListener('dragend', () => {
        if (draggedManga) {
          draggedManga.classList.remove('is-dragging');
          draggedManga = null;
        }
        mangaGroups.forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
        this.isDragging = false;
        this.loadTasks(false);
      });
    });

    // 2. Reordering Individual Chapter Tasks
    const taskItems = list.querySelectorAll('.download-task-item');
    let draggedTask = null;

    taskItems.forEach(taskEl => {
      taskEl.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        draggedTask = taskEl;
        this.isDragging = true;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskEl.getAttribute('data-id'));
        setTimeout(() => taskEl.classList.add('is-dragging'), 0);
      });

      taskEl.addEventListener('dragover', (e) => {
        if (!draggedTask || draggedTask === taskEl) return;
        if (draggedTask.parentElement !== taskEl.parentElement) return;

        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const rect = taskEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          taskEl.classList.add('drag-over-top');
          taskEl.classList.remove('drag-over-bottom');
        } else {
          taskEl.classList.add('drag-over-bottom');
          taskEl.classList.remove('drag-over-top');
        }
      });

      taskEl.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        taskEl.classList.remove('drag-over-top', 'drag-over-bottom');
      });

      taskEl.addEventListener('drop', async (e) => {
        if (!draggedTask || draggedTask === taskEl) return;
        if (draggedTask.parentElement !== taskEl.parentElement) return;

        e.preventDefault();
        e.stopPropagation();
        const isTop = taskEl.classList.contains('drag-over-top');
        taskEl.classList.remove('drag-over-top', 'drag-over-bottom');

        const parentContainer = taskEl.parentElement;
        if (isTop) {
          parentContainer.insertBefore(draggedTask, taskEl);
        } else {
          parentContainer.insertBefore(draggedTask, taskEl.nextSibling);
        }

        const newTaskOrder = Array.from(parentContainer.querySelectorAll('.download-task-item'))
          .map(el => el.getAttribute('data-id'))
          .filter(Boolean);

        try {
          await API.reorderAllTaskDownloads(newTaskOrder);
          Toast.show('Updated chapter download priority', 'success');
        } catch (err) {
          Toast.show('Failed to save priority: ' + err.message, 'error');
        }
      });

      taskEl.addEventListener('dragend', (e) => {
        e.stopPropagation();
        if (draggedTask) {
          draggedTask.classList.remove('is-dragging');
          draggedTask = null;
        }
        taskItems.forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
        this.isDragging = false;
        this.loadTasks(false);
      });
    });
  }
};
