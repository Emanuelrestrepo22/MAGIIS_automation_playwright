/**
 * TCs: TS-STRIPE-TC1057, TS-STRIPE-TC1051, TS-STRIPE-TC1061
 * Feature: Carrier · App Pax · Hold ON · Fallo 3DS — estado NO_AUTORIZADO, red flag y reintento
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1057 – Hold ON + fail3DS (4000 0000 0000 9235): sin challenge 3DS → viaje en "En conflicto" con NO_AUTORIZADO
 * TC1051 – mismo flujo: red flag "Validación 3DS pendiente" + botón "Reintentar" en detalle + estado "No autorizado"
 * TC1061 – fallo inicial + reintento exitoso desde detalle: viaje pasa a "Buscando conductor", red flag y botón desaparecen
 *
 * Comportamiento confirmado en TEST: card 9235 (fail3DS) no muestra challenge frame.
 * Backend procesa el fallo 3DS silenciosamente; viaje creado con NO_AUTORIZADO → "En conflicto".
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, setupTravelWithFailed3DS, TEST_DATA, STRIPE_TEST_CARDS } from '../../fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../helpers/stripe.helpers';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../helpers/travel-cleanup';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelDetailPage, TravelManagementPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · App Pax — Fallo 3DS, pop-up, detalle y reintento', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1057] Hold ON + fail3DS (4000 0000 0000 9235) — viaje en "En conflicto" con NO_AUTORIZADO', () => {
		test('viaje con fallo 3DS aparece en "En conflicto" con NO_AUTORIZADO y ausente en "Por asignar"', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
			let travelIdRef: TravelIdRef | null = null;

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			try {
				travelIdRef = await captureCreatedTravelId(page);

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step('Crear viaje con tarjeta fail3DS (4000 0000 0000 9235) — sin challenge 3DS', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.appPaxPassenger,
						passenger: TEST_DATA.appPaxPassenger,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4),
					});
					await travel.submit();
					await waitForTravelCreation(page);
				});

				await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
					if (travelIdRef?.travelId) {
						await detail.goto(String(travelIdRef.travelId));
						const statusBadge = detail.statusBadge();
						await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
						await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
					}
				});

				await test.step('Validar gestión — viaje en "En conflicto" con NO_AUTORIZADO', async () => {
					await management.goto();
					await management.expectPassengerInEnConflicto(TEST_DATA.appPaxPassenger);
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});
	});

	test.describe('[TS-STRIPE-TC1051] Hold ON + fail3DS (4000 0000 0000 9235) — red flag "Validación 3DS pendiente" y botón "Reintentar" visibles en detalle, estado "No autorizado"', () => {
		test('muestra red flag "Validacion 3DS pendiente" en la sección de forma de pago', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectRedFlagVisible();
		});

		test('muestra botón "Reintentar autenticación" junto al red flag', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
		});

		test('estado del viaje es "No autorizado" — no aparece "Buscando conductor" mientras 3DS está pendiente', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectStatus('No autorizado');
			await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
		});
	});

	test.describe('Hold ON + 3DS obligatorio + pago rechazado post-autenticación (card_declined) — tarjeta 4000 0084 0000 1629 [requiere TC-ID en matriz]', () => {
		test('viaje con 3DS completado pero cargo rechazado (card_declined) aparece en "En conflicto" con NO_AUTORIZADO', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const threeDS = new ThreeDSModal(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);
			let travelIdRef: TravelIdRef | null = null;

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			try {
				travelIdRef = await captureCreatedTravelId(page);

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step('Crear viaje con tarjeta 1629 (3DS obligatorio + card_declined post-auth)', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.appPaxPassenger,
						passenger: TEST_DATA.appPaxPassenger,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.declinedAfter3DS.slice(-4),
					});
					await travel.submit();
				});

				await test.step('Completar challenge 3DS (Radar lo exige; autenticación exitosa)', async () => {
					// Radar solicita 3DS obligatoriamente para esta tarjeta.
					// La autenticación completa con éxito; el rechazo card_declined ocurre después.
					await threeDS.waitForVisible();
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				});

				await test.step('Esperar resultado post-autenticación — cargo rechazado (card_declined)', async () => {
					await waitForTravelCreation(page);
				});

				await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
					if (travelIdRef?.travelId) {
						await detail.goto(String(travelIdRef.travelId));
						const statusBadge = detail.statusBadge();
						await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
						await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
					}
				});

				await test.step('Validar gestión — viaje en "En conflicto" con NO_AUTORIZADO', async () => {
					await management.goto();
					await management.expectPassengerInEnConflicto(TEST_DATA.appPaxPassenger);
				});
			} finally {
				if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
			}
		});
	});

	test.describe('[TS-STRIPE-TC1061] Hold ON + fallo 3DS inicial + reintento exitoso desde detalle — viaje pasa a "Buscando conductor", red flag y botón "Reintentar" desaparecen', () => {
		test('al reintentar exitosamente el viaje pasa a "Buscando conductor"', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectStatus('Buscando conductor');
		});

		test('el red flag desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectRedFlagHidden();
		});

		test('el botón "Reintentar" desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await expect(detail.retryButton()).toBeHidden({ timeout: 10_000 });
		});
	});
});
