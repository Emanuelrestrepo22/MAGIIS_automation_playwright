// tests/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';
import { loginSelectors } from '../selectors/login';

export class LoginPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator(loginSelectors.emailInput);
    this.passwordInput = page.locator(loginSelectors.passwordInput);
    this.loginButton = page.locator(loginSelectors.submitButton);
  }

  async goto(): Promise<void> {
    console.log('[LoginPage] goto /carrier/#/auth/login');

    await this.page.context().clearCookies();
    await this.page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    await this.page.goto('/carrier/#/auth/login', {
      waitUntil: 'networkidle',
    });

    await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    console.log('[LoginPage] Pantalla de login cargada');
  }

  async login(username: string, password: string): Promise<void> {
    console.log('[LoginPage] login con usuario:', username);

    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);

    const buttons = await this.loginButton.count();
    console.log('[LoginPage] botones submit encontrados:', buttons);

    await this.loginButton.click();
    console.log('[LoginPage] click en botón login');
  }
}
