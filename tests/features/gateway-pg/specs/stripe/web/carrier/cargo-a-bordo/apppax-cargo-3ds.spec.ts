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
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { validateCardPrecondition } from '../../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../../data/passengers';
import { debugLog } from '../../../../../../../helpers';

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

	await test.step('Precondición: validar tarjeta 3DS (3155) vinculada al pasajero appPax', async () => {
		const check = await validateCardPrecondition(page, {
			passengerName: PASSENGERS.appPax.apiSearchQuery!,
			requiredLast4: '3155',
		});
		debugLog('gateway-pg:carrier', `[card-precondition] ${PASSENGERS.appPax.name}: ${check.activeCards} tarjetas, tiene 3155: ${check.hasRequiredCard}, limpiadas: ${check.cardsDeleted}`);
		if (!check.hasRequiredCard) {
			throw new Error(
				`[TC1092] PRECONDICIÓN NO CUMPLIDA: pasajero appPax sin tarjeta 3DS 3155 activa (tarjetas activas: ${check.activeCards}). Vincular manualmente en TEST antes de ejecutar.`
			);
		}
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

	return travelIdRef;
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · 3DS', () => {

	test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero completa challenge → cobro exitoso', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium + DriverTripPaymentScreen + manejo de WebView 3DS.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo 3DS rechazado desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS requerido → pasajero rechaza challenge → cobro fallido', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error durante 3DS desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS con error de autenticación → cobro fallido', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS desde Driver App', async ({ page }) => {
		let travelIdRef: TravelIdRef | null = null;
		try {
			travelIdRef = await webPhaseCargoAppPax(page);
			await test.step('[DRIVER APP] Conductor finaliza viaje → 3DS falla completamente → cobro no procesado', async () => {
				test.fixme(true, 'PENDIENTE: fase Driver App — requiere Appium.');
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

});
