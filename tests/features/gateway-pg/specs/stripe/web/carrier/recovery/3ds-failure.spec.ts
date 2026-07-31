/**
 * TCs: TS-STRIPE-TC1057, TS-STRIPE-TC1051, TS-STRIPE-TC1061
 * Feature: Carrier · App Pax · Hold ON · Fallo 3DS — estado NO_AUTORIZADO, red flag y reintento
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1057 – Hold ON + fail3DS (4000 0000 0000 9235): challenge 3DS emerge → test rechaza con FAIL
 *          → viaje creado en "En conflicto" con NO_AUTORIZADO; no emerge pop-up adicional de MAGIIS
 * TC1051 – mismo flujo: red flag "Validación 3DS pendiente" + botón "Reintentar" en detalle + estado "No autorizado"
 * TC1061 – fallo inicial + reintento exitoso desde detalle: viaje pasa a "Buscando conductor", red flag y botón desaparecen
 *
 * Regla de negocio card 9235 + Hold ON: Popup A (Stripe challenge) SÍ aparece → completeFail().
 * Tras el rechazo, el viaje se crea en NO_AUTORIZADO → "En conflicto".
 * Popup B (MAGIIS error) NO aparece en este escenario.
 */

import { test, expect } from '../../../../../../../TestBase';
import {
	loginAsDispatcher,
	setupTravelWithFailed3DS,
	TEST_DATA,
	STRIPE_TEST_CARDS
} from '../../../../../fixtures/gateway.fixtures';
import {
	DashboardPage,
	NewTravelPage,
	OperationalPreferencesPage,
	ThreeDSModal,
	TravelDetailPage,
	TravelManagementPage
} from '../../../../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · App Pax — Fallo 3DS, red flag y reintento @gateway @stripe @hold @3ds @decline @regression', () => {
	test.use({ role: 'carrier', storageState: undefined });

	// PRODUCT-GAP (MG-178, gap #7): en el FE (branch release/v1.72.x) travel-detail NO implementa
	// el red flag "Validación 3DS pendiente", el botón "Reintentar autenticación" ni el
	// `payment-method.component` (confirmado en `magiis-fe/src/app/carrier/travel/travel-detail/`;
	// grep sin coincidencias de red-flag/retry/3ds/challenge). Estas aserciones apuntan a UI que no
	// existe en producto → no es fallo de automatización. Se deja fixme hasta que se implemente
	// (revalidar contra el tag desplegado v1.72.8).
	test.beforeEach(async ({ page }) => {
		test.fixme(
			true,
			'PRODUCT-GAP: travel-detail sin red-flag/Reintentar 3DS ni payment-method.component (FE v1.72.x). Ver MG-178 gap #7.'
		);
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1057] Hold ON + fail3DS (4000 0000 0000 9235) — challenge rechazado → NO_AUTORIZADO en "En conflicto" (sin pop-up MAGIIS post-fallo)', () => {
		test('tras rechazar challenge 3DS el viaje queda en NO_AUTORIZADO y fuera de "Por asignar"', async ({
			page
		}) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const threeDS = new ThreeDSModal(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Crear viaje con tarjeta fail3DS (4000 0000 0000 9235)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					// FIX 2026-07-21: usar tarjeta 3DS que MUESTRA el challenge (3155) + completeFail() abajo.
					// `fail3DS` (9235) es un DECLINE genérico SIN 3DS → nunca aparece el challenge
					// (verificado en vivo: 0 llamadas 3DS con 9235). El "fallo 3DS" se logra rechazando el challenge.
					cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4) // 3155 (challenge-showing)
				});
				await travel.submit();
			});

			await test.step('Rechazar challenge 3DS (Popup A Stripe/Visa) — no se espera Popup B de MAGIIS', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeFail();
				await threeDS.waitForHidden();
			});

			await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const statusBadge = detail.statusBadge();
				await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
				await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
			});

			await test.step('Validar gestión — viaje no aparece en columna "Por asignar"', async () => {
				await management.goto();
				await expect
					.soft(management.porAsignarColumn())
					.not.toContainText(TEST_DATA.appPaxPassenger, { timeout: 10_000 });
			});
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

		test('estado del viaje es "No autorizado" — no aparece "Buscando conductor" mientras 3DS está pendiente', async ({
			page
		}) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectStatus('No autorizado');
			await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
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
