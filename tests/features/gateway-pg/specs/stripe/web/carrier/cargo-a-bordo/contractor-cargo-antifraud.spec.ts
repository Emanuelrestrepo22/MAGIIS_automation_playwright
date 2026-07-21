/**
 * TCs: TS-STRIPE-TC1102–TC1106
 * Feature: Cargo a Bordo — Colaborador/Contractor — Antifraud desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente contractor + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta dispara regla antifraud
 *
 * Evidencia web: test-13.spec.ts
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

const contractorScenario: CargoScenario = {
	client: TEST_DATA.contractorClient,
	passenger: TEST_DATA.contractorPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · Antifraud @gateway @stripe @cargo-a-bordo @hold @decline @regression', () => {

	test('[TS-STRIPE-TC1102] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → tarjeta de alto riesgo → bloqueado',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.',
			},
		});
	});

	test('[TS-STRIPE-TC1103] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → always_blocked → bloqueado por antifraud',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1104] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → CVC check fail elevado → bloqueado',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1105] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → ZIP fail elevado → bloqueado por antifraud',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1106] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(contractorScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor cobra → dirección no disponible → bloqueado por antifraud',
				note: APPIUM_NOTE,
			},
		});
	});

});
