/**
 * Flow 1 — E2E Carrier Web + Driver App
 * Proyecto: e2e
 *
 * TCs cubiertos:
 *   E2E-FLOW1-TC001 — Stripe Hold ON sin 3DS  (tarjeta 4242)
 *   E2E-FLOW1-TC002 — Stripe Hold ON con 3DS  (tarjeta 3155)
 *
 * Flujo completo por TC:
 *   [WEB]    Dispatcher crea viaje con la tarjeta del config
 *   [WEB]    Si requires3DS: completa modal 3DS → success
 *   [WEB]    Sistema aplica hold → redirige al detalle → "Buscando conductor"
 *   [BRIDGE] JourneyContext escrito con status ready-for-driver
 *   [MOBILE] Driver recibe push notification → acepta → ejecuta → cierra viaje
 *   [BRIDGE] JourneyContext final: status driver-completed
 *
 * Guard WEB_ONLY:
 *   Si APPIUM_SERVER_URL no está definido o E2E_WEB_ONLY=true,
 *   la fase mobile se omite con test.fixme(). Solo corre la fase web.
 *   Útil para validar el handoff en CI sin dispositivo Android.
 *
 * Prerequisitos del ambiente (fase mobile):
 *   - APPIUM_SERVER_URL definido en .env.test (ej: http://localhost:4723)
 *   - Android device/emulador con Driver App instalada y sesión activa en TEST
 *   - Carrier dispatcher con hold habilitado
 */

import { spawnSync }                       from 'node:child_process';
import * as path                           from 'node:path';
import { fileURLToPath }                   from 'node:url';
import { test, expect }                    from '../../../TestBase';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
import { TravelDetailPage } from '../../../pages/carrier';
import { runWebPhase }      from './web-phase';
import { readFinalContext } from '../shared/JourneyBridge';
import { GATEWAY_CONFIGS }  from '../shared/e2eFlowConfig';
import type { GatewayFlowConfig, MobilePhaseResult } from '../shared/e2eFlowConfig';

// ─── Constantes ──────────────────────────────────────────────────────────────

// Timeout total: fase web (60s) + push notification (90s) + fase mobile (180s)
const TOTAL_TIMEOUT = 360_000;

// Guard: si APPIUM_SERVER_URL no está definido, solo corre la fase web.
const WEB_ONLY = process.env.E2E_WEB_ONLY === 'true' || !process.env.APPIUM_SERVER_URL;

// Ruta al entry point ts-node de la fase mobile.
const MOBILE_PHASE_SCRIPT = path.resolve(__dirname, 'mobile-phase.ts');

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
			timeout:  timeoutMs + 30_000,
			encoding: 'utf-8',
		},
	);

	if (result.stdout) console.log('[mobile-phase stdout]\n', result.stdout);
	if (result.stderr) console.error('[mobile-phase stderr]\n', result.stderr);

	if (result.status !== 0) {
		throw new Error(
			`[flow1.spec] Fase mobile falló con exit code ${result.status ?? 'null'}.\n` +
			`stderr: ${result.stderr ?? '(vacío)'}`,
		);
	}

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

// ─── Cuerpo reutilizable del flow ─────────────────────────────────────────────
// Extraído como función para que cada TC lo invoque con su propio config
// sin duplicar lógica de steps ni assertions.

function runFlow1Test(tcId: string, config: GatewayFlowConfig) {
	return async ({ page }: { page: import('@playwright/test').Page }) => {
		test.setTimeout(TOTAL_TIMEOUT);

		if (WEB_ONLY) {
			console.warn(
				`[flow1.spec][${tcId}] APPIUM_SERVER_URL no definido o E2E_WEB_ONLY=true. ` +
				'Ejecutando solo la fase web para validar el handoff.',
			);
		}

		let journeyId = '';
		let tripId    = '';

		// ── FASE WEB ───────────────────────────────────────────────────────────
		await test.step('[WEB] Crear viaje desde portal carrier', async () => {
			const result = await runWebPhase(page, config, tcId);
			journeyId = result.journeyId;
			tripId    = result.tripId;
			console.log(`[flow1.spec][${tcId}] ✓ Fase web completada — tripId: ${tripId}`);
		});

		await test.step('[WEB] Validar estado del viaje — Buscando conductor', async () => {
			const detail = new TravelDetailPage(page);
			// Debería mostrar "Buscando conductor" tras hold exitoso (con o sin 3DS).
			await detail.expectStatus('Buscando conductor');
		});

		// ── BRIDGE: JourneyContext ready-for-driver ────────────────────────────
		await test.step('[BRIDGE] Verificar JourneyContext ready-for-driver', async () => {
			const ctx = await readFinalContext(journeyId);
			// Debería tener el tripId extraído desde la URL.
			expect(ctx.tripId).toBe(tripId);
			// Debería estar en espera de que el driver acepte.
			expect(ctx.status).toBe('ready-for-driver');
			// El handoff al driver debería estar marcado como listo.
			expect(ctx.driverHandoff.status).toBe('ready');
			console.log(`[flow1.spec][${tcId}] ✓ JourneyContext listo — ${ctx.status}`);
		});

		// ── FASE MOBILE ────────────────────────────────────────────────────────
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
				`[flow1.spec][${tcId}] ✓ Fase mobile completada — ` +
				`amount: ${mobileResult.totalAmount} | method: ${mobileResult.paymentMethod}`,
			);
		});

		// ── VALIDACIÓN FINAL ───────────────────────────────────────────────────
		await test.step('[VALIDATE] Verificar JourneyContext driver-completed', async () => {
			const finalCtx = await readFinalContext(journeyId);
			// Debería haber completado todos los checkpoints del harness.
			expect(mobileResult!.checkpoints).toContain('confirm');
			expect(mobileResult!.checkpoints).toContain('in-progress');
			expect(mobileResult!.checkpoints).toContain('resume');
			expect(mobileResult!.checkpoints).toContain('closed');
			// El estado final del journey debería ser driver-completed.
			expect(finalCtx.status).toBe('driver-completed');
			// El método de pago y el monto deberían estar informados.
			expect(mobileResult!.paymentMethod).toBeTruthy();
			expect(mobileResult!.totalAmount).toBeTruthy();
			console.log(`[flow1.spec][${tcId}] ✓ Flow 1 PASS — journey ${journeyId} completado.`);
		});
	};
}

// ─── Specs ────────────────────────────────────────────────────────────────────

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

// ── TC001: Stripe Hold ON sin 3DS ─────────────────────────────────────────────

test.describe('[E2E-FLOW1-TC001] E2E Flow 1 — Carrier Web + Driver App — Stripe Hold ON sin 3DS', () => {
	test(
		'[E2E-FLOW1-TC001] Alta de viaje carrier (4242 sin 3DS) + driver acepta y completa el viaje',
		runFlow1Test('E2E-FLOW1-TC001', GATEWAY_CONFIGS['stripe-hold-no3ds']),
	);
});

// ── TC002: Stripe Hold ON con 3DS ─────────────────────────────────────────────

test.describe('[E2E-FLOW1-TC002] E2E Flow 1 — Carrier Web + Driver App — Stripe Hold ON con 3DS', () => {
	test(
		'[E2E-FLOW1-TC002] Alta de viaje carrier (3155 con 3DS) + driver acepta y completa el viaje',
		runFlow1Test('E2E-FLOW1-TC002', GATEWAY_CONFIGS['stripe-hold-3ds']),
	);
});
