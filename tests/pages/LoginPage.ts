// tests/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password-input');
    // Buenas prácticas: evitar CSS full-path; mientras tanto usamos el que tenemos
    this.loginButton = page.locator(
      'body > app-root > login-carrier > div > div.auth-page-content > div > div.row.justify-content-center > div > div > div > div.p-2.mt-4 > form > div.mt-4 > button'
    );
  }

  async goto() {
    await this.page.goto('/'); // usa baseURL del config
  }

  async login(username: string, password: string) {
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
