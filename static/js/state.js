// Global State Manager
const State = {
  incognitoMode: localStorage.getItem('shinobi_incognito') === 'true',
  currentTab: 'library', // library, browse, downloads, settings
  currentManga: null,    // Currently inspected manga details
  currentChapter: null,  // Currently active chapter in reader
  allChapters: [],       // Chapter list for current manga
  sources: [],
  activeSource: 'local',
  library: [],
  downloads: [],
  settings: {
    reader_mode: 'webtoon',
    reader_width: '800',
    reader_bg: 'black',
    preload_count: '5'
  },

  listeners: {},

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  },

  setTab(tab) {
    this.currentTab = tab;
    this.emit('tabChanged', tab);
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Deduplication: if the exact same message is currently showing, bounce it and return
    const currentToasts = container.querySelectorAll('.toast');
    for (const t of currentToasts) {
      if (t.textContent === message) {
        t.style.animation = 'none';
        void t.offsetWidth;
        t.style.animation = 'toastPulse 0.2s ease';
        return;
      }
    }

    // Never stack more than 2 toasts: immediately remove older toasts
    if (currentToasts.length >= 2) {
      currentToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.title = 'Click to dismiss';

    // Click to dismiss immediately
    toast.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      setTimeout(() => toast.remove(), 150);
    });

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => toast.remove(), 200);
      }
    }, 2000);
  }
};

window.Toast = {
  show(message, type = 'info') {
    State.showToast(message, type);
  }
};
