/**
 * TCs: TS-STRIPE-TC1053
 * Feature: Carrier · App Pax · Hold ON · Alta de viaje con tarjeta success3DS (4000 0025 0000 3155) — modal 3DS aprobado, viaje activo
 * Tags: @smoke @3ds @hold @web-only
 *
 * Observaciones del flujo real (entorno TEST):
 *   - El portal puede tener sesión activa → login explícito + ensureDashboardLoaded validan el shell
 *   - El formulario pre-carga dirección "home" del pasajero como origen → setOrigin() la limpia con X
 *   - DOS ventanas de challenge posibles (2026-08-07): la validación ("Validar" = hold real) dispara
 *     la primera; el envío puede disparar una segunda (post-envío) — ambas se aprueban en el happy path
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); login vía loginAsDispatcher(page)
 *     (el fixture KATA no expone `credentials`/`role`); sustrato carrier vía componentes @ui/carrier
 *     y modal 3DS vía @ui/ThreeDsChallengePage.
 *   @atc idmap (mapeo por área): challenge 3DS success → área D (MG-152); hold → área E (MG-158).
 */

import { test, expect } from '@TestFixture';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierOperationalPreferencesPage,
	CarrierTravelManagementPage
} from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';
import {
	captureCreatedTravelId,
	cancelTravelIfCreated,
	type TravelIdRef
} from '@features/gateway-pg/helpers/travel-cleanup';
import { ensureRecoverableCardIdempotence } from '@features/gateway-pg/helpers/stripe/recovery.helpers';

test.use({ storageState: undefined });

test.describe(
	'[TS-STRIPE-TC1053] Hold ON + success3DS (4000 0025 0000 3155) — modal 3DS se presenta, pasajero aprueba, viaje pasa a "Buscando conductor" @gateway @stripe @hold @3ds @critical',
	{ annotation: [{ type: 'tms', description: 'MG-158' }] },
	() => {
		test('crear viaje con tarjeta 3DS, aprobar autenticación y validar viaje activo', async ({ page }) => {
			test.setTimeout(90_000);

			const dashboardPage = new CarrierDashboardPage({ page });
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const travelPage = new CarrierNewTravelPage({ page });
			const management = new CarrierTravelManagementPage({ page });
			let travelIdRef: TravelIdRef | null = null;

			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
				await dashboardPage.ensureDashboardLoaded();
			});

			await test.step('Precondición: limpiar 3184 previa del pax (idempotencia BL-050)', async () => {
				// La 3184 queda vinculada al wallet en cada corrida (attach al completar los iframes);
				// BL-050 bloquea "Validar" si el mismo número ya está vinculado — limpieza silent-fail.
				await ensureRecoverableCardIdempotence(page, {
					passenger: TEST_DATA.passenger,
					apiSearchQuery: PASSENGERS.appPax.apiSearchQuery,
					cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4)
				});
			});

			await test.step('Validar hold activo en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			try {
				travelIdRef = await captureCreatedTravelId(page);

				await test.step('Abrir formulario de nuevo viaje', async () => {
					await dashboardPage.openNewTravel();
					await travelPage.ensureLoaded();
				});

				await test.step('Completar formulario con pasajero app pax y tarjeta success3DS (4000 0025 0000 3155)', async () => {
					await travelPage.fillMinimum({
						passenger: TEST_DATA.passenger,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4) // 4000002760003184 (always 3DS)
					});
				});

				await test.step('Enviar viaje — sistema ejecuta hold Stripe y presenta modal 3DS', async () => {
					await travelPage.submit();
				});

				await test.step('Aprobar autenticación en modal 3DS de Stripe', async () => {
					const threeDS = new ThreeDsChallengePage({ page });
					await threeDS.waitForVisible();
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				});

				await test.step('Seleccionar vehículo y enviar el servicio', async () => {
					await travelPage.clickSelectVehicle();
					await travelPage.clickSendService();
				});

				// DOS VENTANAS de challenge (adaptación 2026-08-07, alineada al helper de recovery):
				// con el hold ejecutándose en la VALIDACIÓN, el envío puede disparar un SEGUNDO
				// challenge (post-envío). En el happy path también se aprueba; si no aparece, la
				// espera opcional (acotada, sin ventana ciega) deja seguir el flujo original.
				await test.step('Aprobar challenge 3DS post-envío (ventana 2, si aparece)', async () => {
					const threeDS = new ThreeDsChallengePage({ page });
					const postSubmitChallenge = await threeDS.waitForOptionalVisible(8_000);
					if (postSubmitChallenge) {
						await threeDS.completeSuccess();
						await threeDS.waitForHidden();
					}
				});

				await test.step('Validar redirección al formulario de nuevo viaje — flujo completado', async () => {
					await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
				});

				// Fuente de verdad del alta: POST /travels interceptado (la redirección al formulario
				// NO prueba que el viaje se creó — mismo criterio que apppax-hold-3ds.spec.ts).
				await test.step('Confirmar creación del viaje via network interception', async () => {
					await expect
						.poll(() => travelIdRef?.travelId, {
							timeout: 15_000,
							message: '[TC1053] POST /travels no capturó travelId tras el submit'
						})
						.not.toBeNull();
				});

				// Aserción de negocio que el título del TC promete: el viaje queda ACTIVO en gestión.
				// Antes este spec cerraba solo con toHaveURL (navegación), sin verificar el estado real.
				await test.step('Validar viaje activo en gestión — "Buscando conductor"', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(
						TEST_DATA.passenger,
						undefined,
						/Buscando (conductor|chofer)/i
					);
				});
			} finally {
				if (travelIdRef) {
					await test.step('Cleanup: cancelar viaje creado', async () => {
						await cancelTravelIfCreated(page, travelIdRef!);
					});
				}
			}
		});
	}
);
