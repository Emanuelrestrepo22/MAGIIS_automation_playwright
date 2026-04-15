/**
 * TC: E2E-FLOW1-TC001
 * Feature: E2E Flow 1 — Portal Carrier Web + Driver App Android
 * Tags: @e2e @gateway @carrier @driver @stripe @hold
 *
 * Flujo completo:
 *   [WEB]    Dispatcher crea viaje con tarjeta Stripe 4242 → hold sin 3DS
 *   [WEB]    Sistema aplica hold → redirige al detalle del viaje
 *   [MOBILE] Driver app recibe push notification del viaje
 *   [MOBILE] Driver acepta → empieza viaje → finaliza viaje → cierra resumen
 *   [WEB]    JourneyContext final: status driver-completed
 *
 * Parametrización por gateway:
 *   El test importa GATEWAY_CONFIGS — para correr con otra pasarela basta
 *   con cambiar la config que se pasa a runWebPhase. La fase mobile es
 *   independiente de la pasarela (el driver app no cambia por gateway).
 *
 * Prerequisitos del ambiente:
 *   - APPIUM_SERVER_URL definido en .env.test (ej: http://localhost:4723)
 *   - Android device/emulador con Driver App instalada y sesión activa en TEST
 *   - Carrier dispatcher con hold habilitado y tarjeta 4242 disponible
 *
 * Si el ambiente mobile no está disponible el test queda en test.fixme()
 * y la fase web sola puede validarse con la variable E2E_WEB_ONLY=true.
 */

import { spawnSync }  from 'node:child_process';
import * as path      from 'node:path';
import { test, expect } from '../../../TestBase';
import { TravelDetailPage } from '../../../pages/carrier';
import { runWebPhase }      from './web-phase';
import { readFinalContext } from '../shared/JourneyBridge';
import { GATEWAY_CONFIGS }  from '../shared/e2eFlowConfig';
import type { MobilePhaseResult } from '../shared/e2eFlowConfig';

// ─── Config del test ─────────────────────────────────────────────────────────

const FLOW_CONFIG   = GATEWAY_CONFIGS['stripe-hold-no3ds'];
const TC_ID         = 'E2E-FLOW1-TC001';
// Timeout total: fase web (60s) + espera push notification (90s) + fase mobile (180s)
const TOTAL_TIMEOUT = 360_000;

// Si el ambiente mobile no está disponible, correr solo la fase web.
const WEB_ONLY = process.env.E2E_WEB_ONLY === 'true' || !process.env.APPIUM_SERVER_URL;

// Ruta al script de la fase mobile para child process
const MOBILE_PHASE_SCRIPT = path.resolve(
	__dirname,
	'mobile-phase.ts',
);

// ─── Helper: lanzar fase mobile como child process ───────────────────────────

function runMobilePhase(journeyId: string, timeoutMs: number): MobilePhaseResult {
	console.log(`[flow1.spec] Lanzando fase mobile — journeyId: ${journeyId}`);

	const result = spawnSync(
		'npx',
		['ts-node', '--esm', MOBILE_PHASE_SCRIPT],
		{
			env: {
				...process.env,
				E2E_JOURNEY_ID:        journeyId,
				E2E_MOBILE_TIMEOUT_MS: String(timeoutMs),
			},
			timeout:  timeoutMs + 30_000, // margen extra para iniciar el proceso
			encoding: 'utf-8',
		},
	);

	// Loggear salida del proceso hijo para diagnóstico
	if (result.stdout) console.log('[mobile-phase stdout]\n', result.stdout);
	if (result.stderr) console.error('[mobile-phase stderr]\n', result.stderr);

	if (result.status !== 0) {
		throw new Error(
			`[flow1.spec] Fase mobile falló con exit code ${result.status ?? 'null'}.\n` +
			`stderr: ${result.stderr ?? '(vacío)'}`,
		);
	}

	// Extraer resultado estructurado desde stdout (línea marcada con E2E_MOBILE_RESULT:)
	const OUTPUT_MARKER = 'E2E_MOBILE_RESULT:';
	const resultLine = (result.stdout ?? '')
		.split('\n')
		.find(line => line.includes(OUTPUT_MARKER));

	if (!resultLine) {
		throw new Error(
			`[flow1.spec] No se encontró "${OUTPUT_MARKER}" en stdout de la fase mobile. ` +
			`Verificar que mobile-phase.ts completó correctamente.`,
		);
	}

	return JSON.parse(resultLine.split(OUTPUT_MARKER)[1]) as MobilePhaseResult;
}

