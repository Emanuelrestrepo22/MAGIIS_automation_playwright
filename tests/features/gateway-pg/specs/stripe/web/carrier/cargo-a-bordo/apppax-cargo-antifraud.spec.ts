/**
 * TCs: TS-STRIPE-TC1087–TC1091
 * Feature: Cargo a Bordo — App Pax — Antifraud desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): selecciona Cargo a Bordo → trip creado → "Buscando conductor" ✅ (siempre igual)
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → la tarjeta dispara regla antifraud
 *
 * Evidencia web: test-17.spec.ts
 *
 * KATA conformance (feature/kata-conformance): fase web extraída a
 *   `CargoABordoSteps.runCargoScenario` (@steps); test desde @TestFixture; fase Driver App
 *   vía `driverAppStep` (test.fixme). ATCs → MG-161 / MG-158 (PENDIENTE REASIGNAR).
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

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Antifraud @gateway @stripe @cargo-a-bordo @hold @decline @regression', () => {

	test('[TS-STRIPE-TC1087] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta de alto riesgo → bloqueado',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen implementado.',
			},
		});
	});

	test('[TS-STRIPE-TC1088] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta always_blocked → bloqueado',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1089] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → CVC check fail con riesgo elevado → bloqueado',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1090] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → ZIP check fail con riesgo elevado → bloqueado',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1091] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → dirección no disponible → bloqueado por antifraud',
				note: APPIUM_NOTE,
			},
		});
	});

});
