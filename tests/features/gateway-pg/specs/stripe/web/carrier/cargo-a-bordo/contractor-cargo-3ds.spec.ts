/**
 * TCs: TS-STRIPE-TC1107–TC1110
 * Feature: Cargo a Bordo — Colaborador/Contractor — 3DS desde Driver App
 * Tags: @critical @3ds @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente contractor + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta requiere 3DS
 *
 * No hay formulario Stripe ni 3DS desde carrier web para Cargo a Bordo.
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
// 4 tests (no toca JOURNEY_DEFAULTS.origin que usan ~399 web tests, y estos no asertan origin).
const DRIVER_E2E_PICKUP = 'Ciudad de la Paz 2238, Buenos Aires, Argentina';

const contractorScenario: CargoScenario = {
	client: TEST_DATA.contractorClient,
	passenger: TEST_DATA.contractorPassenger,
	origin: DRIVER_E2E_PICKUP,
	destination: TEST_DATA.destination
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

/**
 * Charge 3DS para la fase Driver App (solo se ejecuta con APPIUM=1). `is3ds: true` hace que el
 * harness espere y opere el challenge 3DS dentro del modal Stripe Elements de la app driver.
 * Cards desde la SoT canónica `@fixtures/gateways/stripe/cards` — NO inventar números.
 */
const charge3ds = (
	raw: { number: string; exp: string; cvc: string; holderName: string; zip_code: string },
	expectedOutcome: DriverChargeSpec['expectedOutcome']
): DriverChargeSpec => ({
	card: { number: raw.number, expiry: raw.exp, cvc: raw.cvc, holderName: raw.holderName, postal: raw.zip_code },
	expectedOutcome,
	is3ds: true
});

test.describe(
	'Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · 3DS @gateway @stripe @cargo-a-bordo @hold @3ds @critical',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1107] @critical @3ds @cargo-a-bordo pago exitoso con 3DS desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				createTimeout: 30_000,
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → 3DS requerido → pasajero aprueba → cobro exitoso',
					note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen + manejo de WebView 3DS.',
					// three_ds_required (4000 0000 0000 3220): misma card probada en empresa-cargo-3ds (TC1123).
					charge: charge3ds(STRIPE_TEST_CARDS_RAW.three_ds_required, 'success')
				}
			});
		});

		test('[TS-STRIPE-TC1108] @regression @3ds @cargo-a-bordo 3DS rechazado desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				createTimeout: 30_000,
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → 3DS rechazado → cobro fallido → viaje En conflicto',
					note: APPIUM_NOTE,
					// visa_3ds_fail (4000 0084 0000 1629): el challenge aparece y la autenticación FALLA.
					charge: charge3ds(STRIPE_TEST_CARDS_RAW.visa_3ds_fail, 'declined')
				}
			});
		});

		test('[TS-STRIPE-TC1109] @regression @3ds @cargo-a-bordo error 3DS desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				createTimeout: 30_000,
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → 3DS error de autenticación → viaje En conflicto',
					note: APPIUM_NOTE,
					// error_3ds (4000 0084 2000 1629): error DURANTE la autenticación 3DS (fuente Excel TC1094).
					charge: charge3ds(STRIPE_TEST_CARDS_RAW.error_3ds, 'declined')
				}
			});
		});

		test('[TS-STRIPE-TC1110] @regression @3ds @cargo-a-bordo falla 3DS desde Driver App', async ({ page }) => {
			await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
				createTimeout: 30_000,
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra → 3DS falla completamente → cobro no procesado',
					note: APPIUM_NOTE,
					// declined_after_3ds: autenticación completa pero el cargo se rechaza post-auth (card_declined).
					// NOTA SoT: comparte PAN con visa_3ds_fail (4000 0084 0000 1629) — misma card, semántica distinta.
					charge: charge3ds(STRIPE_TEST_CARDS_RAW.declined_after_3ds, 'declined')
				}
			});
		});
	}
);
