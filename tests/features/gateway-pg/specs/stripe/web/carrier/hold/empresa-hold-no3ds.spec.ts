/**
 * TCs: TS-STRIPE-TC1065–TC1076
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — sin 3DS
 * Tags: @regression @hold @web-only
 *
 * Sin 3DS set 1: TC1065–TC1068
 * Sin 3DS set 2: TC1073–TC1076
 *
 * Precondición: Marcelle Stripe debe tener al menos una tarjeta 4242 vinculada.
 * Se valida vía API paymentMethodsByPax antes de cada test.
 * Si la tarjeta existe → se selecciona del dropdown (saved card).
 * Si no existe → se vincula nueva vía Stripe iframe.
 * Evidencia del flujo correcto: test-22.spec.ts (recording).
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelDetailPage, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../../../../helpers/stripe.helpers';
import { validateCardPrecondition, type CardPreconditionResult } from '../../../../../helpers/card-precondition';
import { captureCreatedTravelId, cancelTravelIfCreated, type TravelIdRef } from '../../../../../helpers/travel-cleanup';
import { PASSENGERS } from '../../../../../data/passengers';

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

type CardFlow = 'new' | 'existing';

type HoldNo3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	/** Query para buscar el passengerId via API (ej: 'marce' para Marcelle Stripe) */
	apiSearchQuery?: string;
	/**
	 * Define el preludio de tarjeta del test:
	 *  - 'new': fuerza vinculación nueva (preferSavedCard=false)
	 *  - 'existing': exige tarjeta ya vinculada; si no existe, test.skip()
	 */
	cardFlow?: CardFlow;
};

/** Extrae el primer segmento del destino (ej: "Cazadores 1987" de "Cazadores 1987, Buenos Aires, Argentina") */
function shortDestination(destination: string): string {
	return destination.split(',')[0].trim();
}

async function resolveCardFlowEmpresa(
	page: Page,
	scenario: HoldNo3dsScenario,
	cardLast4: string,
): Promise<{ cardCheck: CardPreconditionResult | null; preferSavedCard: boolean }> {
	const cardFlow: CardFlow = scenario.cardFlow ?? 'new';
	let cardCheck: CardPreconditionResult | null = null;

	if (scenario.apiSearchQuery) {
		cardCheck = await validateCardPrecondition(page, {
			passengerName: scenario.apiSearchQuery,
			requiredLast4: cardLast4,
		});
		console.log(`[card-precondition] ${scenario.passenger} (cardFlow=${cardFlow}): ${cardCheck.activeCards} tarjetas activas, tiene ${cardLast4}: ${cardCheck.hasRequiredCard}`);
	}

	if (cardFlow === 'existing') {
		test.skip(
			!cardCheck?.hasRequiredCard,
			`[card-existing] Precondición: pasajero ${scenario.passenger} debe tener tarjeta ${cardLast4} vinculada.`,
		);
		return { cardCheck, preferSavedCard: true };
	}

	return { cardCheck, preferSavedCard: false };
}

async function runHoldOnScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4); // 4242
	let travelIdRef: TravelIdRef | null = null;

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlowEmpresa(page, scenario, cardLast4);
		preferSavedCard = resolved.preferSavedCard;
	});

	try {
		// Interceptor para capturar travelId del POST /travels
		travelIdRef = await captureCreatedTravelId(page);

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
				cardLast4,
				preferSavedCard,
			});
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		// Post-submit: URL /travel/create?limitExceeded=false es normal (alta OK)
		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (hold OK)', async () => {
			await management.goto();
			// Usar destino corto: la UI no muestra "Argentina"
			await management.expectPassengerInPorAsignar(scenario.passenger, shortDestination(scenario.destination));
		});
	} finally {
		// Cleanup: cancelar viaje para evitar acumulación de holds
		if (travelIdRef) {
			await test.step('Cleanup: cancelar viaje creado', async () => {
				await cancelTravelIfCreated(page, travelIdRef!);
			});
		}
	}
}

async function runHoldOffScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4); // 4242
	let travelIdRef: TravelIdRef | null = null;

	await loginAsDispatcher(page);

	let preferSavedCard = false;
	await test.step(`Precondición: resolver flujo de tarjeta (cardFlow=${scenario.cardFlow ?? 'new'})`, async () => {
		const resolved = await resolveCardFlowEmpresa(page, scenario, cardLast4);
		preferSavedCard = resolved.preferSavedCard;
	});

	try {
		travelIdRef = await captureCreatedTravelId(page);

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
				cardLast4,
				preferSavedCard,
			});
		});

		await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Esperar alta de viaje completa', async () => {
			await waitForTravelCreation(page);
		});

		expect(travelIdRef?.travelId, 'POST /travels debe haber capturado travelId').not.toBeNull();

		await test.step('Validar viaje en gestion — columna Asignar (sin hold)', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(scenario.passenger, shortDestination(scenario.destination));
		});
	} finally {
		if (travelIdRef) {
			await test.step('Cleanup: cancelar viaje creado', async () => {
				await cancelTravelIfCreated(page, travelIdRef!);
			});
		}
		await test.step('Restaurar hold al final del test', async () => {
			await restoreHoldAndSave(page, preferences);
		});
	}
}

