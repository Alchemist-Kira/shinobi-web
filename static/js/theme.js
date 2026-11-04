// Theme and Accent Color Management for Mihon Web
const ThemeManager = {
  PRESETS: {
    teal: {
      id: 'teal',
      name: 'Shinobi Teal',
      primary: '#0d9488',
      hover: '#0f766e',
      text: '#5eead4',
      border: '#14b8a6',
      rgb: '13, 148, 136'
    },
    blue: {
      id: 'blue',
      name: 'Sapphire Blue',
      primary: '#3b82f6',
      hover: '#2563eb',
      text: '#93c5fd',
      border: '#60a5fa',
      rgb: '59, 130, 246'
    },
    purple: {
      id: 'purple',
      name: 'Amethyst Purple',
      primary: '#8b5cf6',
      hover: '#7c3aed',
      text: '#c4b5fd',
      border: '#a78bfa',
      rgb: '139, 92, 246'
    },
    green: {
      id: 'green',
      name: 'Emerald Green',
      primary: '#10b981',
      hover: '#059669',
      text: '#6ee7b7',
      border: '#34d399',
      rgb: '16, 185, 129'
    },
    orange: {
      id: 'orange',
      name: 'Tangerine Orange',
      primary: '#f97316',
      hover: '#ea580c',
      text: '#fdba74',
      border: '#fb923c',
      rgb: '249, 115, 22'
    },
    rose: {
      id: 'rose',
      name: 'Sakura Rose',
      primary: '#f43f5e',
      hover: '#e11d48',
      text: '#fda4af',
      border: '#fb7185',
      rgb: '244, 63, 94'
    },
    cyan: {
      id: 'cyan',
      name: 'Electric Cyan',
      primary: '#06b6d4',
      hover: '#0891b2',
      text: '#7dd3fc',
      border: '#38bdf8',
      rgb: '6, 182, 212'
    },
    slate: {
      id: 'slate',
      name: 'Monochrome Slate',
      primary: '#94a3b8',
      hover: '#64748b',
      text: '#f8fafc',
      border: '#cbd5e1',
      rgb: '148, 163, 184'
    }
  },

  currentAccent: 'teal',

  init() {
    let saved = localStorage.getItem('mihon_theme_accent');
    if (!saved) {
      saved = 'teal';
    }
    this.applyAccent(saved, false);
  },

  hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    if (isNaN(num)) return '0, 176, 185';
    return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
  },

  shadeColor(color, percent) {
    let num = parseInt(color.replace('#', ''), 16);
    if (isNaN(num)) return color;
    let amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = (num >> 8 & 0x00FF) + amt;
    let B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  },

  applyAccent(themeIdOrHex, save = true) {
    const root = document.documentElement;
    let primary, hover, text, border, rgb;

    if (this.PRESETS[themeIdOrHex]) {
      const p = this.PRESETS[themeIdOrHex];
      this.currentAccent = themeIdOrHex;
      primary = p.primary;
      hover = p.hover;
      text = p.text;
      border = p.border;
      rgb = p.rgb;
    } else if (themeIdOrHex && themeIdOrHex.startsWith('#')) {
      this.currentAccent = themeIdOrHex;
      primary = themeIdOrHex;
      hover = this.shadeColor(themeIdOrHex, -15);
      text = this.shadeColor(themeIdOrHex, 50);
      border = this.shadeColor(themeIdOrHex, 20);
      rgb = this.hexToRgb(themeIdOrHex);
    } else {
      const p = this.PRESETS.teal;
      this.currentAccent = 'teal';
      primary = p.primary;
      hover = p.hover;
      text = p.text;
      border = p.border;
      rgb = p.rgb;
    }

    root.style.setProperty('--accent-primary', primary);
    root.style.setProperty('--accent-primary-hover', hover);
    root.style.setProperty('--accent-primary-rgb', rgb);
    root.style.setProperty('--text-accent', text);
    root.style.setProperty('--border-accent', border);
    root.style.setProperty('--border-focus', primary);

    if (save) {
      try {
        localStorage.setItem('mihon_theme_accent', this.currentAccent);
        if (typeof API !== 'undefined' && API.saveSettings) {
          API.saveSettings({ accent_color: this.currentAccent }).catch(() => {});
        }
      } catch (e) {}
    }

    document.dispatchEvent(new CustomEvent('mihon-accent-changed', { detail: { accent: this.currentAccent } }));
  }
};

// Immediate synchronous execution
ThemeManager.init();
