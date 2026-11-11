/**
 * WalletScreen (pasajero) — pantalla Billetera: abrir desde el menu, pulsar AGREGAR y consultar si una tarjeta
 * esta listada. Solo acciones atomicas y estado observable; las secuencias viven en `PassengerWalletPBO`.
 */

import { sleep } from '../../core/Waits';
import type { CardForm } from '../shared/CardForm';
import type { WebViewKit } from '../shared/WebViewKit';
import { last4DigitsOf } from '../shared/CardInput';
import type { WalletConfirmDialog } from './WalletConfirmDialog';

export class WalletScreen {
	constructor(
		private readonly kit: WebViewKit,
		private readonly cardForm: CardForm,
		private readonly dialog: WalletConfirmDialog
	) {}

	/** Espera a que el digito final de la tarjeta aparezca en la lista del wallet. */
	async hasCard(last4: string, timeout = 3_000): Promise<boolean> {
		return this.kit.waitForWebText(last4DigitsOf(last4), timeout, true);
	}

	/** ¿Hay un modal de form de tarjeta visible? */
	async isCardFormOpen(): Promise<boolean> {
		return Boolean(await this.cardForm.getVisibleModal().catch(() => null));
	}

	/**
	 * Opens the wallet page from the main menu.
	 */
	async openWallet(): Promise<void> {
		if (
			(await this.kit.waitForWebUrlContains('/cards', 2_000)) ||
			(await this.kit.waitForWebText('AGREGAR', 2_000, true))
		) {
			return;
		}

		const accountEntryLabels = ['Mi cuenta', 'Mis Direcciones', 'Billetera'];
		let openedAccount = false;
		let selectedLabel = '';

		for (const label of accountEntryLabels) {
			// Some builds expose the wallet entry directly, others route through an account submenu.
			if (await this.kit.tapWebText(label, 10_000, true)) {
				openedAccount = true;
				selectedLabel = label;
				break;
			}
		}

		if (!openedAccount) {
			throw new Error(
				`PassengerWalletScreen.openWallet() - none of the account entry labels were found (${accountEntryLabels.join(', ')})`
			);
		}

		await sleep(300);

		if (selectedLabel !== 'Billetera' && !(await this.kit.waitForWebText('Billetera', 2_000, true))) {
			const openedMenu = await this.kit.executeInWebView((selector: string) => {
				const menuToggle = document.querySelector(selector) as HTMLElement | null;
				if (!menuToggle) {
					return false;
				}

				menuToggle.click();
				return true;
			}, '#app-tab-bar ion-menu-toggle');

			if (!openedMenu) {
				throw new Error('PassengerWalletScreen.openWallet() - account menu toggle not found');
			}
		}

		const openedWallet =
			selectedLabel === 'Billetera' ? true : await this.kit.tapWebText('Billetera', 10_000, true);
		if (!openedWallet) {
			throw new Error('PassengerWalletScreen.openWallet() - "Billetera" not found');
		}

		const onWalletPage =
			(await this.kit.waitForWebUrlContains('/cards', 10_000)) ||
			(await this.kit.waitForWebText('AGREGAR', 10_000));

		if (!onWalletPage) {
			throw new Error('PassengerWalletScreen.openWallet() - wallet page did not load');
		}
	}

	/**
	 * Taps the add card button.
	 */
	async tapAddCard(): Promise<void> {
		// El form nativo (app-credit-card-payment-data) a veces no monta a la 1ª pulsación de
		// AGREGAR (queda solo el iframe de auth firebase) → flake. Reintentamos tap+espera.
		const maxAttempts = 3;
		let lastMetadata: unknown = [];

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const dismissedBlockingModal = await this.dialog.confirmDeleteDialogIfPresent();
			if (dismissedBlockingModal) {
				console.log('[PassengerWalletScreen] Blocking confirm modal dismissed before AGREGAR');
			}

			console.log(`[PassengerWalletScreen] Tapping AGREGAR (intento ${attempt}/${maxAttempts})`);
			const tapped = await this.tapAgregarButton();
			if (!tapped) {
				throw new Error('PassengerWalletScreen.tapAddCard() - "AGREGAR" not found');
			}

			console.log('[PassengerWalletScreen] AGREGAR tapped, waiting for card form');
			const formReady = await this.cardForm.waitForFormReady(20_000);
			if (formReady) {
				console.log('[PassengerWalletScreen] card form rendered after AGREGAR');
				await sleep(500);
				return;
			}

			lastMetadata = await this.cardForm.listIframeMetadata().catch(() => []);
			console.warn(`[PassengerWalletScreen] form no montó en intento ${attempt}; reintentando…`);
			await sleep(1_500);
		}

		throw new Error(
			`PassengerWalletScreen.tapAddCard() - Stripe card form did not render after "AGREGAR" (${maxAttempts} intentos). Iframes: ${JSON.stringify(lastMetadata)}`
		);
	}

	/** Localiza y pulsa el botón AGREGAR (JS click para evitar intercepción de hit-testing). */
	async tapAgregarButton(): Promise<boolean> {
		const driver = this.kit.driver;
		let candidates: any = [];

		try {
			candidates = await driver.$$('button.btn.primary, ion-button.btn.primary, button.primary, .btn.primary');
		} catch {
			candidates = [];
		}

		console.log(`[PassengerWalletScreen] AGREGAR candidates: ${candidates.length}`);

		for (const candidate of candidates) {
			if (!(await candidate.isDisplayed().catch(() => false))) {
				continue;
			}

			const text = await candidate.getText().catch(() => '');
			const ariaLabel = await candidate.getAttribute('aria-label').catch(() => '');
			const title = await candidate.getAttribute('title').catch(() => '');
			if (!/agregar/i.test(`${text} ${ariaLabel} ${title}`)) {
				continue;
			}

			await candidate.scrollIntoView().catch(() => {});
			await sleep(300);
			const clicked = await driver
				.execute((el: HTMLElement) => {
					el.scrollIntoView({ block: 'center', inline: 'center' });
					el.dispatchEvent(
						new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, view: window })
					);
					el.dispatchEvent(
						new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, view: window })
					);
					el.dispatchEvent(
						new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, view: window })
					);
					el.click();
					return true;
				}, candidate)
				.catch(() => false);

			if (clicked) {
				return true;
			}
		}

		return this.kit.tapWebText('AGREGAR', 10_000, true);
	}
}
