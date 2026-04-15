/**
 * TCs: TS-STRIPE-TC1033–TC1044
 * Feature: Alta de Viaje desde Carrier — Usuario Colaborador/Asociado Contractor — sin 3DS
 * Tags: @regression @hold @web-only
 *
 * Sin 3DS set 1: TC1033–TC1036
 * Sin 3DS set 2: TC1041–TC1044
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

function extractTravelId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) throw new Error(`No se pudo extraer el travelId desde: ${url}`);
	return match[1];
}

type ParametersSavePayload = {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number | string;
	ccHoldCoverage?: number | string;
	[key: string]: unknown;
};

const PARAMETERS_SAVE_URL = /\/magiis-v0\.2\/carriers\/\d+\/parameters$/;

async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(false);

	const saveResult = await preferences.saveAndCaptureParametersPayload();
	expect(saveResult.url).toContain('/magiis-v0.2/carriers/1521/parameters');
	expect(saveResult.payload.enableCreditCardHold).toBe(false);
	expect(saveResult.payload.ccHoldPreviousHs).toBe(2);
	expect(saveResult.payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldDisabled();
}

async function restoreHoldAndSave(page: Page, preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(true);

	const responsePromise = page.waitForResponse(
		(response) => response.request().method() === 'POST' && PARAMETERS_SAVE_URL.test(response.url()),
		{ timeout: 15_000 }
	);

	await preferences.save();

	const response = await responsePromise;
	expect(response.ok()).toBeTruthy();

	const payload = response.request().postDataJSON() as ParametersSavePayload;
	expect(payload.enableCreditCardHold).toBe(true);
	expect(payload.ccHoldPreviousHs).toBe(2);
	expect(payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldEnabled();
}

type HoldNo3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
};

async function runHoldOnScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	await test.step('Validar que el hold este activado en preferencias operativas', async () => {
		await preferences.goto();
		await preferences.ensureHoldEnabled();
		await preferences.assertHoldEnabled();
	});

	await test.step('Ir al formulario de nuevo viaje', async () => {
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
	});

	await test.step('Completar formulario con tarjeta sin 3DS', async () => {
		await travel.fillMinimum({
			client: scenario.client,
			passenger: scenario.passenger,
			origin: scenario.origin,
			destination: scenario.destination,
			cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
		});
	});

	await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
		await travel.clickSelectVehicle();
		await travel.clickSendService();
	});

	await test.step('Verificar que no aparece modal 3DS', async () => {
		await expectNoThreeDSModal(page);
	});

	await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
	const createdTravelId = extractTravelId(page.url());

	await test.step('Validar viaje en gestion - columna Por asignar', async () => {
		await management.goto();
		await management.expectPassengerInPorAsignar(scenario.passenger, scenario.destination);
	});

	await test.step('Abrir detalle del viaje recien creado', async () => {
		await management.openDetailForPassenger(scenario.passenger, scenario.destination);
		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		expect(extractTravelId(page.url())).toBe(createdTravelId);
	});

	await test.step('Validar estado del viaje - Buscando conductor', async () => {
		await detail.expectStatus('Buscando conductor');
	});
}

async function runHoldOffScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);

	await loginAsDispatcher(page);

	try {
		await test.step('Desactivar hold en preferencias operativas', async () => {
			await disableHoldAndSave(preferences);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario con tarjeta sin 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		const createdTravelId = extractTravelId(page.url());

		await test.step('Validar viaje en gestion - columna Por asignar', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(scenario.passenger, scenario.destination);
		});

		await test.step('Abrir detalle del viaje recien creado', async () => {
			await management.openDetailForPassenger(scenario.passenger, scenario.destination);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			expect(extractTravelId(page.url())).toBe(createdTravelId);
		});

		await test.step('Validar estado del viaje - Buscando conductor', async () => {
			await detail.expectStatus('Buscando conductor');
		});
	} finally {
		await test.step('Restaurar hold al final del test', async () => {
			await restoreHoldAndSave(page, preferences);
		});
	}
}

test.use({ role: 'carrier', storageState: undefined });

test.describe('Gateway PG · Carrier · Colaborador — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1033] @smoke @hold hold+cobro colaborador sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail = new TravelDetailPage(page);
			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
			});

			await test.step('Validar que el hold este activado en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario con tarjeta sin 3DS', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.contractorClient,
					passenger: TEST_DATA.contractorPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
				});
			});

			await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			const createdTravelId = extractTravelId(page.url());

			await test.step('Validar viaje en gestion — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, TEST_DATA.destination);
			});

			await test.step('Abrir detalle del viaje recien creado', async () => {
				await management.openDetailForPassenger(TEST_DATA.contractorPassenger, TEST_DATA.destination);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				expect(extractTravelId(page.url())).toBe(createdTravelId);
			});

			await test.step('Validar estado del viaje — Buscando conductor', async () => {
				await detail.expectStatus('Buscando conductor');
			});
		});

		test('[TS-STRIPE-TC1035] @regression @hold hold+cobro colaborador sin 3DS variante', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
			});
		});

		test('[TS-STRIPE-TC1041] @regression @hold hold+cobro colaborador sin 3DS (set 2)', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
			});
		});

		test('[TS-STRIPE-TC1043] @regression @hold hold+cobro colaborador sin 3DS variante set 2', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
			});
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1034] @regression @hold sin hold colaborador sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail = new TravelDetailPage(page);
			await loginAsDispatcher(page);

			try {
				await test.step('Desactivar hold en preferencias operativas', async () => {
					await disableHoldAndSave(preferences);
				});

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step('Completar formulario con tarjeta sin 3DS', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.contractorClient,
						passenger: TEST_DATA.contractorPassenger,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
					});
				});

				await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const createdTravelId = extractTravelId(page.url());

				await test.step('Validar viaje en gestion — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.contractorPassenger, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recien creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.contractorPassenger, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
					expect(extractTravelId(page.url())).toBe(createdTravelId);
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				await test.step('Restaurar hold al final del test', async () => {
					await restoreHoldAndSave(page, preferences);
				});
			}
		});

		test('[TS-STRIPE-TC1036] @regression @hold sin hold colaborador sin 3DS variante', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
			});
		});

		test('[TS-STRIPE-TC1042] @regression @hold sin hold colaborador sin 3DS (set 2)', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
			});
		});

		test('[TS-STRIPE-TC1044] @regression @hold sin hold colaborador sin 3DS variante set 2', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.contractorClient,
				passenger: TEST_DATA.contractorPassenger,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
			});
		});
	});

});
