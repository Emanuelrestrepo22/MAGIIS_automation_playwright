/**
 * DRAFT — TASK 2d: flujos DESTRUCTIVOS del menú lateral (device TEST, autorizado).
 * Fases guardadas (una no aborta la siguiente); siempre intenta terminar logueado + Disponible.
 *   A. Preferencias (/Settings) → "Guardar" sin alterar valores.
 *   B. Cambiar Vehículo (/Vehicles) → seleccionar/confirmar el MISMO vehículo (no lo cambia).
 *   C. Fuera de servicio (ion-toggle) → togglear + revertir.
 *   D. Cerrar sesión (button.log-out-menu) → /login.
 *   E. RestorePass (button.restore-pass) en /login → abre pantalla → volver.
 *   F. Re-login → pre-home → home → Disponible.
 *
 * Run:
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"; $env:ANDROID_UDID="R92XB0B8F3J";
 *   $env:DRIVER_EMAIL="nuevoemailyo12312213@yopmail.com"; $env:DRIVER_PASSWORD="123";
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *     tests/mobile/appium/scripts/driver-validate-menu-destructive.ts
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PKG = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EMAIL = process.env.DRIVER_EMAIL ?? '';
const PASSWORD = process.env.DRIVER_PASSWORD ?? '';
if (!EMAIL || !PASSWORD) { console.error('[menu-destr] ❌ Definir DRIVER_EMAIL y DRIVER_PASSWORD como variables de entorno.'); process.exit(1); }
const log = (m: string): void => console.log(`[menu-destr] ${m}`);
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
  writeFileSync(join('evidence/dom-dump', `menu-destr-${label}-${ts}.txt`), content, 'utf-8');
}

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
const url = (d: Driver): Promise<string> => d.execute<string, []>(() => window.location.href).catch(() => '');
async function waitForUrl(d: Driver, token: string, timeout = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { await switchWv(d); if ((await url(d)).includes(token)) return true; await d.pause(500); }
  return false;
}
async function goHomeTab(d: Driver): Promise<void> {
  await switchWv(d);
  await d.execute<void, []>(() => { (document.querySelector('#tab-button-home') as HTMLElement | null)?.click(); }).catch(() => {});
  await d.pause(1200);
}
async function headerVehicle(d: Driver): Promise<string> {
  await switchWv(d);
  return d.execute<string, []>(() => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
    const h = document.querySelector('page-home ion-header, page-home .header-info, ion-header') as HTMLElement | null;
    return norm(h?.innerText ?? '').slice(0, 120);
  }).catch(() => '');
}
async function openMenu(d: Driver): Promise<boolean> {
  await switchWv(d);
  // API ion-menu.open() (más robusto que clickear el toggle)
  const opened = await d.execute<boolean, []>(() => {
    const menu = document.querySelector('ion-menu') as (HTMLElement & { open?: () => Promise<boolean> }) | null;
    if (menu && typeof menu.open === 'function') { void menu.open(); return true; }
    const tog = Array.from(document.querySelectorAll('ion-menu-toggle')).find((t) => (t as HTMLElement).offsetParent !== null) as HTMLElement | null;
    if (tog) { tog.click(); return true; }
    return false;
  }).catch(() => false);
  await d.pause(1500);
  return opened;
}
async function dumpMenu(d: Driver): Promise<Record<string, unknown>> {
  await switchWv(d);
  return d.execute<Record<string, unknown>, []>(() => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
    const items = Array.from(document.querySelectorAll('ion-item.menu-link-url, ion-menu ion-item')).filter(vis)
      .map((it) => norm((it as HTMLElement).innerText).slice(0, 40));
    const toggles = Array.from(document.querySelectorAll('ion-menu ion-toggle, ion-toggle')).filter(vis)
      .map((t) => ({ checked: t.getAttribute('aria-checked') ?? String((t as HTMLElement).classList.contains('toggle-checked')), text: norm((t.closest('ion-item')?.textContent) ?? '').slice(0, 40) }));
    const logout = document.querySelector('button.log-out-menu') as HTMLElement | null;
    return { items, toggles, logoutFound: !!logout && vis(logout) };
  }).catch((e: Error) => ({ error: e.message }));
}
async function tapMenuItem(d: Driver, label: string): Promise<boolean> {
  await switchWv(d);
  return d.execute<boolean, [string]>((lbl) => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const items = Array.from(document.querySelectorAll('ion-item.menu-link-url')) as HTMLElement[];
    const it = items.find((x) => x.offsetParent !== null && norm(x.innerText).includes(lbl.toLowerCase()));
    if (it) { it.click(); return true; }
    return false;
  }, label).catch(() => false);
}
async function backHome(d: Driver): Promise<void> {
  await switchWv(d);
  const u = await url(d);
  if (/\/navigator\/home/i.test(u)) return;
  // ion-back-button o history back
  await d.execute<void, []>(() => {
    const b = document.querySelector('ion-back-button, ion-buttons ion-back-button') as HTMLElement | null;
    if (b) { b.click(); return; }
    history.back();
  }).catch(() => {});
  await d.pause(1500);
  if (!/\/navigator\/home/i.test(await url(d))) await goHomeTab(d);
}

// login helpers (piercing shadow DOM) — espeja driver-relogin-and-home.ts
async function fillLogin(d: Driver): Promise<string> {
  await switchWv(d);
  return d.execute((em: string, pw: string) => {
    const set = (host: Element | null, val: string): boolean => {
      if (!host) return false;
      const inner = (host.querySelector('input') || (host as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.querySelector('input')) as HTMLInputElement | null;
      if (!inner) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(inner, val);
      inner.dispatchEvent(new Event('input', { bubbles: true }));
      inner.dispatchEvent(new Event('change', { bubbles: true }));
      host.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: val } }));
      host.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: val } }));
      return true;
    };
    const ions = Array.from(document.querySelectorAll('ion-input')) as HTMLElement[];
    let emailHost: Element | null = null; let passHost: Element | null = null;
    for (const ion of ions) {
      const inner = ion.querySelector('input') || (ion as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.querySelector('input');
      const type = inner?.getAttribute('type') || ion.getAttribute('type') || '';
      if (/password/i.test(type)) passHost = ion; else if (!emailHost) emailHost = ion;
    }
    const okE = set(emailHost, em); const okP = set(passHost, pw);
    const btn = (Array.from(document.querySelectorAll('button.btn.primary, button, ion-button')) as HTMLElement[])
      .find((b) => /entrar|ingresar|login|iniciar/i.test((b.innerText || b.textContent || '')) && b.offsetParent !== null);
    if (btn) { btn.click(); return `email=${okE} pass=${okP} → Entrar`; }
    return `email=${okE} pass=${okP} → NO Entrar btn`;
  }, EMAIL, PASSWORD).catch((e: Error) => `error: ${e.message}`);
}
async function advancePreHome(d: Driver, timeout = 45_000): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await switchWv(d);
    const u = await url(d);
    if (/\/navigator\//i.test(u)) return 'home';
    if (/\/login/i.test(u)) return 'login';
    if (/pre-home/i.test(u)) {
      await d.execute<void, []>(() => {
        const b = (Array.from(document.querySelectorAll('button.btn.primary, button')) as HTMLElement[])
          .find((x) => /aceptar|continuar/i.test((x.innerText || x.textContent || '')) && x.offsetParent !== null);
        if (b) b.click();
      }).catch(() => {});
      await d.pause(3000);
    }
    await d.pause(1000);
  }
  return (await url(d)).includes('navigator') ? 'home' : 'timeout';
}
async function ensureDisponible(d: Driver): Promise<string> {
  await goHomeTab(d);
  const read = async (): Promise<string> => d.execute<string, []>(() => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
    const a = document.querySelector('#availability') as HTMLElement | null;
    return norm(a?.querySelector('.available-label')?.textContent ?? a?.textContent ?? '');
  }).catch(() => '');
  let s = await read();
  if (!/disponible/i.test(s) || /no disponible/i.test(s)) {
    await d.execute<void, []>(() => { (document.querySelector('#availability') as HTMLElement | null)?.click(); }).catch(() => {});
    await d.pause(2000);
    s = await read();
  }
  return s;
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
      'appium:appPackage': PKG, 'appium:appActivity': '.MainActivity',
      'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
      'appium:newCommandTimeout': 240, 'appium:chromedriverAutodownload': true,
    } as Record<string, unknown>,
  });

  try {
    await driver.pause(1500);
    await goHomeTab(driver);
    const startUrl = await url(driver);
    const vehBefore = await headerVehicle(driver);
    add('PRECOND', /\/navigator\/home/i.test(startUrl) ? 'OK' : 'PARTIAL', `url=${startUrl} header="${vehBefore}"`);

    // menú dump inicial
    await openMenu(driver);
    const menu = await dumpMenu(driver);
    save('menu-items', JSON.stringify(menu, null, 2));
    add('MENU', 'INFO', JSON.stringify(menu));

    // ── A. Preferencias (/Settings) → Guardar sin cambios ──
    try {
      const okItem = await tapMenuItem(driver, 'Preferencias');
      await driver.pause(1500);
      const atSettings = await waitForUrl(driver, '/Settings', 8_000);
      const settingsDump = await driver.execute<Record<string, unknown>, []>(() => {
        const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
        const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
        const selects = Array.from(document.querySelectorAll('ion-select')).filter(vis).map((s) => norm((s as HTMLElement).innerText).slice(0, 40));
        const toggles = Array.from(document.querySelectorAll('ion-toggle')).filter(vis).map((t) => t.getAttribute('aria-checked') ?? '');
        const saveBtn = Array.from(document.querySelectorAll('button.btn.primary, button')).find((b) => /guardar/i.test((b as HTMLElement).innerText) && vis(b));
        return { url: window.location.href, selects, toggles, saveFound: !!saveBtn };
      }).catch((e: Error) => ({ error: e.message }));
      save('settings', JSON.stringify(settingsDump, null, 2));
      // tap Guardar SIN cambiar valores
      const saved = await driver.execute<boolean, []>(() => {
        const b = Array.from(document.querySelectorAll('button.btn.primary, button')).find((x) => /guardar/i.test((x as HTMLElement).innerText) && (x as HTMLElement).offsetParent !== null) as HTMLElement | null;
        if (b) { b.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(2500);
      const afterSave = await url(driver);
      add('2d-A-Settings', okItem && atSettings ? 'OK' : 'PARTIAL', `atSettings=${atSettings} guardar=${saved} → ${afterSave} | dump=${JSON.stringify(settingsDump)}`);
      await backHome(driver);
    } catch (e) { add('2d-A-Settings', 'FAIL', e instanceof Error ? e.message : String(e)); await backHome(driver).catch(() => {}); }

    // ── B. Cambiar Vehículo (/Vehicles) → confirmar el MISMO ──
    try {
      await openMenu(driver);
      const okItem = await tapMenuItem(driver, 'Cambiar');
      await driver.pause(1500);
      const atVehicles = await waitForUrl(driver, '/Vehicles', 8_000);
      const vehDump = await driver.execute<Record<string, unknown>, []>(() => {
        const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
        const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
        const rows = Array.from(document.querySelectorAll('ion-item, .vehicle-item, ion-card, ion-radio')).filter(vis)
          .map((r) => norm((r as HTMLElement).innerText).slice(0, 60)).filter((t) => t.length > 1).slice(0, 12);
        const title = norm(document.querySelector('ion-title, h1, h2')?.textContent ?? '');
        return { url: window.location.href, title, rows };
      }).catch((e: Error) => ({ error: e.message }));
      save('vehicles', JSON.stringify(vehDump, null, 2));
      // NO seleccionar un vehículo distinto: solo validar la pantalla y volver (evita cambiar el activo).
      add('2d-B-Vehicles', okItem && atVehicles ? 'OK' : 'PARTIAL', `atVehicles=${atVehicles} | ${JSON.stringify(vehDump)} | (no se seleccionó otro vehículo para no cambiar el activo)`);
      await backHome(driver);
      const vehAfter = await headerVehicle(driver);
      add('2d-B-Vehicles-verify', vehAfter === vehBefore ? 'OK' : 'PARTIAL', `vehículo header before="${vehBefore}" after="${vehAfter}"`);
    } catch (e) { add('2d-B-Vehicles', 'FAIL', e instanceof Error ? e.message : String(e)); await backHome(driver).catch(() => {}); }

    // ── C. Fuera de servicio (ion-toggle) → toggle + revert ──
    try {
      await openMenu(driver);
      const before = await driver.execute<string, []>(() => {
        const t = document.querySelector('ion-menu ion-toggle, ion-toggle') as HTMLElement | null;
        return t ? (t.getAttribute('aria-checked') ?? String(t.classList.contains('toggle-checked'))) : '(none)';
      }).catch(() => '(none)');
      const tapped = await driver.execute<boolean, []>(() => {
        const t = document.querySelector('ion-menu ion-toggle, ion-toggle') as HTMLElement | null;
        if (t && t.offsetParent !== null) { t.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(2000);
      // manejar posible confirm
      await driver.execute<void, []>(() => {
        const b = document.querySelector('app-confirm-modal button.btn.primary, ion-alert button') as HTMLElement | null;
        if (b && b.offsetParent !== null) b.click();
      }).catch(() => {});
      await driver.pause(1500);
      await openMenu(driver);
      const mid = await driver.execute<string, []>(() => {
        const t = document.querySelector('ion-menu ion-toggle, ion-toggle') as HTMLElement | null;
        return t ? (t.getAttribute('aria-checked') ?? String(t.classList.contains('toggle-checked'))) : '(none)';
      }).catch(() => '(none)');
      // revertir
      await driver.execute<boolean, []>(() => {
        const t = document.querySelector('ion-menu ion-toggle, ion-toggle') as HTMLElement | null;
        if (t && t.offsetParent !== null) { t.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(2000);
      await driver.execute<void, []>(() => {
        const b = document.querySelector('app-confirm-modal button.btn.primary, ion-alert button') as HTMLElement | null;
        if (b && b.offsetParent !== null) b.click();
      }).catch(() => {});
      await driver.pause(1500);
      await openMenu(driver);
      const after = await driver.execute<string, []>(() => {
        const t = document.querySelector('ion-menu ion-toggle, ion-toggle') as HTMLElement | null;
        return t ? (t.getAttribute('aria-checked') ?? String(t.classList.contains('toggle-checked'))) : '(none)';
      }).catch(() => '(none)');
      add('2d-C-OutOfService', tapped ? 'OK' : 'PARTIAL', `toggle checked before="${before}" mid="${mid}" afterRevert="${after}" (reverted=${before === after})`);
      await backHome(driver);
    } catch (e) { add('2d-C-OutOfService', 'FAIL', e instanceof Error ? e.message : String(e)); await backHome(driver).catch(() => {}); }

    // ── D. Cerrar sesión → /login ──
    try {
      await openMenu(driver);
      const tappedLogout = await driver.execute<boolean, []>(() => {
        const b = document.querySelector('button.log-out-menu') as HTMLElement | null;
        if (b && b.offsetParent !== null) { b.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(2000);
      // posible confirm de logout
      await driver.execute<void, []>(() => {
        const b = document.querySelector('app-confirm-modal button.btn.primary, ion-alert button') as HTMLElement | null;
        if (b && b.offsetParent !== null) b.click();
      }).catch(() => {});
      const atLogin = await waitForUrl(driver, '/login', 20_000);
      add('2d-D-Logout', tappedLogout && atLogin ? 'OK' : 'FAIL', `tapped=${tappedLogout} atLogin=${atLogin} url=${await url(driver)}`);
    } catch (e) { add('2d-D-Logout', 'FAIL', e instanceof Error ? e.message : String(e)); }

    // ── E. RestorePass en /login ──
    try {
      await switchWv(driver);
      if (/\/login/i.test(await url(driver))) {
        const tappedRestore = await driver.execute<boolean, []>(() => {
          const b = document.querySelector('button.restore-pass') as HTMLElement | null;
          if (b && b.offsetParent !== null) { b.click(); return true; } return false;
        }).catch(() => false);
        await driver.pause(2000);
        const restoreDump = await driver.execute<Record<string, unknown>, []>(() => {
          const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
          const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
          const inputs = Array.from(document.querySelectorAll('ion-input, input')).filter(vis).map((i) => norm((i as HTMLElement).getAttribute('placeholder') ?? (i as HTMLElement).innerText).slice(0, 40));
          const title = norm(document.querySelector('ion-title, h1, h2, .title')?.textContent ?? '');
          const btns = Array.from(document.querySelectorAll('button, ion-button')).filter(vis).map((b) => norm((b as HTMLElement).innerText).slice(0, 30)).filter((t) => t.length > 0);
          return { url: window.location.href, title, inputs, btns };
        }).catch((e: Error) => ({ error: e.message }));
        save('restore-pass', JSON.stringify(restoreDump, null, 2));
        add('2d-E-RestorePass', tappedRestore ? 'OK' : 'PARTIAL', `tapped=${tappedRestore} → ${JSON.stringify(restoreDump)}`);
        // volver a /login
        await driver.execute<void, []>(() => {
          const b = document.querySelector('ion-back-button, button.back-button') as HTMLElement | null;
          if (b) { b.click(); return; } history.back();
        }).catch(() => {});
        await driver.pause(1500);
        await waitForUrl(driver, '/login', 8_000);
        add('2d-E-RestorePass-back', /\/login/i.test(await url(driver)) ? 'OK' : 'PARTIAL', `volvió a ${await url(driver)}`);
      } else {
        add('2d-E-RestorePass', 'PARTIAL', `no en /login (${await url(driver)}) — se omite RestorePass`);
      }
    } catch (e) { add('2d-E-RestorePass', 'FAIL', e instanceof Error ? e.message : String(e)); }

    // ── F. Re-login → home → Disponible ──
    try {
      await switchWv(driver);
      if (/\/login/i.test(await url(driver))) {
        const res = await fillLogin(driver);
        add('2d-F-Relogin-fill', 'INFO', res);
        await driver.pause(5000);
        const r = await advancePreHome(driver, 50_000);
        add('2d-F-Relogin', /home/i.test(r) ? 'OK' : 'FAIL', `advancePreHome=${r} url=${await url(driver)}`);
      }
      const avail = await ensureDisponible(driver);
      add('2d-F-Disponible', /disponible/i.test(avail) && !/no disponible/i.test(avail) ? 'OK' : 'PARTIAL', `availability="${avail}" url=${await url(driver)}`);
    } catch (e) { add('2d-F-Relogin', 'FAIL', e instanceof Error ? e.message : String(e)); }
  } catch (e) {
    add('FATAL', 'FAIL', e instanceof Error ? e.message : String(e));
  } finally {
    log('\n' + '═'.repeat(60));
    log('REPORTE — MENÚ DESTRUCTIVO (2d)');
    log('═'.repeat(60));
    for (const r of report) {
      const icon = r.status === 'OK' ? '✓' : r.status === 'FAIL' ? '✗' : r.status === 'PARTIAL' ? '≈' : 'ℹ';
      log(`${icon} [${r.task}] ${r.detail}`);
    }
    mkdirSync('evidence/reports', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join('evidence/reports', `menu-destructive-${ts}.json`), JSON.stringify({ timestamp: new Date().toISOString(), report }, null, 2), 'utf-8');
    await driver.deleteSession().catch(() => {});
    log('Sesión cerrada');
  }
}
run().catch((e) => { console.error('[menu-destr] fatal:', e); process.exit(1); });
