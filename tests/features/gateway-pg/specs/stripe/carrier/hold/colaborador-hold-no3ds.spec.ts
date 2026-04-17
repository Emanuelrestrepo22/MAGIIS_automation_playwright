/**
 * TCs: TS-STRIPE-TC1033–TC1044
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — sin 3DS
 * Tags: @regression @hold @web-only
 *
 * Sin 3DS set 1: TC1033–TC1036
 * Sin 3DS set 2: TC1041–TC1044
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
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

type HoldNo3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	apiSearchQuery?: string;
};

async function runHoldOnScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4);
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

		await test.step('Completar formulario con tarjeta sin 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4,
				preferSavedCard: cardCheck?.hasRequiredCard ?? false,
			});
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (hold OK)', async () => {
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

async function runHoldOffScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4);
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

		await test.step('Completar formulario con tarjeta sin 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4,
				preferSavedCard: cardCheck?.hasRequiredCard ?? false,
			});
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (sin hold)', async () => {
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
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · Colaborador — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1033] @smoke @hold hold+cobro colaborador sin 3DS', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1035] @regression @hold hold+cobro colaborador sin 3DS variante', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1041] @regression @hold hold+cobro colaborador sin 3DS (set 2)', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1035 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1043] @regression @hold hold+cobro colaborador sin 3DS variante set 2', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1034] @regression @hold sin hold colaborador sin 3DS', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		test('[TS-STRIPE-TC1036] @regression @hold sin hold colaborador sin 3DS variante', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1034 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1042] @regression @hold sin hold colaborador sin 3DS (set 2)', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1034 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1044] @regression @hold sin hold colaborador sin 3DS variante set 2', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
			});
		});
	});

});
