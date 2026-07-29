/**
 * BL-028 — piloto parametrizado multi-gateway · Hold happy path sin 3DS
 * =====================================================================
 *
 * Demuestra el patrón habilitado por BL-024 (Fase 3): el mismo flujo de UI
 * Carrier corre contra múltiples gateways de pago; sólo cambia el dato
 * resuelto por `resolveCard({ gateway, intent })`. El resto del journey
 * (login dispatcher, alta de viaje, selección de vehículo, validación en
 * grilla "Por asignar") es agnóstico del gateway porque se delega al Step
 * KATA `CarrierHoldSteps.runHoldScenario` (dominio MAGIIS, no del SDK de pago).
 *
 * S7 (carrier/gateway-standardization) — `ACTIVE_GATEWAYS` ya NO está hardcodeado:
 * `resolveActiveGateways()` (helpers/adapters) resuelve el set en tiempo de colección:
 *   1. Pin explícito por env `GATEWAYS` (CSV, ej. `GATEWAYS=stripe,mercado-pago`) — gana.
 *   2. Default: adapters con `isConfigured()` true (stripe sin creds propias = siempre).
 * El Step resuelve la tarjeta y el card form POR PASARELA (`gateway` en el scenario);
 * los datos de journey salen de `journeyDefaultsFor(gateway)` (S8).
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón cross-gateway
 * sobre el Step KATA.
 *   - test/expect vienen del fixture unificado KATA (@TestFixture) en vez de TestBase.
 *   - El journey se delega a `CarrierHoldSteps.runHoldScenario` (@steps); el dato de
 *     tarjeta lo resuelve el Step vía `resolveCard`, preservando la naturaleza
 *     cross-gateway del piloto (el `resolveCard` local es sanity del contrato).
 *   - Los ATC viven en las Page components que orquesta el Step (fillMinimum → MG-148,
 *     expectPassengerInPorAsignar → MG-158). mapeo por área aceptado (idmap API-level, sin 1:1
 *     con TS-STRIPE-TC10xx).
 *
 * Trazabilidad:
 *   - Mismo dato lógico que TS-STRIPE-TC1049 (hold ON + tarjeta 4242, sin 3DS),
 *     pero estructurado para demostrar el patrón cross-gateway.
 *   - authorize ejercita la card `4111 1111 1111 1111` con CVV `900` (SUCCESS sandbox);
 *     mercado-pago la Visa 3704 con holder APRO (trigger del outcome).
 *   - La instancia **authorize** es el análogo de la fila de matriz
 *     **TS-AUTHORIZE-TC1011** (`docs/gateway-pg/authorize/matriz_cases.md` §1): Visa
 *     4111…1111 + CVV 900, Hold ON, viaje visible en la columna "Por asignar". Se mapea
 *     como ANÁLOGO, no como 1:1 — este piloto valida el patrón cross-gateway, mientras
 *     TC1011 exige además el oráculo de DB (`payments.gateway=authorize`, `response_code=1`,
 *     `transaction_id` no nulo) que este spec no cubre.
 *   - ⚠️ La key `MG-158` del describe raíz pertenece al **ATR de Stripe** (área E del ATP
 *     MG-178); Authorize NO tiene área E en el membership. Por eso, en el run por pasarela
 *     de authorize (`test:test:gateway:authorize:xray`) `MG-158` va **denylisteada**
 *     (`XRAY_KEY_DENYLIST`) para no escribir un run ajeno en el execution MG-558 — su
 *     evidencia se acredita en el ATR de origen (MG-560, Stripe). Criterio y tabla por
 *     pasarela: `docs/gateway-pg/reports/RUNBOOK-executions-por-gateway.md` §2.3.
 *
 * Cómo extender:
 *   1. Configurar las creds del adapter en .env.test (o pinnear `GATEWAYS`) — el gateway
 *      entra solo al set activo.
 *   2. Crear nuevos specs piloto en este directorio para otros intents
 *      (`DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC`, etc.) siguiendo el mismo esqueleto
 *      (3DS es EXCLUSIVO Stripe — no generar casos 3DS para las demás pasarelas).
 */
import { test, expect } from '@TestFixture';
import { resolveCard, type GatewayName } from '@fixtures/gateways/_shared';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { resolveActiveGateways } from '@features/gateway-pg/helpers/adapters';
import { gatewayTag } from '@features/gateway-pg/helpers/adapters/gateway-tag';
import { CarrierHoldSteps, type HoldScenario, type HoldRunOptions } from '@steps/index';

/**
 * Gateways activos del piloto (S7): pin `GATEWAYS` (CSV) > adapters configurados.
 * Resuelto en tiempo de colección — pinnear en CI para runs deterministas.
 */
const ACTIVE_GATEWAYS: GatewayName[] = resolveActiveGateways();

// App pax sin 3DS: sin cardFlow ni cleanup de travelId; valida por estado 'Buscando chofer'
// (sin filtrar por destino) y espera la habilitación del botón de vehículo. Mismo perfil que
// apppax-hold-no3ds.spec.ts, pero con la tarjeta resuelta cross-gateway.
const HAPPY_NO_AUTH_OPTIONS: Omit<HoldRunOptions, 'hold'> = {
	threeDs: false,
	useCardFlow: false,
	trackTravelId: false,
	waitForCreation: false,
	waitForVehicleReady: true,
	matchDestination: false,
	expectStatus: 'Buscando chofer'
};

// El fixture KATA no define la opción `role` (login explícito vía CarrierHoldSteps.login()).
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe(
	'[BL-028][parametrized] Hold happy path sin 3DS @gateway @hold @regression',
	{ annotation: [{ type: 'tms', description: 'MG-158' }] },
	() => {
		for (const gateway of ACTIVE_GATEWAYS) {
			// Tag normalizado por pasarela vía `gatewayTag()` (SoT única): permite que
			// los runs :xray por gateway (--grep "@authorize" etc.) incluyan al piloto.
			test.describe(`gateway=${gateway} ${gatewayTag(gateway)}`, () => {
				test('crea viaje con HAPPY_NO_AUTH y queda visible en grilla "Por asignar"', async ({ page }) => {
					const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });

					// Sanity: el resolver devolvió una tarjeta del gateway esperado y sin 3DS
					// (el Step resuelve la MISMA tarjeta internamente — intent HAPPY_NO_AUTH).
					expect(card.gateway).toBe(gateway);
					expect(card.requires3ds).toBe(false);
					expect(card.last4).toHaveLength(4);

					const defaults = journeyDefaultsFor(gateway);
					const scenario: HoldScenario = {
						gateway,
						client: defaults.appPaxPassenger,
						passenger: defaults.appPaxPassenger,
						origin: defaults.origin,
						destination: defaults.destination
					};

					await new CarrierHoldSteps({ page }).runHoldScenario(scenario, {
						hold: 'on',
						...HAPPY_NO_AUTH_OPTIONS
					});
				});
			});
		}
	}
);
