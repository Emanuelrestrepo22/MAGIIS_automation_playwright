// tests/pages/LoginPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('Usuario');
    this.passwordInput = page.getByPlaceholder('Contraseña');
    this.loginButton = page.getByRole('button', { name: /ingresar/i });
  }

  async goto() {
    await this.page.context().clearCookies();
    const response = await this.page.goto('/carrier/login');

    // 1) Validar que el servidor no devuelva 404/500
    expect(response?.ok(), 'La página de login debe responder 2xx').toBeTruthy();

    // 2) Validar que realmente estoy viendo el formulario de login
    await expect(this.emailInput).toBeVisible({
      timeout: 10_000,
    });
  }

  async login(username: string, password: string) {
    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
