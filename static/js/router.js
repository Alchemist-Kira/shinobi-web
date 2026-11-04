// SPA Hash Router for History and Refresh Persistence
const Router = {
  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  navigate(path, replace = false) {
    const cleanPath = path.startsWith('#/') ? path.slice(2) : (path.startsWith('/') ? path.slice(1) : path);
    const newHash = '#/' + cleanPath;
    if (window.location.hash === newHash) {
      this.handleRoute();
      return;
    }

    if (replace) {
      history.replaceState(null, '', newHash);
      this.handleRoute();
    } else {
      window.location.hash = newHash;
    }
  },

  async handleRoute() {
    const rawHash = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : window.location.hash.slice(1);
    const [pathPart, queryPart] = rawHash.split('?');
    const queryParams = new URLSearchParams(queryPart || '');
    const targetPage = parseInt(queryParams.get('page') || '1', 10);
    const parts = (pathPart || '').split('/').filter(Boolean);
    const route = parts[0] || 'library';

    // If navigating away from reader, ensure reader modal is closed cleanly
    if (route !== 'read' && route !== 'reader') {
      document.body.classList.remove('reader-active');
      document.documentElement.classList.remove('reader-active');
      const modal = document.getElementById('reader-modal');
      if (modal && modal.style.display !== 'none') {
        ReaderView.close(false); // false = do not trigger history.back recursion
      }
    }

    // If navigating away from manga detail, clean up scroll listeners and download polling
    if (route !== 'manga' && typeof MangaDetailView !== 'undefined') {
      if (typeof MangaDetailView.cleanup === 'function') {
        MangaDetailView.cleanup();
      } else if (typeof MangaDetailView.stopDownloadPolling === 'function') {
        MangaDetailView.stopDownloadPolling();
      }
    }

    if (route === 'library') {
      State.setTab('library');
    } else if (route === 'history') {
      State.setTab('history');
      if (typeof HistoryView !== 'undefined') {
        await HistoryView.render();
      }
    } else if (route === 'browse') {
      State.setTab('browse');
      if (typeof BrowseView !== 'undefined') {
        const tabParam = queryParams.get('tab');
        if (tabParam === 'migration') {
          BrowseView.activeSubTab = 'migration';
        } else if (tabParam === 'extensions') {
          BrowseView.activeSubTab = 'extensions';
        } else if (tabParam === 'globalsearch') {
          BrowseView.activeSubTab = 'globalsearch';
        } else {
          BrowseView.activeSubTab = 'sources';
          BrowseView.sourcesViewMode = 'directory';
        }
        await BrowseView.render();
      }
    } else if (route === 'migration') {
      State.setTab('browse');
      if (typeof BrowseView !== 'undefined') {
        BrowseView.activeSubTab = 'migration';
        await BrowseView.render();
        const sourceId = parts[1];
        if (sourceId && typeof MigrationView !== 'undefined') {
          await MigrationView.openSource(sourceId);
        }
      }
    } else if (route === 'source') {
      const sourceId = parts[1];
      State.setTab('browse');
      if (typeof BrowseView !== 'undefined') {
        BrowseView.activeSubTab = 'sources';
        if (sourceId) {
          const genreParam = queryParams.get('genre');
          if (genreParam) {
            await BrowseView.searchGenre(decodeURIComponent(genreParam), sourceId);
          } else {
            const listingParam = queryParams.get('listing') || 'popular';
            await BrowseView.openSourceCatalog(sourceId, listingParam, false);
          }
        } else {
          BrowseView.sourcesViewMode = 'directory';
          await BrowseView.render();
        }
      }
    } else if (route === 'downloads') {
      State.setTab('downloads');
    } else if (route === 'statistics' || route === 'stats') {
      State.setTab('statistics');
    } else if (route === 'globalsearch') {
      State.setTab('browse');
      BrowseView.activeSubTab = 'globalsearch';
      const searchQuery = parts.slice(1).join('/') ? decodeURIComponent(parts.slice(1).join('/')) : '';
      await BrowseView.render();
      if (typeof GlobalSearchView !== 'undefined') {
        await GlobalSearchView.render(searchQuery);
      }
    } else if (route === 'settings') {
      State.setTab('settings');
    } else if (route === 'manga') {
      const source = parts[1];
      const mangaId = decodeURIComponent(parts.slice(2).join('/'));
      if (source && mangaId) {
        State.setTab('manga_detail');
        if (typeof MangaDetailView.render === 'function') {
          await MangaDetailView.render(source, mangaId);
        } else if (typeof MangaDetailView.open === 'function') {
          await MangaDetailView.open(source, mangaId);
        }
      } else {
        this.navigate('library', true);
      }
    } else if (route === 'read' || route === 'reader') {
      const source = parts[1];
      const mangaId = parts[2];
      const chapterId = decodeURIComponent(parts.slice(3).join('/'));

      if (source && mangaId && chapterId) {
        await this.loadAndOpenReader(source, mangaId, chapterId, targetPage);
      } else {
        this.navigate('library', true);
      }
    } else {
      this.navigate('library', true);
    }
  },

  async loadAndOpenReader(source, mangaId, chapterId, targetPage = 1) {
    let manga = State.currentManga;
    let chapters = State.allChapters;

    // If manga details or chapters are not in memory (e.g. page was refreshed)
    if (!manga || manga.id !== mangaId || !chapters || chapters.length === 0) {
      try {
        const [mDetails, mChapters] = await Promise.all([
          API.getMangaDetails(source, mangaId),
          API.getMangaChapters(source, mangaId)
        ]);
        manga = mDetails;
        chapters = mChapters;
        State.currentManga = manga;
        State.allChapters = chapters;
        MangaDetailView.manga = manga;
        MangaDetailView.chapters = chapters;
      } catch (err) {
        console.error('Failed to load manga on direct URL navigation:', err);
        State.showToast('Failed to load manga');
        this.navigate('library');
        return;
      }
    }

    const chObj = chapters.find(c => 
      c.id === chapterId || 
      decodeURIComponent(c.id) === chapterId || 
      c.id === decodeURIComponent(chapterId) ||
      (c.chapter_number != null && String(c.chapter_number) === String(chapterId))
    ) || chapters[0];
    if (chObj) {
      await ReaderView.open(manga, chObj, targetPage);
    }
  }
};
