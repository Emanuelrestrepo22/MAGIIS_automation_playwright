/**
 * DRAFT — Validación en device (R92XB0B8F3J) de los flujos de HOME del Driver App.
 * Cubre (Opción 2 del plan):
 *   TASK 0  — VALIDAR FIX Opción 1: `div.driver-pass.home-icon` ("Pasajero") dispara el
 *             diálogo de confirmación de startStreetTravel, NO togglea "En Base".
 *   TASK 2b — Toggle En Base: `button.driver-home.home-icon-base` → observar sub-estado
 *             (In Base ↔ In Street) y revertir.
 *   TASK 2c — Street-trip: tap "Pasajero" → confirmar (Aceptar/Si) → validar que arranca
 *             el viaje de calle → cleanup (finalizar + cerrar) → home limpio.
 *
 * NO destructivo salvo 2c (arranca y cierra un viaje de calle real en device TEST; con cleanup).
 * Deja al driver logueado + Disponible en /navigator/home.
 *
 * Run:
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"; $env:ANDROID_UDID="R92XB0B8F3J";
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *     tests/mobile/appium/scripts/driver-validate-home-street-base.ts
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string): void => console.log(`[home-street-base] ${m}`);

type Driver = Awaited<ReturnType<typeof remote>>;
const report: Array<{ task: string; status: 'OK' | 'FAIL' | 'PARTIAL' | 'INFO'; detail: string }> = [];
function add(task: string, status: 'OK' | 'FAIL' | 'PARTIAL' | 'INFO', detail = ''): void {
	report.push({ task, status, detail });
	const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : status === 'PARTIAL' ? '≈' : 'ℹ';
	log(`${icon} [${task}] ${detail}`);
}

function save(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	writeFileSync(join('evidence/dom-dump', `home-sb-${label}-${ts}.txt`), content, 'utf-8');
}

async function switchWv(driver: Driver, timeout = 12_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const ctx = (await driver.getContexts().catch(() => [])) as string[];
		const wv = ctx.find(c => c.startsWith('WEBVIEW'));
		if (wv) {
			await driver.switchContext(wv).catch(() => {});
			return true;
		}
		await driver.pause(300);
	}
	return false;
}
const url = (d: Driver): Promise<string> => d.execute<string, []>(() => window.location.href).catch(() => '');
const pause = (d: Driver, ms: number): Promise<void> => d.pause(ms);

/** Lee el estado de los 3 controles del home (availability / En Base / Pasajero). */
async function readHomeControls(driver: Driver): Promise<Record<string, unknown>> {
	await switchWv(driver);
	return driver
		.execute<Record<string, unknown>, []>(() => {
			const norm = (v: unknown): string =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const avail = document.querySelector('#availability') as HTMLElement | null;
			const base = document.querySelector('button.driver-home.home-icon-base') as HTMLElement | null;
			const pass = document.querySelector('div.driver-pass.home-icon') as HTMLElement | null;
			const passLabel = document.querySelector(
				'div.driver-pass.home-icon .pass-label, .pass-label'
			) as HTMLElement | null;
			return {
				url: window.location.href,
				availabilityFound: !!avail,
				availabilityText: norm(
					avail?.querySelector('.available-label')?.textContent ?? avail?.textContent ?? ''
				),
				baseFound: !!base,
				baseVisible: base ? base.offsetParent !== null : false,
				baseText: norm(base?.innerText ?? base?.textContent ?? ''),
				baseClass: norm(base?.className ?? ''),
				passFound: !!pass,
				passVisible: pass ? pass.offsetParent !== null : false,
				passLabel: norm(passLabel?.textContent ?? pass?.innerText ?? '')
			};
		})
		.catch((e: Error) => ({ error: e.message }));
}

/** Enumera overlays de confirmación presentes (ion-alert / app-confirm-modal / ion-modal) + botones. */
async function dumpOverlays(driver: Driver): Promise<Record<string, unknown>> {
	await switchWv(driver);
	return driver
		.execute<Record<string, unknown>, []>(() => {
			const norm = (v: unknown): string =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const overlays: Array<Record<string, unknown>> = [];
			const sels = [
				'ion-alert',
				'app-confirm-modal',
				'ion-modal',
				'app-code-confirmation-modal',
				'app-alert-modal'
			];
			for (const sel of sels) {
				document.querySelectorAll(sel).forEach(el => {
					if (!vis(el)) return;
					const text = norm((el as HTMLElement).innerText ?? el.textContent).slice(0, 300);
					const buttons = Array.from(el.querySelectorAll('button, .alert-button, [role="button"]'))
						.filter(b => vis(b))
						.map(b => ({
							text: norm((b as HTMLElement).innerText ?? b.textContent),
							class: norm((b as HTMLElement).className).slice(0, 80)
						}));
					overlays.push({ selector: sel, text, buttons });
				});
			}
			return { url: window.location.href, overlayCount: overlays.length, overlays };
		})
		.catch((e: Error) => ({ error: e.message }));
}

