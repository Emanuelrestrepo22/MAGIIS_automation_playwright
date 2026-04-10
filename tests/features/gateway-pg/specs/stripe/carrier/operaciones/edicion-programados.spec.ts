/**
 * TCs: TS-STRIPE-P2-TC078-TC083
 * Feature: Edicion de Viajes Programados - Carrier - Empresa Individuo
 * Tags: @regression @web-only
 */
import { expect } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS } from '../../../../fixtures/gateway.fixtures';

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · Empresa Individuo - Edicion de Viajes Programados', () => {
	test('[TS-STRIPE-P2-TC078] @regression @hold alta + edicion hold+cobro', async ({ page }) => {
		const management = new TravelManagementPage(page);
		const detail = new TravelDetailPage(page);
		const threeDS = new ThreeDSModal(page);
		const popup = new ThreeDSErrorPopup(page);

		await test.step('Login carrier', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('Abrir viajes programados y entrar al detalle', async () => {
			await management.goto();
			await management.openScheduledTrips();
			await management.openFirstScheduledTripDetail();
			await expect(page).toHaveURL(/\/home\/carrier\/travel\/detail\?travelId=\d+&mode=3/, { timeout: 15_000 });
		});

		await test.step('Vincular primera tarjeta y aprobar 3DS', async () => {
			await detail.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
			await detail.fillPreauthorizedCard(STRIPE_TEST_CARDS.threeDSRequired);
			await detail.clickValidateCard();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		});

		await test.step('Vincular segunda tarjeta y rechazar 3DS', async () => {
			await detail.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
			await detail.fillPreauthorizedCard(STRIPE_TEST_CARDS.alwaysAuthenticate);
			await detail.clickValidateCard();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
			await popup.waitForVisible();

			const message = await popup.getMessage();
			expect(message ?? '').toMatch(/autentic|authenticate|unable to authenticate/i);
			await popup.accept();
		});

		await test.step('Vincular tarjeta de debito y guardar', async () => {
			await detail.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
			await detail.fillPreauthorizedCard(STRIPE_TEST_CARDS.mastercardDebit);
			await detail.clickValidateCard();
			await expectNoThreeDSModal(page);

			await detail.selectLinkedCard(/Tarjeta de cr[eé]dito MASTERCARD/i);
			await detail.clickRecalculate();
			await detail.clickSave();
		});

		await expect(page).toHaveURL(/\/home\/carrier\/travel\/detail\?travelId=\d+&mode=3/, { timeout: 15_000 });
	});

	test.describe('Sin 3DS', () => {
		test('[TS-STRIPE-P2-TC079] @regression sin hold alta + edicion', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC080] @regression @hold alta + edicion hold+cobro variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC081] @regression sin hold alta + edicion variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
	});

	test.describe('Con 3DS', () => {
		test('[TS-STRIPE-P2-TC082] @regression @3ds @hold clonacion finalizado hold+cobro 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC083] @regression @3ds sin hold clonacion finalizado 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
	});
});
