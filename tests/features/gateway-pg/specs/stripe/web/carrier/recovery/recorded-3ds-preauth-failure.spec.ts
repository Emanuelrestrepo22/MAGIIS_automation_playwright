/**
 * TCs: TS-STRIPE-TC1039
 * Feature: Carrier · Cliente Contractor + Pasajero App Pax invitado · Hold ON · Fallo 3DS — pop-up de error, viaje no se crea
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1039 – Hold ON + cliente contractor + pasajero app pax invitado + tarjeta threeDSRequired + fallo autenticación:
 *          pop-up de error visible, URL permanece en formulario de alta sin crear viaje
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); sustrato carrier vía componentes
 *     @ui/carrier (granulares selectClient/selectGuestPassenger/setOrigin/setDestination/selectCardByLast4),
 *     modal 3DS vía @ui/ThreeDsChallengePage y el popup de error vía @ui/ThreeDsErrorPopup.
 *   @atc idmap (mapeo por área): fallo 3DS + pop-up de error (pre-autorización) → área D (MG-157).
 */
import { test, expect } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage, CarrierOperationalPreferencesPage } from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { ThreeDsErrorPopup } from '@ui/ThreeDsErrorPopup';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';
import { ensureRecoverableCardIdempotence } from '@features/gateway-pg/helpers/stripe/recovery.helpers';

test.use({ storageState: undefined });

test.describe(
	'[TS-STRIPE-TC1039] Hold ON + cliente contractor + pasajero app pax invitado + threeDSRequired + fallo 3DS — pop-up de error, URL permanece en formulario @gateway @stripe @hold @3ds @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-157' }] },
	() => {
		test('muestra pop-up de error de autenticación 3DS y no crea el viaje cuando la autenticación falla', async ({
			page
		}) => {
			test.setTimeout(90_000);

			const dashboard = new CarrierDashboardPage({ page });
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });
			const popup = new ThreeDsErrorPopup({ page });

			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
			});

			await test.step('Precondición: limpiar 3220 previa del pax (idempotencia BL-050)', async () => {
				// La 3220 queda vinculada al wallet en cada corrida (attach al completar los iframes);
				// BL-050 bloquea "Validar" si el mismo número ya está vinculado — limpieza silent-fail.
				await ensureRecoverableCardIdempotence(page, {
					passenger: TEST_DATA.appPaxPassenger,
					apiSearchQuery: PASSENGERS.appPax.apiSearchQuery
				});
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
	}
);
