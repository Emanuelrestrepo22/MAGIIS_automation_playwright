/**
 * TCs: TS-STRIPE-TC1092–TC1095
 * Feature: Cargo a Bordo — Tarjeta de Crédito — Usuario App Pax — 3D Secure
 * Tags: @critical @3ds @cargo-a-bordo @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage } from '../../../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: undefined });

type CargoScenario = {
	cardLast4: string;
	origin: string;
	destination: string;
};

async function openCargoFormWithCard(page: Page, scenario: CargoScenario): Promise<{
	travel: NewTravelPage;
	threeDS: ThreeDSModal;
	errorPopup: ThreeDSErrorPopup;
}> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const threeDS = new ThreeDSModal(page);
	const errorPopup = new ThreeDSErrorPopup(page);

	await loginAsDispatcher(page);
	await preferences.goto();
	await preferences.ensureHoldEnabled();

	await dashboard.openNewTravel();
	await travel.ensureLoaded();
	await travel.selectServiceType('cargo');
	await travel.selectClient(TEST_DATA.appPaxPassenger);
	await travel.selectPassenger(TEST_DATA.appPaxPassenger);
	await travel.setOrigin(scenario.origin);
	await travel.setDestination(scenario.destination);
	await travel.selectCardByLast4(scenario.cardLast4);

	return { travel, threeDS, errorPopup };
}

async function complete3dsOrFail(threeDS: ThreeDSModal, mode: 'success' | 'fail'): Promise<void> {
	await threeDS.waitForVisible();
	if (mode === 'success') {
		await threeDS.completeSuccess();
	} else {
		await threeDS.completeFail();
	}
	await threeDS.waitForHidden();
}

// BLOQUEADO: TC1092–TC1095 son flujos Driver App (Appium).
// El cobro con tarjeta en Cargo a Bordo ocurre desde la app del conductor al finalizar el viaje.
// No hay formulario Stripe ni 3DS desde carrier web para este método de pago.
// Requiere Appium + Driver App.

test.describe('Gateway PG · Carrier · App Pax — Cargo a Bordo · 3DS', () => {

  test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS obligatorio', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium. El cobro ocurre al finalizar viaje desde app conductor.');
  });
  test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo pago rechazado con 3DS obligatorio', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error con 3DS obligatorio', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });
  test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS', async () => {
    test.fixme(true, 'BLOQUEADO: flujo Driver App — requiere Appium.');
  });

  /* Tests originales preservados como referencia para implementación Appium:
  test('[TS-STRIPE-TC1092] @critical @3ds @cargo-a-bordo pago exitoso con 3DS obligatorio', async ({ page }) => {
    const { travel, threeDS } = await openCargoFormWithCard(page, {
      cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4),
      origin: TEST_DATA.origin,
      destination: TEST_DATA.destination,
    });

    await travel.clickSelectVehicle();
    await travel.clickSendService();
    await complete3dsOrFail(threeDS, 'success');

    const detail = new TravelDetailPage(page);
    await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
    await detail.expectStatus('Buscando conductor');
  });
  test('[TS-STRIPE-TC1093] @regression @3ds @cargo-a-bordo pago rechazado con 3DS obligatorio', async ({ page }) => {
    const { travel, threeDS, errorPopup } = await openCargoFormWithCard(page, {
      cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4),
      origin: TEST_DATA.origin,
      destination: TEST_DATA.destination,
    });

    await travel.clickSelectVehicle();
    await travel.clickSendService();
    await complete3dsOrFail(threeDS, 'fail');

    const popupVisible = await errorPopup.waitForVisible(10_000).then(() => true).catch(() => false);
    if (popupVisible) {
      await errorPopup.accept();
    }

    const detailUrlPattern = /\/travels\/[\w-]+/;
    const reachedDetail = detailUrlPattern.test(page.url())
      || await page.waitForURL(detailUrlPattern, { timeout: 4_000 }).then(() => true).catch(() => false);

    if (reachedDetail) {
      const detail = new TravelDetailPage(page);
      await expect(detail.getTravelStatus()).toContainText(/No Autorizado|NO_AUTORIZADO|En conflicto|Conflict/i, { timeout: 15_000 });
    } else {
      await expect(page).toHaveURL(/\/travel\/create/, { timeout: 15_000 });
    }
  });
  test('[TS-STRIPE-TC1094] @regression @3ds @cargo-a-bordo error con 3DS obligatorio', async ({ page }) => {
    const { travel, threeDS, errorPopup } = await openCargoFormWithCard(page, {
      cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
      origin: 'Av. Corrientes 1234, Buenos Aires',
      destination: 'Av. Santa Fe 2100, Buenos Aires',
    });

    await travel.clickSelectVehicle();
    await travel.clickSendService();
    await complete3dsOrFail(threeDS, 'fail');

    await errorPopup.waitForVisible(10_000);
    await expect.soft(page.getByText(/No podemos autenticar tu|unable to authenticate/i)).toBeVisible({ timeout: 10_000 });
    await errorPopup.accept();
  });
  test('[TS-STRIPE-TC1095] @regression @3ds @cargo-a-bordo falla 3DS', async ({ page }) => {
    const { travel, threeDS, errorPopup } = await openCargoFormWithCard(page, {
      cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4),
      origin: 'Florida 100, CABA',
      destination: 'Palermo Soho, CABA',
    });

    await travel.clickSelectVehicle();
    await travel.clickSendService();
    await complete3dsOrFail(threeDS, 'fail');

    const popupVisible = await errorPopup.waitForVisible(10_000).then(() => true).catch(() => false);
    if (popupVisible) {
      await errorPopup.accept();
    }
    await expect.soft(page.getByText(/declined|rechazada|autenticar|autoriz/i).first()).toBeVisible({ timeout: 10_000 });
  });
  */ // fin tests preservados como referencia

});
