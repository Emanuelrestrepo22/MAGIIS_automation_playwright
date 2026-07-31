import { expect, type Locator, type Page } from '@playwright/test';
// Import directo del módulo concreto (no del barrel card-forms) para no arrastrar la
// factory `cardFormFor` (y su dependencia runtime en los adapters de gateway-pg) al POM legacy.
import { StripeElementsCardForm } from '@ui/carrier/card-forms/StripeElementsCardForm';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';
// BL-024 mejora continua: data Stripe viene del fixture canónico, no del legacy.
// El POM sigue acoplado a Stripe Elements (deuda TIER A — BL-038 Strategy Pattern),
// pero al menos las constantes y mappings centralizados en el fixture.
import {
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
	STRIPE_CVC,
	STRIPE_EXPIRY
} from '../../fixtures/gateways/stripe/cards';
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

type TariffType = 'Distancia' | 'ADisposicion';
// Exportado (S7): lo referencian los delegates KATA (`CarrierNewTravelPage.selectPaymentMethod`).
export type PaymentMethod = 'Preautorizada' | 'CuentaCorriente' | 'Efectivo' | 'CargoABordo';
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

/**
 * Tramo corto de una dirección (calle + número). El autocomplete de Google y la grilla devuelven
 * un sufijo de localidad distinto del string canónico de `JOURNEY_DEFAULTS` — p. ej.
 * "Cazadores 1987, Ciudad Autónoma…" vs "Cazadores 1987, Buenos Aires, Argentina" — así que
 * comparar el string completo daría falsos negativos.
 */
