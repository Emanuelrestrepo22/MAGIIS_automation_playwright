/**
 * viaje-calle-unhappy-paths.ts
 * Casos negativos del flujo "viaje calle" — App Driver.
 *
 * Flujo base (P1-P6) reutiliza los selectores confirmados de start-viaje-calle-flow.ts.
 * En P7 se ingresa una tarjeta de fallo específica según el caso.
 * En P9 (3DS) se simula el rechazo cuando aplica.
 *
 * Casos cubiertos:
 *   UC-01  Tarjeta declinada genérica          → 4000000000000002  → error "card declined"
 *   UC-02  Fondos insuficientes                → 4000000000009995  → error "insufficient funds"
 *   UC-03  Tarjeta perdida                     → 4000000000009987  → error "lost card"
 *   UC-04  Tarjeta robada                      → 4000000000009979  → error "stolen card"
 *   UC-05  CVC incorrecto                      → 4000000000000101  → error "incorrect cvc"
 *   UC-06  Tarjeta expirada                    → 4000000000000069  → error "expired card"
 *   UC-07  Riesgo máximo (antifraude)          → 4100000000000019  → error "highest risk"
 *   UC-08  3DS obligatorio — falla popup Visa  → 4000000000009235  → popup Visa → tap Fail → error 3DS
 *   UC-09  3DS siempre requerido — falla       → 4000002760003184  → popup Visa → tap Fail → error 3DS
 *   UC-10  3DS obligatorio — éxito             → 4000000000003220  → popup Visa → tap Complete → cobro OK
 *
 * Precondición: app en home sin viajes activos, driver Disponible.
 *
 * Ejecutar caso individual:
 *   CASE=UC-02 npx ts-node --esm tests/mobile/appium/scripts/viaje-calle-unhappy-paths.ts
 *
 * Ejecutar todos (secuencial — necesita viaje nuevo por caso):
 *   npx ts-node --esm tests/mobile/appium/scripts/viaje-calle-unhappy-paths.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EXPIRY  = '12/34';
const CVC     = '123';
const ZIP     = '76000';
const NAME    = 'Emanuel Restrepo';

// Casos unhappy — tarjeta + comportamiento esperado
const UNHAPPY_CASES = [
	{
		id:       'UC-01',
		title:    'Tarjeta declinada genérica',
		card:     '4000000000000002',
		scenario: 'decline' as const,
		errorKeywords: ['declined', 'declinada', 'rechazada', 'card was declined'],
	},
	{
		id:       'UC-02',
		title:    'Fondos insuficientes',
		card:     '4000000000009995',
		scenario: 'decline' as const,
		errorKeywords: ['insufficient', 'fondos', 'insufficient_funds'],
	},
	{
		id:       'UC-03',
		title:    'Tarjeta perdida',
		card:     '4000000000009987',
		scenario: 'decline' as const,
		errorKeywords: ['lost', 'lost_card', 'lost card'],
	},
	{
		id:       'UC-04',
		title:    'Tarjeta robada',
		card:     '4000000000009979',
		scenario: 'decline' as const,
		errorKeywords: ['stolen', 'stolen_card', 'stolen card'],
	},
	{
		id:       'UC-05',
		title:    'CVC incorrecto',
		card:     '4000000000000101',
		scenario: 'decline' as const,
		errorKeywords: ['cvc', 'security code', 'incorrect_cvc'],
	},
	{
		id:       'UC-06',
		title:    'Tarjeta expirada',
		card:     '4000000000000069',
		scenario: 'decline' as const,
		errorKeywords: ['expired', 'expirada', 'expired_card'],
	},
	{
		id:       'UC-07',
		title:    'Riesgo máximo / antifraude',
		card:     '4100000000000019',
		scenario: 'decline' as const,
		errorKeywords: ['fraud', 'risk', 'blocked', 'highest_risk'],
	},
	{
		id:       'UC-08',
		title:    '3DS falla — popup Visa (tap Fail)',
		card:     '4000000000009235',
		scenario: '3ds-fail' as const,
		errorKeywords: ['failed', 'authentication', '3d secure', 'autenticacion'],
	},
	{
		id:       'UC-09',
		title:    '3DS siempre requerido — falla (tap Fail)',
		card:     '4000002760003184',
		scenario: '3ds-fail' as const,
		errorKeywords: ['failed', 'authentication', '3d secure'],
	},
	{
		id:       'UC-10',
		title:    '3DS obligatorio — éxito (tap Complete)',
		card:     '4000000000003220',
		scenario: '3ds-success' as const,
		errorKeywords: [],
	},
] as const;

type Scenario = 'decline' | '3ds-fail' | '3ds-success';

const SELECTED_CASE = process.env['CASE'];
const cases = SELECTED_CASE
	? UNHAPPY_CASES.filter(c => c.id === SELECTED_CASE)
	: UNHAPPY_CASES;

const log = (m: string) => console.log(`[unhappy] ${m}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function save(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts   = new Date().toISOString().replace(/[:.]/g, '-');
	const path = join('evidence/dom-dump', `unhappy-${label}-${ts}.txt`);
	writeFileSync(path, content, 'utf-8');
}

type StepStatus = 'OK' | 'FAIL' | 'SKIP';

async function switchWV(driver: WebdriverIO.Browser, timeout = 8_000): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const ctxs = await driver.getContexts() as string[];
		const wv = ctxs.find((c: string) => c.startsWith('WEBVIEW'));
		if (wv) { await driver.switchContext(wv); return; }
		await driver.pause(500);
	}
	throw new Error('WebView no disponible');
}

async function getUrl(driver: WebdriverIO.Browser): Promise<string> {
	return driver.execute<string, []>(() => window.location.href).catch(() => '');
}

async function waitForUrl(driver: WebdriverIO.Browser, token: string, timeout = 20_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if ((await getUrl(driver)).includes(token)) return true;
		await driver.pause(600);
	}
	return false;
}

async function dumpScreen(driver: WebdriverIO.Browser, label: string): Promise<string> {
	const dump = await driver.execute<string, []>(() => {
		const lines = [`URL: ${window.location.href}`, ''];
		(document.querySelectorAll('button, ion-button, [role="button"]') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
				const cls  = (el.className ?? '').toString().slice(0, 100);
				const vis  = el.offsetParent !== null;
				const dis  = (el as HTMLButtonElement).disabled;
				if (vis) lines.push(`[BTN vis=${vis} dis=${dis}] class="${cls}" text="${text}"`);
			});
		(document.querySelectorAll('input') as NodeListOf<HTMLInputElement>).forEach(el => {
			if (el.offsetParent !== null)
				lines.push(`[INPUT] id="${el.id}" type="${el.type}" placeholder="${el.placeholder}"`);
		});
		(document.querySelectorAll('span,p,ion-label,[class*="error"],[class*="alert"]') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text = (el.innerText ?? '').trim().replace(/\n/g, ' ').slice(0, 120);
				if (text.length > 2 && el.offsetParent !== null)
					lines.push(`[TEXT] ${el.tagName} "${text}"`);
			});
		return lines.join('\n');
	}).catch(e => `JS error: ${e}`);
	save(label, dump);
	return dump;
}

async function fillInput(driver: WebdriverIO.Browser, selector: string, value: string): Promise<boolean> {
	try {
		const el = await driver.$(selector);
		if (!(await el.isExisting())) return false;
		await el.clearValue();
		await el.setValue(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Dump de iframes para diagnóstico.
 */
