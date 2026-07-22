/**
 * DRAFT — Dump del TravelResumePage y liberación del viaje stale (street-trip).
 * Enumera métodos de pago + footer, luego intenta cerrar con método NO-tarjeta;
 * si todo lleva a "Ingresar tarjeta"/disabled, reporta para decisión manual/API.
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PKG = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string): void => console.log(`[free-resume] ${m}`);
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
  const dumpResume = async (): Promise<Record<string, unknown>> => driver.execute<Record<string, unknown>, []>(() => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
    const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
    const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') ?? []).map((b) => ({
      text: norm((b as HTMLElement).innerText), class: norm((b as HTMLElement).className).slice(0, 60),
      icon: (b.querySelector('ion-icon')?.getAttribute('src') ?? ''), vis: vis(b),
    }));
    const footer = r?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
    const allFooterBtns = Array.from(r?.querySelectorAll('ion-footer button') ?? []).map((b) => ({
      text: norm((b as HTMLElement).innerText), disabled: (b as HTMLButtonElement).disabled, vis: vis(b),
    }));
    return {
      url: window.location.href,
      footerText: footer ? norm(footer.innerText) : '(none)',
      footerDisabled: footer ? (footer.disabled || footer.getAttribute('disabled') !== null) : true,
      allFooterBtns, payments: pays,
    };
  }).catch((e: Error) => ({ error: e.message }));

  try {
    await driver.pause(1200);
    await switchWv();
    let u = await url();
    log(`URL: ${u}`);
    const before = await dumpResume();
    mkdirSync('evidence/dom-dump', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join('evidence/dom-dump', `free-resume-${ts}.txt`), JSON.stringify(before, null, 2), 'utf-8');
    log(`resume state: ${JSON.stringify(before)}`);

    if (!/TravelResumePage/i.test(u)) { log('No en TravelResumePage — nada que liberar.'); return; }

    // Estrategia: ciclar payment buttons; cerrar con el primer footer NO-"Ingresar tarjeta" habilitado.
    const payCount = (before.payments as unknown[])?.length ?? 0;
    for (let i = 0; i < Math.max(payCount, 3); i++) {
      await driver.execute<boolean, [number]>((idx) => {
        const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
        const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') ?? []).filter((b) => (b as HTMLElement).offsetParent !== null) as HTMLElement[];
        if (!pays.length) return false; pays[idx % pays.length].click(); return true;
      }, i).catch(() => false);
      await driver.pause(2500);
      const fs = await dumpResume();
      log(`  tras payment[${i}] footer="${fs.footerText}" disabled=${fs.footerDisabled}`);
      if (!/ingresar tarjeta/i.test(String(fs.footerText)) && fs.footerDisabled === false) {
        await driver.execute<boolean, []>(() => {
          const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
          const b = r?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
          if (b) { b.click(); return true; } return false;
        }).catch(() => false);
        await driver.pause(3500);
        // firma
        const hasSigner = await driver.execute<boolean, []>(() => !!document.querySelector('app-page-signer')).catch(() => false);
        if (hasSigner) {
          log('  firma presente — dibujando');
          const rect = await driver.execute<{x:number;y:number;w:number;h:number}|null,[]>(() => {
            const c = document.querySelector('app-page-signer canvas') as HTMLCanvasElement | null;
            if (!c) return null; const r = c.getBoundingClientRect(); return { x:r.left,y:r.top,w:r.width,h:r.height };
          }).catch(() => null);
          if (rect && rect.w > 5) {
            const px = (f:number) => Math.round(rect.x + rect.w*f); const py = (f:number) => Math.round(rect.y + rect.h*f);
            await driver.performActions([{ type:'pointer', id:'f1', parameters:{pointerType:'touch'}, actions:[
              { type:'pointerMove', duration:0, x:px(0.2), y:py(0.5) }, { type:'pointerDown', button:0 },
              { type:'pointerMove', duration:120, x:px(0.5), y:py(0.3) }, { type:'pointerMove', duration:120, x:px(0.8), y:py(0.6) },
              { type:'pointerUp', button:0 } ] }]).catch(() => {});
            await driver.pause(600);
          }
          await driver.execute<boolean, []>(() => {
            const b = document.querySelector('app-page-signer ion-footer button.btn.primary') as HTMLElement | null;
            if (b) { b.click(); return true; } return false;
          }).catch(() => false);
          await driver.pause(3000);
        }
        // alert trip-lost / éxito
        await driver.execute<boolean, []>(() => {
          const b = document.querySelector('app-alert-modal button.btn-outlined-red, app-alert-modal button') as HTMLElement | null;
          if (b && (b as HTMLElement).offsetParent !== null) { b.click(); return true; } return false;
        }).catch(() => false);
        await driver.pause(2000);
        u = await url();
        log(`URL tras cerrar: ${u}`);
        if (/\/navigator\/home/i.test(u)) break;
      }
    }
    u = await url();
    log(`URL final: ${u}`);
  } finally {
    await driver.deleteSession().catch(() => {});
    log('Sesión cerrada');
  }
}
run().catch((e) => { console.error('[free-resume] fatal:', e); process.exit(1); });
