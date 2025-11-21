// tests/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';
import { loginSelectors } from '../selectors/login'; // 👈 importar desde selectors

export class LoginPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;
  private readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator(loginSelectors.emailInput);
    this.passwordInput = page.locator(loginSelectors.passwordInput);
    this.loginButton = page.locator(loginSelectors.submitButton);
    this.errorMessage = page.locator(loginSelectors.errorMessage);
  }

  async goto() {
    const response = await this.page.goto('/carrier/#/auth/login');
    console.log('[LoginPage.goto] status:', response?.status(), 'url:', this.page.url());
  }

  async isLoginErrorVisible(): Promise<boolean> {
  return await this.errorMessage.isVisible();
}

  async getLoginErrorMessage(): Promise<string> {
  return (await this.errorMessage.textContent()) ?? '';
}


  async login(username: string, password: string) {
    console.log('[LoginPage.login] usuario:', username);

    await this.emailInput.fill(username);
    await this.passwordInput.fill(password);

    const buttons = await this.loginButton.count();
    console.log('[LoginPage.login] botones submit encontrados:', buttons);

    await this.loginButton.click();
    console.log('[LoginPage.login] clic en botón login enviado');
    // Sin expect acá: solo dejamos que el test haga las validaciones
  }
}
