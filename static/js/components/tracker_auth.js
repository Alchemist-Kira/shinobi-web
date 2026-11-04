// Tracker Authentication Modal & OAuth Flow Helper
const TrackerAuth = {
  SERVICES: [
    {
      id: 'anilist',
      name: 'AniList',
      color: '#02A9FF',
      oauthUrl: 'https://anilist.co/api/v2/oauth/authorize?client_id=16186&response_type=token',
      helpUrl: 'https://anilist.co/settings/developer',
      type: 'oauth',
      description: 'Authorize with AniList to sync reading status, chapter progress, and scores automatically.'
    },
    {
      id: 'myanimelist',
      name: 'MyAnimeList',
      color: '#2E51A2',
      oauthUrl: 'https://myanimelist.net',
      helpUrl: 'https://myanimelist.net/apiconfig',
      type: 'oauth',
      description: 'Connect your MyAnimeList account to sync your manga list and chapter progress.'
    },
    {
      id: 'kitsu',
      name: 'Kitsu',
      color: '#FD755C',
      oauthUrl: 'https://kitsu.io',
      helpUrl: 'https://kitsu.io/settings/account',
      type: 'token',
      description: 'Connect your Kitsu account with your personal access token.'
    },
    {
      id: 'mangaupdates',
      name: 'MangaUpdates',
      color: '#FF8C15',
      oauthUrl: 'https://www.mangaupdates.com',
      helpUrl: 'https://www.mangaupdates.com',
      type: 'credentials',
      description: 'Log in with your MangaUpdates username and password to sync your reading list.'
    },
    {
      id: 'bangumi',
      name: 'Bangumi',
      color: '#F09199',
      oauthUrl: 'https://bgm.tv/dev/app',
      helpUrl: 'https://bgm.tv/dev/app',
      type: 'oauth',
      description: 'Connect your Bangumi account to sync your collection and progress.'
    },
    {
      id: 'shikimori',
      name: 'Shikimori',
      color: '#888888',
      oauthUrl: 'https://shikimori.one/oauth/applications',
      helpUrl: 'https://shikimori.one/oauth/applications',
      type: 'oauth',
      description: 'Connect your Shikimori account to sync your reading list.'
    }
  ],

  getService(serviceId) {
    const sId = (serviceId || '').toLowerCase();
    return this.SERVICES.find(s => s.id === sId || s.name.toLowerCase() === sId) || this.SERVICES[0];
  },

  getModalHost() {
    let host = document.getElementById('tracker-auth-modal-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tracker-auth-modal-host';
      document.body.appendChild(host);
    }
    return host;
  },

  closeModal() {
    const host = this.getModalHost();
    host.innerHTML = '';
  },

  openLoginModal(serviceId, onLoginSuccess) {
    const service = this.getService(serviceId);
    const host = this.getModalHost();
    const logos = (window.MangaDetailView && window.MangaDetailView.TRACKER_LOGOS) || {};
    const logoSvg = logos[service.name] || logos[service.id] || '';

    let formFieldsHtml = '';
    const isOAuth = service.type === 'oauth';

    if (service.type === 'credentials') {
      // Username & Password (MangaUpdates)
      formFieldsHtml = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Username</label>
            <input type="text" id="auth-username-input" class="form-input" placeholder="MangaUpdates username" style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 7px; color: #fff; font-size: 0.9rem;" />
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Password</label>
            <input type="password" id="auth-password-input" class="form-input" placeholder="Password" style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 7px; color: #fff; font-size: 0.9rem;" />
          </div>
        </div>
      `;
    } else if (isOAuth) {
      // Unified 1-Click Automatic OAuth Flow (AniList, MyAnimeList, Shikimori, Bangumi)
      formFieldsHtml = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 10px; padding: 18px 16px; text-align: center;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 6px;">Automatic 1-Click Login</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.45;">
              Click below to open the official ${service.name} authorization prompt. Click <strong>Authorize</strong> to link your account automatically without copying any tokens.
            </div>
            <button type="button" id="btn-oauth-direct-auth" class="btn btn-primary" style="padding: 11px 24px; font-size: 0.92rem; font-weight: 700; border-radius: 8px; background-color: ${service.color}; color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px ${service.color}44; transition: opacity 0.2s ease;">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2.2;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Authorize with ${service.name}</span>
            </button>
            <div id="oauth-popup-status" style="display: none; font-size: 0.82rem; color: var(--accent-primary); margin-top: 14px; font-weight: 500;">
              <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px;">⟳</span> Waiting for authorization in popup window...
            </div>
          </div>

          <div style="margin-top: 4px;">
            <button type="button" id="btn-toggle-manual-token" style="background: transparent; border: none; color: var(--text-muted); font-size: 0.76rem; cursor: pointer; text-decoration: underline; padding: 0;">
              Or paste access token manually
            </button>
            <div id="manual-token-container" style="display: none; margin-top: 10px;">
              <label style="display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Access Token</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="auth-token-input" class="form-input" placeholder="Paste access token or callback URL here..." style="flex: 1; padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 7px; color: #fff; font-size: 0.85rem;" />
                <button type="button" id="btn-paste-clipboard" class="btn btn-secondary" style="padding: 8px 12px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                  <span>Paste</span>
                </button>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
                <button type="submit" class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; border-radius: 6px;">Submit Manual Token</button>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // General Token input (Kitsu)
      formFieldsHtml = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Personal Access Token</label>
            <input type="text" id="auth-token-input" class="form-input" placeholder="Enter ${service.name} access token..." style="width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 7px; color: #fff; font-size: 0.88rem;" />
            <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 6px;">
              Get your token from <a href="${service.helpUrl}" target="_blank" rel="noopener noreferrer" style="color: ${service.color}; text-decoration: none;">${service.name} Developer Settings &nearr;</a>
            </div>
          </div>
        </div>
      `;
    }

    host.innerHTML = `
      <div class="mihon-modal-backdrop" id="tracker-auth-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100000; padding: 20px;">
        <div class="mihon-dialog-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 16px; width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
          
          <!-- Header -->
          <div class="mihon-dialog-header" style="display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08));">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="width: 28px; height: 28px; flex-shrink: 0; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                ${logoSvg}
              </span>
              <div>
                <div class="mihon-dialog-title" style="font-size: 1.1rem; font-weight: 700; color: #fff;">Connect to ${service.name}</div>
                <div style="font-size: 0.76rem; color: var(--text-muted);">Mihon Account Sync</div>
              </div>
            </div>
            <button class="mihon-dialog-close" id="btn-close-tracker-auth" style="background: transparent; border: none; font-size: 1.4rem; color: var(--text-muted); cursor: pointer; line-height: 1;">&times;</button>
          </div>

          <!-- Body -->
          <div class="mihon-dialog-body" style="padding: 20px 22px; overflow-y: auto;">
            <div style="font-size: 0.84rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 16px;">
              ${service.description}
            </div>

            <div id="auth-error-box" style="display: none; padding: 10px 14px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; color: #ef4444; font-size: 0.82rem; margin-bottom: 14px;"></div>

            <form id="tracker-auth-form">
              ${formFieldsHtml}

              <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btn-cancel-tracker-auth" style="padding: 8px 16px; border-radius: 7px; font-size: 0.85rem;">
                  Cancel
                </button>
                ${!isOAuth ? `
                  <button type="submit" class="btn btn-primary" id="btn-submit-tracker-auth" style="padding: 8px 20px; border-radius: 7px; font-size: 0.85rem; font-weight: 600; background-color: #2563eb; color: #fff; border: none; cursor: pointer;">
                    Connect Account
                  </button>
                ` : ''}
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    // Listeners
    host.querySelector('#btn-close-tracker-auth')?.addEventListener('click', () => this.closeModal());
    host.querySelector('#btn-cancel-tracker-auth')?.addEventListener('click', () => this.closeModal());
    host.querySelector('#tracker-auth-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'tracker-auth-backdrop') this.closeModal();
    });

    const form = host.querySelector('#tracker-auth-form');
    const errBox = host.querySelector('#auth-error-box');
    const directAuthBtn = host.querySelector('#btn-oauth-direct-auth');
    const statusBox = host.querySelector('#oauth-popup-status');

    // 1-Click OAuth button handler
    if (directAuthBtn) {
      directAuthBtn.addEventListener('click', async () => {
        errBox.style.display = 'none';
        directAuthBtn.disabled = true;
        if (statusBox) statusBox.style.display = 'block';

        try {
          const res = await API.getTrackingOAuthStartUrl(service.id);
          if (res && res.success && res.auth_url) {
            const popup = window.open(res.auth_url, 'tracker_oauth_popup', 'width=620,height=750,menubar=no,toolbar=no');
            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
              if (statusBox) statusBox.style.display = 'none';
              directAuthBtn.disabled = false;
              errBox.textContent = 'Popup was blocked by your browser. Please allow popups or use manual token entry.';
              errBox.style.display = 'block';
            }
          } else {
            if (statusBox) statusBox.style.display = 'none';
            directAuthBtn.disabled = false;
            errBox.textContent = res.error || 'Failed to start OAuth authorization.';
            errBox.style.display = 'block';
          }
        } catch (err) {
          if (statusBox) statusBox.style.display = 'none';
          directAuthBtn.disabled = false;
          errBox.textContent = err.message || 'Error initiating authorization.';
          errBox.style.display = 'block';
        }
      });
    }

    // Toggle manual token section
    const toggleManual = host.querySelector('#btn-toggle-manual-token');
    const manualContainer = host.querySelector('#manual-token-container');
    if (toggleManual && manualContainer) {
      toggleManual.addEventListener('click', () => {
        const isHidden = manualContainer.style.display === 'none';
        manualContainer.style.display = isHidden ? 'block' : 'none';
        toggleManual.textContent = isHidden ? 'Hide manual token entry' : 'Or paste access token manually';
      });
    }

    // Paste from Clipboard & Connect (for AniList)
    const pasteClipboardBtn = host.querySelector('#btn-paste-clipboard');
    if (pasteClipboardBtn) {
      pasteClipboardBtn.addEventListener('click', async () => {
        errBox.style.display = 'none';
        try {
          const text = await navigator.clipboard.readText();
          if (text && text.trim()) {
            const tokenInput = host.querySelector('#auth-token-input');
            if (tokenInput) {
              tokenInput.value = text.trim();
              form.requestSubmit();
            }
          } else {
            errBox.textContent = 'Clipboard is empty. Please copy your access token from the AniList page first.';
            errBox.style.display = 'block';
          }
        } catch (e) {
          errBox.textContent = 'Clipboard read permission was denied. Please paste the token directly into the box.';
          errBox.style.display = 'block';
        }
      });
    }

    // Window message listener for OAuth callback
    const onAuthMessage = async (event) => {
      if (event.data && event.data.type === 'TRACKER_OAUTH_SUCCESS') {
        window.removeEventListener('message', onAuthMessage);
        Toast.show(`Connected to ${service.name} as ${event.data.username || 'User'}!`, 'success');
        this.closeModal();
        if (typeof onLoginSuccess === 'function') {
          try {
            const accs = await API.getTrackingAccounts();
            const fresh = (accs || []).find(a => a.id === service.id.toLowerCase());
            onLoginSuccess(fresh || { id: service.id, logged_in: true, username: event.data.username });
          } catch (e) {
            onLoginSuccess({ id: service.id, logged_in: true, username: event.data.username });
          }
        }
      }
    };
    window.addEventListener('message', onAuthMessage);

    // Form submit listener (for credentials, manual token, or token services)
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';

        const tokenVal = host.querySelector('#auth-token-input')?.value || '';
        const userVal = host.querySelector('#auth-username-input')?.value || '';
        const passVal = host.querySelector('#auth-password-input')?.value || '';

        const payload = {};
        if (service.type === 'credentials') {
          if (!userVal.trim() || !passVal.trim()) {
            errBox.textContent = 'Please enter both username and password.';
            errBox.style.display = 'block';
            return;
          }
          payload.username = userVal.trim();
          payload.password = passVal;
        } else {
          if (!tokenVal.trim()) {
            errBox.textContent = 'Please enter your access token.';
            errBox.style.display = 'block';
            return;
          }
          payload.token = tokenVal.trim();
        }

        const submitBtn = host.querySelector('#btn-submit-tracker-auth') || form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Authenticating...';
        }

        try {
          const res = await API.loginTrackingAccount(service.id, payload);
          if (res && res.success) {
            window.removeEventListener('message', onAuthMessage);
            Toast.show(`Connected to ${service.name} as ${res.account.username || 'User'}!`, 'success');
            this.closeModal();
            if (typeof onLoginSuccess === 'function') {
              onLoginSuccess(res.account);
            }
          } else {
            errBox.textContent = res.error || 'Authentication failed. Please check your credentials.';
            errBox.style.display = 'block';
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = isOAuth ? 'Submit Manual Token' : 'Connect Account';
            }
          }
        } catch (err) {
          errBox.textContent = err.message || 'Network error while authenticating.';
          errBox.style.display = 'block';
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = isOAuth ? 'Submit Manual Token' : 'Connect Account';
          }
        }
      });
    }
  }
};

window.TrackerAuth = TrackerAuth;
