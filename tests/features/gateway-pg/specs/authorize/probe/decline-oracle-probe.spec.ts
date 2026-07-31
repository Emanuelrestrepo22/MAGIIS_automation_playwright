/**
 * PROBE — ¿qué muestra MAGIIS al dar de alta una tarjeta que Authorize debe rechazar?
 * ==================================================================================
 *
 * Motivo (ver `docs/gateway-pg/authorize/RUN-LOG.md`, hallazgo 2): el oráculo negativo
 * `expectNativeCardRejected()` asserta AUSENCIA de éxito, no PRESENCIA de rechazo, porque
 * el copy real del rechazo nunca se observó. Y una aserción de ausencia es estructuralmente
 * débil: `toBeHidden()` / `not.toBeVisible()` se satisfacen con el PRIMER chequeo, así que
 * pasan de forma vacua si el cartel llega después.
 *
 * Este probe NO asserta nada de negocio: MIDE. Para cada tarjeta de decline (más el happy
 * path como CONTROL) muestrea el estado de la UI en instantes fijos desde el click en
 * "Validar" y reporta, por instante:
 *
 *   1. si el botón "Validar" está habilitado o deshabilitado,
 *   2. si el cartel "Tarjeta válida" está en el DOM y si está visible,
 *   3. el TEXTO NUEVO que apareció en la página respecto del baseline pre-click — que es
 *      el copy real del mensaje (de éxito o de rechazo), sin depender de un selector que
 *      no conocemos.
 *
 * Además registra las RESPUESTAS DE RED del alta de tarjeta. Es el discriminador directo
 * de la hipótesis 1 del RUN-LOG: si MAGIIS llama a la pasarela al dar de alta y la pasarela
 * contesta "aprobada", entonces el decline por ZIP/CVV no se manifiesta en el alta (área C)
 * sino en el cobro (área F), y el intent está mal ubicado en la matriz — no hay bug.
 *
 * ═══ POR QUÉ EL CONTROL POSITIVO ES OBLIGATORIO ═══
 *
 * Sin `HAPPY_NO_AUTH` en la misma corrida no se puede distinguir "el decline se comporta
 * como una aprobación" (hipótesis 1) de "el decline muestra algo distinto que el oráculo
 * no mira" (hipótesis 2/3). El control da la línea de base contra la cual comparar.
 *
 * ═══ SOBRE LOS PRIMITIVOS DE MEDICIÓN (leer antes de editar) ═══
 *
 * `isVisible()` / `count()` son chequeos INMEDIATOS: no esperan. Eso los hace INSERVIBLES
 * para esperar un estado, y exactamente los correctos para MUESTREAR uno en un instante
 * dado, que es lo que este probe hace. El error del RUN-LOG fue usarlos para esperar, no
 * para muestrear. Acá el tiempo lo controla el reloj del probe, no el locator.
 *
 * Tag `@probe` a propósito: fuera de `@gateway`/`@authorize`, no entra en la regresión.
 */
import type { Page } from '@playwright/test';

import { test } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { intentSupport, type CardIntent } from '@fixtures/gateways/_shared';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';

/** Instantes de muestreo, en ms desde el click en "Validar". */
const SAMPLE_AT_MS = [2_000, 5_000, 10_000, 15_000, 20_000, 30_000] as const;

/**
 * Los 3 intents bajo sospecha + el happy path como control positivo.
 * El orden importa: el control va PRIMERO para tener la línea de base antes de los declines.
 */
const INTENTS_UNDER_OBSERVATION: readonly { intent: CardIntent; role: 'control' | 'decline' }[] = [
	{ intent: 'HAPPY_NO_AUTH', role: 'control' },
	{ intent: 'DECLINE_AUTHORIZE', role: 'decline' },
	{ intent: 'DECLINE_INVALID_CVC', role: 'decline' },
	{ intent: 'DECLINE_PREPAID_ZERO_BALANCE', role: 'decline' }
];

