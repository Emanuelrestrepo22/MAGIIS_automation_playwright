import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const log = (m: string) => console.log(`[home-online] ${m}`);
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

  // Tap tab home para ir al home limpio
  await driver.execute<void,[]>(() => {
    const tab = document.querySelector('#tab-button-home') as HTMLElement|null;
    if (tab) tab.click();
  });
  await driver.pause(1500);

  // Activar "Disponible" si está offline
  const avail = await driver.execute<string,[]>(() => {
    const btn = document.querySelector('#availability') as HTMLElement|null;
    return (btn?.innerText??'').trim();
  });
  log(`Estado actual: "${avail}"`);
  if (/no disponible|offline/i.test(avail)) {
    await driver.execute<void,[]>(() => {
      (document.querySelector('#availability') as HTMLElement|null)?.click();
    });
    await driver.pause(2000);
    log('✓ Toggle disponibilidad');
  }

  // Dump completo del home activo
  const dump = await driver.execute<string,[]>(() => {
    const lines = [`URL: ${window.location.href}`];

    // Todos los botones visibles en la página activa
    const activePage = document.querySelector('page-home:not(.ion-page-hidden), app-navigator:not(.ion-page-hidden)');
    const scope = activePage ?? document;
    (scope.querySelectorAll('button,[role="button"],ion-button,ion-fab-button,ion-item,a') as NodeListOf<HTMLElement>).forEach(el => {
      const t = (el.innerText??'').trim().replace(/\n/g,' ').slice(0,100);
      const cls = (el.className??'').toString().slice(0,80);
      const vis = el.offsetParent !== null;
      if (t) lines.push(`[BTN vis=${vis}] ${el.tagName.toLowerCase()} class="${cls}" text="${t}"`);
    });

    // Buscar ion-fab (botones flotantes de acción — típico punto de "nuevo viaje")
    document.querySelectorAll('ion-fab, ion-fab-button, [class*="fab"]').forEach(el => {
      const t = ((el as HTMLElement).innerText??'').trim();
      const cls = (el.className??'').toString().slice(0,80);
      const vis = (el as HTMLElement).offsetParent !== null;
      lines.push(`[FAB vis=${vis}] ${el.tagName} class="${cls}" text="${t}"`);
    });

    // Contenedores activos (no hidden)
    document.querySelectorAll('ion-page:not(.ion-page-hidden), page-home:not(.ion-page-hidden)').forEach(el => {
      lines.push(`[ACTIVE] ${el.tagName} id="${el.id}" class="${(el.className??'').toString().slice(0,80)}"`);
    });

    // Títulos y encabezados visibles
    (document.querySelectorAll('ion-title, h1, h2, ion-toolbar') as NodeListOf<HTMLElement>).forEach(el => {
      const t = (el.innerText??'').trim();
      const vis = el.offsetParent !== null;
      if (t) lines.push(`[TITLE vis=${vis}] ${el.tagName} text="${t}"`);
    });

    return lines.join('\n');
  }).catch(e => `JS error: ${e}`);

  log(`\n=== HOME DISPONIBLE ===\n${dump}\n=== FIN ===`);
  mkdirSync('evidence/dom-dump', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  writeFileSync(join('evidence/dom-dump',`home-online-${ts}.txt`), dump, 'utf-8');
  log('✓ Guardado');
  await driver.deleteSession();
}
run().catch(e => { console.error('❌', e.message); process.exit(1); });
