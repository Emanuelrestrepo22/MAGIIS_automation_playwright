/**
 * TCs: TS-STRIPE-TC1037–TC1040, TC1045–TC1048
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — con 3DS
 * Tags: @critical @3ds @hold @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelManagementPage } from '../../../../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../../../../helpers/stripe.helpers';
import { validateCardPrecondition, type CardPreconditionResult } from '../../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../../data/passengers';
import { debugLog } from '../../../../../../../helpers';

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

type Hold3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4?: string;
	apiSearchQuery?: string;
	/**
	 * Define el preludio de tarjeta del test:
	 *  - 'new': vincula tarjeta nueva (preferSavedCard=false)
	 *  - 'existing': requiere tarjeta ya vinculada; si no existe, test.skip()
	 * Gap conocido: no existe ensureCardAbsent; card-new puede ejecutarse con
	 * tarjeta previa pero el flujo siempre crea una tarjeta nueva en el iframe.
	 */
	cardFlow?: CardFlow;
};

async function resolveCardFlow3ds(
	page: Page,
	scenario: Hold3dsScenario,
	cardLast4: string,
): Promise<{ cardCheck: CardPreconditionResult | null; preferSavedCard: boolean }> {
	const cardFlow: CardFlow = scenario.cardFlow ?? 'new';
	let cardCheck: CardPreconditionResult | null = null;

	if (scenario.apiSearchQuery) {
		cardCheck = await validateCardPrecondition(page, {
			passengerName: scenario.apiSearchQuery,
			requiredLast4: cardLast4,
		});
		debugLog('gateway-pg:carrier', `[card-precondition 3ds] ${scenario.passenger} (cardFlow=${cardFlow}): ${cardCheck.activeCards} tarjetas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
	}

	if (cardFlow === 'existing') {
		test.skip(
			!cardCheck?.hasRequiredCard,
			`[card-existing 3ds] Precondición: pasajero ${scenario.passenger} debe tener tarjeta ${cardLast4} vinculada.`,
		);
		return { cardCheck, preferSavedCard: true };
	}

	return { cardCheck, preferSavedCard: false };
}

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

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlow3ds(page, scenario, cardLast4);
		preferSavedCard = resolved.preferSavedCard;
	});

	try {
		travelIdRef = await captureCreatedTravelId(page);

		await test.step('Validar que el hold esté activado en preferencias operativas', async () => {
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
				preferSavedCard,
			});
		});

		await test.step('Aprobar modal 3DS de Stripe (validación inicial)', async () => {
			// Con card-new aparece el modal 3DS tras vincular; con card-existing puede omitirse
			// (se dispara recién en el submit). Se usa waitForOptionalVisible para cubrir ambos.
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
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

		await test.step('Validar viaje en gestión — columna Asignar (hold+3DS OK)', async () => {
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

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlow3ds(page, scenario, cardLast4);
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

		await test.step('Completar formulario con tarjeta 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4,
				preferSavedCard,
			});
		});

		await test.step('Aprobar modal 3DS de Stripe (validación inicial)', async () => {
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
			if (await threeDS.waitForOptionalVisible(5_000)) {
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			}
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestión — columna Asignar (sin hold + 3DS)', async () => {
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

test.describe('Gateway PG · Carrier · Colaborador — Hold con 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1037] @critical @3ds @hold @card-new hold+cobro colaborador 3DS — Vincular tarjeta nueva', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
    // TC1039 en el JSON es un escenario negativo (fallo 3DS); en este spec se mantiene
    // la cobertura histórica con alwaysAuthenticate. No tiene par -CARD-EXISTING.
    test('[TS-STRIPE-TC1039] @regression @3ds @hold hold+cobro colaborador 3DS variante', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: 'Av. Corrientes 1234, Buenos Aires',
        destination: 'Av. Santa Fe 2100, Buenos Aires',
        cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
    // Par card-existing de TC1037 — canonical_ref TS-STRIPE-TC1037 en normalized-test-cases.json
    test('[TS-STRIPE-TC1045] @regression @3ds @hold @card-existing hold+cobro colaborador 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'existing',
      });
    });
    // DEPRECATED: ver TC canónico TS-STRIPE-TC1037 (fase 2 — duplicado sin card-flow diferenciado)
    test('[TS-STRIPE-TC1047] @regression @3ds @hold hold+cobro colaborador 3DS variante 2', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: 'Florida 100, CABA',
        destination: 'Palermo Soho, CABA',
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1038] @regression @3ds @card-new sin hold colaborador 3DS — Vincular tarjeta nueva', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
    // Par card-existing de TC1038 — canonical_ref TS-STRIPE-TC1038 en normalized-test-cases.json
    test('[TS-STRIPE-TC1040] @regression @3ds @card-existing sin hold colaborador 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: 'Av. Corrientes 1234, Buenos Aires',
        destination: 'Av. Santa Fe 2100, Buenos Aires',
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'existing',
      });
    });
    // DEPRECATED: ver TC canónico TS-STRIPE-TC1038 (fase 2 — duplicado sin card-flow diferenciado)
    test('[TS-STRIPE-TC1046] @regression @3ds sin hold colaborador 3DS (set 2)', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
    // DEPRECATED: ver TC canónico TS-STRIPE-TC1038 (fase 2 — duplicado sin card-flow diferenciado)
    test('[TS-STRIPE-TC1048] @regression @3ds sin hold colaborador 3DS variante 2', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: TEST_DATA.contractorClient,
        passenger: TEST_DATA.contractorPassenger,
        origin: 'Florida 100, CABA',
        destination: 'Palermo Soho, CABA',
        apiSearchQuery: PASSENGERS.colaborador.apiSearchQuery,
        cardFlow: 'new',
      });
    });
  });

});
