// tests/pages/Navbar.ts
import { Page, Locator } from '@playwright/test';

export class Navbar {
  private readonly page: Page;
  readonly viajesLink: Locator;
  readonly controlOperacionesLink: Locator;
  readonly ownerTableroLink: Locator;
  readonly userMenu: Locator;

  constructor(page: Page) {
    this.page = page;
    this.viajesLink = page.getByRole('link', { name: 'Gestión de Viajes' });
    this.controlOperacionesLink = page.getByRole('link', { name: 'Control de Operaciones' });
    this.ownerTableroLink = page.getByRole('link', { name: 'Owner Tablero' });
    this.userMenu = page.getByTestId('navbar-user-menu');
  }

  async isViajesVisible() {
    return this.viajesLink.isVisible();
  }
}
