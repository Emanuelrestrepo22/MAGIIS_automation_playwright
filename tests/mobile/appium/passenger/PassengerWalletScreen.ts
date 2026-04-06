/**
 * PassengerWalletScreen
 * Pantalla de wallet/billetera en la Passenger App.
 * El pasajero agrega tarjetas de crédito/débito aquí.
 *
 * TODO: todos los selectores deben validarse contra la app real con Appium Inspector.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export interface CardInput {
	number: string;
	expiry: string;   // formato MM/YY
	cvc: string;
	holderName?: string;
}

export class PassengerWalletScreen extends AppiumSessionBase {

	/**
	 * Abre la pantalla de wallet desde el menú principal de la app.
	 */
	async openWallet(): Promise<void> {
		// TODO: confirmar selector del ícono/menú de wallet con Appium Inspector
		// await this.tap(this.byAccessibilityId('wallet-menu-item'));
		throw new Error('PassengerWalletScreen.openWallet() — pendiente de implementación');
	}

	/**
	 * Toca el botón para agregar una nueva tarjeta.
	 */
	async tapAddCard(): Promise<void> {
		// TODO: confirmar selector del botón agregar tarjeta
		// await this.tap(this.byAccessibilityId('add-card-btn'));
		throw new Error('PassengerWalletScreen.tapAddCard() — pendiente de implementación');
	}

	/**
	 * Completa el formulario de nueva tarjeta.
	 * IMPORTANTE: el formulario puede ser nativo de Stripe (Stripe SDK) o propio de la app.
	 * Si es Stripe SDK: los campos pueden estar en un WebView dentro de la app.
	 */
	async fillCardForm(card: CardInput): Promise<void> {
		// TODO: detectar si el formulario es nativo o WebView
		// Si es WebView: usar driver.switchContext('WEBVIEW_com.magiis.passenger')
		// await this.typeIn(this.byAccessibilityId('card-number-input'), card.number);
		// await this.typeIn(this.byAccessibilityId('card-expiry-input'), card.expiry);
		// await this.typeIn(this.byAccessibilityId('card-cvc-input'), card.cvc);
		throw new Error('PassengerWalletScreen.fillCardForm() — pendiente de implementación');
	}

	/**
	 * Confirma el guardado de la tarjeta.
	 */
	async saveCard(): Promise<void> {
		// await this.tap(this.byAccessibilityId('save-card-btn'));
		throw new Error('PassengerWalletScreen.saveCard() — pendiente de implementación');
	}

	/**
	 * Verifica que la tarjeta agregada aparece en la lista del wallet.
	 * @param last4 — últimos 4 dígitos de la tarjeta
	 */
	async verifyCardAdded(last4: string): Promise<void> {
		// TODO: confirmar selector de la tarjeta en la lista
		// await this.waitForElement(this.byText(`•••• ${last4}`));
		throw new Error('PassengerWalletScreen.verifyCardAdded() — pendiente de implementación');
	}

	/**
	 * Selecciona una tarjeta existente como método de pago por defecto.
	 */
	async selectCard(last4: string): Promise<void> {
		// await this.tap(this.byText(`•••• ${last4}`));
		throw new Error('PassengerWalletScreen.selectCard() — pendiente de implementación');
	}
}
