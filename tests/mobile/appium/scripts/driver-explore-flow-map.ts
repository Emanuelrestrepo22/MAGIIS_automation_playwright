/**
 * DRAFT — Live flow-map explorer for the Driver App (physical device).
 * Non-destructive controlled tour: enumerates interactive elements per screen
 * (real selectors), navigates safe paths, records transitions, returns home.
 *
 * NOT committed to main. Companion doc: docs/mobile/driver-app-appium-flow-map.md
 *
 * Run:
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"; $env:ANDROID_UDID="R92XB0B8F3J";
 *   $env:DRIVER_EMAIL="nuevoemailyo12312213@yopmail.com"; $env:DRIVER_PASSWORD="123";
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *     tests/mobile/appium/scripts/driver-explore-flow-map.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EMAIL = process.env.DRIVER_EMAIL ?? '';
const PASSWORD = process.env.DRIVER_PASSWORD ?? '';
const OUT_DIR =
	process.env.EXPLORE_OUT_DIR ??
	'C:/Users/Erika/AppData/Local/Temp/claude/c--Users-Erika-OneDrive---MAGIIS-USA-LLC--1--Escritorio-automation-projects-magiis-playwright/200063c2-3948-4975-8bf9-16001d37cf9f/scratchpad';
const OUT_JSON = `${OUT_DIR}/driver-flow-map.json`;

const log = (m: string): void => console.log(`[explore] ${m}`);

// Labels that must NEVER be clicked (destructive / dialer / logout).
const BLACKLIST = /logout|cerrar sesi|salir|fuera de servicio|out.?of.?service|eliminar|delete|borrar|desconect/i;

type Interactive = {
	kind: string;
	id: string;
	class: string;
	text: string;
	aria: string;
	role: string;
	selector: string;
	inMenu: boolean;
	disabled: boolean;
	tab?: string;
	href?: string;
	icons?: string[];
	labels?: string[];
};
type ScreenDump = {
	key: string;
	url: string;
	pageTag: string;
	componentTags: string[];
	title: string;
	interactive: Interactive[];
	note?: string;
};
type Transition = { from: string; action: string; selector: string; to: string; toUrl: string };

const screens: ScreenDump[] = [];
const transitions: Transition[] = [];

type Driver = Awaited<ReturnType<typeof remote>>;

async function persist(): Promise<void> {
	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(
		OUT_JSON,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				device: UDID,
				appPackage: APP_PACKAGE,
				screens,
				transitions
			},
			null,
			2
		),
		'utf-8'
	);
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

async function getUrl(driver: Driver): Promise<string> {
	return driver.execute<string, []>(() => window.location.href).catch(() => '');
}

// ── Enumerate interactive elements of the currently visible page (+ tab bar + menu) ──
async function enumerate(driver: Driver, key: string, note?: string): Promise<ScreenDump> {
	await switchWv(driver);
	await driver.pause(500);
	const dump = (await driver
		.execute(() => {
			const norm = (v: unknown): string =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim();
			const vis = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const esc = (s: string): string =>
				window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');
			const selOf = (el: Element): string => {
				const id = norm((el as HTMLElement).id);
				if (id) return '#' + esc(id);
				const tag = el.tagName.toLowerCase();
				const cls = (typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '')
					.trim()
					.split(/\s+/)
					.filter(Boolean);
				if (cls.length) return tag + '.' + cls.slice(0, 4).map(esc).join('.');
				return tag;
			};
			const pages = Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden)'));
			const active = (pages[pages.length - 1] as HTMLElement) ?? document.body;
			const pageTag = active.tagName ? active.tagName.toLowerCase() : '';
			// custom-element tags visible (app-*/page-*) to fingerprint the screen
			const componentTags = Array.from(
				new Set(
					Array.from(document.querySelectorAll('[class*="ion-page"]:not(.ion-page-hidden), app-, page-'))
						.concat(
							Array.from(document.querySelectorAll('*')).filter(
								e => /^(app|page)-/.test(e.tagName.toLowerCase()) && vis(e)
							)
						)
						.map(e => e.tagName.toLowerCase())
						.filter(t => /^(app|page)-/.test(t))
				)
			).slice(0, 25);
			const menu = document.querySelector(
				'ion-menu.show-menu, ion-menu.menu-pane-visible, ion-menu:not([style*="display: none"])'
			);
			const q =
				'button, [role="button"], ion-button, ion-tab-button, ion-menu-button, ion-menu-toggle, a[href], ion-item[button], ion-item[detail], ion-fab-button, ion-toggle, ion-segment-button, ion-back-button, [id="availability"]';
			const seen = new Set<string>();
			const interactive = (Array.from(document.querySelectorAll(q)) as HTMLElement[])
				.filter(vis)
				.map(el => {
					const icons = Array.from(el.querySelectorAll('ion-icon'))
						.map(ic => norm(ic.getAttribute('name') || ic.getAttribute('icon') || ic.getAttribute('src')))
						.filter(Boolean);
					const labels = Array.from(el.querySelectorAll('ion-label, .label, span'))
						.map(l => norm(l.textContent))
						.filter(Boolean)
						.slice(0, 3);
					const item = {
						kind: el.tagName.toLowerCase(),
						id: norm(el.id),
						class: norm(typeof el.className === 'string' ? el.className : ''),
						text: norm(el.innerText || el.textContent).slice(0, 60),
						aria: norm(
							el.getAttribute('aria-label') || el.getAttribute('content-desc') || el.getAttribute('title')
						),
						role: norm(el.getAttribute('role')),
						selector: selOf(el),
						inMenu: !!(menu && menu.contains(el)),
						disabled:
							(el as HTMLButtonElement).disabled === true ||
							el.getAttribute('disabled') !== null ||
							el.getAttribute('aria-disabled') === 'true',
						tab: norm(el.getAttribute('tab')),
						href: norm(el.getAttribute('href') || el.getAttribute('routerlink')),
						icons,
						labels
					};
					return item;
				})
				.filter(it => {
					const fp = `${it.selector}|${it.text}|${it.aria}`;
					if (seen.has(fp)) return false;
					seen.add(fp);
					return true;
				});
			return {
				url: window.location.href,
				pageTag,
				componentTags,
				title: norm(
					active.querySelector('ion-title')?.textContent ||
						document.querySelector('.ion-page:not(.ion-page-hidden) ion-title')?.textContent ||
						document.title
				),
				interactive
			};
		})
		.catch((e: Error) => ({
			url: '',
			pageTag: '',
			componentTags: [],
			title: '',
			interactive: [],
			_err: e.message
		}))) as Omit<ScreenDump, 'key' | 'note'> & { _err?: string };

	const screen: ScreenDump = { key, note, ...dump };
	const existingIdx = screens.findIndex(s => s.key === key);
	if (existingIdx >= 0) screens[existingIdx] = screen;
	else screens.push(screen);
	await persist();
	log(
		`SCREEN "${key}" url=${dump.url} page=${dump.pageTag} interactive=${dump.interactive.length}${dump._err ? ' ERR=' + dump._err : ''}`
	);
	for (const it of dump.interactive) {
		const meta = [
			it.tab ? `tab=${it.tab}` : '',
			it.href ? `href=${it.href}` : '',
			it.icons?.length ? `icons=${it.icons.join(',')}` : '',
			it.labels?.length ? `labels=${it.labels.join('/')}` : ''
		]
			.filter(Boolean)
			.join(' ');
		log(
			`   • ${it.kind}${it.inMenu ? '[menu]' : ''}${it.disabled ? '[disabled]' : ''} sel=${it.selector} text="${it.text}" ${meta}`
		);
	}
	return screen;
}