// ─── Spec ────────────────────────────────────────────────────────────────────

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe(`[${TC_ID}] E2E Flow 1 — Carrier Web + Driver App — ${FLOW_CONFIG.label}`, () => {

	test(
		`[${TC_ID}] Alta de viaje desde carrier + driver acepta y completa el viaje`,
		async ({ page }) => {
			test.setTimeout(TOTAL_TIMEOUT);

			if (WEB_ONLY) {
				console.warn(
					'[flow1.spec] APPIUM_SERVER_URL no definido o E2E_WEB_ONLY=true. ' +
					'Ejecutando solo la fase web para validar el handoff.',
				);
			}

			let journeyId = '';
			let tripId    = '';

			// ── FASE WEB ─────────────────────────────────────────────────────────
			await test.step('[WEB] Crear viaje desde portal carrier', async () => {
				const result = await runWebPhase(page, FLOW_CONFIG, TC_ID);
				journeyId = result.journeyId;
				tripId    = result.tripId;

				console.log(`[flow1.spec] ✓ Fase web completada — tripId: ${tripId}`);
			});

			await test.step('[WEB] Validar estado del viaje — Buscando conductor', async () => {
				// El viaje debe estar en "Buscando conductor" para que el driver reciba la push.
				const detail = new TravelDetailPage(page);
				// Debería mostrar "Buscando conductor" tras hold exitoso.
				await detail.expectStatus('Buscando conductor');
			});

			// ── HANDOFF → JourneyContext escrito con status ready-for-driver ─────
			await test.step('[BRIDGE] Verificar JourneyContext ready-for-driver', async () => {
				const ctx = await readFinalContext(journeyId);
				// Debería tener el tripId extraído desde la URL.
				expect(ctx.tripId).toBe(tripId);
				// Debería estar en espera de que el driver acepte.
				expect(ctx.status).toBe('ready-for-driver');
				// El handoff al driver debería estar marcado como listo.
				expect(ctx.driverHandoff.status).toBe('ready');

				console.log(`[flow1.spec] ✓ JourneyContext listo — ${ctx.status}`);
			});

			// ── FASE MOBILE ──────────────────────────────────────────────────────
			if (WEB_ONLY) {
				test.fixme(
					true,
					'APPIUM_SERVER_URL no disponible — fase mobile omitida. ' +
					'Definir APPIUM_SERVER_URL en .env.test para correr el flow completo.',
				);
				return;
			}

			let mobileResult: MobilePhaseResult;

			await test.step('[MOBILE] Driver acepta, ejecuta y cierra el viaje', async () => {
				// Fase mobile corre como child process ts-node.
				// Timeout: 180s para la fase mobile completa (push + 4 pasos del harness).
				mobileResult = runMobilePhase(journeyId, 180_000);

				console.log(
					`[flow1.spec] ✓ Fase mobile completada — ` +
					`amount: ${mobileResult.totalAmount} | method: ${mobileResult.paymentMethod}`,
				);
			});

			// ── VALIDACIÓN FINAL ─────────────────────────────────────────────────
			await test.step('[VALIDATE] Verificar JourneyContext driver-completed', async () => {
				const finalCtx = await readFinalContext(journeyId);

				// Debería haber completado todos los checkpoints del harness.
				expect(mobileResult!.checkpoints).toContain('confirm');
				expect(mobileResult!.checkpoints).toContain('in-progress');
				expect(mobileResult!.checkpoints).toContain('resume');
				expect(mobileResult!.checkpoints).toContain('closed');

				// El estado final del journey debería ser driver-completed.
				// Debería haber alcanzado el paso de cierre del viaje.
				expect(finalCtx.status).toBe('driver-completed');

				// El método de pago debería estar informado.
				// Debería existir un total de cobro mayor que cero.
				expect(mobileResult!.paymentMethod).toBeTruthy();
				expect(mobileResult!.totalAmount).toBeTruthy();

				console.log(`[flow1.spec] ✓ Flow 1 PASS — journey ${journeyId} completado.`);
			});
		},
	);

});
