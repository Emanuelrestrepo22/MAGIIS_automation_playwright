/**
 * DRAFT — Robust re-login for the Driver App + land on a clean /navigator/home.
 * Handles the stale-session case: pre-home stuck "Cargando Servicios" -> tap continue
 * bounces to /login -> fresh webview login (ion-input shadow fill) -> pre-home loads
 * fully -> home. Leaves the driver logged in (does NOT force availability).
 *
 * Run:
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"; $env:ANDROID_UDID="R92XB0B8F3J";
 *   $env:DRIVER_EMAIL="nuevoemailyo12312213@yopmail.com"; $env:DRIVER_PASSWORD="123";
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *     tests/mobile/appium/scripts/driver-relogin-and-home.ts
 */
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EMAIL = process.env.DRIVER_EMAIL ?? '';
const PASSWORD = process.env.DRIVER_PASSWORD ?? '';
const log = (m: string): void => console.log(`[relogin] ${m}`);

type Driver = Awaited<ReturnType<typeof remote>>;

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

// Fill an ion-input by piercing shadow DOM + dispatching Angular/Ionic events.
async function fillLogin(driver: Driver, email: string, password: string): Promise<string> {
  return driver.execute((em: string, pw: string) => {
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
    let emailHost: Element | null = null;
    let passHost: Element | null = null;
    for (const ion of ions) {
      const inner = ion.querySelector('input') || (ion as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot?.querySelector('input');
      const type = inner?.getAttribute('type') || ion.getAttribute('type') || '';
      if (/password/i.test(type)) passHost = ion; else if (!emailHost) emailHost = ion;
    }
    // Fallback: raw inputs
    if (!emailHost) emailHost = document.querySelector('input[type="email"], input[type="text"], input:not([type="password"])');
    if (!passHost) passHost = document.querySelector('ion-input[type="password"]') || document.querySelector('input[type="password"]')?.closest('ion-input') || null;
    const okE = set(emailHost, em);
    const okP = set(passHost, pw);
    // click Entrar
    const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const btn = (Array.from(document.querySelectorAll('button.btn.primary, button, [role="button"], ion-button')) as HTMLElement[])
      .find((b) => /entrar|ingresar|login|iniciar/i.test(norm(b.innerText || b.textContent)) && b.offsetParent !== null);
    if (btn) { btn.click(); return `filled email=${okE} pass=${okP} -> Entrar clicked`; }
    return `filled email=${okE} pass=${okP} -> NO Entrar button`;
  }, email, password).catch((e: Error) => `error: ${e.message}`);
}

// Advance pre-home to home ONLY when services are ready; verify we didn't land on /login.
async function advancePreHome(driver: Driver, timeout = 40_000): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await switchWv(driver);
    const u = await url(driver);
    if (/\/navigator\//i.test(u)) return 'home';
    if (/\/login/i.test(u)) return 'login';
    if (/pre-home/i.test(u)) {
      // Tap the continue button directly. A stale session never becomes "ready", so
      // tapping bounces to /login (desired). A valid session goes to /navigator/home.
      const tapped = await driver.execute<string, []>(() => {
        const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
        const b = (Array.from(document.querySelectorAll('button.btn.primary, button')) as HTMLElement[])
          .find((x) => /aceptar|continuar/i.test(norm(x.innerText || x.textContent)) && x.offsetParent !== null);
        if (b) { b.click(); return 'tapped'; } return 'no-button';
      }).catch(() => 'err');
      // real tap fallback for Angular click handler
      const btn = driver.$('button.btn.primary');
      if (await btn.isDisplayed().catch(() => false)) await btn.click().catch(() => {});
      console.log(`[relogin]   pre-home continue: ${tapped}`);
      await driver.pause(3000);
    }
    await driver.pause(1000);
  }
  return (await url(driver)).includes('navigator') ? 'home' : 'timeout';
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
    let u1 = await url(driver);
    log(`start url: ${u1}`);

    // If on pre-home with a stale session, tapping continue bounces to /login. Force that.
    if (/pre-home/i.test(u1)) {
      log('On pre-home — tapping continue to reach login/home');
      const r = await advancePreHome(driver, 20_000);
      log(`pre-home result: ${r}`);
      u1 = await url(driver);
    }

    // If not on login yet and not on home, try to get to login by tapping continue again
    if (!/\/login/i.test(u1) && !/\/navigator\//i.test(u1)) {
      await driver.pause(2000);
      u1 = await url(driver);
    }

    if (/\/login/i.test(u1)) {
      log('On /login — performing fresh webview login');
      await driver.pause(1500);
      const res = await fillLogin(driver, EMAIL, PASSWORD);
      log(`login: ${res}`);
      await driver.pause(6000);
      await switchWv(driver);
      const after = await url(driver);
      log(`after login url: ${after}`);
      const r = await advancePreHome(driver, 45_000);
      log(`post-login pre-home result: ${r}`);
    }

    // Final verification
    await switchWv(driver);
    const finalUrl = await url(driver);
    const hasAvail = await driver.execute<boolean, []>(() => !!document.querySelector('#availability')).catch(() => false);
    log(`FINAL url=${finalUrl} #availability=${hasAvail}`);
  } finally {
    await driver.deleteSession().catch(() => {});
    log('Session closed');
  }
}
run().catch((e) => { console.error('[relogin] fatal:', e); process.exit(1); });
