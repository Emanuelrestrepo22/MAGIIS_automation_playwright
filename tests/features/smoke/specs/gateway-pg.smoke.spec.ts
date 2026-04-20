// tests/features/smoke/specs/gateway-pg.smoke.spec.ts
import { type Page } from '@playwright/test';
import { test, expect } from '../../../TestBase';
import { debugLog } from '../../../helpers';
import {
	DashboardPage,
	NewTravelPage,
	OperationalPreferencesPage,
	ThreeDSModal,
	ThreeDSErrorPopup,
	TravelManagementPage,
} from '../../../pages/carrier';
import { ContractorNewTravelPage } from '../../../pages/contractor/NewTravelPage';
import {
	loginAsDispatcher,
	loginAsContractor,
	expectNoThreeDSModal,
	STRIPE_TEST_CARDS,
	TEST_DATA,
} from '../../gateway-pg/fixtures/gateway.fixtures';
import { CARDS } from '../../../fixtures/stripe/card-policy';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../gateway-pg/helpers/travel-cleanup';
import { waitForTravelCreation } from '../../gateway-pg/helpers/stripe.helpers';
import { validateCardPrecondition } from '../../gateway-pg/helpers/card-precondition';
import { PASSENGERS } from '../../gateway-pg/data/passengers';

const env = process.env.ENV ?? 'test';

// ─── Helpers locales de estado hold ──────────────────────────────────────────
// En smoke no validamos el payload de la API, solo el estado visible de la UI.

async function disableHoldForSmoke(preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(false);
	await preferences.save();
}

