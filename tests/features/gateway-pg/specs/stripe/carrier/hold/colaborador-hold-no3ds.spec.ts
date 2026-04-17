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

type CardFlow = 'new' | 'existing';

type HoldNo3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	apiSearchQuery?: string;
	/**
	 * Define el preludio de tarjeta del test:
	 *  - 'new': el flujo fuerza vincular una tarjeta nueva (preferSavedCard=false)
	 *  - 'existing': requiere tarjeta ya vinculada; si no existe el test se salta con motivo
	 */
	cardFlow?: CardFlow;
};

/**
 * Resuelve la precondición de tarjeta según cardFlow.
 * - 'new': valida (para cleanup) y fuerza preferSavedCard=false en fillMinimum
 * - 'existing': exige hasRequiredCard=true, sino test.skip() con mensaje claro
 * Ver gap en reporte fase 3: no existe ensureCardAbsent, se acepta que card-new
 * pueda ejecutarse con tarjeta previa — lo crítico es que el flujo vincula nueva.
 */
async function resolveCardFlow(
	page: Page,
	scenario: HoldNo3dsScenario,
	cardLast4: string,
): Promise<{ cardCheck: CardPreconditionResult | null; preferSavedCard: boolean }> {
	const cardFlow: CardFlow = scenario.cardFlow ?? 'new';
	let cardCheck: CardPreconditionResult | null = null;

	if (scenario.apiSearchQuery) {
		cardCheck = await validateCardPrecondition(page, {
			passengerName: scenario.apiSearchQuery,
			requiredLast4: cardLast4,
		});
		console.log(`[card-precondition] ${scenario.passenger} (cardFlow=${cardFlow}): ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
	}

	if (cardFlow === 'existing') {
		test.skip(
			!cardCheck?.hasRequiredCard,
			`[card-existing] Precondición: pasajero ${scenario.passenger} debe tener tarjeta ${cardLast4} vinculada. Vincular manualmente o correr un test card-new antes.`,
		);
		return { cardCheck, preferSavedCard: true };
	}

	// cardFlow === 'new': forzar vinculación nueva independiente de lo ya existente
	return { cardCheck, preferSavedCard: false };
}

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

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlow(page, scenario, cardLast4);
		preferSavedCard = resolved.preferSavedCard;
	});

	try {
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
				preferSavedCard,
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

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlow(page, scenario, cardLast4);
		preferSavedCard = resolved.preferSavedCard;
	});

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
				preferSavedCard,
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
		// TC1033 es el smoke legacy pre-fase2; no tiene par -CARD-EXISTING en JSON.
		test('[TS-STRIPE-TC1033] @smoke @hold hold+cobro colaborador sin 3DS', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		test('[TS-STRIPE-TC1035] @regression @hold @card-new hold+cobro colaborador sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		// Par card-existing de TC1035 — canonical_ref TS-STRIPE-TC1035 en normalized-test-cases.json
		test('[TS-STRIPE-TC1041] @regression @hold @card-existing hold+cobro colaborador sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
				cardFlow: 'existing',
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
				cardFlow: 'new',
			});
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1034] @regression @hold @card-new sin hold colaborador sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		// Par card-existing de TC1034 — canonical_ref TS-STRIPE-TC1034 en normalized-test-cases.json
		test('[TS-STRIPE-TC1036] @regression @hold @card-existing sin hold colaborador sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
				cardFlow: 'existing',
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
				cardFlow: 'new',
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
				cardFlow: 'new',
			});
		});
	});

});
