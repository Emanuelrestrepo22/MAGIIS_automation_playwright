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

import type { Locator } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import type { NewTravelFormInput, PaymentMethod, ValidateCardResult } from '@pages/carrier';

import { expect } from '@playwright/test';
import { debugLog } from '@helpers/index';
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

/**
 * Estado "desplegable de Forma de Pago abierto". Es un literal compartido y no un boolean porque el
 * resto de los estados son DIAGNÓSTICOS legibles (qué trigger se probó, con qué error, qué muestra
 * Forma de Pago): un boolean obligaría a tirar esa información, que es justo la que faltó para
 * entender los hallazgos 4 y 5.
 */
const DROPDOWN_OPEN = 'abierto';

/**
 * Cota de borrados por llamada. BL-050 exige que NO quede NINGUNA tarjeta con el mismo NÚMERO, y el
 * wallet puede tener más de una con esos últimos 4 (la precondición por API es un no-op para estos
 * actores — hallazgo 3), así que el borrado itera. La cota evita colgarse si la UI dejara de reflejar
 * el borrado: es un límite de seguridad, no una espera.
 */
const MAX_SAVED_CARD_DELETES = 5;

/** `DELETE /magiis-v0.2/users/{passengerId}/cards/{cardId}` — el que dispara el borrado por UI. */
const DELETE_CARD_URL = /\/users\/\d+\/cards\/\d+/;

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

	/**
	 * Fija el momento del pickup: `'Ahora'` (inmediato) o una hora del selector (`'12:10 PM'`).
	 *
	 * Con una hora futura el viaje se convierte en PROGRAMADO, y eso **cambia el oráculo**: no cae en
	 * "Por asignar" sino en la pestaña "Programados" de gestión de viajes. Verificado en los dos
	 * recordings de eBizCharge del 2026-07-30 (alta programada desde carrier y desde el widget Quote).
	 */
	@step
	async setPickupTime(option: 'Ahora' | string): Promise<void> {
		await this.legacy.setPickupTime(option);
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

	/**
	 * Selecciona el pasajero del alta (autocompletar). El POM legacy falla si el campo está
	 * deshabilitado, así que los clientes que AUTO-ASIGNAN pasajero no deben llamarlo:
	 * empresa individuo (client === passenger, ver BL-003) y cliente individuo MP.
	 * Usarlo cuando cliente y pasajero difieren — p. ej. colaborador de contractor
	 * (client 'fast car' / passenger 'smith, Emanuel').
	 */
	@step
	async selectPassenger(name: string): Promise<void> {
		await this.legacy.selectPassenger(name);
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
	 * Detecta si la Forma de Pago ya quedó RESUELTA a la tarjeta guardada del pax
	 * ("Tarjeta de crédito VISA *** <last4>") — con tarjeta vigente el form nativo NO se
	 * renderiza y el dropdown la preselecciona (confirmado por screenshot live 2026-07-27,
	 * carrier 1521 / Authorize). Utility read-only: silent-fail → false.
	 */
	@step
	async isSavedCardPreselected(last4: string): Promise<boolean> {
		try {
			await this.page
				.getByText(new RegExp(`\\*+\\s*${last4}`))
				.first()
				.waitFor({ state: 'visible', timeout: 3_000 });
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Click en "Validar" del form NATIVO Angular y espera que la pasarela ACEPTE la tarjeta —
	 * VERIFICADO en vivo para Authorize (4111/900/10001); eBiz comparte el form (oráculo asumido,
	 * TODO live). Para Stripe Elements usar `fillMinimum`/`selectCardByLast4` (POM legacy).
	 *
	 * El desenlace REAL lo lee `readNativeCardValidationOutcome`, que distingue TRES estados
	 * (`accepted` / `rejected` / `timeout`); acá sólo se declara cuál es el correcto para el happy
	 * path. Ver ese método para el detalle de por qué el oráculo no es sólo el toast.
	 *
	 * HISTORIA DEL ORÁCULO — leer antes de tocar el oráculo positivo. El 2026-07-28 el toast
	 * "Tarjeta válida" dejó de observarse y se lo reemplazó por el estado persistente creyendo que
	 * era un cambio de comportamiento del FE. El log de red probó la causa real: la política AVS
	 * estricta de la cuenta sandbox (A/Z/Y → "authorize and hold for review", luego Z → Decline)
	 * RETENÍA la transacción de validación → sin aprobación no hay toast. Corregida la política
	 * (Z/W/Y → Allow), el toast volvió. De ahí que el oráculo acepte CUALQUIERA de las dos
	 * manifestaciones del éxito —toast, o Forma de Pago resuelta a "*** <last4>"—: cubre las dos
	 * presentaciones verificadas sin depender de la config de la cuenta, y ninguna debilita a la
	 * otra (ambas sólo ocurren si la pasarela aprobó).
	 */
	@step
	async validateNativeCard(last4?: string, timeoutMs?: number): Promise<void> {
		// `timeoutMs` viene del DATO de la celda (slowMs de las tarjetas DELAY_* de eBiz: el
		// procesador demora a propósito) — sin él, el default de 20s cortaría antes de que la
		// pasarela responda y un caso de demora legítima se reportaría como timeout de ambiente.
		const outcome = await this.readNativeCardValidationOutcome(last4, timeoutMs);

		// Debería confirmar la tarjeta. `readNativeCardValidationOutcome` explica por qué el oráculo
		// no es sólo el toast "Tarjeta válida".
		expect(outcome, outcome === 'rejected' ? 'La pasarela RECHAZÓ la tarjeta que debía aceptar (mensaje de error visible).' : 'Tras "Validar" no apareció ni la confirmación ni el error, y la tarjeta no quedó vinculada en Forma de Pago — la pasarela no respondió (revisar ambiente/red).').toBe('accepted');
	}

	/**
	 * Contraparte NEGATIVA de `validateNativeCard()`: la pasarela RECHAZA la tarjeta.
	 *
	 * Es el oráculo de los casos unhappy de alta de viaje (decline genérico, ZIP no-match, CVV
	 * mismatch). Exige que el mensaje de error esté **PRESENTE**, no solamente que falte el de
	 * éxito — la distinción es el corazón de la campaña: si sólo se aseverara la ausencia de
	 * "Tarjeta válida", un ambiente TEST caído (form que no carga, request que cuelga) se
	 * acreditaría como decline correcto. Ese es el falso verde más peligroso acá, porque un
	 * unhappy path "pasa" precisamente cuando nada funciona.
	 *
	 * DOS oráculos independientes, en este orden:
	 *   1. **UI** — desenlace `rejected` leído por `readNativeCardValidationOutcome` (error visible).
	 *   2. **API (más fuerte)** — un alta rechazada no puede haber PERSISTIDO la tarjeta: se escucha
	 *      el `POST /passengers/{id}/cards` del paso de validación y se exige que su respuesta NO
	 *      tenga la firma del alta exitosa (HTTP 2xx + `id` + `lastFourDigits`), firma observada en
	 *      vivo. El listener se arma ANTES del click (la respuesta se observó a t+1.1-1.7s), y el
	 *      chequeo sobrevive aunque la UI muestre el error: es lo que detecta la contradicción
	 *      "rechazo en pantalla, tarjeta guardada en el backend".
	 * El copy del rechazo en la UI no se asserta como texto fijo: se lee y se devuelve como
	 * evidencia (ver `nativeCardErrorOracle`).
	 *
	 * No reusa `clickValidateCardAllowingReject()` del POM legacy por dos razones verificables:
	 *   1. Ese método devuelve `success:false` con el mensaje sintético "Validar button never
	 *      enabled and no Stripe error surfaced" cuando expira sin error — o sea, convierte el
	 *      timeout de ambiente en un falso decline.
	 *   2. Sus locators son de Stripe: `validateCardButton` es `/^Validar$/i` (sólo español,
	 *      rompe si el portal queda en inglés) y `cardValidationErrorText` apunta a
	 *      `app-credit-card-payment-data-validate`, el sub-componente de Stripe Elements.
	 *
	 * Ver `docs/gateway-pg/authorize/RUN-LOG.md` (hallazgos 2 y 5) para las dos versiones vacuas
	 * anteriores de este método (`not.toBeVisible` instantáneo y asentamiento por `toBeDisabled`).
	 *
	 * @param last4 últimos 4 de la tarjeta que debía ser rechazada (mejora los diagnósticos).
	 * @param settleMs ventana para la respuesta del alta de tarjeta del chequeo de no-persistencia.
	 * @returns el texto del error mostrado al usuario, para que el spec lo registre como evidencia.
	 */
	@step
	async expectNativeCardRejected(last4?: string, settleMs = 20_000): Promise<string> {
		// El listener se arma ANTES del click (el click ocurre dentro de
		// `readNativeCardValidationOutcome`): la respuesta se observó a t+1.1s, esperarla después la
		// perdería.
		const addCardResponse = this.page
			.waitForResponse(response => response.request().method() === 'POST' && ADD_CARD_URL_PATTERN.test(response.url()), {
				timeout: settleMs
			})
			.catch(() => null);

		const outcome = await this.readNativeCardValidationOutcome(last4);

		// Debería mostrar el error de la pasarela y NO vincular la tarjeta. Los dos desenlaces que
		// NO son 'rejected' se distinguen a propósito, porque mandan a investigar lugares distintos:
		//   · 'accepted' → la pasarela ACEPTÓ una tarjeta que debía rechazar. Es el hallazgo del caso:
		//     o la política de la cuenta no está guardada (filtros AVS/CVV en "hold for review" en vez
		//     de Decline), o MAGIIS ignora el rechazo. NO es un problema del test.
		//   · 'timeout'  → no hubo respuesta: ambiente/red. El caso no es concluyente.
		expect(outcome, outcome === 'accepted' ? `La pasarela ACEPTÓ y vinculó la tarjeta •••• ${last4 ?? '????'} que debía rechazar. Revisar en el dashboard del sandbox si la transacción quedó en "Fraud Review" (Response Code 4 = retenida para revisión, que MAGIIS trata como válida) en lugar de declinada — eso indica que la acción del filtro es "Authorize and hold for review" y no "Decline".` : 'Tras "Validar" no apareció ni el error ni la confirmación — la pasarela no respondió (revisar ambiente/red), así que el caso no es concluyente.').toBe('rejected');

		// Oráculo ADICIONAL, independiente de la UI: el rechazo visible no alcanza si el backend
		// igual guardó la tarjeta. Si la respuesta nunca llegó no hay nada que aseverar acá (el
		// desenlace de UI ya cubrió el caso).
		const response = await addCardResponse;
		if (response) {
			const body = await response.text().catch(() => '');
			const cardPersisted = response.ok() && PERSISTED_CARD_ID_PATTERN.test(body) && PERSISTED_CARD_LAST4_PATTERN.test(body);
			expect(
				cardPersisted,
				`la pasarela rechazó la tarjeta: el backend NO debe persistirla. Respondió HTTP ${response.status()} con: ${body.slice(0, 400)}`
			).toBe(false);
		}

		return (await this.nativeCardErrorOracle().textContent())?.trim() ?? '';
	}

	/**
	 * Pulsa "Validar"/"Valid" y espera el desenlace real de la validación contra la pasarela.
	 *
	 * ── Por qué el oráculo de éxito NO es sólo el toast "Tarjeta válida" ────────────────────────
	 * El toast es TRANSITORIO y se pierde por carrera: verificado el 2026-07-28 en dos corridas
	 * consecutivas del mismo flujo — TC1031 lo capturó y TC1011 no, con la tarjeta igualmente
	 * vinculada (el snapshot mostraba Forma de Pago en "Tarjeta de crédito VISA *** 1111"). Esperar
	 * sólo el toast produce fallos intermitentes que no corresponden a ningún bug.
	 *
	 * El oráculo primario es el estado PERSISTENTE: la tarjeta quedó vinculada y seleccionada en
	 * Forma de Pago. Es más fuerte que el toast, no más débil — es la condición que los pasos
	 * siguientes necesitan de verdad, y sólo se cumple si la pasarela aceptó la tarjeta.
	 *
	 * @param last4 últimos 4 de la tarjeta esperada. Sin él sólo se puede leer el toast, así que el
	 *   resultado vuelve a ser sensible a la carrera; pasarlo siempre que se lo tenga.
	 * @returns 'accepted' | 'rejected' | 'timeout' — nunca lanza por sí mismo: quien llama decide
	 *   qué desenlace es el correcto para su caso.
	 */
	private async readNativeCardValidationOutcome(last4?: string, timeout = 20_000): Promise<'accepted' | 'rejected' | 'timeout'> {
		await this.page.getByRole('button', { name: /^(Valid|Validar)$/i }).click();

		let outcome: 'accepted' | 'rejected' | 'timeout' = 'timeout';

		await expect
			.poll(
				async () => {
					// El error se evalúa PRIMERO: si la pasarela rechazó, la tarjeta no debe figurar
					// vinculada, y ante señales contradictorias el rechazo es el dato relevante.
					if (await this.nativeCardErrorOracle().isVisible().catch(() => false)) {
						outcome = 'rejected';

						return outcome;
					}
					if (await this.nativeCardValidOracle().isVisible().catch(() => false)) {
						outcome = 'accepted';

						return outcome;
					}
					if (last4 && (await this.legacy.hasSelectedCardWithLast4(last4))) {
						outcome = 'accepted';

						return outcome;
					}

					return 'timeout';
				},
				{ message: 'La validación de tarjeta no produjo ningún desenlace observable.', timeout, intervals: [250, 250, 500, 500, 1_000] }
			)
			.not.toBe('timeout')
			// El timeout no es un fallo de este método: es uno de los tres desenlaces que reporta.
			.catch(() => undefined);

		return outcome;
	}

	/** Oráculo POSITIVO de la validación del form nativo — VERIFICADO en vivo (Authorize 4111/900). */
	private nativeCardValidOracle(): Locator {
		return this.page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first();
	}

	/**
	 * Oráculo NEGATIVO de la validación del form nativo.
	 *
	 * Texto observado en vivo con Authorize: "Error al validar tarjeta. Por favor, revise los datos
	 * ingresados." La UI muestra el MISMO mensaje si el backend MAGIIS falló y si la pasarela
	 * rechazó — por eso los specs unhappy conservan además el diagnóstico de respuestas HTTP
	 * no-2xx del paso de validación, que es lo que separa las dos causas.
	 */
	private nativeCardErrorOracle(): Locator {
		return this.page.getByText(/Error al validar tarjeta|Error validating card|revise los datos ingresados/i).first();
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
		// Diálogo de confirmación "¿Quieres eliminar la tarjeta?" — bilingüe: el carrier 1521
		// (suite Authorize/US) renderiza el portal en INGLÉS y el botón es "Delete"
		// (confirmado en la grabación tests/test-3.spec.ts); el carrier ARG (MP) usa "Eliminar".
		await this.page.getByRole('button', { name: /^(Delete|Eliminar)$/i }).click();
		// Tras eliminar, el trash de una tarjeta resaltada no debe seguir visible.
		await expect(paymentMethods.locator('.highlighted .deselect-payment-method')).toHaveCount(0, { timeout: 10_000 });
	}

	/**
	 * ¿Hay una tarjeta vinculada RESALTADA en el dropdown de métodos de pago?
	 *
	 * Discrimina por PRESENCIA en lugar de por excepción: permite decidir si hay que borrar sin
	 * envolver `deleteHighlightedSavedCard()` en un `.catch()` que tragaría un borrado FALLIDO
	 * (BL-050 — si el duplicado no se limpia, la validación falla después con un error que
	 * apunta al lugar equivocado).
	 */
	@step
	async hasHighlightedSavedCard(): Promise<boolean> {
		const paymentMethods = this.page.locator('#add_travel_payment_methods');
		const opener = paymentMethods.locator('.below .single .value').first();

		if (!(await opener.isVisible().catch(() => false))) {
			return false;
		}
		await opener.click();

		return (await paymentMethods.locator('.highlighted .deselect-payment-method').count()) > 0;
	}

	/**
	 * Opción del desplegable de métodos de pago correspondiente a una tarjeta vinculada cuyos
	 * últimos 4 dígitos son `last4`.
	 *
	 * Cada tarjeta guardada es una OPCIÓN (`listitem`) del desplegable que trae su propio trash
	 * (`.deselect-payment-method`) — ese `has` distingue las tarjetas de las otras opciones del
	 * desplegable (Efectivo, Cuenta Corriente, etc.), que no se pueden borrar.
	 *
	 * ⚠️ El ancla es el `role=listitem`, NO `.ng-star-inserted`. Angular pone esa clase en MUCHOS
	 * nodos del componente, incluido el `<select-dropdown>` que envuelve a todo el desplegable: con
	 * ella, `.first()` resolvía al ENVOLTORIO —que está `hidden`— en vez de a la fila de la tarjeta.
	 * Efecto observado en la corrida del 2026-07-29 (TS-AUTHORIZE-TC1053, 3/3): `count() > 0` daba
	 * true (el nodo existe en el DOM) pero `toBeVisible()` fallaba con
	 * `14 × locator resolved to <select-dropdown … ng-reflect-is-below="false">  unexpected value "hidden"`,
	 * mientras el snapshot del fallo mostraba el desplegable ABIERTO exponiendo la opción
	 * "Tarjeta de crédito VISA *** 1111" con su ícono de borrado. O sea: el desplegable sí publica la
	 * tarjeta guardada; el locator apuntaba al ancestro equivocado. Mismo ancla que
	 * `chooseNewPreauthorizedCardOption()`, que ya venía resolviendo bien por esta vía.
	 */
	private savedCardByLast4(last4: string): Locator {
		return this.page
			.locator('#add_travel_payment_methods')
			.getByRole('listitem')
			.filter({ has: this.page.locator('.deselect-payment-method') })
			.filter({ hasText: last4 });
	}

	/**
	 * Deja el formulario listo para dar de alta una tarjeta pre-autorizada NUEVA, replicando la
	 * secuencia de las grabaciones validadas en PASS por QA.
	 *
	 * ⚠️ HAY DOS RAMAS, y usar una sola fue la causa de que TC1011/TC1061 fallaran mientras TC1051
	 * pasaba (corrida 2026-07-28). Evidencia en `recorded/authorize-hold-on-*.recorded.ts`:
	 *
	 *   · Pax SIN tarjeta previa (colaborador, empresa) — la rama simple:
	 *       abrir desplegable → elegir la opción "Credit Card - Pre-Authorized" → form
	 *
	 *   · Pax CON tarjeta previa (personal) — la rama que faltaba:
	 *       abrir desplegable → elegir el `.highlighted` (la tarjeta GUARDADA, que es lo que hace
	 *       aparecer su ícono de borrado) → `.deselect-payment-method` → confirmar "Delete" →
	 *       **REABRIR** el desplegable → elegir el `.highlighted` otra vez (que ahora es la opción
	 *       de tarjeta nueva) → form
	 *
	 * El orden importa: el trash NO está disponible antes de seleccionar la tarjeta guardada, y hay
	 * que reseleccionar después de borrarla. El helper hacía `selectPaymentMethod('Preautorizada')`
	 * (selección por TEXTO) y recién después intentaba borrar — orden inverso al validado.
	 *
	 * @returns true si había una tarjeta previa y se eliminó.
	 */
	@step
	async selectPreauthorizedCardMethod(last4: string): Promise<boolean> {
		const hadSavedCard = await this.hasSavedCardWithLast4(last4);
		// Los TRES estados posibles del wallet quedan registrados: sin `cleanupCardsByLast4` efectiva
		// (hallazgo 3, abierto a propósito) el estado inicial lo determina la corrida anterior, así que
		// es la ÚNICA forma de saber a posteriori qué estado ejercitó cada repetición. Activar con
		// `DEBUG=gateway-pg:wallet`.
		const wasSelected = hadSavedCard && (await this.legacy.hasSelectedCardWithLast4(last4));

		debugLog('gateway-pg:wallet', `estado inicial del wallet para •••• ${last4}: ${hadSavedCard ? (wasSelected ? 'tarjeta PRESENTE y SELECCIONADA (estado 3)' : 'tarjeta PRESENTE, NO seleccionada (estado 1)') : 'SIN tarjeta (estado 2)'}`);

		if (hadSavedCard) {
			// Rama "pax CON tarjeta". El click en `.highlighted` reproduce la grabación validada
			// (seleccionar la tarjeta guardada antes de borrarla) y sólo corresponde cuando la opción
			// RESALTADA **es** la tarjeta: si el método por defecto del pax es OTRO, ese click
			// seleccionaría el método equivocado — hallazgo 2, cerrado en `c7225eb`, con el snapshot del
			// fallo mostrando Forma de Pago en "Cuenta Corriente".
			//
			// Cuando la tarjeta está sólo LISTADA (no seleccionada) no hace falta: su fila del
			// desplegable ya trae su propio trash, y `deleteHighlightedOrByLast4` prefiere el de la fila
			// que matchea `last4`.
			//
			// El click SÍ cierra el desplegable, y eso ya no rompe nada: desde el hallazgo 5
			// `deleteHighlightedOrByLast4()` lo REABRE por su cuenta. Por eso también se fue la rama
			// `else if` que abría "por si acaso" — ningún camino de acá adivina en qué estado quedó el
			// desplegable, y adivinarlo fue la causa común de los hallazgos 4 y 5.
			if (wasSelected) {
				await this.openPaymentMethodsDropdown();
				await this.highlightedOption().click();
			}
			await this.deleteHighlightedOrByLast4(last4);
		}

		// Ambas ramas convergen en la MISMA selección explícita por texto.
		//
		// Antes la rama con-tarjeta reabría el desplegable y volvía a clickear `.highlighted`
		// asumiendo que tras el borrado la opción resaltada pasaba a ser la de tarjeta nueva, y la
		// rama sin-tarjeta llamaba a `legacy.selectPaymentMethod('Preautorizada')`. Los dos caminos
		// fallaban por la misma razón de fondo —asumir un estado del desplegable— y se reemplazan por
		// una selección que dice QUÉ elige en vez de DÓNDE hace click:
		//   · `legacy.selectPaymentMethod` abre el desplegable asumiendo que está cerrado, y con la
		//     lista ya desplegada el trigger que busca `BasePage.openDropdown`
		//     (`.below > .single > .value`) no existe en el DOM: falla con "element(s) not found"
		//     (corrida TC1016 del 2026-07-28: snapshot en "▲" con la lista desplegada).
		//   · `.highlighted` es la opción SELECCIONADA, no la de tarjeta nueva — depende de qué tenía
		//     elegido el pasajero antes.
		// `chooseNewPreauthorizedCardOption()` no asume ninguno de los dos estados: abre si hace falta.
		await this.chooseNewPreauthorizedCardOption();

		// En ambas ramas debería quedar el método en "Tarjeta de Crédito - Preautorizada".
		await this.legacy.assertPaymentMethodPreauthorizedSelected();

		return hadSavedCard;
	}

	/**
	 * Deja el formulario con una tarjeta pre-autorizada YA VINCULADA seleccionada en Forma de Pago.
	 *
	 * Es la contraparte EXACTA de `selectPreauthorizedCardMethod()`: aquélla BORRA la tarjeta
	 * guardada para forzar el alta de una nueva (precondición BL-050), ésta la CONSERVA y la elige.
	 * Modela el eje "tarjeta vinculada existente" de la matriz (TS-AUTHORIZE-TC1053/1055/1062/1064,
	 * TS-EBIZ-TC1061/1062/1069/1070), donde el caso justamente NO debe disparar el hold de
	 * vinculación: la tarjeta ya está validada contra la pasarela de una corrida anterior.
	 *
	 * IDEMPOTENTE respecto del estado del desplegable, por la misma razón que
	 * `chooseNewPreauthorizedCardOption()`: no asume ni abierto ni cerrado. Con la lista desplegada el
	 * trigger que busca `BasePage.openDropdown` ya no existe en el DOM (causa raíz del fallo de TC1016
	 * el 2026-07-28), y por eso NO se delega en `legacy.selectSavedCardByLast4()`, que siempre asume el
	 * desplegable cerrado.
	 *
	 * Oráculo: la tarjeta queda SELECCIONADA en Forma de Pago (mismo estado persistente que usa
	 * `readNativeCardValidationOutcome`). Deliberadamente NO se asevera el literal "Tarjeta de
	 * Crédito - Preautorizada": con una tarjeta guardada elegida el selector muestra la tarjeta
	 * ("Tarjeta de crédito VISA *** 1111", ver `hasSavedCardWithLast4`), y el repo se contradice
	 * sobre qué texto queda (`legacy.selectSavedCard()` asevera el literal). Se asevera lo
	 * observado, no lo supuesto.
	 */
	@step
	async selectSavedPreauthorizedCard(last4: string): Promise<void> {
		// Caso normal: cuando el pasajero tiene tarjeta, el sistema la elige solo — nada que hacer.
		if (await this.legacy.hasSelectedCardWithLast4(last4)) {
			return;
		}

		const option = this.savedCardByLast4(last4).first();

		if (!(await option.isVisible().catch(() => false))) {
			await this.openPaymentMethodsDropdown();
		}
		await expect(option, `La tarjeta •••• ${last4} no figura entre las vinculadas en Forma de Pago: "${await this.getPaymentMethodText()}".`).toBeVisible({ timeout: 10_000 });
		await option.click();
		// Debería quedar seleccionada en Forma de Pago — el estado que los pasos siguientes necesitan.
		await expect
			.poll(async () => this.legacy.hasSelectedCardWithLast4(last4), {
				message: `La tarjeta •••• ${last4} no quedó seleccionada en Forma de Pago tras elegirla del desplegable`,
				timeout: 10_000
			})
			.toBe(true);
	}

	/**
	 * Opción RESALTADA (= actualmente seleccionada) del desplegable de Forma de Pago.
	 *
	 * ACOTADA a `#add_travel_payment_methods` a propósito: el formulario de alta tiene varios
	 * desplegables Angular (cliente, pasajero, tipo de servicio, vehículo) y todos marcan su opción
	 * elegida con la misma clase `.highlighted`. Sin el scope, el `.first()` tomaba el `.highlighted`
	 * de otro desplegable — verificado en la corrida de TC1051 del 2026-07-28, donde terminó
	 * seleccionando "Cuenta Corriente" como Forma de Pago y el borrado de la tarjeta nunca ocurrió.
	 */
	private highlightedOption(): Locator {
		return this.page.locator('#add_travel_payment_methods').locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
	}

	/**
	 * Borra la tarjeta guardada desde el desplegable de Forma de Pago y verifica que DESAPARECIÓ del
	 * wallet del pasajero.
	 *
	 * ⚠️ HALLAZGO 5 (ronda 2, 2026-07-29). REABRE el desplegable ANTES de borrar — que es lo que hacía
	 * la grabación validada (`recorded/authorize-hold-on-personal-apppax.recorded.ts`: borrar →
	 * confirmar → **reabrir** → reseleccionar) y este código no replicaba. Con la tarjeta SELECCIONADA,
	 * el click en `.highlighted` que la expone CIERRA el desplegable; sin reabrir, `savedCardByLast4`
	 * contaba 0 (Angular desmonta las filas al cerrar) y el borrado caía en el ícono del control
	 * CERRADO. Ese ícono confirma el diálogo pero NO borra: su clase, `deselect-payment-method`,
	 * describe DESELECCIONAR. Verificado por API — la tarjeta `id 4763` del pax 4951 seguía existiendo
	 * después de la corrida completa.
	 *
	 * Por eso el trash se busca SIEMPRE dentro de una FILA del desplegable abierto. El respaldo anterior
	 * (`#add_travel_payment_methods .deselect-payment-method`) no estaba acotado a las filas y por eso
	 * podía resolver al ícono del control cerrado; ya no existe como camino.
	 *
	 * Reabrir acá —y no en el llamador— es lo que hace el borrado independiente del estado en que quedó
	 * el desplegable, que es la propiedad que le falta a esta rama para servir de respaldo con cualquier
	 * wallet (hallazgo 3 sigue abierto: la precondición por API es un no-op para estos actores).
	 *
	 * ⚠️ ITERA sobre TODAS las filas que matchean `last4`, y la sincronización es la RESPUESTA HTTP del
	 * `DELETE`, no un cambio de UI. Las dos cosas salieron de la ronda 3:
	 *   · BL-050 es por NÚMERO, así que si el wallet tiene más de una tarjeta con esos últimos 4 (posible
	 *     justamente porque la precondición por API no limpia), borrar una sola deja el alta bloqueada.
	 *   · Esperar la respuesta del `DELETE` es lo único que separa "el backend no borró" de "la UI no se
	 *     refrescó" — la distinción que faltó para clasificar el rojo de TS-AUTHORIZE-TC1061 rep 3, donde
	 *     el diálogo se confirmaba y la tarjeta seguía existiendo (verificado out-of-band: la corrida
	 *     siguiente la encontró todavía en el wallet). El `DELETE /users/{pax}/cards/{id}` intermitente
	 *     ya está documentado en el repo (ver `deletePassengerCard` en `card-precondition.ts`).
	 */
	private async deleteHighlightedOrByLast4(last4: string): Promise<void> {
		let deleted = 0;

		for (let attempt = 0; attempt < MAX_SAVED_CARD_DELETES; attempt++) {
			await this.openPaymentMethodsDropdown();

			const rows = this.savedCardByLast4(last4);

			if (!(await rows.count())) {
				break;
			}

			const trash = rows.first().locator('.deselect-payment-method').first();

			await expect(trash, `La fila de la tarjeta •••• ${last4} no expone ícono de borrado en el desplegable (Forma de Pago: "${await this.legacy.getPaymentMethodText()}").`).toBeVisible({ timeout: 10_000 });
			await trash.click();

			// La escucha se arma ANTES de confirmar, porque el `DELETE` sale con el click de confirmación.
			const deleteResponse = this.page.waitForResponse(response => DELETE_CARD_URL.test(response.url()) && response.request().method() === 'DELETE', { timeout: 15_000 }).catch(() => null);

			// Confirmación bilingüe: el portal del spec queda en ES por `ensureSpanishLanguage`; una
			// sesión manual puede estar en inglés ("Delete", como en las grabaciones).
			await this.page.getByRole('button', { name: /^(Delete|Eliminar)$/i }).click();

			const response = await deleteResponse;

			// Debería haber salido el DELETE al backend: si el diálogo se confirma y no sale request, el
			// click cayó en un control que no borra (así se veía el hallazgo 5 desde el control cerrado).
			expect(response, `La confirmación de borrado de la tarjeta •••• ${last4} no disparó ningún DELETE /users/{pax}/cards/{id}: el diálogo se confirmó pero el borrado nunca salió al backend.`).not.toBeNull();
			// Y debería haberlo aceptado. Un no-2xx acá es un rechazo del BACKEND, no un fallo del test.
			expect(response?.status() ?? 0, `El BACKEND rechazó el borrado de la tarjeta •••• ${last4}: ${response?.status()} DELETE ${response?.url()}`).toBeLessThan(400);
			deleted += 1;
		}

		expect(deleted, `No se borró ninguna tarjeta •••• ${last4}: el desplegable no publicó ninguna fila con esos últimos 4 dígitos.`).toBeGreaterThan(0);
		await this.expectSavedCardDeleted(last4);
	}

	/**
	 * Oráculo del borrado: la tarjeta •••• `last4` ya NO está en Forma de Pago — ni SELECCIONADA ni
	 * LISTADA como opción del desplegable.
	 *
	 * Las dos señales son necesarias. La anterior miraba sólo `hasSelectedCardWithLast4() === false`, y
	 * el ícono del control cerrado DESELECCIONA sin borrar: la aserción pasaba con la tarjeta intacta en
	 * el wallet (hallazgo 5) y el test moría dos pasos más adelante, en el fill del form nuevo,
	 * culpando al formulario de un problema que era del borrado.
	 *
	 * ⚠️ CADA SEÑAL SE LEE EN UN ESTADO CONOCIDO DEL DESPLEGABLE, y ése es el punto del método:
	 *
	 *   · "sigue seleccionada" se mide con el desplegable CERRADO. `paymentMethodValue` del POM legacy es
	 *     el PRIMER `.value` del componente; con la lista desplegada ese primer `.value` puede ser el de
	 *     la OPCIÓN de la tarjeta en vez del control cerrado, y entonces "sigue seleccionada" es un
	 *     artefacto de la lectura y no un estado del wallet. Medido en la ronda 3: TS-AUTHORIZE-TC1061
	 *     rep 3 falló 10 s con "sigue SELECCIONADA" en el MISMO camino que había pasado en las reps 1 y 2
	 *     (y con el wallet arrancando en el mismo estado), o sea: dependía de si el borrado dejaba la
	 *     lista abierta o cerrada, no de si la tarjeta existía.
	 *   · "sigue listada" se mide con el desplegable ABIERTO, porque cerrado no hay `listitem` y el 0
	 *     sería vacío — la misma trampa de presencia-vs-estado del hallazgo 1.
	 *
	 * Las dos señales son necesarias, y ninguna se relajó: la primera es la aserción que ya existía
	 * (misma condición, mismo presupuesto de 10 s, ahora leída donde significa lo que dice) y la segunda
	 * es la que se AGREGÓ para que un "deseleccionar" no pueda pasar por un "borrar" (hallazgo 5).
	 */
	private async expectSavedCardDeleted(last4: string): Promise<void> {
		// 1. Estado conocido. El borrado puede dejar la lista desplegada o no — se cierra para que la
		//    lectura siguiente sea sobre el control cerrado.
		await this.closePaymentMethodsDropdown();

		// 2. No debe seguir SELECCIONADA en Forma de Pago.
		await expect
			.poll(async () => this.legacy.hasSelectedCardWithLast4(last4), {
				message: `La tarjeta •••• ${last4} sigue SELECCIONADA en Forma de Pago tras eliminarla`,
				timeout: 10_000
			})
			.toBe(false);

		// 3. Ni debe seguir LISTADA entre las opciones. Reabrir es lo que permite contar de verdad.
		const dropdown = await this.tryOpenPaymentMethodsDropdown();

		expect(dropdown.open, `No se pudo reabrir el desplegable para verificar que la tarjeta •••• ${last4} ya no figura entre las vinculadas — ${dropdown.reason}`).toBe(true);
		await expect
			.poll(async () => this.savedCardByLast4(last4).count(), {
				message: `La tarjeta •••• ${last4} sigue LISTADA como opción del desplegable tras eliminarla`,
				timeout: 10_000
			})
			.toBe(0);
	}

	/**
	 * Elige la opción "Tarjeta de Crédito - Preautorizada" del desplegable de Forma de Pago.
	 *
	 * IDEMPOTENTE respecto del estado del desplegable: si ya está abierto usa la lista visible, y
	 * si está cerrado lo abre. Esa propiedad es el punto del método — los caminos que llegan acá
	 * dejan el desplegable en estados distintos según si el pasajero tenía tarjeta guardada, y
	 * asumir uno de los dos es exactamente lo que rompió TC1016 el 2026-07-28.
	 *
	 * La apertura ya no puede fallar en silencio: `openPaymentMethodsDropdown()` verifica su propio
	 * efecto y LANZA con diagnóstico (hallazgo 4 de la ronda 2 — antes devolvía un `boolean` que este
	 * método descartaba, y el fallo emergía 10 s después en el `toBeVisible()` de abajo culpando a la
	 * opción de no existir mientras el desplegable seguía cerrado).
	 *
	 * Bilingüe: el carrier 1521 (suite Authorize/US) renderiza el portal en inglés
	 * ("Credit Card - Pre-Authorized", confirmado en las grabaciones validadas); los specs lo
	 * fuerzan a ES vía `ensureSpanishLanguage`, pero el locator no depende de ese puente (BL-048).
	 */
	private async chooseNewPreauthorizedCardOption(): Promise<void> {
		const option = this.page
			.locator('#add_travel_payment_methods')
			.getByRole('listitem')
			.filter({ hasText: /Tarjeta de Cr[eé]dito\s*-\s*Preautorizada|Credit Card\s*-\s*Pre-?Authorized/i })
			.first();

		if (!(await option.isVisible().catch(() => false))) {
			await this.openPaymentMethodsDropdown();
		}
		await expect(option, 'No apareció la opción "Tarjeta de Crédito - Preautorizada" en Forma de Pago.').toBeVisible({ timeout: 10_000 });
		await option.click();
	}

	/**
	 * Opciones (filas) del desplegable de Forma de Pago.
	 *
	 * Sirve además como ORÁCULO DE ESTADO del desplegable: Angular monta las `listitem` sólo mientras
	 * está abierto y las desmonta al cerrarlo — medido en la ronda 2 (hallazgo 5: con el desplegable
	 * cerrado `savedCardByLast4` cuenta 0 porque "ya no hay `listitem`"). Por eso "hay una opción
	 * visible" ⇒ "el desplegable está abierto", sin depender de clases internas (`ng-reflect-is-below`,
	 * el glifo `▲`/`▼`) que ya demostraron ser inestables entre pantallas.
	 */
	private paymentMethodOptions(): Locator {
		return this.page.locator('#add_travel_payment_methods').getByRole('listitem');
	}

	/** ¿El desplegable de Forma de Pago está ABIERTO? (= publica opciones visibles). */
	private async isPaymentMethodsDropdownOpen(): Promise<boolean> {
		return this.paymentMethodOptions()
			.first()
			.isVisible()
			.catch(() => false);
	}

	/**
	 * Cierra el desplegable de Forma de Pago SIN elegir ninguna opción, y verifica que cerró.
	 *
	 * No es cosmético: con la lista desplegada sus `li` quedan por ENCIMA del formulario de tarjeta
	 * nueva y el fill muere con un error que apunta al campo equivocado. Medido en la ronda 3
	 * (TS-AUTHORIZE-TC1061), cuando el detector empezó a poder abrir el desplegable y lo dejaba
	 * abierto:
	 *
	 * ```
	 * TimeoutError: locator.click: Timeout 15000ms exceeded — input[formcontrolname="creditCardNumber"]
	 *   <li class="ng-star-inserted"> … subtree intercepts pointer events
	 * ```
	 *
	 * `Escape` es la vía que ya usa el POM legacy (`selectSavedCardByLast4`) para cerrarlo sin
	 * seleccionar — importante, porque cerrarlo clickeando una opción cambiaría la Forma de Pago.
	 */
	private async closePaymentMethodsDropdown(): Promise<void> {
		await expect
			.poll(
				async () => {
					if (!(await this.isPaymentMethodsDropdownOpen())) {
						return 'cerrado';
					}
					await this.page.keyboard.press('Escape').catch(() => undefined);

					return (await this.isPaymentMethodsDropdownOpen()) ? 'sigue abierto' : 'cerrado';
				},
				{ message: 'El desplegable de Forma de Pago quedó abierto; sus opciones TAPAN el form de tarjeta nueva.', timeout: 5_000, intervals: [200, 300, 500, 1_000, 1_000] }
			)
			.toBe('cerrado');
	}

	/**
	 * Triggers conocidos del selector CERRADO de Forma de Pago, EN ORDEN DE PREFERENCIA.
	 *
	 * Hay cuatro porque el componente Angular NO renderiza el control cerrado igual en todos los
	 * estados, y ésa fue la causa real de los hallazgos 4 y 5: el POM conocía un solo trigger.
	 * Medido en la ronda 3 (2026-07-29) con un solo candidato (`.below .single .value`):
	 *   · tras el borrado → "el click en el selector no lo desplegó" (no reabría, hallazgo 5);
	 *   · con el form de tarjeta NUEVA ya montado → "cerrado y sin trigger visible", con Forma de Pago
	 *     mostrando "Tarjeta de Crédito - Preautorizada" (o sea: el `.value` existe para leer el texto,
	 *     pero NO bajo `.below > .single`).
	 *
	 * Procedencia de cada uno (ninguno inventado):
	 *   1. `.data-with-icon-col.option-content-container` — el que usa la GRABACIÓN VALIDADA
	 *      (`recorded/authorize-hold-on-*.recorded.ts`) las DOS veces que abre este desplegable,
	 *      incluida la reapertura de después del borrado.
	 *   2/3. `.below > .single > .value` y `.below > .single > .placeholder` — los del opener genérico
	 *      del repo (`BasePage.openDropdown`), para combos con y sin valor elegido.
	 *   4. `.value` — el mismo nodo que el POM legacy usa como `paymentMethodValue`, así que está
	 *      visible siempre que Forma de Pago muestre texto legible.
	 *
	 * `BasePage.openDropdown` clickea con `{ force: true }`; acá NO se fuerza a propósito: un click
	 * forzado atravesaría un overlay y taparía justamente la clase de problema que se está midiendo
	 * (además `playwright/no-force-option` es `error` en este repo).
	 */
	private paymentMethodsTriggers(): { label: string; locator: Locator }[] {
		const container = this.page.locator('#add_travel_payment_methods');

		return [
			{ label: '.data-with-icon-col.option-content-container (grabación validada)', locator: container.locator('.data-with-icon-col.option-content-container').first() },
			{ label: '.below > .single > .value (BasePage)', locator: container.locator('.below > .single > .value').first() },
			{ label: '.below > .single > .placeholder (BasePage, sin valor elegido)', locator: container.locator('.below > .single > .placeholder').first() },
			{ label: '.value (paymentMethodValue del POM legacy)', locator: container.locator('.value').first() }
		];
	}

	/**
	 * UNA pasada de apertura: recorre los triggers conocidos y devuelve el estado resultante.
	 *
	 * IDEMPOTENTE — si ya está abierto NO clickea nada. Un "abrir siempre" lo CERRARÍA, que es
	 * exactamente el bug que esta familia de métodos existe para no reintroducir.
	 *
	 * El diagnóstico enumera QUÉ triggers se probaron y con qué error murió cada click, porque el
	 * mensaje genérico de la primera pasada de la ronda 3 no permitía distinguir "no hay trigger" de
	 * "el click no abrió" — y ésa era la información que hacía falta.
	 *
	 * @returns `DROPDOWN_OPEN` si quedó abierto; si no, el motivo legible.
	 */
	private async attemptOpenPaymentMethodsDropdown(): Promise<string> {
		if (await this.isPaymentMethodsDropdownOpen()) {
			return DROPDOWN_OPEN;
		}

		const attempted: string[] = [];

		for (const trigger of this.paymentMethodsTriggers()) {
			if (!(await trigger.locator.isVisible().catch(() => false))) {
				continue;
			}

			const clickError = await trigger.locator
				.click({ timeout: 3_000 })
				.then(() => '')
				.catch((error: Error) => ` → ${error.message.split('\n')[0]}`);

			attempted.push(`${trigger.label}${clickError}`);
			if (await this.isPaymentMethodsDropdownOpen()) {
				return DROPDOWN_OPEN;
			}
		}

		const detail = attempted.length ? `ningún trigger lo desplegó [${attempted.join(' · ')}]` : 'el selector no expone ningún trigger visible';

		return `${detail} (Forma de Pago: "${await this.legacy.getPaymentMethodText()}")`;
	}

	/**
	 * Reintenta la apertura de forma OBSERVABLE y devuelve el estado final SIN lanzar.
	 *
	 * El reintento no es una espera fija: cada iteración MIDE el estado y vuelve a probar los
	 * triggers. Hace falta porque el click puede perderse mientras el modal de confirmación del
	 * borrado se desmonta.
	 */
	private async resolvePaymentMethodsDropdownState(timeout: number): Promise<string> {
		let state = 'no se intentó abrir el desplegable';

		await expect
			.poll(
				async () => {
					state = await this.attemptOpenPaymentMethodsDropdown();

					return state;
				},
				{ message: 'El desplegable de Forma de Pago no llegó a abrirse.', timeout, intervals: [250, 250, 500, 500, 1_000, 1_000] }
			)
			.toBe(DROPDOWN_OPEN)
			// El "no abrió" no es un fallo de este método: es el estado que reporta a quien llama.
			.catch(() => undefined);

		return state;
	}

	/**
	 * Intento TOLERANTE de apertura, para los DETECTORES: informa si se pudo abrir y por qué no.
	 *
	 * Existe porque hay un estado en el que el selector legítimamente NO es operable —con el form de
	 * tarjeta NUEVA ya montado no expone ningún trigger visible (medido en la ronda 3)— y ahí "no pude
	 * mirar la lista" no debe convertirse en un fallo del test. Lo que sí queda prohibido es que ese
	 * "no pude mirar" pase por "no está": el motivo se devuelve para que el llamador lo loguee.
	 */
	private async tryOpenPaymentMethodsDropdown(timeout = 10_000): Promise<{ open: boolean; reason: string }> {
		const state = await this.resolvePaymentMethodsDropdownState(timeout);

		return { open: state === DROPDOWN_OPEN, reason: state };
	}

	/**
	 * Deja el desplegable de Forma de Pago ABIERTO —verificándolo— y LANZA con diagnóstico si no lo
	 * consigue. Es la variante para los caminos en los que SIN el desplegable abierto no hay flujo
	 * posible (elegir la opción de tarjeta nueva, borrar la guardada, elegir una vinculada).
	 *
	 * ⚠️ HALLAZGO 4 (ronda 2, 2026-07-29). Antes devolvía `boolean` y sus llamadores lo DESCARTABAN:
	 * `chooseNewPreauthorizedCardOption()` lo invocaba y seguía como si hubiera abierto, así que un
	 * `false` silencioso se manifestaba 10 s más tarde en un `toBeVisible()` que culpaba a la opción
	 * "Tarjeta de Crédito - Preautorizada" de no existir, cuando el desplegable simplemente seguía
	 * cerrado (los dos snapshots del fallo lo muestran en `▼` con el default del pax: "Cuenta
	 * Corriente" en TC1051, "Efectivo" en TC1061). Es la trampa de vacuidad #6 del repo: un método que
	 * devuelve `false` en silencio y cuyo retorno nadie mira es un `if` que miente.
	 */
	private async openPaymentMethodsDropdown(): Promise<void> {
		const state = await this.resolvePaymentMethodsDropdownState(10_000);

		// Debería quedar abierto: el mensaje reporta el estado REAL del selector en lugar de dejar que
		// muera un paso posterior por una causa equivocada.
		expect(state, 'El desplegable de Forma de Pago no llegó a abrirse.').toBe(DROPDOWN_OPEN);
	}

	/**
	 * ¿El cliente ya tiene vinculada una tarjeta con esos últimos 4 dígitos?
	 *
	 * Chequea DOS señales, porque una sola no alcanza:
	 *   1. El selector de Forma de Pago ya la muestra SELECCIONADA ("Tarjeta de crédito VISA *** 1111").
	 *      Es el caso normal: cuando el pasajero tiene una tarjeta, el sistema la elige sola.
	 *   2. Está en el desplegable sin estar seleccionada.
	 * La (1) fue la que faltaba: en la corrida del 2026-07-27 la detección sólo miraba el desplegable,
	 * devolvió false con la tarjeta *** 1111 ya seleccionada, no se borró nada, y el test murió
	 * después porque el form de tarjeta nueva no se renderiza si ya hay una tarjeta elegida.
	 */
	@step
	async hasSavedCardWithLast4(last4: string): Promise<boolean> {
		if (await this.legacy.hasSelectedCardWithLast4(last4)) {
			return true;
		}

		// DETECTOR tolerante, y el porqué importa: hay un estado en que el selector NO es operable —con
		// el form de tarjeta NUEVA ya montado no expone ningún trigger visible, medido en la ronda 3:
		// "cerrado y sin trigger visible (Forma de Pago: 'Tarjeta de Crédito - Preautorizada')"—. Ahí no
		// se puede inspeccionar la lista, así que este método informa `false` PERO deja el motivo
		// logueado (`DEBUG=gateway-pg:wallet`): un "no pude mirar" no debe hacerse pasar por "no está"
		// sin dejar rastro (trampa de vacuidad #6).
		//
		// La PRUEBA del borrado no depende de este método: la lleva `expectSavedCardDeleted()`, que
		// corre justo después del borrado, cuando el desplegable sí es operable. Por eso la
		// post-condición del motor (`hasSavedCardWithLast4(...) === false`, paso 9 de
		// `stepwise-hold-journey`) queda como verificación REDUNDANTE y no como la única.
		const dropdown = await this.tryOpenPaymentMethodsDropdown();

		if (!dropdown.open) {
			debugLog('gateway-pg:wallet', `hasSavedCardWithLast4(${last4}): no se pudo inspeccionar el desplegable (${dropdown.reason}) — se informa false, la prueba del borrado la tiene expectSavedCardDeleted()`);

			return false;
		}

		const found = (await this.savedCardByLast4(last4).count()) > 0;

		// Un DETECTOR no debe dejar la UI cambiada. Antes este método dejaba el desplegable ABIERTO y
		// los caminos siguientes tenían que adivinar en qué estado lo encontraban — el origen común de
		// los hallazgos 4 y 5. Además, cuando el motor lo llama DESPUÉS de elegir el método (paso 9 de
		// `stepwise-hold-journey`), la lista abierta TAPA el form de tarjeta nueva y el fill muere
		// culpando al campo del número (medido en la ronda 3, TC1061).
		await this.closePaymentMethodsDropdown();

		return found;
	}

	/**
	 * Elimina la tarjeta vinculada que COINCIDE con `last4`, si está visible en el desplegable de
	 * métodos de pago. Devuelve true si borró alguna. Precondición del alta de tarjeta nueva.
	 *
	 * REGLA DE NEGOCIO (BL-050, confirmada por el líder de QA): si el cliente ya tiene vinculada
	 * una tarjeta con el MISMO NÚMERO que la que se va a adicionar, el botón "Validar" **no se
	 * habilita**. Hay que comparar la tarjeta de prueba contra las visibles en el desplegable y,
	 * si coincide, eliminarla para poder avanzar. La unicidad es por NÚMERO — no depende del
	 * titular ni de que la tarjeta esté seleccionada.
	 *
	 * Diferencia con `deleteHighlightedSavedCard()`: ése scopea a `.highlighted`, así que sólo ve
	 * la tarjeta SELECCIONADA — una vinculada pero no resaltada bloquea igual y quedaba sin
	 * borrar. La grabación validada por QA (`tests/test-3.spec.ts`) usa `.deselect-payment-method`
	 * sin ese filtro.
	 */
	@step
	async deleteSavedCardByLast4(last4: string): Promise<boolean> {
		// LANZA si el desplegable no abre (ver `openPaymentMethodsDropdown`). El `false` de este método
		// sigue significando lo mismo que antes —"no había nada que borrar"—, y ahora sólo lo devuelve
		// cuando el desplegable SÍ se pudo mirar y no había trash.
		await this.openPaymentMethodsDropdown();

		// Se intenta primero el match por last4 y, si el desplegable no expone la opción de esa forma,
		// se cae a la tarjeta RESALTADA — que es la seleccionada, o sea la que hay que borrar cuando
		// el sistema ya la eligió sola. Los dos caminos existen porque la estructura del desplegable
		// no es estable entre pantallas (ver la corrida del 2026-07-27).
		const byLast4 = this.savedCardByLast4(last4);
		const trash = (await byLast4.count()) ? byLast4.first().locator('.deselect-payment-method').first() : this.page.locator('#add_travel_payment_methods').locator('.highlighted .deselect-payment-method').first();

		if (!(await trash.isVisible().catch(() => false))) {
			return false;
		}
		await trash.click();
		// Confirmación bilingüe: el portal del spec queda en ES ("Eliminar") por
		// `ensureSpanishLanguage`, pero una sesión manual puede estar en inglés ("Delete").
		await this.page.getByRole('button', { name: /^(Delete|Eliminar)$/i }).click();
		// Debería desaparecer: ni el selector de Forma de Pago la muestra, ni queda en el desplegable.
		await expect
			.poll(async () => this.legacy.hasSelectedCardWithLast4(last4), {
				message: `La tarjeta •••• ${last4} sigue seleccionada en Forma de Pago tras eliminarla`,
				timeout: 10_000
			})
			.toBe(false);

		return true;
	}

	// ── Assertions funcionales del formulario ────────────────────────────────────────
	// Verifican el COMMIT de cada paso y los defaults que la pantalla aplica sola. Sin ellas los
	// pasos del journey ejecutan sin verificar y un dato que no se setea pasa desapercibido hasta
	// mucho después (o nunca) — ver `assertOriginSet` en el POM legacy para el caso concreto.

	/** El cliente quedó seleccionado (match token-based: el portal usa "apellido, nombre"). */
	@step
	async assertClientSelected(name: string): Promise<void> {
		await this.legacy.assertClientSelected(name);
	}

	/** El pasajero quedó asignado — elegido o auto-asignado por el cliente. */
	@step
	async assertPassengerSelected(name: string): Promise<void> {
		await this.legacy.assertPassengerSelected(name);
	}

	/**
	 * El Tipo de Servicio quedó auto-seleccionado en "Regular" al elegir el cliente/pasajero.
	 * Default que aplica la pantalla sola — no se setea desde el test.
	 */
	@step
	async assertDefaultServiceTypeRegular(): Promise<void> {
		await this.legacy.assertDefaultServiceTypeRegular();
	}

	/** El origen quedó commiteado en el form (cubre el camino de éxito silencioso de `setOrigin`). */
	@step
	async assertOriginSet(address: string): Promise<void> {
		await this.legacy.assertOriginSet(address);
	}

	/** El destino quedó commiteado en el form. */
	@step
	async assertDestinationSet(address: string): Promise<void> {
		await this.legacy.assertDestinationSet(address);
	}

	/** La forma de pago quedó en "Tarjeta de Crédito - Preautorizada". */
	@step
	async assertPaymentMethodPreauthorizedSelected(): Promise<void> {
		await this.legacy.assertPaymentMethodPreauthorizedSelected();
	}

	/** No se puede avanzar al armado del viaje sin validar la tarjeta (regla de negocio). */
	@step
	async assertVehicleSelectionBlocked(): Promise<void> {
		await this.legacy.assertVehicleSelectionBlocked();
	}

	/** Texto actual del selector de Forma de Pago — para diagnóstico en mensajes de error. */
	@step
	async getPaymentMethodText(): Promise<string> {
		return this.legacy.getPaymentMethodText();
	}

	/** Verifica que haya una tarjeta vinculada RESALTADA en el dropdown de métodos de pago. */
	@step
	async expectHighlightedSavedCard(): Promise<void> {
		await expect(this.page.locator('#add_travel_payment_methods').locator('.highlighted .data-with-icon-col').first()).toBeVisible({
			timeout: 10_000
		});
	}
}
