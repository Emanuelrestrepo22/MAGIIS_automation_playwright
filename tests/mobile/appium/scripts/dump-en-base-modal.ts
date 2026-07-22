/**
 * DRAFT — Captura precisa del modal que abre "En Base" (button.driver-home.home-icon-base).
 * Objetivo TASK 2b: documentar el componente real, filas de base y mecanismo de dismiss.
 * NO selecciona ninguna base (cambiaría la asignación). Solo abre → dump → cierra.
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PKG = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string): void => console.log(`[en-base] ${m}`);
type Driver = Awaited<ReturnType<typeof remote>>;

async function run(): Promise<void> {
  const driver = await remote({
    protocol: 'http', hostname: 'localhost', port: 4723, path: '/', logLevel: 'warn',
    connectionRetryTimeout: 60_000, connectionRetryCount: 2,
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'SM-A055M', 'appium:platformVersion': '15.0', 'appium:udid': UDID,
      'appium:appPackage': PKG, 'appium:appActivity': '.MainActivity',
      'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
      'appium:newCommandTimeout': 180, 'appium:chromedriverAutodownload': true,
    } as Record<string, unknown>,
  });
  const switchWv = async (): Promise<void> => {
    const ctx = (await driver.getContexts().catch(() => [])) as string[];
    const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
    if (wv) await driver.switchContext(wv).catch(() => {});
  };
  const url = (): Promise<string> => driver.execute<string, []>(() => window.location.href).catch(() => '');
  try {
    await driver.pause(1200);
    await switchWv();
    await driver.execute<void, []>(() => { (document.querySelector('#tab-button-home') as HTMLElement | null)?.click(); }).catch(() => {});
    await driver.pause(1500);
    log(`URL: ${await url()}`);

    // tap En Base
    const tapped = await driver.execute<boolean, []>(() => {
      const active = document.querySelector('page-home:not(.ion-page-hidden), .ion-page:not(.ion-page-hidden)') ?? document;
      const b = active.querySelector('button.driver-home.home-icon-base') as HTMLElement | null;
      if (b && b.offsetParent !== null) { b.click(); return true; } return false;
    }).catch(() => false);
    log(`tap En Base: ${tapped}`);
    await driver.pause(2000);

    // dump del modal abierto: componente, header, filas, botones, backdrop
    const dump = await driver.execute<Record<string, unknown>, []>(() => {
      const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
      const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
      const modals = Array.from(document.querySelectorAll('ion-modal, app-base-modal, app-nearby-bases, [class*="base"]')).filter(vis);
      const out: Array<Record<string, unknown>> = [];
      for (const m of modals) {
        const tag = m.tagName.toLowerCase();
        const cls = norm((m as HTMLElement).className).slice(0, 80);
        // custom component tags dentro del modal
        const inner = Array.from(m.querySelectorAll('*'))
          .map((e) => e.tagName.toLowerCase())
          .filter((t) => t.startsWith('app-') || t === 'ion-list' || t === 'ion-item' || t === 'ion-radio');
        const uniqInner = Array.from(new Set(inner));
        const items = Array.from(m.querySelectorAll('ion-item, ion-radio, .base-item, li, ion-row')).filter(vis).slice(0, 12)
          .map((it) => ({ tag: it.tagName.toLowerCase(), cls: norm((it as HTMLElement).className).slice(0, 50), text: norm((it as HTMLElement).innerText).slice(0, 60) }));
        const btns = Array.from(m.querySelectorAll('button, ion-button')).filter(vis)
          .map((b) => ({ text: norm((b as HTMLElement).innerText), cls: norm((b as HTMLElement).className).slice(0, 50) }));
        const header = norm(m.querySelector('ion-header, ion-title, h1, h2, .modal-title')?.textContent ?? '');
        out.push({ tag, cls, header, customComponents: uniqInner, items, buttons: btns });
      }
      const backdrop = document.querySelector('ion-backdrop');
      return { url: window.location.href, modalCount: out.length, modals: out, hasBackdrop: !!backdrop };
    }).catch((e: Error) => ({ error: e.message }));
    mkdirSync('evidence/dom-dump', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join('evidence/dom-dump', `en-base-modal-${ts}.txt`), JSON.stringify(dump, null, 2), 'utf-8');
    log(`modal dump: ${JSON.stringify(dump, null, 2)}`);

    // dismiss SIN seleccionar base: intentar backdrop, luego back de Ionic, luego hardware back
    let dismissed = await driver.execute<boolean, []>(() => {
      const bd = document.querySelector('ion-modal ion-backdrop, ion-backdrop') as HTMLElement | null;
      if (bd && bd.offsetParent !== null) { bd.click(); return true; }
      // botón cerrar/atrás del modal
      const closeBtn = document.querySelector('ion-modal ion-buttons button, ion-modal .modal-close, ion-modal button[aria-label*="close" i]') as HTMLElement | null;
      if (closeBtn) { closeBtn.click(); return true; }
      return false;
    }).catch(() => false);
    await driver.pause(1200);
    let stillOpen = await driver.execute<boolean, []>(() => {
      const m = document.querySelector('ion-modal') as HTMLElement | null;
      return !!(m && m.offsetParent !== null && /base/i.test(m.innerText ?? ''));
    }).catch(() => false);
    if (stillOpen) {
      // hardware back
      await driver.back().catch(() => {});
      await driver.pause(1200);
      await switchWv();
      stillOpen = await driver.execute<boolean, []>(() => {
        const m = document.querySelector('ion-modal') as HTMLElement | null;
        return !!(m && m.offsetParent !== null && /base/i.test(m.innerText ?? ''));
      }).catch(() => false);
      dismissed = !stillOpen;
    }
    log(`dismiss: backdrop/close=${dismissed} stillOpen=${stillOpen} finalUrl=${await url()}`);
  } finally {
    await driver.deleteSession().catch(() => {});
    log('Sesión cerrada');
  }
}
run().catch((e) => { console.error('[en-base] fatal:', e); process.exit(1); });
