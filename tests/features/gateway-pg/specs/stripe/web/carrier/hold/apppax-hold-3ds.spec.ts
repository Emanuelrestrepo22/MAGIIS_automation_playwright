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
import type { Page } from '@playwright/test';
// KATA conformance (feature/kata-conformance): este spec es la prueba de patrón del refactor a KATA.
//   - test/expect vienen del fixture unificado KATA (@TestFixture) en vez de TestBase.
//   - el modal 3DS usa el componente KATA `ThreeDsChallengePage extends UiBase` (@ui) en vez del POM ThreeDSModal.
//   - los POMs del sustrato carrier (Dashboard/NewTravel/OperationalPreferences/TravelManagement) siguen intactos.
// Mapeo TS-STRIPE-TC10xx → MG: no hay 1:1 en el idmap (API-level). Key primaria del spec = MG-158
// (área E · hold, anotada a nivel describe); los ATC del challenge 3DS mapean al área D (MG-152/MG-153)
// dentro del componente. Mapeo por área aceptado (idmap API-level, sin 1:1 con los TS-STRIPE-TC10xx UI).
import { test, expect } from '@TestFixture';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { shortDestination, waitForTravelCreation } from '../../../../../helpers/journey-url.helpers';
import { validateCardPrecondition, type CardPreconditionResult } from '../../../../../helpers/card-precondition';
import { setHoldViaApi } from '../../../../../helpers/parameters-api';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../../data/passengers';
import { debugLog } from '../../../../../../../helpers';

// BL-i18n/v1.72.8: en v1.72.8 el toggle de pre-autorización en la UI no habilita
// "Guardar" ni persiste (exploratory 2026-07-20). El setup fija el hold vía API.
async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	const params = await setHoldViaApi(preferences.getPage(), false);
	expect(params.enableCreditCardHold).toBe(false);
}

async function restoreHoldAndSave(page: Page, _preferences: OperationalPreferencesPage): Promise<void> {
	const params = await setHoldViaApi(page, true);
	expect(params.enableCreditCardHold).toBe(true);
	expect(params.ccHoldPreviousHs).toBe(2);
	expect(params.ccHoldCoverage).toBe(10);
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
	const threeDS = new ThreeDsChallengePage({ page });
	const cardLast4 = scenario.cardLast4 || STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4);
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
				debugLog('gateway-pg:carrier', `[card-precondition] ${scenario.passenger}: ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
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
	const threeDS = new ThreeDsChallengePage({ page });
	const cardLast4 = scenario.cardLast4 || STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4);
	let travelIdRef: TravelIdRef | null = null;

	await loginAsDispatcher(page);

	let cardCheck: CardPreconditionResult | null = null;
	if (scenario.apiSearchQuery) {
		await test.step('Precondición: validar tarjeta vinculada vía API', async () => {
			cardCheck = await validateCardPrecondition(page, {
				passengerName: scenario.apiSearchQuery!,
				requiredLast4: cardLast4,
			});
			debugLog('gateway-pg:carrier', `[card-precondition] ${scenario.passenger}: ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
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

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · App Pax — Hold con 3DS @gateway @stripe @hold @3ds @critical @regression', { annotation: [{ type: 'tms', description: 'MG-158' }] }, () => {

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
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
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
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
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
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
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
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
			});
		});

	});

});
