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
 *   vía `driverAppStep` (test.fixme). ATCs → MG-161 / MG-158 (mapeo por área aceptado).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

const contractorScenario: CargoScenario = {
	client: TEST_DATA.contractorClient,
	passenger: TEST_DATA.contractorPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · 3DS @gateway @stripe @cargo-a-bordo @hold @3ds @critical', { annotation: [{ type: 'tms', description: 'MG-161' }] }, () => {

	test('[TS-STRIPE-TC1107] @critical @3ds @cargo-a-bordo pago exitoso con 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → 3DS requerido → pasajero aprueba → cobro exitoso',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen + manejo de WebView 3DS.',
			},
		});
	});

	test('[TS-STRIPE-TC1108] @regression @3ds @cargo-a-bordo 3DS rechazado desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → 3DS rechazado → cobro fallido → viaje En conflicto',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1109] @regression @3ds @cargo-a-bordo error 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → 3DS error de autenticación → viaje En conflicto',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1110] @regression @3ds @cargo-a-bordo falla 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			createTimeout: 30_000,
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → 3DS falla completamente → cobro no procesado',
				note: APPIUM_NOTE,
			},
		});
	});

});
