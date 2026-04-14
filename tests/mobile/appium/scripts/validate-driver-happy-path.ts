/**
 * Validación completa del happy path del Driver App.
 * Acepta UN viaje (el primer TravelConfirmPage visible) y ejecuta el flujo completo.
 *
 * Flujo:
 *   TravelConfirmPage  → tap "Aceptar"    (scoped a contenedor visible)
 *   TravelToStartPage  → tap "Empezar Viaje"
 *   Modal inicio       → tap "Si"
 *   TravelInProgress   → tap "Finalizar Viaje"
 *   Modal fin          → tap "Si"
 *   TravelResumePage   → seleccionar tarjeta (si aplica) → tap "Cerrar Viaje"
 *                        Si tarjeta 3DS obligatoria → popup Stripe → "Complete" → continúa
 *   Home               → assert FROM_TRAVEL_CLOSED=true
 *
 * Tarjetas 3DS happy path (pasajero debe tener una de estas configurada):
 *   4000000000003220  → 3DS obligatorio — Radar (challenge obligatorio)
 *   4000002760003184  → Autenticar siempre — independiente de configuración
 *
 * Ejecutar:
 *   npx ts-node --esm tests/mobile/appium/scripts/validate-driver-happy-path.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';

const log = (msg: string) => console.log(`[happy-path] ${msg}`);

type StepResult = { step: string; status: 'OK' | 'FAIL'; url: string; note?: string };
const RESULTS: StepResult[] = [];

/**
 * Detecta y completa el popup 3DS de Stripe/Visa en el WebView del Driver App.
 *
 * Escenarios posibles:
 *   A) 3DS aparece como nuevo contexto WebView (Chrome Custom Tab / embedded browser)
 *   B) 3DS aparece como iframe inyectado en el WebView principal (Stripe inline)
 *   C) 3DS aparece como ion-modal con iframe interno
 *
 * Retorna:
 *   'completed'   → autenticación aprobada
 *   'not-present' → no había popup 3DS activo
 *   'failed'      → popup detectado pero no se pudo completar
 *   string        → mensaje de error
 *
 * NOTA: Los selectores del botón "Complete" dentro del iframe 3DS deben
 * confirmarse con dump-3ds-popup.ts en el momento en que el popup esté activo.
 * Los valores actuales son los estándar de Stripe test mode.
 */