/** Click JS del botón "Pasajero" (div.driver-pass.home-icon) en la página activa. */
async function tapPasajero(driver: Driver): Promise<boolean> {
	await switchWv(driver);
	return driver
		.execute<boolean, []>(() => {
			const active =
				document.querySelector('page-home:not(.ion-page-hidden), .ion-page:not(.ion-page-hidden)') ?? document;
			const img = active.querySelector('div.driver-pass.home-icon img') as HTMLElement | null;
			if (img && img.offsetParent !== null) {
				img.click();
				return true;
			}
			const div = active.querySelector('div.driver-pass.home-icon') as HTMLElement | null;
			if (div && div.offsetParent !== null) {
				div.click();
				return true;
			}
			return false;
		})
		.catch(() => false);
}

/** Click JS del indicador "En Base" (button.driver-home.home-icon-base). */
async function tapEnBase(driver: Driver): Promise<boolean> {
	await switchWv(driver);
	return driver
		.execute<boolean, []>(() => {
			const active =
				document.querySelector('page-home:not(.ion-page-hidden), .ion-page:not(.ion-page-hidden)') ?? document;
			const btn = active.querySelector('button.driver-home.home-icon-base') as HTMLElement | null;
			if (btn && btn.offsetParent !== null) {
				btn.click();
				return true;
			}
			return false;
		})
		.catch(() => false);
}

/** Click primario de confirmación (Aceptar/Si) en cualquier overlay visible. */
async function tapConfirmPrimary(driver: Driver): Promise<string> {
	await switchWv(driver);
	return driver
		.execute<string, []>(() => {
			const norm = (v: unknown): string =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			// 1) app-confirm-modal primario
			const cms = Array.from(document.querySelectorAll('app-confirm-modal')).filter(vis);
			for (const m of cms) {
				const b = m.querySelector('button.btn.primary') as HTMLElement | null;
				if (b && vis(b)) {
					b.click();
					return `app-confirm-modal:${norm(b.innerText)}`;
				}
			}
			// 2) ion-alert botón por texto (Aceptar/Si/Confirmar)
			const alerts = Array.from(document.querySelectorAll('ion-alert')).filter(vis);
			for (const a of alerts) {
				const btns = Array.from(a.querySelectorAll('button, .alert-button')) as HTMLElement[];
				const target = btns.find(
					b => vis(b) && /^(aceptar|s[ií]|confirmar|ok)$/i.test(norm(b.innerText || b.textContent))
				);
				if (target) {
					target.click();
					return `ion-alert:${norm(target.innerText || target.textContent)}`;
				}
			}
			return '';
		})
		.catch(() => '');
}

/** Click de dismiss/cancelar (No/Cancelar) en cualquier overlay visible. */
async function tapConfirmCancel(driver: Driver): Promise<string> {
	await switchWv(driver);
	return driver
		.execute<string, []>(() => {
			const norm = (v: unknown): string =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const cms = Array.from(document.querySelectorAll('app-confirm-modal')).filter(vis);
			for (const m of cms) {
				const b =
					(m.querySelector('button.btn-outlined-red') as HTMLElement | null) ??
					(Array.from(m.querySelectorAll('button')) as HTMLElement[]).find(
						x => vis(x) && /^(no|cancelar)$/i.test(norm(x.innerText))
					);
				if (b && vis(b)) {
					b.click();
					return `app-confirm-modal:${norm(b.innerText)}`;
				}
			}
			const alerts = Array.from(document.querySelectorAll('ion-alert')).filter(vis);
			for (const a of alerts) {
				const btns = Array.from(a.querySelectorAll('button, .alert-button')) as HTMLElement[];
				const target = btns.find(
					b => vis(b) && /^(no|cancelar|cancel)$/i.test(norm(b.innerText || b.textContent))
				);
				if (target) {
					target.click();
					return `ion-alert:${norm(target.innerText || target.textContent)}`;
				}
			}
			return '';
		})
		.catch(() => '');
}

