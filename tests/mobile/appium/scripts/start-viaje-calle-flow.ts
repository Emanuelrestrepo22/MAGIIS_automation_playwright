/**
 * start-viaje-calle-flow.ts
 * Flujo completo de "viaje calle" desde Driver App.
 *
 * Selectores confirmados con DOM dump real 2026-04-13:
 *
 *   P1. Tap img en div.driver-pass.home-icon
 *         → emerge modal de confirmación de viaje calle
 *   P2. Tap "Si" en app-confirm-modal
 *   P3. TravelInProgressPage → tap "Finalizar Viaje"
 *         selector: app-page-travel-in-progress ion-footer ion-toolbar div.btn-finish-container button
 *   P4. Modal "¿Finalizar Viaje?" → tap "Si" en app-confirm-modal
 *   P5. TravelResumePage → tap botón de tarjeta (pago a bordo)
 *         selector: app-travel-resume div.travel-payment ion-row ion-col:nth-child(2) button
 *   P6. Tap "Cerrar Viaje"
 *         selector: app-travel-resume ion-footer ion-toolbar button
 *   P7. Modal credit-card-payment-data → ingresar datos de tarjeta
 *         #root form — número, vencimiento, CVC, titular, ZIP
 *   P8. Tap "Cobrar"
 *         selector: credit-card-payment-data ion-content form button (habilitado solo con datos válidos)
 *   P9. (Si 3DS) popup Visa → tap "Complete"
 *   P10. Verificar cierre → home post-viaje
 *
 * Ejecutar:
 *   npx ts-node --esm tests/mobile/appium/scripts/start-viaje-calle-flow.ts
 *
 * Variables de entorno (.env.test):
 *   ANDROID_UDID            (default: R92XB0B8F3J)
 *   ANDROID_APP_PACKAGE     (default: com.magiis.app.test.driver)
 *   CARD_NUMBER             (default: 4000002760003184 — always authenticate 3DS)
 *   CARD_EXPIRY             (default: 12/34)
 *   CARD_CVC                (default: 123)
 *   CARD_NAME               (default: Emanuel Restrepo)
 *   CARD_ZIP                (default: 1000)
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Config ───────────────────────────────────────────────────────────────────
const UDID        = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE     = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const CARD_NUMBER = process.env.CARD_NUMBER         ?? '4000002760003184';
const CARD_EXPIRY = process.env.CARD_EXPIRY         ?? '12/34';
const CARD_CVC    = process.env.CARD_CVC            ?? '123';
const CARD_NAME   = process.env.CARD_NAME           ?? 'Emanuel Restrepo';
const CARD_ZIP    = process.env.CARD_ZIP            ?? '1000';

const log = (m: string) => console.log(`[viaje-calle] ${m}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function save(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts   = new Date().toISOString().replace(/[:.]/g, '-');
	const path = join('evidence/dom-dump', `viaje-calle-${label}-${ts}.txt`);
	writeFileSync(path, content, 'utf-8');
	log(`  ✓ Dump: ${path}`);
}

type StepStatus = 'OK' | 'FAIL' | 'SKIP';
const report: Array<{ step: string; status: StepStatus; detail: string }> = [];

function addStep(step: string, status: StepStatus, detail = ''): void {
	report.push({ step, status, detail });
	const icon = status === 'OK' ? '✓' : status === 'SKIP' ? '⚠' : '✗';
	log(`${icon} ${step}${detail ? ` — ${detail}` : ''}`);
}

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
		const url = await getUrl(driver);
		if (url.includes(token)) return true;
		await driver.pause(600);
	}
	return false;
}

async function dumpScreen(driver: WebdriverIO.Browser, label: string): Promise<string> {
	const dump = await driver.execute<string, []>(() => {
		const lines = [`URL: ${window.location.href}`, ''];
		(document.querySelectorAll('button, ion-button, [role="button"], img[class*="home"]') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text = (el.innerText ?? el.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
				const cls  = (el.className ?? '').toString().slice(0, 100);
				const vis  = el.offsetParent !== null;
				const dis  = (el as HTMLButtonElement).disabled ?? false;
				if (vis) lines.push(`[BTN vis=${vis} dis=${dis}] ${el.tagName} class="${cls}" text="${text}"`);
			});
		(document.querySelectorAll('iframe') as NodeListOf<HTMLIFrameElement>).forEach((f, i) => {
			lines.push(`[IFRAME ${i}] name="${f.name}" src="${(f.src ?? '').slice(0, 100)}"`);
		});
		(document.querySelectorAll('input') as NodeListOf<HTMLInputElement>).forEach(el => {
			const vis = el.offsetParent !== null;
			if (vis) lines.push(`[INPUT vis=${vis}] id="${el.id}" name="${el.name}" type="${el.type}" placeholder="${el.placeholder}"`);
		});
		(document.querySelectorAll('span,p,h1,h2,h3,ion-label,ion-title') as NodeListOf<HTMLElement>).forEach(el => {
			const text = (el.innerText ?? '').trim().replace(/\n/g, ' ').slice(0, 100);
			if (text.length > 2 && el.offsetParent !== null) lines.push(`[TEXT] ${el.tagName} "${text}"`);
		});
		['app-confirm-modal', 'credit-card-payment-data', 'app-travel-resume', 'app-page-travel-in-progress'].forEach(sel => {
			document.querySelectorAll(sel).forEach(el => {
				lines.push(`[CONTAINER vis=${(el as HTMLElement).offsetParent !== null}] ${sel}`);
			});
		});
		return lines.join('\n');
	}).catch(e => `JS error: ${e}`);
	save(label, dump);
	return dump;
}

/**
 * Llena un input con setValue simulando escritura real.
 * Limpia el campo antes de escribir.
 */
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
 * Detección y completado de popup 3DS post-Cobrar.
 * Busca contexto WebView externo (Stripe/Visa 3DS) y toca el botón de aprobación.
 */
