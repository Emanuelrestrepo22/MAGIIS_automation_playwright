// tests/pages/LoginPage.ts
import type { Page, Locator } from '@playwright/test';
import type { AppRole } from '../config/runtime';
import { getDefaultRole, resolveLoginPath } from '../config/runtime';
import { loginSelectors } from '../selectors/login';

export class LoginPage {
	// Guardamos page, role y locators como estado interno para que cada método
	// exprese intención de negocio y no detalles repetitivos del DOM.
	private readonly page: Page;
	private readonly role: AppRole;
	private readonly emailInput: Locator;
	private readonly passwordInput: Locator;
	private readonly loginButton: Locator;
	readonly errorMessage: Locator;

	constructor(page: Page, role: AppRole = getDefaultRole()) {
		this.page = page;
		this.role = role;
		this.emailInput = page.locator(loginSelectors.emailInput);
		this.passwordInput = page.locator(loginSelectors.passwordInput);
		this.loginButton = page.locator(loginSelectors.submitButton);
		this.errorMessage = page.locator(loginSelectors.errorMessage);
	}

	async isLoginErrorVisible(timeout = 8000): Promise<boolean> {
		// Este helper devuelve boolean en lugar de lanzar error para simplificar
		// assertions de tests negativos.
		return this.errorMessage
			.waitFor({ state: 'visible', timeout })
			.then(() => true)
			.catch(() => false);
	}

	async getLoginErrorMessage(): Promise<string | null> {
		// Si el mensaje no existe todavía, devolvemos null en vez de romper el test.
		return this.errorMessage.textContent().catch(() => null);
	}

	async goto(): Promise<void> {
		// La ruta de login depende del rol porque carrier, contractor y web
		// pueden entrar por portales distintos.
		const loginPath = resolveLoginPath(this.role);
		console.log(`[LoginPage][${this.role}] goto ${loginPath}`);

		// Limpiamos la sesión antes de navegar para garantizar que realmente
		// estamos probando el formulario de login y no una sesión previa.
		await this.page.context().clearCookies();
		await this.page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});

		await this.page.goto(loginPath, { waitUntil: 'load' });

		// Esperamos el campo email como señal de que el formulario quedó listo para interactuar.
		await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
		console.log(`[LoginPage][${this.role}] Pantalla de login cargada`);
	}

	async login(username: string, password: string): Promise<void> {
		// Este método encapsula el happy path del formulario y deja el detalle
		// de selectores dentro del page object.
		console.log(`[LoginPage][${this.role}] login con usuario:`, username);

		await this.emailInput.fill(username);
		await this.passwordInput.fill(password);

		// El conteo ayuda a detectar rápido si el selector cambió y ya no apunta
		// a un único botón de submit.
		const buttons = await this.loginButton.count();
		console.log(`[LoginPage][${this.role}] botones submit encontrados:`, buttons);

		await this.loginButton.click();
		console.log('[LoginPage] click en botón login');
	}
}
