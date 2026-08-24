/**
 * TC: TS-STRIPE-TC1123 — empresa Cargo a Bordo · pago exitoso con 3D Secure obligatorio (matriz §9.3).
 * Feature: Cargo a Bordo — Empresa Individuo — Cobro con 3DS desde Driver App (E2E híbrido).
 * Tags: @gateway @stripe @cargo-a-bordo @3ds @e2e-hybrid
 *
 * Arquitectura (build TEST driver 2026-07, Stripe Elements):
 * - WEB (carrier): cliente empresa + Cargo a Bordo → Select Vehicle → **Send Manual → Assign →
 *   Assign** (asignación DIRECTA al conductor; elimina el timer de oferta-candidato). Ref: test-5.
 *   origin=Ciudad de la Paz 2238 (geocerca: device físico a 14m), destino=Reconquista 661.
 * - DRIVER APP (Appium, pre-warm): acepta → Empezar → Finalizar → Resumen → "Ingresar tarjeta" →
 *   modal Stripe Elements → tarjeta 3DS-required (4000000000003220, Radar IE) → COBRAR →
 *   **completar challenge 3DS** → cobro OK.
 *
 * Requiere APPIUM=1 (+ device). Sin Appium → la fase driver queda test.fixme (web validado).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario, type DriverChargeSpec } from '@steps/index';
import { STRIPE_TEST_CARDS_RAW } from '@fixtures/gateways/stripe/cards';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 420_000 });

// Viaje PLANO con cliente directo (rider) para asignación manual (ref: test-5). Pickup DENTRO
// del radio de geocerca (device físico en Ciudad de la Paz 2238, Belgrano CABA — a ~14m).
const scenario3ds: CargoScenario = {
	client: 'Restrepo, Emanuel',
	origin: 'Ciudad de la Paz 2238, Buenos Aires, Argentina',
	destination: 'Reconquista 661, Buenos Aires, Argentina'
};

// Card 3DS-required (SoT fixtures: STRIPE_TEST_CARDS_RAW.three_ds_required = 4000000000003220).
const charge3ds: DriverChargeSpec = {
	card: {
		number: STRIPE_TEST_CARDS_RAW.three_ds_required.number,
		expiry: '12/34',
		cvc: '123',
		holderName: 'RESTREPO EMANUEL',
		postal: '1234567'
	},
	expectedOutcome: 'success', // challenge 3DS completado → cobro aprobado
	is3ds: true
};

test.describe(
	'Gateway PG · Carrier · Empresa — Cargo a Bordo · 3DS (asignación manual) @gateway @stripe @cargo-a-bordo @3ds @e2e-hybrid',
	{ annotation: [{ type: 'tms', description: 'MG-161' }] },
	() => {
		test('[TS-STRIPE-TC1123] @3ds @cargo-a-bordo cobro con challenge 3DS completado desde Driver App', async ({
			page
		}) => {
			await new CargoABordoSteps({ page }).runCargoScenario(scenario3ds, {
				manualAssign: true,
				driverAppStep: {
					title: '[DRIVER APP] Conductor cobra (always-3DS) → challenge 3DS → completar → cobro OK',
					note: 'PENDIENTE: fase Driver App 3DS — requiere Appium (APPIUM=1) + device.',
					charge: charge3ds
				}
			});
		});
	}
);
