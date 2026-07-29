/**
 * Factory parametrizada — Suite CARGO · Cargo a Bordo (cobro en la Driver App).
 * ==============================================================================
 *
 * `defineCargoABordoSuite(gateway)` genera los 9 casos PORTABLES del área CARGO
 * (tipo de cliente × outcome: happy · decline genérico · decline por CVC/CVV, para app pax,
 * colaborador y empresa individuo), gobernados por el adapter declarativo
 * (`helpers/adapters`) y el registry Xray local (`data/xray-keys.ts` → `cargo` / `cargoTcIds`).
 *
 * Arquitectura del flujo (idéntica en las 3 pasarelas — el DATO es lo único que cambia):
 *   - WEB (carrier): alta de viaje con método "Cargo a Bordo" → viaje creado. NO hay form de
 *     tarjeta ni 3DS en carrier: Cargo a Bordo NO requiere tarjeta preautorizada.
 *   - DRIVER APP (Appium): el conductor finaliza el viaje y cobra → la pasarela aprueba/rechaza.
 *     Con `APPIUM=1` la fase corre de verdad; sin Appium el Step la marca `test.fixme` y sólo
 *     queda validada la fase web.
 *
 * ── Por qué Stripe NO consume esta factory ────────────────────────────────────────────────────
 * Stripe conserva sus 12 specs propios en `specs/stripe/web/carrier/cargo-a-bordo/` (33 casos).
 * Sólo 9 de esos 33 son portables: los otros 24 son familias ANTIFRAUDE (Stripe Radar —
 * `highest_risk`, `always_blocked`, `cvc_check_fail_elevated`, `zip_fail_elevated`,
 * `address_unavailable`) y 3DS (`three_ds_required`, `visa_3ds_fail`, `error_3ds`,
 * `declined_after_3ds`) que NO tienen intent canónico ni equivalente cross-gateway (Authorize
 * expone AVS/CVV; eBizCharge tiene Fraud Profiler, sin tarjetas trigger publicadas). Migrar los
 * specs Stripe a esta factory PERDERÍA esos 24 casos, así que no se migran: la factory cubre la
 * intersección portable y Stripe mantiene su superset.
 *
 * REGLAS load-bearing (trazabilidad emit-all del xray-reporter):
 *   1. Annotation `{type:'tms',description:<MG-key>}` POR TEST, resuelta del registry DENTRO del
 *      loop. Todo el área CARGO tiene keys `null` en las 4 pasarelas (no existen Tests Xray
 *      espejo) → HOY esta factory NO emite ninguna annotation. JAMÁS inventar keys.
 *   2. Título con el TC ID de matriz cuando existe: `[TS-<GW>-TCxxxx] @cargo-a-bordo Validar …`.
 *      TC ID `null` (Mercado Pago: su matriz no tiene sección Cargo) → título sin corchete.
 *   3. `test.skip(!adapter.isConfigured(), …)` a nivel describe (gate de credenciales).
 *   4. SIN locators en la factory (regla KATA): toda interacción va por el Step
 *      `CargoABordoSteps` (que orquesta los ATC de las Page components).
 *   5. Tarjeta y outcome del cobro vía `resolveDriverCharge({gateway,intent})` — nunca
 *      `STRIPE_TEST_CARDS_RAW` ni PANs literales.
 *
 * Casos por pasarela (filtrados por `SUPPORTED_INTENTS_BY_GATEWAY`, el resolver LANZA si se pide
 * un intent no soportado):
 *   - stripe: 6 intents → los 9 casos (pero Stripe no consume esta factory, ver arriba).
 *   - authorize: 4 intents → los 9 casos.
 *   - ebizcharge: 3 intents (HAPPY_NO_AUTH · DECLINE_AUTHORIZE · DECLINE_INVALID_CVC) → los 9.
 *   - mercado-pago: 3 intents → los 9 se generan, todos con TC ID `null`.
 *
 * ── Qué falta confirmar EN VIVO (ambiente `apps-test` CAÍDO al 2026-07-28) ────────────────────
 *   - Ningún caso generado corrió: ni la fase web (login por cadena de creds por pasarela, alta
 *     con "Cargo a Bordo" sobre un carrier con Authorize/eBiz vinculada) ni la fase driver.
 *   - El mapeo intent → outcome del cobro está DERIVADO del área HOLD (ver
 *     `helpers/cargo-driver-charge.ts`), no observado en el modal de cobro de la Driver App.
 *   - eBizCharge: el form de tarjeta del modal de cobro de la Driver App está SIN VERIFICAR
 *     (se asume el mismo que hoy renderiza `DriverTripPaymentScreen`), y su
 *     `adapter.nativeExtraField` sigue SIN CONFIRMAR — si eBiz pide un 5° campo, `CardData` no
 *     lo modela y el cobro fallaría por dato faltante, no por la tarjeta.
 *   - `driverAppStep` requiere `APPIUM=1` + el teléfono físico dentro de la geocerca del pickup
 *     (ver `DRIVER_E2E_PICKUP`); sin eso la fase driver queda `test.fixme` por diseño.
 */

