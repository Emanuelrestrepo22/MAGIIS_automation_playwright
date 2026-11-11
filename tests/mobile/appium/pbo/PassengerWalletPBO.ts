/**
 * PassengerWalletPBO — operaciones de negocio sobre la billetera del pasajero (alta, verificacion, borrado,
 * tarjeta principal). Compone screens (`WalletScreen`, `WalletCardRowsScreen`, `CardForm`); no tiene locators.
 *
 * Consumidores: `PassengerWalletScreen` (fachada legada que usan `PassengerTripHappyPathHarness` y los scripts
 * `passenger-wallet-3ds-delete` / `passenger-restore-wallet-card` / `passenger-ebiz-*`) y los flows nuevos.
 * Las aserciones de verificacion final (p. ej. "la tarjeta quedo en la lista") van en el spec: aca solo hay
 * precondiciones / esperas que fallan con error.
 */

import { sleep } from '../core/Waits';
import type { WalletCardRowsScreen } from '../screens/passenger/WalletCardRowsScreen';
import type { WalletConfirmDialog } from '../screens/passenger/WalletConfirmDialog';
import type { WalletRowMenu } from '../screens/passenger/WalletRowMenu';
import type { WalletScreen } from '../screens/passenger/WalletScreen';
import type { CardForm } from '../screens/shared/CardForm';
import { last4DigitsOf, type CardInput } from '../screens/shared/CardInput';
import type { SubmitOutcome } from '../screens/shared/Stripe3DS';

/** Puertos minimos usados por el PBO (permiten fakes en unit). */
export type WalletPort = Pick<WalletScreen, 'tapAddCard' | 'hasCard' | 'isCardFormOpen'>;
export type RowsPort = Pick<WalletCardRowsScreen, 'countCards' | 'clickCardRowAction' | 'waitForCardCountToDrop'>;
export type MenuPort = Pick<WalletRowMenu, 'tapDeleteInMenu' | 'tapPrincipalInMenu' | 'waitForPrincipalToast'>;
export type CardFormPort = Pick<CardForm, 'fillCardForm' | 'saveCard' | 'listIframeMetadata'>;
export type DialogPort = Pick<WalletConfirmDialog, 'confirmDeleteDialogIfPresent'>;

export type AddCardResult = { submitOutcome: SubmitOutcome };

export class PassengerWalletPBO {
	constructor(
		private readonly wallet: WalletPort,
		private readonly rows: RowsPort,
		private readonly menu: MenuPort,
		private readonly cardForm: CardFormPort,
		private readonly dialog: DialogPort
	) {}

	/** AGREGAR -> llenar form -> GUARDAR. Devuelve lo observado tras el submit (3DS visible, modal cerrado...). */
	async addCard(card: CardInput): Promise<AddCardResult> {
		await this.wallet.tapAddCard();
		await this.cardForm.fillCardForm(card);
		return { submitOutcome: await this.cardForm.saveCard() };
	}

	/** Espera a que la tarjeta aparezca en la lista; falla con el estado observado si vence el timeout. */
	async verifyCardAdded(last4: string, timeout = 10_000): Promise<void> {
		const digits = last4DigitsOf(last4);
		const deadline = Date.now() + timeout;
		let modalVisible = false;

		while (Date.now() < deadline) {
			modalVisible = await this.wallet.isCardFormOpen();

			if (await this.wallet.hasCard(digits, 1_000)) {
				return;
			}

			await sleep(modalVisible ? 500 : 250);
		}

		const currentCount = await this.rows.countCards().catch(() => -1);
		const metadata = await this.cardForm.listIframeMetadata().catch(() => []);
		throw new Error(
			`PassengerWalletScreen.verifyCardAdded() - card ending ${digits} not found after ${timeout}ms; modalVisible=${modalVisible}; cardCount=${currentCount}; Iframes: ${JSON.stringify(metadata)}`
		);
	}

