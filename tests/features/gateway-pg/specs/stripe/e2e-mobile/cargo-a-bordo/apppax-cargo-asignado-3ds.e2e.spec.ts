/**
 * [E2E-MOBILE][STRIPE] Cargo a Bordo · viaje ASIGNADO manualmente · cobro driver 3DS.
 *
 * Grupo C del plan MP (referencia Stripe). Reutiliza CargoABordoSteps.runCargoScenario:
 *   web (carrier): alta VIAJE PLANO + Send Manual → Assign (asignación directa al conductor)
 *   driver (Appium): acepta → finaliza → resumen → "Ingresar tarjeta" → cobra a bordo (3DS) → success
 *
 * A diferencia de apppax-cargo-3ds.spec.ts (que declara driverAppStep SIN charge → test.fixme),
 * acá se provee `charge` → con APPIUM=1 corre la fase driver REAL (DriverCargoDeclineHarness.reactAndCharge)
 * y asevera outcome='success'. Cobro a bordo = el conductor ingresa la tarjeta en el viaje (no pre-vinculada).
 *
 * Swap MP (futuro): el cobro a bordo MP usaría el payment screen MP (holderName trigger, sin 3DS) —
 * bloqueado por: MP no transacciona en TEST + sin captura del modal MP en el driver.
 *
 * Gating: SKIP sin APPIUM_SERVER_URL; la fase driver real requiere además APPIUM=1 (si no, test.fixme).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 420_000 });

const appPaxScenario: CargoScenario = {
	client: TEST_DATA.appPaxPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
	// Cargo a Bordo: la tarjeta la ingresa el conductor en el viaje → sin cardPrecondition pre-vinculada.
};

test.describe('[E2E-MOBILE][STRIPE] Cargo a Bordo asignado · cobro driver 3DS @e2e-hybrid @gateway-pg @stripe @cargo-a-bordo @3ds @happy', () => {
	test.skip(() => !process.env.APPIUM_SERVER_URL, 'Requiere servidor Appium + device driver');

	test('[CARGO-ASIGNADO-3DS] alta + asignación manual → driver cobra a bordo con 3DS → success', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			manualAssign: true,
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] acepta viaje asignado → finaliza → cobra a bordo (3DS) → success',
				charge: {
					card: {
						number: '4000000000003220',
						expiry: '12/34',
						cvc: '123',
						holderName: 'RESTREPO EMA',
						postal: '1343',
					},
					expectedOutcome: 'success',
					is3ds: true,
				},
			},
		});
	});
});
