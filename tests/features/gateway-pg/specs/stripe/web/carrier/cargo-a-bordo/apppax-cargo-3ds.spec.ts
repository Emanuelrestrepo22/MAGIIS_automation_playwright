/**
 * TCs: TS-STRIPE-TC1092–TC1095
 * Feature: Cargo a Bordo — App Pax — 3DS desde Driver App
 * Tags: @critical @3ds @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): selecciona Cargo a Bordo → trip creado → "Buscando conductor" ✅ (siempre igual)
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → la tarjeta requiere 3DS
 *   El formulario de la app driver presenta el challenge 3DS al conductor o al pasajero.
 *
 * No hay formulario Stripe ni 3DS desde carrier web para Cargo a Bordo.
 * Evidencia web: test-17.spec.ts
 *
 * KATA conformance (feature/kata-conformance): fase web extraída a
 *   `CargoABordoSteps.runCargoScenario` (@steps); test desde @TestFixture; la fase
 *   Driver App se declara vía `driverAppStep` (test.fixme). ATCs → MG-161 / MG-158
 *   (mapeo por área aceptado — idmap API-level).
 */
import { test } from '@TestFixture';
import { CargoABordoSteps, type CargoScenario } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 120_000 });

const appPaxScenario: CargoScenario = {
	client: TEST_DATA.appPaxPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
	// Card 3DS DETERMINÍSTICA always_authenticate (••••3184). Migrado desde la deprecada 3155
	// (flaky por risk-score variable + ESLint anti-card-3155). apppax-hold-3ds ya usa esta card.
	cardPrecondition: { apiSearchQuery: PASSENGERS.appPax.apiSearchQuery!, requiredLast4: '3184', tcLabel: 'TC1092' },
};

const APPIUM_NOTE = 'PENDIENTE: fase Driver App — requiere Appium.';

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · 3DS @gateway @stripe @cargo-a-bordo @hold @3ds @critical', () => {

	test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero completa challenge → cobro exitoso',
				note: 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen + manejo de WebView 3DS.',
			},
		});
	});

	test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo 3DS rechazado desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero rechaza challenge → cobro fallido',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error durante 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → 3DS con error de autenticación → cobro fallido',
				note: APPIUM_NOTE,
			},
		});
	});

	test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS desde Driver App', async ({ page }) => {
		await new CargoABordoSteps({ page }).runCargoScenario(appPaxScenario, {
			driverAppStep: {
				title: '[DRIVER APP] Conductor finaliza viaje → 3DS falla completamente → cobro no procesado',
				note: APPIUM_NOTE,
			},
		});
	});

});
