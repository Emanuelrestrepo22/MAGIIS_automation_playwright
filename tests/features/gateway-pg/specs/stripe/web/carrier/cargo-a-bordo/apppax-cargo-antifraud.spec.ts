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
 *   vía `driverAppStep` con `charge` real — EJECUTABLE con `APPIUM=1`
 *   (sin `APPIUM=1` el orquestador marca la fase driver como `test.fixme`).
 *   ATCs → MG-161 / MG-158 (mapeo por área aceptado).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario, type DriverChargeSpec } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { STRIPE_TEST_CARDS_RAW } from '@fixtures/gateways/stripe/cards';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

// E2E DRIVER: el pickup DEBE estar dentro del radio (500m) de la ubicación física del
// teléfono (Ciudad de la Paz 2238, Belgrano, CABA — GPS device -34.5616,-58.4590), si no
// el driver queda fuera de rango y no puede iniciar el viaje (geocerca). Scopeado a estos
// 5 tests (no toca JOURNEY_DEFAULTS.origin que usan ~399 web tests, y estos no asertan origin).
const DRIVER_E2E_PICKUP = 'Ciudad de la Paz 2238, Buenos Aires, Argentina';

const appPaxScenario: CargoScenario = {
	client: TEST_DATA.appPaxPassenger,
	origin: DRIVER_E2E_PICKUP,
	destination: TEST_DATA.destination
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

/**
 * Charge antifraud para la fase Driver App (solo se ejecuta con APPIUM=1).
 * Una regla de Radar que bloquea el cargo se observa como rechazo en la app → `declined`.
 * Cards desde la SoT canónica `@fixtures/gateways/stripe/cards` — NO inventar números.
 */
const blocked = (raw: { number: string; exp: string; cvc: string; holderName: string }): DriverChargeSpec => ({
	card: { number: raw.number, expiry: raw.exp, cvc: raw.cvc, holderName: raw.holderName },
	expectedOutcome: 'declined'
});

test.describe(
	'Gateway PG · Carrier · App Pax — Cargo a Bordo · Antifraud @gateway @stripe @cargo-a-bordo @hold @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1087] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta de alto riesgo → bloqueado',
					note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen implementado.',
					charge: blocked(STRIPE_TEST_CARDS_RAW.highest_risk)
				}
			});
		});

		test('[TS-STRIPE-TC1088] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta always_blocked → bloqueado',
					note: APPIUM_NOTE,
					charge: blocked(STRIPE_TEST_CARDS_RAW.always_blocked)
				}
			});
		});

		test('[TS-STRIPE-TC1089] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor finaliza viaje → CVC check fail con riesgo elevado → bloqueado',
					note: APPIUM_NOTE,
					charge: blocked(STRIPE_TEST_CARDS_RAW.cvc_check_fail_elevated)
				}
			});
		});

		test('[TS-STRIPE-TC1090] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor finaliza viaje → ZIP check fail con riesgo elevado → bloqueado',
					note: APPIUM_NOTE,
					charge: blocked(STRIPE_TEST_CARDS_RAW.zip_fail_elevated)
				}
			});
		});

		test('[TS-STRIPE-TC1091] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor finaliza viaje → dirección no disponible → bloqueado por antifraud',
					note: APPIUM_NOTE,
					charge: blocked(STRIPE_TEST_CARDS_RAW.address_unavailable)
				}
			});
		});
	}
);