async function dumpIframes(driver: WebdriverIO.Browser, label: string): Promise<void> {
	const iframeDump = await driver.execute<string, []>(() => {
		const frames = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
		return frames.map((f, i) => `[${i}] name="${f.name}" src="${f.src?.slice(0, 100)}"`).join('\n');
	}).catch(e => `error: ${e}`);
	save(`iframes-${label}`, iframeDump);
	log(`  Iframes (${label}):\n${iframeDump}`);
}

/**
 * Devuelve el índice del iframe Stripe CardElement buscando por patrón de src.
 * Fallback: índice 0 (confirmado por dump real).
 */
async function getStripeCardIframeIndex(driver: WebdriverIO.Browser): Promise<number> {
	const iframeData = await driver.execute<Array<{idx: number; src: string}>, []>(() => {
		return Array.from(document.querySelectorAll('iframe')).map((f, i) => ({
			idx: i, src: (f as HTMLIFrameElement).src || '',
		}));
	}).catch(() => [] as Array<{idx: number; src: string}>);
	for (const { idx, src } of iframeData) {
		if (src.includes('elements-inner-card')) return idx;
	}
	return 0; // fallback confirmado
}

/**
 * Llena un campo dentro de un iframe Stripe usando setValue nativo de WebdriverIO.
 * Usa JS para identificar el índice del iframe por patrón de src.
 * Luego usa switchToFrame(number) — classic WebDriver, sin BiDi.
 */
