import { expect, type Frame, type Locator, type Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
// BL-024 mejora continua: data Stripe viene del fixture canónico, no del legacy.
// El POM sigue acoplado a Stripe Elements (deuda TIER A — BL-038 Strategy Pattern),
// pero al menos las constantes y mappings centralizados en el fixture.
import { STRIPE_BILLING_ZIP, STRIPE_CARD_HOLDER_NAME, STRIPE_CVC, STRIPE_EXPIRY } from '../../fixtures/gateways/stripe/cards';
import { resolveStripeCardByLast4 } from '../../fixtures/gateways/stripe/card-by-last4';
import { BasePage } from '../shared/BasePage';

export type NewTravelFormInput = {
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
	/** Si true, intenta seleccionar una tarjeta guardada del dropdown antes de vincular nueva */
	preferSavedCard?: boolean;
	/**
	 * Si true, llena el formulario Stripe pero NO hace click en "Validar" automáticamente.
	 * Útil para tests UNHAPPY con cards de rechazo conocidas (9995, 1629, etc) donde
	 * el caller quiere controlar el flujo de validación con `clickValidateCardAllowingReject()`.
	 */
	skipCardValidation?: boolean;
	/**
	 * Si true, indica que se espera que Stripe decline la tarjeta durante la validación.
	 * `fillMinimum` usará `clickValidateCardAllowingReject()` en lugar de `clickValidateCard()`,
	 * evitando el throw por timeout cuando el botón "Validar" nunca se habilita o la card
	 * es rechazada post-click. Aplica a tests UNHAPPY como TC14 (0002 generic_decline).
	 */
	expectDecline?: boolean;
};

/**
 * Resultado de `clickValidateCardAllowingReject` — contempla escenarios HAPPY y UNHAPPY.
 * - `success=true`: botón habilitó + click OK + método "Preautorizada" confirmado.
 * - `success=false`: card rechazada por Stripe (insufficient funds, declined, etc).
 *   `errorMessage` captura el texto mostrado al usuario (ej. "Your card has insufficient funds. Try a different card.").
 */
export type ValidateCardResult = {
	success: boolean;
	errorMessage: string | null;
};

type StripeComponentName = 'cardNumber' | 'cardExpiry' | 'cardCvc';
type TariffType = 'Distancia' | 'ADisposicion';
type PaymentMethod = 'Preautorizada' | 'CuentaCorriente' | 'Efectivo' | 'CargoABordo';
type TipType = 'SIN_PROPINA' | 'PCT_10' | 'PCT_15' | 'PCT_20' | 'CUSTOM';

// BL-024 mejora continua (2026-05-13): el mapping `last4 → cardNumber` fue
// extraído al fixture canónico `tests/fixtures/gateways/stripe/card-by-last4.ts`.
// Si necesitás agregar una card Stripe nueva, hacelo en `cards.ts` (registry
// principal) — el mapping se reconstruye automáticamente desde ahí.

const TRAVEL_SUBMIT_TIMEOUT = 60_000;

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesSearchText(candidate: string, searchText: string): boolean {
	const candidateText = normalizeText(candidate);
	const searchTokens = normalizeText(searchText)
		.split(' ')
		.map(token => token.trim())
		.filter(Boolean);

	return searchTokens.every(token => candidateText.includes(token));
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
export abstract class NewTravelPageBase extends BasePage {
	protected readonly clientSelect: Locator;
	protected readonly clientSearchInput: Locator;
	protected readonly passengerSelect: Locator;
	protected readonly passengerSearchInput: Locator;
	protected readonly guestPassengerRadio: Locator;
	protected readonly guestPassengerNameInput: Locator;
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
	protected readonly cardValidationErrorText: Locator;

	constructor(page: Page) {
		super(page);
		this.clientSelect = page.locator('#clientSelect');
		this.clientSearchInput = page.locator('#clientSelect input[placeholder="Usuario a Buscar"]');
		this.passengerSelect = page.locator('#passenger');
		this.passengerSearchInput = page.locator('#passenger input[placeholder="Usuario a Buscar"]');
		this.guestPassengerRadio = page.getByRole('radio', { name: 'PAX invitado' });
		this.guestPassengerNameInput = page.getByRole('textbox', { name: 'Nombre*' });
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
		// Mensaje de error de Stripe que aparece dentro del contenedor de validación de tarjeta
		// cuando el SetupIntent es rechazado (ej: card 9995 "insufficient funds", 1629 declined after 3DS).
		// Selector confirmado en validación manual:
		//   #id_tab_add_travel > app-credit-card-payment-data-validate > div > div > div.w-100.text-right.error-text.ng-star-inserted
		this.cardValidationErrorText = page.locator(
			'app-credit-card-payment-data-validate .error-text.ng-star-inserted',
		);
	}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/create`);
		await this.ensureLoaded();
	}

	async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.clientSelect.waitFor({ state: 'visible', timeout });
	}

	private async selectAutocompleteOption(select: Locator, searchInput: Locator, name: string, roleLabel: string): Promise<void> {
		const searchValue = name.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
		const firstToken = searchValue.split(' ').find(token => token.trim().length > 0) ?? searchValue;
		const fallbackQueries = Array.from(new Set([searchValue, firstToken, firstToken.slice(0, 4), firstToken.slice(0, 3), name.trim()].filter(Boolean)));
		const dropdown = select.locator('select-dropdown').first();
		const options = select.locator('select-dropdown .options li');

		await select.locator('.below').click({ force: true });
		// Migrado tier3: waitForTimeout(400) eliminado — dropdown.waitFor({ state: 'attached' }) es el criterio determinista
		await dropdown.waitFor({ state: 'attached', timeout: 10_000 });

		for (const query of fallbackQueries) {
			await searchInput.fill(query);
			// BL-012 Fase 1: debounce Angular — reemplaza waitForTimeout(1_000) con polling DOM
			// sobre la cuenta de opciones del dropdown. Fail-fast si Angular no renderiza nada.
			await this.waitForAutocompleteOptionsReady(select, { timeoutMs: 5_000 });

			const deadline = Date.now() + 15_000;
			while (Date.now() < deadline) {
				const count = await options.count();

				for (let index = 0; index < count; index += 1) {
					const option = options.nth(index);
					const text = await option.textContent().catch(() => '');

					if (!matchesSearchText(text ?? '', name)) {
						continue;
					}

					await option.click();
					// NOTE(tier3-kept): post-click Angular state update — no hay elemento verificable en este scope antes del return
					await this.page.waitForTimeout(500);
					return;
				}

				// NOTE(tier3-kept): polling loop con deadline propio — espera que aparezcan más opciones
				await this.page.waitForTimeout(500);
			}
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

	/** Selecciona PAX invitado y completa el nombre visible. */
	async selectGuestPassenger(name: string): Promise<void> {
		await expect(this.guestPassengerRadio).toBeVisible({ timeout: 10_000 });
		await this.guestPassengerRadio.click();
		await expect(this.guestPassengerNameInput).toBeVisible({ timeout: 10_000 });
		await this.guestPassengerNameInput.fill(name);
	}

	private async openPlaceDropdown(place: Locator): Promise<Locator> {
		const searchInput = place.getByRole('textbox', { name: 'Ingrese una dirección' }).first();
		const clickTargets = [place.locator('.search-container-input > .bootstrap > .below > .single > .placeholder').first(), place.locator('.search-container-input').first(), place.locator('.placeholder').first(), place.locator('.toggle').first()];

		for (const target of clickTargets) {
			if (!(await target.isVisible().catch(() => false))) {
				continue;
			}

			await target.click({ force: true });
			// Migrado tier3: waitForTimeout(500) → isVisible con timeout; searchInput.waitFor debajo es el criterio final
			if (await searchInput.isVisible({ timeout: 500 }).catch(() => false)) {
				break;
			}
		}

		await searchInput.waitFor({ state: 'visible', timeout: 10_000 });
		return searchInput;
	}

	private async pickFirstPlaceOption(dropdown: Locator, avoidText?: string): Promise<boolean> {
		const options = dropdown.locator('.options li');
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
			// NOTE(tier3-kept): post-click Angular — el campo actualiza async; verificable solo en el caller
			await this.page.waitForTimeout(500);
			return true;
		}

		return false;
	}

	/**
	 * Clickea una opción de dirección y VERIFICA el commit (la lista de opciones se cierra).
	 * Reintenta el click 1 vez si no confirmó. Reemplaza el click fire-and-forget
	 * (`click()` + `waitForTimeout`) que en headless dejaba el dropdown abierto y el valor sin
	 * commitear, bloqueando el campo siguiente (origen→destino). Ver scope release 17080.
	 */
	private async commitPlaceOption(place: Locator, option: Locator): Promise<boolean> {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			if (!(await option.isVisible().catch(() => false))) {
				return false;
			}
			await option.click();
			const committed = await expect
				.poll(async () => place.getByRole('listitem').count(), { timeout: 3_000 })
				.toBe(0)
				.then(() => true)
				.catch(() => false);
			if (committed) {
				return true;
			}
		}
		return false;
	}

	private async searchPlace(place: Locator, address: string, options: { keepExistingOnNoResults: boolean; avoidText?: string } = { keepExistingOnNoResults: false }): Promise<void> {
		const currentText = normalizeText(await place.textContent());
		const desiredText = normalizeText(address);
		const queryText = address.split(',')[0].trim() || address;

		if (currentText.includes(desiredText)) {
			return;
		}

		const searchInput = await this.openPlaceDropdown(place);
		await searchInput.fill(queryText);
		// BL-012 Fase 1: debounce Angular autocomplete de direcciones — reemplaza waitForTimeout(1_000)
		// con polling DOM determinista sobre opciones renderizadas.
		await this.waitForAutocompleteOptionsReady(place, { timeoutMs: 4_000 });

		const suggestionText = address.split(',').slice(0, -1).join(',').trim() || address;
		const suggestion = place.getByRole('listitem').filter({ hasText: new RegExp(escapeRegExp(suggestionText), 'i') }).first();
		const fallbackOption = place.getByRole('listitem').filter({ hasText: /\S/ }).first();

		if (await this.commitPlaceOption(place, suggestion)) {
			return;
		}

		if (await this.commitPlaceOption(place, fallbackOption)) {
			return;
		}

		if (options.keepExistingOnNoResults && currentText) {
			await this.page.keyboard.press('Escape');
			return;
		}

		await searchInput.fill('');
		// NOTE(tier3-kept): clear field Angular — sin evento de confirmación de "campo vacío"
		await this.page.waitForTimeout(500);

		await searchInput.fill(queryText);
		// BL-012 Fase 1: debounce Angular retry path — mismo patrón determinista que la primera pasada.
		await this.waitForAutocompleteOptionsReady(place, { timeoutMs: 4_000 });

		if (await this.commitPlaceOption(place, suggestion)) {
			return;
		}

		if (await this.commitPlaceOption(place, fallbackOption)) {
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

	/** Selecciona Preautorizada, Cuenta Corriente, Efectivo o CargoABordo. */
	async selectPaymentMethod(method: PaymentMethod): Promise<void> {
		const optionText = method === 'Preautorizada' ? 'Preautorizada' : method === 'CuentaCorriente' ? 'Cuenta Corriente' : method === 'CargoABordo' ? 'Tarjeta de Crédito - Cargo' : 'Efectivo';

		await this.chooseDropdownOption(this.paymentMethodSelector, optionText);

		if (method === 'Preautorizada') {
			await expect(this.paymentMethodValue).toContainText(/Preautorizada/i, { timeout: 10_000 });
		} else if (method === 'CargoABordo') {
			await expect(this.paymentMethodValue).toContainText(/Cargo a Bordo/i, { timeout: 10_000 });
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
			PCT_20: '% 20'
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
		const card = this.page
			.locator('li')
			.filter({ hasText: new RegExp(escapeRegExp(type), 'i') })
			.locator('.vehicle-img')
			.first();
		await expect(card).toBeVisible({ timeout: 15_000 });
		await card.click();
	}

	private async waitForStripeFrame(component: StripeComponentName, timeoutMs = 15_000): Promise<Frame> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const frame = this.page.frames().find(candidate => candidate.url().includes(`componentName=${component}`));
			if (frame) {
				return frame;
			}

			// NOTE(tier3-kept): polling loop propio — Stripe iframe no emite evento DOM de aparición
			await this.page.waitForTimeout(250);
		}

		throw new Error(`Stripe frame not found: ${component}`);
	}

	/**
	 * Completa los datos de la tarjeta preautorizada sin disparar validación.
	 *
	 * NOTA deuda TIER A (BL-038): este método está atado a Stripe Elements
	 * (3 iframes + constantes STRIPE_*). Cuando entre Authorize (que usa
	 * Accept.js o form propio), hace falta Strategy Pattern para que
	 * `fillPreauthorizedCard` delegue a una `CardFormStrategy` específica
	 * del gateway activo.
	 */
	async fillPreauthorizedCard(last4: string): Promise<void> {
		// Resolución del cardNumber centralizada en el fixture Stripe canónico.
		const cardNumber = resolveStripeCardByLast4(last4);

		await this.paymentMethodSelector.click();
		const preauthOption = this.page
			.locator('#add_travel_payment_methods select-dropdown .options li')
			.filter({
				hasText: 'Preautorizada'
			})
			.first();
		await preauthOption.waitFor({ state: 'visible', timeout: 10_000 });
		await preauthOption.click();
		// NOTE(tier3-kept): Stripe monta 3 iframes (cardNumber/cardExpiry/cardCvc) sin evento DOM de "ready"; reducir causa waitForStripeFrame timeout
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

	async selectCardByLast4(last4: string, skipValidate = false, allowDecline = false): Promise<void> {
		await this.fillPreauthorizedCard(last4);
		// Los tests UNHAPPY con cards de rechazo conocidas usan skipValidate=true para controlar
		// la validación con `clickValidateCardAllowingReject()` y capturar el error de Stripe.
		// allowDecline=true usa `clickValidateCardAllowingReject()` internamente — no lanza timeout
		// cuando el botón "Validar" nunca habilita ni cuando Stripe rechaza post-click (ej: TC14 card 0002).
		if (!skipValidate) {
			if (allowDecline) {
				await this.clickValidateCardAllowingReject();
			} else {
				await this.clickValidateCard();
			}
		}
	}

	/**
	 * Selecciona una tarjeta ya guardada desde el dropdown de métodos de pago,
	 * sin abrir el formulario Stripe ni ingresar datos nuevos.
	 *
	 * Evidencia test-20.spec.ts (líneas 26-27):
	 *   - Abre el dropdown clickeando .value > .data-with-icon-col dentro de #add_travel_payment_methods
	 *   - Selecciona la tarjeta resaltada (.ng-star-inserted.highlighted > .data-with-icon-col)
	 *
	 * Usar cuando el colaborador/pasajero ya tiene una tarjeta guardada y el test
	 * debe validar selección de tarjeta existente (TC003, TC004 contractor).
	 */
	async selectSavedCard(): Promise<void> {
		const dropdownTrigger = this.paymentMethodSelector.locator('.below > .single > .value > .data-with-icon-col').first();
		await expect(dropdownTrigger).toBeVisible({ timeout: 10_000 });
		await dropdownTrigger.click();

		// La tarjeta existente aparece resaltada (.highlighted) en el dropdown.
		const savedCardOption = this.page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
		await expect(savedCardOption).toBeVisible({ timeout: 10_000 });
		await savedCardOption.click();

		// Debería mostrar la tarjeta seleccionada en el campo de pago sin abrir Stripe iframes.
		await expect(this.paymentMethodValue).toContainText('Tarjeta de Crédito - Preautorizada', { timeout: 10_000 });
	}

	/**
	 * Selecciona una tarjeta guardada que contenga los últimos 4 dígitos indicados.
	 *
	 * Flujo (evidencia test-22.spec.ts + selectores del user):
	 *   1. Click en el trigger del dropdown de pago para abrir las opciones
	 *   2. Buscar dentro de las opciones (li) la que contenga el texto con last4
	 *   3. Click en esa opción
	 *
	 * Selectores confirmados por el user:
	 *   - Trigger: #add_travel_payment_methods > div > div > div.value.ng-star-inserted > div
	 *   - Opciones: #add_travel_payment_methods > select-dropdown > div > div.options > ul > li
	 *   - Cada li contiene texto con los últimos 4 dígitos de la tarjeta
	 *
	 * @returns true si encontró y seleccionó la tarjeta; false si no existe en el dropdown
	 */
	async selectSavedCardByLast4(last4: string): Promise<boolean> {
		// Abrir el dropdown de métodos de pago.
		// Intentar el trigger del recording primero, luego fallback.
		const valueTrigger = this.paymentMethodSelector.locator(
			'div > div > div.value.ng-star-inserted > div',
		).first();
		const iconTrigger = this.paymentMethodSelector.locator(
			'.below > .single > .value > .data-with-icon-col',
		).first();

		if (await valueTrigger.isVisible().catch(() => false)) {
			await valueTrigger.click();
		} else if (await iconTrigger.isVisible().catch(() => false)) {
			await iconTrigger.click();
		} else {
			// Último recurso: click directo en el selector
			await this.paymentMethodSelector.click();
		}

		// Migrado tier3: waitForTimeout(500) eliminado — optionsList.first().waitFor es el criterio determinista

		// Buscar la opción con los últimos 4 dígitos dentro del dropdown de opciones
		const optionsList = this.paymentMethodSelector.locator(
			'select-dropdown div.options ul li',
		);
		await optionsList.first().waitFor({ state: 'visible', timeout: 10_000 });

		const count = await optionsList.count();
		for (let i = 0; i < count; i++) {
			const optionText = (await optionsList.nth(i).textContent()) ?? '';
			if (optionText.includes(last4)) {
				await optionsList.nth(i).click();
				// NOTE(tier3-kept): breve estabilización post-select Angular — valor de campo actualiza async sin señal observable en este scope
				await this.page.waitForTimeout(300);
				return true;
			}
		}

		// No se encontró la tarjeta — cerrar dropdown haciendo click fuera
		await this.page.keyboard.press('Escape');
		return false;
	}

	/**
	 * Selección inteligente de tarjeta: usa tarjeta guardada si existe,
	 * o vincula una nueva vía Stripe iframe si no.
	 *
	 * @param last4 Últimos 4 dígitos de la tarjeta requerida
	 * @param preferSaved Si true (default), intenta primero la tarjeta guardada
	 */
	async selectCardSmart(last4: string, preferSaved = true): Promise<void> {
		if (preferSaved) {
			const selected = await this.selectSavedCardByLast4(last4);
			if (selected) return;
		}
		// Fallback: vincular nueva tarjeta vía Stripe iframe
		await this.selectCardByLast4(last4);
	}

	async submit(): Promise<void> {
		await this.clickValidateCardIfAvailable();

		const deadline = Date.now() + TRAVEL_SUBMIT_TIMEOUT;
		let vehicleSelectionOpened = false;

		while (Date.now() < deadline) {
			if (
				await this.page
					.locator('iframe[src*="three-ds-2-challenge"]')
					.isVisible()
					.catch(() => false)
			) {
				return;
			}

			if (!vehicleSelectionOpened && (await this.vehicleButton.isVisible().catch(() => false)) && (await this.vehicleButton.isEnabled().catch(() => false))) {
				await this.vehicleButton.click();
				vehicleSelectionOpened = true;
				// NOTE(tier3-kept): dentro de loop submit — espera que submitButton aparezca tras abrir selector vehículo; reemplazar rompería la lógica del loop
				await this.page.waitForTimeout(1_000);
				continue;
			}

			if ((await this.submitButton.isVisible().catch(() => false)) && (await this.submitButton.isEnabled().catch(() => false))) {
				await this.submitButton.click();
				return;
			}

			// NOTE(tier3-kept): polling loop submit con deadline — espera estado accionable (vehicle o submit); sin señal adicional
			await this.page.waitForTimeout(1_000);
		}

		throw new Error('No enabled submit button found on travel form');
	}

	private async clickValidateCardIfAvailable(): Promise<boolean> {
		const visible = await this.validateCardButton.isVisible().catch(() => false);
		const enabled = visible ? await this.validateCardButton.isEnabled().catch(() => false) : false;

		if (!visible || !enabled) {
			return false;
		}

		await this.waitForLoadingOverlayToDisappear();
		await this.validateCardButton.click({ force: true });
		// Migrado tier3: waitForTimeout(1_000) eliminado — assertPaymentMethodPreauthorizedSelected con timeout:10s cubre la espera
		await this.assertPaymentMethodPreauthorizedSelected();
		return true;
	}

	async clickValidateCard(): Promise<void> {
		await this.waitForEnabledButton(this.validateCardButton);
		await this.waitForLoadingOverlayToDisappear();
		await this.validateCardButton.click({ force: true });
		// Migrado tier3: waitForTimeout(1_000) eliminado — assertPaymentMethodPreauthorizedSelected con timeout:10s cubre la espera
		await this.assertPaymentMethodPreauthorizedSelected();
	}

	/**
	 * Variante de `clickValidateCard` que NO lanza timeout cuando Stripe rechaza la tarjeta.
	 * Pensada para tests UNHAPPY con cards de rechazo conocidas (9995, 1629, etc).
	 *
	 * Maneja tres escenarios observables:
	 *  1. Botón "Validar" nunca se habilita (Stripe rechaza durante el fill del form)
	 *     → retorna success=false + errorMessage del `.error-text` si apareció.
	 *  2. Botón habilita, click OK, pero aparece mensaje de error post-click
	 *     (ej: "Your card has insufficient funds. Try a different card.")
	 *     → retorna success=false + errorMessage.
	 *  3. Flujo normal: botón habilita, click OK, Preautorizada confirmada
	 *     → retorna success=true + errorMessage=null.
	 *
	 * @param timeout Tiempo máximo para esperar que el botón "Validar" se habilite (default 8s — fail-fast).
	 */
	async clickValidateCardAllowingReject(timeout = 8_000): Promise<ValidateCardResult> {
		const deadline = Date.now() + timeout;
		let enabled = false;
		while (Date.now() < deadline) {
			const visible = await this.validateCardButton.isVisible().catch(() => false);
			enabled = visible && (await this.validateCardButton.isEnabled().catch(() => false));
			if (enabled) break;
			const rejectedEarly = await this.cardValidationErrorText.isVisible().catch(() => false);
			if (rejectedEarly) {
				const msg = (await this.cardValidationErrorText.textContent().catch(() => null))?.trim() ?? null;
				return { success: false, errorMessage: msg };
			}
			// NOTE(tier3-kept): loop con condición compuesta enabled+errorText — no reemplazable con retryAsync
			await this.page.waitForTimeout(500);
		}

		if (!enabled) {
			// Timeout sin error visible: estado inconsistente — devolver failure para no bloquear al caller.
			return { success: false, errorMessage: 'Validar button never enabled and no Stripe error surfaced' };
		}

		await this.waitForLoadingOverlayToDisappear();
		await this.validateCardButton.click({ force: true });
		// NOTE(tier3-kept): margen para que Stripe devuelva error o confirme — cardValidationErrorText puede aparecer tarde
		await this.page.waitForTimeout(1_000);

		const errorVisible = await this.cardValidationErrorText.isVisible().catch(() => false);
		if (errorVisible) {
			const msg = (await this.cardValidationErrorText.textContent().catch(() => null))?.trim() ?? null;
			return { success: false, errorMessage: msg };
		}

		// Sin error: el flujo feliz debería terminar con "Preautorizada" seleccionado.
		const preauthOk = await this.paymentMethodValue
			.textContent()
			.then(text => /preautorizad/i.test(text ?? ''))
			.catch(() => false);
		return { success: preauthOk, errorMessage: preauthOk ? null : 'Preautorizada no confirmada tras click Validar' };
	}

	async waitForVehicleSelectionReady(timeout = 45_000): Promise<void> {
		await this.waitForEnabledButton(this.vehicleButton, timeout);
	}

	async clickSelectVehicle(): Promise<void> {
		await this.waitForEnabledButton(this.vehicleButton);
		await this.waitForLoadingOverlayToDisappear();
		await this.vehicleButton.click({ force: true });
		// NOTE(tier3-kept): lista de vehículos carga desde backend sin indicador DOM de "lista lista"; reducir causa flakiness TC01-TC14
		await this.page.waitForTimeout(5_000);
	}

	async clickSendService(): Promise<void> {
		await this.waitForEnabledButton(this.submitButton);
		await this.waitForLoadingOverlayToDisappear();
		await this.submitButton.click({ force: true });
	}

	/**
	 * ASIGNACIÓN MANUAL (ref: tests/test-5.spec.ts). En vez de "Send Service" (que despacha al
	 * pool de conductores con un timer de oferta), asigna el viaje DIRECTO a un conductor.
	 * Elimina el timer de oferta-candidato: el driver queda dueño del viaje.
	 *
	 * Flujo real (UI v1.72.8, verificado 2026-07-23):
	 *   1) "Enviar Manual"/"Send Manual" → navega a la PANTALLA "Gestión de Choferes / Asignar"
	 *      (una TABLA de conductores candidatos, NO un modal).
	 *   2) Click en el control ".driver-btn" ("Asignar"/"Assign") de la primera fila → asigna
	 *      DIRECTO y navega a "Gestión de Viajes" con el viaje en "Chofer Asignado".
	 * Ya NO hay tercer paso de confirmación: el antiguo `button "Asignar"` no existe. El
	 * `link "Asignar (1)"` que aparece luego es el tab de filtro de la grilla de viajes
	 * (post-asignación), no parte del flujo de asignación.
	 */
	async clickSendManualAndAssign(driverName?: string): Promise<void> {
		await this.waitForLoadingOverlayToDisappear();
		// Locale-robusto: el ambiente puede estar en ES ("Enviar Manual") o EN ("Send Manual").
		await this.page.getByRole('button', { name: /Enviar Manual|Send Manual/i }).click();
		// Fila del conductor: control ".driver-btn" (div estilizado como botón, sin role ARIA).
		const assignAction = this.page.locator('.driver-btn').filter({ hasText: /Asignar|Assign/i });
		await assignAction.first().waitFor({ state: 'visible', timeout: 15_000 });

		// Sin nombre: comportamiento histórico (primer candidato, el más cercano por TEA).
		if (!driverName) {
			await assignAction.first().click();
			await this.waitForLoadingOverlayToDisappear();
			return;
		}

		// Con nombre: asignación DETERMINISTA al conductor del device (E2E driver estable).
		// Busca el `.driver-btn` cuya fila (contenedor con un único `.driver-btn`) contiene
		// todos los tokens del nombre — robusto ante orden ("Apellido, Nombre") y clases dinámicas.
		const clicked = await this.page.evaluate((name: string) => {
			const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
			const btns = Array.from(document.querySelectorAll('.driver-btn'))
				.filter((b) => /asignar|assign/i.test(b.textContent || ''));
			for (const btn of btns) {
				let node: HTMLElement | null = btn.parentElement;
				let hops = 0;
				while (node && hops < 6) {
					const txt = (node.textContent || '').toLowerCase();
					if (node.querySelectorAll('.driver-btn').length === 1 && tokens.every((t) => txt.includes(t))) {
						(btn as HTMLElement).click();
						return true;
					}
					node = node.parentElement;
					hops += 1;
				}
			}
			return false;
		}, driverName);

		if (!clicked) {
			const dump = await this.page
				.evaluate(() => {
					const first = document.querySelector('.driver-btn');
					let node: HTMLElement | null = first as HTMLElement | null;
					for (let i = 0; i < 4 && node?.parentElement; i += 1) node = node.parentElement;
					return ((node ?? document.body) as HTMLElement).outerHTML.slice(0, 4000);
				})
				.catch(() => '<no-dump>');
			throw new Error(
				`[clickSendManualAndAssign] No se encontró el conductor "${driverName}" en los candidatos de asignación. `
					+ `Verificar que el driver del device esté en la flota del carrier y online. DOM candidatos:\n${dump}`,
			);
		}
		await this.waitForLoadingOverlayToDisappear();
	}

	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		const clientName = opts.client ?? opts.passenger;
		// En carrier, algunos clientes auto-completan el pasajero y otros requieren pax distinto.
		await this.selectClient(clientName);

		const passengerIsDisabled = await this.passengerSelect
			.getAttribute('ng-reflect-is-disabled')
			.then(value => value === 'true')
			.catch(() => false);

		if (!passengerIsDisabled && normalizeText(opts.passenger) !== normalizeText(clientName)) {
			await this.selectPassenger(opts.passenger);
		} else {
			await expect.poll(async () => matchesSearchText((await this.passengerSelect.textContent().catch(() => '')) ?? '', clientName), { timeout: 10_000 }).toBe(true);
		}

		await this.assertDefaultServiceTypeRegular();
		await this.setOrigin(opts.origin);
		await this.setDestination(opts.destination);

		if (opts.preferSavedCard) {
			await this.selectCardSmart(opts.cardLast4);
		} else {
			await this.selectCardByLast4(opts.cardLast4, opts.skipCardValidation ?? false, opts.expectDecline ?? false);
		}
	}

	async assertDefaultServiceTypeRegular(): Promise<void> {
		await expect(this.serviceTypeValue).toContainText('Regular', { timeout: 10_000 });
	}

	async assertPaymentMethodPreauthorizedSelected(): Promise<void> {
		await expect(this.paymentMethodValue).toContainText('Tarjeta de Crédito - Preautorizada', { timeout: 10_000 });
	}
}
