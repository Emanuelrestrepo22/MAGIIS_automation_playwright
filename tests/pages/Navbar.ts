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
    this.viajesLink = page.getByRole('link', { name: /Gestión de Viajes/i });
    this.controlOperacionesLink = page.getByRole('link', { name: /Control de Operaciones/i });
    this.ownerTableroLink = page.getByRole('link', { name: /Owner Tablero/i });
    this.userMenu = page.getByTestId('navbar-user-menu'); // debe existir el data-testid
  }

  async isViajesVisible() {
    return this.viajesLink.isVisible();
  }
}
