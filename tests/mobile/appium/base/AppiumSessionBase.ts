/**
 * AppiumSessionBase
 * Base class for Android sessions using WebdriverIO + Appium.
 */

import { remote } from 'webdriverio';
import type { Browser, ChainablePromiseElement } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { buildAndroidCapabilities, buildAppiumRemoteConnection } from '../config/appiumRuntime';

export type AppiumDriver = Browser;
export type AppiumElement = ChainablePromiseElement;

export abstract class AppiumSessionBase {
	protected driver: AppiumDriver | null = null;
	protected readonly config: MobileActorConfig;

	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		this.config = config;
		this.driver = driver ?? null;
	}

	public getDriver(): AppiumDriver {
		return this.requireDriver();
	}

	/**
	 * Starts a session against the Android emulator/device.
	 */
	async startSession(): Promise<void> {
		if (this.driver) {
			return;
		}

		const caps = buildAndroidCapabilities(this.config);
		const connection = buildAppiumRemoteConnection(this.config);

		console.log(`[AppiumSessionBase] Connecting to ${this.config.appiumServerUrl}...`);
		console.log(`[AppiumSessionBase] Device: ${this.config.deviceName} (Android ${this.config.platformVersion})`);
		console.log(`[AppiumSessionBase] Base path: ${connection.path}`);

		this.driver = await remote({
			protocol: connection.protocol,
			hostname: connection.hostname,
			port: connection.port,
			path: connection.path,
			capabilities: caps as Record<string, unknown>,
			logLevel: 'warn',
			connectionRetryTimeout: 60_000,
			connectionRetryCount: 3
		});

		console.log('[AppiumSessionBase] Session started');
	}

	async endSession(): Promise<void> {
		if (this.driver) {
			// Guard: deleteSession() puede colgar si el device/appium no responde (p.ej. tras
			// interferencia de otro device). El teardown NO debe bloquear un test cuyos asserts
			// ya pasaron → timeout de 20s y liberar el driver igual.
			const driver = this.driver;
			this.driver = null;
			try {
				await Promise.race([
					driver.deleteSession(),
					new Promise((_, reject) => setTimeout(() => reject(new Error('deleteSession timeout (20s)')), 20_000)),
				]);
				console.log('[AppiumSessionBase] Session closed');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`[AppiumSessionBase] endSession: deleteSession no completó limpiamente (${message}) — driver liberado igual.`);
			}
		}
	}

	// Localization helpers

	protected byAccessibilityId(id: string): string {
		return `~${id}`;
	}

	protected byText(text: string): string {
		return `//*[@text="${text}"]`;
	}

	protected byResourceId(packageAndId: string): string {
		return `id:${packageAndId}`;
	}

	protected async waitForWebUrlContains(fragment: string, timeout = 10_000): Promise<boolean> {
		const driver = this.requireDriver();
		const webview = await this.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (url.includes(fragment)) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	protected async waitForWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		const driver = this.requireDriver();
		const webview = await this.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const matched = (await driver.execute(
				(target: string, allowPartial: boolean) => {
					const normalize = (value: unknown): string =>
						String(value ?? '')
							.replace(/\s+/g, ' ')
							.trim()
							.toLowerCase()
							.normalize('NFD')
							.replace(/[\u0300-\u036f]/g, '');

					const isVisible = (element: Element): boolean => {
						const html = element as HTMLElement;
						const rect = html.getBoundingClientRect();
						const style = window.getComputedStyle(html);
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					};

					const targetText = normalize(target);
					const candidates = Array.from(
						document.querySelectorAll(
							'button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p'
						)
					) as HTMLElement[];

					return candidates.some(element => {
						if (!isVisible(element)) {
							return false;
						}

						const values = [
							normalize(element.innerText || element.textContent),
							normalize(element.getAttribute('aria-label')),
							normalize(element.getAttribute('content-desc')),
							normalize(element.getAttribute('title'))
						];

						return values.some(value => (allowPartial ? value.includes(targetText) : value === targetText));
					});
				},
				text,
				partial
			)) as boolean;

			if (matched) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	protected async tapWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		const driver = this.requireDriver();
		const webview = await this.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const clicked = (await driver.execute(
				(target: string, allowPartial: boolean) => {
					const normalize = (value: unknown): string =>
						String(value ?? '')
							.replace(/\s+/g, ' ')
							.trim()
							.toLowerCase()
							.normalize('NFD')
							.replace(/[\u0300-\u036f]/g, '');

					const isVisible = (element: Element): boolean => {
						const html = element as HTMLElement;
						const rect = html.getBoundingClientRect();
						const style = window.getComputedStyle(html);
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					};

					const findClickableAncestor = (element: HTMLElement): HTMLElement => {
						let current: HTMLElement | null = element;
						while (current) {
							const tag = current.tagName.toUpperCase();
							const role = normalize(current.getAttribute('role'));
							if (
								tag === 'BUTTON' ||
								tag === 'ION-BUTTON' ||
								tag === 'ION-ITEM' ||
								tag === 'ION-TAB-BUTTON' ||
								tag === 'ION-MENU-TOGGLE' ||
								tag === 'ION-COL' ||
								tag === 'A' ||
								role === 'button'
							) {
								return current;
							}
							current = current.parentElement;
						}

						return element;
					};

					const targetText = normalize(target);
					const candidates = Array.from(
						document.querySelectorAll(
							'button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p'
						)
					) as HTMLElement[];

					const match = candidates.find(element => {
						if (!isVisible(element)) {
							return false;
						}

						const values = [
							normalize(element.innerText || element.textContent),
							normalize(element.getAttribute('aria-label')),
							normalize(element.getAttribute('content-desc')),
							normalize(element.getAttribute('title'))
						];

						return values.some(value => (allowPartial ? value.includes(targetText) : value === targetText));
					});

					if (!match) {
						return false;
					}

					findClickableAncestor(match).click();
					return true;
				},
				text,
				partial
			)) as boolean;

			if (clicked) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	protected requireDriver(): AppiumDriver {
		if (!this.driver) {
			throw new Error('Appium session is not started. Call startSession() first.');
		}

		return this.driver;
	}

	protected async switchToWebView(timeout = 10_000): Promise<string | null> {
		const driver = this.requireDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const contexts = (await driver.getContexts()) as string[];
			const webview = contexts.find(context => context.startsWith('WEBVIEW'));
			if (webview) {
				await driver.switchContext(webview);
				return webview;
			}

			await driver.pause(250);
		}

		return null;
	}

	protected async switchToNative(): Promise<void> {
		await this.requireDriver().switchContext('NATIVE_APP');
	}

	protected async executeInWebView<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
		const webview = await this.switchToWebView();
		if (!webview) {
			throw new Error('No WEBVIEW context available');
		}

		return (await this.requireDriver().execute(fn as never, ...(args as never[]))) as T;
	}

	// WebView form helpers
	//
	// Primitivas de llenado de forms Angular/Ionic dentro del WebView. Viven en la base por la
	// misma razón que `UiBase` es dueña de los helpers de Playwright (CLAUDE.md §10): el
	// componente `credit-card-payment-data` lo renderizan DOS apps (billetera del pasajero y
	// modal de cobro de la Driver App) y la receta de llenado es idéntica en ambas. Promovidas
	// desde `PassengerWalletScreen` (donde estaban probadas en device) sin cambios de comportamiento.

	/**
	 * Hook de SCOPE del form web bajo prueba: `findAnyElement` y `fillWebInputField` lo consultan
	 * cuando el caller no pasa `scope` explícito.
	 *
	 * Default `null` ⇒ buscar en todo el documento, que es lo correcto cuando el form es un
	 * overlay ÚNICO (el modal de cobro de la Driver App es un solo `credit-card-payment-data`
	 * dentro de un `ion-modal.show-modal`). Las pantallas que pueden tener VARIAS instancias
	 * montadas a la vez lo sobreescriben para devolver la instancia correcta.
	 */
	protected async getWebFormScope(): Promise<any | null> {
		return null;
	}

	/**
	 * Cambia el frame activo del WebView (`null` = volver al top-frame). Envuelve las dos APIs que
	 * expone WebdriverIO según versión. Necesario porque el documento principal de las apps MAGIIS
	 * convive con iframes de terceros (firebase-auth, Google Maps) y un `switchContext` puede dejar
	 * el frame desalineado respecto del form que se quiere llenar.
	 */
	protected async switchFrameTarget(target: any): Promise<void> {
		const driver = this.requireDriver() as any;

		if (typeof driver.switchFrame === 'function') {
			await driver.switchFrame(target);
			return;
		}

		if (typeof driver.switchToFrame === 'function') {
			await driver.switchToFrame(target);
			return;
		}

		throw new Error('Driver does not support frame switching');
	}

	/**
	 * Primer elemento que matchea `selector` (visible o no), preferiendo el `scope` recibido, luego
	 * el de `getWebFormScope()`, y por último el documento entero. Silent-fail: devuelve `null`.
	 */
	protected async findAnyElement(selector: string, scope?: any): Promise<any | null> {
		const driver = this.requireDriver();
		if (scope) {
			let candidates: any = [];

			try {
				candidates = await scope.$$(selector);
			} catch {
				candidates = [];
			}

			if (candidates.length > 0) {
				return candidates[0];
			}
		} else {
			const formScope = await this.getWebFormScope().catch(() => null);
			if (formScope) {
				let candidates: any = [];

				try {
					candidates = await formScope.$$(selector);
				} catch {
					candidates = [];
				}

				if (candidates.length > 0) {
					return candidates[0];
				}
			}
		}

		let candidates: any = [];

		try {
			candidates = await driver.$$(selector);
		} catch {
			candidates = [];
		}

		return candidates[0] ?? null;
	}

	/**
	 * Escribe `value` en el `<input>`/`<textarea>` real del handle `element` usando el SETTER NATIVO
	 * + dispatch de `input`/`change`. Resuelve el input tanto en shadow DOM (`host.shadowRoot`) como
	 * en light DOM (`ion-input` con encapsulación scoped). Es la única mecánica que sirve en estos
	 * forms: tienen máscara y `onpaste`/`oncopy`/`ondrag`/`ondrop` bloqueados, así que ni el paste
	 * ni un `value =` crudo actualizan el FormControl de Angular.
	 */
	protected async setDomValue(element: any, value: string): Promise<boolean> {
		const driver = this.requireDriver();
		return (await driver.execute(
			(target: HTMLElement, nextValue: string) => {
				const host = target as HTMLElement & {
					shadowRoot?: ShadowRoot | null;
					querySelector?: (selectors: string) => Element | null;
				};

				const input =
					(host.shadowRoot?.querySelector('input, textarea') as
						| HTMLInputElement
						| HTMLTextAreaElement
						| null) ??
					(host.matches?.('input, textarea') ? (host as HTMLInputElement | HTMLTextAreaElement) : null) ??
					(host.querySelector?.('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

				if (!input) {
					return false;
				}

				const setter =
					Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
					Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

				if (!setter) {
					return false;
				}

				input.focus?.();
				setter.call(input, nextValue);
				input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

				try {
					input.setSelectionRange?.(nextValue.length, nextValue.length);
				} catch {
					// Ignore selection errors on Stripe iframes.
				}

				return true;
			},
			element as never,
			value
		)) as boolean;
	}

	/**
	 * Llena el primer selector de `selectors` que resuelva, vía `setDomValue`. Si la resolución de
	 * elementos por WDIO falla (context/frame desalineado — el fallo típico en estos WebViews), cae
	 * a un `executeInWebView` que hace el mismo setter nativo desde dentro del documento.
	 * Silent-fail: devuelve `false` en vez de lanzar.
	 */
	protected async fillWebInputField(selectors: readonly string[], value: string, scope?: any): Promise<boolean> {
		const modal = scope ?? (await this.getWebFormScope().catch(() => null));

		for (const selector of selectors) {
			const element = modal
				? ((await modal.$(selector).catch(() => null)) ?? (await this.findAnyElement(selector, scope)))
				: await this.findAnyElement(selector, scope);
			if (!element) {
				continue;
			}

			try {
				if (await this.setDomValue(element, value)) {
					return true;
				}
			} catch {
				// Fallback below.
			}
		}

		return this.executeInWebView(
			(candidateSelectors: string[], targetValue: string) => {
				const setNativeValue = (input: HTMLInputElement | HTMLTextAreaElement, nextValue: string): boolean => {
					const setter =
						Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
						Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

					if (!setter) {
						return false;
					}

					input.focus();
					setter.call(input, nextValue);
					input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
					return true;
				};

				for (const selector of candidateSelectors) {
					const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
					for (const node of nodes) {
						const input = node.matches('input, textarea')
							? (node as HTMLInputElement | HTMLTextAreaElement)
							: (node.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

						if (!input) {
							continue;
						}

						if (setNativeValue(input, targetValue)) {
							return true;
						}
					}
				}

				return false;
			},
			selectors,
			value
		).catch(() => false);
	}

	/** Parte un vencimiento `MM/YY` o `MM/YYYY` en sus variantes de formato. Fail-fast si no matchea. */
	protected parseExpiryParts(expiry: string): { month: string; year: string; combined: string; compact: string } {
		const normalized = expiry.trim().replace(/\s+/g, '');
		const match = normalized.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
		if (!match) {
			throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
		}

		const month = match[1].padStart(2, '0');
		const year = match[2].slice(-2);
		return { month, year, combined: `${month}/${year}`, compact: `${month}${year}` };
	}

	// Interaction helpers

	protected async waitForElement(selector: string, timeout = 10_000): Promise<AppiumElement> {
		const driver = this.requireDriver();
		const el = driver.$(selector);
		await el.waitForDisplayed({ timeout });
		return el;
	}

	protected async getFirstVisibleElement(selectors: string[], timeout = 10_000): Promise<AppiumElement> {
		if (!selectors.length) {
			throw new Error('No selectors provided');
		}

		const driver = this.requireDriver();
		const deadline = Date.now() + timeout;
		let lastError: unknown;

		while (Date.now() < deadline) {
			for (const selector of selectors) {
				try {
					const el = driver.$(selector);
					if (await el.isDisplayed().catch(() => false)) {
						return el;
					}
				} catch (error) {
					lastError = error;
				}
			}

			await driver.pause(250);
		}

		const suffix = lastError instanceof Error ? ` (${lastError.message})` : '';
		throw new Error(
			`No visible element matched any selector within ${timeout}ms: ${selectors.join(', ')}${suffix}`
		);
	}

	protected async getFirstVisibleText(selectors: string[], timeout = 10_000): Promise<string> {
		const el = await this.getFirstVisibleElement(selectors, timeout);
		return (await el.getText()).trim();
	}

	protected async tap(selector: string, timeout = 10_000): Promise<void> {
		const el = await this.waitForElement(selector, timeout);
		await el.click();
	}

	protected async tapFirstVisible(selectors: string[], timeout = 10_000): Promise<void> {
		const el = await this.getFirstVisibleElement(selectors, timeout);
		await el.click();
	}

	protected async typeIn(selector: string, value: string): Promise<void> {
		const el = await this.waitForElement(selector);
		await el.setValue(value);
	}

	protected async getText(selector: string): Promise<string> {
		const el = await this.waitForElement(selector);
		return el.getText();
	}

	protected async pause(ms: number): Promise<void> {
		await this.requireDriver().pause(ms);
	}
}
