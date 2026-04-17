/**
 * web-phase.ts — Fase web del E2E Flow 3 (Contractor Web + Driver App).
 * Proyecto: e2e
 *
 * Responsabilidades:
 *   1. Login como colaborador en el portal contractor.
 *   2. Validar que el hold esté habilitado según la config del flow.
 *   3. Crear el viaje (fillMinimum o selectSavedCard + submit).
 *   4. Si config.requires3DS: esperar modal 3DS → completeSuccess → waitForHidden.
 *   5. Extraer el tripId desde la URL de redirección.
 *   6. Escribir el JourneyContext con status 'ready-for-driver'.
 *   7. Retornar journeyId y tripId al spec orquestador.
 *
 * Reutilización:
 *   - loginAsContractor: fixture existente en gateway.fixtures.ts
 *   - NewTravelPage, OperationalPreferencesPage, ThreeDSModal: POMs carrier reutilizados
 *   - La lógica de hold check y 3DS es idéntica al Flow 1 (carrier)
 *
 * No ejecuta assertions de Playwright — las assertions viven en el spec.
 */

import type { Page } from '@playwright/test';
import {
	DashboardPage,
	ThreeDSModal,
} from '../../../pages/carrier';
import { ContractorNewTravelPage } from '../../../pages/contractor/NewTravelPage';
import {
	loginAsContractor,
	STRIPE_TEST_CARDS,
	TEST_DATA,
} from '../../../features/gateway-pg/fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../../features/gateway-pg/helpers/stripe.helpers';
import { initJourneyContext, markReadyForDriver } from '../shared/JourneyBridge';
import type { GatewayFlowConfig } from '../shared/e2eFlowConfig';

export type WebPhaseResult = {
	journeyId: string;
	tripId:    string;
};


/**
 * Ejecuta la fase web completa del Flow 3.
 *
 * @param page      - Página Playwright del test.
 * @param config    - Config de la pasarela (gateway, card, hold, 3DS).
 * @param tcId      - ID del test case para trazabilidad en el JourneyContext.
 * @returns         - { journeyId, tripId } para pasar a la fase mobile.
 */
export async function runWebPhase(
	page:   Page,
	config: GatewayFlowConfig,
	tcId:   string,
): Promise<WebPhaseResult> {
	const dashboard = new DashboardPage(page);
	const travel    = new ContractorNewTravelPage(page);

	// ── Paso 1: Login contractor ──────────────────────────────────────────────
	console.log('[flow3/web-phase] Paso 1: Login contractor (colaborador)');
	await loginAsContractor(page);

	// ── Paso 2: Inicializar JourneyContext ────────────────────────────────────
	console.log(`[flow3/web-phase] Paso 2: Inicializando JourneyContext para ${config.label}`);
	const ctx = await initJourneyContext(config, tcId);
	const { journeyId } = ctx;
	console.log(`[flow3/web-phase] journeyId: ${journeyId}`);

	// ── Paso 3: Hold config ───────────────────────────────────────────────────
	// El hold es una configuración del portal carrier, no del contractor.
	// El contractor no tiene acceso a /settings/parameters.
	// Precondición: el carrier debe tener hold habilitado antes de correr este flow.
	console.log(`[flow3/web-phase] Paso 3: Hold es config carrier (skipped en contractor) — esperado: hold=${config.holdEnabled}`);

	// ── Paso 4: Abrir formulario de nuevo viaje ───────────────────────────────
	console.log('[flow3/web-phase] Paso 4: Abrir formulario de nuevo viaje');
	await dashboard.openNewTravel();
	await travel.ensureLoaded();

	// ── Paso 5: Completar formulario con tarjeta ──────────────────────────────
	console.log(`[flow3/web-phase] Paso 5: Completar formulario — tarjeta ${config.cardLast4}`);
	// Contractor: en el portal contractor el cliente Y pasajero es el colaborador.
	// Evidencia: colaborador-hold-no3ds.spec.ts usa client=contractorColaborador.
	await travel.fillMinimum({
		client:      TEST_DATA.contractorColaborador,
		passenger:   TEST_DATA.contractorColaborador,
		origin:      TEST_DATA.origin,
		destination: TEST_DATA.destination,
		cardLast4:   config.cardLast4,
	});

	// ── Paso 6: Enviar viaje ──────────────────────────────────────────────────
	console.log('[flow3/web-phase] Paso 6: Enviar viaje (submit)');
	await travel.submit();

	// ── Paso 6b: Completar desafío 3DS si el config lo requiere ──────────────
	if (config.requires3DS) {
		console.log('[flow3/web-phase] Paso 6b: Detectado requires3DS — completando modal 3DS');
		const threeDS = new ThreeDSModal(page);
		await threeDS.waitForVisible();
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();
		console.log('[flow3/web-phase] Paso 6b: Modal 3DS completado exitosamente');
	}

	// ── Paso 7: Extraer tripId desde URL ─────────────────────────────────────
	console.log('[flow3/web-phase] Paso 7: Esperar redirección y extraer tripId');
	const tripId = await waitForTravelCreation(page, 30_000);
	console.log(`[flow3/web-phase] tripId: ${tripId}`);

	// ── Paso 8: Actualizar JourneyContext → ready-for-driver ──────────────────
	console.log('[flow3/web-phase] Paso 8: Marcar journey como ready-for-driver');
	await markReadyForDriver(journeyId, tripId);

	return { journeyId, tripId };
}

/**
 * Resuelve el cardLast4 correcto para una config dada.
 * Igual que en Flow 1 — centraliza el mapeo sin hardcodear strings.
 */
export function resolveCardLast4ForConfig(config: GatewayFlowConfig): string {
	if (config.gateway === 'stripe') {
		if (config.requires3DS) {
			return STRIPE_TEST_CARDS.success3DS.slice(-4); // 3155
		}
		return STRIPE_TEST_CARDS.successDirect.slice(-4);  // 4242
	}
	return config.cardLast4;
}
