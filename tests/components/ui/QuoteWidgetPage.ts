/**
 * KATA Component (Layer 3) — Widget PÚBLICO de cotización (Quote / Reservación Online).
 *
 * Cubre el gap que tenía el repo: el flujo Quote no estaba automatizado para NINGUNA pasarela
 * (`specs/stripe/quote/quote-colaborador.spec.ts` estaba entero en `test.fixme()` con el motivo
 * "PENDIENTE: Page Object QuotePage no implementado").
 *
 * Particularidades frente al alta de viaje del portal:
 *   - Es **público, sin login**: se accede por `#/quote?pluginKey=<base64(carrierId)>`.
 *     `pluginKey=MTUyMQ` = base64 de "1521" sin padding.
 *   - El **idioma sale del query param** (`language=EN|ES`), NO de `ensureSpanishLanguage` como el
 *     resto de la suite. Por defecto se usa **EN**, que es el idioma de la grabación validada en
 *     PASS por QA (`tests/test-8.spec.ts`, 2026-07-27). Los locators son bilingües donde se
 *     conocen ambos textos (la grabación ES `features/flights/recorded/quote-con-vuelo.recorded.ts`
 *     aportó los de dirección/contacto).
 *   - El **pago vive DENTRO del widget** (botón "Payment" tras "Quote"), no en una conversión
 *     posterior desde Cotizaciones del portal.
 *   - El form de tarjeta es el **MISMO form nativo Angular** del portal, así que se llena con
 *     `cardFormFor(gateway)` — no hace falta duplicar nada.
 *   - El viaje resultante queda en **"Programados"** (no en "Por asignar"): es un resultado válido
 *     del hold según el oráculo definido por el líder de QA.
 *
 * Secuencia (evidencia: `tests/test-8.spec.ts`):
 *   goto → origen → destino → pax → Select Vehicle → Trip Note → Select → contacto →
 *   Quote → Payment → (fill de tarjeta por el caller) → Confirm your Quote
 *
 * El paso `pax` NO es opcional (medido en vivo 2026-07-29): el widget arranca en 0 pasajeros y
 * con 0 no avanza. Ver `setPassengerCount`.
 */

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

/** Datos de contacto del solicitante (paso 2 del widget). */
export type QuoteContactInput = {
	name: string;
	lastName: string;
	email: string;
	/** Teléfono con formato del país, ej. '+54 (11) 2404-8846'. */
	phone: string;
	/** País del prefijo telefónico, ej. 'Argentina'. Omitir para no tocar el selector. */
	country?: string;
};

export type QuoteWidgetGotoOptions = {
	/** Carrier dueño del widget. Default: `CARRIER_ID` del env, o '1521'. */
	carrierId?: string;
	/** Idioma del widget. Default 'EN' — el verificado en la grabación de QA. */
	language?: 'EN' | 'ES';
};