test.use({ role: 'carrier', storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {
		// TC1065 — canónico card-new. Mantiene lógica inline específica (diagnósticos del dashboard)
		// para preservar la cobertura histórica del smoke. Ver par card-existing en TC1067.
		test('[TS-STRIPE-TC1065] @smoke @hold @card-new hold+cobro empresa sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail = new TravelDetailPage(page);
			const cardLast4 = STRIPE_TEST_CARDS.successDirect.slice(-4); // 4242
			let travelIdRef: TravelIdRef | null = null;

			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
			});

			let preferSavedCard = false;
			await test.step('Precondición: resolver flujo de tarjeta (cardFlow=new)', async () => {
				const resolved = await resolveCardFlowEmpresa(
					page,
					{
						client: PASSENGERS.empresaIndividuo.name,
						passenger: PASSENGERS.empresaIndividuo.name,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
						cardFlow: 'new',
					},
					cardLast4,
				);
				preferSavedCard = resolved.preferSavedCard;
			});

			try {
				// Instalar interceptor del travelId ANTES del submit — el POST /travels
				// responde con { travelId } que usaremos en el finally para cancelar.
				travelIdRef = await captureCreatedTravelId(page);

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
						client: PASSENGERS.empresaIndividuo.name,
						passenger: PASSENGERS.empresaIndividuo.name,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4,
						preferSavedCard,
					});
				});

				await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				// Post-submit: URL normal es /travel/create?limitExceeded=false (alta OK).
				// waitForTravelCreation acepta ese URL como éxito y solo throw si limitExceeded=true.
				await test.step('Esperar alta de viaje completa (post-submit URL)', async () => {
					await waitForTravelCreation(page);
				});

				const createdTravelId = travelIdRef?.travelId;
				expect(createdTravelId, 'Interceptor POST /travels debe haber capturado travelId').not.toBeNull();

				// Diagnóstico del hold: ver en qué columna quedó el viaje
				await test.step('Diagnóstico: estado del viaje en dashboard', async () => {
					await management.goto();
					await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
					const dashboardText = await page.locator('main').textContent().catch(() => '');
					const hasPorAsignar = /Por\s*Asignar/i.test(dashboardText ?? '');
					const hasConflicto = /En\s*conflicto/i.test(dashboardText ?? '');
					const hasNoAutorizado = /No\s*Autorizado/i.test(dashboardText ?? '');
					console.log(`[diagnostic] travelId=${createdTravelId} → dashboard columns visible: porAsignar=${hasPorAsignar}, conflicto=${hasConflicto}, noAutorizado=${hasNoAutorizado}`);
				});

				await test.step('Validar viaje en gestion — columna Asignar (hold OK)', async () => {
					// Hold exitoso → viaje aparece en tab "Asignar" con pasajero y destino correctos.
					// Hold fallido → viaje quedaría en "En Conflicto" con estado "No Autorizado".
					// Esta aserción es suficiente para validar el hold: si el viaje está en "Asignar",
					// significa que Stripe aprobó la pre-autorización.
					await management.expectPassengerInPorAsignar(PASSENGERS.empresaIndividuo.name, 'Cazadores 1987');
				});

				// Validación opcional: abrir detalle y verificar "Buscando conductor"
				// Se omite por ahora — el row de recién creado no siempre tiene link /travels/{id}
				// hasta que un conductor es asignado. La validación de "Asignar" arriba es suficiente.
			} finally {
				// Cleanup: cancelar el viaje creado para liberar el hold en Stripe y
				// prevenir acumulación para runs futuros.
				if (travelIdRef) {
					await test.step('Cleanup: cancelar viaje creado', async () => {
						await cancelTravelIfCreated(page, travelIdRef!);
					});
				}
			}
		});

		// Par card-existing de TC1065 — canonical_ref TS-STRIPE-TC1065 en normalized-test-cases.json
		test('[TS-STRIPE-TC1067] @regression @hold @card-existing hold+cobro empresa sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'existing',
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1065 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1073] @regression @hold hold+cobro empresa sin 3DS (set 2)', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1065 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1075] @regression @hold hold+cobro empresa sin 3DS variante set 2', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'new',
			});
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1066] @regression @hold @card-new sin hold empresa sin 3DS — Vincular tarjeta nueva', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		// Par card-existing de TC1066 — canonical_ref TS-STRIPE-TC1066 en normalized-test-cases.json
		test('[TS-STRIPE-TC1068] @regression @hold @card-existing sin hold empresa sin 3DS — Usar tarjeta vinculada existente', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'existing',
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1066 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1074] @regression @hold sin hold empresa sin 3DS (set 2)', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: 'Florida 100, CABA',
				destination: 'Palermo Soho, CABA',
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'new',
			});
		});

		// DEPRECATED: ver TC canónico TS-STRIPE-TC1066 (fase 2 — duplicado sin card-flow diferenciado)
		test('[TS-STRIPE-TC1076] @regression @hold sin hold empresa sin 3DS variante set 2', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: PASSENGERS.empresaIndividuo.name,
				passenger: PASSENGERS.empresaIndividuo.name,
				origin: 'Reconquista 661, Buenos Aires, Argentina',
				destination: 'Cazadores 1987, Buenos Aires, Argentina',
				apiSearchQuery: PASSENGERS.empresaIndividuo.apiSearchQuery,
				cardFlow: 'new',
			});
		});
	});

});