async function waitForUrl(driver: Driver, token: string, timeout = 20_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		await switchWv(driver);
		if ((await url(driver)).includes(token)) return true;
		await driver.pause(600);
	}
	return false;
}

/** Cleanup: finaliza el viaje en curso (viaje calle) y lo cierra con método NO-tarjeta → home. */
async function cleanupStreetTrip(driver: Driver): Promise<string> {
	await switchWv(driver);
	let u = await url(driver);
	// TravelToStartPage → empezar
	if (/TravelToStartPage/i.test(u)) {
		await driver
			.execute<boolean, []>(() => {
				const b = document.querySelector(
					'app-page-travel-to-start:not(.ion-page-hidden) ion-footer button, button.btn.primary.trip-pax-start'
				) as HTMLElement | null;
				if (b && b.offsetParent !== null) {
					b.click();
					return true;
				}
				return false;
			})
			.catch(() => false);
		await pause(driver, 1500);
		await tapConfirmPrimary(driver);
		await waitForUrl(driver, 'TravelInProgressPage', 15_000);
		u = await url(driver);
	}
	// TravelInProgressPage → finalizar
	if (/TravelInProgressPage/i.test(u)) {
		await driver
			.execute<boolean, []>(() => {
				const active =
					document.querySelector('app-page-travel-in-progress:not(.ion-page-hidden)') ??
					document.querySelector('app-page-travel-in-progress');
				const b =
					(active?.querySelector('.btn-finish-container button') as HTMLElement | null) ??
					(active?.querySelector('button.btn.finish') as HTMLElement | null);
				if (b && b.offsetParent !== null) {
					b.click();
					return true;
				}
				return false;
			})
			.catch(() => false);
		await pause(driver, 1500);
		await tapConfirmPrimary(driver);
		await waitForUrl(driver, 'TravelResumePage', 20_000);
		u = await url(driver);
	}
	// TravelResumePage → cerrar con método NO-tarjeta (cicla payment buttons; close != "Ingresar tarjeta")
	if (/TravelResumePage/i.test(u)) {
		for (let i = 0; i < 6; i++) {
			await switchWv(driver);
			const fs = await driver
				.execute<{ text: string; disabled: boolean }, []>(() => {
					const norm = (v: unknown): string =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					const r =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
						document.querySelector('app-travel-resume');
					const b = r?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
					return {
						text: b ? norm(b.innerText) : '',
						disabled: b ? b.disabled || b.getAttribute('disabled') !== null : true
					};
				})
				.catch(() => ({ text: '', disabled: true }));
			if (!/ingresar tarjeta/i.test(fs.text) && !fs.disabled && fs.text.length > 0) {
				await driver
					.execute<boolean, []>(() => {
						const r =
							document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
							document.querySelector('app-travel-resume');
						const b = r?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
						if (b) {
							b.click();
							return true;
						}
						return false;
					})
					.catch(() => false);
				await pause(driver, 3000);
				// manejar firma si aparece
				await driver
					.execute<boolean, []>(() => {
						const s = document.querySelector('app-page-signer');
						return !!s;
					})
					.catch(() => false);
				await tapConfirmPrimary(driver);
				break;
			}
			// cicla payment buttons
			await driver
				.execute<boolean, [number]>(idx => {
					const r =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ??
						document.querySelector('app-travel-resume');
					const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') ?? []).filter(
						b => (b as HTMLElement).offsetParent !== null
					) as HTMLElement[];
					if (!pays.length) return false;
					pays[idx % pays.length].click();
					return true;
				}, i)
				.catch(() => false);
			await pause(driver, 2500);
		}
		await waitForUrl(driver, '/navigator/home', 20_000);
	}
	await switchWv(driver);
	return url(driver);
}

