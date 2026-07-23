/**
 * TC: MG-155 (área D — abandono/timeout 3DS) · AC6
 * Feature: Carrier · App Pax · Hold ON · ABANDONO del challenge 3DS — no debe dejar hold huérfano
 * Tags: @web @3ds @hold
 *
 * VERIFICA AC6: si el usuario ABANDONA el challenge 3DS (cierra/sale del modal sin pulsar
 * COMPLETE ni FAIL), el viaje NO debe quedar con un hold huérfano ni saltar a "Buscando conductor";
 * debe quedar en NO_AUTORIZADO RECUPERABLE (red flag "Validación 3DS pendiente" + botón "Reintentar"
 * visibles) y el reintento posterior debe recuperar el viaje.
 *
 * ⚠ ESTE TEST ESTÁ DISEÑADO PARA DAR ROJO hasta confirmar la recuperabilidad del abandono. El
 *   abandono deja el challenge sin resolver del lado del PSP: si el backend crea el hold igual y
 *   NO deja el viaje recuperable (queda en estado indefinido, hold huérfano, o salta a "Buscando
 *   conductor"), los asserts fallan — y ese rojo ES la evidencia del gap AC6. Distinto de
 *   `3ds-failure.spec.ts` (que resuelve el challenge con FAIL, camino ya validado como recuperable).
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); los POMs del sustrato carrier
 *     se consumen vía sus componentes @ui/carrier (extends UiBase) y el modal 3DS vía
 *     @ui/ThreeDsChallengePage (mini-flujo `abandonChallenge` — @atc MG-155).
 *   - El setup replica el flujo de `RecoverySteps.setupFailedThreeDs` PERO abandonando el challenge
 *     (`abandonChallenge`) en vez de rechazarlo (`completeFail`), por lo que se inlinea aquí en vez
 *     de reusar el Step (que fija `completeFail`).
 */

import { test, expect } from '@TestFixture';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierOperationalPreferencesPage,
	CarrierTravelDetailPage,
} from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.describe.configure({ mode: 'serial' });

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · App Pax — Abandono del challenge 3DS (AC6) @gateway @stripe @web @3ds @hold', { annotation: [{ type: 'tms', description: 'MG-155' }] }, () => {

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[MG-155] Hold ON + 3DS recuperable (4000 0000 0000 3220) — challenge ABANDONADO → NO_AUTORIZADO recuperable (sin hold huérfano) → reintento recupera', () => {
		test('al abandonar el challenge 3DS el viaje queda NO_AUTORIZADO recuperable y el reintento lo recupera', async ({ page }) => {
			const dashboard = new CarrierDashboardPage({ page });
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });
			const detail = new CarrierTravelDetailPage({ page });

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Crear viaje con tarjeta 3DS recuperable (4000 0000 0000 3220)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.threeDSRequired.slice(-4), // 4000000000003220 (3DS requerido, recuperable)
				});
				await travel.submit();
			});

			await test.step('ABANDONAR el challenge 3DS (Popup A Stripe) sin COMPLETE ni FAIL', async () => {
				await threeDS.waitForVisible();
				await threeDS.abandonChallenge();
			});

			await test.step('Validar viaje NO_AUTORIZADO RECUPERABLE — red flag + reintento visibles, NO "Buscando conductor"', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				await expect(detail.statusBadge()).not.toContainText('Buscando conductor', { timeout: 10_000 });
				await detail.expectRedFlagVisible();
				await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
			});

			await test.step('Reintentar 3DS desde el detalle + completar el challenge → viaje recuperado ("Buscando conductor")', async () => {
				await detail.clickRetry();
				await threeDS.waitForVisible();
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
				await detail.expectStatus('Buscando conductor');
			});
		});
	});
});
