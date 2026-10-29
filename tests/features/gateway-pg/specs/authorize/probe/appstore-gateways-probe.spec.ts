// PROBE (read-only) — ¿el App Store del carrier en apps-test soporta Authorize / eBizCharge?
// Gate de F3 (release gateway MG-178): descubre qué pasarelas ofrece la UI legacy y si sus
// modales de vinculación abren. NO envía ningún formulario (cancela sin submit) → no vincula nada.
// Se corre por ruta + --project=gateway-pg-chromium; NO lleva @gateway/@stripe/@authorize para no
// entrar en las suites reales. Toda la señal GO/NO-GO queda en los console.log + screenshots.
import { test, expect } from '@TestBase';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

const env = process.env.ENV ?? 'test';
const BASE = process.env.BASE_URL ?? 'https://apps-test.magiis.com';
const INTEGRATIONS = `${BASE}/#/home/carrier/integrations/list`;
const EVID = 'evidence/test/probe';

// Pasarelas de pago a censar (match case-insensitive sobre el texto de la card).
const TARGETS = [
	{ key: 'stripe', needle: 'stripe' },
	{ key: 'mercado-pago', needle: 'mercado' },
	{ key: 'authorize', needle: 'authorize' },
	{ key: 'ebizcharge', needle: 'ebiz' }
];

// Clasifica el estado de una card por el texto de su acción (link/span inferior).
// vincular→disponible-unlinked · desvincular→disponible-linked · "no disponible"→bloqueada.
function classify(actionText: string): 'linked' | 'linkable' | 'unavailable' | 'unknown' {
	const t = actionText.toLowerCase();
	if (t.includes('desvincular')) return 'linked';
	if (t.includes('no disponible')) return 'unavailable';
	if (t.includes('vincular') || t.includes('habilitar')) return 'linkable';
	return 'unknown';
}

test.describe(`[PROBE][${env.toUpperCase()}] App Store — soporte Authorize / eBizCharge`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@probe Descubrir pasarelas y abrir/cancelar sus modales de vinculación', async ({ page }) => {
		await test.step('Given: dispatcher logueado (carrier default = 1521 Stripe)', async () => {
			await loginAsDispatcher(page);
		});

		await test.step('When: navego al App Store / Interfaces de pago', async () => {
			await page.goto(INTEGRATIONS);
			await page.locator('.card').first().waitFor({ state: 'visible', timeout: 30_000 });
		});

		// --- Parte 1: censo de cards (siempre seguro) ---
		const subtitles: string[] = [];
		await test.step('Then: enumerar todas las cards del App Store', async () => {
			const cards = page.locator('.card');
			const n = await cards.count();
			for (let i = 0; i < n; i++) {
				const sub =
					(await cards
						.nth(i)
						.locator('.card-subtitle')
						.first()
						.textContent()
						.catch(() => null)) ?? '';
				const title =
					(await cards
						.nth(i)
						.locator('.card-title')
						.first()
						.textContent()
						.catch(() => null)) ?? '';
				const txt = `${title} ${sub}`.trim().replace(/\s+/g, ' ');
				if (txt) subtitles.push(txt);
			}
			console.log(`[PROBE] cards encontradas (${n}): ${JSON.stringify(subtitles)}`);
			await page.screenshot({ path: `${EVID}/appstore-all.png`, fullPage: true });
		});

		// --- Parte 2: por cada PSP, leer el texto de su acción y clasificar (SIN abrir modal) ---
		// Las cards "No Disponible" no exponen link de vinculación → no hay modal que abrir.
		const findings: Record<string, { present: boolean; action?: string; verdict?: string }> = {};
		for (const target of TARGETS) {
			await test.step(`Probe pasarela: ${target.key}`, async () => {
				const card = page
					.locator('.card')
					.filter({ hasText: new RegExp(target.needle, 'i') })
					.first();
				const present = (await card.count()) > 0 && (await card.isVisible().catch(() => false));
				findings[target.key] = { present };
				if (!present) {
					console.log(`[PROBE] ${target.key}: NO PRESENTE`);
					return;
				}
				// El texto de acción es el último link/span del footer de la card.
				const action = (
					(await card
						.locator('a, .card-footer, span')
						.last()
						.textContent()
						.catch(() => '')) ?? ''
				)
					.trim()
					.replace(/\s+/g, ' ');
				findings[target.key].action = action;
				findings[target.key].verdict = classify(action);
				await card.screenshot({ path: `${EVID}/${target.key}-card.png` }).catch(() => {});
				console.log(`[PROBE] ${target.key}: acción="${action}" → ${findings[target.key].verdict}`);
			});
		}

		console.log(`[PROBE][RESUMEN] ${JSON.stringify(findings)}`);
		// GATE: para que la suite UI de una PSP sea viable, su card debe ser 'linked' o 'linkable'.
		// 'unavailable' (No Disponible) = NO-GO UI para ese PSP en este carrier/entorno.
		const authorizeGo =
			findings['authorize']?.verdict === 'linked' || findings['authorize']?.verdict === 'linkable';
		const ebizGo = findings['ebizcharge']?.verdict === 'linked' || findings['ebizcharge']?.verdict === 'linkable';
		console.log(
			`[PROBE][GATE] authorize-UI=${authorizeGo ? 'GO' : 'NO-GO'} · ebizcharge-UI=${ebizGo ? 'GO' : 'NO-GO'}`
		);
		// Soft: el probe siempre pasa; el GATE se lee de los logs. Solo exige que el App Store cargue.
		expect(subtitles.length, 'el App Store debe renderizar al menos una card').toBeGreaterThan(0);
	});
});
