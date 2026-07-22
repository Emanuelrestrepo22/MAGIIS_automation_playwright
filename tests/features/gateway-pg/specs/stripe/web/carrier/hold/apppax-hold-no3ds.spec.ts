/**
 * TCs: TS-STRIPE-TC1049–TC1052, TC1057–TC1060
 * Feature: Alta de Viaje desde Carrier — Usuario App Pax — Tarjeta Preautorizada sin 3DS
 * Tags: @regression @hold @web-only
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de apppax-hold-3ds.
 *   - test/expect vienen del fixture unificado KATA (@TestFixture) en vez de TestBase.
 *   - orquestación compartida extraída al Step `CarrierHoldSteps.runHoldScenario` (@steps).
 *   - Page components KATA (@ui/carrier) en vez de los POMs del sustrato carrier.
 * ATCs mapeados en las Page components: fillMinimum → MG-148 (área C),
 *   expectPassengerInPorAsignar → MG-158 (área E). mapeo por área aceptado (idmap API-level,
 *   sin 1:1 con TS-STRIPE-TC10xx).
 */
import { test } from '@TestFixture';
import { CarrierHoldSteps, type HoldScenario, type HoldRunOptions } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

// App pax sin 3DS: sin cardFlow ni cleanup de travelId; valida por estado 'Buscando chofer'
// (sin filtrar por destino) y espera la habilitación del botón de vehículo.
const APP_PAX_NO3DS: Omit<HoldRunOptions, 'hold'> = {
	threeDs: false,
	useCardFlow: false,
	trackTravelId: false,
	waitForCreation: false,
	waitForVehicleReady: true,
	matchDestination: false,
	expectStatus: 'Buscando chofer',
};

function appPaxScenario(overrides: Partial<HoldScenario> = {}): HoldScenario {
	return {
		client: TEST_DATA.appPaxPassenger,
		passenger: TEST_DATA.appPaxPassenger,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		...overrides,
	};
}

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · App Pax — Hold sin 3DS @gateway @stripe @hold @critical @smoke @regression', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1049] @smoke @hold hold+cobro app pax sin 3DS', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'on', ...APP_PAX_NO3DS });
		});

		test('[TS-STRIPE-TC1051] @regression @hold hold+cobro app pax sin 3DS variante', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(
				appPaxScenario({ origin: 'Av. Corrientes 1234, Buenos Aires', destination: 'Av. Santa Fe 2100, Buenos Aires' }),
				{ hold: 'on', ...APP_PAX_NO3DS },
			);
		});

		test('[TS-STRIPE-TC1057] @regression @hold hold+cobro app pax sin 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'on', ...APP_PAX_NO3DS });
		});

		test('[TS-STRIPE-TC1059] @regression @hold hold+cobro app pax sin 3DS variante 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'on', ...APP_PAX_NO3DS });
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1050] @regression sin hold app pax sin 3DS', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'off', ...APP_PAX_NO3DS });
		});

		test('[TS-STRIPE-TC1052] @regression sin hold app pax sin 3DS variante', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(
				appPaxScenario({ origin: 'Av. Corrientes 1234, Buenos Aires', destination: 'Av. Santa Fe 2100, Buenos Aires' }),
				{ hold: 'off', ...APP_PAX_NO3DS },
			);
		});

		test('[TS-STRIPE-TC1058] @regression sin hold app pax sin 3DS (set 2)', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'off', ...APP_PAX_NO3DS });
		});

		test('[TS-STRIPE-TC1060] @regression sin hold app pax sin 3DS variante 2', async ({ page }) => {
			await new CarrierHoldSteps({ page }).runHoldScenario(appPaxScenario(), { hold: 'off', ...APP_PAX_NO3DS });
		});
	});

});