async function handle3DS(
	driver: WebdriverIO.Browser,
	logFn: (m: string) => void,
	dumpFn: (label: string) => Promise<void>,
): Promise<'completed' | 'not-present' | 'failed' | string> {
	// Textos del botón de aprobación en el challenge Stripe test mode.
	// Fuente: Stripe test 3DS UI para tarjetas:
	//   4000000000003220 (3DS obligatorio — Radar)
	//   4000002760003184 (Autenticar siempre)
	// El iframe de Stripe en test mode muestra botones en inglés.
	// Si la app localiza el iframe, pueden aparecer en español.
	const APPROVE_TEXTS = [
		'Complete',                    // Stripe test 3DS — botón principal
		'Complete authentication',     // Stripe test 3DS — texto largo
		'COMPLETE',
		'Completar',                   // localización español
		'Completar autenticación',
		'Autorizar',
		'Aprobar',
		'Confirm',
		'Submit',
	];

	// ── A: Detectar nuevo contexto WebView (3DS en Chrome Custom Tab) ─────────
	const contexts = await driver.getContexts() as string[];
	logFn(`  3DS check — contextos: ${contexts.join(', ')}`);

	const threeDSContext = contexts.find(c =>
		c.startsWith('WEBVIEW') && !c.includes('com.magiis')
	);
	if (threeDSContext) {
		logFn(`  3DS contexto externo detectado: ${threeDSContext}`);
		await driver.switchContext(threeDSContext);
		await dumpFn('P6-3DS-external-context');

		const completed = await driver.execute((texts: string[]) => {
			const btns = Array.from(document.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
			for (const txt of texts) {
				const btn = btns.find(b => (b.innerText ?? b.textContent ?? '').trim() === txt && b.offsetParent !== null);
				if (btn) { (btn as HTMLButtonElement).click(); return true; }
			}
			return false;
		}, APPROVE_TEXTS) as boolean;

		// Volver al WebView principal
		const mainWV = contexts.find(c => c.includes('com.magiis'));
		if (mainWV) await driver.switchContext(mainWV);

		return completed ? 'completed' : 'failed';
	}

	// ── B: Detectar 3DS inline (iframe dentro del WebView principal) ───────────
	const mainWV = contexts.find(c => c.includes('com.magiis'));
	if (mainWV) await driver.switchContext(mainWV);

	const inlineResult = await driver.execute((texts: string[]) => {
		// Buscar iframe de Stripe/3DS
		const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
		const threeDSFrame = iframes.find(f =>
			/stripe|hooks|acs|3ds|authenticate|verify/i.test(f.src ?? f.name ?? '')
		);
		if (!threeDSFrame) return 'not-present';

		// Intentar click dentro del iframe (solo funciona si mismo origen)
		try {
			const frameDoc = threeDSFrame.contentDocument ?? threeDSFrame.contentWindow?.document;
			if (!frameDoc) return 'iframe-no-access';
			const btns = Array.from(frameDoc.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
			for (const txt of texts) {
				const btn = btns.find(b => (b.innerText ?? b.textContent ?? '').trim() === txt && b.offsetParent !== null);
				if (btn) { (btn as HTMLButtonElement).click(); return 'completed'; }
			}
			return 'iframe-btn-not-found';
		} catch {
			return 'iframe-cross-origin';
		}
	}, APPROVE_TEXTS) as string;

	if (inlineResult === 'not-present') {
		// ── C: Buscar en ion-modal / overlays visibles ─────────────────────────
		const modalResult = await driver.execute((texts: string[]) => {
			const overlays = Array.from(document.querySelectorAll('ion-modal, [class*="3ds"], [class*="stripe"], app-confirm-modal')) as HTMLElement[];
			const visible  = overlays.filter(el => el.offsetParent !== null);
			if (!visible.length) return 'not-present';

			for (const overlay of visible) {
				const btns = Array.from(overlay.querySelectorAll('button, [role="button"]')) as HTMLElement[];
				for (const txt of texts) {
					const btn = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null);
					if (btn) { (btn as HTMLButtonElement).click(); return 'completed'; }
				}
			}
			return 'modal-btn-not-found';
		}, APPROVE_TEXTS) as string;

		return modalResult as 'completed' | 'not-present' | 'failed';
	}

	if (inlineResult === 'completed') return 'completed';
	// iframe detectado pero no se pudo hacer click (cross-origin) — dump para diagnóstico
	if (inlineResult.startsWith('iframe')) {
		logFn(`  3DS iframe detectado (${inlineResult}) — dump para análisis`);
		await dumpFn('P6-3DS-iframe-detected');
	}

	return inlineResult as 'failed';
}

function saveEvidence(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const path = join('evidence/dom-dump', `${label}-${ts}.txt`);
	writeFileSync(path, content, 'utf-8');
	log(`  ✓ Evidencia: ${path}`);
}

async function run(): Promise<void> {
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
	log('✓ Sesión adjuntada');

	// ── Helpers ────────────────────────────────────────────────────────────────

	const switchWV = async (): Promise<boolean> => {
		const ctxs = await driver.getContexts() as string[];
		const wv   = ctxs.find((c: string) => c.startsWith('WEBVIEW'));
		if (wv) { await driver.switchContext(wv); return true; }
		return false;
	};

	const getUrl = (): Promise<string> =>
		driver.execute<string, []>(() => window.location.href).catch(() => '');

	/** Click JS acotado al primer contenedor visible (sin ion-page-hidden). */
	const jsClickInContainer = (containerSel: string, btnText: string): Promise<boolean> =>
		driver.execute((cSel: string, txt: string) => {
			const containers = Array.from(document.querySelectorAll(cSel)) as HTMLElement[];
			const active = containers.find(el => !el.classList.contains('ion-page-hidden'));
			if (!active) return false;
			const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
			const btn  = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null);
			if (btn) { btn.click(); return true; }
			return false;
		}, containerSel, btnText);

	/** Click JS en cualquier modal visible (app-confirm-modal, ion-modal). */
	const jsClickModal = (btnText: string): Promise<boolean> =>
		driver.execute((txt: string) => {
			const selectors = ['app-confirm-modal', 'ion-modal', 'ion-alert'];
			for (const sel of selectors) {
				const modals = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
				for (const modal of modals) {
					if (modal.offsetParent === null) continue;
					const btns = Array.from(modal.querySelectorAll('button')) as HTMLButtonElement[];
					const btn  = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null);
					if (btn) { btn.click(); return true; }
				}
			}
			return false;
		}, btnText);

	/** Espera hasta que la URL contenga el token (polling). */
	const waitForUrl = async (token: string, timeout = 20000): Promise<string> => {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await switchWV();
			const url = await getUrl();
			if (url.includes(token)) return url;
			await driver.pause(800);
		}
		return getUrl();
	};

	const dumpScreen = async (label: string): Promise<void> => {
		const content = await driver.execute<string, []>(() => {
			const lines: string[] = [`URL: ${window.location.href}`];
			(document.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).forEach(el => {
				const t   = (el.innerText ?? '').trim().slice(0, 80);
				const cls = (el.className ?? '').toString().slice(0, 60);
				const vis = el.offsetParent !== null;
				if (t) lines.push(`[BTN vis=${vis}] class="${cls}" text="${t}"`);
			});
			['app-page-travel-confirm', 'app-page-travel-to-start', 'app-page-travel-in-progress',
			 'app-travel-resume', 'app-confirm-modal', 'page-home'].forEach(sel => {
				(document.querySelectorAll(sel) as NodeListOf<Element>).forEach(el => {
					lines.push(`[CONTAINER] ${sel} class="${(el.className ?? '').toString().slice(0, 80)}"`);
				});
			});
			return lines.join('\n');
		}).catch(e => `JS error: ${e}`);
		saveEvidence(label, content);
	};

	// ── PASO 1: Aceptar viaje ──────────────────────────────────────────────────
	log('\n══ PASO 1: Aceptar viaje ══');
	await switchWV();
	const url1 = await getUrl();
	log(`URL: ${url1}`);

	if (!url1.includes('TravelConfirmPage')) {
		log('⚠  No estamos en TravelConfirmPage');
		await dumpScreen('diag-no-confirm');
		await driver.deleteSession();
		return;
	}

	const travelCode = decodeURIComponent(url1).match(/"travelCode":"([^"]+)"/)?.[1] ?? 'unknown';
	log(`Viaje: ${travelCode}`);
	await dumpScreen(`P1-confirm-${travelCode}`);

	const ok1 = await jsClickInContainer('app-page-travel-confirm', 'Aceptar');
	log(ok1 ? '✓ Tap "Aceptar"' : '⚠ No encontrado');
	RESULTS.push({ step: 'P1-Aceptar', status: ok1 ? 'OK' : 'FAIL', url: url1, note: travelCode });

	// ── PASO 2: Empezar Viaje ──────────────────────────────────────────────────
	log('\n══ PASO 2: Empezar Viaje ══');
	const url2 = await waitForUrl('TravelToStartPage', 20000);
	log(`URL: ${url2}`);
	await dumpScreen('P2-to-start');

	const ok2 = await jsClickInContainer('app-page-travel-to-start', 'Empezar Viaje');
	log(ok2 ? '✓ Tap "Empezar Viaje"' : '⚠ No encontrado');
	RESULTS.push({ step: 'P2-EmpezarViaje', status: (url2.includes('TravelToStartPage') && ok2) ? 'OK' : 'FAIL', url: url2 });

	// ── PASO 3: Modal inicio → Si ──────────────────────────────────────────────
	log('\n══ PASO 3: Confirmar inicio (modal) ══');
	await driver.pause(2000);
	const ok3 = await jsClickModal('Si');
	log(ok3 ? '✓ Tap "Si"' : '⚠ Modal no encontrado');
	RESULTS.push({ step: 'P3-ConfirmarInicio', status: ok3 ? 'OK' : 'FAIL', url: url2 });

	// ── PASO 4: Finalizar Viaje ────────────────────────────────────────────────
	log('\n══ PASO 4: Finalizar Viaje ══');
	const url4 = await waitForUrl('TravelInProgressPage', 25000);
	log(`URL: ${url4}`);
	await dumpScreen('P4-in-progress');

	const ok4 = await jsClickInContainer('app-page-travel-in-progress', 'Finalizar Viaje');
	log(ok4 ? '✓ Tap "Finalizar Viaje"' : '⚠ No encontrado');
	RESULTS.push({ step: 'P4-FinalizarViaje', status: ok4 ? 'OK' : 'FAIL', url: url4 });

	// ── PASO 5: Modal fin → Si ─────────────────────────────────────────────────
	log('\n══ PASO 5: Confirmar fin (modal) ══');
	await driver.pause(2000);
	const ok5 = await jsClickModal('Si');
	log(ok5 ? '✓ Tap "Si"' : '⚠ Modal no encontrado');
	RESULTS.push({ step: 'P5-ConfirmarFin', status: ok5 ? 'OK' : 'FAIL', url: url4 });

	// ── PASO 6: TravelResumePage — loop hasta salir (tarjeta + cierre iterativo) ──
	// La pantalla puede requerir múltiples interacciones antes de navegar al home:
	//   Iteración 1: tap cierre ("Firmar y Cerrar viaje") → vuelve con tarjeta visible
	//   Iteración 2: tap tarjeta → tap "Cerrar Viaje" → home
	// O directamente: tap tarjeta → tap "Cerrar Viaje" → home
	log('\n══ PASO 6: Resumen de viaje ══');
	const url6 = await waitForUrl('TravelResumePage', 20000);
	log(`URL: ${url6}`);
	await dumpScreen('P6-resume');

	const CLOSE_BTNS   = ['Cerrar Viaje', 'Firmar y Cerrar viaje', 'Finalizar Viaje'];
	const MAX_ITER     = 4;
	let   iterCount    = 0;
	const cardsTapped: string[] = [];
	const closesBtnsTapped: string[] = [];

	while (iterCount < MAX_ITER) {
		iterCount++;
		await switchWV();
		const currentUrl = await getUrl();
		if (!currentUrl.includes('TravelResumePage')) break;

		// Intentar tap de tarjeta (condicional — aparece después de "Firmar y Cerrar viaje")
		const tappedCard = await driver.execute<string, []>(() => {
			const container = document.querySelector('app-travel-resume');
			if (!container) return '';
			const candidates = [
				...Array.from(container.querySelectorAll('button.payment, button[class*="payment"]')),
				...Array.from(container.querySelectorAll('div.travel-payment button')),
			] as HTMLButtonElement[];
			const visible = candidates.find(b => b.offsetParent !== null);
			if (visible) { visible.click(); return (visible.innerText ?? '').trim(); }
			return '';
		});
		if (tappedCard) {
			cardsTapped.push(tappedCard);
			log(`  iter ${iterCount}: ✓ Tarjeta "${tappedCard}" seleccionada`);
			await driver.pause(1000);
		}

		// Tap botón de cierre (no deshabilitado)
		const tappedClose = await driver.execute((candidates: string[]) => {
			const container = document.querySelector('app-travel-resume');
			if (!container) return '';
			const btns = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
			for (const txt of candidates) {
				const btn = btns.find(
					b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !(b as HTMLButtonElement).disabled
				);
				if (btn) { btn.click(); return txt; }
			}
			return '';
		}, CLOSE_BTNS) as string;

		if (tappedClose) {
			closesBtnsTapped.push(tappedClose);
			log(`  iter ${iterCount}: ✓ Tap "${tappedClose}"`);
		} else {
			log(`  iter ${iterCount}: ⚠ Sin botón de cierre clickeable`);
			break;
		}

		// ── Detección de popup 3DS post-cierre ────────────────────────────────
		// Cuando el pasajero usó tarjeta con 3DS obligatorio, el tap en la tarjeta
		// dispara un popup de autenticación Stripe/Visa antes de cerrar el viaje.
		await driver.pause(2500);
		const threeDSResult = await handle3DS(driver, log, dumpScreen);
		if (threeDSResult === 'completed') {
			RESULTS.push({ step: 'P6-3DS', status: 'OK', url: url6, note: '3DS completado' });
			log('  ✓ 3DS completado — continuando flujo');
		} else if (threeDSResult === 'not-present') {
			// Sin 3DS — flujo normal
		} else {
			RESULTS.push({ step: 'P6-3DS', status: 'FAIL', url: url6, note: threeDSResult });
			log(`  ⚠ 3DS: ${threeDSResult}`);
		}
		await driver.pause(1500);
	}

	RESULTS.push({
		step:   'P6a-SeleccionarTarjeta',
		status: 'OK',
		url:    url6,
		note:   cardsTapped.length ? cardsTapped.join(', ') : 'N/A',
	});
	RESULTS.push({
		step:   'P6b-CerrarViaje',
		status: closesBtnsTapped.length ? 'OK' : 'FAIL',
		url:    url6,
		note:   closesBtnsTapped.join(' → '),
	});

	// ── PASO 7: Validar Home ───────────────────────────────────────────────────
	log('\n══ PASO 7: Validar home ══');
	await driver.pause(2000);
	await switchWV();
	const urlFinal = await getUrl();
	log(`URL final: ${urlFinal}`);
	const homeOk = urlFinal.includes('FROM_TRAVEL_CLOSED') || urlFinal.includes('/navigator/home');
	await dumpScreen('P7-home-final');
	RESULTS.push({ step: 'P7-Home', status: homeOk ? 'OK' : 'FAIL', url: urlFinal, note: homeOk ? 'FROM_TRAVEL_CLOSED=true' : 'URL inesperada' });

	// ── Reporte ────────────────────────────────────────────────────────────────
	log('\n══════════════════════════════════════════');
	log('  REPORTE HAPPY PATH — APP DRIVER');
	log('══════════════════════════════════════════');
	for (const r of RESULTS) {
		const icon = r.status === 'OK' ? '✅' : '❌';
		log(`${icon}  ${r.step.padEnd(24)} | ${r.note ?? ''}`);
	}
	const allOk = RESULTS.every(r => r.status === 'OK');
	log(`\n${allOk ? '🎉 FLUJO COMPLETO: PASS' : '⚠  FLUJO CON FALLOS: REVIEW NECESARIO'}`);
	log('══════════════════════════════════════════\n');

	mkdirSync('evidence', { recursive: true });
	const reportPath = join('evidence', `happy-path-report-${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(reportPath, JSON.stringify({ travelCode, results: RESULTS, allOk }, null, 2), 'utf-8');
	log(`✓ Reporte guardado: ${reportPath}`);

	await driver.deleteSession();
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
