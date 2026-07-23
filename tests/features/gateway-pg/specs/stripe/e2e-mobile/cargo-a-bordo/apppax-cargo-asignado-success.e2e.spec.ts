/**
 * [E2E-MOBILE][STRIPE] Cargo a Bordo · viaje ASIGNADO manualmente · cobro driver SIN 3DS.
 *
 * Variante hermana de apppax-cargo-asignado-3ds: mismo flujo (alta viaje plano + Send Manual →
 * Assign → driver acepta → finaliza → cobra a bordo), pero con tarjeta success directo (4242,
 * sin challenge 3DS). Cero código de framework nuevo — solo cambian los datos del `charge`.
 *
 * ATP: cobro exitoso + cierre = TC-PAY-F-01 (MG-161). Matriz Stripe app pax cobro sin 3DS = TC1081.
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

test.describe(
	'[E2E-MOBILE][STRIPE] Cargo a Bordo asignado · cobro driver sin 3DS @e2e-hybrid @gateway-pg @stripe @cargo-a-bordo @happy',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
	test.skip(() => !process.env.APPIUM_SERVER_URL, 'Requiere servidor Appium + device driver');

	test('[TS-STRIPE-TC1081][CARGO-ASIGNADO-SUCCESS] alta + asignación manual → driver cobra a bordo sin 3DS → success', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			manualAssign: true,
			assignToDriver: process.env.DRIVER_DISPLAY_NAME ?? 'pepe argento',
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] acepta viaje asignado → finaliza → cobra a bordo (sin 3DS) → success',
				charge: {
					card: {
						number: '4242424242424242',
						expiry: '12/34',
						cvc: '123',
						holderName: 'RESTREPO EMA',
						postal: '1343',
					},
					expectedOutcome: 'success',
					// sin is3ds: la 4242 aprueba directo, no dispara challenge.
				},
			},
		});
	});
});
