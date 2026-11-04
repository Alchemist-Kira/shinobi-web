// Reading Statistics & Analytics Component for Shinobi (Mihon Web Edition)
const StatisticsView = {
  data: null,
  isLoading: false,

  async init() {
    await this.loadData();
  },

  async loadData() {
    this.isLoading = true;
    this.renderLoading();
    try {
      this.data = await API.getStatistics();
      this.render();
    } catch (err) {
      console.error('Failed to load reading statistics:', err);
      this.renderError(err.message);
    } finally {
      this.isLoading = false;
    }
  },

  resolveSourceName(src) {
    if (!src) return 'Local Storage';
    const s = String(src).trim();
    const map = {
      '6247824327199706550': 'Asura Scans',
      '6084907896154116083': 'MangaFire',
      '8448310129093543312': 'MangaPill',
      '2499283573021220255': 'MangaDex',
      '1353606378087565589': 'Manga18.me',
      '6244055465910932489': 'Manga18.me',
      '499082788596590240': 'Comic Asura',
      '0': 'Local Storage',
      'local': 'Local Storage',
      'asura': 'Asura Scans',
      'asurascans': 'Asura Scans',
      'mangafire': 'MangaFire',
      'mangadex': 'MangaDex',
      'mangapill': 'MangaPill',
      'manga18': 'Manga18'
    };
    if (map[s]) return map[s];
    const sLow = s.toLowerCase();
    if (map[sLow]) return map[sLow];
    if (sLow.startsWith('asura')) return 'Asura Scans';
    if (sLow.startsWith('mangafire')) return 'MangaFire';
    if (sLow.startsWith('mangadex')) return 'MangaDex';
    if (sLow.startsWith('mangapill')) return 'MangaPill';
    if (/^\d+$/.test(s)) return `Source ${s}`;
    return s;
  },

  renderLoading() {
    const container = document.getElementById('view-statistics');
    if (!container) return;
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 16px;">
        <div style="width: 38px; height: 38px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent-primary, #10b981); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div style="color: var(--text-muted, #a1a1aa); font-size: 0.9rem;">Compiling reading statistics...</div>
      </div>
    `;
  },

  renderError(msg) {
    const container = document.getElementById('view-statistics');
    if (!container) return;
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--accent-red, #ef4444);">
        <div style="font-size: 1.1rem; font-weight: 600;">Failed to load statistics</div>
        <div style="font-size: 0.85rem; color: var(--text-muted, #a1a1aa); margin-top: 6px;">${msg}</div>
        <button class="btn btn-secondary" style="margin-top: 16px;" onclick="StatisticsView.loadData()">Retry</button>
      </div>
    `;
  },

  render() {
    const container = document.getElementById('view-statistics');
    if (!container) return;

    const d = this.data || {};
    const chaptersRead = d.chapters_read || 0;
    const pagesRead = d.pages_read || 0;
    const durationFormatted = d.total_read_duration_formatted || '0m';
    const mangaInLib = d.manga_in_library || 0;
    const mangaReadCount = d.manga_read_count || 0;
    const statusDist = d.status_distribution || [];
    const sourceDist = d.source_distribution || [];
    const catDist = d.category_distribution || [];
    const activity7 = d.reading_activity_7_days || [];
    const mostRead = d.most_read_manga || [];

    // Find max chapters in 7 days for bar scaling
    const maxDayChapters = Math.max(1, ...activity7.map(a => a.chapters));

    container.innerHTML = `
      <div class="stats-container">
        <!-- Unified Statistics Sticky Command Bar -->
        <header class="lib-command-bar">
          <div class="lib-command-top">
            <div class="lib-title-cluster">
              <h1 class="lib-title">Statistics</h1>
            </div>

            <div class="lib-toolbar-actions">
              <button id="btn-stats-refresh" class="lib-action-btn" type="button" title="Refresh Reading Statistics">
                <svg viewBox="0 0 24 24" id="stats-refresh-icon">
                  <path d="M21.5 2v6h-6"></path>
                  <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Bottom Row: Underline Navigation Tabs -->
          <div class="lib-tabs-track">
            <button class="lib-nav-tab active" type="button">
              <span class="lib-tab-label">Reading Analytics</span>
              <span class="lib-tab-count">${chaptersRead} ch</span>
              <span class="lib-tab-indicator"></span>
            </button>
          </div>
        </header>

        <!-- Content Area -->
        <div class="stats-content-area" style="display: flex; flex-direction: column; gap: 28px;">
          <!-- KPI Cards Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
          
          <!-- Card: Time Spent -->
          <div class="stats-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px; position: relative; overflow: hidden;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #a1a1aa); text-transform: uppercase; letter-spacing: 0.05em;">Time Reading</span>
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-primary, #10b981);">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
            </div>
            <div style="font-size: 1.85rem; font-weight: 700; color: #fff;">${durationFormatted}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted, #71717a);">Estimated total active reading time</div>
          </div>

          <!-- Card: Chapters Read -->
          <div class="stats-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #a1a1aa); text-transform: uppercase; letter-spacing: 0.05em;">Chapters Read</span>
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59, 130, 246, 0.15); display: flex; align-items: center; justify-content: center; color: #3b82f6;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
              </div>
            </div>
            <div style="font-size: 1.85rem; font-weight: 700; color: #fff;">${chaptersRead.toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted, #71717a);">Across ${mangaReadCount} manga titles</div>
          </div>

          <!-- Card: Pages Read -->
          <div class="stats-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #a1a1aa); text-transform: uppercase; letter-spacing: 0.05em;">Pages Read</span>
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(168, 85, 247, 0.15); display: flex; align-items: center; justify-content: center; color: #c084fc;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
            </div>
            <div style="font-size: 1.85rem; font-weight: 700; color: #fff;">${pagesRead.toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted, #71717a);">Webtoon strips and pages</div>
          </div>

          <!-- Card: Library Manga -->
          <div class="stats-card" style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #a1a1aa); text-transform: uppercase; letter-spacing: 0.05em;">Library Total</span>
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(234, 179, 8, 0.15); display: flex; align-items: center; justify-content: center; color: #eab308;">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </div>
            </div>
            <div style="font-size: 1.85rem; font-weight: 700; color: #fff;">${mangaInLib}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted, #71717a);">${mangaReadCount} started (${mangaInLib > 0 ? Math.round((mangaReadCount / mangaInLib) * 100) : 0}%)</div>
          </div>

        </div>

        <!-- Reading Activity (Last 7 Days) Bar Chart -->
        <div style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
              <div style="font-size: 1rem; font-weight: 700; color: #fff;">Reading Activity</div>
              <div style="font-size: 0.78rem; color: var(--text-muted, #a1a1aa); margin-top: 2px;">Chapters completed over the past 7 days</div>
            </div>
          </div>

          <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; height: 160px; padding-top: 20px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));">
            ${activity7.map((item, idx) => {
              const isToday = idx === activity7.length - 1;
              const barHeightPct = Math.max(8, Math.round((item.chapters / maxDayChapters) * 100));
              return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 8px;">
                  <span style="font-size: 0.75rem; font-weight: 600; color: ${item.chapters > 0 ? 'var(--text-primary, #fff)' : 'var(--text-muted, #71717a)'};">${item.chapters}</span>
                  <div style="width: 100%; max-width: 44px; height: ${barHeightPct}%; background: ${isToday ? 'var(--accent-primary, #10b981)' : (item.chapters > 0 ? 'rgba(var(--accent-primary-rgb), 0.45)' : 'rgba(255,255,255,0.06)')}; border-radius: 6px 6px 0 0; transition: height 0.3s ease;"></div>
                  <div style="display: flex; flex-direction: column; align-items: center; margin-top: 6px;">
                    <span style="font-size: 0.76rem; font-weight: ${isToday ? '700' : '500'}; color: ${isToday ? 'var(--accent-primary, #10b981)' : 'var(--text-muted, #a1a1aa)'};">${item.day}</span>
                    <span style="font-size: 0.68rem; color: var(--text-muted, #71717a);">${item.date}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Distributions Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 18px;">
          
          <!-- Status Distribution -->
          <div style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">Library Status</div>
            ${statusDist.length === 0 ? `<div style="color: var(--text-muted, #71717a); font-size: 0.85rem;">No manga in library</div>` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${statusDist.map(s => `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
                      <span style="color: var(--text-primary, #fff); font-weight: 500;">${s.status}</span>
                      <span style="color: var(--text-muted, #a1a1aa);">${s.count} (${s.percentage}%)</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
                      <div style="width: ${s.percentage}%; height: 100%; background: var(--accent-primary, #10b981); border-radius: 4px;"></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Source Distribution -->
          <div style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">Sources</div>
            ${sourceDist.length === 0 ? `<div style="color: var(--text-muted, #71717a); font-size: 0.85rem;">No manga in library</div>` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${sourceDist.map(src => `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
                      <span style="color: var(--text-primary, #fff); font-weight: 500;">${this.resolveSourceName(src.source)}</span>
                      <span style="color: var(--text-muted, #a1a1aa);">${src.count} (${src.percentage}%)</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
                      <div style="width: ${src.percentage}%; height: 100%; background: #3b82f6; border-radius: 4px;"></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Category Distribution -->
          <div style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #fff;">Categories</div>
            ${catDist.length === 0 ? `<div style="color: var(--text-muted, #71717a); font-size: 0.85rem;">No categories assigned</div>` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${catDist.map(cat => `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
                      <span style="color: var(--text-primary, #fff); font-weight: 500;">${cat.category}</span>
                      <span style="color: var(--text-muted, #a1a1aa);">${cat.count} (${cat.percentage}%)</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
                      <div style="width: ${cat.percentage}%; height: 100%; background: #c084fc; border-radius: 4px;"></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>

        <!-- Most Read Manga -->
        <div style="background: var(--bg-surface, #18181b); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 14px; padding: 22px;">
          <div style="font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 16px;">Most Read Manga</div>
          ${mostRead.length === 0 ? `<div style="color: var(--text-muted, #71717a); font-size: 0.85rem;">No chapters read yet. Start reading from the library or browse tab!</div>` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;">
              ${mostRead.map((item, idx) => `
                <div class="most-read-card" data-manga-id="${encodeURIComponent(item.manga_id)}" data-source="${encodeURIComponent(item.source)}" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle, rgba(255,255,255,0.06)); border-radius: 10px; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease;">
                  <span style="font-size: 0.85rem; font-weight: 700; color: ${idx === 0 ? '#fbbf24' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : 'var(--text-muted, #71717a)'))}; width: 18px; text-align: center;">#${idx + 1}</span>
                  <img src="${item.cover_url || '/static/img/default-cover.png'}" alt="${item.title}" style="width: 44px; height: 62px; object-fit: cover; border-radius: 6px; background: #000; flex-shrink: 0;" onerror="this.src='/static/img/default-cover.png'" />
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.88rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</div>
                    <div style="font-size: 0.76rem; color: var(--accent-primary, #10b981); margin-top: 3px; font-weight: 500;">${item.chapters_read} chapter${item.chapters_read !== 1 ? 's' : ''} read</div>
                  </div>
                  <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: var(--text-muted, #71717a); stroke-width: 2; flex-shrink: 0;">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        </div>
      </div>
    `;

    // Bind Refresh button
    const refreshBtn = document.getElementById('btn-stats-refresh');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        const icon = document.getElementById('stats-refresh-icon');
        if (icon) icon.classList.add('spin-rotating');
        this.loadData();
      };
    }

    // Bind Most Read Manga clicks
    container.querySelectorAll('.most-read-card').forEach(card => {
      card.onclick = () => {
        const mId = decodeURIComponent(card.getAttribute('data-manga-id') || '');
        const src = decodeURIComponent(card.getAttribute('data-source') || 'local');
        if (mId) {
          Router.navigate(`manga/${src}/${mId}`);
        }
      };
    });
  }
};