// Click first visible element matching a CSS selector; returns whether clicked.
async function clickSel(driver: Driver, selector: string): Promise<boolean> {
	await switchWv(driver);
	const ok = await driver
		.execute((sel: string) => {
			const vis = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const list = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
			const el = list.find(vis) ?? list[0];
			if (el) {
				el.click();
				return true;
			}
			return false;
		}, selector)
		.catch(() => false);
	await driver.pause(2200);
	return ok as boolean;
}

// Click a menu/tab/button by visible text (normalized, partial).
async function clickText(driver: Driver, text: string): Promise<boolean> {
	await switchWv(driver);
	const ok = await driver
		.execute((target: string) => {
			const norm = (v: unknown) =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase()
					.normalize('NFD')
					.replace(/[̀-ͯ]/g, '');
			const vis = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const t = norm(target);
			const cands = Array.from(
				document.querySelectorAll(
					'button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, a, ion-menu-toggle'
				)
			) as HTMLElement[];
			const clickable = (el: HTMLElement): HTMLElement => {
				let c: HTMLElement | null = el;
				while (c) {
					const tg = c.tagName.toUpperCase();
					if (
						['BUTTON', 'ION-BUTTON', 'ION-ITEM', 'ION-TAB-BUTTON', 'ION-MENU-TOGGLE', 'A'].includes(tg) ||
						c.getAttribute('role') === 'button'
					)
						return c;
					c = c.parentElement;
				}
				return el;
			};
			const m = cands.find(
				el =>
					vis(el) &&
					[norm(el.innerText || el.textContent), norm(el.getAttribute('aria-label'))].some(v => v.includes(t))
			);
			if (m) {
				clickable(m).click();
				return true;
			}
			return false;
		}, text)
		.catch(() => false);
	await driver.pause(2200);
	return ok as boolean;
}

