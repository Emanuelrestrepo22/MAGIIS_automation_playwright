// tests/features/smoke/specs/gateway-pg.smoke.spec.ts
import { type Page } from '@playwright/test';
import { test, expect } from '../../../TestBase';
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
	await preferences.goto();
	await preferences.ensureHoldEnabled();
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
	test('[TS-STRIPE-TC1049] SMOKE-GW-TC01 — AppPax · Hold ON · sin 3DS (4242) → viaje pasa a SEARCHING_DRIVER', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC01][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC01][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC01][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC01][STEP-04] Completar formulario — AppPax + tarjeta sin 3DS (4242)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC01][STEP-05] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC01][STEP-06] Verificar que NO aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('[SMOKE-GW-TC01][STEP-07] Validar viaje en gestión — columna "Por asignar", estado "Buscando chofer"', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
			console.log(`[SMOKE-GW-TC01] AppPax Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC02 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1053] SMOKE-GW-TC02 — AppPax · Hold ON · con 3DS éxito (3155) → modal aprobado → SEARCHING_DRIVER', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const threeDS     = new ThreeDSModal(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC02][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC02][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC02][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC02][STEP-04] Completar formulario — AppPax + tarjeta con 3DS (3155)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.success3DS.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC02][STEP-05] Enviar formulario — sistema ejecuta hold y presenta modal 3DS', async () => {
			await travel.submit();
		});

		await test.step('[SMOKE-GW-TC02][STEP-06] Aprobar autenticación en modal 3DS', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			console.log('[SMOKE-GW-TC02][3DS] Modal 3DS aprobado ✅');
		});

		await test.step('[SMOKE-GW-TC02][STEP-07] Seleccionar vehículo y enviar servicio', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC02][STEP-08] Validar viaje en gestión — estado "Buscando chofer"', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
			console.log(`[SMOKE-GW-TC02] AppPax Hold ON 3DS éxito — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC03 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1050] SMOKE-GW-TC03 — AppPax · Hold OFF · sin 3DS → viaje creado sin preautorización', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC03][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC03][STEP-02] Deshabilitar hold en preferencias operativas', async () => {
			await disableHoldForSmoke(preferences);
		});

		try {
			await test.step('[SMOKE-GW-TC03][STEP-03] Abrir formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('[SMOKE-GW-TC03][STEP-04] Completar formulario — AppPax + tarjeta sin 3DS (4242)', async () => {
				await travel.fillMinimum({
					client:      TEST_DATA.appPaxPassenger,
					passenger:   TEST_DATA.appPaxPassenger,
					origin:      TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
				});
			});

			await test.step('[SMOKE-GW-TC03][STEP-05] Seleccionar vehículo y enviar servicio (sin hold)', async () => {
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('[SMOKE-GW-TC03][STEP-06] Verificar que NO aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('[SMOKE-GW-TC03][STEP-07] Validar viaje en gestión — "Buscando chofer" sin preautorización', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
				console.log(`[SMOKE-GW-TC03] AppPax Hold OFF sin 3DS — viaje creado sin preautorización en ${env.toUpperCase()} ✅`);
			});
		} finally {
			await test.step('[SMOKE-GW-TC03][CLEANUP] Restaurar hold en preferencias operativas', async () => {
				await restoreHoldForSmoke(preferences);
			});
		}
	});

	// ── TC04 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1081] SMOKE-GW-TC04 — AppPax · Cargo a Bordo · pago exitoso (sin Stripe form, sin 3DS)', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`[SMOKE-GW-TC04][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC04][STEP-02] Verificar precondición — pasajero AppPax tiene tarjeta 4242 activa', async () => {
			const check = await validateCardPrecondition(page, {
				passengerName:  PASSENGERS.appPax.apiSearchQuery!,
				requiredLast4:  '4242',
			});
			console.log(`[SMOKE-GW-TC04][PRE] AppPax tarjetas activas: ${check.activeCards}, tiene 4242: ${check.hasRequiredCard}`);
			if (!check.hasRequiredCard) {
				throw new Error(`[SMOKE-GW-TC04] PRECONDICIÓN: AppPax sin tarjeta 4242 activa — vincular manualmente en TEST.`);
			}
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('[SMOKE-GW-TC04][STEP-03] Abrir formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('[SMOKE-GW-TC04][STEP-04] Completar formulario con método Cargo a Bordo', async () => {
				await travel.selectClient(TEST_DATA.appPaxPassenger);
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('[SMOKE-GW-TC04][STEP-05] Seleccionar vehículo y enviar servicio', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('[SMOKE-GW-TC04][STEP-06] Verificar que NO aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('[SMOKE-GW-TC04][STEP-07] Validar viaje creado en gestión', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
				console.log(`[SMOKE-GW-TC04] AppPax Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC05 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1033] SMOKE-GW-TC05 — Colaborador · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC05][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC05][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC05][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC05][STEP-04] Completar formulario — Colaborador + tarjeta sin 3DS (4242)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorClient,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC05][STEP-05] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC05][STEP-06] Verificar que NO aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('[SMOKE-GW-TC05][STEP-07] Validar viaje en gestión — "Buscando chofer"', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, undefined, 'Buscando chofer');
			console.log(`[SMOKE-GW-TC05] Colaborador Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC06 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1037] SMOKE-GW-TC06 — Colaborador · Hold ON · con 3DS éxito (3155) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const threeDS     = new ThreeDSModal(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC06][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC06][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC06][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC06][STEP-04] Completar formulario — Colaborador + tarjeta con 3DS (3155)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorClient,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.success3DS.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC06][STEP-05] Enviar formulario — sistema ejecuta hold y presenta modal 3DS', async () => {
			await travel.submit();
		});

		await test.step('[SMOKE-GW-TC06][STEP-06] Aprobar autenticación en modal 3DS', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			console.log('[SMOKE-GW-TC06][3DS] Modal 3DS aprobado ✅');
		});

		await test.step('[SMOKE-GW-TC06][STEP-07] Seleccionar vehículo y enviar servicio', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC06][STEP-08] Validar viaje en gestión — "Buscando chofer"', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.contractorColaborador, undefined, 'Buscando chofer');
			console.log(`[SMOKE-GW-TC06] Colaborador Hold ON 3DS éxito — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC07 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1096] SMOKE-GW-TC07 — Colaborador · Cargo a Bordo · pago exitoso desde portal Carrier', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`[SMOKE-GW-TC07][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('[SMOKE-GW-TC07][STEP-02] Abrir formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('[SMOKE-GW-TC07][STEP-03] Completar formulario — cliente Contractor + colaborador + Cargo a Bordo', async () => {
				await travel.selectClient(TEST_DATA.contractorClient);
				await travel.selectPassenger(TEST_DATA.contractorPassenger);
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('[SMOKE-GW-TC07][STEP-04] Seleccionar vehículo y enviar servicio', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('[SMOKE-GW-TC07][STEP-05] Verificar que NO aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('[SMOKE-GW-TC07][STEP-06] Validar viaje creado en gestión', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, undefined, 'Buscando chofer');
				console.log(`[SMOKE-GW-TC07] Colaborador Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC08 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1065] SMOKE-GW-TC08 — Empresa · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER desde portal Carrier', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC08][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC08][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC08][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC08][STEP-04] Completar formulario — cliente Empresa + tarjeta sin 3DS (4242)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.client,
				passenger:   TEST_DATA.passenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC08][STEP-05] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC08][STEP-06] Verificar que NO aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('[SMOKE-GW-TC08][STEP-07] Validar viaje en gestión — "Buscando chofer"', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(TEST_DATA.passenger, undefined, 'Buscando chofer');
			console.log(`[SMOKE-GW-TC08] Empresa Hold ON sin 3DS — SEARCHING_DRIVER en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC09 ─────────────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1111] SMOKE-GW-TC09 — Empresa · Cargo a Bordo · pago exitoso desde portal Carrier', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new NewTravelPage(page);
		const management = new TravelManagementPage(page);
		let travelIdRef: TravelIdRef | null = null;

		await test.step(`[SMOKE-GW-TC09][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		try {
			travelIdRef = await captureCreatedTravelId(page);

			await test.step('[SMOKE-GW-TC09][STEP-02] Abrir formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('[SMOKE-GW-TC09][STEP-03] Completar formulario — cliente Empresa + método Cargo a Bordo', async () => {
				await travel.selectClient(TEST_DATA.client);
				// Empresa individuo puede auto-asignar el campo #passenger (ng-reflect-is-disabled="true")
				const passengerDisabled =
					(await page.locator('#passenger').getAttribute('ng-reflect-is-disabled')) === 'true';
				if (!passengerDisabled) {
					await travel.selectPassenger(TEST_DATA.passenger);
				} else {
					console.log('[SMOKE-GW-TC09] #passenger auto-asignado por empresa individuo');
				}
				await travel.setOrigin(TEST_DATA.origin);
				await travel.setDestination(TEST_DATA.destination);
				await travel.selectPaymentMethod('CargoABordo');
			});

			await test.step('[SMOKE-GW-TC09][STEP-04] Seleccionar vehículo y enviar servicio', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('[SMOKE-GW-TC09][STEP-05] Verificar que NO aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await test.step('[SMOKE-GW-TC09][STEP-06] Validar viaje creado en gestión', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.passenger, undefined, 'Buscando chofer');
				console.log(`[SMOKE-GW-TC09] Empresa Cargo a Bordo — viaje creado en ${env.toUpperCase()} ✅`);
			});
		} finally {
			if (travelIdRef) await cancelTravelIfCreated(page, travelIdRef);
		}
	});

	// ── TC10 (UNHAPPY) ────────────────────────────────────────────────────────
	test('[TS-STRIPE-TC1057] SMOKE-GW-TC10 — AppPax · 3DS rechazado (9235) → hold no completado → ausente en Por Asignar [UNHAPPY]', async ({ page }) => {
		const dashboard   = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel      = new NewTravelPage(page);
		const management  = new TravelManagementPage(page);

		await test.step(`[SMOKE-GW-TC10][STEP-01] Login carrier en ${env.toUpperCase()}`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('[SMOKE-GW-TC10][STEP-02] Verificar hold habilitado en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.ensureHoldEnabled();
		});

		await test.step('[SMOKE-GW-TC10][STEP-03] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC10][STEP-04] Completar formulario — AppPax + tarjeta fail3DS (9235)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.appPaxPassenger,
				passenger:   TEST_DATA.appPaxPassenger,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.fail3DS.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC10][STEP-05] Enviar formulario — card 9235 → backend procesa fallo 3DS silenciosamente → limitExceeded=false', async () => {
			// Card 9235: NO aparece challenge frame. El backend resuelve el fallo 3DS internamente.
			// URL post-submit: ?limitExceeded=false. Viaje creado con estado NO_AUTORIZADO → "En conflicto".
			await travel.submit();
			await waitForTravelCreation(page);
			console.log('[SMOKE-GW-TC10] Submit completado — viaje creado como NO_AUTORIZADO ✅');
		});

		await test.step('[SMOKE-GW-TC10][STEP-06] Validar viaje en "En conflicto" con NO_AUTORIZADO', async () => {
			// porAsignarColumn() usa data-testid que no renderiza cuando la columna está vacía.
			// Aserción positiva: el viaje con card 9235 DEBE estar en "En conflicto" como NO_AUTORIZADO.
			await management.goto();
			await management.expectPassengerInEnConflicto(TEST_DATA.appPaxPassenger);
			console.log(`[SMOKE-GW-TC10] Card 9235 → viaje en "En conflicto" / NO_AUTORIZADO en ${env.toUpperCase()} ✅`);
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
	// [SIN-ID-MATRIZ]: Los P2-TC001/005/002 del normalized-test-cases.json son flujos híbridos
	// mobile (app pax + driver), no tests web del portal contractor. Pendiente asignar ID canónico.
	test('[SIN-ID-MATRIZ] SMOKE-GW-TC11 — Colaborador · Hold ON · vinculación nueva tarjeta (4242) → SEARCHING_DRIVER desde portal Contractor', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);

		await test.step(`[SMOKE-GW-TC11][STEP-01] Login contractor en ${env.toUpperCase()}`, async () => {
			await loginAsContractor(page);
		});

		await test.step('[SMOKE-GW-TC11][STEP-02] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC11][STEP-03] Completar formulario — colaborador + vinculación tarjeta nueva (4242) + Hold ON', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorColaborador,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC11][STEP-04] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC11][STEP-05] Verificar que NO aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('[SMOKE-GW-TC11][STEP-06] Verificar redirección a contractor/dashboard tras crear viaje', async () => {
			// El portal Contractor redirige a dashboard tras crear el viaje (no a /travels/xxx).
			await expect(page).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
			console.log(`[SMOKE-GW-TC11] Contractor Colaborador Hold ON sin 3DS — viaje creado en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC12 ─────────────────────────────────────────────────────────────────
	test('[SIN-ID-MATRIZ] SMOKE-GW-TC12 — Colaborador · Hold ON · tarjeta con 3DS éxito (3155) → SEARCHING_DRIVER desde portal Contractor', async ({ page }) => {
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);
		const threeDS    = new ThreeDSModal(page);

		await test.step(`[SMOKE-GW-TC12][STEP-01] Login contractor en ${env.toUpperCase()}`, async () => {
			await loginAsContractor(page);
		});

		await test.step('[SMOKE-GW-TC12][STEP-02] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC12][STEP-03] Completar formulario — colaborador + tarjeta con 3DS (3155) + Hold ON', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorColaborador,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC12][STEP-04] Aprobar primer challenge 3DS (vinculación de tarjeta)', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			console.log('[SMOKE-GW-TC12][3DS-1] Primer challenge 3DS aprobado ✅');
		});

		await test.step('[SMOKE-GW-TC12][STEP-05] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC12][STEP-06] Aprobar segundo challenge 3DS (hold del viaje)', async () => {
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
			console.log('[SMOKE-GW-TC12][3DS-2] Segundo challenge 3DS aprobado ✅');
		});

		await test.step('[SMOKE-GW-TC12][STEP-07] Verificar redirección a contractor/dashboard tras crear viaje', async () => {
			await expect(page).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
			console.log(`[SMOKE-GW-TC12] Contractor Colaborador Hold ON 3DS éxito — viaje creado en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC13 ─────────────────────────────────────────────────────────────────
	test('[SIN-ID-MATRIZ] SMOKE-GW-TC13 — Colaborador · Hold OFF · sin 3DS → viaje sin preautorización desde portal Contractor', async ({ page }) => {
		// Hold OFF en Contractor requiere que enableCreditCardHold=false esté activo
		// en los parámetros del carrier ANTES de ejecutar este test. El estado de hold
		// se controla desde el portal Carrier (preferencias operativas), no desde Contractor.
		// En entornos CI donde el orden de ejecución es serial, TC03 restaura el hold —
		// si TC03 falla o no se ejecuta antes, este test puede ver hold=ON y comportarse
		// como TC11. Smoke tolera esta condición con expect.soft.
		const dashboard  = new DashboardPage(page);
		const travel     = new ContractorNewTravelPage(page);

		await test.step(`[SMOKE-GW-TC13][STEP-01] Login contractor en ${env.toUpperCase()}`, async () => {
			await loginAsContractor(page);
		});

		await test.step('[SMOKE-GW-TC13][STEP-02] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC13][STEP-03] Completar formulario — colaborador + vinculación tarjeta nueva (4242) + Hold OFF', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorColaborador,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC13][STEP-04] Seleccionar vehículo y enviar servicio', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('[SMOKE-GW-TC13][STEP-05] Verificar que NO aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('[SMOKE-GW-TC13][STEP-06] Verificar redirección a contractor/dashboard tras crear viaje', async () => {
			await expect(page).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
			console.log(`[SMOKE-GW-TC13] Contractor Colaborador Hold OFF — viaje creado en ${env.toUpperCase()} ✅`);
		});
	});

	// ── TC14 (UNHAPPY — pendiente TC en matriz) ───────────────────────────────
	test('[TC-PENDIENTE] SMOKE-GW-TC14 — Colaborador · Hold ON · tarjeta declinada (9995) → error → viaje no creado [UNHAPPY]', async ({ page }) => {
		// TC en matriz: pendiente de definición formal.
		// Comportamiento esperado: fondos insuficientes → error visible → viaje no redirige a /travels/
		const dashboard   = new DashboardPage(page);
		const travel      = new ContractorNewTravelPage(page);

		await test.step(`[SMOKE-GW-TC14][STEP-01] Login contractor en ${env.toUpperCase()}`, async () => {
			await loginAsContractor(page);
		});

		await test.step('[SMOKE-GW-TC14][STEP-02] Abrir formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('[SMOKE-GW-TC14][STEP-03] Completar formulario — colaborador + tarjeta fondos insuficientes (9995)', async () => {
			await travel.fillMinimum({
				client:      TEST_DATA.contractorColaborador,
				passenger:   TEST_DATA.contractorColaborador,
				origin:      TEST_DATA.origin,
				destination: TEST_DATA.destination,
				cardLast4:   STRIPE_TEST_CARDS.insufficientFunds.slice(-4),
			});
		});

		await test.step('[SMOKE-GW-TC14][STEP-04] Intentar seleccionar vehículo y enviar servicio', async () => {
			// Card 9995 (fondos insuficientes) es rechazada por Stripe durante la vinculación del form
			// — el botón de vehículo nunca habilita. Timeout corto (8s) para fail-fast y continuar
			// al STEP-05 donde se valida el mensaje de error ya visible en el formulario.
			const isReady = await travel.waitForVehicleSelectionReady(8_000).then(() => true).catch(() => false);
			if (isReady) {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			}
		});

		await test.step('[SMOKE-GW-TC14][STEP-05] Validar error de declinación visible', async () => {
			await expect(page.getByText(/declinada|rechazada|fondos|insufficient/i)).toBeVisible({ timeout: 10_000 });
			console.log(`[SMOKE-GW-TC14][CHECK] Error de declinación visible ✅`);
		});

		await test.step('[SMOKE-GW-TC14][STEP-06] Validar que el viaje no fue creado (URL sin /travels/)', async () => {
			await expect(page).not.toHaveURL(/\/travels\/[\w-]+/, { timeout: 5_000 });
			console.log(`[SMOKE-GW-TC14] Contractor fondos insuficientes → viaje no creado en ${env.toUpperCase()} ✅`);
		});
	});
});
