/**
 * DRAFT — Fase WEB de TASK 2a (geocerca out-of-range).
 * Crea un VIAJE PLANO con PICKUP LEJANO al device (Reconquista 661, ~5km de Belgrano) y lo
 * ASIGNA manualmente al DRIVER DEL DEVICE ("pepe argento") — NO por nth(1), porque con pickup
 * lejano el orden por proximidad ya no pone al device driver primero (nth(1) agarra a otro).
 *
 * Correr DESPUÉS de arrancar tests/mobile/appium/scripts/driver-geocerca-out-of-range.ts (background).
 *   npx playwright test tests/e2e/create-flat-trip-far-origin.spec.ts --project=chromium --workers=1
 */
import { test, expect } from '../TestBase';
import { NewTravelPage } from '../pages/carrier';
import { loginAsDispatcher } from '../features/gateway-pg/fixtures/gateway.fixtures';

const CLIENT = 'Restrepo, Emanuel';
const ORIGIN = 'Reconquista 661, Buenos Aires, Argentina';
const DRIVER_MATCH = process.env.DRIVER_NAME_MATCH ?? 'argento'; // device driver display name

test.describe('[E2E][2a] Flat trip · far pickup · manual assign to device driver', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test('create flat trip far origin and assign to device driver', async ({ page }) => {
		// DRAFT TASK 2a (geocerca out-of-range): requiere driver-geocerca-out-of-range.ts en background + device driver "argento".
		// Sin eso rompe determinísticamente al colectarse en `pnpm test` full → gated por GEOCERCA_2A=1.
		test.fixme(
			process.env.GEOCERCA_2A !== '1',
			'DRAFT TASK 2a — requiere Appium geocerca script + device (correr con GEOCERCA_2A=1)'
		);
		test.setTimeout(160_000);
		const travel = new NewTravelPage(page);

		page.on('response', res => {
			const u = res.url();
			if (/\/travels\b/i.test(u) && res.request().method() === 'POST') {
				res.json()
					.then((body: unknown) => {
						const b = body as { id?: unknown; travelId?: unknown };
						console.log(`[web-2a] POST /travels → id=${JSON.stringify(b?.id ?? b?.travelId)}`);
					})
					.catch(() => {});
			}
		});

		await loginAsDispatcher(page);

		await test.step('Open new travel · client · far origin', async () => {
			await travel.goto();
			await travel.selectClient(CLIENT);
			await travel.setOrigin(ORIGIN);
		});

		await test.step('Select vehicle + Send Manual + assign to device driver by name', async () => {
			await travel.clickSelectVehicle();
			// Send Manual
			await page.getByRole('button', { name: /Enviar Manual|Send Manual/i }).click();
			await page.waitForTimeout(4_000);

			// Dump del modal de candidatos (evidencia)
			const candidates = await page.evaluate(() => {
				const norm = (v: unknown): string =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const texts: string[] = [];
				document
					.querySelectorAll(
						'ion-modal, .modal, [class*="assign"], [class*="candidate"], tbody tr, ion-item, .driver-row'
					)
					.forEach(el => {
						const t = norm((el as HTMLElement).innerText);
						if (t && t.length < 200) texts.push(t);
					});
				return Array.from(new Set(texts)).slice(0, 40);
			});
			console.log('[web-2a] candidatos Send-Manual:\n' + JSON.stringify(candidates, null, 2));

			// Assign en la FILA (corta) del device driver — buscar la row que contiene el nombre
			// y una acción "Asignar", NO un contenedor grande que englobe a todos los drivers.
			const clicked = await page.evaluate((match: string) => {
				const norm = (v: unknown): string =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const isAssign = (el: Element): boolean =>
					/^(asignar|assign)(\s*\(\d+\))?$/i.test(norm(el.textContent));
				const re = new RegExp(match, 'i');
				// Candidatas: filas/cards que mencionan al driver, con texto acotado (una sola fila).
				const rows = Array.from(
					document.querySelectorAll(
						'tr, ion-row, ion-item, li, [class*="row"], [class*="card"], [class*="driver"]'
					)
				)
					.filter(r => {
						const t = norm((r as HTMLElement).textContent);
						return (
							re.test(t) &&
							/asignar|assign/i.test(t) &&
							t.length < 170 &&
							(r as HTMLElement).offsetParent !== null
						);
					})
					// preferir la MÁS específica (texto más corto)
					.sort(
						(a, b) =>
							norm((a as HTMLElement).textContent).length - norm((b as HTMLElement).textContent).length
					);
				for (const row of rows) {
					const a = Array.from(
						row.querySelectorAll('button, a, [role="button"], ion-button, .btn, span, div')
					).find(el => (el as HTMLElement).offsetParent !== null && isAssign(el));
					if (a) {
						(a as HTMLElement).click();
						return `${norm(a.textContent)} | row: ${norm(row.textContent).slice(0, 110)}`;
					}
				}
				return '';
			}, DRIVER_MATCH);
			console.log(`[web-2a] assign-to-device-driver click: "${clicked}"`);
			expect(
				clicked,
				`No se encontró fila "Asignar" para el driver "${DRIVER_MATCH}". Candidatos: ${JSON.stringify(candidates)}`
			).not.toBe('');

			// Dump del diálogo que aparece TRAS clickear "Asignar" del driver lejano (evidencia).
			await page.waitForTimeout(2_000);
			const postAssignDialog = await page.evaluate(() => {
				const norm = (v: unknown): string =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const out: Array<{ sel: string; text: string; buttons: string[] }> = [];
				for (const sel of [
					'ion-alert',
					'app-confirm-modal',
					'.modal-content',
					'[class*="modal"]',
					'[role="dialog"]',
					'.swal2-popup'
				]) {
					document.querySelectorAll(sel).forEach(el => {
						if (!vis(el)) return;
						const buttons = Array.from(el.querySelectorAll('button, .alert-button, a, [role="button"]'))
							.filter(vis)
							.map(b => norm((b as HTMLElement).innerText))
							.filter(t => t.length > 0);
						const text = norm((el as HTMLElement).innerText).slice(0, 220);
						if (text || buttons.length) out.push({ sel, text, buttons });
					});
				}
				return out;
			});
			console.log('[web-2a] diálogo post-Asignar: ' + JSON.stringify(postAssignDialog));

			// Confirmar con set amplio de textos (driver lejano puede requerir confirmación de distancia).
			const confirmed = await page.evaluate(() => {
				const norm = (v: unknown): string =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const RE = /^(asignar|assign|confirmar|confirm|s[ií]|aceptar|ok|continuar|continue)$/i;
				const btns = Array.from(
					document.querySelectorAll(
						'ion-alert button, .alert-button, app-confirm-modal button, .modal-content button, [role="dialog"] button, button'
					)
				).filter(b => vis(b) && RE.test(norm(b.textContent)));
				if (btns.length) {
					(btns[btns.length - 1] as HTMLElement).click();
					return norm(btns[btns.length - 1].textContent);
				}
				return '';
			});
			console.log(`[web-2a] confirm post-Asignar click: "${confirmed}"`);
		});

		await test.step('Give backend time to push assignment to device driver', async () => {
			await page.waitForTimeout(6_000);
		});
		console.log('[web-2a] assign a device driver completado — el driver debería ver TravelConfirmPage');
	});
});