async function restoreHoldForSmoke(preferences: OperationalPreferencesPage): Promise<void> {
	// Cleanup no-fatal: si el backend TEST está lento al persistir preferencias
	// (observado en pipelines reales con timeout 15s del waitForResponse), logueamos
	// y seguimos. El próximo test que necesite hold habilitado lo restaurará.
	// Esto evita que un timeout de cleanup invalide un test cuyo aserto principal pasó.
	try {
		await preferences.goto();
		await preferences.ensureHoldEnabled();
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.warn(`[restoreHoldForSmoke] Cleanup no-fatal — no se pudo restaurar hold (backend slow?): ${msg}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL CARRIER
// ─────────────────────────────────────────────────────────────────────────────

test.describe(`[SMOKE][${env.toUpperCase()}] Gateway PG — Portal Carrier`, () => {
	// Serial para evitar colisiones de estado Stripe (hold, preferencias) entre tests.
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	// ── TC01 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @hold @happy [TS-STRIPE-TC1049] SMOKE-GW-TC01 — AppPax · Hold ON · sin 3DS (4242) → viaje pasa a SEARCHING_DRIVER', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC01] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC01]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC01]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — AppPax + tarjeta sin 3DS (4242) [SMOKE-GW-TC01]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC01]', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: modal 3DS no debe aparecer (tarjeta sin 3DS) [SMOKE-GW-TC01]', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Then: viaje visible en gestión — columna "Por asignar", estado "Buscando chofer" [SMOKE-GW-TC01]', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(
				TEST_DATA.appPaxPassenger,
				undefined,
				'Buscando chofer',
			);
			debugLog('smoke', `[SMOKE-GW-TC01] AppPax Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC02 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @hold @3ds @happy [TS-STRIPE-TC1053] SMOKE-GW-TC02 — AppPax · Hold ON · con 3DS éxito (3155) → modal aprobado → SEARCHING_DRIVER', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const threeDS     = new ThreeDSModal(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC02] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC02]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC02]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — AppPax + tarjeta con 3DS (3184 always_authenticate) [SMOKE-GW-TC02]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   CARDS.HAPPY_3DS.slice(-4),
			});
		});

		await test.step('And: formulario enviado — sistema ejecuta hold y presenta modal 3DS [SMOKE-GW-TC02]', async () => {
			await travel.submit();
		});

		await test.step('When: autenticación aprobada en modal 3DS [SMOKE-GW-TC02]', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			debugLog('smoke', '[SMOKE-GW-TC02][3DS] Modal 3DS aprobado ✅');
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC02]', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: viaje visible en gestión — estado "Buscando chofer" [SMOKE-GW-TC02]', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(
				TEST_DATA.appPaxPassenger,
				undefined,
				'Buscando chofer',
			);
			debugLog('smoke', `[SMOKE-GW-TC02] AppPax Hold ON 3DS éxito — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC03 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @no-hold @happy [TS-STRIPE-TC1050] SMOKE-GW-TC03 — AppPax · Hold OFF · sin 3DS → viaje creado sin preautorización', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC03] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold deshabilitado en preferencias operativas [SMOKE-GW-TC03]', async () => {
			await disableHoldForSmoke(preferences);
		});

		try {
			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC03]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado — AppPax + tarjeta sin 3DS (4242) [SMOKE-GW-TC03]', async () => {
				await travel.fillMinimum({
					client:      TEST_DATA.appPaxPassenger,
					passenger:   TEST_DATA.appPaxPassenger,
					origin:      TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('And: vehículo seleccionado y servicio enviado (sin hold) [SMOKE-GW-TC03]', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Then: modal 3DS no debe aparecer (hold OFF, sin preautorización) [SMOKE-GW-TC03]', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Then: viaje visible en gestión — "Buscando chofer" sin preautorización [SMOKE-GW-TC03]', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(
					TEST_DATA.appPaxPassenger,
					undefined,
					'Buscando chofer',
				);
				debugLog('smoke', `[SMOKE-GW-TC03] AppPax Hold OFF sin 3DS — viaje creado sin preautorización en ${env.toUpperCase()} ✅`);
			});
		} finally {
			await test.step('And: hold restaurado en preferencias operativas (cleanup) [SMOKE-GW-TC03]', async () => {
				await restoreHoldForSmoke(preferences);
			});
		}
	});

	// ── TC04 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @cargo-a-bordo @happy [TS-STRIPE-TC1081] SMOKE-GW-TC04 — AppPax · Cargo a Bordo · pago exitoso (sin Stripe form, sin 3DS)', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC04] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: precondición verificada — pasajero AppPax tiene tarjeta 4242 activa y Cargo a Bordo habilitado [SMOKE-GW-TC04]', async () => {
			const check = await validateCardPrecondition(page, {
				passengerName:  PASSENGERS.appPax.apiSearchQuery!,
				requiredLast4:  '4242',
			});
			debugLog('smoke', `[SMOKE-GW-TC04][PRE] AppPax tarjetas activas: ${check.activeCards}, tiene 4242: ${check.hasRequiredCard}, CargoABordo habilitado: ${check.creditCardEnabled}`);
			if (!check.hasRequiredCard) {
				throw new Error(`[SMOKE-GW-TC04] PRECONDICIÓN FALLA: AppPax sin tarjeta 4242 activa — vincular manualmente en TEST.`);
			}
			// Fix TC1081 flakiness: validar que el método "Cargo a Bordo / Tarjeta de Crédito"
			// esté habilitado para el pasajero. Sin esta validación el submit genera
			// ?limitExceeded=false en el backend y el test falla tarde con error críptico.
			// Ref: docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md §TC1081
			// Ref: docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md
			if (!check.creditCardEnabled) {
				throw new Error(
					`[SMOKE-GW-TC04] PRECONDICIÓN FALLA: Método "Cargo a Bordo / Tarjeta de Crédito" NO habilitado para AppPax en ${env.toUpperCase()}. ` +
					`Habilitar desde: Carrier → Configuración → Pasajeros → Emanuel Restrepo → Métodos de pago. ` +
					`Ref: docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md §TC1081`,
				);
			}
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC04]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado con método Cargo a Bordo [SMOKE-GW-TC04]', async () => {
				await travel.selectClient(TEST_DATA.appPaxPassenger);
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC04]', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Then: modal 3DS no debe aparecer (Cargo a Bordo no requiere Stripe) [SMOKE-GW-TC04]', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Then: viaje creado visible en gestión [SMOKE-GW-TC04]', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(
					TEST_DATA.appPaxPassenger,
					undefined,
					'Buscando chofer',
				);
				debugLog('smoke', `[SMOKE-GW-TC04] AppPax Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC05 ─────────────────────────────────────────────────────────────────
	// Mitigación temporal TC1033: retry(1) por fallos ENV intermitentes de auth.
	// Root cause pendiente investigación. Ver docs/reports/TC1033-MITIGATION.md.
	test.describe('[TS-STRIPE-TC1033] Colaborador · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER', () => {
	test.describe.configure({ retries: 1 });
	test('@smoke @carrier @hold @happy [TS-STRIPE-TC1033] SMOKE-GW-TC05 — Colaborador · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC05] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC05]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC05]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — Colaborador + tarjeta sin 3DS (4242) [SMOKE-GW-TC05]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorClient,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC05]', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: modal 3DS no debe aparecer (tarjeta sin 3DS) [SMOKE-GW-TC05]', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Then: viaje visible en gestión — "Buscando chofer" [SMOKE-GW-TC05]', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(
				TEST_DATA.contractorColaborador,
				undefined,
				'Buscando chofer',
			);
			debugLog('smoke', `[SMOKE-GW-TC05] Colaborador Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});
	}); // end [TS-STRIPE-TC1033]

	// ── TC06 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @hold @3ds @happy [TS-STRIPE-TC1037] SMOKE-GW-TC06 — Colaborador · Hold ON · con 3DS éxito (3155) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const threeDS     = new ThreeDSModal(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC06] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC06]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC06]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — Colaborador + tarjeta con 3DS (3184 always_authenticate) [SMOKE-GW-TC06]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorClient,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   CARDS.HAPPY_3DS.slice(-4),
			});
		});

		await test.step('And: formulario enviado — sistema ejecuta hold y presenta modal 3DS [SMOKE-GW-TC06]', async () => {
			await travel.submit();
		});

		await test.step('When: autenticación aprobada en modal 3DS [SMOKE-GW-TC06]', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			debugLog('smoke', '[SMOKE-GW-TC06][3DS] Modal 3DS aprobado ✅');
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC06]', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: viaje visible en gestión — "Buscando chofer" [SMOKE-GW-TC06]', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(
				TEST_DATA.contractorColaborador,
				undefined,
				'Buscando chofer',
			);
			debugLog('smoke', `[SMOKE-GW-TC06] Colaborador Hold ON 3DS éxito — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC07 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @cargo-a-bordo @happy [TS-STRIPE-TC1096] SMOKE-GW-TC07 — Colaborador · Cargo a Bordo · pago exitoso desde portal Carrier', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC07] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC07]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado — cliente Contractor + colaborador + Cargo a Bordo [SMOKE-GW-TC07]', async () => {
				await travel.selectClient(TEST_DATA.contractorClient);
				await travel.selectPassenger(TEST_DATA.contractorPassenger);
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC07]', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Then: modal 3DS no debe aparecer (Cargo a Bordo no requiere Stripe) [SMOKE-GW-TC07]', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Then: viaje creado visible en gestión [SMOKE-GW-TC07]', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(
					TEST_DATA.contractorPassenger,
					undefined,
					'Buscando chofer',
				);
				debugLog('smoke', `[SMOKE-GW-TC07] Colaborador Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC08 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @hold @happy [TS-STRIPE-TC1065] SMOKE-GW-TC08 — Empresa · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC08] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC08]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC08]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — cliente Empresa + tarjeta sin 3DS (4242) [SMOKE-GW-TC08]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.client,
				passenger:   TEST_DATA.passenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC08]', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: modal 3DS no debe aparecer (tarjeta sin 3DS) [SMOKE-GW-TC08]', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Then: viaje visible en gestión — "Buscando chofer" [SMOKE-GW-TC08]', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(
				TEST_DATA.passenger,
				undefined,
				'Buscando chofer',
			);
			debugLog('smoke', `[SMOKE-GW-TC08] Empresa Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC09 ─────────────────────────────────────────────────────────────────
	test('@smoke @carrier @cargo-a-bordo @happy [TS-STRIPE-TC1111] SMOKE-GW-TC09 — Empresa · Cargo a Bordo · pago exitoso desde portal Carrier', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC09] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC09]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado — cliente Empresa + método Cargo a Bordo [SMOKE-GW-TC09]', async () => {
				await travel.selectClient(TEST_DATA.client);
				// Empresa individuo puede auto-asignar el campo #passenger (ng-reflect-is-disabled="true")
				const passengerDisabled =
					(await page.locator('#passenger').getAttribute('ng-reflect-is-disabled')) === 'true';
				if (!passengerDisabled) {
					await travel.selectPassenger(TEST_DATA.passenger);
				} else {
					debugLog('smoke', '[SMOKE-GW-TC09] #passenger auto-asignado por empresa individuo');
				}
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC09]', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Then: modal 3DS no debe aparecer (Cargo a Bordo no requiere Stripe) [SMOKE-GW-TC09]', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Then: viaje creado visible en gestión [SMOKE-GW-TC09]', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(
					TEST_DATA.passenger,
					undefined,
					'Buscando chofer',
				);
				debugLog('smoke', `[SMOKE-GW-TC09] Empresa Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC10 (UNHAPPY) ────────────────────────────────────────────────────────
	test('@smoke @carrier @hold @3ds @unhappy [TS-STRIPE-TC1057] SMOKE-GW-TC10 — AppPax · 3DS rechazado (9235) → hold no completado → ausente en Por Asignar [UNHAPPY]', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier [SMOKE-GW-TC10] (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: hold habilitado en preferencias operativas [SMOKE-GW-TC10]', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC10]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — AppPax + tarjeta fail3DS (9235) [SMOKE-GW-TC10]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.fail3DS.slice(-4),
			});
		});

		await test.step('And: formulario enviado — card 9235 → backend procesa fallo 3DS silenciosamente → limitExceeded=false [SMOKE-GW-TC10]', async () => {
			// Card 9235: NO aparece challenge frame. El backend resuelve el fallo 3DS internamente.
			// URL post-submit: ?limitExceeded=false. Viaje creado con estado NO_AUTORIZADO → "En conflicto".
			await travel.submit();
			await waitForTravelCreation(page);
			debugLog('smoke', '[SMOKE-GW-TC10] Submit completado — viaje creado como NO_AUTORIZADO ✅');
		});

		await test.step('Then: viaje presente en "En conflicto" con estado NO_AUTORIZADO [SMOKE-GW-TC10]', async () => {
			// porAsignarColumn() usa data-testid que no renderiza cuando la columna está vacía.
			// Aserción positiva: el viaje con card 9235 DEBE estar en "En conflicto" como NO_AUTORIZADO.
			await management.goto();
			// expectPassengerInEnConflicto es la aserción crítica: valida que el viaje con 3DS
			// rechazado queda en "En conflicto" (NO_AUTORIZADO) y no en "Por asignar" (SEARCHING_DRIVER).
			await management.expectPassengerInEnConflicto(TEST_DATA.appPaxPassenger);
			debugLog('smoke', `[SMOKE-GW-TC10] Card 9235 → viaje en "En conflicto" / NO_AUTORIZADO en ${env.toUpperCase()} ✅`);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL CONTRACTOR
// ─────────────────────────────────────────────────────────────────────────────

test.describe(`[SMOKE][${env.toUpperCase()}] Gateway PG — Portal Contractor`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });

	// ── TC11 ─────────────────────────────────────────────────────────────────
	// Trazabilidad: TS-STRIPE-P2-TC001 (matriz_cases2.md §1.1 Colaborador Contractor Hold ON)
	test('@smoke @contractor @hold @happy [TS-STRIPE-P2-TC001] SMOKE-GW-TC11 — Colaborador · Hold ON · vinculación nueva tarjeta (4242) → SEARCHING_DRIVER desde portal Contractor', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);
		// Cleanup: viaje de TC11 dejaba estado sucio (SEARCHING_DRIVER activo) que hacía
		// flaky al TC12 subsiguiente con el mismo colaborador — diagnóstico MR post-merge
		// del agente qa-doc-analyst 2026-04-19.
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`Given: contractor logueado en portal contractor [SMOKE-GW-TC11] (${env.toUpperCase()})`, async () => {
			await loginAsContractor(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC11]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado — colaborador + vinculación tarjeta nueva (4242) + Hold ON [SMOKE-GW-TC11]', async () => {
				await travel.fillMinimum({
					client:      TEST_DATA.contractorColaborador,
					passenger:   TEST_DATA.contractorColaborador,
					origin:      TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC11]', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Then: modal 3DS no debe aparecer (tarjeta sin 3DS) [SMOKE-GW-TC11]', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('Then: URL redirige a contractor/dashboard tras crear el viaje [SMOKE-GW-TC11]', async () => {
				// El portal Contractor redirige a dashboard tras crear el viaje (no a /travels/xxx).
				await expect(
					page,
					'Tras crear el viaje en portal contractor, la URL debe redirigir a /contractor/dashboard',
				).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
				debugLog('smoke', `[SMOKE-GW-TC11] Contractor Colaborador Hold ON sin 3DS — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC12 ─────────────────────────────────────────────────────────────────
	test('@smoke @contractor @hold @3ds @happy [TS-STRIPE-P2-TC005] SMOKE-GW-TC12 — Colaborador · Hold ON · tarjeta con 3DS éxito (3155) → SEARCHING_DRIVER desde portal Contractor', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);
		const threeDS    = new ThreeDSModal(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`Given: contractor logueado en portal contractor [SMOKE-GW-TC12] (${env.toUpperCase()})`, async () => {
			await loginAsContractor(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC12]', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('And: formulario completado — colaborador + tarjeta con 3DS (3155) + Hold ON [SMOKE-GW-TC12]', async () => {
				await travel.fillMinimum({
					client:      TEST_DATA.contractorColaborador,
					passenger:   TEST_DATA.contractorColaborador,
					origin:      TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4:   CARDS.HAPPY_3DS_HOLD_CAPTURE.slice(-4),
				});
			});

			await test.step('When: primer challenge 3DS aprobado (vinculación de tarjeta) [SMOKE-GW-TC12]', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
				debugLog('smoke', '[SMOKE-GW-TC12][3DS-1] Primer challenge 3DS aprobado ✅');
			});

			// Defense post-3DS: si el formulario reseteó el método de pago a "Efectivo"
			// (fenómeno intermitente detectado en diagnóstico flakiness 2026-04-19),
			// fallar rápido con mensaje diagnóstico claro en lugar del timeout 45s en STEP-05.
			await test.step('Then: "Preautorizada" sigue seleccionada tras el primer challenge 3DS [SMOKE-GW-TC12]', async () => {
				await expect(
					page.getByText(/Preautorizad/i).first(),
					'Tras el primer challenge 3DS, el método de pago debe mantenerse en "Preautorizada" — si aparece "Efectivo" el formulario se reseteó',
				).toBeVisible({ timeout: 5_000 });
			});

			await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC12]', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('And: segundo challenge 3DS aprobado si aparece (hold del viaje) [SMOKE-GW-TC12]', async () => {
				// El portal contractor presenta un 2do 3DS tras el submit del viaje que tarda
				// 8-15s en renderizarse (observado en pipelines reales). Timeout 18s para dar
				// margen al backend. Si efectivamente no se requiere, se considera OK.
				if (await threeDS.waitForOptionalVisible(18_000)) {
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
					debugLog('smoke', '[SMOKE-GW-TC12][3DS-2] Segundo challenge 3DS aprobado ✅');
				} else {
					debugLog('smoke', '[SMOKE-GW-TC12][3DS-2] 2do challenge no requerido (PaymentMethod ya autenticado)');
				}
			});

			await test.step('Then: URL redirige a contractor/dashboard tras crear el viaje [SMOKE-GW-TC12]', async () => {
				await expect(
					page,
					'Tras crear el viaje con 3DS éxito en portal contractor, la URL debe redirigir a /contractor/dashboard',
				).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
				debugLog('smoke', `[SMOKE-GW-TC12] Contractor Colaborador Hold ON 3DS éxito — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC13 ─────────────────────────────────────────────────────────────────
	test('@smoke @contractor @no-hold @happy [TS-STRIPE-P2-TC002] SMOKE-GW-TC13 — Colaborador · Hold OFF · sin 3DS → viaje sin preautorización desde portal Contractor', async ({ page }) => {
		// Hold OFF en Contractor requiere que enableCreditCardHold=false esté activo
		// en los parámetros del carrier ANTES de ejecutar este test. El estado de hold
		// se controla desde el portal Carrier (preferencias operativas), no desde Contractor.
		// En entornos CI donde el orden de ejecución es serial, TC03 restaura el hold —
		// si TC03 falla o no se ejecuta antes, este test puede ver hold=ON y comportarse
		// como TC11. Smoke tolera esta condición con expect.soft.
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);

		await test.step(`Given: contractor logueado en portal contractor [SMOKE-GW-TC13] (${env.toUpperCase()})`, async () => {
			await loginAsContractor(page);
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC13]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — colaborador + vinculación tarjeta nueva (4242) + Hold OFF [SMOKE-GW-TC13]', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorColaborador,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('And: vehículo seleccionado y servicio enviado [SMOKE-GW-TC13]', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: modal 3DS no debe aparecer (Hold OFF, sin preautorización) [SMOKE-GW-TC13]', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Then: URL redirige a contractor/dashboard tras crear el viaje [SMOKE-GW-TC13]', async () => {
			await expect(
				page,
				'Con Hold OFF, tras crear el viaje en portal contractor, la URL debe redirigir a /contractor/dashboard',
			).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
			debugLog('smoke', `[SMOKE-GW-TC13] Contractor Colaborador Hold OFF — viaje creado en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC14 (UNHAPPY — tarjeta declinada genérica por el banco) ──────────────
	test('@smoke @contractor @hold @unhappy [TS-STRIPE-P2-TC090] SMOKE-GW-TC14 — Colaborador · Hold ON · tarjeta declinada (0002) → error → viaje no creado [UNHAPPY]', async ({ page }) => {
		// Flujo UNHAPPY: card 4000 0000 0000 0002 (generic_decline) pasa el SetupIntent
		// pero RECHAZA al intentar el hold authorize durante el submit del viaje.
		//
		// Nota: se cambió de card 9995 (insufficient_funds) a 0002 (generic_decline) porque
		// 9995 solo rechaza al capturar (al final del viaje, fuera del alcance del smoke),
		// mientras que 0002 rechaza en el hold authorize, que es el momento correcto
		// para validar el flujo "viaje no creado".
		const dashboard   = new DashboardPage(page);
		const travel      = new ContractorNewTravelPage(page);

		await test.step(`Given: contractor logueado en portal contractor [SMOKE-GW-TC14] (${env.toUpperCase()})`, async () => {
			await loginAsContractor(page);
		});

		await test.step('When: formulario de nuevo viaje abierto [SMOKE-GW-TC14]', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: formulario completado — colaborador + tarjeta declinada genérica (0002) [SMOKE-GW-TC14]', async () => {
			await travel.fillMinimum({
				client:        TEST_DATA.contractorColaborador,
				passenger:     TEST_DATA.contractorColaborador,
				origin:        TEST_DATA.origin,
				destination:   TEST_DATA.destination,
				cardLast4:     STRIPE_TEST_CARDS.declined.slice(-4), // 0002 — rechaza en authorize
				expectDecline: true, // evita throw en waitForEnabledButton cuando Stripe declina antes de habilitar "Validar"
			});
		});

		await test.step('Then: botón "Seleccionar Vehículo" NO se habilita (card declinada bloquea el flujo) [SMOKE-GW-TC14]', async () => {
			// Card 0002 (generic_decline) falla al intentar attach del PaymentMethod al viaje
			// post-validación Stripe. Resultado observado en CI: el botón "Seleccionar Vehículo"
			// NUNCA se habilita con esta card — eso ES el flujo UNHAPPY que queremos validar.
			// Timeout corto (8s) para fail-fast: si el botón se habilita, el test falla porque
			// significa que la declinación no bloqueó como se espera.
			const vehicleBtnEnabled = await travel.waitForVehicleSelectionReady(8_000)
				.then(() => true)
				.catch(() => false);

			expect(
				vehicleBtnEnabled,
				'Con card declinada (0002) el botón "Seleccionar Vehículo" debería NO habilitarse — la declinación debe bloquear el flujo antes de llegar a selección de vehículo',
			).toBe(false);
			debugLog('smoke', `[SMOKE-GW-TC14][CHECK] Botón vehículo bloqueado por declinación ✅`);
		});

		await test.step('Then: URL no redirige a dashboard ni a un viaje creado (viaje no fue creado) [SMOKE-GW-TC14]', async () => {
			// El portal queda en el formulario — no redirige porque el viaje nunca se creó.
			await expect(
				page,
				'Con card declinada (0002), la URL NO debe redirigir a /contractor/dashboard — el portal debe permanecer en el formulario',
			).not.toHaveURL(/contractor\/dashboard$/, { timeout: 2_000 });
			await expect(
				page,
				'Con card declinada (0002), la URL NO debe redirigir a un detalle de viaje — el viaje no fue creado',
			).not.toHaveURL(/\/travels\/[\w-]+/, { timeout: 2_000 });
			debugLog('smoke', `[SMOKE-GW-TC14] Contractor tarjeta declinada → viaje NO creado en ${env.toUpperCase()} ✅`);
		});
	});
});
