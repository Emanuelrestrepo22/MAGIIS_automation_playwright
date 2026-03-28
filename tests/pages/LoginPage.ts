// tests/pages/LoginPage.ts
import type { Page, Locator } from '@playwright/test';
import { loginSelectors } from '../selectors/login';

export class LoginPage {
	private readonly page: Page;
	private readonly emailInput: Locator;
	private readonly passwordInput: Locator;
	private readonly loginButton: Locator;
	readonly errorMessage: Locator;

	constructor(page: Page) {
		this.page = page;
		this.emailInput = page.locator(loginSelectors.emailInput);
		this.passwordInput = page.locator(loginSelectors.passwordInput);
		this.loginButton = page.locator(loginSelectors.submitButton);
		this.errorMessage = page.locator(loginSelectors.errorMessage);
	}

	async isLoginErrorVisible(timeout = 8000): Promise<boolean> {
		return this.errorMessage
			.waitFor({ state: 'visible', timeout })
			.then(() => true)
			.catch(() => false);
	}

	async getLoginErrorMessage(): Promise<string | null> {
		return this.errorMessage.textContent().catch(() => null);
	}

	async goto(): Promise<void> {
		const loginPath = process.env.LOGIN_PATH ?? '/carrier/#/auth/login';
		console.log('[LoginPage] goto', loginPath);

		await this.page.context().clearCookies();
		await this.page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});

		await this.page.goto(loginPath, { waitUntil: 'load' });

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