async function goHome(driver: Driver, timeout = 20_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		await switchWv(driver);
		const url = await getUrl(driver);
		if (/\/navigator\/home/i.test(url)) return true;
		// try Home tab, then back button, then history
		if (await clickText(driver, 'Home')) {
			/* try */
		}
		let url2 = await getUrl(driver);
		if (/\/navigator\/home/i.test(url2)) return true;
		await clickSel(driver, 'ion-back-button, .back-button, button.back');
		url2 = await getUrl(driver);
		if (/\/navigator\/home/i.test(url2)) return true;
		await driver.execute(() => window.history.back()).catch(() => {});
		await driver.pause(1200);
		url2 = await getUrl(driver);
		if (/\/navigator\/home/i.test(url2)) return true;
	}
	log('goHome: could not confirm /navigator/home');
	return false;
}

// Acknowledge non-destructive alert modals (trip-lost, info). Records what it dismissed.
async function dismissAlerts(driver: Driver, maxRounds = 4): Promise<string[]> {
	const dismissed: string[] = [];
	for (let i = 0; i < maxRounds; i++) {
		await switchWv(driver);
		const info = (await driver
			.execute(() => {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const vis = (el: Element) => {
					const h = el as HTMLElement;
					const r = h.getBoundingClientRect();
					const s = getComputedStyle(h);
					return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
				};
				const modal = document.querySelector('app-alert-modal:not(.ion-page-hidden), ion-modal.show-modal');
				if (!modal || !vis(modal)) return { present: false, msg: '', clicked: false };
				const msg = norm(
					(modal.querySelector('.alert-message, .message, p, ion-text') as HTMLElement)?.innerText ||
						modal.textContent
				).slice(0, 120);
				const btn = (
					Array.from(modal.querySelectorAll('button, [role="button"], ion-button')) as HTMLElement[]
				).find(b => vis(b) && /aceptar|ok|entendido|cerrar/i.test(norm(b.innerText || b.textContent)));
				if (btn) {
					btn.click();
					return { present: true, msg, clicked: true };
				}
				return { present: true, msg, clicked: false };
			})
			.catch(() => ({ present: false, msg: '', clicked: false }))) as {
			present: boolean;
			msg: string;
			clicked: boolean;
		};
		if (!info.present) break;
		if (info.clicked) {
			dismissed.push(info.msg);
			log(`Dismissed alert: "${info.msg}"`);
			await driver.pause(2000);
		} else {
			log(`Alert present but no Aceptar button: "${info.msg}"`);
			break;
		}
	}
	return dismissed;
}

