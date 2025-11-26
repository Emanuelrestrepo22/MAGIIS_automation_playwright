export const dashboardSelectors = {
  userMenu: '#page-header-user-dropdown, [data-testid="navbar-user-menu"]',
  userName: '#page-header-user-dropdown span, [data-testid="navbar-user-menu"] span, span.user-name-text',
  sidebar: '#navbar-nav, nav[role="navigation"], [data-testid="sidebar"]',
  logoutButton:
    'button:has-text("Logout"), a:has-text("Logout"), button:has-text("Cerrar sesión"), a:has-text("Cerrar sesión"), [data-testid="logout-button"]',
};
