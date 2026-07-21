/**
 * TCs: TS-STRIPE-TC1082–TC1086
 * Feature: Cargo a Bordo — App Pax — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): selecciona Cargo a Bordo → trip creado → "Buscando conductor" ✅ (siempre igual)
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → la tarjeta es rechazada
 *
 * La fase web es IDÉNTICA al TC1081 (happy path). La variación ocurre SOLO en la app del
 * conductor al momento del cobro.
 * Evidencia web: test-17.spec.ts
 *
 * KATA conformance (feature/kata-conformance): fase web extraída a
 *   `CargoABordoSteps.runCargoScenario` (@steps); test desde @TestFixture; fase Driver App
 *   vía `driverAppStep` (test.fixme). ATCs → MG-161 / MG-158 (mapeo por área aceptado).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

const appPaxScenario: CargoScenario = {
	client: TEST_DATA.appPaxPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Declines @gateway @stripe @cargo-a-bordo @hold @decline @regression', () => {

	test('[TS-STRIPE-TC1082] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta declinada → pago rechazado genérico',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen implementado.',
			},
		});
	});

	test('[TS-STRIPE-TC1083] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta sin fondos → pago rechazado',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1084] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta reportada como perdida → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1085] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con CVC incorrecto → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1086] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta reportada como robada → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

});
