/**
 * TCs: TS-STRIPE-TC1112–TC1116
 * Feature: Cargo a Bordo — Empresa Individuo — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente empresa individuo + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta rechazada
 *
 * TEST_DATA.client = 'Marcelle Stripe' (empresa individuo), TEST_DATA.passenger = 'Emanuel Restrepo' (appPax)
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

const empresaScenario: CargoScenario = {
	client: TEST_DATA.client,
	passenger: TEST_DATA.passenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe('Gateway PG · Carrier · Empresa Individuo — Cargo a Bordo · Declines @gateway @stripe @cargo-a-bordo @hold @decline @regression', () => {

	test('[TS-STRIPE-TC1112] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → tarjeta declinada genéricamente → rechazo',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.',
			},
		});
	});

	test('[TS-STRIPE-TC1113] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → fondos insuficientes → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1114] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → tarjeta perdida → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1115] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → CVC incorrecto → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1116] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → tarjeta robada → rechazo',
				note: APPIUM_NOTE,
			},
		});
	});

});