async function dismissPreHome(driver: Driver, timeout = 30_000): Promise<boolean> {
	const deadline = Date.now() + timeout;
	let captured = false;
	while (Date.now() < deadline) {
		await switchWv(driver);
		const url = await getUrl(driver);
		if (/\/navigator\//i.test(url)) return true;
		// Rebote pre-home→login (sesión stale con noReset): re-loguear y reintentar el overlay.
		if (/login|signin/i.test(url)) {
			log('pre-home rebound to /login — re-login');
			await loginIfNeeded(driver);
			await driver.pause(1500);
			continue;
		}
		if (/pre-home/i.test(url)) {
			if (!captured) {
				await enumerate(driver, 'pre-home', 'Overlay de bienvenida + init servicios (wifi/perfil/ubicación)');
				captured = true;
			}
			// The continue trigger is the teal "Aceptar"/continue button (hideOverlay) once services loaded.
			const clicked = await driver
				.execute(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim()
							.toLowerCase();
					const btns = Array.from(
						document.querySelectorAll('button, [role="button"], ion-button, .carrier-overlay')
					) as HTMLElement[];
					const cont = btns.find(
						b =>
							/aceptar|continuar|continue/i.test(norm(b.innerText || b.textContent)) &&
							(b as HTMLElement).offsetParent !== null
					);
					if (cont) {
						cont.click();
						return 'aceptar';
					}
					const ov = document.querySelector('.carrier-overlay') as HTMLElement | null;
					if (ov) {
						ov.click();
						return 'overlay';
					}
					return 'none';
				})
				.catch(() => 'err');
			// Angular (click)=hideOverlay needs a real tap too
			const ov = driver.$('.carrier-overlay');
			if (await ov.isDisplayed().catch(() => false)) await ov.click().catch(() => {});
			log(`pre-home continue attempt: ${clicked}`);
			await driver.pause(2000);
		}
		await driver.pause(1000);
	}
	return /\/navigator\//i.test(await getUrl(driver));
}

async function loginIfNeeded(driver: Driver): Promise<void> {
	await switchWv(driver);
	const url = await getUrl(driver);
	const onLoginNative = await driver
		.$('//android.widget.EditText[1]')
		.isDisplayed()
		.catch(() => false);
	if (/login|signin/i.test(url) || onLoginNative) {
		log('Login screen detected — logging in');
		await driver.switchContext('NATIVE_APP').catch(() => {});
		const email = driver.$('//android.widget.EditText[1]');
		await email.waitForDisplayed({ timeout: 10_000 }).catch(() => {});
		await email.clearValue().catch(() => {});
		await email.setValue(EMAIL).catch(() => {});
		await driver.hideKeyboard().catch(() => {});
		await driver.pause(1200);
		const pass = driver.$('(//*[@password="true"])[1]');
		await pass.setValue(PASSWORD).catch(() => {});
		await driver.hideKeyboard().catch(() => {});
		await driver.pause(600);
		await driver
			.$('//*[@text="Entrar"]')
			.click()
			.catch(() => {});
		await driver.pause(6000);
	}
}

