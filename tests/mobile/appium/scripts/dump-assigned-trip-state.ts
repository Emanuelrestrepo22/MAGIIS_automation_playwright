/** DRAFT — diagnóstico: ¿llegó el viaje asignado (manual) al device? Dump home "Viaje Asignado" + URL. */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PKG = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
async function run(): Promise<void> {
  const driver = await remote({
    protocol: 'http', hostname: 'localhost', port: 4723, path: '/', logLevel: 'warn',
    connectionRetryTimeout: 60_000, connectionRetryCount: 2,
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'SM-A055M', 'appium:platformVersion': '15.0', 'appium:udid': UDID,
      'appium:appPackage': PKG, 'appium:appActivity': '.MainActivity',
      'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
      'appium:newCommandTimeout': 120, 'appium:chromedriverAutodownload': true,
    } as Record<string, unknown>,
  });
  try {
    await driver.pause(1000);
    const ctx = (await driver.getContexts().catch(() => [])) as string[];
    const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
    if (wv) await driver.switchContext(wv);
    await driver.execute<void, []>(() => { (document.querySelector('#tab-button-home') as HTMLElement | null)?.click(); }).catch(() => {});
    await driver.pause(1500);
    const info = await driver.execute<Record<string, unknown>, []>(() => {
      const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
      const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
      const sections: string[] = [];
      document.querySelectorAll('[class*="assigned"], [class*="asignado"], [class*="trip-card"], [class*="travel-card"], [class*="available"], .home-section, ion-card').forEach((el) => {
        if (vis(el)) { const t = norm((el as HTMLElement).innerText); if (t) sections.push(t.slice(0, 160)); }
      });
      // textos clave del home
      const bodyText = norm(document.querySelector('page-home:not(.ion-page-hidden)')?.textContent ?? document.body.textContent).slice(0, 800);
      return {
        url: window.location.href,
        availability: norm((document.querySelector('#availability') as HTMLElement | null)?.textContent ?? ''),
        onTravelConfirm: /TravelConfirmPage/i.test(window.location.href),
        sections: Array.from(new Set(sections)).slice(0, 20),
        bodyText,
      };
    }).catch((e: Error) => ({ error: e.message }));
    // page source nativo por si el viaje asignado es un push/overlay
    let src = '';
    try { await driver.switchContext('NATIVE_APP'); src = (await driver.getPageSource()).slice(0, 4000); if (wv) await driver.switchContext(wv); } catch { /* noop */ }
    mkdirSync('evidence/dom-dump', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join('evidence/dom-dump', `assigned-trip-state-${ts}.txt`), JSON.stringify({ info, nativeSrcHead: src }, null, 2), 'utf-8');
    console.log('[assigned-state] ' + JSON.stringify(info, null, 2));
  } finally {
    await driver.deleteSession().catch(() => {});
  }
}
run().catch((e) => { console.error('[assigned-state] fatal:', e); process.exit(1); });
