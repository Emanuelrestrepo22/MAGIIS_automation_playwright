/**
 * web-phase.ts — Fase web del E2E Flow 1 (Carrier Web + Driver App).
 *
 * Responsabilidades:
 *   1. Login como dispatcher en el portal carrier.
 *   2. Validar que el hold esté habilitado según la config del flow.
 *   3. Crear el viaje (fillMinimum + clickSelectVehicle + clickSendService).
 *   4. Si config.requires3DS: esperar modal 3DS → completeSuccess → waitForHidden.
 *   5. Extraer el tripId desde la URL de redirección.
 *   6. Escribir el JourneyContext con status 'ready-for-driver'.
 *   7. Retornar journeyId y tripId al spec orquestador.
 *
 * No ejecuta assertions de Playwright — las assertions viven en el spec.
 * Este módulo solo encapsula los pasos de negocio para que el spec sea legible.
 */

import type { Page } from '@playwright/test';
import {
	DashboardPage,
	NewTravelPage,
	OperationalPreferencesPage,
	ThreeDSModal,
} from '../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../features/gateway-pg/fixtures/gateway.fixtures';
import { waitForTravelCreation } from '../../../features/gateway-pg/helpers/stripe.helpers';
import { initJourneyContext, markReadyForDriver } from '../shared/JourneyBridge';
import type { GatewayFlowConfig } from '../shared/e2eFlowConfig';

export type WebPhaseResult = {
	journeyId: string;
	tripId:    string;
};


/**
 * Ejecuta la fase web completa del Flow 1.
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
	const dashboard   = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel      = new NewTravelPage(page);

	// ── Paso 1: Login carrier ────────────────────────────────────────────────
	console.log('[web-phase] Paso 1: Login carrier dispatcher');
	await loginAsDispatcher(page);

	// ── Paso 2: Inicializar JourneyContext ───────────────────────────────────
	console.log(`[web-phase] Paso 2: Inicializando JourneyContext para ${config.label}`);
	const ctx = await initJourneyContext(config, tcId);
	const { journeyId } = ctx;
	console.log(`[web-phase] journeyId: ${journeyId}`);

	// ── Paso 3: Verificar estado de hold ─────────────────────────────────────
	console.log(`[web-phase] Paso 3: Verificar hold ${config.holdEnabled ? 'ON' : 'OFF'}`);
	await preferences.goto();
	if (config.holdEnabled) {
		await preferences.ensureHoldEnabled();
		await preferences.assertHoldEnabled();
	} else {
		await preferences.ensureHoldDisabled();
		await preferences.assertHoldDisabled();
	}

	// ── Paso 4: Abrir formulario de nuevo viaje ───────────────────────────────
	console.log('[web-phase] Paso 4: Abrir formulario de nuevo viaje');
	await dashboard.openNewTravel();
	await travel.ensureLoaded();

	// ── Paso 5: Completar formulario ─────────────────────────────────────────
	console.log(`[web-phase] Paso 5: Completar formulario — tarjeta ${config.cardLast4}`);
	await travel.fillMinimum({
		passenger:   TEST_DATA.appPaxPassenger,
		origin:      TEST_DATA.origin,
		destination: TEST_DATA.destination,
		cardLast4:   config.cardLast4,
	});

	// ── Paso 6: Enviar viaje ─────────────────────────────────────────────────
	// submit() maneja internamente: clickValidateCard si hay tarjeta nueva,
	// luego clickSelectVehicle y clickSendService.
	console.log('[web-phase] Paso 6: Enviar viaje (submit)');
	await travel.submit();

	// ── Paso 6b: Completar desafío 3DS si el config lo requiere ──────────────
	// submit() dispara el hold en Stripe. Para tarjetas 3DS (ej: 4000 0025 0000 3155)
	// Stripe abre un iframe de desafío antes de redirigir al detalle del viaje.
	if (config.requires3DS) {
		console.log('[web-phase] Paso 6b: Detectado requires3DS — completando modal 3DS');
		const threeDS = new ThreeDSModal(page);
		await threeDS.waitForVisible();
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();
		console.log('[web-phase] Paso 6b: Modal 3DS completado exitosamente');
	}

	// ── Paso 7: Extraer tripId desde URL ─────────────────────────────────────
	console.log('[web-phase] Paso 7: Esperar redirección y extraer tripId');
	const tripId = await waitForTravelCreation(page, 30_000);
	console.log(`[web-phase] tripId: ${tripId}`);

	// ── Paso 8: Actualizar JourneyContext → ready-for-driver ─────────────────
	console.log('[web-phase] Paso 8: Marcar journey como ready-for-driver');
	await markReadyForDriver(journeyId, tripId);

	return { journeyId, tripId };
}

/**
 * Resuelve el cardLast4 correcto para una config dada.
 * Centraliza el mapeo entre GatewayFlowConfig y STRIPE_TEST_CARDS
 * para que web-phase no hardcodee strings.
 */
export function resolveCardLast4ForConfig(config: GatewayFlowConfig): string {
	if (config.gateway === 'stripe') {
		if (config.requires3DS) {
			return STRIPE_TEST_CARDS.success3DS.slice(-4); // 3155
		}
		return STRIPE_TEST_CARDS.successDirect.slice(-4);  // 4242
	}
	// Para otras pasarelas retornamos el cardLast4 que viene en el config directamente.
	return config.cardLast4;
}
