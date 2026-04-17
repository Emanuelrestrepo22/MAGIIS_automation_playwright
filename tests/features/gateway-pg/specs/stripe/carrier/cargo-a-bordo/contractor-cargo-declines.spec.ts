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
 */
import type { Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../helpers/travel-cleanup';

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 120_000 });

async function webPhaseCargoContractor(page: Page): Promise<TravelIdRef> {
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

	await test.step('Completar formulario — cliente contractor + método Cargo a Bordo', async () => {
		await travel.selectClient(TEST_DATA.contractorClient);
		await travel.selectPassenger(TEST_DATA.contractorPassenger);
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
			throw new Error('[Cargo a Bordo contractor] PRECONDICIÓN NO CUMPLIDA: limitExceeded=false. Verificar tarjeta Cargo a Bordo del pasajero contractor en TEST.');
		}
		if (result === 'timeout') {
			throw new Error('[Cargo a Bordo contractor] TIMEOUT: URL no redirigió al detalle del viaje.');
		}

		await management.goto();
		await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, TEST_DATA.destination);
		await management.openDetailForPassenger(TEST_DATA.contractorPassenger, TEST_DATA.destination);
		await detail.expectStatus('Buscando conductor');
	});

	return travelIdRef;
}

test.describe('Gateway PG · Carrier · Colaborador/Contractor — Cargo a Bordo · Declines', () => {

	test('[TS-STRIPE-TC1097] @regression @cargo-a-bordo pago rechazado genérico desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoContractor(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta declinada genéricamente → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1098] @regression @cargo-a-bordo fondos insuficientes desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoContractor(page);
			await test.step('[DRIVER APP] Conductor cobra → fondos insuficientes → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1099] @regression @cargo-a-bordo tarjeta perdida desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoContractor(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta reportada como perdida → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1100] @regression @cargo-a-bordo CVC incorrecto desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoContractor(page);
			await test.step('[DRIVER APP] Conductor cobra → CVC incorrecto → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1101] @regression @cargo-a-bordo tarjeta robada desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoContractor(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta robada → rechazo', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
