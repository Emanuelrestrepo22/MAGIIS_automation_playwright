import { expect, type Frame, type Locator, type Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
import {
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
	STRIPE_CVC,
	STRIPE_EXPIRY,
} from '../../features/gateway-pg/data/stripeTestData';

type StripeComponentName = 'cardNumber' | 'cardExpiry' | 'cardCvc';

export class TravelDetailPage {
	private readonly paymentMethodSection: Locator;
	private readonly paymentMethodSectionHeader: Locator;
	private readonly paymentMethodValue: Locator;
	private readonly cardOwnerNameInput: Locator;
	private readonly billingZipInput: Locator;
	private readonly validateCardButton: Locator;
	private readonly recalculateButton: Locator;
	private readonly saveButton: Locator;
	private readonly activeTripAccordion: Locator;

	constructor(private readonly page: Page) {
		this.paymentMethodSection = page.locator('#add_travel_payment_methods');
		this.paymentMethodSectionHeader = this.paymentMethodSection.getByText('Forma de Pago');
		this.paymentMethodValue = page.locator('#add_travel_payment_methods > .below > .single > .value');
		this.cardOwnerNameInput = page.locator('input[formcontrolname="creditCardOwnerName"]');
		this.billingZipInput = page.locator('input[formcontrolname="avsZipcode"]');
		this.validateCardButton = page.getByRole('button', { name: /^Validar$/i });
		this.recalculateButton = page.getByRole('button', { name: /^Recalcular$/i });
		this.saveButton = page.getByRole('button', { name: /^Guardar$/i });
		// TODO: el recorder usa nth(3) sobre el acordeon del viaje; reemplazar por un selector estable cuando exista.
		this.activeTripAccordion = page.locator('div').filter({ hasText: /Viaje \d+ Tu viaje del/i }).nth(3);
	}

	async goto(travelId: string): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travels/${travelId}`);
		await this.page.waitForLoadState('domcontentloaded');
	}

	private async waitForStripeFrame(component: StripeComponentName, timeoutMs = 15_000): Promise<Frame> {
		const existing = this.page.frames().find((candidate) => candidate.url().includes(`componentName=${component}`));
		if (existing) {
			return existing;
		}

		return this.page.waitForEvent('framenavigated', {
			timeout: timeoutMs,
			predicate: (frame) => frame.url().includes(`componentName=${component}`),
		});
	}

	private async ensurePaymentMethodEditorVisible(): Promise<void> {
		if (await this.paymentMethodValue.isVisible().catch(() => false)) {
			return;
		}

		await this.openPaymentMethodsSection();
		await this.expandActiveTripAccordion();
	}

	/** Abre la seccion de forma de pago si todavia no esta visible. */
	async openPaymentMethodsSection(): Promise<void> {
		if (await this.paymentMethodValue.isVisible().catch(() => false)) {
			return;
		}

		await expect(this.paymentMethodSectionHeader).toBeVisible({ timeout: 10_000 });
		await this.paymentMethodSectionHeader.click();
		await expect(this.paymentMethodValue).toBeVisible({ timeout: 10_000 });
	}

	/** Expande el acordeon del viaje activo si el editor de pago aun no aparece. */
	async expandActiveTripAccordion(): Promise<void> {
		if (await this.paymentMethodValue.isVisible().catch(() => false)) {
			return;
		}

		await expect(this.activeTripAccordion).toBeVisible({ timeout: 10_000 });
		await this.activeTripAccordion.click();
		await expect(this.paymentMethodValue).toBeVisible({ timeout: 10_000 });
	}

	/** Selecciona una opcion visible del dropdown de pagos. */
	async selectPaymentMethodOption(optionText: string | RegExp): Promise<void> {
		await this.ensurePaymentMethodEditorVisible();
		await expect(this.paymentMethodValue).toBeVisible({ timeout: 10_000 });
		await this.paymentMethodValue.click({ force: true });

		const dropdown = this.paymentMethodSection.locator('select-dropdown').first();
		await dropdown.waitFor({ state: 'attached', timeout: 10_000 });

		const option = dropdown.locator('.options li').filter({ hasText: optionText }).first();
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}

	/** Completa la tarjeta preautorizada usando los campos Stripe embebidos. */
	async fillPreauthorizedCard(cardNumber: string): Promise<void> {
		const numberFrame = await this.waitForStripeFrame('cardNumber');
		const expiryFrame = await this.waitForStripeFrame('cardExpiry');
		const cvcFrame = await this.waitForStripeFrame('cardCvc');

		await numberFrame.locator('input[name="cardnumber"]').fill(cardNumber);
		await expiryFrame.locator('input[name="exp-date"]').fill(STRIPE_EXPIRY);
		await cvcFrame.locator('input[name="cvc"]').fill(STRIPE_CVC);
		await this.cardOwnerNameInput.fill(STRIPE_CARD_HOLDER_NAME);
		await this.billingZipInput.fill(STRIPE_BILLING_ZIP);
	}

	/** Confirma la tarjeta cargada en el formulario de detalle. */
	async clickValidateCard(): Promise<void> {
		await expect(this.validateCardButton).toBeVisible({ timeout: 10_000 });
		await this.validateCardButton.click();
	}

	/** Abre el selector de tarjetas ya vinculadas y elige la opcion indicada. */
	async selectLinkedCard(optionText: string | RegExp): Promise<void> {
		await this.selectPaymentMethodOption(optionText);
	}

	/** Recalcula el viaje despues de elegir la tarjeta vinculada. */
	async clickRecalculate(): Promise<void> {
		await expect(this.recalculateButton).toBeVisible({ timeout: 10_000 });
		await this.recalculateButton.click();
	}

	/** Guarda los cambios del viaje programado. */
	async clickSave(): Promise<void> {
		await expect(this.saveButton).toBeVisible({ timeout: 10_000 });
		await this.saveButton.click();
	}

	statusBadge() {
		// TODO: validar selector real con recorder — magiis-fe no expone data-testid
		// Candidatos: badge de estado dentro de travel-detail component
		return this.page.locator('app-travel-detail .travel-status, [class*="status-badge"], [class*="travel-state"]').first();
	}

	getTravelStatus() {
		return this.statusBadge();
	}

	paymentStatusSection() {
		// TODO: validar con recorder — sección de pago en detalle de viaje
		return this.page.locator('[class*="payment-status"], [class*="payment-section"]').first();
	}

	threeDSPendingFlag() {
		// TODO: validar con recorder — indicador visual de 3DS pendiente
		// magiis-fe no usa data-testid; el flag puede ser un ícono o badge de alerta
		return this.page.locator('[class*="3ds"], [class*="tds"], [class*="auth-pending"]').first();
	}

	get3DSRedFlag() {
		return this.threeDSPendingFlag();
	}

	retryButton() {
		// "Reintentar autenticación" — texto confirmado en magiis-fe source
		return this.page.getByRole('button', { name: /Reintentar autenticaci[oó]n/i });
	}

	getRetryButton() {
		return this.retryButton();
	}

	changeCardButton() {
		// "Cambiar tarjeta" — TODO: confirmar texto exacto con recorder
		return this.page.getByRole('button', { name: /Cambiar tarjeta/i });
	}

	async clickRetry(): Promise<void> {
		await this.retryButton().click();
	}

	async expectStatus(status: string, timeout = 15_000): Promise<void> {
		await expect(this.statusBadge()).toContainText(status, { timeout });
	}

	async expectRedFlagVisible(): Promise<void> {
		await expect(this.threeDSPendingFlag()).toBeVisible({ timeout: 10_000 });
	}

	async expectRedFlagHidden(): Promise<void> {
		await expect(this.threeDSPendingFlag()).toBeHidden({ timeout: 10_000 });
	}
}
