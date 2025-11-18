// tests/TestBase.ts
import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { Navbar } from './pages/Navbar';

// 1) Definimos el tipo Fixtures
type Fixtures = {
  loginPage: LoginPage;
  navbar: Navbar;
};

// 2) Extendemos el test base con las fixtures tipadas
export const test = base.extend<Fixtures>({
  loginPage: async ({ page }: { page: Page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  navbar: async ({ page }: { page: Page }, use) => {
    const navbar = new Navbar(page);
    await use(navbar);
  },
});

export { expect };
