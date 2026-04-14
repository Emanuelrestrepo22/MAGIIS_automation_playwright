/**
 * TCs: TS-STRIPE-TC1087–TC1091
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Antifraude
 * Tags: @regression @antifraud @cargo-a-bordo @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelDetailPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: undefined });

async function createCargoTripWithCard(page: Page, cardLast4: string): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);

	await loginAsDispatcher(page);
	await preferences.goto();
	await preferences.ensureHoldEnabled();

	await dashboard.openNewTravel();
	await travel.ensureLoaded();
	await travel.selectServiceType('cargo');
	await travel.selectClient(TEST_DATA.appPaxPassenger);
	await travel.selectPassenger(TEST_DATA.appPaxPassenger);
	await travel.setOrigin(TEST_DATA.origin);
	await travel.setDestination(TEST_DATA.destination);
	await travel.selectCardByLast4(cardLast4);
	await travel.clickSelectVehicle();
	await travel.clickSendService();
}

async function assertAntifraudOutcome(page: Page): Promise<void> {
	await expectNoThreeDSModal(page);

	const detailUrlPattern = /\/travels\/[\w-]+/;
	const reachedDetail = detailUrlPattern.test(page.url())
		|| await page.waitForURL(detailUrlPattern, { timeout: 4_000 }).then(() => true).catch(() => false);

	if (reachedDetail) {
		const detail = new TravelDetailPage(page);
		await expect(detail.getTravelStatus()).toContainText(/No Autorizado|NO_AUTORIZADO|En conflicto|Conflict/i, { timeout: 15_000 });
	} else {
		await expect(page).toHaveURL(/\/travel\/create/, { timeout: 15_000 });
	}

	await expect.soft(
		page.getByText(/declined|declinada|rechazada|risk|riesgo|blocked|bloquead|cvc|postal|address|autoriz/i).first()
	).toBeVisible({ timeout: 10_000 });
}

// BLOQUEADO: TC1087–TC1091 son flujos Driver App (Appium).
// El cobro con tarjeta en Cargo a Bordo ocurre desde la app del conductor al finalizar el viaje.
// Requiere Appium + Driver App para los escenarios de antifraude.

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Antifraude', () => {

  test('[TS-STRIPE-TC1087] @regression @antifraud falla comprobación CVC', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1088] @regression @antifraud riesgo máximo', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1089] @regression @antifraud tarjeta siempre bloqueada', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1090] @regression @antifraud falla código postal con riesgo elevado', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1091] @regression @antifraud dirección no disponible', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });

});
