// Settings View Component - Mihon Web Edition
const SettingsView = {
  activeCategory: 'all',
  searchQuery: '',
  _keyHandler: null,

  async render() {
    const container = document.getElementById('view-settings');
    if (!container) return;

    let settings = {};
    try {
      settings = await API.getSettings();
      State.settings = settings;
    } catch (e) {
      console.warn('Could not load settings from server:', e);
      settings = State.settings || {};
    }

    const paths = settings.local_paths || [];
    const currentAccent = ThemeManager.currentAccent;
    const activeHex = currentAccent.startsWith('#') ? currentAccent : (ThemeManager.PRESETS[currentAccent]?.primary || '#0d9488');

    container.innerHTML = `
      <div class="settings-container">
        <!-- Unified Settings Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">Settings</h1>
            </div>

            <div class="lib-toolbar-actions">
              <!-- Integrated Search Shell with Shortcut Badge & Clear Button -->
              <div class="lib-search-shell">
                <svg viewBox="0 0 24 24" class="lib-search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  id="settings-search-input"
                  class="lib-search-input"
                  placeholder="Search settings, storage, theme..."
                  value="${this.searchQuery ? this.escapeHtml(this.searchQuery) : ''}"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button id="btn-settings-search-clear" class="lib-search-clear" type="button" title="Clear search (Esc)" style="display: ${this.searchQuery ? 'inline-flex' : 'none'};">
                  <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <kbd class="lib-search-kbd" title="Press / to focus search">/</kbd>
              </div>
            </div>
          </div>

          <!-- Bottom Row: Underline Navigation Tabs -->
          <div class="lib-tabs-track" id="settings-category-tabs">
            <button class="lib-nav-tab ${this.activeCategory === 'all' ? 'active' : ''}" data-cat="all" type="button">
              <span class="lib-tab-label">All</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeCategory === 'general' ? 'active' : ''}" data-cat="general" type="button">
              <span class="lib-tab-label">General</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeCategory === 'storage' ? 'active' : ''}" data-cat="storage" type="button">
              <span class="lib-tab-label">Storage</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeCategory === 'automations' ? 'active' : ''}" data-cat="automations" type="button">
              <span class="lib-tab-label">Automations</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeCategory === 'sync' ? 'active' : ''}" data-cat="sync" type="button">
              <span class="lib-tab-label">Data & Sync</span>
              <span class="lib-tab-indicator"></span>
            </button>
            <button class="lib-nav-tab ${this.activeCategory === 'about' ? 'active' : ''}" data-cat="about" type="button">
              <span class="lib-tab-label">About</span>
              <span class="lib-tab-indicator"></span>
            </button>
          </div>
        </header>

        <!-- Settings Content Area -->
        <div class="settings-content-area" style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Empty Search State -->
          <div id="settings-empty-search" style="display: none; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <svg viewBox="0 0 24 24" style="width: 44px; height: 44px; stroke: currentColor; fill: none; stroke-width: 1.5; margin: 0 auto 14px; opacity: 0.4;">
              <circle cx="11" cy="11" r="7"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No settings match your search</div>
            <div style="font-size: 0.82rem;">Try different keywords or check another category tab.</div>
          </div>

          <!-- 1. APPEARANCE & ACCENT COLOR -->
          <div class="settings-section-card" data-category="general">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"></path>
                  <circle cx="12" cy="12" r="4"></circle>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Appearance & Theme</div>
                <div class="settings-section-subtitle">Choose the webapp accent color for Shinobi</div>
              </div>
            </div>

            <div class="settings-section-body">
              <div class="settings-item-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                <div class="settings-item-info">
                  <div class="settings-item-title">App Accent Color</div>
                  <div class="settings-item-desc">Selected color highlights navigation tabs, buttons, progress rings, and active states.</div>
                </div>

                <!-- Color Swatch Presets -->
                <div class="theme-swatch-grid" style="width: 100%;">
                  ${Object.values(ThemeManager.PRESETS).map(preset => {
                    const isActive = currentAccent === preset.id || currentAccent === preset.primary;
                    return `
                      <button class="theme-swatch-btn ${isActive ? 'active' : ''}" data-theme-id="${preset.id}" type="button">
                        <div class="theme-swatch-dot" style="background-color: ${preset.primary};">
                          <svg class="theme-swatch-check" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                        <span class="theme-swatch-name">${preset.name}</span>
                      </button>
                    `;
                  }).join('')}
                </div>

                <!-- Custom Color Picker Row -->
                <div class="theme-custom-row" style="width: 100%;">
                  <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Custom Hex:</div>
                  <label class="theme-custom-picker-wrap">
                    <input type="color" id="theme-custom-input" class="theme-custom-color-input" value="${activeHex}" />
                    <span id="theme-custom-hex-label" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-primary); font-weight: 600;">
                      ${activeHex}
                    </span>
                  </label>
                  <button class="btn btn-secondary" id="btn-apply-custom-accent" style="padding: 5px 12px; font-size: 0.78rem;">
                    Apply Custom Color
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. DEFAULT READER PREFERENCES -->
          <div class="settings-section-card" data-category="general">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Default Reader Mechanics</div>
                <div class="settings-section-subtitle">Reading format, page layouts, and viewer display defaults</div>
              </div>
            </div>

            <div class="settings-section-body">
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Default Reading Mode</div>
                  <div class="settings-item-desc">Viewing layout when opening a chapter</div>
                </div>
                <div class="settings-control">
                  <select id="setting-reader-mode" class="catalog-select" style="min-width: 180px;">
                    <option value="webtoon" ${settings.reader_mode === 'webtoon' ? 'selected' : ''}>Webtoon (Vertical Strip)</option>
                    <option value="paged" ${settings.reader_mode === 'paged' ? 'selected' : ''}>Paged (Single Page)</option>
                  </select>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Webtoon Strip Max Width</div>
                  <div class="settings-item-desc">Constrain continuous vertical strip width for comfortable reading on widescreen monitors</div>
                </div>
                <div class="settings-control">
                  <select id="setting-reader-width" class="catalog-select" style="min-width: 180px;">
                    <option value="650" ${settings.reader_width === '650' ? 'selected' : ''}>650px (Narrow)</option>
                    <option value="800" ${settings.reader_width === '800' ? 'selected' : ''}>800px (Balanced)</option>
                    <option value="1000" ${settings.reader_width === '1000' ? 'selected' : ''}>1000px (Wide)</option>
                    <option value="1200" ${settings.reader_width === '1200' ? 'selected' : ''}>1200px (Extra Wide)</option>
                    <option value="1400" ${settings.reader_width === '1400' ? 'selected' : ''}>1400px (Cinematic)</option>
                    <option value="full" ${settings.reader_width === 'full' ? 'selected' : ''}>100% (Full Screen)</option>
                  </select>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Reader Canvas Background</div>
                  <div class="settings-item-desc">Background color behind comic pages</div>
                </div>
                <div class="settings-control">
                  <select id="setting-reader-bg" class="catalog-select" style="min-width: 180px;">
                    <option value="black" ${settings.reader_bg === 'black' ? 'selected' : ''}>Pitch Black</option>
                    <option value="dark" ${settings.reader_bg === 'dark' ? 'selected' : ''}>Dark Slate</option>
                    <option value="paper" ${settings.reader_bg === 'paper' ? 'selected' : ''}>Warm Paper</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. STORAGE DRIVE & DISK SYNC (E:, D:, etc.) -->
          <div class="settings-section-card" data-category="storage">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                  <line x1="6" y1="6" x2="6.01" y2="6"></line>
                  <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Data Storage Drive & Offline Sync</div>
                <div class="settings-section-subtitle">Save reading progress, library, and settings to any drive (E:\, D:\) to preserve C:\ drive space</div>
              </div>
            </div>

            <div class="settings-section-body">
              <div class="settings-item-row" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                  <div class="settings-item-info">
                    <div class="settings-item-title">Current Storage Location</div>
                    <div class="settings-item-desc" id="settings-storage-mode-desc">
                      ${window.Storage && Storage.activeHandle ? `Connected to folder: <strong>${Storage.activeHandle.name}</strong>` : 'Using Browser IndexedDB Storage (Stored locally in browser)'}
                    </div>
                  </div>
                  <div style="display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary btn-sm" id="btn-settings-pick-drive" style="display: inline-flex; align-items: center; gap: 6px;">
                      <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>Choose Folder on Drive (E:\)</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-settings-sync-disk" title="Manually re-sync library and reading progress to disk folder">
                      Sync to Disk Now
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" id="btn-settings-disconnect-drive" style="color: var(--text-muted);" title="Switch back to Browser IndexedDB">
                      Disconnect Drive
                    </button>
                  </div>
                </div>

                <div style="padding: 12px 14px; border-radius: var(--radius-md); background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary);">
                  <strong style="color: var(--text-primary);">Mihon Storage Architecture:</strong> When you connect a drive folder (e.g., <code>E:\Shinobi</code>), all manga downloads, backups, and library records are stored under this directory:
                  <div style="margin-top: 8px; font-family: var(--font-mono); font-size: 0.76rem; color: var(--text-secondary); line-height: 1.8;">
                    <div><strong style="color: var(--accent-primary);">${window.Storage && Storage.dirHandle ? Storage.dirHandle.name : 'Shinobi'}/</strong> (Library, Progress, & Settings JSON)</div>
                    <div style="padding-left: 14px;">+-- <strong>downloads/</strong> (Manga chapters saved as offline CBZ packages)</div>
                    <div style="padding-left: 14px;">+-- <strong>backups/</strong> (Automated and manual backup files)</div>
                    <div style="padding-left: 14px;">+-- <strong>local/</strong> (Local manga folders scanned into your library)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. DOWNLOADS & STORAGE -->
          <div class="settings-section-card" data-category="storage">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Downloads & Offline Storage</div>
                <div class="settings-section-subtitle">Manage downloaded chapters, CBZ packaging, and cache</div>
              </div>
            </div>

            <div class="settings-section-body">
              <!-- Download Location Setting -->
              <div class="settings-item-row" style="flex-direction: column; align-items: stretch; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                  <div class="settings-item-info">
                    <div class="settings-item-title">Manga Download Location</div>
                    <div class="settings-item-desc">Folder where chapters are saved as CBZ packages for offline reading. Shinobi also scans this directory into your library.</div>
                  </div>
                  <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-download-dir" title="Reset to default downloads folder">
                      Reset Default
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" id="btn-browse-download-dir" style="display: inline-flex; align-items: center; gap: 6px;">
                      <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span>Browse...</span>
                    </button>
                    <input type="file" id="picker-download-dir" webkitdirectory directory style="display: none;" />
                  </div>
                </div>

                <div style="display: flex; gap: 8px; align-items: center;">
                  <input type="text" id="setting-download-dir" class="search-input" value="${settings.download_dir || ''}" placeholder="e.g. D:\\Manga\\Downloads" style="flex: 1; font-family: var(--font-mono); font-size: 0.82rem;" />
                  <button type="button" class="btn btn-secondary" id="btn-save-download-dir" style="padding: 7px 14px; font-size: 0.82rem; white-space: nowrap;">
                    Save
                  </button>
                </div>
              </div>

              <!-- Auto-clear Toggle Switch -->
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Auto-clear Completed Downloads</div>
                  <div class="settings-item-desc">Automatically remove completed downloads from queue once packaged</div>
                </div>
                <div class="settings-control">
                  <label class="settings-toggle-switch">
                    <input type="checkbox" id="setting-auto-clear-downloads" ${localStorage.getItem('mihon_auto_clear_downloads') === 'true' ? 'checked' : ''} />
                    <span class="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <!-- Auto-delete Read Chapters Toggle Switch -->
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Auto-delete Read Chapters</div>
                  <div class="settings-item-desc">Automatically delete downloaded CBZ/ZIP files from disk once a chapter is finished</div>
                </div>
                <div class="settings-control">
                  <label class="settings-toggle-switch">
                    <input type="checkbox" id="setting-auto-delete-read-downloads" ${settings.auto_delete_read_downloads === 'true' ? 'checked' : ''} />
                    <span class="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Download Ahead While Reading</div>
                  <div class="settings-item-desc">Automatically download the next unread chapters into offline storage while reading to eliminate transition latency</div>
                </div>
                <div class="settings-control">
                  <select id="setting-download-ahead" class="catalog-select" style="min-width: 170px;">
                    <option value="0" ${(!settings.download_ahead || settings.download_ahead === '0') ? 'selected' : ''}>Off</option>
                    <option value="1" ${settings.download_ahead === '1' ? 'selected' : ''}>Next 1 chapter</option>
                    <option value="2" ${settings.download_ahead === '2' ? 'selected' : ''}>Next 2 chapters</option>
                    <option value="3" ${settings.download_ahead === '3' ? 'selected' : ''}>Next 3 chapters</option>
                    <option value="5" ${settings.download_ahead === '5' ? 'selected' : ''}>Next 5 chapters</option>
                  </select>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Clear Client Cache</div>
                  <div class="settings-item-desc">Purge browser metadata cache and force re-sync with SQLite backend</div>
                </div>
                <div>
                  <button id="btn-clear-browser-cache" class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.82rem;">
                    Clear Cache
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. LOCAL MANGA DIRECTORIES -->
          <div class="settings-section-card" data-category="storage">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Local Manga Directories</div>
                <div class="settings-section-subtitle">Local storage folders containing CBZ, ZIP, or image folders</div>
              </div>
            </div>

            <div class="settings-section-body" style="padding: 16px 22px;">
              <div id="local-paths-list" style="margin-bottom: 14px;">
                ${paths.length === 0 ? `
                  <div style="font-size: 0.82rem; color: var(--text-muted); padding: 8px 0;">No local folders added yet. Add a directory path below.</div>
                ` : paths.map((p, idx) => `
                  <div class="local-path-card">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                      <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: var(--text-muted); stroke-width: 2; flex-shrink: 0;">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span class="local-path-text">${p}</span>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                      <button class="btn btn-secondary btn-icon-only btn-open-local-path" data-path="${p}" title="Open directory in Windows File Explorer" style="padding: 6px;">
                        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </button>
                      <button class="btn btn-secondary btn-icon-only btn-remove-path" data-index="${idx}" title="Remove directory" style="color: var(--accent-red); padding: 6px;">
                        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Add New Path Form -->
              <div style="display: flex; gap: 8px; margin-bottom: 14px;">
                <input type="text" id="input-new-path" class="search-input" placeholder="e.g. D:\\Manga or D:\\Downloads\\Comics" style="flex: 1;" />
                <button type="button" id="btn-browse-local-path" class="btn btn-secondary" style="padding: 7px 14px; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
                  <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Browse...</span>
                </button>
                <input type="file" id="picker-local-dir" webkitdirectory directory style="display: none;" />
                <button id="btn-add-path" class="btn btn-primary" style="padding: 7px 16px; font-size: 0.84rem; white-space: nowrap;">
                  Add Folder
                </button>
              </div>

              <button id="btn-rescan-library" class="btn btn-secondary" style="width: 100%; justify-content: center; padding: 8px 16px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>Rescan Local Folders Now</span>
              </button>
            </div>
          </div>

          <!-- 5. AUTOMATED LIBRARY UPDATES -->
          <div class="settings-section-card" data-category="automations">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Automated Library Updates</div>
                <div class="settings-section-subtitle">Periodic background chapter checking and auto-downloading</div>
              </div>
            </div>

            <div class="settings-section-body">
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Update Frequency</div>
                  <div class="settings-item-desc">How often Shinobi scans installed extensions for newly released chapters</div>
                </div>
                <div class="settings-control">
                  <select id="setting-library-update-frequency" class="catalog-select" style="min-width: 170px;">
                    <option value="off" ${settings.library_update_frequency === 'off' ? 'selected' : ''}>Off</option>
                    <option value="6h" ${settings.library_update_frequency === '6h' ? 'selected' : ''}>Every 6 hours</option>
                    <option value="12h" ${settings.library_update_frequency === '12h' || !settings.library_update_frequency ? 'selected' : ''}>Every 12 hours</option>
                    <option value="daily" ${settings.library_update_frequency === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="2days" ${settings.library_update_frequency === '2days' ? 'selected' : ''}>Every 2 days</option>
                    <option value="weekly" ${settings.library_update_frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                  </select>
                </div>
              </div>

              <!-- Skip Completed Manga Toggle Switch -->
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Skip Completed Manga</div>
                  <div class="settings-item-desc">Ignore titles whose status is marked as Completed to reduce network requests</div>
                </div>
                <div class="settings-control">
                  <label class="settings-toggle-switch">
                    <input type="checkbox" id="setting-library-skip-completed" ${settings.library_update_skip_completed !== 'false' ? 'checked' : ''} />
                    <span class="settings-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Auto-Download New Chapters</div>
                  <div class="settings-item-desc">Automatically enqueue and package newly released chapters to local storage</div>
                </div>
                <div class="settings-control">
                  <select id="setting-library-auto-download" class="catalog-select" style="min-width: 170px;">
                    <option value="0" ${settings.library_update_auto_download === '0' || !settings.library_update_auto_download ? 'selected' : ''}>Off (Do not auto-download)</option>
                    <option value="1" ${settings.library_update_auto_download === '1' ? 'selected' : ''}>Next 1 chapter</option>
                    <option value="2" ${settings.library_update_auto_download === '2' ? 'selected' : ''}>Next 2 chapters</option>
                    <option value="3" ${settings.library_update_auto_download === '3' ? 'selected' : ''}>Next 3 chapters</option>
                    <option value="5" ${settings.library_update_auto_download === '5' ? 'selected' : ''}>Next 5 chapters</option>
                  </select>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Manual Library Check</div>
                  <div class="settings-item-desc" id="settings-last-check-text">
                    ${settings.last_library_update_time && settings.last_library_update_time !== '0' ? `Last checked: ${new Date(parseFloat(settings.last_library_update_time) * 1000).toLocaleString()}` : 'Never checked'}
                  </div>
                </div>
                <div>
                  <button id="btn-settings-check-library" class="btn btn-secondary" style="padding: 7px 16px; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 7px;">
                    <svg id="settings-check-icon" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                    <span id="settings-check-text">Check Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 6. BACKUP AND RESTORE -->
          <div class="settings-section-card" id="settings-backup-section" data-category="sync">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Backup and restore</div>
                <div class="settings-section-subtitle">Manual backup and restore library data</div>
              </div>
            </div>

            <div class="settings-section-body">
              <!-- Side-by-side Clickable Action Cards -->
              <div class="backup-action-cards-grid">
                <div class="backup-action-card" id="row-create-backup" role="button" tabindex="0" title="Click to create and download backup">
                  <div class="backup-action-card-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </div>
                  <div class="backup-action-card-content">
                    <div class="backup-action-card-title">Create backup</div>
                    <div class="backup-action-card-desc">Export Mihon & Tachiyomi compatible (.tachibk) file</div>
                  </div>
                  <div class="backup-action-card-arrow">
                    <svg viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>

                <div class="backup-action-card" id="row-restore-backup" role="button" tabindex="0" title="Click to select backup file to restore">
                  <div class="backup-action-card-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                  </div>
                  <div class="backup-action-card-content">
                    <div class="backup-action-card-title">Restore backup</div>
                    <div class="backup-action-card-desc">Restore from Mihon or Tachiyomi (.tachibk) file</div>
                  </div>
                  <div class="backup-action-card-arrow">
                    <svg viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              <div class="settings-item-row">
                <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
                  <div class="settings-action-icon">
                    <svg viewBox="0 0 24 24" style="width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div class="settings-item-info">
                    <div class="settings-item-title">Automatic backup frequency</div>
                    <div class="settings-item-desc">Automatically create and maintain local library backups</div>
                  </div>
                </div>
                <div class="settings-control">
                  <select id="setting-auto-backup" class="catalog-select" style="min-width: 170px;">
                    <option value="off" ${settings.auto_backup_frequency === 'off' || !settings.auto_backup_frequency ? 'selected' : ''}>Off</option>
                    <option value="6h" ${settings.auto_backup_frequency === '6h' ? 'selected' : ''}>Every 6 hours</option>
                    <option value="12h" ${settings.auto_backup_frequency === '12h' ? 'selected' : ''}>Every 12 hours</option>
                    <option value="daily" ${settings.auto_backup_frequency === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="2days" ${settings.auto_backup_frequency === '2days' ? 'selected' : ''}>Every 2 days</option>
                    <option value="weekly" ${settings.auto_backup_frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                  </select>
                </div>
              </div>
              <input type="file" id="input-restore-file" accept=".json,.tachibk,.gz" style="display: none;" />
            </div>
          </div>

          <!-- 7. TRACKING SERVICES (ACCOUNT SYNC & OAUTH) -->
          <div class="settings-section-card" id="settings-tracking-section" data-category="sync">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <path d="M21.5 2v6h-6"></path>
                  <path d="M2.5 22v-6h6"></path>
                  <path d="M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">Tracking Accounts (OAuth & Remote Sync)</div>
                <div class="settings-section-subtitle">Connect your AniList, MyAnimeList, and other tracker profiles to sync reading status automatically</div>
              </div>
            </div>

            <div class="settings-section-body" style="padding: 16px 22px;">
              <div id="settings-tracking-accounts-container" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px 0;">Loading tracking accounts...</div>
              </div>
            </div>
          </div>

          <!-- 8. ABOUT & SYSTEM INFO -->
          <div class="settings-section-card" data-category="about">
            <div class="settings-section-header">
              <div class="settings-section-icon">
                <svg viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div>
                <div class="settings-section-title">About Shinobi</div>
                <div class="settings-section-subtitle">System architecture, version, and repository status</div>
              </div>
            </div>

            <div class="settings-section-body">
              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Application Architecture</div>
                  <div class="settings-item-desc">Shinobi Web Serverless Edition (Vercel Ready)</div>
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.82rem; background: var(--bg-surface-elevated); padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); color: var(--accent-primary); font-weight: 600;">
                  v2.0.0
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Client Storage Engine</div>
                  <div class="settings-item-desc">IndexedDB Browser Persistence (Zero Server Required, All Data Saved on Device)</div>
                </div>
                <div style="font-size: 0.82rem; color: #10b981; display: flex; align-items: center; gap: 6px; font-weight: 500;">
                  <span class="dl-live-dot active" style="width: 7px; height: 7px; background: #10b981;"></span>
                  <span>Active & Persistent</span>
                </div>
              </div>

              <div class="settings-item-row">
                <div class="settings-item-info">
                  <div class="settings-item-title">Onboarding & Setup Wizard</div>
                  <div class="settings-item-desc">Re-run the first-visit wizard to reconfigure your storage drive, color accent, or reader mechanics</div>
                </div>
                <div>
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-rerun-setup-wizard">
                    Re-run Setup Wizard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(paths, settings);
    this.filterSettings();
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  filterSettings() {
    const container = document.getElementById('view-settings');
    if (!container) return;

    const query = (this.searchQuery || '').trim().toLowerCase();
    const cat = this.activeCategory || 'all';

    const cards = container.querySelectorAll('.settings-section-card');
    let visibleCount = 0;

    cards.forEach(card => {
      const cardCat = card.getAttribute('data-category') || '';
      const matchesCat = (cat === 'all') || (cardCat === cat);

      let matchesQuery = true;
      if (query) {
        const text = card.textContent.toLowerCase();
        matchesQuery = text.includes(query);
      }

      if (matchesCat && matchesQuery) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    const emptyEl = container.querySelector('#settings-empty-search');
    if (emptyEl) {
      emptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  },

  bindEvents(paths, settings = {}) {
    const container = document.getElementById('view-settings');
    if (!container) return;

    // Category Tabs Navigation
    const tabBtns = container.querySelectorAll('#settings-category-tabs .lib-nav-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetCat = btn.getAttribute('data-cat') || 'all';
        this.activeCategory = targetCat;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterSettings();
      });
    });

    // Integrated Search Input & Clear Button
    const searchInput = container.querySelector('#settings-search-input');
    const searchClear = container.querySelector('#btn-settings-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (searchClear) {
          searchClear.style.display = this.searchQuery ? 'inline-flex' : 'none';
        }
        this.filterSettings();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (searchInput.value) {
            searchInput.value = '';
            this.searchQuery = '';
            if (searchClear) searchClear.style.display = 'none';
            this.filterSettings();
          } else {
            searchInput.blur();
          }
        }
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        searchInput.focus();
        this.filterSettings();
      });
    }

    // Keyboard Hotkey "/"
    const handleKeydown = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        const activeTab = document.body.getAttribute('data-active-tab');
        if (activeTab === 'settings') {
          const input = document.getElementById('settings-search-input');
          if (input) {
            e.preventDefault();
            input.focus();
            input.select();
          }
        }
      }
    };
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
    this._keyHandler = handleKeydown;
    document.addEventListener('keydown', this._keyHandler);

    // Download Directory Controls
    const browseDlBtn = container.querySelector('#btn-browse-download-dir');
    const pickerDlInput = container.querySelector('#picker-download-dir');
    const dlInput = container.querySelector('#setting-download-dir');

    // Modern Native Directory Picker Helper (avoids browser 'Upload files?' prompt)
    const pickFolderNative = async (fallbackInput) => {
      if (window.showDirectoryPicker) {
        try {
          const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
          if (!dirHandle) return null;
          const folderName = dirHandle.name;
          const sampleFiles = [];
          try {
            for await (const entry of dirHandle.values()) {
              if (entry.kind === 'file') {
                sampleFiles.push(entry.name);
                if (sampleFiles.length >= 10) break;
              }
            }
          } catch (e) {}

          try {
            const res = await API.locateFolder(folderName, sampleFiles);
            if (res && res.success && res.path) {
              return res.path;
            }
          } catch (e) {}
          return folderName;
        } catch (err) {
          if (err.name === 'AbortError') return null; // User cancelled
          console.warn('showDirectoryPicker failed, using fallback input', err);
        }
      }
      if (fallbackInput) {
        fallbackInput.value = '';
        fallbackInput.click();
      }
      return null;
    };

    if (browseDlBtn) {
      browseDlBtn.addEventListener('click', async () => {
        const resolvedPath = await pickFolderNative(pickerDlInput);
        if (resolvedPath && dlInput) {
          dlInput.value = resolvedPath;
          await API.saveSettings({ download_dir: resolvedPath });
          if (State.settings) State.settings.download_dir = resolvedPath;
          Toast.show('Download folder set: ' + resolvedPath, 'success');
        }
      });
    }

    if (pickerDlInput && dlInput) {
      pickerDlInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const relPath = files[0].webkitRelativePath || '';
        const folderName = relPath.split('/')[0] || files[0].name;
        const sampleFiles = files.slice(0, 10).map(f => f.name);

        try {
          const res = await API.locateFolder(folderName, sampleFiles);
          if (res && res.success && res.path) {
            dlInput.value = res.path;
            await API.saveSettings({ download_dir: res.path });
            if (State.settings) State.settings.download_dir = res.path;
            Toast.show('Download folder set: ' + res.path, 'success');
          } else {
            dlInput.value = folderName;
            Toast.show('Selected folder: ' + folderName, 'info');
          }
        } catch (err) {
          dlInput.value = folderName;
        }
      });
    }

    const saveDlBtn = container.querySelector('#btn-save-download-dir');
    if (saveDlBtn && dlInput) {
      saveDlBtn.addEventListener('click', async () => {
        const val = dlInput.value.trim();
        await API.saveSettings({ download_dir: val });
        if (State.settings) State.settings.download_dir = val;
        Toast.show('Download location saved', 'success');
      });
    }

    const resetDlBtn = container.querySelector('#btn-reset-download-dir');
    if (resetDlBtn && dlInput) {
      resetDlBtn.addEventListener('click', async () => {
        const defaultDir = settings.default_download_dir || '';
        dlInput.value = defaultDir;
        await API.saveSettings({ download_dir: defaultDir });
        if (State.settings) State.settings.download_dir = defaultDir;
        Toast.show('Reset to default download location', 'info');
      });
    }

    // Browse Local Manga Directory
    const browseLocalBtn = container.querySelector('#btn-browse-local-path');
    const pickerLocalInput = container.querySelector('#picker-local-dir');
    const inputNewPath = container.querySelector('#input-new-path');

    if (browseLocalBtn) {
      browseLocalBtn.addEventListener('click', async () => {
        const finalPath = await pickFolderNative(pickerLocalInput);
        if (finalPath) {
          if (paths.includes(finalPath)) {
            Toast.show('Folder is already added: ' + finalPath, 'info');
            return;
          }
          paths.push(finalPath);
          await API.saveSettings({ local_paths: paths });
          Toast.show('Added and saved folder: ' + finalPath, 'success');
          this.render();
          API.scanLocalLibrary().catch(() => {});
        }
      });
    }

    if (pickerLocalInput) {
      pickerLocalInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const relPath = files[0].webkitRelativePath || '';
        const folderName = relPath.split('/')[0] || files[0].name;
        const sampleFiles = files.slice(0, 10).map(f => f.name);

        let finalPath = folderName;
        try {
          const res = await API.locateFolder(folderName, sampleFiles);
          if (res && res.success && res.path) {
            finalPath = res.path;
          }
        } catch (err) {
          // fallback to folderName
        }

        if (paths.includes(finalPath)) {
          Toast.show('Folder is already added: ' + finalPath, 'info');
          return;
        }

        paths.push(finalPath);
        await API.saveSettings({ local_paths: paths });
        Toast.show('Added and saved folder: ' + finalPath, 'success');
        this.render();
        API.scanLocalLibrary().catch(() => {});
      });
    }

    // Open local path in explorer buttons
    container.querySelectorAll('.btn-open-local-path').forEach(btn => {
      btn.addEventListener('click', async () => {
        const p = btn.getAttribute('data-path');
        if (p) {
          try {
            await API.openExplorer(p);
            Toast.show('Opening folder in Windows Explorer...', 'info');
          } catch (err) {
            Toast.show('Failed to open: ' + err.message, 'error');
          }
        }
      });
    });

    // Theme Accent Preset Swatches
    container.querySelectorAll('.theme-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-id');
        container.querySelectorAll('.theme-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ThemeManager.applyAccent(themeId, true);
        Toast.show(`Accent color set to ${ThemeManager.PRESETS[themeId]?.name || themeId}`, 'success');
      });
    });

    // Custom Color Input
    const customInput = container.querySelector('#theme-custom-input');
    const customHexLabel = container.querySelector('#theme-custom-hex-label');
    if (customInput && customHexLabel) {
      customInput.addEventListener('input', (e) => {
        customHexLabel.textContent = e.target.value.toUpperCase();
      });

      const applyCustomBtn = container.querySelector('#btn-apply-custom-accent');
      if (applyCustomBtn) {
        applyCustomBtn.addEventListener('click', () => {
          const hex = customInput.value;
          container.querySelectorAll('.theme-swatch-btn').forEach(b => b.classList.remove('active'));
          ThemeManager.applyAccent(hex, true);
          Toast.show(`Custom accent color set to ${hex.toUpperCase()}`, 'success');
        });
      }
    }

    // Add path
    const addPathBtn = container.querySelector('#btn-add-path');
    const inputPathElem = container.querySelector('#input-new-path');
    const handleAddPath = async () => {
      const val = inputPathElem ? inputPathElem.value.trim() : '';
      if (!val) return;
      if (!paths.includes(val)) {
        paths.push(val);
        await API.saveSettings({ local_paths: paths });
        Toast.show('Directory added successfully', 'success');
        this.render();
        API.scanLocalLibrary().catch(() => {});
      } else {
        Toast.show('Folder is already added', 'info');
      }
    };
    if (addPathBtn) {
      addPathBtn.addEventListener('click', handleAddPath);
    }
    if (inputPathElem) {
      inputPathElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddPath();
        }
      });
    }

    // Remove path
    container.querySelectorAll('.btn-remove-path').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        paths.splice(idx, 1);
        await API.saveSettings({ local_paths: paths });
        Toast.show('Directory removed', 'info');
        this.render();
      });
    });

    // Rescan Library
    const rescanBtn = container.querySelector('#btn-rescan-library');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', async () => {
        Toast.show('Rescanning local manga directories...', 'info');
        try {
          await LibraryView.loadData();
          Toast.show('Local library updated successfully', 'success');
        } catch (e) {
          Toast.show('Rescan completed', 'success');
        }
      });
    }

    // Preference selects
    const modeSelect = container.querySelector('#setting-reader-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', async (e) => {
        await API.saveSettings({ reader_mode: e.target.value });
        if (State.settings) State.settings.reader_mode = e.target.value;
        Toast.show('Reader mode updated', 'success');
      });
    }

    const widthSelect = container.querySelector('#setting-reader-width');
    if (widthSelect) {
      widthSelect.addEventListener('change', async (e) => {
        await API.saveSettings({ reader_width: e.target.value });
        if (State.settings) State.settings.reader_width = e.target.value;
        Toast.show('Webtoon strip width updated', 'success');
      });
    }

    const bgSelect = container.querySelector('#setting-reader-bg');
    if (bgSelect) {
      bgSelect.addEventListener('change', async (e) => {
        await API.saveSettings({ reader_bg: e.target.value });
        if (State.settings) State.settings.reader_bg = e.target.value;
        Toast.show('Reader background updated', 'success');
      });
    }

    // Auto-clear downloads toggle switch
    const autoClearCb = container.querySelector('#setting-auto-clear-downloads');
    if (autoClearCb) {
      autoClearCb.addEventListener('change', (e) => {
        localStorage.setItem('mihon_auto_clear_downloads', e.target.checked ? 'true' : 'false');
        Toast.show(e.target.checked ? 'Auto-clear finished downloads enabled' : 'Auto-clear finished downloads disabled', 'info');
      });
    }

    // Auto-delete read chapters toggle switch
    const autoDeleteReadCb = container.querySelector('#setting-auto-delete-read-downloads');
    if (autoDeleteReadCb) {
      autoDeleteReadCb.addEventListener('change', async (e) => {
        const val = e.target.checked ? 'true' : 'false';
        await API.saveSettings({ auto_delete_read_downloads: val });
        if (State.settings) State.settings.auto_delete_read_downloads = val;
        Toast.show(e.target.checked ? 'Auto-delete read chapters enabled' : 'Auto-delete read chapters disabled', 'info');
      });
    }

    const downloadAheadSelect = container.querySelector('#setting-download-ahead');
    if (downloadAheadSelect) {
      downloadAheadSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        await API.saveSettings({ download_ahead: val });
        localStorage.setItem('shinobi_download_ahead', val);
        if (State.settings) State.settings.download_ahead = val;
        Toast.show(val !== '0' ? `Download ahead set to next ${val} chapter${val !== '1' ? 's' : ''}` : 'Download ahead disabled', 'success');
      });
    }

    // Clear Browser Cache
    const clearCacheBtn = container.querySelector('#btn-clear-browser-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        if (!confirm('Clear cached manga details from browser storage?')) return;
        try {
          const keys = Object.keys(localStorage);
          keys.forEach(k => {
            if (k.startsWith('manga_meta_') || k.startsWith('manga_chapters_') || k.startsWith('session_')) {
              localStorage.removeItem(k);
            }
          });
          Toast.show('Browser cache cleared successfully', 'success');
        } catch (e) {
          Toast.show('Cache cleared', 'success');
        }
      });
    }

    // Storage Drive Management (E:, D:, etc.)
    const pickDriveBtn = container.querySelector('#btn-settings-pick-drive');
    const syncDiskBtn = container.querySelector('#btn-settings-sync-disk');
    const disconnectDriveBtn = container.querySelector('#btn-settings-disconnect-drive');

    if (pickDriveBtn) {
      pickDriveBtn.addEventListener('click', async () => {
        try {
          if (!window.Storage || typeof Storage.pickDirectory !== 'function') {
            Toast.show('Storage engine not available', 'error');
            return;
          }
          const handle = await Storage.pickDirectory();
          if (handle) {
            Toast.show(`Connected to folder: ${handle.name}. Syncing data...`, 'success');
            await Storage.syncAllToDisk();
            SettingsView.render();
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            Toast.show(`Could not select folder: ${err.message}`, 'error');
          }
        }
      });
    }

    if (syncDiskBtn) {
      syncDiskBtn.addEventListener('click', async () => {
        try {
          if (window.Storage) {
            await Storage.syncAllToDisk();
            Toast.show('Data synced to disk folder successfully', 'success');
          }
        } catch (err) {
          Toast.show(`Sync failed: ${err.message}`, 'error');
        }
      });
    }

    if (disconnectDriveBtn) {
      disconnectDriveBtn.addEventListener('click', async () => {
        if (!confirm('Disconnect drive folder and revert to browser-only storage?')) return;
        try {
          if (window.Storage) {
            await Storage.disconnectDirectoryHandle();
            Toast.show('Disconnected drive folder. Using browser IndexedDB.', 'info');
            SettingsView.render();
          }
        } catch (err) {
          Toast.show(`Failed to disconnect: ${err.message}`, 'error');
        }
      });
    }

    // Re-run Setup Wizard
    const rerunSetupBtn = container.querySelector('#btn-rerun-setup-wizard');
    if (rerunSetupBtn) {
      rerunSetupBtn.addEventListener('click', () => {
        if (typeof SetupWizard !== 'undefined') {
          SetupWizard.open();
        } else {
          Toast.show('Setup Wizard not loaded', 'error');
        }
      });
    }

    // ----------------- BACKUP & RESTORE -----------------
    const rowCreateBackup = container.querySelector('#row-create-backup');
    const rowRestoreBackup = container.querySelector('#row-restore-backup');
    const inputRestoreFile = container.querySelector('#input-restore-file');

    if (rowCreateBackup) {
      rowCreateBackup.addEventListener('click', async () => {
        Toast.show('Creating backup...', 'info');
        try {
          const res = await API.createBackup(true);
          Toast.show('Backup created successfully', 'success');
          if (res.download_url) {
            const a = document.createElement('a');
            a.href = res.download_url;
            a.download = res.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        } catch (err) {
          Toast.show(`Backup failed: ${err.message}`, 'error');
        }
      });
    }

    if (rowRestoreBackup && inputRestoreFile) {
      rowRestoreBackup.addEventListener('click', () => {
        inputRestoreFile.click();
      });

      inputRestoreFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!confirm(`Restore library, categories, and reading progress from "${file.name}"?`)) {
          inputRestoreFile.value = '';
          return;
        }

        Toast.show('Restoring backup, please wait...', 'info');
        try {
          const res = await API.restoreBackupFromFile(file, false);
          Toast.show(res.message || `Successfully restored ${res.manga_count} manga and ${res.category_count} categories`, 'success');
          inputRestoreFile.value = '';
          if (window.LibraryView && LibraryView.render) LibraryView.render();
        } catch (err) {
          Toast.show(`Restore failed: ${err.message}`, 'error');
          inputRestoreFile.value = '';
        }
      });
    }

    const autoBackupSelect = container.querySelector('#setting-auto-backup');
    if (autoBackupSelect) {
      autoBackupSelect.addEventListener('change', async (e) => {
        const freq = e.target.value;
        await API.saveSettings({ auto_backup_frequency: freq });
        if (State.settings) State.settings.auto_backup_frequency = freq;
        const label = e.target.options[e.target.selectedIndex].text;
        Toast.show(`Automatic backup set to ${label}`, 'success');
      });
    }

    // ----------------- AUTOMATED LIBRARY UPDATES -----------------
    const libUpdateFreqSelect = container.querySelector('#setting-library-update-frequency');
    if (libUpdateFreqSelect) {
      libUpdateFreqSelect.addEventListener('change', async (e) => {
        const freq = e.target.value;
        await API.saveSettings({ library_update_frequency: freq });
        if (State.settings) State.settings.library_update_frequency = freq;
        Toast.show(`Library update frequency set to ${e.target.options[e.target.selectedIndex].text}`, 'success');
      });
    }

    // Skip Completed Manga toggle switch
    const libSkipCompletedCb = container.querySelector('#setting-library-skip-completed');
    if (libSkipCompletedCb) {
      libSkipCompletedCb.addEventListener('change', async (e) => {
        const val = e.target.checked ? 'true' : 'false';
        await API.saveSettings({ library_update_skip_completed: val });
        if (State.settings) State.settings.library_update_skip_completed = val;
        Toast.show(e.target.checked ? 'Skipping completed manga during updates' : 'Checking all manga including completed', 'info');
      });
    }

    const libAutoDlSelect = container.querySelector('#setting-library-auto-download');
    if (libAutoDlSelect) {
      libAutoDlSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        await API.saveSettings({ library_update_auto_download: val });
        if (State.settings) State.settings.library_update_auto_download = val;
        Toast.show(`Auto-download new chapters set to ${e.target.options[e.target.selectedIndex].text}`, 'success');
      });
    }

    const btnSettingsCheck = container.querySelector('#btn-settings-check-library');
    if (btnSettingsCheck) {
      btnSettingsCheck.addEventListener('click', async () => {
        const icon = container.querySelector('#settings-check-icon');
        const text = container.querySelector('#settings-check-text');
        btnSettingsCheck.disabled = true;
        if (icon) icon.classList.add('spin-rotating');
        if (text) text.textContent = 'Checking...';

        try {
          const res = await API.updateLibrary();
          const pollTimer = setInterval(async () => {
            try {
              const status = await API.getLibraryUpdateStatus();
              if (status.is_updating) {
                const prog = status.progress || {};
                const cur = prog.current || 0;
                const tot = prog.total || 0;
                if (text) text.textContent = tot > 0 ? `Checking (${cur}/${tot})...` : 'Checking...';
              } else {
                clearInterval(pollTimer);
                btnSettingsCheck.disabled = false;
                if (icon) icon.classList.remove('spin-rotating');
                if (text) text.textContent = 'Check Now';
                const lastCheckText = container.querySelector('#settings-last-check-text');
                if (lastCheckText) lastCheckText.textContent = `Last checked: ${new Date().toLocaleString()}`;

                const lastRes = status.last_result || {};
                const newCh = lastRes.new_chapters_total || 0;
                const updatedManga = lastRes.updated_manga_count || 0;
                if (newCh > 0) {
                  Toast.show(`Found ${newCh} new chapter${newCh > 1 ? 's' : ''} across ${updatedManga} title${updatedManga > 1 ? 's' : ''}`, 'success');
                } else {
                  Toast.show('Library is up to date', 'info');
                }
              }
            } catch (pErr) {
              console.error(pErr);
            }
          }, 1500);
        } catch (err) {
          btnSettingsCheck.disabled = false;
          if (icon) icon.classList.remove('spin-rotating');
          if (text) text.textContent = 'Check Now';
          Toast.show('Failed to check library updates', 'error');
        }
      });
    }

    // -----------------------------------------------------------------
    // Tracking Accounts Manager in Settings
    // -----------------------------------------------------------------
    const loadTrackingAccounts = async () => {
      const containerEl = container.querySelector('#settings-tracking-accounts-container');
      if (!containerEl) return;

      try {
        const accounts = await API.getTrackingAccounts();
        const logos = (window.MangaDetailView && window.MangaDetailView.TRACKER_LOGOS) || {};

        if (!Array.isArray(accounts) || accounts.length === 0) {
          containerEl.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted);">No tracking services available.</div>';
          return;
        }

        containerEl.innerHTML = accounts.map(acc => {
          const logoSvg = logos[acc.name] || logos[acc.id] || '';
          return `
            <div class="local-path-card" style="padding: 12px 16px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
              <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                <span style="width: 32px; height: 32px; flex-shrink: 0; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                  ${logoSvg}
                </span>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">${acc.name}</span>
                    ${acc.logged_in ? `
                      <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; background: rgba(34, 197, 94, 0.15); color: #22c55e; font-weight: 700;">Logged in</span>
                    ` : `
                      <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); color: var(--text-muted); font-weight: 600;">Not connected</span>
                    `}
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                    ${acc.logged_in ? `Account: <span style="color: #fff; font-weight: 600;">${acc.username || 'Connected'}</span>` : 'Sync manga reading progress & scores'}
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                ${acc.logged_in ? `
                  <button type="button" class="btn btn-secondary btn-tracker-logout" data-service="${acc.id}" style="color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); font-size: 0.8rem; padding: 6px 14px; border-radius: 6px; cursor: pointer;">
                    Log out
                  </button>
                ` : `
                  <button type="button" class="btn btn-primary btn-tracker-login" data-service="${acc.id}" style="font-size: 0.82rem; padding: 6px 16px; border-radius: 6px; background-color: #2563eb; color: #fff; border: none; cursor: pointer; font-weight: 600;">
                    Log in
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('');

        // Attach listeners
        containerEl.querySelectorAll('.btn-tracker-login').forEach(btn => {
          btn.addEventListener('click', () => {
            const serviceId = btn.getAttribute('data-service');
            if (window.TrackerAuth) {
              window.TrackerAuth.openLoginModal(serviceId, () => {
                loadTrackingAccounts();
              });
            }
          });
        });

        containerEl.querySelectorAll('.btn-tracker-logout').forEach(btn => {
          btn.addEventListener('click', async () => {
            const serviceId = btn.getAttribute('data-service');
            try {
              await API.logoutTrackingAccount(serviceId);
              Toast.show(`Logged out of ${serviceId}`, 'info');
              loadTrackingAccounts();
            } catch (e) {
              Toast.show('Logout failed', 'error');
            }
          });
        });

      } catch (err) {
        containerEl.innerHTML = '<div style="font-size: 0.82rem; color: var(--accent-red);">Failed to load tracking accounts.</div>';
      }
    };

    loadTrackingAccounts();
  }
};
