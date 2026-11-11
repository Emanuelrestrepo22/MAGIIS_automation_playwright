/**
 * ConfirmModal — modal Sí/No (`app-confirm-modal`) del Driver (empezar viaje, finalizar viaje).
 * Componente compartido: reemplaza los dos bloques duplicados de `DriverTripNavigationScreen`.
 * POM puro: locators + acciones atómicas + estados observables. Sin aserciones de negocio.
 * Selectores del DOM dump (btn primary «Si» / btn-outlined-red «No», contenedor app-confirm-modal).
 */

import { defineLocator, resolveWebSelectors } from '../../core/Locator';
import type { I18n } from '../../core/I18n';
import type { MobileSession } from '../../core/MobileSession';
import { Waits, type UntilOptions } from '../../core/Waits';

const MODAL = defineLocator({ id: 'driver.confirmModal.container', web: ['app-confirm-modal', 'ion-modal'] });
const YES_BUTTON = defineLocator({
	id: 'driver.confirmModal.yes',
	web: ['app-confirm-modal button.btn.primary', 'ion-modal button.btn.primary'],
	textKey: 'driver.buttons.confirmYes'
});
const NO_BUTTON = defineLocator({
	id: 'driver.confirmModal.no',
	web: ['app-confirm-modal button.btn-outlined-red', 'ion-modal button.btn-outlined-red']
});

export class ConfirmModal {
	constructor(
		private readonly session: MobileSession,
		private readonly i18n: I18n
	) {}

	private async web() {
		if ((await this.session.context()) !== 'webview') await this.session.switchContext('webview');
		return this.session.driver;
	}

	/** Estado observable: hay un modal de confirmación visible. */
	async isShown(): Promise<boolean> {
		const driver = await this.web();
		return driver
			.execute<boolean, [string[]]>((sels: string[]) => {
				return sels.some(s =>
					Array.from(document.querySelectorAll(s)).some(el => {
						const r = (el as HTMLElement).getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					})
				);
			}, resolveWebSelectors(MODAL))
			.catch(() => false);
	}

	async waitUntilShown(options: UntilOptions = {}): Promise<void> {
		await Waits.until(() => this.isShown(), { label: 'ConfirmModal visible', timeout: 15_000, ...options });
	}

	async waitUntilClosed(options: UntilOptions = {}): Promise<void> {
		await Waits.until(async () => !(await this.isShown()), { label: 'ConfirmModal cerrado', timeout: 15_000, ...options });
	}

	/** Texto de la pregunta del modal («¿Finalizar Viaje? …»); '' si no hay modal. */
	async readQuestion(): Promise<string> {
		const driver = await this.web();
		return driver
			.execute<string, [string[]]>((sels: string[]) => {
				for (const s of sels) {
					const el = Array.from(document.querySelectorAll(s)).find(e => (e as HTMLElement).offsetParent !== null);
					if (el) {
						return String((el as HTMLElement).innerText ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					}
				}
				return '';
			}, resolveWebSelectors(MODAL))
			.catch(() => '');
	}

	/** Toca «Sí» (btn primary cuyo texto coincide con alguna variante i18n). Devuelve el texto tocado. */
	async tapYes(): Promise<string> {
		const driver = await this.web();
		const clicked = await driver.execute<string, [string[], string[]]>(
			(sels: string[], yes: string[]) => {
				const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
				const wanted = yes.map(norm);
				for (const s of sels) {
					const btn = (Array.from(document.querySelectorAll(s)) as HTMLButtonElement[]).find(
						b => b.offsetParent !== null && !b.disabled && wanted.includes(norm(b.innerText ?? ''))
					);
					if (btn) {
						btn.click();
						return String(btn.innerText ?? '').trim();
					}
				}
				return '';
			},
			resolveWebSelectors(YES_BUTTON),
			this.i18n.variants(YES_BUTTON.textKey!)
		);
		if (!clicked) throw new Error(`[ConfirmModal] ${YES_BUTTON.id}: botón «Sí» no encontrado o deshabilitado.`);
		return clicked;
	}

	/** Toca «No» (btn-outlined-red). */
	async tapNo(): Promise<void> {
		const driver = await this.web();
		const ok = await driver.execute<boolean, [string[]]>((sels: string[]) => {
			for (const s of sels) {
				const btn = (Array.from(document.querySelectorAll(s)) as HTMLButtonElement[]).find(
					b => b.offsetParent !== null && !b.disabled
				);
				if (btn) {
					btn.click();
					return true;
				}
			}
			return false;
		}, resolveWebSelectors(NO_BUTTON));
		if (!ok) throw new Error(`[ConfirmModal] ${NO_BUTTON.id}: botón «No» no encontrado.`);
	}

	/** Contrato `confirm()` del doc §2.1: toca «Sí». */
	async confirm(): Promise<string> {
		return this.tapYes();
	}
}