async function run(): Promise<void> {
	const u = new URL(APPIUM_URL);
	log(`Connecting ${APPIUM_URL} udid=${UDID}`);
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
			'appium:newCommandTimeout': 180,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		await driver.activateApp(APP_PACKAGE).catch(() => {});
		await driver.pause(2500);
		await switchWv(driver);
		await loginIfNeeded(driver);
		await dismissPreHome(driver);
		const cleared = await dismissAlerts(driver);
		if (cleared.length)
			transitions.push({
				from: 'stale-payment/alert',
				action: 'tap Aceptar (trip-lost alert)',
				selector: 'app-alert-modal button.btn-outlined-red',
				to: 'home',
				toUrl: cleared.join(' | ')
			});
		await goHome(driver);

		// ── STOP 0: HOME (current availability state) ──
		const home = await enumerate(driver, 'home:initial', 'Estado de disponibilidad al arrancar');
		const availItem = home.interactive.find(
			i => i.id === 'availability' || /disponible|available/i.test(i.text + i.aria)
		);

		// ── STOP 1: toggle Disponible (non-destructive, allowed) ──
		if (availItem && process.env.EXPLORE_SKIP_AVAIL !== '1') {
			const before = await getUrl(driver);
			const clicked = await clickSel(driver, '#availability');
			if (clicked) {
				await driver.pause(2500);
				const after = await enumerate(driver, 'home:after-availability-toggle', 'Tras tap #availability');
				transitions.push({
					from: 'home:initial',
					action: 'tap #availability',
					selector: '#availability',
					to: after.pageTag || 'home',
					toUrl: after.url
				});
				// toggle back to the original state so exploration is stable, then re-read
				await clickSel(driver, '#availability').catch(() => {});
				await driver.pause(2000);
				await enumerate(driver, 'home:availability-restored', `Restaurado (before url=${before})`);
			}
		}
		await goHome(driver);

		// ── STOP 2: side menu (Account) ──
		const openMenu = async (): Promise<boolean> => {
			await goHome(driver);
			// primary: ion-menu-toggle wraps the hamburger in this app
			let ok = await clickSel(driver, 'ion-menu-toggle button, ion-menu-toggle');
			if (!ok) ok = await clickSel(driver, 'ion-menu-button');
			if (!ok) ok = (await clickText(driver, 'Cuenta')) || (await clickText(driver, 'Account'));
			await driver.pause(1200);
			// confirm menu is visible
			const shown = await driver
				.execute(() => {
					const m = document.querySelector('ion-menu');
					if (!m) return false;
					const r = (m as HTMLElement).getBoundingClientRect();
					return (
						(r.width > 0 &&
							getComputedStyle(m as HTMLElement).visibility !== 'hidden' &&
							(m as HTMLElement).classList.contains('show-menu')) ||
						(m as HTMLElement).getAttribute('aria-hidden') === 'false'
					);
				})
				.catch(() => false);
			return ok && (shown as boolean);
		};
		let menuOpened = await openMenu();
		if (menuOpened) {
			const menu = await enumerate(driver, 'side-menu', 'Menú lateral (cuenta)');
			transitions.push({
				from: 'home',
				action: 'open side menu',
				selector: 'ion-menu-button|Cuenta',
				to: 'side-menu',
				toUrl: menu.url
			});
			// Visit each SAFE menu item (skip blacklist). Collect labels first (menu closes on nav).
			const menuLabels = menu.interactive
				.filter(i => i.inMenu && (i.text || i.aria))
				.map(i => i.text || i.aria)
				.filter(t => t && !BLACKLIST.test(t));
			log(`Menu safe labels: ${menuLabels.join(' | ')}`);
			for (const label of menuLabels) {
				// reopen menu each iteration
				const reopened = await openMenu();
				if (!reopened) {
					log('could not reopen menu');
					break;
				}
				const navigated = await clickText(driver, label);
				if (!navigated) {
					log(`menu item "${label}" not clickable`);
					continue;
				}
				await driver.pause(2500);
				const key = `menu:${label.replace(/\s+/g, '-').toLowerCase()}`;
				const scr = await enumerate(driver, key, `Desde menú lateral → "${label}"`);
				transitions.push({
					from: 'side-menu',
					action: `tap "${label}"`,
					selector: `text:${label}`,
					to: scr.pageTag || key,
					toUrl: scr.url
				});
			}
			await goHome(driver);
		} else {
			log('Side menu could not be opened');
		}

		// ── STOP 3: bottom tab bar ──
		await goHome(driver);
		const tabScreen = await enumerate(driver, 'home:tabbar-scan', 'Escaneo de tab-bar inferior');
		const tabs = tabScreen.interactive
			.filter(i => i.kind === 'ion-tab-button' || /tab/i.test(i.class))
			.map(i => ({ selector: i.selector, text: i.text, aria: i.aria }));
		log(`Tab bar buttons: ${tabs.map(t => t.text || t.aria || t.selector).join(' | ')}`);
		for (const tab of tabs) {
			const label = tab.text || tab.aria;
			if (label && BLACKLIST.test(label)) {
				log(`skip destructive tab "${label}"`);
				continue;
			}
			// Call/dialer tab is semi-destructive — record but do not click.
			if (/llamar|call/i.test(label)) {
				log(`recording (not clicking) call tab "${label}" sel=${tab.selector}`);
				continue;
			}
			await goHome(driver);
			const navigated = await clickSel(driver, tab.selector);
			if (!navigated) continue;
			await driver.pause(2200);
			const key = `tab:${(label || tab.selector).replace(/\s+/g, '-').toLowerCase()}`;
			const scr = await enumerate(driver, key, `Tab-bar → "${label}"`);
			transitions.push({
				from: 'home',
				action: `tap tab "${label}"`,
				selector: tab.selector,
				to: scr.pageTag || key,
				toUrl: scr.url
			});
		}
		await goHome(driver);
		await enumerate(driver, 'home:final', 'Estado final tras exploración');
	} catch (e) {
		log(`FATAL during tour: ${(e as Error).message}`);
	} finally {
		await persist();
		await driver.deleteSession().catch(() => {});
		log(`Session closed. JSON → ${OUT_JSON}`);
	}
}

run().catch(e => {
	console.error('[explore] fatal:', e);
	process.exit(1);
});