async function handle3DS(driver: WebdriverIO.Browser): Promise<'completed' | 'not-present' | 'failed'> {
	const APPROVE = ['Complete', 'COMPLETE', 'Complete authentication', 'Completar', 'Autorizar', 'Aprobar', 'Confirm', 'Submit'];

	await driver.pause(3_000);
	const ctxs = await driver.getContexts() as string[];
	log(`  3DS check — contextos: ${ctxs.join(', ')}`);

	// Escenario A: contexto WebView externo (Chrome Custom Tab Visa/Stripe)
	const externalCtx = ctxs.find(c => c.startsWith('WEBVIEW') && !c.includes(PACKAGE));
	if (externalCtx) {
		log(`  3DS contexto externo: ${externalCtx}`);
		try {
			await driver.switchContext(externalCtx);
			await driver.pause(2_000);
			const clicked = await driver.execute((texts: string[]) => {
				const btns = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="submit"]')) as HTMLElement[];
				for (const txt of texts) {
					const btn = btns.find(b =>
						((b as HTMLInputElement).value ?? b.innerText ?? b.textContent ?? '').trim() === txt
						&& b.offsetParent !== null
					);
					if (btn) { btn.click(); return txt; }
				}
				return '';
			}, APPROVE) as string;

			if (clicked) {
				log(`  ✓ 3DS completado: tap "${clicked}"`);
				await driver.pause(2_000);
				await switchWV(driver);
				return 'completed';
			}
			// Dump del contexto 3DS para diagnóstico
			const threeDsDump = await driver.execute<string, []>(() => {
				const lines = [`URL: ${window.location.href}`, `TITLE: ${document.title}`];
				(document.querySelectorAll('button, input, a') as NodeListOf<HTMLElement>).forEach(el => {
					const text = ((el as HTMLInputElement).value ?? el.innerText ?? '').trim().slice(0, 80);
					const vis  = el.offsetParent !== null;
					if (text) lines.push(`[${el.tagName} vis=${vis}] "${text}"`);
				});
				return lines.join('\n');
			}).catch(e => `JS error: ${e}`);
			save('3DS-context', threeDsDump);
			await switchWV(driver);
		} catch (e) {
			log(`  3DS contexto externo error: ${e}`);
			await switchWV(driver);
		}
	}

	// Escenario B: ion-modal / overlay dentro del WebView principal
	try {
		await switchWV(driver);
		const modalClicked = await driver.execute((texts: string[]) => {
			const modals = document.querySelectorAll('ion-modal, [id*="overlay"]');
			for (const modal of Array.from(modals)) {
				const btns = Array.from(modal.querySelectorAll('button, [role="button"], input[type="submit"]')) as HTMLElement[];
				for (const txt of texts) {
					const btn = btns.find(b => (b.innerText ?? b.textContent ?? '').trim() === txt && b.offsetParent !== null);
					if (btn) { btn.click(); return txt; }
				}
			}
			return '';
		}, APPROVE) as string;
		if (modalClicked) {
			log(`  ✓ 3DS modal completado: "${modalClicked}"`);
			return 'completed';
		}
	} catch { /* noop */ }

	log('  3DS no detectado');
	return 'not-present';
}

