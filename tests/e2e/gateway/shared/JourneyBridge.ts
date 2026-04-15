/**
 * JourneyBridge — puente de estado entre la fase web (Playwright) y la fase mobile (Appium).
 *
 * Wrapper sobre gatewayJourneyContext.ts que expone helpers con semántica
 * específica del E2E flow en lugar de la API de bajo nivel del context store.
 *
 * El archivo JSON vive en:
 *   evidence/journey-context/<journeyId>.json
 *
 * La fase web lo crea y escribe 'ready-for-driver'.
 * La fase mobile lo lee, ejecuta el harness y escribe 'driver-completed'.
 * El spec Playwright lee el resultado final para la aserción de validación.
 */

import { randomUUID } from 'node:crypto';
import {
	writeJourneyContext,
	readJourneyContext,
	findLatestJourneyContextId,
} from '../../../features/gateway-pg/context/gatewayJourneyContext';
import type { GatewayPgJourneyContext } from '../../../features/gateway-pg/contracts/gateway-pg.types';
import type { GatewayFlowConfig, MobilePhaseResult } from './e2eFlowConfig';

// ─── Helpers internos ────────────────────────────────────────────────────────

function nowIso(): string {
	return new Date().toISOString();
}

function buildJourneyId(config: GatewayFlowConfig): string {
	// Formato: flow1-stripe-hold-no3ds-<uuid-corto>
	// Facilita identificar el journey en evidence/ sin abrir el JSON.
	const short = randomUUID().split('-')[0];
	return `flow1-${config.gateway}-${config.holdEnabled ? 'hold' : 'no-hold'}-${short}`;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Crea el contexto inicial del journey al comenzar la fase web.
 * Status: 'web-created'.
 */
export async function initJourneyContext(
	config:     GatewayFlowConfig,
	testCaseId: string,
): Promise<GatewayPgJourneyContext> {
	const journeyId = buildJourneyId(config);
	const now       = nowIso();

	const context: GatewayPgJourneyContext = {
		journeyId,
		testCaseId,
		flowType:    'carrier-web-driver-app',
		gateway:     config.gateway,
		portal:      'carrier',
		role:        'carrier',
		currentActor: 'carrier-dispatcher',
		phase:       'web_trip_creation',
		status:      'web-created',
		createdAt:   now,
		updatedAt:   now,
		sharedCardForm:          false,
		requiresMobileCompletion: true,
		requires3ds:             config.requires3DS,
		tags:                    ['@e2e', `@${config.gateway}`, config.holdEnabled ? '@hold' : '@no-hold'],
		driverHandoff: {
			actor:           'driver',
			platform:        'android',
			status:          'pending',
			appPathEnv:      'ANDROID_DRIVER_APP_PATH',
			appiumServerEnv: 'APPIUM_SERVER_URL',
		},
		validationSources:   [],
		gatewaySpecificTodos: [],
		mobileTodos:         [],
		validationTodos:     [],
		notes:               [`Config: ${config.label}`],
	};

	await writeJourneyContext(context);
	return context;
}

/**
 * Marca el journey como listo para el driver una vez que la fase web
 * creó el viaje exitosamente y extrajo el tripId.
 */
export async function markReadyForDriver(
	journeyId: string,
	tripId:    string,
): Promise<GatewayPgJourneyContext> {
	const ctx = await readJourneyContext(journeyId);

	const updated: GatewayPgJourneyContext = {
		...ctx,
		tripId,
		phase:         'driver_trip_acceptance',
		status:        'ready-for-driver',
		currentActor:  'driver',
		updatedAt:     nowIso(),
		driverHandoff: { ...ctx.driverHandoff, status: 'ready' },
	};

	await writeJourneyContext(updated);
	return updated;
}

/**
 * Escribe el resultado de la fase mobile en el journeyContext.
 * Llamado desde mobile-phase.ts al finalizar el harness.
 */
export async function markMobileCompleted(
	result: MobilePhaseResult,
): Promise<GatewayPgJourneyContext> {
	const ctx = await readJourneyContext(result.journeyId);

	const updated: GatewayPgJourneyContext = {
		...ctx,
		phase:        'payment_validation',
		status:       result.status === 'driver-completed' ? 'driver-completed' : 'failed',
		currentActor: 'carrier-dispatcher',
		updatedAt:    nowIso(),
		driverHandoff: { ...ctx.driverHandoff, status: 'completed' },
		notes: [
			...ctx.notes,
			`Driver total: ${result.totalAmount}`,
			`Payment method: ${result.paymentMethod}`,
			`Checkpoints: ${result.checkpoints.join(' → ')}`,
			...(result.errorMessage ? [`Error: ${result.errorMessage}`] : []),
		],
	};

	await writeJourneyContext(updated);
	return updated;
}

/**
 * Lee el journeyContext final para que el spec Playwright pueda asertar.
 */
export async function readFinalContext(
	journeyId: string,
): Promise<GatewayPgJourneyContext> {
	return readJourneyContext(journeyId);
}

/**
 * Retorna el journeyId más reciente en evidence/journey-context/.
 * Útil para debugging y re-ejecución de la fase mobile de forma aislada.
 */
export { findLatestJourneyContextId };
