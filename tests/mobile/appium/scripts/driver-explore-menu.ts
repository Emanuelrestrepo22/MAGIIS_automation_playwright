/**
 * DRAFT — Explore Driver App side-menu destinations (non-destructive).
 * Opens the account hamburger (ion-menu-toggle · person-circle-outline) and clicks the
 * inner ion-item.menu-link-url (NOT the menu-toggle wrapper, which only closes the menu),
 * then dumps each destination (Preferencias / Estadísticas / Cambiar Vehículo). Never taps
 * Cerrar sesión or the out-of-service toggle. Returns home after each.
 *
 * Run:
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"; $env:ANDROID_UDID="R92XB0B8F3J";
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *     tests/mobile/appium/scripts/driver-explore-menu.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const OUT_DIR = process.env.EXPLORE_OUT_DIR ?? 'C:/Users/Erika/AppData/Local/Temp/claude/c--Users-Erika-OneDrive---MAGIIS-USA-LLC--1--Escritorio-automation-projects-magiis-playwright/200063c2-3948-4975-8bf9-16001d37cf9f/scratchpad';
const log = (m: string): void => console.log(`[menu] ${m}`);
type Driver = Awaited<ReturnType<typeof remote>>;

const out: Array<Record<string, unknown>> = [];

async function switchWv(driver: Driver, timeout = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ctx = (await driver.getContexts().catch(() => [])) as string[];
    const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
    if (wv) { await driver.switchContext(wv).catch(() => {}); return true; }
    await driver.pause(300);
  }
  return false;
}
const url = (d: Driver) => d.execute<string, []>(() => window.location.href).catch(() => '');

async function goHome(driver: Driver, timeout = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await switchWv(driver);
    if (/\/navigator\/home/i.test(await url(driver))) return true;
    await driver.execute(() => {
      const bb = document.querySelector('ion-back-button, .back-button') as HTMLElement | null;
      if (bb) { bb.click(); return; }
      const tab = document.querySelector('#tab-button-home') as HTMLElement | null;
      if (tab) { tab.click(); return; }
      window.history.back();
    }).catch(() => {});
    await driver.pause(1500);
  }
  return /\/navigator\/home/i.test(await url(driver));
}

async function openMenu(driver: Driver): Promise<boolean> {
  await goHome(driver);
  // Click the visible header hamburger (person-circle-outline). When the menu is closed the
  // only visible ion-menu-toggle is the header one.
  const clicked = await driver.execute<boolean, []>(() => {
    const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && (el as HTMLElement).offsetParent !== null; };
    const tog = (Array.from(document.querySelectorAll('ion-menu-toggle')) as HTMLElement[]).find(vis);
    if (tog) { tog.click(); return true; }
    return false;
  }).catch(() => false);
  await driver.pause(1600);
  const open = await driver.execute<boolean, []>(() => {
    const items = Array.from(document.querySelectorAll('ion-item.menu-link-url')) as HTMLElement[];
    return items.some((i) => (i as HTMLElement).offsetParent !== null);
  }).catch(() => false);
  return (clicked as boolean) && (open as boolean);
}

async function enumerate(driver: Driver, key: string): Promise<void> {
  await switchWv(driver);
  await driver.pause(600);
  const dump = await driver.execute(() => {
    const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element) => { const h = el as HTMLElement; const r = h.getBoundingClientRect(); const s = getComputedStyle(h); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const esc = (s: string) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const selOf = (el: Element) => {
      const id = norm((el as HTMLElement).id); if (id) return '#' + esc(id);
      const tag = el.tagName.toLowerCase();
      const cls = (typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '').trim().split(/\s+/).filter(Boolean);
      return cls.length ? tag + '.' + cls.slice(0, 4).map(esc).join('.') : tag;
    };
    const pages = Array.from(document.querySelectorAll('.ion-page:not(.ion-page-hidden)'));
    const active = (pages[pages.length - 1] as HTMLElement) ?? document.body;
    const q = 'button, [role="button"], ion-button, ion-item[button], ion-item[detail], ion-toggle, ion-segment-button, ion-input, ion-select, ion-back-button, ion-fab-button, ion-checkbox, ion-radio';
    const interactive = (Array.from(active.querySelectorAll(q)) as HTMLElement[]).filter(vis).map((el) => ({
      kind: el.tagName.toLowerCase(),
      id: norm(el.id), class: norm(typeof el.className === 'string' ? el.className : ''),
      text: norm(el.innerText || el.textContent).slice(0, 70),
      selector: selOf(el),
      icons: Array.from(el.querySelectorAll('ion-icon')).map((ic) => norm(ic.getAttribute('name') || ic.getAttribute('icon'))).filter(Boolean),
    }));
    const headings = Array.from(active.querySelectorAll('ion-title, h1, h2, .title, ion-label')).map((h) => norm(h.textContent)).filter(Boolean).slice(0, 12);
    return { url: window.location.href, pageTag: active.tagName ? active.tagName.toLowerCase() : '', headings, interactive };
  }).catch((e: Error) => ({ url: '', pageTag: '', headings: [], interactive: [], _err: e.message }));
  out.push({ key, ...dump });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}/driver-menu-map.json`, JSON.stringify(out, null, 2), 'utf-8');
  const d = dump as { url: string; pageTag: string; headings: string[]; interactive: Array<{ kind: string; selector: string; text: string; icons: string[] }>; _err?: string };
  log(`SCREEN "${key}" url=${d.url} page=${d.pageTag} headings=[${d.headings.join(' | ')}]${d._err ? ' ERR=' + d._err : ''}`);
  for (const it of d.interactive) log(`   • ${it.kind} sel=${it.selector} text="${it.text}" ${it.icons.length ? 'icons=' + it.icons.join(',') : ''}`);
}

async function clickMenuItem(driver: Driver, label: string): Promise<boolean> {
  const res = await driver.execute((lbl: string) => {
    const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const items = Array.from(document.querySelectorAll('ion-item.menu-link-url')) as HTMLElement[];
    const m = items.find((i) => i.offsetParent !== null && norm(i.innerText || i.textContent).includes(norm(lbl)));
    if (m) { m.click(); return true; }
    return false;
  }, label).catch(() => false);
  await driver.pause(2600);
  return res as boolean;
}

async function run(): Promise<void> {
  const u = new URL(APPIUM_URL);
  const driver = await remote({
    protocol: u.protocol.replace(':', '') as 'http' | 'https',
    hostname: u.hostname, port: Number(u.port) || 4723, path: '/', logLevel: 'warn',
    connectionRetryTimeout: 60_000, connectionRetryCount: 2,
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'SM-A055M', 'appium:platformVersion': '15.0', 'appium:udid': UDID,
      'appium:appPackage': APP_PACKAGE, 'appium:appActivity': '.MainActivity',
      'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
      'appium:newCommandTimeout': 180, 'appium:chromedriverAutodownload': true,
    } as Record<string, unknown>,
  });
  try {
    await driver.activateApp(APP_PACKAGE).catch(() => {});
    await driver.pause(2500);
    await switchWv(driver);
    log(`start url: ${await url(driver)}`);
    await goHome(driver);

    const labels = ['Preferencias', 'Estadísticas', 'Cambiar Vehículo'];
    for (const label of labels) {
      const opened = await openMenu(driver);
      log(`openMenu for "${label}": ${opened}`);
      if (!opened) { log(`could not open menu for ${label}`); continue; }
      const before = await url(driver);
      const clicked = await clickMenuItem(driver, label);
      const after = await url(driver);
      log(`clickMenuItem "${label}": clicked=${clicked} url ${before} -> ${after}`);
      await enumerate(driver, `menu:${label}`);
      await goHome(driver);
    }
    await goHome(driver);
    log('done; returned home');
  } finally {
    await driver.deleteSession().catch(() => {});
    log(`Session closed. JSON → ${OUT_DIR}/driver-menu-map.json`);
  }
}
run().catch((e) => { console.error('[menu] fatal:', e); process.exit(1); });
