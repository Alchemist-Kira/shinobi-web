// Sidebar / Navigation Controller
const Navbar = {
  init() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab === 'browse' && typeof BrowseView !== 'undefined') {
          BrowseView.activeSubTab = 'sources';
          BrowseView.sourcesViewMode = 'directory';
        }
        if (tab) {
          Router.navigate(tab);
        }
      });
    });

    State.on('tabChanged', (tab) => {
      navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tab) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    });
  },

  updateBadge(tabName, count) {
    const item = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (!item) return;
    let badge = item.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        item.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }
};
