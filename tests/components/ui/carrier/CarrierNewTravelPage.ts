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
import { NewTravelPage as LegacyNewTravelPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type { NewTravelFormInput } from '@pages/carrier';

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
	@atc('MG-148', { severity: 'critical', description: 'Alta de viaje: completar formulario + validar tarjeta preautorizada' })
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
	@atc('MG-161', { severity: 'critical', description: 'Alta de viaje Cargo a Bordo: completar formulario + método Cargo a Bordo' })
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
	 * Click en "Validar" del form NATIVO Angular y espera el oráculo de tarjeta válida
	 * ("Tarjeta válida" / "Valid card") — VERIFICADO en vivo para Authorize (4111/900/10001);
	 * eBiz comparte el form (oráculo asumido, TODO live). Para Stripe Elements usar el flujo
	 * `fillMinimum`/`selectCardByLast4` (valida vía `clickValidateCard` del POM legacy).
	 */
	@step
	async validateNativeCard(last4?: string): Promise<void> {
		const outcome = await this.readNativeCardValidationOutcome(last4);

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
	 * No reusa `clickValidateCardAllowingReject()` del POM legacy por dos razones verificables:
	 *   1. Ese método devuelve `success:false` con el mensaje sintético "Validar button never
	 *      enabled and no Stripe error surfaced" cuando expira sin error — o sea, convierte el
	 *      timeout de ambiente en un falso decline.
	 *   2. Sus locators son de Stripe: `validateCardButton` es `/^Validar$/i` (sólo español,
	 *      rompe si el portal queda en inglés) y `cardValidationErrorText` apunta a
	 *      `app-credit-card-payment-data-validate`, el sub-componente de Stripe Elements.
	 *
	 * @returns el texto del error mostrado al usuario, para que el spec lo registre como evidencia.
	 */
	@step
	async expectNativeCardRejected(last4?: string): Promise<string> {
		const outcome = await this.readNativeCardValidationOutcome(last4);

		// Debería mostrar el error de la pasarela y NO vincular la tarjeta. Los dos desenlaces que
		// NO son 'rejected' se distinguen a propósito, porque mandan a investigar lugares distintos:
		//   · 'accepted' → la pasarela ACEPTÓ una tarjeta que debía rechazar. Es el hallazgo del caso:
		//     o la política de la cuenta no está guardada (filtros AVS/CVV en "hold for review" en vez
		//     de Decline), o MAGIIS ignora el rechazo. NO es un problema del test.
		//   · 'timeout'  → no hubo respuesta: ambiente/red. El caso no es concluyente.
		expect(outcome, outcome === 'accepted' ? `La pasarela ACEPTÓ y vinculó la tarjeta •••• ${last4 ?? '????'} que debía rechazar. Revisar en el dashboard del sandbox si la transacción quedó en "Fraud Review" (Response Code 4 = retenida para revisión, que MAGIIS trata como válida) en lugar de declinada — eso indica que la acción del filtro es "Authorize and hold for review" y no "Decline".` : 'Tras "Validar" no apareció ni el error ni la confirmación — la pasarela no respondió (revisar ambiente/red), así que el caso no es concluyente.').toBe('rejected');

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

		if (hadSavedCard) {
			// Rama "pax CON tarjeta". El click en `.highlighted` sólo corresponde cuando la opción
			// RESALTADA **es** la tarjeta: seleccionarla es lo que expone su ícono de borrado
			// (secuencia de la grabación validada, con el pax cuya tarjeta el sistema ya eligió sola).
			//
			// Si el método por defecto del pax es OTRO, ese click selecciona el método equivocado y
			// CIERRA el desplegable, así que el trash desaparece del DOM y el borrado muere por
			// timeout. Observado el 2026-07-29 en TS-AUTHORIZE-TC1051 (3/3) y TS-AUTHORIZE-TC1061:
			// el snapshot del fallo muestra "Forma de Pago" en **"Cuenta Corriente"** con el
			// desplegable ya cerrado (`▼`), y el timeout cae en el trash de fallback
			// (`#add_travel_payment_methods .deselect-payment-method`).
			//
			// Cuando la tarjeta está sólo LISTADA (no seleccionada), su fila ya trae su propio trash,
			// así que alcanza con dejar el desplegable abierto y delegar en
			// `deleteHighlightedOrByLast4`, que prefiere el trash de la fila que matchea `last4`.
			if (await this.legacy.hasSelectedCardWithLast4(last4)) {
				await this.openPaymentMethodsDropdown();
				await this.highlightedOption().click();
			} else if (
				!(await this.savedCardByLast4(last4)
					.first()
					.isVisible()
					.catch(() => false))
			) {
				await this.openPaymentMethodsDropdown();
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
		//   · `legacy.selectPaymentMethod` vuelve a ABRIR el desplegable, pero acá ya quedó abierto
		//     por `hasSavedCardWithLast4()`; con el desplegable abierto el trigger que busca
		//     `BasePage.openDropdown` (`.below > .single > .value`) no existe en el DOM y falla con
		//     "element(s) not found" (corrida TC1016 del 2026-07-28: snapshot en "▲" con la lista
		//     desplegada).
		//   · `.highlighted` es la opción SELECCIONADA, no la de tarjeta nueva — depende de qué tenía
		//     elegido el pasajero antes.
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
	 * `chooseNewPreauthorizedCardOption()`: quien llama suele venir de `hasSavedCardWithLast4()`,
	 * que deja el desplegable ABIERTO, y en ese estado el trigger que busca `BasePage.openDropdown`
	 * ya no existe en el DOM (causa raíz del fallo de TC1016 el 2026-07-28). Por eso NO se delega en
	 * `legacy.selectSavedCardByLast4()`, que siempre asume el desplegable cerrado.
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
	 * Borra la tarjeta guardada: intenta el trash de la que coincide por `last4` y cae al de la
	 * resaltada. Los dos caminos existen porque la estructura del desplegable no es estable entre
	 * pantallas — la grabación usa `.deselect-payment-method` sin filtro de `.highlighted`.
	 */
	private async deleteHighlightedOrByLast4(last4: string): Promise<void> {
		const byLast4 = this.savedCardByLast4(last4);
		const trash = (await byLast4.count()) ? byLast4.first().locator('.deselect-payment-method').first() : this.page.locator('#add_travel_payment_methods').locator('.deselect-payment-method').first();

		await trash.click();
		// Confirmación bilingüe: el portal del spec queda en ES por `ensureSpanishLanguage`; una
		// sesión manual puede estar en inglés ("Delete", como en las grabaciones).
		await this.page.getByRole('button', { name: /^(Delete|Eliminar)$/i }).click();
		// Debería desaparecer de Forma de Pago la tarjeta con esos last4.
		await expect
			.poll(async () => this.legacy.hasSelectedCardWithLast4(last4), {
				message: `La tarjeta •••• ${last4} sigue seleccionada tras eliminarla`,
				timeout: 10_000
			})
			.toBe(false);
	}

	/** Abre el desplegable de métodos de pago. Devuelve false si no está disponible. */
	/**
	 * Elige la opción "Tarjeta de Crédito - Preautorizada" del desplegable de Forma de Pago.
	 *
	 * IDEMPOTENTE respecto del estado del desplegable: si ya está abierto usa la lista visible, y
	 * si está cerrado lo abre. Esa propiedad es el punto del método — los caminos que llegan acá
	 * dejan el desplegable en estados distintos según si el pasajero tenía tarjeta guardada, y
	 * asumir uno de los dos es exactamente lo que rompió TC1016 el 2026-07-28.
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

	private async openPaymentMethodsDropdown(): Promise<boolean> {
		const opener = this.page.locator('#add_travel_payment_methods').locator('.below .single .value').first();

		if (!(await opener.isVisible().catch(() => false))) {
			return false;
		}
		await opener.click();

		return true;
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
		if (!(await this.openPaymentMethodsDropdown())) {
			return false;
		}

		return (await this.savedCardByLast4(last4).count()) > 0;
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
		if (!(await this.openPaymentMethodsDropdown())) {
			return false;
		}

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
