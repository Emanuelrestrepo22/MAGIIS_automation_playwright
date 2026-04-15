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

	await test.step('Verificar que no aparece modal 3DS', async () => {
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

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Antifraud', () => {

	test('[TS-STRIPE-TC1087] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta de alto riesgo → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.cvcCheckFail (4000 0000 0000 0101) — Excel TC1087
			// Stripe: cvc_check falla post-auth. Resultado esperado: pago bloqueado, viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen implementado.');
		});
	});

	test('[TS-STRIPE-TC1088] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta always_blocked → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.highestRisk (4100 0000 0000 0019) — Excel TC1088
			// Stripe: Radar bloquea por riesgo máximo. Resultado esperado: pago bloqueado, viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1089] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → CVC check fail con riesgo elevado → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.cvcCheckFailElevated (4000 0000 0000 4954) — Excel TC1089
			// Resultado esperado: rechazo por CVC + regla elevada de riesgo, viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1090] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → ZIP check fail con riesgo elevado → bloqueado', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.zipFailElevated
			// Resultado esperado: rechazo por AVS ZIP + regla elevada, viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

	test('[TS-STRIPE-TC1091] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
		await webPhaseCargoAppPax(page);

		await test.step('[DRIVER APP] Conductor finaliza viaje → dirección no disponible → bloqueado por antifraud', async () => {
			// Tarjeta: STRIPE_TEST_CARDS.addressUnavailable
			// Resultado esperado: rechazo por AVS sin dirección disponible, viaje "En conflicto".
			test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
		});
	});

});
