/**
 * TCs: TS-STRIPE-TC1097–TC1101
 * Feature: Cargo a Bordo — Colaborador/Contractor — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente contractor + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta rechazada
 *
 * Evidencia web: test-13.spec.ts
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

const contractorScenario: CargoScenario = {
	client: TEST_DATA.contractorClient,
	passenger: TEST_DATA.contractorPassenger,
	origin: DRIVER_E2E_PICKUP,
	destination: TEST_DATA.destination
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

/**
 * Charge de decline para la fase Driver App (solo se ejecuta con APPIUM=1).
 * Cards desde la SoT canónica `@fixtures/gateways/stripe/cards` — NO inventar números.
 */
const decline = (raw: { number: string; exp: string; cvc: string; holderName: string }): DriverChargeSpec => ({
	card: { number: raw.number, expiry: raw.exp, cvc: raw.cvc, holderName: raw.holderName },
	expectedOutcome: 'declined'
});

test.describe(
	'Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · Declines @gateway @stripe @cargo-a-bordo @hold @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1097] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → tarjeta declinada genéricamente → rechazo',
					note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.',
					charge: decline(STRIPE_TEST_CARDS_RAW.declined_generic)
				}
			});
		});

		test('[TS-STRIPE-TC1098] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → fondos insuficientes → rechazo',
					note: APPIUM_NOTE,
					charge: decline(STRIPE_TEST_CARDS_RAW.declined_funds)
				}
			});
		});

		test('[TS-STRIPE-TC1099] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → tarjeta reportada como perdida → rechazo',
					note: APPIUM_NOTE,
					charge: decline(STRIPE_TEST_CARDS_RAW.lost_card)
				}
			});
		});

		test('[TS-STRIPE-TC1100] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → CVC incorrecto → rechazo',
					note: APPIUM_NOTE,
					charge: decline(STRIPE_TEST_CARDS_RAW.incorrect_cvc)
				}
			});
		});

		test('[TS-STRIPE-TC1101] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → tarjeta robada → rechazo',
					note: APPIUM_NOTE,
					charge: decline(STRIPE_TEST_CARDS_RAW.stolen_card)
				}
			});
		});
	}
);
