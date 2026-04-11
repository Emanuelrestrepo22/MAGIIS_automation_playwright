/**
 * TCs: TC-3DS-02
 * Feature: Vinculacion de tarjeta preautorizada con fallo 3DS
 * Tags: @regression @3ds @web-only
 */
import { expect } from '@playwright/test';
import { test } from '../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup } from '../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[TC-3DS-02] Recorded flow - vinculacion preautorizada con 3DS fallido', () => {
	test('muestra error cuando falla la autenticacion 3DS', async ({ page }) => {
		test.setTimeout(90_000);

		const dashboard = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel = new NewTravelPage(page);
		const threeDS = new ThreeDSModal(page);
		const popup = new ThreeDSErrorPopup(page);

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('Validar hold activo', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();
		});

		await test.step('Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario con PAX invitado y tarjeta 3DS obligatoria', async () => {
			await travel.selectClient(TEST_DATA.contractorClient);
			await travel.selectGuestPassenger(TEST_DATA.appPaxPassenger);
			await travel.setOrigin(TEST_DATA.origin);
			await travel.setDestination(TEST_DATA.destination);
			await travel.selectCardByLast4(STRIPE_TEST_CARDS.threeDSRequired.slice(-4));
		});

		await test.step('Validar tarjeta y rechazar autenticacion 3DS', async () => {
			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
		});

		await test.step('Validar mensaje de error por autenticacion fallida', async () => {
			await popup.waitForVisible();
			const message = await popup.getMessage();
			expect(message ?? '').toMatch(/autentic|authenticate|unable to authenticate/i);
			await popup.accept();
		});

		await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
	});
});
