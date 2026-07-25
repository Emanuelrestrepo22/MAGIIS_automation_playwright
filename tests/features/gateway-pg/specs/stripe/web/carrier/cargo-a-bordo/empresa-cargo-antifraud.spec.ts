/**
 * TCs: TS-STRIPE-TC1117–TC1121
 * Feature: Cargo a Bordo — Empresa Individuo — Antifraud desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente empresa individuo + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta dispara regla antifraud
 *
 * TEST_DATA.client = 'Marcelle Stripe' (empresa individuo), TEST_DATA.passenger = 'Emanuel Restrepo' (appPax)
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

const empresaScenario: CargoScenario = {
	client: TEST_DATA.client,
	passenger: TEST_DATA.passenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe(
	'Gateway PG · Carrier · Empresa Individuo — Cargo a Bordo · Antifraud @gateway @stripe @cargo-a-bordo @hold @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1117] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → tarjeta alto riesgo → bloqueado por antifraud',
					note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.'
				}
			});
		});

		test('[TS-STRIPE-TC1118] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → always_blocked → bloqueado por antifraud',
					note: APPIUM_NOTE
				}
			});
		});

		test('[TS-STRIPE-TC1119] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → CVC check fail elevado → bloqueado',
					note: APPIUM_NOTE
				}
			});
		});

		test('[TS-STRIPE-TC1120] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → ZIP fail elevado → bloqueado por antifraud',
					note: APPIUM_NOTE
				}
			});
		});

		test('[TS-STRIPE-TC1121] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(empresaScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → dirección no disponible → bloqueado por antifraud',
					note: APPIUM_NOTE
				}
			});
		});
	}
);