export class QuoteWidgetPage extends UiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	/**
	 * Abre el widget público del carrier. No requiere login: el `pluginKey` identifica al carrier.
	 */
	@step
	async goto(options: QuoteWidgetGotoOptions = {}): Promise<void> {
		const carrierId = options.carrierId ?? process.env.CARRIER_ID ?? '1521';
		const language = options.language ?? 'EN';
		// `pluginKey` = base64(carrierId) SIN padding (la grabación usa 'MTUyMQ', no 'MTUyMQ==').
		const pluginKey = Buffer.from(carrierId).toString('base64').replace(/=+$/, '');

		await this.page.goto(this.buildUrl(`/#/quote?language=${language}&theme=0&pluginKey=${pluginKey}&step=1&c=S`));
		// Debería renderizar el paso 1 del widget.
		//
		// Se asevera el HEADING, no el input de dirección: ese textbox NO existe hasta hacer click
		// en el `.placeholder` del campo (lo hace `fillAddress`). Esperarlo acá hacía fallar el goto
		// con el widget correctamente cargado — corrida del 2026-07-28.
		await expect(this.page.getByRole('heading', { name: /Online Reservation|Reserva[ción]* [Oo]nline/i }).first()).toBeVisible({ timeout: 20_000 });
	}

	/** Input de dirección del typeahead (bilingüe). */
	private addressInput() {
		return this.page.getByRole('textbox', { name: /Enter an address|Ingrese una direcci[oó]n/i });
	}

	/**
	 * Fija una dirección en el typeahead abierto y elige la opción sugerida.
	 * `expectedOption` filtra la sugerencia por su texto visible (tramo corto de la dirección).
	 */
	private async fillAddress(query: string, expectedOption: string): Promise<void> {
		// El primer `.placeholder` disponible es el campo aún vacío (origen, luego destino). El click
		// es lo que MONTA el textbox de dirección — antes de eso el input no existe en el DOM.
		await this.page.locator('.placeholder').first().click();
		await expect(this.addressInput()).toBeVisible({ timeout: 15_000 });
		await this.addressInput().fill(query);
		await this.page.getByText(expectedOption).first().click();
	}

	/** Fija el origen del viaje. `query` es lo que se tipea; el match usa el tramo calle+número. */
	@step
	async setOrigin(address: string): Promise<void> {
		await this.fillAddress(address, shortAddress(address));
	}

	/** Fija el destino del viaje. */
	@step
	async setDestination(address: string): Promise<void> {
		await this.fillAddress(address, shortAddress(address));
	}

	/** Campo "Trip Note" / "Nota del Viaje" — sólo existe una vez montado el paso de vehículo. */
	private tripNoteField() {
		return this.page.getByRole('textbox', { name: /Trip Note|Nota del Viaje|Nota/i }).first();
	}

	/**
	 * Fija la cantidad de pasajeros del paso 1.
	 *
	 * SÍ forma parte del happy path: medido en vivo el 2026-07-29, el widget arranca en
	 * **0 pasajeros** y con 0 NO avanza a la selección de vehículo. El comentario previo del POM
	 * ("el default de 1 pax alcanza") no se sostiene contra el widget real — y la grabación de
	 * referencia también incrementaba el contador antes de avanzar.
	 *
	 * Usa el rol semántico `spinbutton` (el widget lo expone) en vez del `i:nth-child(3)`
	 * posicional de `increasePassengerCount()`, y ASEVERA el valor: si el input reactivo descarta
	 * el fill, esto falla acá con el motivo real en vez de arrastrar el síntoma dos pasos.
	 */
	@step
	async setPassengerCount(count = 1): Promise<void> {
		const field = this.page.getByRole('spinbutton').first();
		await field.fill(String(count));
		await expect(field, `la cantidad de pasajeros debe quedar en ${count}`).toHaveValue(String(count), { timeout: 10_000 });
	}

	/**
	 * Avanza a la selección de vehículo. Botón "Select Vehicle" / "Seleccionar Vehículo".
	 *
	 * Asevera la TRANSICIÓN, no sólo el click: sin esto el click "pasa" aunque el widget se quede
	 * en el paso 1 (p. ej. 0 pasajeros) y el fallo emerge recién en `setTripNote`, apuntando a un
	 * locator que nunca iba a montar — diagnóstico equivocado, observado en vivo el 2026-07-29.
	 */
	@step
	async selectVehicle(): Promise<void> {
		await this.page.getByRole('button', { name: /^Select Vehicle$|^Seleccionar Veh[íi]culo$/i }).click();
		await expect(this.tripNoteField(), 'el widget debe avanzar al paso de selección de vehículo').toBeVisible({ timeout: 20_000 });
	}

	/** Completa la nota del viaje (campo "Trip Note" / "Nota del Viaje"). */
	@step
	async setTripNote(note: string): Promise<void> {
		const field = this.tripNoteField();
		await field.click();
		await field.fill(note);
	}

	/**
	 * Confirma el vehículo elegido ("Select" / "Seleccionar").
	 * Es el botón de la tarjeta de vehículo, no el de la barra superior — de ahí el `.first()`.
	 */
	@step
	async confirmVehicle(): Promise<void> {
		await this.page
			.getByRole('button', { name: /^Select$|^Seleccionar$/i })
			.first()
			.click();
	}

	/** Completa los datos de contacto del solicitante (paso 2). */
	@step
	async fillContact(contact: QuoteContactInput): Promise<void> {
		const nameField = this.page.getByRole('textbox', { name: /^Name:$|^Nombre:$/i });
		await nameField.click();
		await nameField.fill(contact.name);

		const lastNameField = this.page.getByRole('textbox', { name: /^Last Name:$|^Apellido:$/i });
		await lastNameField.click();
		await lastNameField.fill(contact.lastName);

		const emailField = this.page.getByRole('textbox', { name: /^Email:$/i });
		await emailField.click();
		await emailField.fill(contact.email);

		if (contact.country) {
			// Selector de prefijo telefónico: dropdown propio del widget (no un <select> nativo).
			await this.page.locator('.dropbtn').click();
			await this.page.getByRole('link', { name: new RegExp(`^${escapeRegExp(contact.country)}\\s*\\+`, 'i') }).click();
		}
		await this.page.getByRole('textbox', { name: /phone number|n[uú]mero de tel[eé]fono/i }).fill(contact.phone);
	}

	/** Solicita la cotización ("Quote" / "Cotizar"). */
	@step
	async requestQuote(): Promise<void> {
		await this.page.getByRole('button', { name: /^Quote$|^Cotizar$/i }).click();
	}

	/**
	 * Abre el paso de pago ("Payment" / "Pago"). Después de esto el form de tarjeta está montado
	 * y el caller lo llena con `cardFormFor(gateway)` — es el mismo form nativo del portal.
	 */
	@step
	async goToPayment(): Promise<void> {
		await this.page.getByRole('button', { name: /^Payment$|^Pago$/i }).click();
		// Debería montar el form de tarjeta del widget.
		await expect(this.page.getByRole('textbox', { name: /Card number|N[uú]mero de tarjeta/i })).toBeVisible({ timeout: 20_000 });
	}

	/** Confirma la cotización y crea el viaje ("Confirm your Quote" / "Confirmar Cotización"). */
	@step
	async confirmQuote(): Promise<void> {
		await this.page.getByRole('button', { name: /Confirm your Quote|Confirmar (tu )?Cotizaci[oó]n/i }).click();
	}

	/**
	 * Ajusta la cantidad de pasajeros.
	 *
	 * ⚠️ FRAGILE — la grabación usa `dblclick` sobre `.pax-count-default` y luego `i:nth-child(3)`,
	 * un locator posicional sin semántica. NO forma parte del happy path (el default de 1 pax
	 * alcanza), así que queda expuesto aparte para no arrastrar la fragilidad al camino principal.
	 * Confirmar el selector real antes de usarlo en un caso que dependa del número de pasajeros.
	 */
	@step
	async increasePassengerCount(): Promise<void> {
		await this.page.locator('.d-flex.align-items-center.pax-count-default').dblclick();
		await this.page.locator('i:nth-child(3)').dblclick();
	}
}

/** Tramo corto de una dirección (calle + número) — el typeahead devuelve otro sufijo de localidad. */
function shortAddress(address: string): string {
	return address.split(',')[0].trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
