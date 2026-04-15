/**
 * TCs: TS-STRIPE-TC1039
 * Feature: Carrier · Cliente Contractor + Pasajero App Pax invitado · Hold ON · Fallo 3DS — pop-up de error, viaje no se crea
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1039 – Hold ON + cliente contractor + pasajero app pax invitado + tarjeta threeDSRequired + fallo autenticación:
 *          pop-up de error visible, URL permanece en formulario de alta sin crear viaje
 */
import { expect } from '@playwright/test';
import { test } from '../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup } from '../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[TS-STRIPE-TC1039] Hold ON + cliente contractor + pasajero app pax invitado + threeDSRequired + fallo 3DS — pop-up de error, URL permanece en formulario', () => {
	test('muestra pop-up de error de autenticación 3DS y no crea el viaje cuando la autenticación falla', async ({ page }) => {
		test.setTimeout(90_000);

		const dashboard = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel = new NewTravelPage(page);
		const threeDS = new ThreeDSModal(page);
		const popup = new ThreeDSErrorPopup(page);

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('Validar hold activo en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
			await preferences.assertHoldEnabled();
		});

		await test.step('Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Seleccionar cliente contractor, pasajero app pax invitado y tarjeta threeDSRequired', async () => {
			await travel.selectClient(TEST_DATA.contractorClient);
			await travel.selectGuestPassenger(TEST_DATA.appPaxPassenger);
			await travel.setOrigin(TEST_DATA.origin);
			await travel.setDestination(TEST_DATA.destination);
			await travel.selectCardByLast4(STRIPE_TEST_CARDS.threeDSRequired.slice(-4));
		});

		await test.step('Enviar viaje — sistema presenta modal 3DS, completar con fallo', async () => {
			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
		});

		await test.step('Validar pop-up de error por autenticación 3DS fallida', async () => {
			await popup.waitForVisible();
			const message = await popup.getMessage();
			expect(message ?? '').toMatch(/autentic|authenticate|unable to authenticate/i);
			await popup.accept();
		});

		await test.step('Validar que la URL permanece en el formulario — viaje no fue creado', async () => {
			await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
		});
	});
});
