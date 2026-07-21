/**
 * BL-028 — piloto parametrizado multi-gateway · Hold happy path sin 3DS
 * =====================================================================
 *
 * Demuestra el patrón habilitado por BL-024 (Fase 3): el mismo flujo de UI
 * Carrier corre contra múltiples gateways de pago; sólo cambia el dato
 * resuelto por `resolveCard({ gateway, intent })`. El resto del journey
 * (login dispatcher, alta de viaje, selección de vehículo, validación en
 * grilla "Por asignar") es agnóstico del gateway porque consume
 * `JOURNEY_DEFAULTS` (dominio MAGIIS, no del SDK de pago).
 *
 * `ACTIVE_GATEWAYS` queda preparado para sumar `'authorize'` cuando BL-025
 * implemente el runtime (POMs y login del portal Authorize). Hoy sólo
 * compila/ejecuta `'stripe'` porque es el único gateway con runtime web
 * disponible.
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
import { expect } from '@playwright/test';
import { test } from '../../../../TestBase';
import { resolveCard, type GatewayName } from '../../../../fixtures/gateways/_shared';
import { JOURNEY_DEFAULTS } from '../../data/journey-defaults';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
	NewTravelPage,
	TravelManagementPage,
} from '../../fixtures/gateway.fixtures';
import { DashboardPage, OperationalPreferencesPage } from '../../../../pages/carrier';

/**
 * Gateways activos en el piloto. Sumar 'authorize' cuando BL-025 termine.
 */
const ACTIVE_GATEWAYS: GatewayName[] = ['stripe'];

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('[BL-028][parametrized] Hold happy path sin 3DS @gateway @hold @regression', () => {
	for (const gateway of ACTIVE_GATEWAYS) {
		test.describe(`gateway=${gateway}`, () => {
			test('crea viaje con HAPPY_NO_AUTH y queda visible en grilla "Por asignar"', async ({ page }) => {
				const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });

				// Sanity: el resolver devolvió una tarjeta del gateway esperado y sin 3DS.
				expect(card.gateway).toBe(gateway);
				expect(card.requires3ds).toBe(false);
				expect(card.last4).toHaveLength(4);

				const dashboard = new DashboardPage(page);
				const preferences = new OperationalPreferencesPage(page);
				const travel = new NewTravelPage(page);
				const management = new TravelManagementPage(page);

				await test.step('Login carrier', async () => {
					await loginAsDispatcher(page);
				});

				await test.step('Validar que el hold esté activado en preferencias operativas', async () => {
					await preferences.goto();
					await preferences.ensureHoldEnabled();
					await preferences.assertHoldEnabled();
				});

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step(`Completar formulario con tarjeta ${gateway} HAPPY_NO_AUTH (last4=${card.last4})`, async () => {
					await travel.fillMinimum({
						client: JOURNEY_DEFAULTS.appPaxPassenger,
						passenger: JOURNEY_DEFAULTS.appPaxPassenger,
						origin: JOURNEY_DEFAULTS.origin,
						destination: JOURNEY_DEFAULTS.destination,
						cardLast4: card.last4,
					});
				});

				await test.step('Seleccionar vehículo y enviar el viaje', async () => {
					await travel.waitForVehicleSelectionReady();
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await test.step('Validar viaje en gestión — columna "Por asignar"', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(
						JOURNEY_DEFAULTS.appPaxPassenger,
						undefined,
						'Buscando chofer',
					);
				});
			});
		});
	}
});
