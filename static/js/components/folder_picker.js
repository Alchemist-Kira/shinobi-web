// Interactive Folder Picker Component - Mihon Web
const FolderPickerModal = {
  currentPath: '',
  selectedPath: '',
  parentPath: null,
  drives: [],
  folders: [],
  filterQuery: '',
  onSelectCallback: null,
  title: 'Select Folder',
  isManualEditing: false,

  async open(options = {}) {
    this.title = options.title || 'Select Folder';
    this.onSelectCallback = options.onSelect || null;
    this.currentPath = options.initialPath || '';
    this.selectedPath = options.initialPath || '';
    this.filterQuery = '';
    this.isManualEditing = false;

    this.createDom();
    await this.loadDirectory(this.currentPath);
  },

  close() {
    const el = document.getElementById('folder-picker-backdrop');
    if (el) el.remove();
    document.removeEventListener('keydown', this._handleKeydown);
  },

  createDom() {
    let existing = document.getElementById('folder-picker-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'folder-picker-backdrop';
    backdrop.className = 'modal-backdrop folder-picker-backdrop';
    backdrop.innerHTML = `
      <div class="modal-dialog folder-picker-modal" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="fp-header">
          <div class="fp-header-left">
            <div class="fp-icon-wrap">
              <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div>
              <h3 class="fp-title">${this.title}</h3>
              <p class="fp-subtitle">Browse directories or open Windows File Explorer</p>
            </div>
          </div>
          <button type="button" class="btn-icon-close" id="fp-btn-close" title="Close dialog">
            <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Toolbar / Drives & Native Dialog -->
        <div class="fp-toolbar">
          <div class="fp-drives-group" id="fp-drives-list">
            <!-- Drives injected here -->
          </div>
          <div class="fp-toolbar-actions">
            <button type="button" class="btn btn-secondary fp-btn-native" id="fp-btn-native" title="Open native Windows Folder Picker">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>Windows Explorer</span>
            </button>
            <button type="button" class="btn btn-secondary fp-btn-new-folder" id="fp-btn-new-folder" title="Create New Folder">
              <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              <span>New Folder</span>
            </button>
          </div>
        </div>

        <!-- Breadcrumbs & Quick Path Input -->
        <div class="fp-location-bar">
          <div class="fp-breadcrumbs" id="fp-breadcrumbs">
            <!-- Breadcrumbs injected here -->
          </div>
          <button type="button" class="fp-toggle-edit-btn" id="fp-toggle-edit" title="Toggle manual path input">
            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>

        <!-- Manual Path Edit Row (Hidden by default) -->
        <div class="fp-manual-edit-row" id="fp-manual-edit-row" style="display: none;">
          <input type="text" id="fp-manual-path-input" class="search-input" placeholder="Type or paste absolute path..." />
          <button type="button" class="btn btn-secondary" id="fp-btn-go-manual">Go</button>
        </div>

        <!-- Filter Subfolders Input -->
        <div class="fp-filter-bar">
          <svg viewBox="0 0 24 24" class="search-icon" style="width: 14px; height: 14px;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="fp-filter-input" class="search-input fp-filter-input" placeholder="Filter folders in this directory..." />
        </div>

        <!-- Folders List -->
        <div class="fp-list-container" id="fp-list-container">
          <div class="fp-loading-state">
            <div class="spinner"></div>
            <span>Loading folder contents...</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="fp-footer">
          <div class="fp-selected-info">
            <div class="fp-selected-label">Selected Directory:</div>
            <div class="fp-selected-path-text" id="fp-selected-path-display">${this.selectedPath || this.currentPath || 'None'}</div>
          </div>
          <div class="fp-footer-buttons">
            <button type="button" class="btn btn-secondary" id="fp-btn-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="fp-btn-select">Select This Folder</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.bindDomEvents(backdrop);

    this._handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this._handleKeydown);
  },

  bindDomEvents(backdrop) {
    const closeBtn = backdrop.querySelector('#fp-btn-close');
    const cancelBtn = backdrop.querySelector('#fp-btn-cancel');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    // Native dialog button
    const nativeBtn = backdrop.querySelector('#fp-btn-native');
    if (nativeBtn) {
      nativeBtn.addEventListener('click', async () => {
        nativeBtn.disabled = true;
        const originalText = nativeBtn.innerHTML;
        nativeBtn.innerHTML = `<span>Opening Explorer...</span>`;
        try {
          const res = await API.browseNativeFolder(this.currentPath, this.title);
          if (res && res.success && res.path) {
            this.selectedPath = res.path;
            this.currentPath = res.path;
            if (this.onSelectCallback) {
              this.onSelectCallback(res.path);
            }
            this.close();
            return;
          }
        } catch (e) {
          console.warn('Native folder browse error:', e);
          Toast.show('Native folder browser unavailable. Use the in-app folder picker below.', 'warning');
        } finally {
          nativeBtn.disabled = false;
          nativeBtn.innerHTML = originalText;
        }
      });
    }

    // New folder button
    const newFolderBtn = backdrop.querySelector('#fp-btn-new-folder');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', async () => {
        const name = prompt('Enter name for new folder:');
        if (!name || !name.trim()) return;
        try {
          const res = await API.createDirectory(this.currentPath, name.trim());
          if (res && res.success) {
            Toast.show('Folder created successfully', 'success');
            await this.loadDirectory(res.path || this.currentPath);
          } else {
            Toast.show(res.error || 'Failed to create folder', 'error');
          }
        } catch (err) {
          Toast.show('Error creating folder: ' + err.message, 'error');
        }
      });
    }

    // Toggle manual path edit
    const toggleEditBtn = backdrop.querySelector('#fp-toggle-edit');
    const manualRow = backdrop.querySelector('#fp-manual-edit-row');
    const manualInput = backdrop.querySelector('#fp-manual-path-input');
    const goManualBtn = backdrop.querySelector('#fp-btn-go-manual');

    if (toggleEditBtn && manualRow && manualInput) {
      toggleEditBtn.addEventListener('click', () => {
        this.isManualEditing = !this.isManualEditing;
        manualRow.style.display = this.isManualEditing ? 'flex' : 'none';
        if (this.isManualEditing) {
          manualInput.value = this.currentPath;
          manualInput.focus();
        }
      });

      const applyManual = () => {
        const val = manualInput.value.trim();
        if (val) {
          this.loadDirectory(val);
        }
      };

      if (goManualBtn) goManualBtn.addEventListener('click', applyManual);
      manualInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyManual();
      });
    }

    // Filter input
    const filterInput = backdrop.querySelector('#fp-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.filterQuery = e.target.value.toLowerCase().trim();
        this.renderFoldersList();
      });
    }

    // Select button
    const selectBtn = backdrop.querySelector('#fp-btn-select');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        const path = this.selectedPath || this.currentPath;
        if (!path) {
          Toast.show('Please select a valid folder', 'warning');
          return;
        }
        if (this.onSelectCallback) {
          this.onSelectCallback(path);
        }
        this.close();
      });
    }

    // Backdrop click outside to close
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });
  },

  async loadDirectory(targetPath = '') {
    const container = document.getElementById('fp-list-container');
    if (container) {
      container.innerHTML = `
        <div class="fp-loading-state">
          <div class="spinner"></div>
          <span>Reading directory contents...</span>
        </div>
      `;
    }

    try {
      const data = await API.listDirectory(targetPath);
      this.currentPath = data.current_path || targetPath;
      this.selectedPath = this.currentPath;
      this.parentPath = data.parent_path;
      this.drives = data.drives || [];
      this.folders = data.folders || [];

      this.renderDrives();
      this.renderBreadcrumbs();
      this.renderFoldersList();
      this.updateSelectedDisplay();
    } catch (e) {
      console.error('Error loading directory:', e);
      if (container) {
        container.innerHTML = `
          <div class="fp-error-state">
            <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: none; stroke: var(--accent-red); stroke-width: 2;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div>Unable to access directory: <code>${targetPath}</code></div>
            <button class="btn btn-secondary btn-sm" id="fp-btn-retry" style="margin-top: 10px;">Select Root Drive</button>
          </div>
        `;
        const retryBtn = container.querySelector('#fp-btn-retry');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            this.loadDirectory(this.drives[0] || 'C:\\');
          });
        }
      }
    }
  },

  renderDrives() {
    const list = document.getElementById('fp-drives-list');
    if (!list) return;

    if (!this.drives || this.drives.length === 0) {
      list.innerHTML = '';
      return;
    }

    const currentUpper = (this.currentPath || '').toUpperCase();
    list.innerHTML = this.drives.map(drive => {
      const driveUpper = drive.toUpperCase();
      const isActive = currentUpper.startsWith(driveUpper);
      return `
        <button type="button" class="fp-drive-btn ${isActive ? 'active' : ''}" data-drive="${drive}">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <line x1="6" y1="16" x2="6" y2="16"></line>
            <line x1="10" y1="16" x2="10" y2="16"></line>
          </svg>
          <span>${drive}</span>
        </button>
      `;
    }).join('');

    list.querySelectorAll('.fp-drive-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const drive = btn.getAttribute('data-drive');
        this.loadDirectory(drive);
      });
    });
  },

  renderBreadcrumbs() {
    const bc = document.getElementById('fp-breadcrumbs');
    if (!bc) return;

    const norm = (this.currentPath || '').replace(/\\/g, '/');
    const isWindows = /^[A-Za-z]:/.test(norm);

    let parts = [];
    if (isWindows) {
      const drive = norm.slice(0, 2); // e.g. "D:"
      const rest = norm.slice(2).replace(/^\/+/, '');
      parts.push({ name: drive + '\\', path: drive + '\\' });
      if (rest) {
        const segs = rest.split('/').filter(Boolean);
        let accumulated = drive + '\\';
        segs.forEach(seg => {
          accumulated = accumulated.endsWith('\\') ? accumulated + seg : accumulated + '\\' + seg;
          parts.push({ name: seg, path: accumulated });
        });
      }
    } else {
      parts.push({ name: '/', path: '/' });
      const segs = norm.split('/').filter(Boolean);
      let accumulated = '';
      segs.forEach(seg => {
        accumulated += '/' + seg;
        parts.push({ name: seg, path: accumulated });
      });
    }

    bc.innerHTML = `
      <div class="fp-crumbs-track">
        ${parts.map((p, idx) => {
          const isLast = idx === parts.length - 1;
          return `
            <button type="button" class="fp-crumb-item ${isLast ? 'active' : ''}" data-path="${p.path}">
              <span>${p.name}</span>
            </button>
            ${!isLast ? '<span class="fp-crumb-sep">/</span>' : ''}
          `;
        }).join('')}
      </div>
    `;

    bc.querySelectorAll('.fp-crumb-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-path');
        this.loadDirectory(p);
      });
    });
  },

  renderFoldersList() {
    const container = document.getElementById('fp-list-container');
    if (!container) return;

    let items = this.folders || [];
    if (this.filterQuery) {
      items = items.filter(f => f.name.toLowerCase().includes(this.filterQuery));
    }

    let html = '';

    // Up parent directory option
    if (this.parentPath) {
      html += `
        <div class="fp-folder-item fp-folder-parent" data-action="up" data-path="${this.parentPath}">
          <div class="fp-item-icon">
            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2;">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </div>
          <div class="fp-item-name">.. (Parent Directory)</div>
          <span class="fp-item-meta">${this.parentPath}</span>
        </div>
      `;
    }

    if (items.length === 0) {
      html += `
        <div class="fp-empty-folders">
          <svg viewBox="0 0 24 24" style="width: 28px; height: 28px; fill: none; stroke: var(--text-muted); stroke-width: 1.8;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">
            ${this.filterQuery ? 'No folders match the search query' : 'No subdirectories found in this folder'}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">
            You can select this directory directly using the button below.
          </div>
        </div>
      `;
    } else {
      items.forEach(folder => {
        const isSelected = this.selectedPath === folder.path;
        html += `
          <div class="fp-folder-item ${isSelected ? 'selected' : ''}" data-action="navigate" data-path="${folder.path}">
            <div class="fp-item-icon">
              <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div class="fp-item-name">${folder.name}</div>
            <button type="button" class="fp-item-open-btn" data-action="open-into" data-path="${folder.path}" title="Open into folder">
              <span>Open</span>
              <svg viewBox="0 0 24 24" style="width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        `;
      });
    }

    container.innerHTML = html;

    // Item click events
    container.querySelectorAll('.fp-folder-item').forEach(item => {
      // Single click selects
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="open-into"]')) return;
        const p = item.getAttribute('data-path');
        const action = item.getAttribute('data-action');
        if (action === 'up') {
          this.loadDirectory(p);
          return;
        }
        this.selectedPath = p;
        container.querySelectorAll('.fp-folder-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        this.updateSelectedDisplay();
      });

      // Double click navigates into folder
      item.addEventListener('dblclick', () => {
        const p = item.getAttribute('data-path');
        this.loadDirectory(p);
      });
    });

    // "Open" right button click
    container.querySelectorAll('[data-action="open-into"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = btn.getAttribute('data-path');
        this.loadDirectory(p);
      });
    });
  },

  updateSelectedDisplay() {
    const display = document.getElementById('fp-selected-path-display');
    if (display) {
      display.textContent = this.selectedPath || this.currentPath || 'None';
    }
  }
};
