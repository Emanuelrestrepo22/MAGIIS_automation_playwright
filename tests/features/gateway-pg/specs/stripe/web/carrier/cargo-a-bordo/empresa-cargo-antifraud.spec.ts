/**
 * TCs: TS-STRIPE-TC1117–TC1121
 * Feature: Cargo a Bordo — Empresa Individuo — Antifraud desde Driver App
 * Tags: @regression @cargo-a-bordo
 *
 * Arquitectura del flujo:
 * - WEB (carrier): cliente empresa individuo + Cargo a Bordo → trip creado → "Buscando conductor" ✅
 * - DRIVER APP (Appium): conductor finaliza viaje e intenta cobrar → tarjeta dispara regla antifraud
 *
 * TEST_DATA.client = 'Marcelle Stripe' (empresa individuo), TEST_DATA.passenger = 'Emanuel Restrepo' (appPax)
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';

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

	await test.step('Completar formulario — empresa individuo + metodo Cargo a Bordo', async () => {
		await travel.selectClient(TEST_DATA.client);
		await travel.selectPassenger(TEST_DATA.passenger);
		await travel.setOrigin(TEST_DATA.origin);
		await travel.setDestination(TEST_DATA.destination);
		await travel.selectPaymentMethod('CargoABordo');
	});

	await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
		await travel.clickSelectVehicle();
		await travel.clickSendService();
	});

	await test.step('Verificar que no aparece modal 3DS', async () => {
		await expectNoThreeDSModal(page);
	});

	await test.step('Confirmar creación del viaje via network interception', async () => {
		// Cargo a Bordo post-submit puede quedarse en /travel/create?limitExceeded=false
		// como comportamiento normal. Fuente de verdad: POST /travels interceptado.
		await expect
			.poll(() => travelIdRef?.travelId, {
				timeout: 15_000,
				message: '[Cargo a Bordo empresa] POST /travels no capturó travelId tras el submit',
			})
			.not.toBeNull();
	});

	await test.step('Validar estado del viaje - Buscando chofer en gestión', async () => {
		await management.goto();
		await management.expectPassengerInPorAsignar(TEST_DATA.passenger, undefined, 'Buscando chofer');
	});

	return travelIdRef;
}

test.describe('Gateway PG · Carrier · Empresa Individuo — Cargo a Bordo · Antifraud', () => {

	test('[TS-STRIPE-TC1117] @regression @cargo-a-bordo tarjeta alto riesgo desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → tarjeta alto riesgo → bloqueado por antifraud', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1118] @regression @cargo-a-bordo tarjeta siempre bloqueada desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → always_blocked → bloqueado por antifraud', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1119] @regression @cargo-a-bordo CVC check fail elevated desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → CVC check fail elevado → bloqueado', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1120] @regression @cargo-a-bordo ZIP fail elevated desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → ZIP fail elevado → bloqueado por antifraud', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1121] @regression @cargo-a-bordo address unavailable desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoEmpresa(page);
			await test.step('[DRIVER APP] Conductor cobra → direccion no disponible → bloqueado por antifraud', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
