// Main Application Entry Point
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Navbar and Router
  Navbar.init();
  Router.init();

  // Top search input handler
  const topSearch = document.getElementById('top-search-input');
  if (topSearch) {
    topSearch.addEventListener('input', (e) => {
      const q = e.target.value;
      if (State.currentTab === 'library') {
        LibraryView.searchQuery = q;
        LibraryView.renderGrid();
      } else if (State.currentTab === 'browse') {
        const browseInput = document.getElementById('browse-search-input');
        if (browseInput) {
          browseInput.value = q;
        }
      }
    });

    topSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (!q) return;
        if (State.currentTab === 'library' && LibraryView.allManga.some(m => (m.title || '').toLowerCase().includes(q.toLowerCase()))) {
          LibraryView.searchQuery = q;
          LibraryView.renderGrid();
        } else {
          Router.navigate(`globalsearch/${encodeURIComponent(q)}`);
        }
      }
    });
  }

  // Tab switch listener
  State.on('tabChanged', (tab) => {
    document.body.setAttribute('data-active-tab', tab);

    // Hide all view pages
    document.querySelectorAll('.view-page').forEach(page => {
      page.style.display = 'none';
    });

    const target = document.getElementById(`view-${tab}`);
    if (target) {
      target.style.display = 'block';
    }

    // Update top bar title
    const titleEl = document.getElementById('top-bar-page-title');
    if (titleEl) {
      const titles = {
        library: 'Library',
        history: 'History',
        browse: 'Browse & Sources',
        downloads: 'Downloads',
        statistics: 'Statistics',
        globalsearch: 'Global Search',
        settings: 'Settings',
        manga_detail: 'Manga Details'
      };
      titleEl.textContent = titles[tab] || 'Mihon Web';
    }

    // Render corresponding view
    if (tab === 'library') LibraryView.render();
    else if (tab === 'history') HistoryView.render();
    else if (tab === 'browse') BrowseView.render();
    else if (tab === 'downloads') DownloadsView.render();
    else if (tab === 'statistics') StatisticsView.init();
    else if (tab === 'globalsearch') GlobalSearchView.render();
    else if (tab === 'settings') SettingsView.render();
  });

  // Load initial settings and default view
  try {
    const settings = await API.getSettings();
    State.settings = settings;
  } catch (e) {
    console.warn('Could not load settings on start:', e);
  }

  // Initial route based on URL hash or default to library
  if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
    Router.navigate('library', true);
  } else {
    Router.handleRoute();
  }

  // Trigger Onboarding Setup Wizard on first visit
  if (typeof SetupWizard !== 'undefined') {
    SetupWizard.init();
  }

  // Auto-resume any interrupted or pending downloads on web app open
  try {
    await API.autoResumeDownloads();
  } catch (e) {}

  // Background check for active downloads to set badge
  try {
    const tasks = await API.getDownloads();
    const activeCount = tasks.filter(t => t.status === 'downloading' || t.status === 'pending').length;
    Navbar.updateBadge('downloads', activeCount);
  } catch (e) {}

  // Incognito Mode Controller
  State.incognitoMode = localStorage.getItem('shinobi_incognito') === 'true';
  const incognitoBtn = document.getElementById('btn-toggle-incognito');
  const incognitoText = document.getElementById('incognito-btn-text');

  const updateIncognitoUI = () => {
    if (!incognitoBtn) return;
    if (State.incognitoMode) {
      incognitoBtn.style.color = '#c084fc';
      incognitoBtn.style.borderColor = 'rgba(168, 85, 247, 0.6)';
      incognitoBtn.style.background = 'rgba(168, 85, 247, 0.18)';
      if (incognitoText) incognitoText.textContent = 'Incognito ON';
    } else {
      incognitoBtn.style.color = '';
      incognitoBtn.style.borderColor = '';
      incognitoBtn.style.background = '';
      if (incognitoText) incognitoText.textContent = 'Incognito';
    }
  };
  updateIncognitoUI();

  if (incognitoBtn) {
    incognitoBtn.addEventListener('click', () => {
      State.incognitoMode = !State.incognitoMode;
      localStorage.setItem('shinobi_incognito', State.incognitoMode ? 'true' : 'false');
      updateIncognitoUI();
      if (typeof Toast !== 'undefined') {
        Toast.show(
          State.incognitoMode ? 'Incognito Mode enabled' : 'Incognito Mode disabled',
          State.incognitoMode ? 'info' : 'success'
        );
      }
    });
  }
});
