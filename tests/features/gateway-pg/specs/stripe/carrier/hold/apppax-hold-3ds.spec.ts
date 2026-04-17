/**
 * TCs: TS-STRIPE-TC1053–TC1056, TC1061–TC1064
 * Feature: Alta de Viaje desde Carrier — Usuario App Pax — Tarjeta Preautorizada con 3DS
 * Tags: @smoke @critical @3ds @hold @web-only
 * Fuente: tests/features/gateway-pg/recorded/alta-viaje-full.recorded.ts (flujo de referencia grabado y validado)
 *
 * Precondiciones:
 *   - Hold activo en Configuración Parámetros (ccHoldPreviousHs=2, ccHoldCoverage=10)
 *   - Cliente/pasajero app pax 'Emanuel Restrepo' disponible en TEST
 *   - Tarjeta 4000002500003155 (3DS required — success)
 *
 * Ejecución: ENV=test npx playwright test apppax-hold-3ds -c playwright.gateway-pg.config.ts --workers=1
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelManagementPage } from '../../../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../../../helpers/stripe.helpers';
import { validateCardPrecondition, type CardPreconditionResult } from '../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../data/passengers';

function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

type ParametersSavePayload = {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number | string;
	ccHoldCoverage?: number | string;
	[key: string]: unknown;
};

const PARAMETERS_SAVE_URL = /\/magiis-v0\.2\/carriers\/\d+\/parameters$/;

async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(false);

	const saveResult = await preferences.saveAndCaptureParametersPayload();
	expect(saveResult.url).toContain('/magiis-v0.2/carriers/1521/parameters');
	expect(saveResult.payload.enableCreditCardHold).toBe(false);
	expect(saveResult.payload.ccHoldPreviousHs).toBe(2);
	expect(saveResult.payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldDisabled();
}

async function restoreHoldAndSave(page: Page, preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(true);

	const responsePromise = page.waitForResponse(
		(response) => response.request().method() === 'POST' && PARAMETERS_SAVE_URL.test(response.url()),
		{ timeout: 15_000 }
	);

	await preferences.save();

	const response = await responsePromise;
	expect(response.ok()).toBeTruthy();

	const payload = response.request().postDataJSON() as ParametersSavePayload;
	expect(payload.enableCreditCardHold).toBe(true);
	expect(payload.ccHoldPreviousHs).toBe(2);
	expect(payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldEnabled();
}

type Hold3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4?: string;
	apiSearchQuery?: string;
};

async function runHoldOnScenario(page: Page, scenario: Hold3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const threeDS = new ThreeDSModal(page);
	const cardLast4 = scenario.cardLast4 || STRIPE_TEST_CARDS.success3DS.slice(-4);
	let travelIdRef: TravelIdRef | null = null;

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	try {
		let cardCheck: CardPreconditionResult | null = null;
		if (scenario.apiSearchQuery) {
			await test.step('Precondición: validar tarjeta vinculada vía API', async () => {
				cardCheck = await validateCardPrecondition(page, {
					passengerName: scenario.apiSearchQuery!,
					requiredLast4: cardLast4,
				});
				console.log(`[card-precondition] ${scenario.passenger}: ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
			});
		}

		travelIdRef = await captureCreatedTravelId(page);

		await test.step('Validar que el hold este activado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario con tarjeta 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4,
				preferSavedCard: cardCheck?.hasRequiredCard ?? false,
			});
		});

		// Si la tarjeta se seleccionó del dropdown (saved), puede saltar validación 3DS inicial.
		// Si se vinculó nueva (Stripe iframe), siempre dispara 3DS.
		await test.step('Aprobar modal 3DS de Stripe (validacion inicial)', async () => {
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Aprobar 3DS adicional si aparece post-envio', async () => {
			// Con saved card el backend puede reutilizar la autorización previa → no hay 3DS.
			// Con nueva card se dispara 3DS post-hold. Wait corto no-bloqueante.
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (hold+3DS OK)', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(scenario.passenger, shortDestination(scenario.destination));
		});
	} finally {
		if (travelIdRef) {
			await test.step('Cleanup: cancelar viaje creado', async () => {
				await cancelTravelIfCreated(page, travelIdRef!);
			});
		}
	}
}

async function runHoldOffScenario(page: Page, scenario: Hold3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const threeDS = new ThreeDSModal(page);
	const cardLast4 = scenario.cardLast4 || STRIPE_TEST_CARDS.success3DS.slice(-4);
	let travelIdRef: TravelIdRef | null = null;

	await loginAsDispatcher(page);

	let cardCheck: CardPreconditionResult | null = null;
	if (scenario.apiSearchQuery) {
		await test.step('Precondición: validar tarjeta vinculada vía API', async () => {
			cardCheck = await validateCardPrecondition(page, {
				passengerName: scenario.apiSearchQuery!,
				requiredLast4: cardLast4,
			});
			console.log(`[card-precondition] ${scenario.passenger}: ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
		});
	}

	try {
		travelIdRef = await captureCreatedTravelId(page);

		await test.step('Desactivar hold en preferencias operativas', async () => {
			await disableHoldAndSave(preferences);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario con tarjeta 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4,
				preferSavedCard: cardCheck?.hasRequiredCard ?? false,
			});
		});

		await test.step('Aprobar modal 3DS de Stripe (validacion inicial)', async () => {
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Aprobar 3DS adicional si aparece post-envio', async () => {
			// Con saved card el backend puede reutilizar la autorización previa → no hay 3DS.
			// Con nueva card se dispara 3DS post-hold. Wait corto no-bloqueante.
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (sin hold + 3DS)', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(scenario.passenger, shortDestination(scenario.destination));
		});
	} finally {
		if (travelIdRef) {
			await test.step('Cleanup: cancelar viaje creado', async () => {
				await cancelTravelIfCreated(page, travelIdRef!);
			});
		}
		await test.step('Restaurar hold al final del test', async () => {
			await restoreHoldAndSave(page, preferences);
		});
	}
}

test.use({ role: 'carrier', storageState: undefined });

test.describe('Gateway PG · Carrier · App Pax — Hold con 3DS', () => {

	test.describe('Hold ON — autenticación 3DS exitosa', () => {

		// Debería crear un viaje con hold activo, completar 3DS con éxito,
		// y dejar el viaje en estado "Buscando conductor" visible en gestión.
		test('[TS-STRIPE-TC1053] @smoke @critical @3ds @hold hold+cobro app pax 3DS success', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 3184
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1055] @regression @3ds @hold hold+cobro app pax 3DS success variante', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1061] @regression @3ds @hold hold+cobro app pax 3DS success (set 2)', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1063] @regression @3ds @hold hold+cobro app pax 3DS success variante 2', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

	});

	test.describe('Hold OFF — sin cobro al finalizar', () => {

		test('[TS-STRIPE-TC1054] @regression @3ds sin hold app pax 3DS success', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4), // 3184
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1056] @regression @3ds sin hold app pax 3DS success variante', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1062] @regression @3ds sin hold app pax 3DS success (set 2)', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1064] @regression @3ds sin hold app pax 3DS success variante 2', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

	});

});
