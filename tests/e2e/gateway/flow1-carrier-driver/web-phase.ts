/**
 * web-phase.ts — Fase web del E2E Flow 1 (Carrier Web + Driver App).
 *
 * Responsabilidades:
 *   1. Login como dispatcher en el portal carrier.
 *   2. Validar que el hold esté habilitado según la config del flow.
 *   3. Crear el viaje (fillMinimum + clickSelectVehicle + clickSendService).
 *   4. Extraer el tripId desde la URL de redirección.
 *   5. Escribir el JourneyContext con status 'ready-for-driver'.
 *   6. Retornar journeyId y tripId al spec orquestador.
 *
 * No ejecuta assertions de Playwright — las assertions viven en el spec.
 * Este módulo solo encapsula los pasos de negocio para que el spec sea legible.
 */

import type { Page } from '@playwright/test';
import {
	DashboardPage,
	NewTravelPage,
	OperationalPreferencesPage,
} from '../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../features/gateway-pg/fixtures/gateway.fixtures';
import { initJourneyContext, markReadyForDriver } from '../shared/JourneyBridge';
import type { GatewayFlowConfig } from '../shared/e2eFlowConfig';

export type WebPhaseResult = {
	journeyId: string;
	tripId:    string;
};

function extractTripId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) {
		throw new Error(`[web-phase] No se pudo extraer el tripId desde URL: ${url}`);
	}
	return match[1];
}

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
	// Si hay 3DS (config.requires3DS) el spec debe completar el modal antes
	// de llamar a runWebPhase, o bien manejarlo aquí si se pasa la instancia.
	// Para simplicity en Flow 1 happy path usamos tarjeta 4242 sin 3DS.
	console.log('[web-phase] Paso 6: Enviar viaje (submit)');
	await travel.submit();

	// ── Paso 7: Extraer tripId desde URL ─────────────────────────────────────
	console.log('[web-phase] Paso 7: Esperar redirección y extraer tripId');
	await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 30_000 });
	const tripId = extractTripId(page.url());
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
