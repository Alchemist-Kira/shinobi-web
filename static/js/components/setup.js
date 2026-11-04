// Shinobi Setup Wizard Component - Onboarding for First-Time Users
// Configures Storage Drive (E:, D:, etc.), Theme Accent, and Reader Preferences
const SetupWizard = {
  step: 1,
  totalSteps: 3,
  storageMode: 'custom', // default to custom so user can pick E: drive to save C: space
  dirHandle: null,
  dirName: '',
  dirPath: localStorage.getItem('shinobi_storage_folder_path') || '',
  selectedAccent: 'teal',
  readerMode: 'webtoon',
  readerWidth: '800',
  readerBg: 'dark',
  isOpen: false,

  init() {
    const isCompleted = localStorage.getItem('shinobi_setup_completed') === 'true';
    if (!isCompleted) {
      setTimeout(() => this.open(), 120);
    }
  },

  open() {
    this.step = 1;
    this.selectedAccent = ThemeManager.currentAccent || 'teal';
    this.isOpen = true;
    this.render();
  },

  close() {
    this.isOpen = false;
    const modalRoot = document.getElementById('app-modal-root');
    if (modalRoot) {
      const overlay = modalRoot.querySelector('#setup-wizard-overlay');
      if (overlay) overlay.remove();
    }
  },

  render() {
    const modalRoot = document.getElementById('app-modal-root') || document.body;
    let overlay = modalRoot.querySelector('#setup-wizard-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'setup-wizard-overlay';
      overlay.className = 'setup-overlay';
      modalRoot.appendChild(overlay);
    }

    const currentAccent = this.selectedAccent;

    overlay.innerHTML = `
      <div class="setup-modal-container">
        <!-- Wizard Header -->
        <div class="setup-header">
          <div class="setup-brand-row">
            <img src="/static/img/shinobi.png" alt="Shinobi Logo" class="setup-logo" />
            <div class="setup-title-group">
              <h1 class="setup-title">Welcome to Shinobi</h1>
              <p class="setup-subtitle">Quick setup for your library, theme, and reader</p>
            </div>
          </div>

          <!-- Step Indicator -->
          <div class="setup-step-tracker">
            <div class="setup-step-item ${this.step === 1 ? 'active' : (this.step > 1 ? 'done' : '')}">
              <div class="setup-step-circle">1</div>
              <span class="setup-step-label">Storage</span>
            </div>
            <div class="setup-step-line ${this.step > 1 ? 'filled' : ''}"></div>
            <div class="setup-step-item ${this.step === 2 ? 'active' : (this.step > 2 ? 'done' : '')}">
              <div class="setup-step-circle">2</div>
              <span class="setup-step-label">Theme</span>
            </div>
            <div class="setup-step-line ${this.step > 2 ? 'filled' : ''}"></div>
            <div class="setup-step-item ${this.step === 3 ? 'active' : ''}">
              <div class="setup-step-circle">3</div>
              <span class="setup-step-label">Reader</span>
            </div>
          </div>
        </div>

        <!-- Wizard Body Content based on Step -->
        <div class="setup-body">
          ${this.renderStepContent()}
        </div>

        <!-- Wizard Footer Navigation -->
        <div class="setup-footer">
          ${this.step > 1 ? `
            <button type="button" class="btn btn-secondary" id="btn-setup-back">
              Back
            </button>
          ` : `<div></div>`}

          <div style="display: flex; gap: 10px;">
            ${this.step < this.totalSteps ? `
              <button type="button" class="btn btn-primary" id="btn-setup-next">
                <span>Continue</span>
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            ` : `
              <button type="button" class="btn btn-primary" id="btn-setup-finish" style="padding: 10px 24px; font-weight: 700;">
                <span>Finish & Start Reading</span>
                <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    this.bindEvents(overlay);
  },

  renderStepContent() {
    if (this.step === 1) {
      return `
        <div class="setup-step-content">
          <div class="setup-section-lead">
            <h2 class="setup-step-title">Storage Location</h2>
            <p class="setup-step-desc">
              Choose where to store your library, reading progress, and downloads.
            </p>
          </div>

          <div class="setup-storage-options">
            <!-- Option 1: Custom Folder -->
            <div class="setup-card-choice ${this.storageMode === 'custom' ? 'selected' : ''}" id="choice-storage-custom">
              <div class="setup-choice-radio">
                <span class="setup-radio-dot"></span>
              </div>
              <div class="setup-choice-content">
                <div class="setup-choice-header">
                  <div class="setup-choice-title">Custom Folder</div>
                  <span class="setup-badge-recommended">Recommended</span>
                </div>
                <div class="setup-choice-desc">
                  Save downloads and reading data to a folder on any drive.
                </div>

                <div class="setup-folder-action-row" style="margin-top: 14px;">
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-setup-pick-folder" style="display: inline-flex; align-items: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${this.dirName ? 'Change Folder...' : 'Choose Folder'}</span>
                  </button>

                  ${this.dirName ? `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <div class="setup-connected-folder-pill">
                        <span class="dl-live-dot active" style="width: 6px; height: 6px;"></span>
                        <span style="font-family: var(--font-mono); font-size: 0.8rem; color: #fff;">${this.dirName}</span>
                      </div>
                      ${this.existingDataFound ? `
                        <div style="font-size: 0.76rem; color: #10b981; font-weight: 500;">
                          Existing save data found. It will be loaded automatically.
                        </div>
                      ` : ''}
                    </div>
                  ` : `
                    <span style="font-size: 0.78rem; color: var(--text-muted);">No folder selected yet</span>
                  `}
                </div>
              </div>
            </div>

            <!-- Option 2: Browser Storage -->
            <div class="setup-card-choice ${this.storageMode === 'browser' ? 'selected' : ''}" id="choice-storage-browser">
              <div class="setup-choice-radio">
                <span class="setup-radio-dot"></span>
              </div>
              <div class="setup-choice-content">
                <div class="setup-choice-header">
                  <div class="setup-choice-title">Browser Storage</div>
                </div>
                <div class="setup-choice-desc">
                  Save everything directly in this browser without selecting a folder.
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.step === 2) {
      const currentAccent = this.selectedAccent;
      return `
        <div class="setup-step-content">
          <div class="setup-section-lead">
            <h2 class="setup-step-title">Theme Color</h2>
            <p class="setup-step-desc">
              Choose your accent color for buttons, badges, and highlights.
            </p>
          </div>

          <!-- Color Swatch Grid -->
          <div class="theme-swatch-grid" style="width: 100%; margin-top: 16px;">
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

          <!-- Custom Hex Picker -->
          <div class="theme-custom-row" style="margin-top: 18px;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 500;">Custom Hex Color:</div>
            <label class="theme-custom-picker-wrap">
              <input type="color" id="setup-custom-color-input" class="theme-custom-color-input" value="${currentAccent.startsWith('#') ? currentAccent : '#0d9488'}" />
              <span id="setup-custom-hex-label" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-primary); font-weight: 600;">
                ${currentAccent.startsWith('#') ? currentAccent : '#0D9488'}
              </span>
            </label>
          </div>
        </div>
      `;
    }

    if (this.step === 3) {
      return `
        <div class="setup-step-content">
          <div class="setup-section-lead">
            <h2 class="setup-step-title">Reader Preferences</h2>
            <p class="setup-step-desc">
              Set your default reading layout. You can change this anytime in Settings.
            </p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 18px;">
            <div class="setup-pref-row">
              <div>
                <div class="setup-pref-title">Reading Mode</div>
                <div class="setup-pref-desc">Continuous vertical scroll or paged view</div>
              </div>
              <select id="setup-reader-mode" class="catalog-select" style="min-width: 200px;">
                <option value="webtoon" ${this.readerMode === 'webtoon' ? 'selected' : ''}>Webtoon (Vertical)</option>
                <option value="paged" ${this.readerMode === 'paged' ? 'selected' : ''}>Paged (Single Page)</option>
              </select>
            </div>

            <div class="setup-pref-row">
              <div>
                <div class="setup-pref-title">Maximum Width</div>
                <div class="setup-pref-desc">Width limit for reading on large monitors</div>
              </div>
              <select id="setup-reader-width" class="catalog-select" style="min-width: 200px;">
                <option value="650" ${this.readerWidth === '650' ? 'selected' : ''}>650px (Narrow)</option>
                <option value="800" ${this.readerWidth === '800' ? 'selected' : ''}>800px (Balanced)</option>
                <option value="1000" ${this.readerWidth === '1000' ? 'selected' : ''}>1000px (Wide)</option>
                <option value="1200" ${this.readerWidth === '1200' ? 'selected' : ''}>1200px (Extra Wide)</option>
                <option value="full" ${this.readerWidth === 'full' ? 'selected' : ''}>100% (Full Width)</option>
              </select>
            </div>

            <div class="setup-pref-row">
              <div>
                <div class="setup-pref-title">Background</div>
                <div class="setup-pref-desc">Color behind comic and manga pages</div>
              </div>
              <select id="setup-reader-bg" class="catalog-select" style="min-width: 200px;">
                <option value="black" ${this.readerBg === 'black' ? 'selected' : ''}>Pitch Black</option>
                <option value="dark" ${this.readerBg === 'dark' ? 'selected' : ''}>Dark Slate</option>
                <option value="paper" ${this.readerBg === 'paper' ? 'selected' : ''}>Warm Paper</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  },

  bindEvents(container) {
    // Navigation
    const nextBtn = container.querySelector('#btn-setup-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.step < this.totalSteps) {
          this.step++;
          this.render();
        }
      });
    }

    const backBtn = container.querySelector('#btn-setup-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.step > 1) {
          this.step--;
          this.render();
        }
      });
    }

    const finishBtn = container.querySelector('#btn-setup-finish');
    if (finishBtn) {
      finishBtn.addEventListener('click', async () => {
        finishBtn.disabled = true;
        await this.completeSetup();
      });
    }

    // Step 1: Storage Selection
    const customChoice = container.querySelector('#choice-storage-custom');
    const browserChoice = container.querySelector('#choice-storage-browser');
    const pickFolderBtn = container.querySelector('#btn-setup-pick-folder');

    if (customChoice) {
      customChoice.addEventListener('click', (e) => {
        if (e.target.closest('#btn-setup-pick-folder')) return;
        this.storageMode = 'custom';
        this.render();
      });
    }

    if (browserChoice) {
      browserChoice.addEventListener('click', () => {
        this.storageMode = 'browser';
        this.render();
      });
    }

    if (pickFolderBtn) {
      pickFolderBtn.addEventListener('click', async () => {
        if (window.showDirectoryPicker) {
          try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (handle) {
              this.dirHandle = handle;
              this.dirName = handle.name;
              this.storageMode = 'custom';
              this.existingDataFound = false;

              if (window.Storage && typeof Storage.hasDiskData === 'function') {
                this.existingDataFound = await Storage.hasDiskData(handle);
              }

              this.render();

              if (this.existingDataFound) {
                Toast.show(`Connected folder '${handle.name}'. Existing save data detected and will be loaded!`, 'success');
              } else {
                Toast.show(`Connected folder: ${handle.name}`, 'success');
              }
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              Toast.show('Directory selection failed: ' + err.message, 'error');
            }
          }
        } else {
          Toast.show('File System Access API is not supported in this browser. Standard browser storage will be used.', 'info');
        }
      });
    }

    const pathInput = container.querySelector('#setup-drive-path-input');
    if (pathInput) {
      pathInput.addEventListener('input', (e) => {
        this.dirPath = e.target.value.trim();
      });
    }

    // Step 2: Theme Swatches
    container.querySelectorAll('.theme-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-theme-id');
        this.selectedAccent = id;
        ThemeManager.applyAccent(id, false);
        container.querySelectorAll('.theme-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const customColorInput = container.querySelector('#setup-custom-color-input');
    const customHexLabel = container.querySelector('#setup-custom-hex-label');
    if (customColorInput && customHexLabel) {
      customColorInput.addEventListener('input', (e) => {
        const hex = e.target.value.toUpperCase();
        customHexLabel.textContent = hex;
        this.selectedAccent = hex;
        ThemeManager.applyAccent(hex, false);
      });
    }

    // Step 3: Reader Selects
    const modeSelect = container.querySelector('#setup-reader-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        this.readerMode = e.target.value;
      });
    }

    const widthSelect = container.querySelector('#setup-reader-width');
    if (widthSelect) {
      widthSelect.addEventListener('change', (e) => {
        this.readerWidth = e.target.value;
      });
    }

    const bgSelect = container.querySelector('#setup-reader-bg');
    if (bgSelect) {
      bgSelect.addEventListener('change', (e) => {
        this.readerBg = e.target.value;
      });
    }
  },

  async completeSetup() {
    try {
      // 1. Save storage preference
      if (this.storageMode === 'custom' && this.dirHandle && window.Storage) {
        await Storage.setDirectoryHandle(this.dirHandle, this.dirPath);
      } else if (window.Storage) {
        await Storage.disconnectDirectoryHandle();
      }

      // 2. Save theme
      ThemeManager.applyAccent(this.selectedAccent, true);

      // 3. Save reader settings
      if (window.Storage) {
        await Storage.saveSettings({
          reader_mode: this.readerMode,
          reader_width: this.readerWidth,
          reader_bg: this.readerBg,
          accent_color: this.selectedAccent,
          storage_mode: this.storageMode
        });
      }

      localStorage.setItem('shinobi_setup_completed', 'true');
      this.close();

      if (typeof Toast !== 'undefined') {
        Toast.show('Configuration saved! Welcome to Shinobi.', 'success');
      }

      if (window.LibraryView && typeof LibraryView.render === 'function') {
        LibraryView.render();
      }
    } catch (err) {
      console.error('Setup completion error:', err);
      this.close();
    }
  }
};

// Auto-run initialization
if (typeof window !== 'undefined') {
  window.SetupWizard = SetupWizard;
}

