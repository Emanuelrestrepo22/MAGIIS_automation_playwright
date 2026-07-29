/**
 * KATA Component (Layer 3) — Carrier · Alta de Viaje (formulario nuevo viaje).
 *
 * Versión KATA del POM `tests/pages/carrier/NewTravelPage(Base).ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de hold. Compone el POM legacy
 * internamente (delegación) — NO se duplica la lógica Stripe Elements / Angular
 * (~900 líneas, deuda TIER A BL-038) ni se toca el POM legacy, que sigue siendo la
 * base compartida por contractor + specs aún no amoldados (multi-session safety).
 *
 * NOTA @atc — MAPEO POR ÁREA (aceptado): el idmap `atp-mg-gateway-idmap.md` es
 * API-level (TC-PAY-*); los TS-STRIPE-TC10xx (UI) no tienen 1:1. `fillMinimum`
 * (alta + validación de tarjeta preautorizada) se mapea al MG más cercano del área C
 * (alta/validación tarjeta): MG-148 (TC-PAY-C-01). Reasignar cuando el ATP tenga TCs
 * UI del alta de viaje con hold.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Mini-flujo de alta/validación decorado con @atc; esperas trazadas con @step.
 */

import type { TestContextOptions } from '@TestContext';
import type { NewTravelFormInput, PaymentMethod, ValidateCardResult } from '@pages/carrier';

