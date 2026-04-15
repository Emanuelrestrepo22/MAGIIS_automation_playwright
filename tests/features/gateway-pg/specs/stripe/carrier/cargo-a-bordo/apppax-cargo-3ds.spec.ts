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
 */
import type { Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

async function webPhaseCargoAppPax(page: Page): Promise<void> {
	const dashboard = new DashboardPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	await test.step('Ir al formulario de nuevo viaje', async () => {
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
	});

	await test.step('Completar formulario — appPax + método Cargo a Bordo', async () => {
		await travel.selectClient(TEST_DATA.appPaxPassenger);
		await travel.setOrigin(TEST_DATA.origin);
		await travel.setDestination(TEST_DATA.destination);
		await travel.selectPaymentMethod('CargoABordo');
	});

	await test.step('Seleccionar vehículo y enviar el viaje', async () => {
		await travel.clickSelectVehicle();
		await travel.clickSendService();
	});

	await test.step('Verificar que no aparece modal 3DS en carrier web', async () => {
		await expectNoThreeDSModal(page);
	});

	await test.step('Esperar redirección al detalle del viaje', async () => {
		const result = await Promise.race([
			page.waitForURL(/\/travels\/[\w-]+$/, { timeout: 15_000 }).then(() => 'success' as const),
			page.waitForURL(/limitExceeded/, { timeout: 15_000 }).then(() => 'limitExceeded' as const),
		]).catch(() => 'timeout' as const);

		if (result === 'limitExceeded') {
			throw new Error('[Cargo a Bordo] PRECONDICIÓN NO CUMPLIDA: limitExceeded=false. Verificar tarjeta activa del pasajero appPax en TEST.');
		}
		if (result === 'timeout') {
			throw new Error('[Cargo a Bordo] TIMEOUT: URL no redirigió al detalle del viaje.');
		}
	});

	await test.step('Validar estado del viaje - Buscando conductor', async () => {
		await management.goto();
		await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
		await management.openDetailForPassenger(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
		await detail.expectStatus('Buscando conductor');
	});
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · 3DS', () => {

	test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero completa challenge → cobro exitoso', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.success3DS (4000002500003155)
			// Resultado esperado: 3DS challenge presentado → pasajero aprueba → cobro procesado → viaje "Finalizado".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen + manejo de WebView 3DS.');
		});
	});

	test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo 3DS rechazado desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero rechaza challenge → cobro fallido', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.fail3DS (4000000000009235)
			// Resultado esperado: 3DS challenge fallido → cobro no procesado → viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error durante 3DS desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS con error de autenticación → cobro fallido', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.error3DS (4000 0084 2000 1629) — Excel TC1094
			// Resultado esperado: 3DS con error de autenticación → cobro no procesado → viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS falla completamente → cobro no procesado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.fail3DS (4000000000009235)
			// Resultado esperado: 3DS no completado → error visible → viaje "En conflicto" o "No Autorizado".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

});
