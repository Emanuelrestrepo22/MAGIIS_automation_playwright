import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const log = (m: string) => console.log(`[travel-list] ${m}`);
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

  // Tap tab TravelListPage
  const tapped = await driver.execute<boolean,[]>(() => {
    const tab = document.querySelector('#tab-button-TravelListPage') as HTMLElement|null;
    if (tab) { tab.click(); return true; }
    return false;
  });
  log(tapped ? '✓ Tab TravelListPage' : '⚠ Tab no encontrado');
  await driver.pause(2000);

  const dump = await driver.execute<string,[]>(() => {
    const lines = [`URL: ${window.location.href}`];
    document.querySelectorAll('button,[role="button"],ion-button,ion-fab-button,ion-item').forEach(el => {
      const t = ((el as HTMLElement).innerText??'').trim().slice(0,100);
      const cls = (el.className??'').toString().slice(0,80);
      const vis = (el as HTMLElement).offsetParent !== null;
      if (t) lines.push(`[BTN vis=${vis}] tag=${el.tagName.toLowerCase()} class="${cls}" text="${t}"`);
    });
    document.querySelectorAll('ion-fab,ion-fab-button,[class*="fab"],[class*="calle"],[class*="street"],[class*="new-trip"],[class*="nueva"]').forEach(el => {
      const t = ((el as HTMLElement).innerText??'').trim().slice(0,100);
      const cls = (el.className??'').toString().slice(0,80);
      lines.push(`[FAB/SPECIAL] ${el.tagName} class="${cls}" text="${t}"`);
    });
    document.querySelectorAll('ion-page:not(.ion-page-hidden)').forEach(el => {
      lines.push(`[ACTIVE PAGE] ${el.tagName} id="${el.id}" class="${(el.className??'').toString().slice(0,80)}"`);
    });
    document.querySelectorAll('h1,h2,h3,ion-title,ion-toolbar').forEach(el => {
      const t = ((el as HTMLElement).innerText??'').trim();
      if (t) lines.push(`[TITLE] ${el.tagName} text="${t}"`);
    });
    return lines.join('\n');
  }).catch(e => `JS error: ${e}`);

  log(`\n=== DUMP TravelListPage ===\n${dump}\n=== FIN ===`);
  mkdirSync('evidence/dom-dump', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  writeFileSync(join('evidence/dom-dump',`travel-list-tab-${ts}.txt`), dump, 'utf-8');
  log('✓ Guardado');
  await driver.deleteSession();
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
