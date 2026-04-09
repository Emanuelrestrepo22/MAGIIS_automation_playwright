import { expect, type Frame, type Locator, type Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
import {
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
	STRIPE_CVC,
	STRIPE_EXPIRY,
	STRIPE_TEST_CARDS
} from '../../features/gateway-pg/data/stripeTestData';

export type NewTravelFormInput = {
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
};

type StripeComponentName = 'cardNumber' | 'cardExpiry' | 'cardCvc';
type TariffType = 'Distancia' | 'ADisposicion';
type PaymentMethod = 'Preautorizada' | 'CuentaCorriente' | 'Efectivo';
type TipType = 'SIN_PROPINA' | 'PCT_10' | 'PCT_15' | 'PCT_20' | 'CUSTOM';

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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
	protected readonly tariffTypeButtons: Locator;
	protected readonly rentalHoursInput: Locator;
	protected readonly serviceTypeSelect: Locator;
	protected readonly areaSelect: Locator;
	protected readonly waitTimeButton: Locator;
	protected readonly frequentDestButton: Locator;
	protected readonly notesConfigButton: Locator;
	protected readonly generalNoteInput: Locator;
	protected readonly privateNoteInput: Locator;
	protected readonly modalAcceptButton: Locator;
	protected readonly addStopButton: Locator;
	protected readonly manualPriceInput: Locator;
	protected readonly addExtraCostButton: Locator;
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
		this.tariffTypeButtons = page.locator('.btn-tariff');
		this.rentalHoursInput = page.locator('#add_rental_hours');
		this.serviceTypeSelect = page.locator('#serviceTypeId');
		this.areaSelect = page.locator('#areaId');
		this.waitTimeButton = page.locator('.btn.btn-primary.rounded-btn.btn-wait-time').first();
		this.frequentDestButton = page.locator('.btn.btn-primary.rounded-btn.btn-freq-dest');
		this.notesConfigButton = page.getByRole('button', { name: 'Configurar', exact: true });
		this.generalNoteInput = page.getByRole('textbox', { name: 'General' });
		this.privateNoteInput = page.getByRole('textbox', { name: 'Nota privada' });
		this.modalAcceptButton = page.getByRole('button', { name: 'Aceptar' });
		// TODO: selector tomado del recorder; revisar si cambia la estructura de múltiples destinos.
		this.addStopButton = page.locator('.multiple-destination-container > div > div:nth-child(3) > .btn > .fa');
		this.manualPriceInput = page.getByRole('spinbutton');
		this.addExtraCostButton = page.locator('.plus-button > .fa');
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

	private async openDropdown(select: Locator, timeout = 10_000): Promise<void> {
		const trigger = select.locator('.below > .single > .value, .below > .single > .placeholder, .below').first();
		await expect(trigger).toBeVisible({ timeout });
		await trigger.click({ force: true });

		const dropdown = select.locator('select-dropdown').first();
		await dropdown.waitFor({ state: 'attached', timeout });
	}

	private async chooseDropdownOption(select: Locator, optionText: string, timeout = 10_000): Promise<void> {
		await this.openDropdown(select, timeout);
		const option = select.locator('select-dropdown .options li').filter({ hasText: optionText }).first();
		await expect(option).toBeVisible({ timeout });
		await option.click();
	}

	private async clickButtonByName(name: string | RegExp, timeout = 10_000): Promise<void> {
		const button = this.page.getByRole('button', { name });
		await expect(button).toBeVisible({ timeout });
		await button.click();
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

	/** Selecciona el tipo de servicio desde el dropdown del formulario. */
	async selectServiceType(name: string): Promise<void> {
		await this.chooseDropdownOption(this.serviceTypeSelect, name);
		await expect(this.serviceTypeValue).toContainText(name, { timeout: 10_000 });
	}

	/** Selecciona Distancia o A Disposición y espera los campos dependientes. */
	async selectTariffType(type: TariffType): Promise<void> {
		const label = type === 'Distancia' ? 'Distancia' : 'A Disposición';
		const button = this.tariffTypeButtons.filter({ hasText: label }).first();
		await expect(button).toBeVisible({ timeout: 10_000 });
		await button.click();

		if (type === 'ADisposicion') {
			await expect(this.rentalHoursInput).toBeVisible({ timeout: 10_000 });
		}
	}

	/** Completa las horas de alquiler para la tarifa A Disposición. */
	async setRentalHours(hours: number): Promise<void> {
		await expect(this.rentalHoursInput).toBeVisible({ timeout: 10_000 });
		await this.rentalHoursInput.fill(String(hours));
	}

	/** Selecciona Preautorizada, Cuenta Corriente o Efectivo. */
	async selectPaymentMethod(method: PaymentMethod): Promise<void> {
		const optionText =
			method === 'Preautorizada'
				? 'Preautorizada'
				: method === 'CuentaCorriente'
					? 'Cuenta Corriente'
					: 'Efectivo';

		await this.chooseDropdownOption(this.paymentMethodSelector, optionText);

		if (method === 'Preautorizada') {
			await expect(this.paymentMethodValue).toContainText(/Preautorizada/i, { timeout: 10_000 });
		} else {
			await expect(this.paymentMethodValue).toContainText(optionText, { timeout: 10_000 });
		}
	}

	/** Activa o desactiva el modo privado/particular del viaje. */
	async setPrivateTrip(isPrivate: boolean): Promise<void> {
		// TODO: el recorder mostró dos radios; se usa el orden DOM capturado hasta validar el significado exacto.
		const labels = this.page.locator('.round-inline > div > .round > label');
		await expect(labels.first()).toBeVisible({ timeout: 10_000 });
		const target = isPrivate || (await labels.count()) < 2 ? labels.first() : labels.nth(1);
		await target.click();
	}

	/** Agrega una nueva parada y selecciona la primera coincidencia de dirección. */
	async addStop(address: string): Promise<void> {
		await expect(this.addStopButton).toBeVisible({ timeout: 10_000 });
		await this.addStopButton.click({ force: true });

		// TODO: el recorder muestra el último container como la nueva parada; validar si el DOM cambia.
		const stopContainer = this.page.locator('.multiple-destination-container').last();
		const addressInput = stopContainer.getByRole('textbox', { name: 'Ingrese una dirección' }).first();
		await expect(addressInput).toBeVisible({ timeout: 10_000 });
		await addressInput.fill(address);

		const option = stopContainer.getByRole('listitem').filter({ hasText: address }).first();
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}

	/** Elimina la parada extra ubicada en la posición solicitada. */
	async removeStop(index: number): Promise<void> {
		// TODO: el recorder usó nth() sobre el texto "✕"; revisar si el DOM expone un selector más estable.
		const removeButtons = this.page.locator('.multiple-destination-container').getByText('✕');
		const target = removeButtons.nth(index);
		await expect(target).toBeVisible({ timeout: 10_000 });
		await target.click();
	}

	/** Ajusta el tiempo de espera de una parada e incluye instrucciones opcionales. */
	async setWaitTime(stopIndex: number, instructions?: string): Promise<void> {
		// TODO: el recorder usa índice para el botón de espera; validar si hay selector por stop.
		const waitButtons = this.page.locator('.btn.btn-primary.rounded-btn.btn-wait-time');
		const button = stopIndex === 0 ? this.waitTimeButton : waitButtons.nth(stopIndex);
		await expect(button).toBeVisible({ timeout: 10_000 });
		await button.click();

		const timePickerButton = this.page.locator('.timepicker-group > button').first();
		await expect(timePickerButton).toBeVisible({ timeout: 10_000 });
		await timePickerButton.click();

		if (instructions) {
			const instructionsInput = this.page.getByRole('textbox', { name: 'Instrucciones' });
			await expect(instructionsInput).toBeVisible({ timeout: 10_000 });
			await instructionsInput.fill(instructions);
		}

		await this.modalAcceptButton.click();
		await expect(this.page.getByRole('textbox', { name: 'Instrucciones' })).toBeHidden({ timeout: 10_000 });
	}

	/** Abre el modal de notas del viaje. */
	async openNotesModal(): Promise<void> {
		await this.notesConfigButton.click();
		await expect(this.generalNoteInput).toBeVisible({ timeout: 10_000 });
	}

	/** Escribe la nota general del viaje dentro del modal. */
	async setGeneralNote(note: string): Promise<void> {
		await expect(this.generalNoteInput).toBeVisible({ timeout: 10_000 });
		await this.generalNoteInput.fill(note);
	}

	/** Escribe la nota de una parada específica dentro del modal. */
	async setStopNote(stopLabel: string, note: string): Promise<void> {
		const textbox = this.page.getByRole('textbox', { name: new RegExp(escapeRegExp(stopLabel), 'i') });
		await expect(textbox).toBeVisible({ timeout: 10_000 });
		await textbox.fill(note);
	}

	/** Escribe la nota privada del viaje dentro del modal. */
	async setPrivateNote(note: string): Promise<void> {
		await expect(this.privateNoteInput).toBeVisible({ timeout: 10_000 });
		await this.privateNoteInput.fill(note);
	}

	/** Cierra el modal de notas con Aceptar. */
	async closeNotesModal(): Promise<void> {
		await this.modalAcceptButton.click();
		await expect(this.generalNoteInput).toBeHidden({ timeout: 10_000 });
	}

	/** Selecciona un área desde el dropdown del formulario. */
	async selectArea(areaName: string): Promise<void> {
		await this.chooseDropdownOption(this.areaSelect, areaName);
	}

	/** Abre destinos frecuentes y selecciona el destino indicado. */
	async selectFrequentDestination(name: string): Promise<void> {
		await this.frequentDestButton.click();
		const cell = this.page.getByRole('cell', { name: new RegExp(escapeRegExp(name), 'i') }).first();
		await expect(cell).toBeVisible({ timeout: 10_000 });
		await cell.click();

		const selectButton = this.page.getByRole('button', { name: 'Seleccionar', exact: true });
		await expect(selectButton).toBeVisible({ timeout: 10_000 });
		await selectButton.click();
	}

	/** Selecciona una hora de retiro o el valor Ahora. */
	async setPickupTime(option: 'Ahora' | string): Promise<void> {
		if (option === 'Ahora') {
			await this.page.getByText('Ahora').first().click();
			return;
		}

		const timeOption = this.page.locator('#id_tab_add_travel').getByText(option).first();
		await expect(timeOption).toBeVisible({ timeout: 10_000 });
		await timeOption.click();
	}

	/** Selecciona una propina estándar o personalizada. */
	async selectTip(type: TipType, amount?: number): Promise<void> {
		const labelByType: Record<Exclude<TipType, 'CUSTOM'>, string> = {
			SIN_PROPINA: 'SIN PROPINA',
			PCT_10: '% 10',
			PCT_15: '% 15',
			PCT_20: '% 20',
		};

		if (type === 'CUSTOM') {
			if (amount === undefined) {
				throw new Error('CUSTOM tip requires an amount');
			}

			// TODO: el recorder usa el textbox nth(1); validar si el formulario expone un nombre estable.
			const customTipInput = this.page.getByRole('textbox').nth(1);
			await expect(customTipInput).toBeVisible({ timeout: 10_000 });
			await customTipInput.fill(String(amount));
			return;
		}

		await this.clickButtonByName(labelByType[type]);
	}

	/** Completa el monto manual del viaje. */
	async setManualPrice(amount: number): Promise<void> {
		await expect(this.manualPriceInput).toBeVisible({ timeout: 10_000 });
		await this.manualPriceInput.fill(String(amount));
	}

	/** Agrega un costo extra y confirma el modal. */
	async addExtraCost(costType: string, amount?: number): Promise<void> {
		await this.addExtraCostButton.click();

		const costOption = this.page.getByRole('listitem').filter({ hasText: costType }).first();
		await expect(costOption).toBeVisible({ timeout: 10_000 });
		await costOption.click();

		if (amount !== undefined) {
			// TODO: el recorder mostró un spinbutton reutilizado para el costo; validar si se separa en otro campo.
			await expect(this.manualPriceInput).toBeVisible({ timeout: 10_000 });
			await this.manualPriceInput.fill(String(amount));
		}

		await this.modalAcceptButton.click();
	}

	/** Abre el selector de vehículos y elige una tarjeta por tipo. */
	async selectVehicleType(type: string): Promise<void> {
		await this.clickSelectVehicle();

		// TODO: el recorder resuelve por texto del card; confirmar si la lista requiere un selector por clase.
		const card = this.page.locator('li').filter({ hasText: new RegExp(escapeRegExp(type), 'i') }).locator('.vehicle-img').first();
		await expect(card).toBeVisible({ timeout: 15_000 });
		await card.click();
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
