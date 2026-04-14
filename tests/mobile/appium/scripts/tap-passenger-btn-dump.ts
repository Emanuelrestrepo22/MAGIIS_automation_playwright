/**
 * Tap botón pasajero amarillo (driver-home.home-icon-base) y dump del resultado.
 * Entry point del flujo "viaje calle" desde el home del driver.
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const log = (m: string) => console.log(`[pax-btn] ${m}`);
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
  const ctxs = await driver.getContexts() as string[];
  const wv = ctxs.find((c:string) => c.startsWith('WEBVIEW'));
  if (wv) await driver.switchContext(wv);
  const url0 = await driver.execute<string,[]>(() => window.location.href).catch(() => '');
  log(`URL: ${url0}`);

  // Tap botón pasajero amarillo: button.driver-home.home-icon-base (visible)
  const tapped = await driver.execute<string,[]>(() => {
    const btns = Array.from(document.querySelectorAll('button.driver-home.home-icon-base, button.driver-home')) as HTMLButtonElement[];
    const visible = btns.find(b => b.offsetParent !== null);
    if (visible) { visible.click(); return (visible.className??'') + ' | ' + (visible.innerText??'').trim(); }
    return '';
  });
  log(tapped ? `✓ Tap: "${tapped}"` : '⚠ Botón no encontrado');
  await driver.pause(3000);

  const dump = await driver.execute<string,[]>(() => {
    const lines = [`URL: ${window.location.href}`];
    (document.querySelectorAll('button,[role="button"],ion-button,input,select,ion-select,ion-input') as NodeListOf<HTMLElement>).forEach(el => {
      const t = (el.innerText??el.getAttribute('placeholder')??'').trim().replace(/\n/g,' ').slice(0,100);
      const cls = (el.className??'').toString().slice(0,80);
      const vis = el.offsetParent !== null;
      if (t || vis) lines.push(`[EL vis=${vis}] ${el.tagName.toLowerCase()} class="${cls}" text="${t}"`);
    });
    document.querySelectorAll('ion-page:not(.ion-page-hidden),app-page-new-travel,app-travel-calle,[class*="calle"],[class*="street-trip"],[class*="new-travel"]').forEach(el => {
      lines.push(`[ACTIVE] ${el.tagName} class="${(el.className??'').toString().slice(0,100)}"`);
    });
    (document.querySelectorAll('ion-title,ion-toolbar,h1,h2,ion-header') as NodeListOf<HTMLElement>).forEach(el => {
      const t = (el.innerText??'').trim();
      if (t) lines.push(`[TITLE vis=${el.offsetParent !== null}] text="${t}"`);
    });
    return lines.join('\n');
  }).catch(e => `JS error: ${e}`);

  log(`\n=== POST-TAP PAX BTN ===\n${dump}\n=== FIN ===`);
  mkdirSync('evidence/dom-dump', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  writeFileSync(join('evidence/dom-dump',`pax-btn-tap-${ts}.txt`), dump, 'utf-8');
  log('✓ Guardado');
  await driver.deleteSession();
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
