/**
 * TCs: TS-STRIPE-TC1082–TC1086
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — Rechazos y errores
 * Tags: @regression @cargo-a-bordo @web-only
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

async function assertDeclinedOutcome(page: Page): Promise<void> {
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
		page.getByText(/declined|declinada|rechazada|insuficient|funds|cvc|robada|perdida|autoriz/i).first()
	).toBeVisible({ timeout: 10_000 });
}

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · Declines', () => {

  test('[TS-STRIPE-TC1082] @regression @cargo-a-bordo pago rechazado genérico', async ({ page }) => {
    await createCargoTripWithCard(page, STRIPE_TEST_CARDS.declined.slice(-4));
    await assertDeclinedOutcome(page);
  });
  test('[TS-STRIPE-TC1083] @regression @cargo-a-bordo fondos insuficientes', async ({ page }) => {
    await createCargoTripWithCard(page, STRIPE_TEST_CARDS.insufficientFunds.slice(-4));
    await assertDeclinedOutcome(page);
  });
  test('[TS-STRIPE-TC1084] @regression @cargo-a-bordo tarjeta reportada como perdida', async ({ page }) => {
    await createCargoTripWithCard(page, STRIPE_TEST_CARDS.lostCard.slice(-4));
    await assertDeclinedOutcome(page);
  });
  test('[TS-STRIPE-TC1085] @regression @cargo-a-bordo CVC incorrecto', async ({ page }) => {
    await createCargoTripWithCard(page, STRIPE_TEST_CARDS.incorrectCvc.slice(-4));
    await assertDeclinedOutcome(page);
  });
  test('[TS-STRIPE-TC1086] @regression @cargo-a-bordo tarjeta robada', async ({ page }) => {
    await createCargoTripWithCard(page, STRIPE_TEST_CARDS.stolenCard.slice(-4));
    await assertDeclinedOutcome(page);
  });

});