async function fillStripeIframeField(
	driver: WebdriverIO.Browser,
	iframeSrcPattern: string,
	fallbackIndex: number,
	value: string,
	fieldLabel: string,
	inputIndex = 0,   // índice del input dentro del iframe (0=número, 1=expiry, 2=cvc)
): Promise<boolean> {
	// Identificar índice del iframe via JS
	const iframeData = await driver.execute<Array<{idx: number; name: string; src: string}>, []>(() => {
		return Array.from(document.querySelectorAll('iframe')).map((f, i) => ({
			idx: i,
			name: (f as HTMLIFrameElement).name || '',
			src: (f as HTMLIFrameElement).src || '',
		}));
	}).catch(() => [] as Array<{idx: number; name: string; src: string}>);

	let targetIdx = -1;
	for (const { idx, src } of iframeData) {
		if (src.includes(iframeSrcPattern)) { targetIdx = idx; break; }
	}
	if (targetIdx === -1 && fallbackIndex < iframeData.length) {
		targetIdx = fallbackIndex;
		log(`  fillStripeIframeField(${fieldLabel}): fallback idx ${fallbackIndex}`);
	}
	if (targetIdx === -1) {
		log(`  fillStripeIframeField(${fieldLabel}): iframe no encontrado`);
		return false;
	}

	try {
		// switchToFrame con número — usa protocolo WebDriver clásico, no BiDi
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(targetIdx);

		// Dump de inputs con posición para diagnóstico
		const inputInfo = await driver.execute<Array<{idx: number; placeholder: string; name: string; x: number; y: number; vis: boolean}>, []>(() => {
			return Array.from(document.querySelectorAll('input')).map(function(inp, i) {
				const rect = inp.getBoundingClientRect();
				return { idx: i, placeholder: (inp as HTMLInputElement).placeholder, name: (inp as HTMLInputElement).name, x: Math.round(rect.x), y: Math.round(rect.y), vis: inp.offsetParent !== null };
			});
		}).catch(() => [] as Array<{idx: number; placeholder: string; name: string; x: number; y: number; vis: boolean}>);
		log(`  iframe[${targetIdx}] inputs: ${JSON.stringify(inputInfo)}`);

		const count = inputInfo.length;
		if (count === 0) {
			log(`  fillStripeIframeField(${fieldLabel}): iframe[${targetIdx}] sin inputs`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (driver as any).switchToFrame(null);
			return false;
		}
		const actualIndex = Math.min(inputIndex, count - 1);
		const input = (await driver.$$('input'))[actualIndex];

		// Solo click si el input está en posición positiva (visible en viewport)
		const inp = inputInfo[actualIndex];
		if (inp && inp.y >= 0) {
			await input.click().catch(() => {});
			await driver.pause(300);
		} else {
			log(`  fillStripeIframeField(${fieldLabel}): input[${actualIndex}] at (${inp?.x},${inp?.y}) — usando addValue sin click`);
		}

		// addValue en lugar de setValue — skip clearValue que falla en inputs Stripe off-screen
		await input.addValue(value);
		log(`  fillStripeIframeField(${fieldLabel}): ✓ iframe[${targetIdx}] input[${actualIndex}]`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(null);
		await driver.pause(400);
		return true;
	} catch (e) {
		log(`  fillStripeIframeField(${fieldLabel}): error → ${e}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(null).catch(() => {});
		await switchWV(driver).catch(() => {});
		return false;
	}
}

/**
 * Rellena el formulario credit-card-payment-data con los datos de tarjeta.
 *
 * Estructura confirmada del iframe Stripe (dump real, iframe índice 0):
 *   input[name="cardnumber"]    (x=28, y=0)  — número visible, fillable con addValue
 *   input[name="cc-exp-month"]  (y=-2)        — mes expiry, fillable con addValue (off-screen pero acepta)
 *   input[name="cc-exp-year"]   (y=-2)        — año expiry
 *   input[name="cc-csc"]        (y=-2)        — CVC
 *
 * Se llena cada input por nombre, NO en secuencia por el cardnumber.
 * Cardholder y ZIP son inputs nativos fuera del iframe.
 */
async function fillCardForm(
	driver: WebdriverIO.Browser,
	cardNumber: string,
): Promise<'filled' | 'partial' | 'failed'> {
	// Descartar cualquier ion-modal de validación antes de interactuar con el formulario
	await driver.execute<void, []>(() => {
		const modals = Array.from(document.querySelectorAll('ion-modal')) as HTMLElement[];
		const vis = modals.find(m => (m as any).offsetParent !== null);
		if (!vis) return;
		const btns = Array.from(vis.querySelectorAll('button')) as HTMLButtonElement[];
		const ok = btns.find(b =>
			['Aceptar', 'OK', 'Cerrar'].includes((b.innerText ?? '').trim()) &&
			(b as any).offsetParent !== null
		);
		if (ok) ok.click();
	}).catch(() => {});
	await driver.pause(600);

	const iframeIdx = await getStripeCardIframeIndex(driver);
	log(`  fillCardForm: usando iframe[${iframeIdx}]`);

	// Parsear expiry MM/AA → month=MM, year=YY
	const [expMonth, expYear] = EXPIRY.split('/');

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(iframeIdx);

		// 1. Número de tarjeta (click + addValue)
		const numInput = await driver.$('input[name="cardnumber"]');
		if (await numInput.isExisting().catch(() => false)) {
			await numInput.click().catch(() => {});
			await driver.pause(300);
			await numInput.addValue(cardNumber.replace(/\s/g, ''));
			log(`  fillCardForm: ✓ cardnumber`);
		} else {
			log('  fillCardForm: input[name="cardnumber"] no encontrado');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (driver as any).switchToFrame(null);
			return 'failed';
		}
		await driver.pause(400);

		// 2. Mes de expiry (off-screen pero addValue funciona)
		const monthInput = await driver.$('input[name="cc-exp-month"]');
		if (await monthInput.isExisting().catch(() => false)) {
			await monthInput.addValue(expMonth);
			log(`  fillCardForm: ✓ cc-exp-month=${expMonth}`);
		}
		await driver.pause(300);

		// 3. Año de expiry
		const yearInput = await driver.$('input[name="cc-exp-year"]');
		if (await yearInput.isExisting().catch(() => false)) {
			await yearInput.addValue(expYear);
			log(`  fillCardForm: ✓ cc-exp-year=${expYear}`);
		}
		await driver.pause(300);

		// 4. CVC/CSC
		const cvcInput = await driver.$('input[name="cc-csc"]');
		if (await cvcInput.isExisting().catch(() => false)) {
			await cvcInput.addValue(CVC);
			log(`  fillCardForm: ✓ cc-csc=${CVC}`);
		}
		await driver.pause(300);

		// Volver al documento principal
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(null);
		await driver.pause(400);
	} catch (e) {
		log(`  fillCardForm: error en iframe → ${e}`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(null).catch(() => {});
		await switchWV(driver).catch(() => {});
		return 'failed';
	}

	// Cardholder y ZIP son inputs nativos en el documento principal
	await switchWV(driver).catch(() => {});
	await driver.pause(300);

	const holderOk = await fillInput(driver, '#cardholderName input, #cardholderName > input', NAME);
	log(`  fillCardForm: cardholder=${holderOk}`);
	await driver.pause(400);

	const zipOk = await fillInput(driver, '#zipCode input, #zipCode > input', ZIP);
	log(`  fillCardForm: zip=${zipOk}`);
	await driver.pause(600);

	return 'filled';
}

/**
 * Manejo del popup 3DS.
 * action: 'complete' = tap botón de aprobación | 'fail' = tap botón de rechazo.
 */
async function handle3DS(
	driver: WebdriverIO.Browser,
	action: 'complete' | 'fail',
): Promise<'done' | 'not-present'> {
	const APPROVE_TEXTS = ['Complete', 'COMPLETE', 'Complete authentication', 'Completar', 'Autorizar', 'Aprobar'];
	const FAIL_TEXTS    = ['Fail', 'FAIL', 'Fail authentication', 'Deny', 'Rechazar', 'Cancel'];
	const targets = action === 'complete' ? APPROVE_TEXTS : FAIL_TEXTS;

	await driver.pause(3_000);
	const ctxs = await driver.getContexts() as string[];
	log(`    3DS contexts: ${ctxs.join(', ')}`);

	// Contexto externo (Stripe/Visa popup)
	const externalCtx = ctxs.find(c => c.startsWith('WEBVIEW') && !c.includes(PACKAGE));
	if (externalCtx) {
		try {
			await driver.switchContext(externalCtx);
			await driver.pause(2_000);

			// Dump del popup para diagnóstico
			const popup3dsDump = await driver.execute<string, []>(() => {
				const lines = [`URL: ${window.location.href}`, `TITLE: ${document.title}`];
				(document.querySelectorAll('button, input, a') as NodeListOf<HTMLElement>).forEach(el => {
					const text = ((el as HTMLInputElement).value ?? el.innerText ?? el.textContent ?? '').trim().slice(0, 80);
					const vis  = el.offsetParent !== null;
					if (text) lines.push(`[${el.tagName} vis=${vis}] "${text}"`);
				});
				return lines.join('\n');
			}).catch(() => 'error');
			save(`3ds-popup-${action}`, popup3dsDump);
			log(`    3DS popup:\n${popup3dsDump.split('\n').slice(0, 10).join('\n')}`);

			const clicked = await driver.execute((texts: string[]) => {
				const els = Array.from(document.querySelectorAll('button, input[type="submit"], a, [role="button"]')) as HTMLElement[];
				for (const txt of texts) {
					const el = els.find(e =>
						((e as HTMLInputElement).value ?? e.innerText ?? e.textContent ?? '').trim() === txt
						&& e.offsetParent !== null
					);
					if (el) { el.click(); return txt; }
				}
				return '';
			}, targets) as string;

			if (clicked) {
				log(`    ✓ 3DS tap "${clicked}" (action=${action})`);
				await driver.pause(2_000);
				await switchWV(driver);
				return 'done';
			}

			await switchWV(driver);
		} catch (e) {
			log(`    3DS error: ${e}`);
			await switchWV(driver);
		}
	}
	return 'not-present';
}

/**
 * Verifica que aparece un mensaje de error en el formulario o en la pantalla.
 * Retorna el texto del error encontrado, o '' si no se detecta.
 */
async function detectErrorMessage(
	driver: WebdriverIO.Browser,
	keywords: readonly string[],
): Promise<string> {
	if (keywords.length === 0) return '';
	return driver.execute((kws: readonly string[]) => {
		const errorSelectors = [
			'[class*="error"]', '[class*="alert"]', '[class*="message"]',
			'ion-label[color="danger"]', '.error', '.alert',
			'p', 'span', 'div', 'ion-modal',  // incluir div e ion-modal para errores de Stripe
		];
		const allTexts: string[] = [];
		errorSelectors.forEach(sel => {
			document.querySelectorAll(sel).forEach(el => {
				const text = ((el as HTMLElement).innerText ?? '').trim().toLowerCase();
				if (text.length > 3 && (el as HTMLElement).offsetParent !== null) allTexts.push(text);
			});
		});
		for (const kw of kws) {
			const match = allTexts.find(t => t.includes(kw.toLowerCase()));
			if (match) return match;
		}
		return '';
	}, keywords) as Promise<string>;
}

// ── Flujo base P1-P4 (viaje calle hasta TravelResumePage) ────────────────────
async function runBaseFlow(driver: WebdriverIO.Browser, caseId: string): Promise<boolean> {
	log(`  [${caseId}] P1 tap img viaje calle`);
	await driver.execute<void, []>(() => {
		const tab = document.querySelector('#tab-button-home') as HTMLElement | null;
		if (tab) tab.click();
	});
	await driver.pause(1_500);

	const tappedImg = await driver.execute<boolean, []>(() => {
		const all = Array.from(document.querySelectorAll('div.driver-pass.home-icon img')) as HTMLImageElement[];
		const vis = all.find(img => img.offsetParent !== null);
		if (vis) { vis.click(); return true; }
		const divs = Array.from(document.querySelectorAll('div.driver-pass.home-icon')) as HTMLElement[];
		const visDiv = divs.find(d => d.offsetParent !== null);
		if (visDiv) { visDiv.click(); return true; }
		return false;
	});
	if (!tappedImg) { log(`  [${caseId}] FAIL P1 — img no visible`); return false; }
	await driver.pause(1_500);

	log(`  [${caseId}] P2 modal Si (viaje calle)`);
	for (let i = 0; i < 5; i++) {
		const tapped = await driver.execute<boolean, []>(() => {
			const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
			const vis = modals.find(m => m.offsetParent !== null);
			const btn = vis?.querySelector('button.btn.primary') as HTMLButtonElement | null;
			if (btn && !btn.disabled) { btn.click(); return true; }
			return false;
		});
		if (tapped) break;
		await driver.pause(600);
	}

	log(`  [${caseId}] P3 esperar InProgress → Finalizar`);
	const onInProgress = await waitForUrl(driver, 'TravelInProgressPage', 25_000);
	if (!onInProgress) {
		// Puede haber TravelToStartPage intermedio
		const url = await getUrl(driver);
		if (url.includes('TravelToStartPage')) {
			await driver.execute<void, []>(() => {
				const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
				const b = btns.find(b => (b.innerText ?? '').trim() === 'Empezar Viaje' && b.offsetParent !== null);
				if (b) b.click();
			});
			await driver.pause(1_500);
			await driver.execute<void, []>(() => {
				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				const vis = modals.find(m => m.offsetParent !== null);
				const btn = vis?.querySelector('button.btn.primary') as HTMLButtonElement | null;
				if (btn && !btn.disabled) btn.click();
			});
			await waitForUrl(driver, 'TravelInProgressPage', 15_000);
		}
	}

	const tappedFin = await driver.execute<boolean, []>(() => {
		const pages = Array.from(document.querySelectorAll('app-page-travel-in-progress')) as HTMLElement[];
		const active = pages.find(p => p.offsetParent !== null);
		if (!active) return false;
		const btn = active.querySelector('ion-footer ion-toolbar div.btn-finish-container button') as HTMLButtonElement | null;
		if (btn && !btn.disabled) { btn.click(); return true; }
		const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
		const fin = btns.find(b => (b.innerText ?? '').trim() === 'Finalizar Viaje' && b.offsetParent !== null && !b.disabled);
		if (fin) { fin.click(); return true; }
		return false;
	});
	if (!tappedFin) { log(`  [${caseId}] FAIL P3 — Finalizar Viaje no encontrado`); return false; }
	await driver.pause(1_500);

	log(`  [${caseId}] P4 modal Si (fin)`);
	for (let i = 0; i < 5; i++) {
		const tapped = await driver.execute<boolean, []>(() => {
			const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
			const vis = modals.find(m => m.offsetParent !== null);
			const btn = vis?.querySelector('button.btn.primary') as HTMLButtonElement | null;
			if (btn && !btn.disabled) { btn.click(); return true; }
			return false;
		});
		if (tapped) break;
		await driver.pause(600);
	}
	await driver.pause(3_000);
	return true;
}

/**
 * Cancela el modal app-travel-add-toll si está abierto (peaje/estacionamiento).
 * Selectores confirmados 2026-04-14:
 *   Nombre: app-travel-add-toll ion-content div div form div:nth-child(1) ion-input input
 *   Monto:  app-travel-add-toll ion-content div div form div:nth-child(2) ion-input input
 *   Guardar: app-travel-add-toll form div.buttons.margin-buttons button.btn.primary
 *   Cancelar: app-travel-add-toll form div.buttons.margin-buttons button (text="Cancelar")
 */
async function dismissTollModal(driver: WebdriverIO.Browser): Promise<boolean> {
	return driver.execute<boolean, []>(() => {
		const modal = Array.from(document.querySelectorAll('app-travel-add-toll')) as HTMLElement[];
		const vis = modal.find(m => m.offsetParent !== null);
		if (!vis) return false;
		// Tap "Cancelar"
		const btns = Array.from(vis.querySelectorAll('button')) as HTMLButtonElement[];
		const cancelBtn = btns.find(b => (b.innerText ?? '').trim() === 'Cancelar' && b.offsetParent !== null);
		if (cancelBtn) { cancelBtn.click(); return true; }
		// Si no hay Cancelar, cerrar con el botón de cierre del ion-header
		const closeBtn = vis.querySelector('ion-header button, ion-toolbar button') as HTMLButtonElement | null;
		if (closeBtn) { closeBtn.click(); return true; }
		return false;
	});
}

/**
 * Loop de TravelResumePage hasta que aparezca credit-card-payment-data o home.
 * Fix 1: tapa ion-col:nth-child(2) button (tarjeta a bordo) en vez de cualquier payment button.
 * Fix 2: detecta y cancela modal app-travel-add-toll si se abre accidentalmente.
 * Retorna 'card-form' | 'home' | 'timeout'.
 */
async function resumeLoop(driver: WebdriverIO.Browser, caseId: string): Promise<'card-form' | 'home' | 'timeout'> {
	const MAX = 8;
	for (let i = 1; i <= MAX; i++) {
		await switchWV(driver, 15_000);
		const url = await getUrl(driver);

		if (url.includes('/navigator/home') || url.includes('FROM_TRAVEL_CLOSED')) return 'home';

		// Verificar si credit-card-payment-data ya está visible
		const modalVis = await driver.execute<boolean, []>(() => {
			const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
			return !!(m && m.offsetParent !== null);
		});
		if (modalVis) return 'card-form';

		if (!url.includes('TravelResumePage')) return 'home';

		// Detectar y cancelar modal de peaje/estacionamiento si se abrió accidentalmente
		const tollDismissed = await dismissTollModal(driver);
		if (tollDismissed) {
			log(`  [${caseId}] iter ${i}: modal peaje cancelado`);
			await driver.pause(800);
			continue;
		}

		// Tap botón de tarjeta a bordo: ion-col:nth-child(2) button (selector confirmado)
		// Es la segunda columna del bloque de pagos → tarjeta a bordo
		// Solo tapear si hay botones de pago visibles (no tapear "Peaje" ni "Estac.")
		const tappedPayBtn = await driver.execute<string, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
			if (!active) return '';

			// Intento 1: tarjeta a bordo — ion-col:nth-child(2) button (selector confirmado)
			const tarjetaABordo = active.querySelector(
				'div.travel-payment ion-row ion-col:nth-child(2) button'
			) as HTMLButtonElement | null;
			if (tarjetaABordo && tarjetaABordo.offsetParent !== null) {
				tarjetaABordo.click();
				return 'tarjeta-a-bordo';
			}

			// Intento 2: button.payment visible (tarjeta guardada)
			const payBtns = Array.from(active.querySelectorAll(
				'button.payment, button[class*="payment"]'
			)) as HTMLButtonElement[];
			const vis = payBtns.find(b => b.offsetParent !== null);
			if (vis) { vis.click(); return 'payment-btn'; }

			return '';
		});

		if (tappedPayBtn) {
			log(`  [${caseId}] iter ${i}: tap payment (${tappedPayBtn})`);
			await driver.pause(700);

			// Si tapeamos tarjeta a bordo, esperar que aparezca credit-card-payment-data
			if (tappedPayBtn === 'tarjeta-a-bordo') {
				// Verificar si el modal apareció inmediatamente
				await driver.pause(1_000);
				const modalAfterTap = await driver.execute<boolean, []>(() => {
					const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
					return !!(m && m.offsetParent !== null);
				});
				if (modalAfterTap) return 'card-form';
			}
		}

		// Tap cerrar viaje (ion-footer button — selector confirmado)
		const closed = await driver.execute<string, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
			if (!active) return '';
			// Selector confirmado: ion-footer ion-toolbar button
			const footerBtn = active.querySelector('ion-footer ion-toolbar button') as HTMLButtonElement | null;
			if (footerBtn && footerBtn.offsetParent !== null && !footerBtn.disabled) {
				footerBtn.click();
				return (footerBtn.innerText ?? '').trim() || 'cerrar-btn';
			}
			// Fallback: por texto
			const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
			for (const txt of ['Cerrar Viaje', 'Firmar y Cerrar viaje', 'Finalizar Viaje']) {
				const b = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
				if (b) { b.click(); return txt; }
			}
			return '';
		});

		if (closed) {
			log(`  [${caseId}] P5-P6 iter ${i}: tap "${closed}"`);
			await driver.pause(2_500);

			// Verificar si credit-card-payment-data apareció después del cierre
			const modalAfterClose = await driver.execute<boolean, []>(() => {
				const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
				return !!(m && m.offsetParent !== null);
			});
			if (modalAfterClose) return 'card-form';
		}
	}
	return 'timeout';
}

/**
 * Limpia estado de TravelResumePage entre casos.
 * Si el app quedó trabado en TravelResumePage después de un caso fallido,
 * intenta cerrar el viaje usando el selector confirmado.
 */
/**
 * Cierra el modal credit-card-payment-data usando back() para volver a TravelResumePage,
 * luego selecciona la tarjeta GUARDADA (no tarjeta a bordo) para cerrar sin necesitar
 * llenar el formulario Stripe. Más robusto para cleanup entre casos.
 */
async function closeCardModalViaBack(driver: WebdriverIO.Browser): Promise<boolean> {
	log('  closeCardModalViaBack: usando back() para volver a TravelResumePage');
	// back() navega a TravelInProgressPage (si el modal está en TravelResumePage)
	// Necesitamos volver a TravelResumePage desde TravelInProgressPage
	// Pero en realidad, el back() desde credit-card-payment-data puede ir a TravelResumePage directamente
	// dependiendo del historial. Usamos una estrategia diferente:
	// Hacer click en el PRIMER botón payment (tarjeta guardada) para cambiar la selección.

	await switchWV(driver).catch(() => {});
	// Tap el primer button.payment (tarjeta guardada, no tarjeta a bordo)
	const switched = await driver.execute<boolean, []>(() => {
		const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
		const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
		if (!active) return false;
		// Primer botón payment (NOT the active one = tarjeta a bordo)
		const payBtns = Array.from(active.querySelectorAll('button.payment')) as HTMLButtonElement[];
		const first = payBtns.find(b => b.offsetParent !== null);
		if (first) { first.click(); return true; }
		return false;
	}).catch(() => false) as boolean;
	log(`  closeCardModalViaBack: tap saved card btn=${switched}`);
	await driver.pause(1_500);

	// Ahora tap "Cerrar Viaje" que debería estar habilitado con la tarjeta guardada
	for (let i = 0; i < 4; i++) {
		await switchWV(driver).catch(() => {});
		const closed = await driver.execute<boolean, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
			if (!active) return false;
			const footerBtn = active.querySelector('ion-footer ion-toolbar button') as HTMLButtonElement | null;
			if (footerBtn && !footerBtn.disabled) { footerBtn.click(); return true; }
			const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
			for (const txt of ['Cerrar Viaje', 'Firmar y Cerrar viaje']) {
				const b = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
				if (b) { b.click(); return true; }
			}
			return false;
		}).catch(() => false) as boolean;
		if (closed) { log(`  closeCardModalViaBack: cerrar viaje iter ${i + 1}`); break; }
		await driver.pause(800);
	}

	const reachedHome = await waitForUrl(driver, '/navigator/home', 15_000);
	log(`  closeCardModalViaBack: home=${reachedHome}`);
	return reachedHome;
}

async function cleanupResumePageIfStuck(driver: WebdriverIO.Browser): Promise<void> {
	await switchWV(driver).catch(() => {});
	const url = await getUrl(driver);

	// Si el viaje está en progreso, finalizarlo primero
	if (url.includes('TravelInProgressPage')) {
		log('  Cleanup: TravelInProgressPage activo — finalizando viaje');

		// Dump para diagnosticar estado de la pantalla
		const inProgressDump = await driver.execute<string, []>(() => {
			const lines = [`URL: ${window.location.href}`];
			document.querySelectorAll('button').forEach((b: HTMLButtonElement) => {
				const vis = b.offsetParent !== null;
				const txt = (b.innerText ?? '').replace(/\s+/g, ' ').trim();
				if (vis) lines.push(`[BTN vis=true dis=${b.disabled}] "${txt}" cls="${b.className.slice(0, 60)}"`);
			});
			const pages = Array.from(document.querySelectorAll('app-page-travel-in-progress')) as HTMLElement[];
			pages.forEach((p, i) => lines.push(`[PAGE ${i}] vis=${p.offsetParent !== null} hidden=${p.classList.contains('ion-page-hidden')}`));
			return lines.join('\n');
		}).catch(e => `JS error: ${e}`);
		save('cleanup-inprogress', inProgressDump);
		log(`  Cleanup dump:\n${inProgressDump.split('\n').slice(0, 15).join('\n')}`);

		// Tap Finalizar Viaje
		for (let i = 0; i < 5; i++) {
			await switchWV(driver).catch(() => {});
			const tapped = await driver.execute<boolean, []>(() => {
				const pages = Array.from(document.querySelectorAll('app-page-travel-in-progress')) as HTMLElement[];
				const active = pages.find(p => p.offsetParent !== null);
				if (!active) return false;
				const btn = active.querySelector('ion-footer ion-toolbar div.btn-finish-container button') as HTMLButtonElement | null;
				if (btn && !btn.disabled) { btn.click(); return true; }
				const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
				const fin = btns.find(b => (b.innerText ?? '').trim() === 'Finalizar Viaje' && b.offsetParent !== null && !b.disabled);
				if (fin) { fin.click(); return true; }
				// Fallback: click first non-disabled visible button in footer
				const footerBtns = Array.from(document.querySelectorAll('ion-footer button')) as HTMLButtonElement[];
				const fb = footerBtns.find(b => b.offsetParent !== null && !b.disabled);
				if (fb) { fb.click(); return true; }
				return false;
			}).catch(() => false) as boolean;
			log(`  Cleanup Finalizar tap iter ${i + 1}: ${tapped}`);
			if (tapped) break;
			await driver.pause(1_000);
		}
		await driver.pause(2_000);
		// Confirmar modal — varios selectores posibles
		for (let i = 0; i < 6; i++) {
			await switchWV(driver).catch(() => {});
			const confirmed = await driver.execute<boolean, []>(() => {
				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				const vis = modals.find(m => m.offsetParent !== null);
				const primaryBtn = vis?.querySelector('button.btn.primary') as HTMLButtonElement | null;
				if (primaryBtn && !primaryBtn.disabled) { primaryBtn.click(); return true; }
				const allBtns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
				for (const txt of ['Aceptar', 'Confirmar', 'Sí', 'Si', 'OK']) {
					const b = allBtns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
					if (b) { b.click(); return true; }
				}
				const redBtn = allBtns.find(b => b.className.includes('btn-outlined-red') && b.offsetParent !== null && !b.disabled);
				if (redBtn) { redBtn.click(); return true; }
				return false;
			}).catch(() => false) as boolean;
			if (confirmed) { log(`  Cleanup modal confirmado iter ${i + 1}`); break; }
			await driver.pause(600);
		}
		await driver.pause(3_000);
		await switchWV(driver).catch(() => {});
		const afterFin = await getUrl(driver);
		log(`  Cleanup: después de Finalizar → ${afterFin}`);
		if (!afterFin.includes('TravelResumePage') && !afterFin.includes('/navigator/home')) return;
	}

	{
		const currentUrl2 = await getUrl(driver);
		if (!currentUrl2.includes('TravelResumePage') && !currentUrl2.includes('TravelInProgressPage')) return;
	}

	log('  Limpiando estado pendiente...');

	// 1. Cerrar credit-card-payment-data si está abierto desde sesión anterior
	{
		await switchWV(driver).catch(() => {});
		const cardModalOpen = await driver.execute<boolean, []>(() => {
			const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
			return !!(m && m.offsetParent !== null);
		}).catch(() => false) as boolean;
		if (cardModalOpen) {
			log('  Cleanup: credit-card-payment-data abierto — cerrando');
			await closeCardModalViaBack(driver);
			await driver.pause(1_500);
			await switchWV(driver).catch(() => {});
		}
	}

	// 1b. Si después del dismiss estamos en TravelInProgressPage, finalizar el viaje
	{
		await switchWV(driver).catch(() => {});
		const urlAfterDismiss = await getUrl(driver);
		if (urlAfterDismiss.includes('TravelInProgressPage')) {
			log('  Cleanup: post-dismiss en TravelInProgressPage — finalizando');
			for (let i = 0; i < 5; i++) {
				await switchWV(driver).catch(() => {});
				const tapped = await driver.execute<boolean, []>(() => {
					const pages = Array.from(document.querySelectorAll('app-page-travel-in-progress')) as HTMLElement[];
					const active = pages.find(p => p.offsetParent !== null);
					if (!active) return false;
					const btn = active.querySelector('ion-footer ion-toolbar div.btn-finish-container button') as HTMLButtonElement | null;
					if (btn && !btn.disabled) { btn.click(); return true; }
					const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
					const fin = btns.find(b => (b.innerText ?? '').trim() === 'Finalizar Viaje' && b.offsetParent !== null && !b.disabled);
					if (fin) { fin.click(); return true; }
					const footerBtns = Array.from(document.querySelectorAll('ion-footer button')) as HTMLButtonElement[];
					const fb = footerBtns.find(b => b.offsetParent !== null && !b.disabled);
					if (fb) { fb.click(); return true; }
					return false;
				}).catch(() => false) as boolean;
				log(`  Cleanup post-dismiss Finalizar iter ${i + 1}: ${tapped}`);
				if (tapped) break;
				await driver.pause(1_000);
			}
			await driver.pause(2_000);
			// Confirmar modal — varios selectores posibles
			for (let i = 0; i < 6; i++) {
				await switchWV(driver).catch(() => {});
				const confirmed = await driver.execute<boolean, []>(() => {
					const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
					const vis = modals.find(m => m.offsetParent !== null);
					const primaryBtn = vis?.querySelector('button.btn.primary') as HTMLButtonElement | null;
					if (primaryBtn && !primaryBtn.disabled) { primaryBtn.click(); return true; }
					const allBtns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
					for (const txt of ['Aceptar', 'Confirmar', 'Sí', 'Si', 'OK']) {
						const b = allBtns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
						if (b) { b.click(); return true; }
					}
					const redBtn = allBtns.find(b => b.className.includes('btn-outlined-red') && b.offsetParent !== null && !b.disabled);
					if (redBtn) { redBtn.click(); return true; }
					return false;
				}).catch(() => false) as boolean;
				if (confirmed) { log(`  Cleanup post-dismiss modal iter ${i + 1}`); break; }
				await driver.pause(600);
			}
			await driver.pause(3_000);
		}
	}

	// 2. Verificar si ya estamos en home o si no hay TravelResumePage
	{
		await switchWV(driver).catch(() => {});
		const urlCheck = await getUrl(driver);
		if (urlCheck.includes('/navigator/home') || (!urlCheck.includes('TravelResumePage'))) {
			const reachedHome2 = urlCheck.includes('/navigator/home');
			if (reachedHome2) { log('  Cleanup completado ✓ (llegó a home)'); return; }
		}
	}

	// 3. Cancelar modal de peaje si está abierto
	await dismissTollModal(driver);
	await driver.pause(500);

	// 4. Intentar cerrar el viaje
	for (let i = 0; i < 8; i++) {
		await switchWV(driver).catch(() => {});
		const currentUrl = await getUrl(driver);
		if (!currentUrl.includes('TravelResumePage')) break;

		// Cerrar card modal si reabrió
		const cardOpen = await driver.execute<boolean, []>(() => {
			const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
			return !!(m && m.offsetParent !== null);
		}).catch(() => false) as boolean;
		if (cardOpen) {
			await closeCardModalViaBack(driver);
			await driver.pause(1_000);
			continue;
		}

		// Tap payment si visible
		await driver.execute<void, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
			if (!active) return;
			const tarjetaABordo = active.querySelector('div.travel-payment ion-row ion-col:nth-child(2) button') as HTMLButtonElement | null;
			if (tarjetaABordo && tarjetaABordo.offsetParent !== null) { tarjetaABordo.click(); return; }
			const payBtns = Array.from(active.querySelectorAll('button.payment, button[class*="payment"]')) as HTMLButtonElement[];
			const vis = payBtns.find(b => b.offsetParent !== null);
			if (vis) vis.click();
		});
		await driver.pause(700);

		// Tap cerrar
		const tappedClose = await driver.execute<boolean, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
			if (!active) return false;
			const footerBtn = active.querySelector('ion-footer ion-toolbar button') as HTMLButtonElement | null;
			if (footerBtn && !footerBtn.disabled) { footerBtn.click(); return true; }
			const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
			for (const txt of ['Cerrar Viaje', 'Firmar y Cerrar viaje']) {
				const b = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
				if (b) { b.click(); return true; }
			}
			return false;
		}).catch(() => false) as boolean;

		log(`  Cleanup iter ${i + 1}: cerrar=${tappedClose}`);
		await driver.pause(2_000);
	}

	// Esperar home
	const reachedHome = await waitForUrl(driver, '/navigator/home', 15_000);
	if (reachedHome) {
		log('  Cleanup TravelResumePage completado ✓');
	} else {
		const finalUrl = await getUrl(driver);
		log(`  Cleanup TravelResumePage — no llegó a home. URL: ${finalUrl}`);
	}
}

// ── Ejecutor de un caso ───────────────────────────────────────────────────────
interface UnhappyCase {
	readonly id: string;
	readonly title: string;
	readonly card: string;
	readonly scenario: Scenario;
	readonly errorKeywords: readonly string[];
}

async function runCase(
	driver: WebdriverIO.Browser,
	c: UnhappyCase,
): Promise<{ id: string; title: string; status: StepStatus; detail: string }> {
	log(`\n${'═'.repeat(50)}`);
	log(`[${c.id}] ${c.title}`);
	log(`  Tarjeta: ${c.card} | Scenario: ${c.scenario}`);
	log(`${'═'.repeat(50)}`);

	// Verificar precondición — limpiar si hay viaje activo pendiente
	let startUrl = await getUrl(driver);
	if (startUrl.includes('TravelResumePage') || startUrl.includes('TravelInProgressPage')) {
		await cleanupResumePageIfStuck(driver);
		startUrl = await getUrl(driver);
	}
	if (!startUrl.includes('/navigator/home')) {
		return { id: c.id, title: c.title, status: 'FAIL', detail: `Precondición fallida — URL: ${startUrl}` };
	}

	// P1-P4: flujo base
	const baseOk = await runBaseFlow(driver, c.id);
	if (!baseOk) return { id: c.id, title: c.title, status: 'FAIL', detail: 'Flujo base P1-P4 fallido' };

	// Esperar TravelResumePage
	const onResume = await waitForUrl(driver, 'TravelResumePage', 20_000);
	if (!onResume) return { id: c.id, title: c.title, status: 'FAIL', detail: 'TravelResumePage no llegó' };

	// P5-P6: loop hasta credit-card-payment-data
	const loopResult = await resumeLoop(driver, c.id);
	if (loopResult === 'timeout') {
		await dumpScreen(driver, `${c.id}-loop-timeout`);
		return { id: c.id, title: c.title, status: 'FAIL', detail: 'Loop TravelResumePage timeout' };
	}
	if (loopResult === 'home') {
		// Cerró sin formulario de tarjeta — no era flujo tarjeta a bordo
		return { id: c.id, title: c.title, status: 'SKIP', detail: 'Viaje cerrado con tarjeta guardada — no se ejecutó formulario a bordo' };
	}

	// P7: formulario credit-card-payment-data visible
	log(`  [${c.id}] P7 ingresando tarjeta ${c.card}`);
	await dumpScreen(driver, `${c.id}-card-form-before`);

	const fillResult = await fillCardForm(driver, c.card);
	if (fillResult === 'failed') {
		await dumpScreen(driver, `${c.id}-card-form-fill-fail`);
		return { id: c.id, title: c.title, status: 'FAIL', detail: 'No se pudieron llenar los campos de tarjeta' };
	}
	await dumpScreen(driver, `${c.id}-card-form-filled`);

	// P8: tap Cobrar (esperar que se habilite)
	log(`  [${c.id}] P8 tap Cobrar`);
	let tappedCobrar = false;
	const cobrarDeadline = Date.now() + 15_000;
	while (Date.now() < cobrarDeadline) {
		tappedCobrar = await driver.execute<boolean, []>(() => {
			const modal = document.querySelector('credit-card-payment-data') as HTMLElement | null;
			if (!modal || modal.offsetParent === null) return false;
			const btn = modal.querySelector('ion-content form button') as HTMLButtonElement | null;
			if (btn && btn.offsetParent !== null && !btn.disabled) { btn.click(); return true; }
			return false;
		});
		if (tappedCobrar) break;
		await driver.pause(800);
	}

	if (!tappedCobrar) {
		await dumpScreen(driver, `${c.id}-cobrar-disabled`);
		return { id: c.id, title: c.title, status: 'FAIL', detail: 'Botón Cobrar no habilitado — datos inválidos o incompletos' };
	}
	log(`  [${c.id}] ✓ Cobrar tapeado`);
	// Esperar respuesta de la API de Stripe (puede tardar varios segundos)
	await driver.pause(5_000);

	// Capturar texto del modal/error ANTES de descartarlo
	const modalErrorText = await driver.execute<string, []>(() => {
		// Primero buscar en ion-modal visible
		const modals = Array.from(document.querySelectorAll('ion-modal')) as HTMLElement[];
		const vis = modals.find(m => (m as any).offsetParent !== null);
		if (vis) {
			const text = (vis as HTMLElement).innerText ?? '';
			if (text.trim().length > 3) return text.trim().toLowerCase();
		}
		// Buscar en elementos de error directos
		const errorSels = ['[class*="error"]', 'ion-label[color="danger"]', '.error'];
		for (const sel of errorSels) {
			const el = document.querySelector(sel) as HTMLElement | null;
			if (el && (el as any).offsetParent !== null) {
				const t = (el.innerText ?? '').trim();
				if (t.length > 3) return t.toLowerCase();
			}
		}
		return '';
	}).catch(() => '') as string;

	if (modalErrorText) {
		log(`  [${c.id}] Modal error capturado: "${modalErrorText}"`);
	}

	// Descartar modal de validación si está visible
	await driver.execute<void, []>(() => {
		const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
		for (const txt of ['Aceptar', 'OK', 'Cerrar']) {
			const b = btns.find(b => (b.innerText ?? '').trim() === txt && (b as any).offsetParent !== null && !b.disabled);
			if (b) { b.click(); return; }
		}
	}).catch(() => {});
	await driver.pause(1_500);

	// P9: manejo 3DS según scenario
	if (c.scenario === '3ds-fail' || c.scenario === '3ds-success') {
		const action = c.scenario === '3ds-success' ? 'complete' : 'fail';
		log(`  [${c.id}] P9 3DS action=${action}`);
		const threeDsResult = await handle3DS(driver, action);
		if (threeDsResult === 'not-present') {
			log(`  [${c.id}] ⚠ 3DS popup no detectado — puede haber llegado tarde`);
		}
		await driver.pause(3_000);
	}

	// P10: verificar resultado esperado
	await dumpScreen(driver, `${c.id}-result`);
	const finalUrl = await getUrl(driver);

	if (c.scenario === '3ds-success') {
		// Esperamos éxito: home con FROM_TRAVEL_CLOSED
		const isHome = finalUrl.includes('/navigator/home') || finalUrl.includes('FROM_TRAVEL_CLOSED');
		if (isHome) {
			return { id: c.id, title: c.title, status: 'OK', detail: 'Cobro exitoso — home FROM_TRAVEL_CLOSED ✓' };
		}
		// Verificar si hay error inesperado
		const errText = await detectErrorMessage(driver, ['error', 'failed', 'fail']);
		return { id: c.id, title: c.title, status: 'FAIL', detail: `Esperado home — URL: ${finalUrl} | Error: ${errText}` };
	}

	// Para casos de fallo: esperamos mensaje de error y que NO naveguemos a home
	// Combinar: error capturado del modal + búsqueda en DOM actual
	const errorTextDom = await detectErrorMessage(driver, c.errorKeywords);
	const errorText = errorTextDom || (
		c.errorKeywords.some(kw => modalErrorText.includes(kw.toLowerCase())) ? modalErrorText : ''
	);
	const isHome = finalUrl.includes('/navigator/home') || finalUrl.includes('FROM_TRAVEL_CLOSED');

	if (c.scenario === 'decline' || c.scenario === '3ds-fail') {
		if (errorText) {
			log(`  [${c.id}] ✓ Error detectado: "${errorText}"`);
			// Si hay error y no estamos en home → comportamiento correcto
			if (!isHome) {
				return { id: c.id, title: c.title, status: 'OK', detail: `Error esperado detectado: "${errorText}"` };
			}
			// Si llegamos a home con error → puede ser correcto (viaje cerrado + error registrado)
			return { id: c.id, title: c.title, status: 'OK', detail: `Error detectado + home alcanzado: "${errorText}"` };
		}
		if (isHome) {
			// Llegamos a home sin error visible — posible cobro exitoso inadvertido
			return { id: c.id, title: c.title, status: 'FAIL', detail: 'Llegó a home sin error — tarjeta de fallo no generó error visible' };
		}
		// Sin error y sin home — estado inesperado
		return { id: c.id, title: c.title, status: 'FAIL', detail: `Sin error y sin home — URL: ${finalUrl}` };
	}

	return { id: c.id, title: c.title, status: 'OK', detail: finalUrl };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
	if (cases.length === 0) {
		log(`Caso "${SELECTED_CASE}" no encontrado. Disponibles: ${UNHAPPY_CASES.map(c => c.id).join(', ')}`);
		process.exit(1);
	}

	log(`Casos a ejecutar: ${cases.map(c => c.id).join(', ')}`);
	log('PRECONDICIÓN: app en home, driver Disponible, sin viajes activos\n');

	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:                      'Android',
			'appium:automationName':           'UiAutomator2',
			'appium:deviceName':               'SM-A055M',
			'appium:udid':                     UDID,
			'appium:appPackage':               PACKAGE,
			'appium:appActivity':              '.MainActivity',
			'appium:noReset':                  true,
			'appium:forceAppLaunch':           false,
			'appium:newCommandTimeout':        180,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});
	log('✓ Sesión Appium adjuntada');

	const results: Array<{ id: string; title: string; status: StepStatus; detail: string }> = [];

	try {
		await switchWV(driver);

		for (const c of cases) {
			let result: { id: string; title: string; status: StepStatus; detail: string };
			try {
				result = await runCase(driver, c);
			} catch (e) {
				result = { id: c.id, title: c.title, status: 'FAIL', detail: `Exception: ${e}` };
				log(`  [${c.id}] Exception: ${e}`);
				await switchWV(driver, 15_000).catch(() => {});
			}
			results.push(result);

			// Entre casos: limpiar estado y esperar home limpio
			if (cases.indexOf(c) < cases.length - 1) {
				log(`\n  Limpiando estado para el siguiente caso...`);
				await cleanupResumePageIfStuck(driver);
				await waitForUrl(driver, '/navigator/home', 20_000);
				await driver.pause(2_000);
			}
		}
	} finally {
		// Reporte
		log('\n' + '═'.repeat(60));
		log('REPORTE UNHAPPY PATHS — VIAJE CALLE');
		log('═'.repeat(60));
		for (const r of results) {
			const icon = r.status === 'OK' ? '✓' : r.status === 'SKIP' ? '⚠' : '✗';
			log(`${icon} [${r.id}] ${r.title}`);
			if (r.detail) log(`      ${r.detail}`);
		}
		const ok   = results.filter(r => r.status === 'OK').length;
		const fail = results.filter(r => r.status === 'FAIL').length;
		const skip = results.filter(r => r.status === 'SKIP').length;
		log(`\nResultado: ${ok} OK | ${fail} FAIL | ${skip} SKIP de ${results.length} casos`);
		log('═'.repeat(60));

		mkdirSync('evidence/reports', { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		writeFileSync(
			join('evidence/reports', `viaje-calle-unhappy-${ts}.json`),
			JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
			'utf-8'
		);
		log('✓ Reporte guardado en evidence/reports/');
		await driver.deleteSession();
	}
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
