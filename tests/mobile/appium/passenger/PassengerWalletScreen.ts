/**
 * PassengerWalletScreen — FACHADA LEGADA (strangler, paso 8). Misma API publica de siempre; la logica vive en:
 *   screens/passenger/WalletScreen · WalletCardRowsScreen · WalletRowMenu · WalletConfirmDialog  (POM del pasajero)
 *   screens/shared/CardForm (+ Stripe3DS y componentes)                           (form de tarjeta compartido)
 *   pbo/PassengerWalletPBO                                                        (secuencias de negocio)
 * Los specs/scripts/harness existentes siguen usando esta clase sin cambios. Codigo nuevo: usar los screens/PBO.
 */

import type { Browser } from 'webdriverio';
import { AppiumSessionBase } from '../base/AppiumSessionBase';
import { MobileSession } from '../core/MobileSession';
import { PassengerWalletPBO } from '../pbo/PassengerWalletPBO';
import { WalletCardRowsScreen } from '../screens/passenger/WalletCardRowsScreen';
import { WalletConfirmDialog } from '../screens/passenger/WalletConfirmDialog';
import { WalletRowMenu } from '../screens/passenger/WalletRowMenu';
import { WalletScreen } from '../screens/passenger/WalletScreen';
import { CardForm } from '../screens/shared/CardForm';
import type { CardInput } from '../screens/shared/CardInput';
import { WebViewKit } from '../screens/shared/WebViewKit';

export type { CardInput } from '../screens/shared/CardInput';

type WalletParts = {
	driver: Browser;
	wallet: WalletScreen;
	rows: WalletCardRowsScreen;
	cardForm: CardForm;
	pbo: PassengerWalletPBO;
};

export class PassengerWalletScreen extends AppiumSessionBase {
	private cached: WalletParts | null = null;

	/** Arma el grafo de screens/PBO sobre el driver vigente (se rearma si el driver cambia). */
	private parts(): WalletParts {
		const driver = this.getDriver();
		if (this.cached && this.cached.driver === driver) {
			return this.cached;
		}

		const kit = new WebViewKit(new MobileSession(this.config, { driver }));
		const cardForm = new CardForm(kit);
		const dialog = new WalletConfirmDialog(kit);
		const wallet = new WalletScreen(kit, cardForm, dialog);
		const rows = new WalletCardRowsScreen(kit);
		const menu = new WalletRowMenu(kit);
		const pbo = new PassengerWalletPBO(wallet, rows, menu, cardForm, dialog);
		this.cached = { driver, wallet, rows, cardForm, pbo };
		return this.cached;
	}

	/** Opens the wallet page from the main menu. */
	async openWallet(): Promise<void> {
		return this.parts().wallet.openWallet();
	}

	/** Taps the add card button. */
	async tapAddCard(): Promise<void> {
		return this.parts().wallet.tapAddCard();
	}

	/** Completes the new card form (Stripe iframes or native form). */
	async fillCardForm(card: CardInput): Promise<void> {
		return this.parts().cardForm.fillCardForm(card);
	}

	/** Validez del FormGroup del form nativo de tarjeta (`formValid = null` si no hay form nativo). */
	async readFormValidity(): Promise<{
		formValid: boolean | null;
		invalidControls: Array<{ name: string; errors: unknown }>;
	}> {
		return this.parts().cardForm.readFormValidity();
	}

	/** ¿El botón GUARDAR del form de alta de tarjeta está habilitado? */
	async isSaveEnabled(): Promise<boolean> {
		return this.parts().cardForm.isSaveEnabled();
	}

	/** Confirms the card save action. */
	async saveCard(): Promise<void> {
		await this.parts().cardForm.saveCard();
	}

	/** Verifies that the added card appears in the wallet list. */
	async verifyCardAdded(last4: string, timeout = 10_000): Promise<void> {
		return this.parts().pbo.verifyCardAdded(last4, timeout);
	}

	/** Checks whether a saved card ending is already visible in the wallet. */
	async hasCard(last4: string, timeout = 3_000): Promise<boolean> {
		return this.parts().wallet.hasCard(last4, timeout);
	}

	/** Conteo público de tarjetas visibles en el wallet (para limpieza parcial pre-alta). */
	async countCards(): Promise<number> {
		return this.parts().rows.countCards();
	}

	/** Removes the first visible saved card. Returns its label, or null when the list is empty. */
	async deleteFirstVisibleCard(): Promise<string | null> {
		return this.parts().pbo.deleteFirstVisibleCard();
	}

	/** Removes a card by its last 4 digits from the wallet. */
	async deleteCard(last4: string): Promise<void> {
		return this.parts().pbo.deleteCard(last4);
	}

	/** Removes all visible cards. Returns how many were removed. */
	async deleteAllVisibleCards(maxIterations = 50): Promise<number> {
		return this.parts().pbo.deleteAllVisibleCards(maxIterations);
	}

	/** Selects a saved card as default payment method. */
	async selectCard(last4: string): Promise<void> {
		return this.parts().pbo.selectCard(last4);
	}
}
