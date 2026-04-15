/**
 * Flow 3 — E2E Contractor Web + Driver App
 * Proyecto: e2e
 *
 * TCs cubiertos:
 *   E2E-FLOW3-TC001 — Stripe Hold ON sin 3DS  (colaborador, tarjeta 4242)
 *   E2E-FLOW3-TC002 — Stripe Hold ON con 3DS  (colaborador, tarjeta 3155)
 *
 * Flujo completo por TC:
 *   [WEB]    Colaborador login en portal contractor
 *   [WEB]    Crea viaje con la tarjeta del config
 *   [WEB]    Si requires3DS: completa modal 3DS → success
 *   [WEB]    Sistema aplica hold → redirige al detalle → "Buscando conductor"
 *   [BRIDGE] JourneyContext escrito con status ready-for-driver
 *   [MOBILE] Driver recibe push notification → acepta → ejecuta → cierra viaje
 *   [BRIDGE] JourneyContext final: status driver-completed
 *
 * Diferencia vs Flow 1:
 *   - Login: loginAsContractor (portal contractor) en lugar de loginAsDispatcher
 *   - Fase mobile: idéntica — el driver recibe la misma push sin importar el portal origen
 *
 * Guard WEB_ONLY:
 *   Si APPIUM_SERVER_URL no está definido o E2E_WEB_ONLY=true,
 *   la fase mobile se omite con test.fixme(). Útil para validar solo
 *   la fase web contractor sin dispositivo Android.
 *
 * Prerequisitos del ambiente (fase mobile):
 *   - APPIUM_SERVER_URL definido en .env.test
 *   - Android device con Driver App instalada y sesión activa en TEST
 *   - Colaborador con hold habilitado en portal contractor TEST
 */

import { spawnSync }    from 'node:child_process';
import * as path        from 'node:path';
import { test, expect } from '../../../TestBase';
import { TravelDetailPage } from '../../../pages/carrier';
import { runWebPhase }      from './web-phase';
import { readFinalContext } from '../shared/JourneyBridge';
import { GATEWAY_CONFIGS }  from '../shared/e2eFlowConfig';
import type { GatewayFlowConfig, MobilePhaseResult } from '../shared/e2eFlowConfig';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TOTAL_TIMEOUT = 360_000;
const WEB_ONLY = process.env.E2E_WEB_ONLY === 'true' || !process.env.APPIUM_SERVER_URL;
const MOBILE_PHASE_SCRIPT = path.resolve(__dirname, 'mobile-phase.ts');

// ─── Helper: lanzar fase mobile como child process ───────────────────────────

function runMobilePhase(journeyId: string, timeoutMs: number): MobilePhaseResult {
	console.log(`[flow3.spec] Lanzando fase mobile — journeyId: ${journeyId}`);

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
			`[flow3.spec] Fase mobile falló con exit code ${result.status ?? 'null'}.\n` +
			`stderr: ${result.stderr ?? '(vacío)'}`,
		);
	}

	const OUTPUT_MARKER = 'E2E_MOBILE_RESULT:';
	const resultLine = (result.stdout ?? '')
		.split('\n')
		.find(line => line.includes(OUTPUT_MARKER));

	if (!resultLine) {
		throw new Error(
			`[flow3.spec] No se encontró "${OUTPUT_MARKER}" en stdout de la fase mobile.`,
		);
	}

	return JSON.parse(resultLine.split(OUTPUT_MARKER)[1]) as MobilePhaseResult;
}

// ─── Cuerpo reutilizable del flow ─────────────────────────────────────────────

function runFlow3Test(tcId: string, config: GatewayFlowConfig) {
	return async ({ page }: { page: import('@playwright/test').Page }) => {
		test.setTimeout(TOTAL_TIMEOUT);

		if (WEB_ONLY) {
			console.warn(
				`[flow3.spec][${tcId}] APPIUM_SERVER_URL no definido o E2E_WEB_ONLY=true. ` +
				'Ejecutando solo la fase web para validar el handoff.',
			);
		}

		let journeyId = '';
		let tripId    = '';

		// ── FASE WEB ───────────────────────────────────────────────────────────
		await test.step('[WEB] Crear viaje desde portal contractor', async () => {
			const result = await runWebPhase(page, config, tcId);
			journeyId = result.journeyId;
			tripId    = result.tripId;
			console.log(`[flow3.spec][${tcId}] ✓ Fase web completada — tripId: ${tripId}`);
		});

		await test.step('[WEB] Validar estado del viaje — Buscando conductor', async () => {
			const detail = new TravelDetailPage(page);
			// Debería mostrar "Buscando conductor" tras hold exitoso (con o sin 3DS).
			await detail.expectStatus('Buscando conductor');
		});

		// ── BRIDGE: JourneyContext ready-for-driver ────────────────────────────
		await test.step('[BRIDGE] Verificar JourneyContext ready-for-driver', async () => {
			const ctx = await readFinalContext(journeyId);
			expect(ctx.tripId).toBe(tripId);
			expect(ctx.status).toBe('ready-for-driver');
			expect(ctx.driverHandoff.status).toBe('ready');
			console.log(`[flow3.spec][${tcId}] ✓ JourneyContext listo — ${ctx.status}`);
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
			mobileResult = runMobilePhase(journeyId, 180_000);
			console.log(
				`[flow3.spec][${tcId}] ✓ Fase mobile completada — ` +
				`amount: ${mobileResult.totalAmount} | method: ${mobileResult.paymentMethod}`,
			);
		});

		// ── VALIDACIÓN FINAL ───────────────────────────────────────────────────
		await test.step('[VALIDATE] Verificar JourneyContext driver-completed', async () => {
			const finalCtx = await readFinalContext(journeyId);
			expect(mobileResult!.checkpoints).toContain('confirm');
			expect(mobileResult!.checkpoints).toContain('in-progress');
			expect(mobileResult!.checkpoints).toContain('resume');
			expect(mobileResult!.checkpoints).toContain('closed');
			expect(finalCtx.status).toBe('driver-completed');
			expect(mobileResult!.paymentMethod).toBeTruthy();
			expect(mobileResult!.totalAmount).toBeTruthy();
			console.log(`[flow3.spec][${tcId}] ✓ Flow 3 PASS — journey ${journeyId} completado.`);
		});
	};
}

// ─── Specs ────────────────────────────────────────────────────────────────────

test.use({ role: 'contractor', storageState: { cookies: [], origins: [] } });

// ── TC001: Contractor Stripe Hold ON sin 3DS ──────────────────────────────────

test.describe('[E2E-FLOW3-TC001] E2E Flow 3 — Contractor Web + Driver App — Stripe Hold ON sin 3DS', () => {
	test(
		'[E2E-FLOW3-TC001] Alta de viaje contractor (4242 sin 3DS) + driver acepta y completa el viaje',
		runFlow3Test('E2E-FLOW3-TC001', GATEWAY_CONFIGS['contractor-stripe-hold-no3ds']),
	);
});

// ── TC002: Contractor Stripe Hold ON con 3DS ──────────────────────────────────

test.describe('[E2E-FLOW3-TC002] E2E Flow 3 — Contractor Web + Driver App — Stripe Hold ON con 3DS', () => {
	test(
		'[E2E-FLOW3-TC002] Alta de viaje contractor (3155 con 3DS) + driver acepta y completa el viaje',
		runFlow3Test('E2E-FLOW3-TC002', GATEWAY_CONFIGS['contractor-stripe-hold-3ds']),
	);
});
