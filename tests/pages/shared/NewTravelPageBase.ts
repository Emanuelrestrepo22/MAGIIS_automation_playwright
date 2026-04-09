import { expect, type Frame, type Locator, type Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
import {
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
	STRIPE_CVC,
	STRIPE_EXPIRY,
	STRIPE_TEST_CARDS
} from '../../shared/gateway-pg/stripeTestData';

export type NewTravelFormInput = {
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
};

type StripeComponentName = 'cardNumber' | 'cardExpiry' | 'cardCvc';

const STRIPE_CARD_BY_LAST4: Record<string, string> = {
	[STRIPE_TEST_CARDS.successDirect.slice(-4)]: STRIPE_TEST_CARDS.successDirect,
	[STRIPE_TEST_CARDS.success3DS.slice(-4)]: STRIPE_TEST_CARDS.success3DS,
	[STRIPE_TEST_CARDS.fail3DS.slice(-4)]: STRIPE_TEST_CARDS.fail3DS,
	[STRIPE_TEST_CARDS.insufficientFunds.slice(-4)]: STRIPE_TEST_CARDS.insufficientFunds,
	[STRIPE_TEST_CARDS.declined.slice(-4)]: STRIPE_TEST_CARDS.declined,
};
const TRAVEL_SUBMIT_TIMEOUT = 60_000;

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesSearchText(candidate: string, searchText: string): boolean {
	const candidateText = normalizeText(candidate);
	const searchTokens = normalizeText(searchText)
		.split(' ')
		.map((token) => token.trim())
		.filter(Boolean);

	return searchTokens.every((token) => candidateText.includes(token));
}

function isMeaningfulOptionText(value: string): boolean {
	return value.length > 0 && !normalizeText(value).includes('no se encontraron resultados');
}


/**
 * Base compartida para el formulario de alta de viaje del carrier.
 * Centraliza locators y acciones para evitar duplicacion entre paginas
 * con distintos puntos de entrada.
 */
export abstract class NewTravelPageBase {
	protected readonly page: Page;
	protected readonly clientSelect: Locator;
	protected readonly clientSearchInput: Locator;
	protected readonly passengerSelect: Locator;
	protected readonly passengerSearchInput: Locator;
	protected readonly originSelect: Locator;
	protected readonly destinationSelect: Locator;
	protected readonly serviceTypeRow: Locator;
	protected readonly serviceTypeValue: Locator;
	protected readonly paymentMethodSelector: Locator;
	protected readonly paymentMethodValue: Locator;
	protected readonly cardOwnerNameInput: Locator;
	protected readonly billingZipInput: Locator;
	protected readonly validateCardButton: Locator;
	protected readonly vehicleButton: Locator;
	protected readonly submitButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.clientSelect = page.locator('#clientSelect');
		this.clientSearchInput = page.locator('#clientSelect input[placeholder="Usuario a Buscar"]');
		this.passengerSelect = page.locator('#passenger');
		this.passengerSearchInput = page.locator('#passenger input[placeholder="Usuario a Buscar"]');
		this.originSelect = page.locator('app-input-search-place[formcontrolname="origin"]');
		this.destinationSelect = page.locator('div.form-group-address[formarrayname="destination"] app-input-search-place');
		this.serviceTypeRow = page.locator('#id_tab_add_travel .row').filter({ hasText: 'Tipo de Servicio' }).first();
		this.serviceTypeValue = this.serviceTypeRow.locator('.value').first();
		this.paymentMethodSelector = page.locator('#add_travel_payment_methods');
		this.paymentMethodValue = this.paymentMethodSelector.locator('.value').first();
		this.cardOwnerNameInput = page.locator('input[formcontrolname="creditCardOwnerName"]');
		this.billingZipInput = page.locator('input[formcontrolname="avsZipcode"]');
		this.validateCardButton = page.getByRole('button', { name: /^Validar$/i });
		this.vehicleButton = page.getByRole('button', { name: /^Seleccionar Veh[íi]culo$/i }).first();
		this.submitButton = page.getByRole('button', { name: /^(Dar de Alta|Enviar Servicio)$/i }).first();
	}

	private async waitForEnabledButton(button: Locator, timeout = 45_000): Promise<void> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const visible = await button.isVisible().catch(() => false);
			const enabled = await button.isEnabled().catch(() => false);

			if (visible && enabled) {
				return;
			}

			await this.page.waitForTimeout(500);
		}

		throw new Error('Button did not become enabled before timeout');
	}

	private async waitForLoadingOverlayToDisappear(timeout = 15_000): Promise<void> {
		await this.page.locator('.black-overlay').waitFor({ state: 'hidden', timeout }).catch(() => undefined);
	}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/create`);
		await this.ensureLoaded();
	}

	async ensureLoaded(): Promise<void> {
		await this.clientSelect.waitFor({ state: 'visible', timeout: 15_000 });
	}

	private async selectAutocompleteOption(select: Locator, searchInput: Locator, name: string, roleLabel: string): Promise<void> {
		const searchValue = name.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();

		await select.locator('.below').click({ force: true });
		await this.page.waitForTimeout(400);
		await select.locator('select-dropdown').first().waitFor({ state: 'attached', timeout: 10_000 });
		await searchInput.fill(searchValue);
		await this.page.waitForTimeout(1_000);

		const options = select.locator('select-dropdown .options li');
		const count = await options.count();

		for (let index = 0; index < count; index += 1) {
			const option = options.nth(index);
			const text = await option.textContent().catch(() => '');

			if (!matchesSearchText(text ?? '', name)) {
				continue;
			}

			await option.click();
			await this.page.waitForTimeout(500);
			return;
		}

		throw new Error(`No ${roleLabel} option found for "${name}"`);
	}

	/**
	 * @deprecated Mantained for compatibility with older specs.
	 * Use selectClient() when the intent is explicit.
	 */
	async searchPassenger(name: string): Promise<void> {
		await this.selectClient(name);
	}

	async selectClient(name: string): Promise<void> {
		await this.selectAutocompleteOption(this.clientSelect, this.clientSearchInput, name, 'client');
	}

	async selectPassenger(name: string): Promise<void> {
		await expect(this.passengerSelect).not.toHaveAttribute('ng-reflect-is-disabled', 'true', { timeout: 10_000 });
		await this.selectAutocompleteOption(this.passengerSelect, this.passengerSearchInput, name, 'passenger');
	}

	private async openPlaceDropdown(place: Locator): Promise<void> {
		const dropdown = place.locator('select-dropdown');
		await place.locator('.toggle').click({ force: true });
		await this.page.waitForTimeout(500);
		await dropdown.first().waitFor({ state: 'attached', timeout: 10_000 });
		await this.page.waitForTimeout(500);
	}

	private async pickFirstPlaceOption(place: Locator, avoidText?: string): Promise<boolean> {
		const options = place.locator('select-dropdown .options li');
		const count = await options.count();

		for (let index = 0; index < count; index += 1) {
			const option = options.nth(index);
			const text = normalizeText(await option.textContent());
			if (!isMeaningfulOptionText(text)) {
				continue;
			}
			if (avoidText && text.includes(normalizeText(avoidText))) {
				continue;
			}

			await option.click();
			await this.page.waitForTimeout(500);
			return true;
		}

		return false;
	}

	private async searchPlace(
		place: Locator,
		address: string,
		options: { keepExistingOnNoResults: boolean; avoidText?: string } = { keepExistingOnNoResults: false }
	): Promise<void> {
		const currentText = normalizeText(await place.textContent());
		const desiredText = normalizeText(address);

		if (currentText.includes(desiredText)) {
			return;
		}

		await this.openPlaceDropdown(place);

		const searchInput = place.locator('select-dropdown input').first();
		await searchInput.fill(address);
		await this.page.waitForTimeout(1_000);

		if (await this.pickFirstPlaceOption(place, options.avoidText)) {
			return;
		}

		if (options.keepExistingOnNoResults && currentText) {
			await this.page.keyboard.press('Escape');
			return;
		}

		await searchInput.fill('');
		await this.page.waitForTimeout(500);

		if (await this.pickFirstPlaceOption(place, options.avoidText)) {
			return;
		}

		throw new Error(`No place options found for "${address}"`);
	}

	async setOrigin(address: string): Promise<void> {
		await this.searchPlace(this.originSelect, address, { keepExistingOnNoResults: true });
	}

	async setDestination(address: string): Promise<void> {
		const avoidText = normalizeText(await this.originSelect.textContent());
		await this.searchPlace(this.destinationSelect, address, {
			avoidText,
			keepExistingOnNoResults: false
		});
	}

	private async waitForStripeFrame(component: StripeComponentName, timeoutMs = 15_000): Promise<Frame> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const frame = this.page.frames().find((candidate) => candidate.url().includes(`componentName=${component}`));
			if (frame) {
				return frame;
			}

			await this.page.waitForTimeout(250);
		}

		throw new Error(`Stripe frame not found: ${component}`);
	}

	async selectCardByLast4(last4: string): Promise<void> {
		const cardNumber = STRIPE_CARD_BY_LAST4[last4];
		if (!cardNumber) {
			throw new Error(`Unknown Stripe test card last4: ${last4}`);
		}

		await this.paymentMethodSelector.click();
		const preauthOption = this.page.locator('#add_travel_payment_methods select-dropdown .options li').filter({
			hasText: 'Preautorizada',
		}).first();
		await preauthOption.waitFor({ state: 'visible', timeout: 10_000 });
		await preauthOption.click();
		await this.page.waitForTimeout(2_500);

		const numberFrame = await this.waitForStripeFrame('cardNumber');
		const expiryFrame = await this.waitForStripeFrame('cardExpiry');
		const cvcFrame = await this.waitForStripeFrame('cardCvc');

		await numberFrame.locator('input[name="cardnumber"]').fill(cardNumber);
		await expiryFrame.locator('input[name="exp-date"]').fill(STRIPE_EXPIRY);
		await cvcFrame.locator('input[name="cvc"]').fill(STRIPE_CVC);
		await this.cardOwnerNameInput.fill(STRIPE_CARD_HOLDER_NAME);
		await this.billingZipInput.fill(STRIPE_BILLING_ZIP);
		await this.assertPaymentMethodPreauthorizedSelected();
	}

	async submit(): Promise<void> {
		if (await this.validateCardButton.isVisible().catch(() => false) && await this.validateCardButton.isEnabled().catch(() => false)) {
			await this.validateCardButton.click();
			await this.page.waitForTimeout(1_000);
			await this.assertPaymentMethodPreauthorizedSelected();
		}

		const deadline = Date.now() + TRAVEL_SUBMIT_TIMEOUT;
		let vehicleSelectionOpened = false;

		while (Date.now() < deadline) {
			if (await this.page.locator('iframe[src*="three-ds-2-challenge"]').isVisible().catch(() => false)) {
				return;
			}

			if (!vehicleSelectionOpened && await this.vehicleButton.isVisible().catch(() => false) && await this.vehicleButton.isEnabled().catch(() => false)) {
				await this.vehicleButton.click();
				vehicleSelectionOpened = true;
				await this.page.waitForTimeout(1_000);
				continue;
			}

			if (await this.submitButton.isVisible().catch(() => false) && await this.submitButton.isEnabled().catch(() => false)) {
				await this.submitButton.click();
				return;
			}

			await this.page.waitForTimeout(1_000);
		}

		throw new Error('No enabled submit button found on travel form');
	}

	async clickSelectVehicle(): Promise<void> {
		await this.waitForEnabledButton(this.vehicleButton);
		await this.waitForLoadingOverlayToDisappear();
		await this.vehicleButton.click({ force: true });
		await this.page.waitForTimeout(5_000);
	}

	async clickSendService(): Promise<void> {
		await this.waitForEnabledButton(this.submitButton);
		await this.waitForLoadingOverlayToDisappear();
		await this.submitButton.click({ force: true });
	}

	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		const clientName = opts.client ?? opts.passenger;
		// En carrier, algunos clientes auto-completan el pasajero y otros requieren pax distinto.
		await this.selectClient(clientName);

		if (normalizeText(opts.passenger) !== normalizeText(clientName)) {
			await this.selectPassenger(opts.passenger);
		} else {
			await expect(this.passengerSelect).toContainText(clientName, { timeout: 10_000 });
		}

		await this.assertDefaultServiceTypeRegular();
		await this.setOrigin(opts.origin);
		await this.setDestination(opts.destination);
		await this.selectCardByLast4(opts.cardLast4);
	}

	async assertDefaultServiceTypeRegular(): Promise<void> {
		await expect(this.serviceTypeValue).toContainText('Regular', { timeout: 10_000 });
	}

	async assertPaymentMethodPreauthorizedSelected(): Promise<void> {
		await expect(this.paymentMethodValue).toContainText('Tarjeta de Crédito - Preautorizada', { timeout: 10_000 });
	}
}
