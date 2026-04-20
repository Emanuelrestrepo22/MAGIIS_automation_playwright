/**
 * TCs: TS-STRIPE-TC1112–TC1116
 * Feature: Cargo a Bordo — Empresa Individuo — Rechazos desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente empresa individuo + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta rechazada
 *
 * TEST_DATA.client = 'Marcelle Stripe' (empresa individuo), TEST_DATA.passenger = 'Emanuel Restrepo' (appPax)
 */
import type { Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../helpers/travel-cleanup';

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 120_000 });

async function webPhaseCargoEmpresa(page: Page): Promise<TravelIdRef> {
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

	await test.step('Completar formulario — empresa individuo + método Cargo a Bordo', async () => {
		await travel.selectClient(TEST_DATA.client);
		await travel.selectPassenger(TEST_DATA.passenger);
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

	await test.step('Esperar redirección y validar estado Buscando conductor', async () => {
		const result = await Promise.race([
			page.waitForURL(/\/travels\/[\w-]+$/, { timeout: 15_000 }).then(() => 'success' as const),
			page.waitForURL(/limitExceeded/, { timeout: 15_000 }).then(() => 'limitExceeded' as const),
		]).catch(() => 'timeout' as const);

		if (result === 'limitExceeded') {
			throw new Error('[Cargo a Bordo empresa] PRECONDICIÓN NO CUMPLIDA: limitExceeded=false. Verificar tarjeta Cargo a Bordo de Marcelle Stripe en TEST.');
		}
		if (result === 'timeout') {
			throw new Error('[Cargo a Bordo empresa] TIMEOUT: URL no redirigió al detalle del viaje.');
		}

		await management.goto();
		await management.expectPassengerInPorAsignar(TEST_DATA.passenger, TEST_DATA.destination);
		await management.openDetailForPassenger(TEST_DATA.passenger, TEST_DATA.destination);
		await detail.expectStatus('Buscando conductor');
	});

	return travelIdRef;
}

test.describe('Gateway PG · Carrier · Empresa Individuo — Cargo a Bordo · Declines', () => {

	test('[TS-STRIPE-TC1112] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta declinada genéricamente → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1113] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → fondos insuficientes → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1114] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta perdida → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1115] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → CVC incorrecto → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1116] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta robada → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