function shortAddress(address: string): string {
	return address.split(',')[0].trim();
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
		this.destinationSelect = page.locator(
			'div.form-group-address[formarrayname="destination"] app-input-search-place'
		);
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
			'app-credit-card-payment-data-validate .error-text.ng-star-inserted'
		);
	}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/create`);
		await this.ensureLoaded();
	}

	async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.clientSelect.waitFor({ state: 'visible', timeout });
	}

	private async selectAutocompleteOption(
		select: Locator,
		searchInput: Locator,
		name: string,
		roleLabel: string
	): Promise<void> {
		const searchValue = name.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
		const firstToken = searchValue.split(' ').find(token => token.trim().length > 0) ?? searchValue;
		const fallbackQueries = Array.from(
			new Set(
				[searchValue, firstToken, firstToken.slice(0, 4), firstToken.slice(0, 3), name.trim()].filter(Boolean)
			)
		);
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
		const clickTargets = [
			place.locator('.search-container-input > .bootstrap > .below > .single > .placeholder').first(),
			place.locator('.search-container-input').first(),
			place.locator('.placeholder').first(),
			place.locator('.toggle').first(),
			// ADDITIVE (2026-07-28) — campo con dirección PRE-CARGADA. Los 4 targets de arriba asumen
			// campo vacío: cuando el cliente trae dirección por defecto, `.placeholder` ya no existe
			// (lo reemplazó el valor) y el typeahead no se abría. `setOrigin` entonces presionaba
			// Escape y retornaba SIN error → el viaje se armaba con el origen del cliente en vez del
			// del caso (observado en TC1061: quedó "3500 Paradise Road, Las Vegas").
			// Las grabaciones lo resuelven clickeando EL VALOR ACTUAL, que es lo que hace este target.
			// Va AL FINAL a propósito: los specs Stripe siguen entrando por el primer target que ya
			// les funciona, así que no cambia su comportamiento.
			place.locator('.below .single .value').first()
		];

		// DOS pasadas. La primera puede DESBLOQUEAR el campo sin abrir el typeahead: cuando hay una
		// dirección pre-cargada, clickear el valor sólo enfoca el campo y recién entonces aparece el
		// `.placeholder`. La grabación validada lo hace en dos clicks —valor y después placeholder—
		// así que una sola pasada terminaba el loop sin el input montado y moría en el waitFor.
		// El caso de campo vacío resuelve en la primera pasada con el primer target, sin cambio.
		for (let pass = 0; pass < 2; pass++) {
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
			if (await searchInput.isVisible().catch(() => false)) {
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

	private async searchPlace(
		place: Locator,
		address: string,
		options: { keepExistingOnNoResults: boolean; avoidText?: string } = { keepExistingOnNoResults: false }
	): Promise<void> {
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
		const suggestion = place
			.getByRole('listitem')
			.filter({ hasText: new RegExp(escapeRegExp(suggestionText), 'i') })
			.first();
		// ADDITIVE (2026-07-28) — intento por el tramo CORTO (calle + número) antes del fallback ciego.
		// El autocomplete devuelve un sufijo de localidad DISTINTO del string canónico de
		// JOURNEY_DEFAULTS: "Reconquista 661, C1002 Cdad." o "Cazadores 1987, Ciudad Autónoma…" vs
		// "…, Buenos Aires, Argentina". El `suggestionText` de arriba incluye ese sufijo, así que NO
		// matcheaba y se caía al fallback ciego (primer listitem, puede ser otra dirección) o, peor,
		// a `keepExistingOnNoResults` que MANTIENE el valor previo y retorna sin error — el falso
		// verde observado en TC1061, donde el origen quedó en "3500 Paradise Road, Las Vegas".
		// Va DESPUÉS del intento exacto para no cambiar el comportamiento de los specs Stripe.
		const shortSuggestion = place
			.getByRole('listitem')
			.filter({ hasText: new RegExp(escapeRegExp(queryText), 'i') })
			.first();
		const fallbackOption = place.getByRole('listitem').filter({ hasText: /\S/ }).first();

		if (await this.commitPlaceOption(place, suggestion)) {
			return;
		}

		if (await this.commitPlaceOption(place, shortSuggestion)) {
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
		const optionText =
			method === 'Preautorizada'
				? 'Preautorizada'
				: method === 'CuentaCorriente'
					? 'Cuenta Corriente'
					: method === 'CargoABordo'
						? 'Tarjeta de Crédito - Cargo'
						: 'Efectivo';

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

	/**
	 * Completa los datos de la tarjeta preautorizada sin disparar validación.
	 *
	 * Seam S3 (BL-038 saldada): la lógica de iframes de Stripe Elements vive en
	 * `StripeElementsCardForm` (@ui/carrier/card-forms). Este método legacy queda
	 * como WRAPPER delegando — misma firma, misma secuencia (dropdown "Preautorizada"
	 * → llenado del form → aserción), CERO cambios para sus consumidores.
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

		// card-new (MG-178): Stripe Elements en TEST v1.72.8 a veces NO registra el primer llenado
		// → el botón "Validar" no habilita y el test falla (bucket card-new). El Strategy tipea
		// char-por-char (`pressSequentially` dispara los listeners internos de Stripe); acá se
		// reintenta el llenado hasta que "Validar" habilite. El retry vive en el POM, no en el
		// Strategy, porque "Validar" es un control de ESTA pantalla y el Strategy no lo conoce.
		const cardForm = new StripeElementsCardForm();
		const CARD_FILL_RETRIES = 3;
		for (let attempt = 1; attempt <= CARD_FILL_RETRIES; attempt++) {
			await cardForm.fill(this.page, {
				number: cardNumber,
				expiry: STRIPE_EXPIRY,
				cvc: STRIPE_CVC,
				holderName: STRIPE_CARD_HOLDER_NAME,
				zip: STRIPE_BILLING_ZIP
			});
			if (await this.waitForValidateEnabled(attempt < CARD_FILL_RETRIES ? 4_000 : 8_000)) {
				break;
			}
		}
		await this.assertPaymentMethodPreauthorizedSelected();
	}

	/** Poll hasta que el botón "Validar" habilite (Stripe considera la tarjeta completa). */
	private async waitForValidateEnabled(timeoutMs: number): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (await this.validateCardButton.isEnabled().catch(() => false)) {
				return true;
			}
			// NOTE(tier3-kept): Stripe Elements no emite evento al completar el campo — poll obligado
			await this.page.waitForTimeout(400);
		}
		return false;
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
		const dropdownTrigger = this.paymentMethodSelector
			.locator('.below > .single > .value > .data-with-icon-col')
			.first();
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
		const valueTrigger = this.paymentMethodSelector.locator('div > div > div.value.ng-star-inserted > div').first();
		const iconTrigger = this.paymentMethodSelector
			.locator('.below > .single > .value > .data-with-icon-col')
			.first();

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
		const optionsList = this.paymentMethodSelector.locator('select-dropdown div.options ul li');
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

			if (
				!vehicleSelectionOpened &&
				(await this.vehicleButton.isVisible().catch(() => false)) &&
				(await this.vehicleButton.isEnabled().catch(() => false))
			) {
				await this.vehicleButton.click();
				vehicleSelectionOpened = true;
				// NOTE(tier3-kept): dentro de loop submit — espera que submitButton aparezca tras abrir selector vehículo; reemplazar rompería la lógica del loop
				await this.page.waitForTimeout(1_000);
				continue;
			}

			if (
				(await this.submitButton.isVisible().catch(() => false)) &&
				(await this.submitButton.isEnabled().catch(() => false))
			) {
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
		return {
			success: preauthOk,
			errorMessage: preauthOk ? null : 'Preautorizada no confirmada tras click Validar'
		};
	}

	async waitForVehicleSelectionReady(timeout = 45_000): Promise<void> {
		await this.waitForEnabledButton(this.vehicleButton, timeout);
	}

	/**
	 * True si el botón "Seleccionar Vehículo" ya está visible+habilitado (form válido, el flujo
	 * avanzó sin challenge). Es un PREDICADO, no un waiter: `waitForVehicleSelectionReady` bloquea
	 * hasta 45s, y esto se usa como escape-hatch de `ThreeDSModal.waitForOptionalVisible` para no
	 * esperar a ciegas un modal 3DS que quizá no aparezca.
	 */
	async isVehicleSelectionReady(): Promise<boolean> {
		const visible = await this.vehicleButton.isVisible().catch(() => false);
		return visible ? this.vehicleButton.isEnabled().catch(() => false) : false;
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
	 * ASIGNACIÓN MANUAL. En vez de "Send Service" (que despacha al pool de conductores con un timer
	 * de oferta), asigna el viaje DIRECTO a un conductor. Elimina el timer de oferta-candidato: el
	 * driver queda dueño del viaje.
	 *
	 * ── Por qué NO se usa un índice (regresión medida 2026-07-29) ──────────────────────────────────
	 * La versión anterior hacía `getByText(/Asignar|Assign/i).nth(1)` ("según el recorder") y luego
	 * exigía `getByRole('button', {name:/Asignar|Assign/i})`. Fallaba 3/3 en los casos con pasajero
	 * distinto del cliente (colaborador TC1096/TC1097, empresa TC1111) y pasaba 3/3 en app pax.
	 * El dump del DOM real (`evidence/web-dump/send-manual-*.html`) mostró por qué:
	 *   - "Enviar Manual" NO abre un modal: NAVEGA a la página "Choferes / Gestión de Choferes /
	 *     Asignar". Los únicos `.modal` del DOM son invisibles (Changelog + onboarding).
	 *   - Los textos que matchean /Asignar/ son: [0] el BREADCRUMB de esa página (un `span`), y
	 *     [1..N] el control de acción de CADA fila de chofer. O sea `nth(1)` dependía de que el
	 *     breadcrumb ocupara exactamente el índice 0 — cualquier texto "Asignar" extra corre el
	 *     índice y se clickea otra cosa.
	 *   - El control de la fila es un `div.btn.btn-primary.btn-sm` dentro de `td.td-with-icon`, NO un
	 *     `<button>` ⇒ `getByRole('button')` no lo ve nunca.
	 *   - Tras clickear la fila NO aparece ningún diálogo de confirmación: la asignación se completa
	 *     ahí (los viajes 67758/67759 llegaron al conductor aunque el paso de "confirmar" reventara).
	 * De ahí: ancla por FILA (no por índice global) + confirmación OPCIONAL.
	 */
	async clickSendManualAndAssign(): Promise<void> {
		await this.waitForLoadingOverlayToDisappear();
		// Locale-robusto: el ambiente puede estar en ES ("Enviar Manual"/"Asignar") o EN ("Send Manual"/"Assign").
		await this.page.getByRole('button', { name: /Enviar Manual|Send Manual/i }).click();
		// Listado de choferes: es una PAGINA con tabla, no un modal. Cada fila trae su control de
		// accion (`div.btn.btn-primary.btn-sm` dentro de `td.td-with-icon`). Anclamos a la FILA.
		const driverRows = this.page.locator('tr:has(.td-with-icon .btn.btn-primary)');
		await driverRows.first().waitFor({ state: 'visible', timeout: 20_000 });

		// QUE fila: la PRIMERA del listado por defecto. En TEST el listado llega ordenado por
		// proximidad y la fila 1 es el conductor del device (es lo que el `nth(1)` anterior clickeaba
		// de hecho, y por eso app pax funcionaba). Si se corre contra otro conductor, apuntarlo por
		// texto con CARGO_ASSIGN_DRIVER (nombre, codigo o patente) en vez de depender del orden.
		const driverHint = process.env.CARGO_ASSIGN_DRIVER?.trim();
		const hintedRows = driverHint ? driverRows.filter({ hasText: driverHint }) : null;
		const targetRow =
			hintedRows && (await hintedRows.count().catch(() => 0)) > 0 ? hintedRows.first() : driverRows.first();

		// Log de A QUIEN se asigno: si el viaje no le llega al device, este dato distingue
		// "se asigno a otro conductor" de "no se asigno nada" sin gastar otra corrida.
		const assignedTo = (await targetRow.innerText().catch(() => ''))
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 90);
		console.log(`[clickSendManualAndAssign] asignando a: ${assignedTo || '<fila sin texto>'}`);
		await targetRow.locator('.td-with-icon .btn.btn-primary').first().click();

		// Confirmacion OPCIONAL: en el build medido el click de la fila asigna directo y NO abre dialogo.
		// Si algun build si la pide, la aceptamos (cubre `<button>` real y `div.btn` dentro de dialogo).
		const assignConfirm = this.page
			.getByRole('button', { name: /Asignar|Assign|Confirmar|Confirm/i })
			.or(
				this.page
					.locator('.modal .btn, [role="dialog"] .btn, .swal2-popup .btn')
					.filter({ hasText: /Asignar|Assign|Confirmar|Confirm/i })
			);
		const needsConfirm = await assignConfirm
			.first()
			.waitFor({ state: 'visible', timeout: 3_000 })
			.then(() => true)
			.catch(() => false);
		if (needsConfirm) {
			await assignConfirm.first().click();
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
			await expect
				.poll(
					async () =>
						matchesSearchText((await this.passengerSelect.textContent().catch(() => '')) ?? '', clientName),
					{ timeout: 10_000 }
				)
				.toBe(true);
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

	/**
	 * Verifica que el cliente quedó efectivamente seleccionado en el form.
	 *
	 * Match token-based (no literal): el portal muestra los nombres en formato "apellido, nombre"
	 * y con teléfono — p. ej. buscar 'Marcelle Stripe' contra "Stripe, Marcelle (+9398989887)".
	 */
	async assertClientSelected(name: string): Promise<void> {
		await expect
			.poll(async () => matchesSearchText((await this.clientSelect.textContent().catch(() => '')) ?? '', name), {
				message: `El cliente "${name}" no quedó seleccionado en el formulario`,
				timeout: 10_000
			})
			.toBe(true);
	}

	/**
	 * Verifica que el pasajero quedó efectivamente seleccionado — sea porque se eligió o porque el
	 * cliente lo AUTO-ASIGNA (empresa individuo, cliente individuo MP, donde el campo queda
	 * deshabilitado). Misma lógica que usa `fillMinimum` para la rama auto-asignada.
	 */
	async assertPassengerSelected(name: string): Promise<void> {
		await expect
			.poll(async () => matchesSearchText((await this.passengerSelect.textContent().catch(() => '')) ?? '', name), {
				message: `El pasajero "${name}" no quedó asignado en el formulario`,
				timeout: 10_000
			})
			.toBe(true);
	}

	/**
	 * Verifica que el ORIGEN quedó commiteado en el form.
	 *
	 * Necesario porque `setOrigin()` tiene un camino de éxito SILENCIOSO: si el autocomplete no
	 * devuelve opciones presiona Escape y retorna sin error. Observado en la corrida TC1061 del
	 * 2026-07-27 — el origen quedó en el precargado del cliente ("3500 Paradise Road, Las Vegas")
	 * en vez de "Reconquista 661" y el paso pasó en verde, armando el viaje con datos distintos
	 * a los del caso de prueba.
	 *
	 * Compara por el tramo corto (calle + número): el autocomplete devuelve un sufijo de localidad
	 * distinto del string canónico de `JOURNEY_DEFAULTS` (p. ej. "Cazadores 1987, Ciudad Autónoma…"
	 * vs "Cazadores 1987, Buenos Aires, Argentina").
	 */
	async assertOriginSet(address: string): Promise<void> {
		await expect(this.originSelect, `El origen no quedó seteado en "${address}"`).toContainText(shortAddress(address), { timeout: 10_000 });
	}

	/** Verifica que el DESTINO quedó commiteado en el form. Ver `assertOriginSet` para el porqué. */
	async assertDestinationSet(address: string): Promise<void> {
		await expect(this.destinationSelect, `El destino no quedó seteado en "${address}"`).toContainText(shortAddress(address), { timeout: 10_000 });
	}

	/**
	 * Verifica que NO se puede avanzar al armado del viaje mientras la tarjeta no esté validada:
	 * el botón "Seleccionar Vehículo" debe estar deshabilitado.
	 *
	 * Es una regla de negocio (no una verificación cosmética): el sistema no debe permitir enviar
	 * un servicio con una tarjeta sin validar. Llamar ANTES de `validateNativeCard()`/`clickValidateCard()`.
	 */
	/**
	 * ¿El selector de Forma de Pago ya muestra una tarjeta vinculada con esos últimos 4 dígitos?
	 *
	 * Señal MUCHO más robusta que inspeccionar el desplegable: cuando el pasajero tiene una tarjeta
	 * vinculada, el sistema la selecciona sola y el campo la muestra como
	 * "Tarjeta de crédito VISA *** 1111". No hace falta abrir el dropdown ni depender de su
	 * estructura interna (`.ng-star-inserted` / `.deselect-payment-method`), que fue lo que falló en
	 * la corrida del 2026-07-27: la detección por dropdown devolvía false, no se borraba nada, y el
	 * test moría después porque el form de tarjeta nueva no existe cuando ya hay una seleccionada.
	 */
	async hasSelectedCardWithLast4(last4: string): Promise<boolean> {
		const text = (await this.paymentMethodValue.textContent().catch(() => '')) ?? '';

		return text.includes(last4);
	}

	/** Texto actual del selector de Forma de Pago (para diagnóstico en los mensajes de error). */
	async getPaymentMethodText(): Promise<string> {
		return ((await this.paymentMethodValue.textContent().catch(() => '')) ?? '').trim();
	}

	async assertVehicleSelectionBlocked(): Promise<void> {
		await expect(this.vehicleButton, 'El botón "Seleccionar Vehículo" debería estar deshabilitado hasta validar la tarjeta').toBeDisabled({ timeout: 10_000 });
	}
}