import type { GatewayName, CardIntent } from '@fixtures/gateways/_shared';
import type { GatewayCargoCase, XrayIssueKey } from '@features/gateway-pg/data/xray-keys';
import type { CargoScenario } from '@steps/index';

import { test } from '@TestFixture';
import { CargoABordoSteps } from '@steps/index';
import { SUPPORTED_INTENTS_BY_GATEWAY } from '@fixtures/gateways/_shared';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { resolveDriverCharge } from '@features/gateway-pg/helpers/cargo-driver-charge';

/**
 * E2E DRIVER: el pickup DEBE estar dentro del radio (500m) de la ubicación física del teléfono
 * (Ciudad de la Paz 2238, Belgrano, CABA — GPS device -34.5616,-58.4590); si no, el conductor
 * queda fuera de rango y no puede iniciar el viaje (geocerca). Mismo valor que usan los 12 specs
 * de cargo Stripe; NO toca `JOURNEY_DEFAULTS.origin` (que consumen ~399 tests web) y estos casos
 * no asertan el origin.
 */
export const DRIVER_E2E_PICKUP = 'Ciudad de la Paz 2238, Buenos Aires, Argentina';

/** Los 9 casos CARGO en orden canónico de matriz (personal → colaborador → empresa). */
export const GATEWAY_CARGO_ALL_CASES: GatewayCargoCase[] = [
	'personalHappy',
	'personalDeclineGeneric',
	'personalDeclineCvv',
	'colaboradorHappy',
	'colaboradorDeclineGeneric',
	'colaboradorDeclineCvv',
	'empresaHappy',
	'empresaDeclineGeneric',
	'empresaDeclineCvv'
];

/** Tipo de cliente del alta de viaje — determina cliente/pasajero del formulario. */
type CargoClientType = 'appPax' | 'colaborador' | 'empresa';

/** Descomposición de cada caso en sus dos ejes: tipo de cliente × intención de tarjeta. */
const CARGO_CASE_AXES: Record<GatewayCargoCase, { clientType: CargoClientType; intent: CardIntent }> = {
	personalHappy: { clientType: 'appPax', intent: 'HAPPY_NO_AUTH' },
	personalDeclineGeneric: { clientType: 'appPax', intent: 'DECLINE_AUTHORIZE' },
	personalDeclineCvv: { clientType: 'appPax', intent: 'DECLINE_INVALID_CVC' },
	colaboradorHappy: { clientType: 'colaborador', intent: 'HAPPY_NO_AUTH' },
	colaboradorDeclineGeneric: { clientType: 'colaborador', intent: 'DECLINE_AUTHORIZE' },
	colaboradorDeclineCvv: { clientType: 'colaborador', intent: 'DECLINE_INVALID_CVC' },
	empresaHappy: { clientType: 'empresa', intent: 'HAPPY_NO_AUTH' },
	empresaDeclineGeneric: { clientType: 'empresa', intent: 'DECLINE_AUTHORIZE' },
	empresaDeclineCvv: { clientType: 'empresa', intent: 'DECLINE_INVALID_CVC' }
};

const CLIENT_TYPE_LABEL: Record<CargoClientType, string> = {
	appPax: 'cliente app pax',
	colaborador: 'cliente colaborador/contractor',
	empresa: 'cliente empresa individuo'
};

const INTENT_LABEL: Partial<Record<CardIntent, string>> = {
	HAPPY_NO_AUTH: 'cobro exitoso',
	DECLINE_AUTHORIZE: 'cobro rechazado genérico',
	DECLINE_INVALID_CVC: 'cobro rechazado por CVC/CVV incorrecto'
};

export type CargoABordoSuiteOptions = {
	/** Casos a generar (default: los 9). Orden de generación = orden recibido. */
	cases?: GatewayCargoCase[];
	/** Origin del viaje (default `DRIVER_E2E_PICKUP` — requisito de geocerca de la fase driver). */
	origin?: string;
	/** Timeout del poll de creación (POST /travels) que pasa el Step. Default 30_000. */
	createTimeout?: number;
	/**
	 * Asignación MANUAL directa al conductor en vez de Send Service (elimina el timer de
	 * oferta-candidato; requerido para el e2e driver estable). Default false.
	 *
	 * Si se omite, cae a la env var `CARGO_MANUAL_ASSIGN=1`. Existe porque los dos modos cubren
	 * cosas DISTINTAS y la elección es del que corre, no del spec:
	 *   - OFF (default): el carrier selecciona "Cargo a Bordo" como forma de pago → valida ESE
	 *     flujo web. Pero el viaje queda a la espera de oferta-candidato y NUNCA se asigna al
	 *     conductor, así que la fase driver muere esperando (`No llegó/asignó ningún viaje al
	 *     conductor (TravelConfirmPage) en 90000ms`, observado en TC1081 el 2026-07-29).
	 *   - ON: viaje PLANO (sin forma de pago — seleccionar "Cargo a Bordo" oculta "Send Manual")
	 *     + Send Manual → Assign. El conductor recibe el viaje y elige la tarjeta en el Resumen,
	 *     que es lo único que permite ACREDITAR el cobro de los TC "…desde la Driver App".
	 */
	manualAssign?: boolean;
	/** Tags extra del título del test (ej. '@smoke'). */
	extraTags?: string;
};

