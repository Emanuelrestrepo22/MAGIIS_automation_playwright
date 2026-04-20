/**
 * TCs: TS-STRIPE-TC1082–TC1086
 * Feature: Cargo a Bordo — App Pax — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): selecciona Cargo a Bordo → trip creado → "Buscando conductor" ✅ (siempre igual)
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → la tarjeta es rechazada
 *
 * La fase web es IDÉNTICA al TC1081 (happy path).
 * La variación ocurre SOLO en la app del conductor al momento del cobro.
 *
 * Precondición: misma que TC1081 — pasajero appPax con tarjeta Cargo a Bordo activa.
 * Evidencia web: test-17.spec.ts
 */
import type { Page } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 120_000 });

async function webPhaseCargoAppPax(page: Page): Promise<TravelIdRef> {
	const dashboard = new DashboardPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	const travelIdRef = await captureCreatedTravelId(page);

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

	return travelIdRef;
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Declines', () => {

	test('[TS-STRIPE-TC1082] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta declinada → pago rechazado genérico', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen implementado.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1083] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta sin fondos → pago rechazado', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1084] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta reportada como perdida → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1085] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con CVC incorrecto → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1086] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → cobra con tarjeta reportada como robada → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