	/**
	 * Quita la primera tarjeta visible. Devuelve su etiqueta o `null` si la lista esta vacia.
	 */
	async deleteFirstVisibleCard(): Promise<string | null> {
		const beforeCount = await this.rows.countCards();
		if (beforeCount <= 0) {
			return null;
		}

		const openedResult = await this.rows.clickCardRowAction(null, 'trash');

		if (openedResult.status === 'empty') {
			return null;
		}

		if (openedResult.status === 'error') {
			throw new Error('PassengerWalletScreen.deleteFirstVisibleCard() - failed to inspect wallet rows');
		}

		if (openedResult.status === 'missing-action') {
			throw new Error(
				`PassengerWalletScreen.deleteFirstVisibleCard() - wallet row options could not be opened (${openedResult.status})`
			);
		}

		if (openedResult.status === 'opened-options' && !(await this.menu.tapDeleteInMenu())) {
			throw new Error('PassengerWalletScreen.deleteFirstVisibleCard() - delete action not found');
		}

		await this.dialog.confirmDeleteDialogIfPresent();

		// Confirmacion por conteo: por etiqueta falla cuando hay tarjetas duplicadas con el mismo last-4.
		if (!(await this.rows.waitForCardCountToDrop(beforeCount, 10_000))) {
			const currentCount = await this.rows.countCards();
			if (currentCount >= beforeCount) {
				throw new Error(
					`PassengerWalletScreen.deleteFirstVisibleCard() - wallet count did not decrease after deleting "${openedResult.label}"`
				);
			}
		}

		return openedResult.label || null;
	}

	/** Quita una tarjeta por sus ultimos 4 digitos. */
	async deleteCard(last4: string): Promise<void> {
		const digits = last4DigitsOf(last4);
		const beforeCount = await this.rows.countCards();

		const openedResult = await this.rows.clickCardRowAction(digits, 'trash');

		if (openedResult.status === 'not-found') {
			throw new Error(`PassengerWalletScreen.deleteCard() - card ending ${digits} not found`);
		}

		if (openedResult.status === 'error') {
			throw new Error(
				`PassengerWalletScreen.deleteCard() - failed to inspect wallet rows for card ending ${digits}`
			);
		}

		if (openedResult.status === 'missing-action') {
			throw new Error('PassengerWalletScreen.deleteCard() - delete action not found');
		}

		if (openedResult.status === 'opened-options' && !(await this.menu.tapDeleteInMenu())) {
			throw new Error(`PassengerWalletScreen.deleteCard() - delete action not found for card ending ${digits}`);
		}

		await this.dialog.confirmDeleteDialogIfPresent();

		if (!(await this.rows.waitForCardCountToDrop(beforeCount, 10_000))) {
			const currentCount = await this.rows.countCards();
			if (currentCount >= beforeCount) {
				throw new Error(
					`PassengerWalletScreen.deleteCard() - wallet count did not decrease after deleting "${openedResult.label}"`
				);
			}
		}
	}

	/** Quita todas las tarjetas visibles. Devuelve cuantas se quitaron. */
	async deleteAllVisibleCards(maxIterations = 50): Promise<number> {
		let removed = 0;

		while (removed < maxIterations) {
			if ((await this.rows.countCards()) <= 0) {
				break;
			}

			if ((await this.deleteFirstVisibleCard()) === null) {
				break;
			}

			removed += 1;
		}

		return removed;
	}

	/** Marca una tarjeta guardada como medio de pago principal. */
	async selectCard(last4: string): Promise<void> {
		const digits = last4DigitsOf(last4);

		const selectionResult = await this.rows.clickCardRowAction(digits, 'star');

		if (selectionResult.status === 'not-found') {
			throw new Error(`PassengerWalletScreen.selectCard() - card ending ${digits} not found`);
		}

		if (selectionResult.status === 'error') {
			throw new Error(
				`PassengerWalletScreen.selectCard() - failed to inspect wallet rows for card ending ${digits}`
			);
		}

		if (selectionResult.status === 'already-default') {
			return;
		}

		if (selectionResult.status === 'opened-options') {
			if (!(await this.menu.tapPrincipalInMenu())) {
				throw new Error(
					`PassengerWalletScreen.selectCard() - principal action not found for card ending ${digits}`
				);
			}
		} else if (selectionResult.status !== 'clicked-direct') {
			throw new Error(`PassengerWalletScreen.selectCard() - card ending ${digits} not found`);
		}

		if (!(await this.menu.waitForPrincipalToast(10_000))) {
			await sleep(500);
		}
	}
}