/** Texto visible de la página, por líneas no vacías — baseline y muestras se comparan así. */
async function visibleLines(page: Page): Promise<string[]> {
	const raw = await page.evaluate(() => document.body.innerText ?? '').catch(() => '');
	return raw
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

/** Líneas presentes en `now` que no estaban en `baseline` — el copy que APARECIÓ. */
function newLines(baseline: readonly string[], now: readonly string[]): string[] {
	const before = new Set(baseline);
	return now.filter(line => !before.has(line));
}

test.describe('[PROBE] oráculo de decline de Authorize en el alta de tarjeta @probe', () => {
	test.describe.configure({ mode: 'serial', timeout: 300_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	for (const { intent, role } of INTENTS_UNDER_OBSERVATION) {
		const support = intentSupport('authorize', intent);
		const etiqueta = support.supported ? `•••• ${support.card.last4}` : 'N/A';

		test(`@probe ${role.toUpperCase()} ${intent} (${etiqueta})`, async ({ page }) => {
			if (!support.supported) {
				console.log(`[PROBE][DECLINE-ORACLE] ${intent} → N/A en la matriz: ${support.reason}`);
				return;
			}

			const adapter = getGatewayPgAdapter('authorize');
			const defaults = adapter.journeyDefaults;
			const card = support.card;

			// ── Captura de red: qué le contesta el backend/pasarela al alta de tarjeta ──
			// Es el discriminador de la hipótesis 1 (¿la pasarela aprueba el alta?).
			const netLog: string[] = [];
			let clickedAtMs = 0;
			page.on('response', response => {
				const request = response.request();
				if (request.method() === 'GET') return;
				const url = response.url();
				if (!/card|payment|token|valid|authorize|odn/i.test(url)) return;
				const offset = clickedAtMs ? Date.now() - clickedAtMs : 0;
				void response
					.text()
					.then(body => netLog.push(`t+${offset}ms ${request.method()} ${response.status()} ${url}\n      body: ${body.slice(0, 600)}`))
					.catch(() => netLog.push(`t+${offset}ms ${request.method()} ${response.status()} ${url} (body no legible)`));
			});

			await loginAsDispatcher(page, { gateway: 'authorize' });

			// Todas las tarjetas de Authorize comparten el PAN 4111…1111: sin este cleanup el
			// alta puede fallar por "tarjeta ya vinculada" y ese error se confundiría con un
			// rechazo de la pasarela (confusor documentado en el RUN-LOG, ronda 2).
			await cleanupGatewayCardByLast4(page, defaults.paxSearchQueries, card.last4);

			const dashboard = new CarrierDashboardPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(defaults.walletClient);
			await travel.setDestination(defaults.walletDestination);
			await travel.selectPaymentMethod('Preautorizada');
			await cardFormFor('authorize').fill(page, card);

			const validar = page.getByRole('button', { name: /^(Valid|Validar)$/i });
			const exito = page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first();

			const enabledPreClick = await validar.isEnabled();
			console.log(
				`\n[PROBE][DECLINE-ORACLE] ═══ ${intent} (${role}) — PAN ${card.number} · CVV ${card.cvc} · ZIP ${card.zip ?? '—'} ═══`
			);
			console.log(`[PROBE][DECLINE-ORACLE] pre-click: "Validar" habilitado = ${enabledPreClick}`);
			if (!enabledPreClick) {
				console.log('[PROBE][DECLINE-ORACLE] el form NO habilita el submit (validación de front). Fin del caso.');
				return;
			}

			const baseline = await visibleLines(page);
			const t0 = Date.now();
			clickedAtMs = t0;
			await validar.click();

			// ── Muestreo temporal ──────────────────────────────────────────────
			console.log('[PROBE][DECLINE-ORACLE] muestreo | t(ms) | Validar | éxito en DOM | éxito visible | texto nuevo');
			for (const at of SAMPLE_AT_MS) {
				const espera = at - (Date.now() - t0);
				if (espera > 0) await page.waitForTimeout(espera); // reloj del probe: se MIDE en t fijos, no se espera un estado

				const [habilitado, enDom, visible, ahora] = await Promise.all([
					validar.isEnabled().catch(() => null),
					exito.count().catch(() => -1),
					exito.isVisible().catch(() => null),
					visibleLines(page)
				]);
				const nuevo = newLines(baseline, ahora);
				console.log(
					`[PROBE][DECLINE-ORACLE]   t+${at} | Validar=${habilitado === null ? '?' : habilitado ? 'enabled' : 'DISABLED'} | ` +
						`éxito DOM=${enDom} | éxito visible=${visible} | nuevo=${nuevo.length ? JSON.stringify(nuevo) : '—'}`
				);
			}

			// ── Dump final del texto de la página ──────────────────────────────
			const finales = await visibleLines(page);
			console.log(`[PROBE][DECLINE-ORACLE] texto NUEVO al final: ${JSON.stringify(newLines(baseline, finales))}`);
			console.log(`[PROBE][DECLINE-ORACLE] respuestas de red del alta (${netLog.length}):`);
			for (const line of netLog) console.log(`[PROBE][DECLINE-ORACLE]   ${line}`);
		});
	}
});