/**
 * Cliente/pasajero del formulario por tipo de cliente, desde los journey defaults de la
 * pasarela (S8 — `adapter.journeyDefaults`, jamás nombres hardcodeados acá).
 * El cliente app pax AUTO-ASIGNA el pasajero → se omite `passenger` (contrato del Step).
 */
function scenarioFor(gateway: GatewayName, clientType: CargoClientType, origin: string): CargoScenario {
	const defaults = getGatewayPgAdapter(gateway).journeyDefaults;
	const base = { origin, destination: defaults.destination, gateway };

	switch (clientType) {
		case 'appPax':
			return { ...base, client: defaults.appPaxPassenger };
		case 'colaborador':
			return { ...base, client: defaults.contractorClient, passenger: defaults.contractorPassenger };
		case 'empresa':
			return { ...base, client: defaults.client, passenger: defaults.passenger };
	}
}

/**
 * Genera la suite CARGO de `gateway`. Ver doc del módulo para reglas y cobertura.
 *
 * Los casos cuyo intent no soporta la pasarela se OMITEN (no se generan como fixme): pedirle a
 * `resolveCard` un intent no soportado lanza, y un test que promete un rechazo que la pasarela no
 * sabe producir corrompe el reporting de cobertura.
 */
export function defineCargoABordoSuite(gateway: GatewayName, options: CargoABordoSuiteOptions = {}): void {
	const adapter = getGatewayPgAdapter(gateway);
	const registry = adapter.xrayKeys;
	const cases = options.cases ?? GATEWAY_CARGO_ALL_CASES;
	const origin = options.origin ?? DRIVER_E2E_PICKUP;
	const createTimeout = options.createTimeout ?? 30_000;
	// Ver el JSDoc de `manualAssign`: opt-in por env para acreditar el cobro en la Driver App
	// sin cambiar el default de los 9 casos web ni el de eBizCharge.
	const manualAssign = options.manualAssign ?? process.env.CARGO_MANUAL_ASSIGN === '1';
	const extraTags = options.extraTags ? `${options.extraTags} ` : '';
	const supportedIntents: readonly CardIntent[] = SUPPORTED_INTENTS_BY_GATEWAY[gateway];

	// Tag de pasarela SIN guiones (S9): 'mercado-pago' → '@mercadopago' — los scripts npm por
	// pasarela grepean el tag normalizado; el identifier de código NO cambia.
	const gatewayTag = gateway.replace(/-/g, '');

	test.describe(`Gateway PG · Carrier · Cargo a Bordo ${adapter.displayName} @gateway @${gatewayTag} @cargo-a-bordo @regression`, () => {
		test.describe.configure({ timeout: 120_000 });
		// El fixture KATA no define la opción `role` — login explícito vía el Step (loginAsDispatcher).
		test.use({ storageState: { cookies: [], origins: [] } });

		test.skip(!adapter.isConfigured(), `Requiere ${adapter.credsEnvKeys.join(' + ')} en .env.test (gate del adapter ${gateway}).`);

		for (const cargoCase of cases) {
			const { clientType, intent } = CARGO_CASE_AXES[cargoCase];
			if (!supportedIntents.includes(intent)) {
				// Intent inaplicable a esta pasarela (ej. un decline que su sandbox no expone) → no se
				// genera el caso. Queda visible como TC de matriz sin automatización, no como test verde.
				continue;
			}

			const tcId = registry.cargoTcIds[cargoCase];
			const key: XrayIssueKey | null = registry.cargo[cargoCase];
			const title = `${tcId ? `[${tcId}] ` : ''}${extraTags}@cargo-a-bordo Validar ${INTENT_LABEL[intent]} a ${CLIENT_TYPE_LABEL[clientType]} desde la Driver App`;
			// Key null = sin issue Xray aún → SIN annotation (unmapped visible; no inventar keys).
			const details = key ? { annotation: [{ type: 'tms', description: key }] } : {};
			// resolveDriverCharge es puro/síncrono → resoluble en tiempo de definición (falla rápido
			// si la pasarela no soporta el intent o si el intent no tiene outcome verificado).
			const charge = resolveDriverCharge({ gateway, intent });
			const scenario = scenarioFor(gateway, clientType, origin);

			test(title, details, async ({ page }) => {
				await new CargoABordoSteps({ page }).runCargoScenario(scenario, {
					createTimeout,
					manualAssign,
					driverAppStep: {
						title: `[DRIVER APP] Conductor finaliza el viaje y cobra (•••• ${charge.card.number.slice(-4)}) → ${charge.expectedOutcome === 'success' ? 'cobro aprobado' : 'cobro rechazado'}`,
						note: `PENDIENTE: fase Driver App — requiere Appium (APPIUM=1) sobre el teléfono físico. Cobro ${adapter.displayName} intent ${intent}.`,
						charge
					}
				});
			});
		}
	});
}
