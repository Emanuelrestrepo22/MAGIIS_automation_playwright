// Sonda de solo lectura: vuelca claves de Ionic Storage (IndexedDB _ionicstorage/_ionickv) del WebView.
import { getDriverAppConfig } from '../../config/appiumRuntime';
import { DriverHomeScreen } from '../../driver/DriverHomeScreen';
class Probe extends DriverHomeScreen {
  async go(): Promise<void> {
    await this.startSession();
    await this.dismissPreHomeOverlayIfPresent().catch(() => false);
    const ctx = await this.switchToWebView();
    console.log('[probe] webview:', ctx, '| url:', await this.executeInWebView(() => window.location.href.slice(0, 90)));
    await this.executeInWebView(() => {
      const w = window as any; w.__probe = undefined;
      const keys = ['userId','carrierUserId','pendingTravels','currentTravel','driverState','driverSubState','tokenUserLogged'];
      const out: Record<string, unknown> = {};
      const req = indexedDB.open('_ionicstorage');
      req.onsuccess = () => { const st = req.result.transaction('_ionickv','readonly').objectStore('_ionickv'); let n = keys.length;
        keys.forEach(k => { const g = st.get(k); g.onsuccess = () => { out[k] = g.result ?? null; if (--n === 0) w.__probe = out; }; g.onerror = () => { out[k] = 'ERR'; if (--n === 0) w.__probe = out; }; }); };
      req.onerror = () => { w.__probe = { error: 'open' }; };
    });
    let r: any; for (let i = 0; i < 30 && !r; i++) { r = await this.executeInWebView(() => (window as any).__probe); if (!r) await this.pause(250); }
    for (const [k, v] of Object.entries(r ?? { error: 'timeout' })) {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      console.log(`[probe] ${k} =`, k === 'tokenUserLogged' ? (s ? s.slice(0, 14) + '…(' + s.length + ')' : s) : (s ?? 'null').slice(0, 700));
    }
    await this.endSession();
  }
}
new Probe(getDriverAppConfig()).go().catch(e => { console.log('[probe] ERROR', e?.message ?? e); process.exitCode = 1; });
