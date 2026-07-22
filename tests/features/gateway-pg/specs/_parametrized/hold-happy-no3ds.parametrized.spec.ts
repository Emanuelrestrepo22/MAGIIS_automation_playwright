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
 * `ACTIVE_GATEWAYS` queda preparado para sumar `'authorize'` cuando BL-025
 * implemente el runtime (POMs y login del portal Authorize). Hoy sólo
 * compila/ejecuta `'stripe'` porque es el único gateway con runtime web
 * disponible.
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón cross-gateway
 * sobre el Step KATA.
 *   - test/expect vienen del fixture unificado KATA (@TestFixture) en vez de TestBase.
 *   - El journey se delega a `CarrierHoldSteps.runHoldScenario` (@steps); sólo el dato
 *     de tarjeta lo aporta `resolveCard`, preservando la naturaleza cross-gateway del piloto.
 *   - Los ATC viven en las Page components que orquesta el Step (fillMinimum → MG-148,
 *     expectPassengerInPorAsignar → MG-158). mapeo por área aceptado (idmap API-level, sin 1:1
 *     con TS-STRIPE-TC10xx).
 *
 * Trazabilidad:
 *   - Mismo dato lógico que TS-STRIPE-TC1049 (hold ON + tarjeta 4242, sin 3DS),
 *     pero estructurado para demostrar el patrón cross-gateway.
 *   - Cuando se extienda a `'authorize'`, este spec ejercitará la card
 *     `4111 1111 1111 1111` con CVV `900` (SUCCESS sandbox).
 *
 * Cómo extender:
 *   1. Agregar el gateway a `ACTIVE_GATEWAYS` cuando su runtime esté listo.
 *   2. Si el flujo de UI difiere (ej. Authorize sin Elements iframe),
 *      condicionar los `test.step` con `if (gateway === 'authorize')` o
 *      delegar a un adapter en `helpers/adapters/`.
 *   3. Crear nuevos specs piloto en este directorio para otros intents
 *      (`HAPPY_AUTH`, `FAIL_AUTH`, `DECLINE_AUTHORIZE`, etc.) siguiendo el
 *      mismo esqueleto.
 */
import { test, expect } from '@TestFixture';
import { resolveCard, type GatewayName } from '@fixtures/gateways/_shared';
import { JOURNEY_DEFAULTS } from '@features/gateway-pg/data/journey-defaults';
import { CarrierHoldSteps, type HoldScenario, type HoldRunOptions } from '@steps/index';

/**
 * Gateways activos en el piloto. Sumar 'authorize' cuando BL-025 termine.
 */
const ACTIVE_GATEWAYS: GatewayName[] = ['stripe'];

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
	expectStatus: 'Buscando chofer',
};

// El fixture KATA no define la opción `role` (login explícito vía CarrierHoldSteps.login()).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('[BL-028][parametrized] Hold happy path sin 3DS @gateway @hold @regression', { annotation: [{ type: 'tms', description: 'MG-158' }] }, () => {
	for (const gateway of ACTIVE_GATEWAYS) {
		test.describe(`gateway=${gateway}`, () => {
			test('crea viaje con HAPPY_NO_AUTH y queda visible en grilla "Por asignar"', async ({ page }) => {
				const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });

				// Sanity: el resolver devolvió una tarjeta del gateway esperado y sin 3DS.
				expect(card.gateway).toBe(gateway);
				expect(card.requires3ds).toBe(false);
				expect(card.last4).toHaveLength(4);

				const scenario: HoldScenario = {
					client: JOURNEY_DEFAULTS.appPaxPassenger,
					passenger: JOURNEY_DEFAULTS.appPaxPassenger,
					origin: JOURNEY_DEFAULTS.origin,
					destination: JOURNEY_DEFAULTS.destination,
					cardLast4: card.last4,
				};

				await new CarrierHoldSteps({ page }).runHoldScenario(scenario, { hold: 'on', ...HAPPY_NO_AUTH_OPTIONS });
			});
		});
	}
});
