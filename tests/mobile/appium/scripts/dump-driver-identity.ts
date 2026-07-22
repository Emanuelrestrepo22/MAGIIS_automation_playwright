/** DRAFT — lee el nombre del driver + vehículo del header del home (para targetear el assign web). */
import { remote } from 'webdriverio';
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
    await driver.pause(1000);
    const info = await driver.execute<Record<string, unknown>, []>(() => {
      const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
      const texts: string[] = [];
      document.querySelectorAll('page-home ion-header *, page-home .header *, ion-header *, [class*="driver-name"], [class*="user-name"]').forEach((el) => {
        const t = norm((el as HTMLElement).innerText); if (t && t.length < 60) texts.push(t);
      });
      const avail = document.querySelector('#availability') as HTMLElement | null;
      return { url: window.location.href, availability: norm(avail?.textContent ?? ''), headerTexts: Array.from(new Set(texts)).slice(0, 25) };
    }).catch((e: Error) => ({ error: e.message }));
    console.log('[identity] ' + JSON.stringify(info, null, 2));
  } finally {
    await driver.deleteSession().catch(() => {});
  }
}
run().catch((e) => { console.error('[identity] fatal:', e); process.exit(1); });