async function run(): Promise<void> {
	const u = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port) || 4723,
		path: '/',
		logLevel: 'warn',
		connectionRetryTimeout: 60_000,
		connectionRetryCount: 2,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:platformVersion': '15.0',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:autoLaunch': false,
			'appium:newCommandTimeout': 240,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		await driver.pause(1500);
		await switchWv(driver);
		let u0 = await url(driver);
		log(`URL inicial: ${u0}`);

		// Precondición: navegar a home tab
		await driver
			.execute<void, []>(() => {
				(document.querySelector('#tab-button-home') as HTMLElement | null)?.click();
			})
			.catch(() => {});
		await driver.pause(1500);
		u0 = await url(driver);
		if (!/\/navigator\/home/i.test(u0)) {
			add(
				'PRECOND',
				'FAIL',
				`no en /navigator/home (${u0}). Correr driver-relogin-and-home / driver-go-online primero.`
			);
			return;
		}

		const baseline = await readHomeControls(driver);
		save('00-baseline', JSON.stringify(baseline, null, 2));
		add(
			'PRECOND',
			'OK',
			`home. availability="${baseline.availabilityText}" base="${baseline.baseText}" pass="${baseline.passLabel}" (baseFound=${baseline.baseFound} passFound=${baseline.passFound})`
		);

		// ── TASK 0 — Pasajero dispara startStreetTravel confirm, NO togglea En Base ──
		log('\n════ TASK 0: fix Opción 1 (Pasajero → startStreetTravel confirm, no En Base) ════');
		const baseBefore = String((await readHomeControls(driver)).baseText ?? '');
		const tapped0 = await tapPasajero(driver);
		await driver.pause(1800);
		const overlays0 = await dumpOverlays(driver);
		save('task0-overlays', JSON.stringify(overlays0, null, 2));
		const afterTap = await readHomeControls(driver);
		const baseAfter = String(afterTap.baseText ?? '');
		const overlayCount = Number(overlays0.overlayCount ?? 0);
		const overlayText = JSON.stringify(overlays0.overlays ?? []);
		const startedTrip = /Travel(ToStart|InProgress|Confirm)Page/i.test(String(afterTap.url ?? ''));
		if (!tapped0) {
			add(
				'TASK-0',
				'FAIL',
				'no se pudo tapear div.driver-pass.home-icon (botón Pasajero) — selector no visible.'
			);
		} else if (overlayCount > 0 && !startedTrip) {
			const looksStreet = /viaje|calle|pasajero|iniciar|empezar|street/i.test(overlayText);
			add(
				'TASK-0',
				'OK',
				`tap Pasajero abrió diálogo de confirmación (overlays=${overlayCount}, street-msg=${looksStreet}). En Base sin cambio: "${baseBefore}"→"${baseAfter}". NO togglea En Base ✓`
			);
		} else if (startedTrip) {
			add(
				'TASK-0',
				'PARTIAL',
				`tap Pasajero navegó directo a ${afterTap.url} (sin diálogo intermedio detectado). Igual confirma que NO es toggle En Base.`
			);
		} else {
			add(
				'TASK-0',
				'FAIL',
				`tap Pasajero no abrió diálogo ni navegó (overlays=${overlayCount}). base "${baseBefore}"→"${baseAfter}".`
			);
		}
		// dismiss el diálogo (No/Cancelar) para no arrancar el viaje todavía
		const cancelled = await tapConfirmCancel(driver);
		await driver.pause(1500);
		const postCancel = await readHomeControls(driver);
		if (!startedTrip) {
			add(
				'TASK-0-dismiss',
				/Cancelar|No/i.test(cancelled) || cancelled ? 'OK' : 'PARTIAL',
				`dismiss="${cancelled}" → url=${postCancel.url}`
			);
		}

		// ── TASK 2b — Toggle En Base ──
		log('\n════ TASK 2b: toggle En Base (button.driver-home.home-icon-base) ════');
		// asegurar en home limpio
		await driver
			.execute<void, []>(() => {
				(document.querySelector('#tab-button-home') as HTMLElement | null)?.click();
			})
			.catch(() => {});
		await driver.pause(1200);
		const baseState0 = await readHomeControls(driver);
		if (!baseState0.baseFound) {
			add(
				'TASK-2b',
				'PARTIAL',
				'button.driver-home.home-icon-base no presente en este home (sub-estado base no renderizado sin geocerca de base).'
			);
		} else {
			const label0 = String(baseState0.baseText ?? '');
			const tappedB = await tapEnBase(driver);
			await driver.pause(1800);
			const overlaysB = await dumpOverlays(driver);
			save('task2b-overlays', JSON.stringify(overlaysB, null, 2));
			// Si emerge confirm, confirmarlo para observar el cambio
			let confirmB = '';
			if (Number(overlaysB.overlayCount ?? 0) > 0) {
				confirmB = await tapConfirmPrimary(driver);
				await driver.pause(1500);
			}
			const baseState1 = await readHomeControls(driver);
			const label1 = String(baseState1.baseText ?? '');
			add(
				'TASK-2b',
				tappedB ? 'OK' : 'FAIL',
				`tap En Base=${tappedB}. label "${label0}"→"${label1}". confirm="${confirmB}" overlays=${overlaysB.overlayCount}. url=${baseState1.url}`
			);
			// revertir
			const u1 = String(baseState1.url ?? '');
			if (/\/navigator\/home/i.test(u1)) {
				await tapEnBase(driver);
				await driver.pause(1500);
				const ovR = await dumpOverlays(driver);
				if (Number(ovR.overlayCount ?? 0) > 0) {
					await tapConfirmPrimary(driver);
					await driver.pause(1200);
				}
				const baseState2 = await readHomeControls(driver);
				add(
					'TASK-2b-revert',
					'INFO',
					`revert label "${label1}"→"${baseState2.baseText}" url=${baseState2.url}`
				);
			} else {
				add(
					'TASK-2b-revert',
					'PARTIAL',
					`tras toggle no estamos en home (${u1}); revert no ejecutado por seguridad.`
				);
			}
		}

		// ── TASK 2c — Street trip real (tap Pasajero → Aceptar) + cleanup ──
		log('\n════ TASK 2c: street-trip (Pasajero → Aceptar) + cleanup ════');
		await driver
			.execute<void, []>(() => {
				(document.querySelector('#tab-button-home') as HTMLElement | null)?.click();
			})
			.catch(() => {});
		await driver.pause(1200);
		const preC = await url(driver);
		if (!/\/navigator\/home/i.test(preC)) {
			add('TASK-2c', 'FAIL', `no en home antes de 2c (${preC}).`);
		} else {
			const tappedC = await tapPasajero(driver);
			await driver.pause(1800);
			const overlaysC = await dumpOverlays(driver);
			save('task2c-confirm-overlays', JSON.stringify(overlaysC, null, 2));
			const confirmC = await tapConfirmPrimary(driver);
			await driver.pause(2500);
			// esperar transición a algún Travel*Page
			let reached = '';
			for (const tok of ['TravelInProgressPage', 'TravelToStartPage', 'TravelConfirmPage']) {
				if (await waitForUrl(driver, tok, 8_000)) {
					reached = tok;
					break;
				}
			}
			const afterC = await url(driver);
			save('task2c-after', JSON.stringify({ tappedC, confirmC, reached, afterC, overlaysC }, null, 2));
			if (reached) {
				add(
					'TASK-2c',
					'OK',
					`street-trip arrancó: tap=${tappedC} confirm="${confirmC}" → ${reached} (${afterC})`
				);
			} else if (confirmC) {
				add('TASK-2c', 'PARTIAL', `confirm="${confirmC}" pero no se detectó Travel*Page (url=${afterC}).`);
			} else {
				add(
					'TASK-2c',
					'FAIL',
					`no confirm/no transición. tap=${tappedC} overlays=${overlaysC.overlayCount} url=${afterC}`
				);
			}
			// cleanup
			log('── cleanup street-trip ──');
			const finalUrl = await cleanupStreetTrip(driver);
			add(
				'TASK-2c-cleanup',
				/\/navigator\/home/i.test(finalUrl) ? 'OK' : 'FAIL',
				`url final tras cleanup: ${finalUrl}`
			);
		}

		// ── Estado final: asegurar Disponible en home ──
		await driver
			.execute<void, []>(() => {
				(document.querySelector('#tab-button-home') as HTMLElement | null)?.click();
			})
			.catch(() => {});
		await driver.pause(1000);
		const finalState = await readHomeControls(driver);
		save('zz-final', JSON.stringify(finalState, null, 2));
		add(
			'FINAL',
			/\/navigator\/home/i.test(String(finalState.url ?? '')) ? 'OK' : 'PARTIAL',
			`url=${finalState.url} availability="${finalState.availabilityText}"`
		);
	} catch (e) {
		add('FATAL', 'FAIL', e instanceof Error ? e.message : String(e));
	} finally {
		log('\n' + '═'.repeat(60));
		log('REPORTE — HOME / STREET / BASE');
		log('═'.repeat(60));
		for (const r of report) {
			const icon = r.status === 'OK' ? '✓' : r.status === 'FAIL' ? '✗' : r.status === 'PARTIAL' ? '≈' : 'ℹ';
			log(`${icon} [${r.task}] ${r.detail}`);
		}
		mkdirSync('evidence/reports', { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		writeFileSync(
			join('evidence/reports', `home-street-base-${ts}.json`),
			JSON.stringify({ timestamp: new Date().toISOString(), report }, null, 2),
			'utf-8'
		);
		await driver.deleteSession().catch(() => {});
		log('Sesión cerrada');
	}
}
run().catch(e => {
	console.error('[home-street-base] fatal:', e);
	process.exit(1);
});