import { expect } from '@playwright/test';
import { NewTravelPage as LegacyNewTravelPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type { NewTravelFormInput } from '@pages/carrier';

/**
 * Endpoint del alta de tarjeta a la wallet del pasajero, VERIFICADO en vivo el 2026-07-28
 * (`POST /magiis-v0.2/passengers/5289/cards` → 200, probe de la ronda 3 del RUN-LOG de
 * Authorize). Es el único evento observable que marca el fin del round-trip con la pasarela:
 * lo usa `expectNativeCardRejected` como asentamiento real.
 */
const ADD_CARD_URL_PATTERN = /\/passengers\/\d+\/cards(\?|$)/;

/**
 * Firma de un alta EXITOSA en el cuerpo de esa respuesta (misma corrida en vivo): la tarjeta
 * queda persistida con id propio y últimos 4 dígitos. Se usa NEGADA — un rechazo no puede
 * haber persistido la tarjeta.
 */
const PERSISTED_CARD_ID_PATTERN = /"id"\s*:\s*\d+/;
const PERSISTED_CARD_LAST4_PATTERN = /"lastFourDigits"\s*:\s*"\d{4}"/;

/**
 * Entrada del alta de viaje con método "Cargo a Bordo".
 * `passenger` opcional: cuando el cliente auto-asigna el pasajero (app pax /
 * empresa individuo, `#passenger` con `ng-reflect-is-disabled="true"`) se omite.
 */
export type CargoTravelInput = {
	client: string;
	passenger?: string;
	origin: string;
	destination: string;
};

export class CarrierNewTravelPage extends UiBase {
	private readonly legacy: LegacyNewTravelPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyNewTravelPage(this.page);
	}

	/** Navega directo al formulario de alta de viaje. */
	@step
	async goto(): Promise<void> {
		await this.legacy.goto();
	}

	/** Espera a que el formulario de alta de viaje esté cargado. */
	@step
	async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.legacy.ensureLoaded(timeout);
	}

	/**
	 * Mini-flujo ATC: completa el formulario mínimo (cliente/pasajero/origen/destino) y
	 * vincula/valida la tarjeta preautorizada. @atc MG-148 (área C — pendiente reasignar).
	 */
	@atc('MG-148', {
		severity: 'critical',
		description: 'Alta de viaje: completar formulario + validar tarjeta preautorizada'
	})
	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		await this.legacy.fillMinimum(opts);
	}

	/**
	 * Mini-flujo ATC: completa el formulario de alta con método "Cargo a Bordo" (sin
	 * tarjeta ni formulario Stripe en carrier — el cobro ocurre luego en la Driver App).
	 * Maneja el pasajero de forma adaptativa: si el cliente lo auto-asigna (`#passenger`
	 * deshabilitado), valida su contenido; si no, lo selecciona explícitamente; si no se
	 * pasa `passenger` (app pax), lo omite.
	 *
	 * @atc MG-161 (área F — cobro). mapeo por área aceptado: el idmap `atp-mg-gateway-idmap.md`
	 * es API-level (TC-PAY-F-*); los TS-STRIPE-TC10xx UI de Cargo a Bordo no tienen 1:1.
	 * MG-161 (TC-PAY-F-01) es el MG más cercano del área de cobro.
	 */
	@atc('MG-161', {
		severity: 'critical',
		description: 'Alta de viaje Cargo a Bordo: completar formulario + método Cargo a Bordo'
	})
	async fillCargoABordo(opts: CargoTravelInput): Promise<void> {
		await this.legacy.selectClient(opts.client);
		if (opts.passenger) {
			const passengerField = this.page.locator('#passenger');
			const autoAssigned = (await passengerField.getAttribute('ng-reflect-is-disabled')) === 'true';
			if (autoAssigned) {
				await expect(passengerField).not.toHaveText('', { timeout: 10_000 });
			} else {
				await this.legacy.selectPassenger(opts.passenger);
			}
		}
		await this.legacy.setOrigin(opts.origin);
		await this.legacy.setDestination(opts.destination);
		await this.legacy.selectPaymentMethod('CargoABordo');
	}

	/**
	 * VIAJE PLANO (para asignación manual): cliente + pasajero (adaptativo) + direcciones, SIN
	 * seleccionar método de pago. Requerido por el flujo Send Manual → Assign (ref: test-5);
	 * seleccionar "Cargo a Bordo" oculta el botón "Send Manual". El conductor elige tarjeta
	 * (CREDIT_CARD) recién en el Resumen de la Driver App.
	 *
	 * `origin` opcional (S7): el cliente individuo MP auto-asigna el origen (recording
	 * test-14 solo cargó destino) — omitirlo salta `setOrigin`. Los consumidores existentes
	 * (cargo-a-bordo / asignación manual) siguen pasándolo siempre.
	 */
	@step
	async fillPlain(opts: Omit<CargoTravelInput, 'origin'> & { origin?: string }): Promise<void> {
		await this.legacy.selectClient(opts.client);
		if (opts.passenger) {
			const passengerField = this.page.locator('#passenger');
			const autoAssigned = (await passengerField.getAttribute('ng-reflect-is-disabled')) === 'true';
			if (autoAssigned) {
				await expect(passengerField).not.toHaveText('', { timeout: 10_000 });
			} else {
				await this.legacy.selectPassenger(opts.passenger);
			}
		}
		if (opts.origin) {
			await this.legacy.setOrigin(opts.origin);
		}
		await this.legacy.setDestination(opts.destination);
	}

	/** Espera a que el botón "Seleccionar Vehículo" esté habilitado. */
	@step
	async waitForVehicleSelectionReady(timeout = 45_000): Promise<void> {
		await this.legacy.waitForVehicleSelectionReady(timeout);
	}

	/** Abre el selector de vehículos (espera habilitación + overlay). */
	@step
	async clickSelectVehicle(): Promise<void> {
		await this.legacy.clickSelectVehicle();
	}

	/** Envía el servicio (Dar de Alta / Enviar Servicio). */
	@step
	async clickSendService(): Promise<void> {
		await this.legacy.clickSendService();
	}

	/** Asignación MANUAL directa al conductor: Send Manual → Assign → Assign (ref: test-5). */
	@step
	async clickSendManualAndAssign(): Promise<void> {
		await this.legacy.clickSendManualAndAssign();
	}

	/** Envía el alta de viaje (validar + seleccionar vehículo + enviar servicio). */
	@step
	async submit(): Promise<void> {
		await this.legacy.submit();
	}

	/**
	 * Click en "Validar" tolerando el rechazo de la tarjeta (fondos insuficientes,
	 * declinada). Retorna `{ success, errorMessage }` sin lanzar cuando la tarjeta
	 * es rechazada — el spec decide la aserción.
	 */
	@step
	async clickValidateCardAllowingReject(timeout = 8_000): Promise<ValidateCardResult> {
		return this.legacy.clickValidateCardAllowingReject(timeout);
	}

	// ── Granulares del alta (para flujos que no usan `fillMinimum`) ──────────────
	// Los consume el spec de preauth-failure (cliente contractor + pasajero app pax
	// invitado), donde el formulario se completa campo a campo. Additive: no alteran
	// `fillMinimum`/`fillCargoABordo`. Delegación directa al POM legacy → @step.

	/** Selecciona el cliente del viaje (autocompletar). */
	@step
	async selectClient(name: string): Promise<void> {
		await this.legacy.selectClient(name);
	}

	/** Selecciona el pasajero app pax invitado y completa su nombre. */
	@step
	async selectGuestPassenger(name: string): Promise<void> {
		await this.legacy.selectGuestPassenger(name);
	}

	/** Fija la dirección de origen del viaje. */
	@step
	async setOrigin(address: string): Promise<void> {
		await this.legacy.setOrigin(address);
	}

	/** Fija la dirección de destino del viaje. */
	@step
	async setDestination(address: string): Promise<void> {
		await this.legacy.setDestination(address);
	}

	/** Vincula/valida la tarjeta preautorizada por sus últimos 4 dígitos. */
	@step
	async selectCardByLast4(last4: string, skipValidate = false, allowDecline = false): Promise<void> {
		await this.legacy.selectCardByLast4(last4, skipValidate, allowDecline);
	}

	// ── Soporte multi-gateway (S7) — form nativo Angular (MP / Authorize / eBiz) ─────

	/** Selecciona el método de pago del alta (ej. 'Preautorizada' antes del card form). */
	@step
	async selectPaymentMethod(method: PaymentMethod): Promise<void> {
		await this.legacy.selectPaymentMethod(method);
	}

	/**
	 * Click en "Validar" del form NATIVO Angular y espera el oráculo de tarjeta válida
	 * ("Tarjeta válida" / "Valid card") — VERIFICADO en vivo para Authorize (4111/900/10001);
	 * eBiz comparte el form (oráculo asumido, TODO live). Para Stripe Elements usar el flujo
	 * `fillMinimum`/`selectCardByLast4` (valida vía `clickValidateCard` del POM legacy).
	 */
	@step
	async validateNativeCard(): Promise<void> {
		await this.page.getByRole('button', { name: /^(Valid|Validar)$/i }).click();
		await expect(this.page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first()).toBeVisible({ timeout: 20_000 });
	}

	/**
	 * Contraparte NEGATIVA de `validateNativeCard()`: click en "Validar" con una tarjeta que
	 * la pasarela debe rechazar, y verifica que el sistema NO la dé por válida.
	 *
	 * ⚠️ HISTORIA DE ESTE MÉTODO — leer antes de tocarlo. Falló dos veces por lo mismo.
	 *
	 * **v1** — única aserción `expect(cartelDeExito).not.toBeVisible({ timeout })`. Vacua:
	 * `not.toBeVisible` se satisface con el PRIMER chequeo, y en t=0 el cartel todavía no
	 * llegó porque la respuesta está en vuelo. Pasaba siempre.
	 *
	 * **v2** — se agregó un "asentamiento" esperando `toBeDisabled()` en "Validar" antes de
	 * preguntar por el cartel. **También era vacua**, y el probe de la ronda 3 explica por
	 * qué: el front deshabilita el botón EN EL CLICK (estado de submit) y lo deja
	 * deshabilitado incluso DESPUÉS del éxito — se muestreó `disabled` a t+2s y seguía
	 * `disabled` a t+30s con la tarjeta ya aprobada. O sea `toBeDisabled()` resuelve en
	 * milisegundos y no es señal de "procesando": el asentamiento aportaba ~0 de espera, y
	 * `toBeHidden()` seguía evaluándose antes de que la pasarela contestara.
	 *
	 * **v3 (esta)** — el asentamiento se ancla a lo único que sí marca el fin del round-trip:
	 * la RESPUESTA del alta de tarjeta (`POST /passengers/{id}/cards`, observada a t+1.1-1.7s).
	 * Y se agrega una aserción de PRESENCIA del rechazo a nivel API: un alta rechazada no
	 * puede haber PERSISTIDO la tarjeta. La firma del alta exitosa está observada en vivo
	 * (HTTP 2xx + `id` + `cardId` de la pasarela + `lastFourDigits`), así que su negación es
	 * un oráculo fundado y no un copy inventado — el copy del rechazo en la UI sigue sin
	 * observarse y por eso NO se asserta texto.
	 *
	 * Ver `docs/gateway-pg/authorize/RUN-LOG.md` (hallazgos 2 y 5).
	 *
	 * @param settleMs Ventana para la respuesta del alta de tarjeta. Si no llega ninguna, se
	 *   espera igual la ventana completa, así el chequeo del cartel nunca es instantáneo.
	 */
	@step
	async expectNativeCardRejected(settleMs = 20_000): Promise<void> {
		const validar = this.page.getByRole('button', { name: /^(Valid|Validar)$/i });

		// El listener se arma ANTES del click: la respuesta se observó a t+1.1s, esperarla
		// después del click la perdería.
		const addCardResponse = this.page
			.waitForResponse(response => response.request().method() === 'POST' && ADD_CARD_URL_PATTERN.test(response.url()), {
				timeout: settleMs
			})
			.catch(() => null);

		await validar.click();
		const response = await addCardResponse;

		if (response) {
			const body = await response.text().catch(() => '');
			const cardPersisted = response.ok() && PERSISTED_CARD_ID_PATTERN.test(body) && PERSISTED_CARD_LAST4_PATTERN.test(body);
			expect(
				cardPersisted,
				`la pasarela rechazó la tarjeta: el backend NO debe persistirla. Respondió HTTP ${response.status()} con: ${body.slice(0, 400)}`
			).toBe(false);
		}

		// Ahora sí post-asentamiento: o llegó la respuesta del alta, o se agotó `settleMs`.
		await expect(
			this.page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first(),
			'la pasarela rechazó la tarjeta: el sistema NO debe declararla válida'
		).toBeHidden();
	}

	/**
	 * Elimina la tarjeta RESALTADA del dropdown de métodos de pago (trash + confirmación
	 * "Eliminar") y verifica que ya no quede vinculada. Extraído del recording MP wallet
	 * (test-14/15 — FRAGILE: clases Angular dinámicas, confirmar en corrida viva).
	 */
	@step
	async deleteHighlightedSavedCard(): Promise<void> {
		const paymentMethods = this.page.locator('#add_travel_payment_methods');
		await paymentMethods.locator('.below .single .value').first().click();
		await paymentMethods.locator('.highlighted .deselect-payment-method .fa').first().click();
		// Diálogo de confirmación "¿Quieres eliminar la tarjeta?".
		await this.page.getByRole('button', { name: /^Eliminar$/i }).click();
		// Tras eliminar, el trash de una tarjeta resaltada no debe seguir visible.
		await expect(paymentMethods.locator('.highlighted .deselect-payment-method')).toHaveCount(0, { timeout: 10_000 });
	}

	/** Verifica que haya una tarjeta vinculada RESALTADA en el dropdown de métodos de pago. */
	@step
	async expectHighlightedSavedCard(): Promise<void> {
		await expect(this.page.locator('#add_travel_payment_methods').locator('.highlighted .data-with-icon-col').first()).toBeVisible({
			timeout: 10_000
		});
	}
}