// ── Flujo principal ────────────────────────────────────────────────────────────
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
	log('✓ Sesión Appium adjuntada');

	try {
		await switchWV(driver);

		// ── Verificar precondición: app debe estar en HOME, sin viaje asignado ──
		const startUrl = await getUrl(driver);
		log(`URL inicial: ${startUrl}`);

		if (startUrl.includes('TravelConfirmPage')) {
			addStep('PRECONDICION home limpio', 'FAIL',
				`App está en TravelConfirmPage con viaje asignado. ` +
				`Precondición: el driver debe estar en home sin viajes pendientes. ` +
				`Completar o rechazar el viaje asignado antes de correr este script.`
			);
			await dumpScreen(driver, 'precondicion-fail');
			throw new Error('Precondición fallida: hay un viaje asignado pendiente en TravelConfirmPage');
		}

		if (startUrl.includes('TravelToStartPage') || startUrl.includes('TravelInProgressPage') || startUrl.includes('TravelResumePage')) {
			addStep('PRECONDICION home limpio', 'FAIL',
				`App está en medio de un viaje activo (${startUrl.split('/').pop()?.split(';')[0]}). ` +
				`Completar el viaje actual antes de iniciar flujo viaje calle.`
			);
			await dumpScreen(driver, 'precondicion-fail');
			throw new Error('Precondición fallida: hay un viaje en curso');
		}

		// ── P1. Tap img viaje calle ────────────────────────────────────────────
		log('\n── P1. Tap botón viaje calle ──');

		// Navegar al tab home y esperar estado limpio
		await driver.execute<void, []>(() => {
			const tab = document.querySelector('#tab-button-home') as HTMLElement | null;
			if (tab) tab.click();
		});
		await driver.pause(2_000);

		// El tap es sobre el IMG dentro de div.driver-pass.home-icon
		// Hay múltiples instancias en el DOM — buscar el primero visible
		const tappedImg = await driver.execute<boolean, []>(() => {
			const imgs = Array.from(
				document.querySelectorAll('div.driver-pass.home-icon img')
			) as HTMLImageElement[];
			const visible = imgs.find(img => img.offsetParent !== null);
			if (visible) { visible.click(); return true; }
			// Fallback: tap el div contenedor
			const divs = Array.from(
				document.querySelectorAll('div.driver-pass.home-icon')
			) as HTMLElement[];
			const visibleDiv = divs.find(d => d.offsetParent !== null);
			if (visibleDiv) { visibleDiv.click(); return true; }
			return false;
		});

		if (!tappedImg) {
			addStep('P1 tap img viaje calle', 'FAIL', 'div.driver-pass.home-icon img no visible');
			await dumpScreen(driver, 'P1-fail');
			throw new Error('P1 fallido');
		}
		addStep('P1 tap img viaje calle', 'OK', 'div.driver-pass.home-icon img');
		await driver.pause(1_500);

		// ── P2. Modal confirmación viaje calle → Si ───────────────────────────
		log('\n── P2. Modal viaje calle → Si ──');
		await dumpScreen(driver, 'P2-modal-viaje-calle');

		// Modal: app-confirm-modal — buscar entre todos los overlays el visible
		// Selector: app-confirm-modal div button.btn.primary (en overlay activo)
		const tappedSiViajeCalleArr: boolean[] = [];
		for (let attempt = 0; attempt < 5; attempt++) {
			const tapped = await driver.execute<boolean, []>(() => {
				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				const visibleModal = modals.find(m => m.offsetParent !== null);
				if (!visibleModal) return false;
				const btn = visibleModal.querySelector('button.btn.primary') as HTMLButtonElement | null;
				if (btn && btn.offsetParent !== null && !btn.disabled) {
					btn.click();
					return true;
				}
				return false;
			});
			if (tapped) { tappedSiViajeCalleArr.push(true); break; }
			await driver.pause(600);
		}

		if (!tappedSiViajeCalleArr.length) {
			addStep('P2 modal Si (viaje calle)', 'FAIL', 'app-confirm-modal no visible');
			await dumpScreen(driver, 'P2-fail');
			throw new Error('P2 fallido');
		}
		addStep('P2 modal Si (viaje calle)', 'OK');
		await driver.pause(2_000);

		// ── P3. TravelInProgressPage → Finalizar Viaje ───────────────────────
		log('\n── P3. TravelInProgressPage → Finalizar Viaje ──');
		const onInProgress = await waitForUrl(driver, 'TravelInProgressPage', 25_000);
		if (!onInProgress) {
			// Puede haber pantalla intermedia (TravelToStartPage). Verificar y pasar.
			const url = await getUrl(driver);
			log(`  URL actual: ${url}`);
			await dumpScreen(driver, 'P3-url-check');

			if (url.includes('TravelToStartPage')) {
				// Empezar viaje → modal Si → esperar InProgress
				log('  Detectado TravelToStartPage — pasando...');
				await driver.execute<void, []>(() => {
					const btns = Array.from(document.querySelectorAll('app-page-travel-to-start button')) as HTMLButtonElement[];
					const empezar = btns.find(b => (b.innerText ?? '').trim() === 'Empezar Viaje' && b.offsetParent !== null);
					if (empezar) empezar.click();
				});
				await driver.pause(1_500);
				// Modal Si
				await driver.execute<void, []>(() => {
					const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
					const visible = modals.find(m => m.offsetParent !== null);
					const btn = visible?.querySelector('button.btn.primary') as HTMLButtonElement | null;
					if (btn && !btn.disabled) btn.click();
				});
				await waitForUrl(driver, 'TravelInProgressPage', 15_000);
			}
		}

		const urlInProgress = await getUrl(driver);
		if (!urlInProgress.includes('TravelInProgressPage')) {
			addStep('P3 TravelInProgressPage', 'FAIL', `URL: ${urlInProgress}`);
			await dumpScreen(driver, 'P3-fail');
			throw new Error('P3 fallido');
		}

		// Selector confirmado: app-page-travel-in-progress ion-footer ion-toolbar div.btn-finish-container button
		const tappedFinalizar = await driver.execute<boolean, []>(() => {
			const containers = Array.from(document.querySelectorAll('app-page-travel-in-progress')) as HTMLElement[];
			const active = containers.find(c => c.offsetParent !== null);
			if (!active) return false;
			const btn = active.querySelector('ion-footer ion-toolbar div.btn-finish-container button') as HTMLButtonElement | null;
			if (btn && btn.offsetParent !== null && !btn.disabled) { btn.click(); return true; }
			// Fallback: cualquier button.btn.finish visible
			const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
			const finish = btns.find(b => (b.innerText ?? '').trim() === 'Finalizar Viaje' && b.offsetParent !== null && !b.disabled);
			if (finish) { finish.click(); return true; }
			return false;
		});

		if (!tappedFinalizar) {
			addStep('P3 tap Finalizar Viaje', 'FAIL');
			await dumpScreen(driver, 'P3-fail-btn');
			throw new Error('P3 Finalizar fallido');
		}
		addStep('P3 tap Finalizar Viaje', 'OK', 'ion-footer div.btn-finish-container button');
		await driver.pause(1_500);

		// ── P4. Modal "¿Finalizar Viaje?" → Si ───────────────────────────────
		log('\n── P4. Modal finalizar → Si ──');
		const tappedSiFin: boolean[] = [];
		for (let attempt = 0; attempt < 5; attempt++) {
			const tapped = await driver.execute<boolean, []>(() => {
				const modals = Array.from(document.querySelectorAll('app-confirm-modal')) as HTMLElement[];
				const visible = modals.find(m => m.offsetParent !== null);
				if (!visible) return false;
				const btn = visible.querySelector('button.btn.primary') as HTMLButtonElement | null;
				if (btn && btn.offsetParent !== null && !btn.disabled) { btn.click(); return true; }
				return false;
			});
			if (tapped) { tappedSiFin.push(true); break; }
			await driver.pause(600);
		}
		if (!tappedSiFin.length) {
			addStep('P4 modal Si (fin)', 'FAIL');
			await dumpScreen(driver, 'P4-fail');
			throw new Error('P4 fallido');
		}
		addStep('P4 modal Si (fin)', 'OK');
		await driver.pause(3_000);

		// ── P5-P6. TravelResumePage — loop de cierre ──────────────────────────
		// El cierre puede requerir múltiples iteraciones:
		//   Iter 1: "Cerrar Viaje" habilitado (sin botones de pago) → tap
		//           → aparecen button.payment y "Cerrar Viaje" se deshabilita
		//   Iter 2: tap button.payment.active (o button.payment) para re-habilitar
		//           → tap "Cerrar Viaje" de nuevo → aparece credit-card-payment-data
		log('\n── P5-P6. TravelResumePage → loop cierre ──');
		const onResume = await waitForUrl(driver, 'TravelResumePage', 20_000);
		if (!onResume) {
			addStep('P5 TravelResumePage', 'FAIL');
			await dumpScreen(driver, 'P5-fail');
			throw new Error('P5-P6 fallido: no llegó a TravelResumePage');
		}
		await dumpScreen(driver, 'P5-resume-initial');

		const MAX_RESUME_ITER = 5;
		let resumeIter = 0;
		let resumeDone = false;

		while (resumeIter < MAX_RESUME_ITER) {
			resumeIter++;
			await switchWV(driver);
			const resumeUrl = await getUrl(driver);

			// Si ya salió de TravelResumePage → el modal de tarjeta debería aparecer
			if (!resumeUrl.includes('TravelResumePage')) { resumeDone = true; break; }

			// Verificar si credit-card-payment-data ya está visible
			const modalVisible = await driver.execute<boolean, []>(() => {
				const m = document.querySelector('credit-card-payment-data') as HTMLElement | null;
				return !!(m && m.offsetParent !== null);
			});
			if (modalVisible) { resumeDone = true; break; }

			// Paso A: tap button.payment si está visible (habilita "Cerrar Viaje")
			const tappedPayBtn = await driver.execute<boolean, []>(() => {
				const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
				const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
				if (!active) return false;
				// Buscar cualquier button.payment visible (con o sin texto)
				const payBtns = Array.from(active.querySelectorAll(
					'button.payment, button[class*="payment"], div.travel-payment button, ion-col button'
				)) as HTMLButtonElement[];
				const visible = payBtns.find(b => b.offsetParent !== null);
				if (visible) { visible.click(); return true; }
				return false;
			});
			if (tappedPayBtn) {
				addStep(`P5.${resumeIter} tap payment button`, 'OK');
				await driver.pause(800);
			}

			// Paso B: tap "Cerrar Viaje" / "Firmar y Cerrar viaje" si está habilitado
			const tappedClose = await driver.execute<string, []>(() => {
				const containers = Array.from(document.querySelectorAll('app-travel-resume')) as HTMLElement[];
				const active = containers.find(c => c.offsetParent !== null) ?? containers[0];
				if (!active) return '';
				// Intento 1: ion-footer button (selector confirmado)
				const footerBtn = active.querySelector('ion-footer ion-toolbar button') as HTMLButtonElement | null;
				if (footerBtn && footerBtn.offsetParent !== null && !footerBtn.disabled) {
					footerBtn.click();
					return (footerBtn.innerText ?? 'ion-footer button').trim() || 'ion-footer button';
				}
				// Intento 2: por texto
				const CLOSE_TEXTS = ['Cerrar Viaje', 'Firmar y Cerrar viaje', 'Finalizar Viaje'];
				const btns = Array.from(active.querySelectorAll('button')) as HTMLButtonElement[];
				for (const txt of CLOSE_TEXTS) {
					const btn = btns.find(b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled);
					if (btn) { btn.click(); return txt; }
				}
				return '';
			});

			if (tappedClose) {
				addStep(`P6.${resumeIter} tap "${tappedClose}"`, 'OK');
				await driver.pause(2_500);
			} else if (!tappedPayBtn) {
				// Ni pago ni cerrar — estado bloqueado
				addStep(`P5-P6 iter ${resumeIter}`, 'FAIL', 'ni payment ni close habilitados');
				await dumpScreen(driver, `P5P6-iter${resumeIter}-blocked`);
				throw new Error('P5-P6 bloqueado');
			}
		}

		if (!resumeDone) {
			addStep('P5-P6 loop cierre', 'FAIL', `TravelResumePage persiste después de ${MAX_RESUME_ITER} iteraciones`);
			await dumpScreen(driver, 'P5P6-max-iter-fail');
			throw new Error('P5-P6 loop agotado');
		}
		addStep('P5-P6 loop cierre', 'OK', `${resumeIter} iteración(es)`);

		// ── P7. Modal credit-card-payment-data → ingresar datos tarjeta ───────
		// Condicional: solo aparece cuando el pasajero usa "tarjeta a bordo".
		// Si el loop ya cerró el viaje con tarjeta guardada, estamos en home → skip.
		log('\n── P7. Formulario ingreso de tarjeta ──');

		const urlAfterLoop = await getUrl(driver);
		if (urlAfterLoop.includes('/navigator/home') || urlAfterLoop.includes('FROM_TRAVEL_CLOSED')) {
			// Viaje cerrado con tarjeta guardada — no se necesita ingreso de tarjeta
			addStep('P7 modal credit-card-payment-data', 'SKIP', 'viaje cerrado con tarjeta guardada — sin ingreso manual');
			addStep('P8 tap Cobrar', 'SKIP', 'no aplica');
			addStep('P9 3DS', 'SKIP', 'no aplica');
			// Saltar directo a P10
			const closedFlag = urlAfterLoop.includes('FROM_TRAVEL_CLOSED');
			addStep('P10 home post-cierre', 'OK', closedFlag ? 'FROM_TRAVEL_CLOSED ✓' : urlAfterLoop.split('/').pop() ?? '');
			await dumpScreen(driver, 'P10-home-final');
			return; // Fin del flujo — salir del try
		}

		await dumpScreen(driver, 'P7-card-form');

		// Esperar que aparezca el modal credit-card-payment-data (tarjeta a bordo)
		let cardFormVisible = false;
		const cardFormDeadline = Date.now() + 15_000;
		while (Date.now() < cardFormDeadline) {
			cardFormVisible = await driver.execute<boolean, []>(() => {
				const modal = document.querySelector('credit-card-payment-data') as HTMLElement | null;
				return !!(modal && modal.offsetParent !== null);
			});
			if (cardFormVisible) break;
			await driver.pause(600);
		}

		if (!cardFormVisible) {
			addStep('P7 modal credit-card-payment-data', 'FAIL', 'modal no apareció — verificar que el pasajero tenga "tarjeta a bordo" como método de pago');
			await dumpScreen(driver, 'P7-fail-no-modal');
			throw new Error('P7 fallido — modal de tarjeta no apareció');
		}
		addStep('P7 modal credit-card-payment-data', 'OK');

		// P7a. Número de tarjeta
		// Selector: #root > form > span:nth-child(4) > div > div > div.CardNumberField-input-wrapper > span > input
		const filledCardNum = await fillInput(
			driver,
			'div.CardNumberField-input-wrapper span input, #root input[autocomplete*="cardnumber"], #root input[name*="cardnumber"]',
			CARD_NUMBER
		);
		if (filledCardNum) {
			addStep('P7a número tarjeta', 'OK', CARD_NUMBER.replace(/\d(?=\d{4})/g, '*'));
		} else {
			// Fallback: buscar por posición en el formulario
			const filled = await driver.execute<boolean, []>(() => {
				const form = document.querySelector('#root form, credit-card-payment-data form') as HTMLFormElement | null;
				if (!form) return false;
				const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[];
				const numInput = inputs.find(i => i.offsetParent !== null && (i.type === 'text' || i.type === 'tel' || i.type === 'number'));
				if (numInput) {
					numInput.focus();
					numInput.value = '';
					return true; // se usa setValue desde fuera
				}
				return false;
			});
			if (filled) {
				const el = await driver.$('#root form input:first-of-type, credit-card-payment-data input');
				await el.setValue(CARD_NUMBER);
				addStep('P7a número tarjeta (fallback)', 'OK');
			} else {
				addStep('P7a número tarjeta', 'SKIP', 'input no encontrado — revisar dump P7-card-form');
			}
		}
		await driver.pause(500);

		// P7b. Vencimiento
		// Selector: #root > form > span:nth-child(4) > div > span > input  (1er input de span)
		const filledExpiry = await fillInput(
			driver,
			'input[placeholder*="MM"], input[placeholder*="mes"], input[autocomplete*="exp"], input[name*="exp"]',
			CARD_EXPIRY
		);
		addStep('P7b vencimiento', filledExpiry ? 'OK' : 'SKIP',
			filledExpiry ? CARD_EXPIRY : 'input no encontrado — revisar dump P7-card-form');
		await driver.pause(500);

		// P7c. CVC
		// Selector: #root > form > span:nth-child(4) > div > span > input  (2do input del mismo grupo)
		const filledCvc = await fillInput(
			driver,
			'input[placeholder*="CVC"], input[placeholder*="cvc"], input[placeholder*="CVV"], input[autocomplete*="csc"]',
			CARD_CVC
		);
		addStep('P7c CVC', filledCvc ? 'OK' : 'SKIP',
			filledCvc ? '***' : 'input no encontrado — revisar dump P7-card-form');
		await driver.pause(500);

		// P7d. Titular — selector confirmado: #cardholderName > input
		const filledName = await fillInput(driver, '#cardholderName input, #cardholderName > input', CARD_NAME);
		addStep('P7d titular', filledName ? 'OK' : 'SKIP', filledName ? CARD_NAME : 'no encontrado');
		await driver.pause(500);

		// P7e. ZIP — selector confirmado: #zipCode > input
		const filledZip = await fillInput(driver, '#zipCode input, #zipCode > input', CARD_ZIP);
		addStep('P7e ZIP', filledZip ? 'OK' : 'SKIP', filledZip ? CARD_ZIP : 'no encontrado');
		await driver.pause(500);

		await dumpScreen(driver, 'P7-after-fill');

		// ── P8. Tap "Cobrar" ───────────────────────────────────────────────────
		log('\n── P8. Tap Cobrar ──');

		// Selector confirmado: credit-card-payment-data ion-content form button
		// El botón se habilita solo cuando los datos son válidos
		let tappedCobrar = false;
		const cobrarDeadline = Date.now() + 15_000;
		while (Date.now() < cobrarDeadline) {
			tappedCobrar = await driver.execute<boolean, []>(() => {
				const modal = document.querySelector('credit-card-payment-data') as HTMLElement | null;
				if (!modal || modal.offsetParent === null) return false;
				const btn = modal.querySelector('ion-content form button') as HTMLButtonElement | null;
				if (btn && btn.offsetParent !== null && !btn.disabled) {
					btn.click();
					return true;
				}
				return false;
			});
			if (tappedCobrar) break;
			await driver.pause(800);
		}

		if (!tappedCobrar) {
			addStep('P8 tap Cobrar', 'FAIL', 'botón deshabilitado o no encontrado — datos de tarjeta inválidos o campos sin llenar');
			await dumpScreen(driver, 'P8-fail-cobrar');
			throw new Error('P8 fallido — Cobrar no habilitado');
		}
		addStep('P8 tap Cobrar', 'OK', 'credit-card-payment-data form button');
		await driver.pause(3_000);

		// ── P9. 3DS (si aplica) ────────────────────────────────────────────────
		log('\n── P9. Verificar 3DS ──');
		const threeDsResult = await handle3DS(driver);
		addStep('P9 3DS', threeDsResult === 'completed' ? 'OK' : 'SKIP',
			threeDsResult === 'completed' ? 'popup Visa completado' : 'no detectado');
		await driver.pause(3_000);

		// ── P10. Verificar home post-cierre ────────────────────────────────────
		log('\n── P10. Verificar home post-cierre ──');
		const onHome = await waitForUrl(driver, '/navigator/home', 25_000);
		const finalUrl = await getUrl(driver);
		const closedFlag = finalUrl.includes('FROM_TRAVEL_CLOSED');
		addStep('P10 home post-cierre', onHome ? 'OK' : 'FAIL',
			onHome ? (closedFlag ? 'FROM_TRAVEL_CLOSED ✓' : `home sin flag — ${finalUrl.split('/').pop()}`) : finalUrl);
		await dumpScreen(driver, 'P10-home-final');

	} finally {
		// ── Reporte ────────────────────────────────────────────────────────────
		log('\n════════════════════════════════════════');
		log('REPORTE VIAJE CALLE FLOW');
		log('════════════════════════════════════════');
		for (const r of report) {
			const icon = r.status === 'OK' ? '✓' : r.status === 'SKIP' ? '⚠' : '✗';
			log(`${icon} ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
		}
		const ok   = report.filter(r => r.status === 'OK').length;
		const fail = report.filter(r => r.status === 'FAIL').length;
		const skip = report.filter(r => r.status === 'SKIP').length;
		log(`\nResultado: ${ok} OK | ${fail} FAIL | ${skip} SKIP de ${report.length} pasos`);
		const allCritical = report.filter(r => !r.step.includes('SKIP')).every(r => r.status !== 'FAIL');
		log(allCritical && fail === 0 ? '\n🎉 FLUJO COMPLETO: PASS' : '\n⚠ FLUJO CON ERRORES — revisar pasos FAIL');
		log('════════════════════════════════════════\n');

		mkdirSync('evidence/reports', { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		writeFileSync(
			join('evidence/reports', `viaje-calle-flow-${ts}.json`),
			JSON.stringify({ timestamp: new Date().toISOString(), card: CARD_NUMBER, steps: report }, null, 2),
			'utf-8'
		);
		log('✓ Reporte JSON guardado en evidence/reports/');
		await driver.deleteSession();
	}
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
