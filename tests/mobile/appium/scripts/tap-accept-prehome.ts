import { remote } from 'webdriverio';
const log = (m: string) => console.log(`[pre-home] ${m}`);
async function run() {
  const driver = await remote({
    protocol:'http', hostname:'localhost', port:4723, path:'/', logLevel:'warn',
    capabilities: {
      platformName:'Android','appium:automationName':'UiAutomator2',
      'appium:deviceName':'SM-A055M','appium:udid':'R92XB0B8F3J',
      'appium:appPackage':'com.magiis.app.test.driver','appium:appActivity':'.MainActivity',
      'appium:noReset':true,'appium:forceAppLaunch':false,
      'appium:newCommandTimeout':120,'appium:chromedriverAutodownload':true,
    } as Record<string,unknown>,
  });
  const contexts = await driver.getContexts() as string[];
  const wv = contexts.find((c:string) => c.startsWith('WEBVIEW'));
  if (wv) await driver.switchContext(wv);
  const url = await driver.execute<string,[]>(() => window.location.href).catch(() => '');
  log(`URL: ${url}`);
  // JS click en "Aceptar" visible en app-pre-home
  const clicked = await driver.execute<boolean,[]>(() => {
    const btns = Array.from(document.querySelectorAll('app-pre-home button, button')) as HTMLButtonElement[];
    const btn = btns.find(b => b.innerText?.trim() === 'Aceptar' && b.offsetParent !== null);
    if (btn) { btn.click(); return true; }
    return false;
  });
  log(clicked ? '✓ Tap Aceptar' : '⚠ Aceptar no encontrado');
  await driver.pause(3000);
  const urlAfter = await driver.execute<string,[]>(() => window.location.href).catch(() => '');
  log(`URL post-tap: ${urlAfter}`);
  await driver.deleteSession();
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
