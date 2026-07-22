/**
 * DRAFT — TASK 2a: valida la GEOCERCA PICKUP OUT-OF-RANGE en device.
 * Precondición: un viaje PLANO con pickup LEJANO (ej. Reconquista 661, ~5km del device en Belgrano)
 * fue creado y ASIGNADO manualmente a este driver por la fase web (test-5 / create-flat-trip-far-origin).
 *
 * Flujo driver: espera TravelConfirmPage → aceptar → "Empezar Viaje" → modal geocerca out-of-range
 * (geocerca_alert_title / "Ingresar código") → ingresar last4 del travelId en ion-input.code-input →
 * "Confirmar" → TravelInProgressPage. Espeja DriverCargoDeclineHarness.startTripHandlingGeofence().
 * Luego cleanup (finalizar + cerrar efectivo) → home.
 *
 * Correr en BACKGROUND antes de la fase web (poll TravelConfirmPage hasta ~150s).
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PKG = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const CONFIRM_TIMEOUT = Number(process.env.CONFIRM_TIMEOUT_MS ?? 150_000);
const log = (m: string): void => console.log(`[geocerca] ${m}`);
type Driver = Awaited<ReturnType<typeof remote>>;
const report: Array<{ step: string; status: 'OK' | 'FAIL' | 'PARTIAL' | 'INFO'; detail: string }> = [];
function add(step: string, status: 'OK' | 'FAIL' | 'PARTIAL' | 'INFO', detail = ''): void {
  report.push({ step, status, detail });
  const icon = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : status === 'PARTIAL' ? '≈' : 'ℹ';
  log(`${icon} [${step}] ${detail}`);
}
function save(label: string, content: string): void {
  mkdirSync('evidence/dom-dump', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join('evidence/dom-dump', `geocerca-${label}-${ts}.txt`), content, 'utf-8');
}

async function switchWv(d: Driver, timeout = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ctx = (await d.getContexts().catch(() => [])) as string[];
    const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
    if (wv) { await d.switchContext(wv).catch(() => {}); return true; }
    await d.pause(300);
  }
  return false;
}
const url = (d: Driver): Promise<string> => d.execute<string, []>(() => window.location.href).catch(() => '');
async function waitForUrl(d: Driver, token: string, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { await switchWv(d); if ((await url(d)).includes(token)) return true; await d.pause(600); }
  return false;
}
async function dumpOverlays(d: Driver): Promise<Record<string, unknown>> {
  await switchWv(d);
  return d.execute<Record<string, unknown>, []>(() => {
    const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
    const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
    const out: Array<Record<string, unknown>> = [];
    for (const sel of ['app-confirm-modal', 'app-code-confirmation-modal', 'ion-alert', 'ion-modal.show-modal', 'ion-modal']) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!vis(el)) return;
        const buttons = Array.from(el.querySelectorAll('button, .alert-button')).filter(vis).map((b) => norm((b as HTMLElement).innerText));
        out.push({ sel, text: norm((el as HTMLElement).innerText).slice(0, 200), buttons });
      });
    }
    return { url: window.location.href, count: out.length, overlays: out };
  }).catch((e: Error) => ({ error: e.message }));
}

async function run(): Promise<void> {
  const driver = await remote({
    protocol: 'http', hostname: 'localhost', port: 4723, path: '/', logLevel: 'warn',
    connectionRetryTimeout: 60_000, connectionRetryCount: 2,
    capabilities: {
      platformName: 'Android', 'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'SM-A055M', 'appium:platformVersion': '15.0', 'appium:udid': UDID,
      'appium:appPackage': PKG, 'appium:appActivity': '.MainActivity',
      'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
      'appium:newCommandTimeout': 300, 'appium:chromedriverAutodownload': true,
    } as Record<string, unknown>,
  });
  try {
    await driver.pause(1200);
    await switchWv(driver);
    await driver.execute<void, []>(() => { (document.querySelector('#tab-button-home') as HTMLElement | null)?.click(); }).catch(() => {});
    await driver.pause(1000);
    add('PREWARM', 'INFO', `url=${await url(driver)} — esperando TravelConfirmPage (${CONFIRM_TIMEOUT}ms)`);

    // 1. Esperar el viaje asignado. Detección rica: URL TravelConfirmPage, DOM app-page-travel-confirm,
    //    o una card de viaje en la sección "Viaje Asignado" del home (que hay que TAPEAR para abrir).
    let confirmReached = false;
    let assignedSeen = '';
    {
      const deadline = Date.now() + CONFIRM_TIMEOUT;
      while (Date.now() < deadline && !confirmReached) {
        await switchWv(driver);
        const u = await url(driver);
        if (/TravelConfirmPage/i.test(u)) { confirmReached = true; break; }
        // DOM confirm page o card asignada en home
        const probe = await driver.execute<{ confirm: boolean; assigned: string; homeAssignedText: string }, []>(() => {
          const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
          const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
          const confirmDom = !!document.querySelector('app-page-travel-confirm:not(.ion-page-hidden)');
          // sección "Viaje Asignado" del home: buscar card con código de viaje (\d+-W) o clase trip/travel
          let assigned = '';
          const cards = Array.from(document.querySelectorAll('page-home:not(.ion-page-hidden) [class*="trip"], page-home:not(.ion-page-hidden) [class*="travel"], page-home:not(.ion-page-hidden) ion-card, page-home:not(.ion-page-hidden) [class*="assigned"], page-home:not(.ion-page-hidden) [class*="asignad"]'));
          for (const c of cards) {
            if (!vis(c)) continue;
            const t = norm((c as HTMLElement).innerText);
            if (/\d{2,}\s*-\s*[A-Z]/.test(t) || /\$\s*\d/.test(t)) { assigned = t.slice(0, 120); (c as HTMLElement).click(); break; }
          }
          const homeAssignedText = norm(document.querySelector('page-home:not(.ion-page-hidden)')?.textContent ?? '').slice(0, 400);
          return { confirm: confirmDom, assigned, homeAssignedText };
        }).catch(() => ({ confirm: false, assigned: '', homeAssignedText: '' }));
        if (probe.assigned) { assignedSeen = probe.assigned; await driver.pause(1500); }
        if (probe.confirm) { confirmReached = true; break; }
        if (/TravelConfirmPage/i.test(await url(driver))) { confirmReached = true; break; }
        await driver.pause(1200);
      }
    }
    if (!confirmReached) {
      add('WAIT-CONFIRM', 'FAIL', `no llegó al viaje asignado en ${CONFIRM_TIMEOUT}ms. assignedCardVista="${assignedSeen}" url=${await url(driver)}. (Con pickup lejano el backend no empuja el viaje al device driver — ver GAP.)`);
      return;
    }
    // capturar travelId
    let travelId = '';
    {
      const raw = await url(driver);
      let dec = raw; try { dec = decodeURIComponent(raw); } catch { /* keep */ }
      const m = dec.match(/travelId["']?\s*:\s*(\d+)/i);
      travelId = m ? m[1] : '';
    }
    add('WAIT-CONFIRM', 'OK', `TravelConfirmPage. travelId=${travelId || '(no capturado)'}`);
    save('confirm-url', await url(driver));

    // 2. Aceptar
    for (let i = 0; i < 20 && /TravelConfirmPage/i.test(await url(driver)); i++) {
      await switchWv(driver);
      await driver.execute<boolean, []>(() => {
        const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        const page = document.querySelector('app-page-travel-confirm:not(.ion-page-hidden)') ?? document.querySelector('app-page-travel-confirm');
        const scope: ParentNode = page ?? document;
        const btns = Array.from(scope.querySelectorAll('ion-footer button, button.btn.primary, button')) as HTMLElement[];
        const b = btns.find((x) => x.offsetParent !== null && /aceptar|buscar pasajero/.test(norm(x.innerText)));
        if (b) { b.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(1500);
    }
    const acceptedUrl = await url(driver);
    add('ACCEPT', !/TravelConfirmPage/i.test(acceptedUrl) ? 'OK' : 'FAIL', `url tras aceptar=${acceptedUrl}`);

    // 3. TravelToStartPage → "Empezar Viaje"
    await waitForUrl(driver, 'TravelToStartPage', 20_000);
    await switchWv(driver);
    await driver.execute<boolean, []>(() => {
      const active = document.querySelector('app-page-travel-to-start:not(.ion-page-hidden)') ?? document.querySelector('app-page-travel-to-start');
      const b = (active?.querySelector('ion-footer button') as HTMLElement | null) ?? (document.querySelector('button.btn.primary.trip-pax-start') as HTMLElement | null);
      if (b && b.offsetParent !== null) { b.click(); return true; } return false;
    }).catch(() => false);
    await driver.pause(2000);
    const ov1 = await dumpOverlays(driver);
    save('after-empezar-overlays', JSON.stringify(ov1, null, 2));
    add('EMPEZAR', 'INFO', `overlays tras Empezar Viaje: ${JSON.stringify(ov1)}`);

    // 4. Geocerca: ¿in-range (Si → InProgress) o out-of-range ("Ingresar código")?
    const alreadyInProgress = /TravelInProgressPage/i.test(await url(driver));
    if (alreadyInProgress) {
      add('GEOCERCA', 'PARTIAL', 'llegó a TravelInProgressPage sin pedir código (in-range). El pickup NO estaba fuera de rango.');
    } else {
      // ¿hay botón "Ingresar código"?
      const hasCodeBtn = await driver.execute<boolean, []>(() => {
        const btns = Array.from(document.querySelectorAll('app-confirm-modal button, ion-modal button')) as HTMLElement[];
        return btns.some((b) => b.offsetParent !== null && /ingresar c[oó]digo/i.test(b.textContent ?? ''));
      }).catch(() => false);
      if (hasCodeBtn) {
        add('GEOCERCA-MODAL', 'OK', 'modal geocerca out-of-range con botón "Ingresar código" presente ✓');
        // click "Ingresar código"
        await driver.execute<boolean, []>(() => {
          const btns = Array.from(document.querySelectorAll('app-confirm-modal button.btn.primary, ion-modal button.btn.primary, app-confirm-modal button, ion-modal button')) as HTMLElement[];
          const b = btns.find((x) => x.offsetParent !== null && /ingresar c[oó]digo/i.test(x.textContent ?? ''));
          if (b) { b.click(); return true; } return false;
        }).catch(() => false);
        await driver.pause(1800);
        const ov2 = await dumpOverlays(driver);
        save('code-modal-overlays', JSON.stringify(ov2, null, 2));
        // fill ion-input.code-input con last4 del travelId
        const code = travelId.replace(/\D/g, '').slice(-4);
        if (code.length < 4) {
          add('GEOCERCA-CODE', 'FAIL', `no se capturó travelId (last4 requerido). travelId="${travelId}"`);
        } else {
          await driver.execute((value: string) => {
            const host = document.querySelector('ion-input.code-input, .code-input') as (HTMLElement & { value?: unknown }) | null;
            if (!host) return;
            const root = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
            const inner = (root ? root.querySelector('input') : host.querySelector('input')) as HTMLInputElement | null;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (inner && setter) {
              inner.focus(); setter.call(inner, value);
              inner.dispatchEvent(new Event('input', { bubbles: true }));
              inner.dispatchEvent(new Event('change', { bubbles: true }));
            }
            try { host.value = value; } catch { /* noop */ }
            host.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }));
            host.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
          }, code).catch(() => {});
          await driver.pause(900);
          // "Confirmar"
          const confirmed = await driver.execute<boolean, []>(() => {
            const btns = Array.from(document.querySelectorAll('app-code-confirmation-modal button.btn.primary, ion-modal button.btn.primary, app-code-confirmation-modal button, ion-modal button')) as HTMLElement[];
            const b = btns.find((x) => x.offsetParent !== null && /confirmar/i.test(x.textContent ?? ''));
            if (b) { b.click(); return true; } return false;
          }).catch(() => false);
          await driver.pause(2500);
          const inProgress = await waitForUrl(driver, 'TravelInProgressPage', 20_000);
          add('GEOCERCA-CODE', inProgress ? 'OK' : 'FAIL', `code=${code} confirmar=${confirmed} → TravelInProgressPage=${inProgress} (url=${await url(driver)})`);
        }
      } else {
        add('GEOCERCA-MODAL', 'FAIL', `no apareció "Ingresar código" tras Empezar Viaje. overlays=${JSON.stringify(ov1)}`);
      }
    }

    // 5. cleanup: finalizar + cerrar efectivo → home
    log('── cleanup viaje ──');
    let u = await url(driver);
    if (/TravelInProgressPage/i.test(u)) {
      await driver.execute<boolean, []>(() => {
        const active = document.querySelector('app-page-travel-in-progress:not(.ion-page-hidden)') ?? document.querySelector('app-page-travel-in-progress');
        const b = (active?.querySelector('.btn-finish-container button') as HTMLElement | null) ?? (active?.querySelector('button.btn.finish') as HTMLElement | null);
        if (b && b.offsetParent !== null) { b.click(); return true; } return false;
      }).catch(() => false);
      await driver.pause(1500);
      await driver.execute<boolean, []>(() => {
        const b = document.querySelector('app-confirm-modal button.btn.primary') as HTMLElement | null;
        if (b && b.offsetParent !== null) { b.click(); return true; } return false;
      }).catch(() => false);
      await waitForUrl(driver, 'TravelResumePage', 20_000);
    }
    if (/TravelResumePage/i.test(await url(driver))) {
      for (let i = 0; i < 6; i++) {
        await switchWv(driver);
        const fs = await driver.execute<{ text: string; disabled: boolean }, []>(() => {
          const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
          const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
          const b = r?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
          return { text: b ? norm(b.innerText) : '', disabled: b ? (b.disabled || b.getAttribute('disabled') !== null) : true };
        }).catch(() => ({ text: '', disabled: true }));
        if (!/ingresar tarjeta/i.test(fs.text) && !fs.disabled && fs.text.length > 0) {
          await driver.execute<boolean, []>(() => {
            const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
            const b = r?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
            if (b) { b.click(); return true; } return false;
          }).catch(() => false);
          await driver.pause(3000);
          await driver.execute<boolean, []>(() => {
            const b = document.querySelector('app-page-signer ion-footer button.btn.primary, app-confirm-modal button.btn.primary, app-alert-modal button') as HTMLElement | null;
            if (b && b.offsetParent !== null) { b.click(); return true; } return false;
          }).catch(() => false);
          break;
        }
        await driver.execute<boolean, [number]>((idx) => {
          const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') ?? document.querySelector('app-travel-resume');
          const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') ?? []).filter((b) => (b as HTMLElement).offsetParent !== null) as HTMLElement[];
          if (!pays.length) return false; pays[idx % pays.length].click(); return true;
        }, i).catch(() => false);
        await driver.pause(2500);
      }
      await waitForUrl(driver, '/navigator/home', 20_000);
    }
    add('CLEANUP', /\/navigator\/home/i.test(await url(driver)) ? 'OK' : 'PARTIAL', `url final=${await url(driver)}`);
  } catch (e) {
    add('FATAL', 'FAIL', e instanceof Error ? e.message : String(e));
  } finally {
    log('\n' + '═'.repeat(60));
    for (const r of report) {
      const icon = r.status === 'OK' ? '✓' : r.status === 'FAIL' ? '✗' : r.status === 'PARTIAL' ? '≈' : 'ℹ';
      log(`${icon} [${r.step}] ${r.detail}`);
    }
    mkdirSync('evidence/reports', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join('evidence/reports', `geocerca-out-of-range-${ts}.json`), JSON.stringify({ timestamp: new Date().toISOString(), report }, null, 2), 'utf-8');
    await driver.deleteSession().catch(() => {});
    log('Sesión cerrada');
  }
}
run().catch((e) => { console.error('[geocerca] fatal:', e); process.exit(1); });
