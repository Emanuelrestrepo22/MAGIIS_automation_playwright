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
			connectionRetryCount: 3,
		});

		console.log('[AppiumSessionBase] Session started');
	}

	async endSession(): Promise<void> {
		if (this.driver) {
			await this.driver.deleteSession();
			this.driver = null;
			console.log('[AppiumSessionBase] Session closed');
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
			const matched = await driver.execute((target: string, allowPartial: boolean) => {
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
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				const targetText = normalize(target);
				const candidates = Array.from(
					document.querySelectorAll('button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p')
				) as HTMLElement[];

				return candidates.some(element => {
					if (!isVisible(element)) {
						return false;
					}

					const values = [
						normalize(element.innerText || element.textContent),
						normalize(element.getAttribute('aria-label')),
						normalize(element.getAttribute('content-desc')),
						normalize(element.getAttribute('title')),
					];

					return values.some(value => allowPartial ? value.includes(targetText) : value === targetText);
				});
			}, text, partial) as boolean;

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
			const clicked = await driver.execute((target: string, allowPartial: boolean) => {
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
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
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
					document.querySelectorAll('button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p')
				) as HTMLElement[];

				const match = candidates.find(element => {
					if (!isVisible(element)) {
						return false;
					}

					const values = [
						normalize(element.innerText || element.textContent),
						normalize(element.getAttribute('aria-label')),
						normalize(element.getAttribute('content-desc')),
						normalize(element.getAttribute('title')),
					];

					return values.some(value => allowPartial ? value.includes(targetText) : value === targetText);
				});

				if (!match) {
					return false;
				}

				findClickableAncestor(match).click();
				return true;
			}, text, partial) as boolean;

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
		throw new Error(`No visible element matched any selector within ${timeout}ms: ${selectors.join(', ')}${suffix}`);
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
