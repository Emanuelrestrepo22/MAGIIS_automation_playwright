/**
 * TEMPORAL (MG-626) — v3: payload del alta de tarjeta eBiz + PRUEBA del modo Compañía en la
 * MISMA sesión + verificación de aislamiento de wallet Personal vs Compañía.
 *
 * La v2 capturó el POST `passengers/8669/cards` SIN campo `placeId` (ni raíz ni anidado) y con
 * `passengerUserId: "8669"` (el perfil INDIVIDUO), pese a estar en modo Compañía. Esta v3 prueba
 * ese punto sin lugar a duda:
 *   - lee la etiqueta de modo ANTES del alta, DESPUÉS del alta y saca screenshots;
 *   - captura el payload del POST;
 *   - dumpea el código de `saveCardToBackend` del componente Angular (¿menciona placeId?);
 *   - togglea a Personal y compara el wallet (¿el mismo listado → wallet compartido?).
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J ENV=test \
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/_tmp-mg626-payload-v3.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';
import type { AppiumDriver } from '../base/AppiumSessionBase';

const log = (m: string): void => console.log(`[mg626-v3] ${m}`);

const c = EBIZ_CARDS.SUCCESS;
const card = {
	number: c.number,
	expiry: c.exp.length === 4 ? `${c.exp.slice(0, 2)}/${c.exp.slice(2)}` : c.exp,
	cvc: c.cvc,
	holderName: c.holderName,
	address: EBIZ_BILLING.address,
	zip: EBIZ_BILLING.zip
};
const LAST4 = c.number.slice(-4);
const KEY = '__mg626Net3__';
const LEAVE_CLEAN = process.env.MG626_LEAVE_CLEAN === '1';

async function toWebView(driver: AppiumDriver): Promise<void> {
	const ctxs = (await driver.getContexts().catch(() => [])) as string[];
	const wv = ctxs.find(x => String(x).startsWith('WEBVIEW'));
	if (wv) await driver.switchContext(wv);
}

async function snap(driver: AppiumDriver, name: string): Promise<void> {
	mkdirSync('evidence/mg626', { recursive: true });
	await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> })
		.saveScreenshot(`evidence/mg626/${name}.png`)
		.then(() => log(`screenshot → evidence/mg626/${name}.png`))
		.catch((e: unknown) => log(`screenshot ${name} err: ${e instanceof Error ? e.message : String(e)}`));
}

/** Etiqueta de modo visible en el shell (Home) o, si no está en Home, texto de cabecera. */
async function readMode(driver: AppiumDriver): Promise<string> {
	await toWebView(driver);
	return driver.execute(() => {
		const sel = '#main-content > app-navigator > ion-content > ion-tabs > div > ion-router-outlet > app-home > div.header-menu > div > span';
		const span = document.querySelector(sel) ?? document.querySelector('.toggle_label');
		const label = (span?.textContent ?? '').replace(/\s+/g, ' ').trim();
		const toggle = document.querySelector('app-home div.header-menu ion-toggle') as (HTMLElement & { checked?: boolean }) | null;
		const bodyHit = /Compa[nñ]ía/i.test(document.body?.innerText ?? '') ? 'body-menciona-Compañía' : 'body-sin-Compañía';
		return `label="${label}" toggleChecked=${String(toggle?.checked)} ${bodyHit} url=${location.href}`;
	}).catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`) as Promise<string>;
}

function installNet(driver: AppiumDriver): Promise<unknown> {
	return driver.execute((k: string) => {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const win = window as any;
		if (win[k]?.installed) { win[k].clear(); return 'already'; }
		const entries: any[] = [];
		const cut = (s: string, n = 20000): string => (s.length <= n ? s : `${s.slice(0, n)}…[+${s.length - n}]`);
		const hdrs = (h: any): Record<string, string> => {
			const o: Record<string, string> = {};
			try {
				if (!h) return o;
				if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach((v: string, kk: string) => { o[kk] = v; }); return o; }
				if (Array.isArray(h)) { for (const p of h) if (Array.isArray(p)) o[String(p[0])] = String(p[1]); return o; }
				for (const kk of Object.keys(h)) o[kk] = String(h[kk]);
			} catch { /* opaco */ }
			return o;
		};
		const bodyStr = async (b: any): Promise<string> => {
			if (b == null) return '';
			if (typeof b === 'string') return b;
			try {
				if (typeof Request !== 'undefined' && b instanceof Request) return await b.clone().text();
				if (typeof Blob !== 'undefined' && b instanceof Blob) return await b.text();
				return JSON.stringify(b);
			} catch { return String(b); }
		};
		const wrap = (orig: any): any => {
			if (!orig || orig.__mg626W) return orig;
			const w: any = async (...a: any[]) => {
				const at = new Date().toISOString();
				let url = ''; let method = 'GET'; let reqBody = ''; let reqHeaders: Record<string, string> = {};
				try {
					const i = a[0]; const init = a[1];
					if (typeof i === 'string') url = i;
					else if (typeof Request !== 'undefined' && i instanceof Request) { url = i.url; method = i.method || method; reqHeaders = hdrs(i.headers); reqBody = await bodyStr(i); }
					if (init?.method) method = init.method;
					if (init?.headers) reqHeaders = Object.assign(reqHeaders, hdrs(init.headers));
					if (typeof init?.body !== 'undefined') reqBody = await bodyStr(init.body);
					const r = await orig.apply(win, a);
					let resBody = ''; try { resBody = await r.clone().text(); } catch { resBody = '<unreadable>'; }
					entries.push({ kind: 'fetch', method, url, at, status: r.status, reqHeaders, reqBody: cut(reqBody), resBody: cut(resBody) });
					return r;
				} catch (e: any) { entries.push({ kind: 'fetch', method, url, at, reqBody: cut(reqBody), error: String(e?.message ?? e) }); throw e; }
			};
			w.__mg626W = true; return w;
		};
		let cur = wrap(win.fetch);
		try { Object.defineProperty(win, 'fetch', { configurable: true, get: () => cur, set: (v: any) => { cur = wrap(v); } }); } catch { win.fetch = cur; }
		const proto: any = XMLHttpRequest.prototype;
		if (!proto.__mg626X) {
			const oO = proto.open; const oS = proto.send; const oH = proto.setRequestHeader;
			proto.open = function (m: string, u: string, ...r: any[]) { (this as any).__x = { method: m || 'GET', url: String(u ?? ''), at: new Date().toISOString(), reqHeaders: {} }; return oO.apply(this, [m, u, ...r]); };
			proto.setRequestHeader = function (n: string, v: string) { const x = (this as any).__x; if (x) x.reqHeaders[n] = v; return oH.call(this, n, v); };
			proto.send = function (b?: any) {
				const s: any = this; const x = s.__x;
				if (x) x.reqBody = typeof b === 'string' ? b : b ? String(b) : '';
				const fin = (): void => { if (!x || x.done) return; x.done = true; entries.push({ kind: 'xhr', method: x.method, url: x.url, at: x.at, status: s.status, reqHeaders: x.reqHeaders, reqBody: cut(x.reqBody ?? ''), resBody: cut(String(s.responseText ?? '')) }); };
				s.addEventListener('loadend', fin); s.addEventListener('error', fin); s.addEventListener('abort', fin);
				return oS.call(this, b);
			};
			proto.__mg626X = true;
		}
		win[k] = { installed: true, clear: () => { entries.length = 0; }, snapshot: () => entries.map(e => JSON.parse(JSON.stringify(e))) };
		return 'installed';
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}, KEY);
}

async function netSnapshot(driver: AppiumDriver): Promise<Array<Record<string, unknown>>> {
	await toWebView(driver);
	return (await driver.execute((k: string) => (window as never as Record<string, { snapshot?: () => unknown[] }>)[k]?.snapshot?.() ?? [], KEY).catch(() => [])) as Array<Record<string, unknown>>;
}

/** Lee el código del componente de alta de tarjeta: ¿el FE menciona placeId en el submit? */
async function dumpComponentSource(driver: AppiumDriver): Promise<string> {
	await toWebView(driver);
	return driver.execute(() => {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const ng = (window as any).ng;
		const host = document.querySelector('app-credit-card-payment-data');
		if (!ng || !host) return 'no-ng-or-host';
		const cmp = ng.getComponent(host);
		if (!cmp) return 'no-cmp';
		const parts: string[] = [];
		for (const m of ['saveCardToBackend', 'verifyCreditCard', 'submit']) {
			try { parts.push(`### ${m}\n${String(cmp[m])}`); } catch { parts.push(`### ${m}\n<unreadable>`); }
		}
		try { parts.push(`### cardService.addCard\n${String(cmp.cardService?.addCard)}`); } catch { parts.push('### cardService.addCard\n<unreadable>'); }
		try { parts.push(`### cardService keys\n${Object.keys(cmp.cardService ?? {}).join(', ')}`); } catch { /* noop */ }
		return parts.join('\n\n');
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}).catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`) as Promise<string>;
}

async function run(): Promise<void> {
	mkdirSync('evidence/mg626', { recursive: true });
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'business' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();

		log(`MODO tras toggle: ${await readMode(driver)}`);
		await snap(driver, 'v3-01-home-compania');

		await wallet.openWallet();
		await installNet(driver);
		const hadCard = await wallet.hasCard(LAST4, 5_000).catch(() => false);
		log(`wallet COMPAÑÍA: hasCard(${LAST4})=${hadCard} · count=${await wallet.countCards().catch(() => -1)}`);
		await snap(driver, 'v3-02-wallet-compania-before');

		if (hadCard) {
			log(`borro …${LAST4} para forzar el POST de alta`);
			await wallet.deleteCard(LAST4).catch((e: unknown) => log(`delete err: ${e instanceof Error ? e.message : String(e)}`));
		}

		await wallet.tapAddCard();
		await wallet.fillCardForm(card);
		log(`GUARDAR habilitado=${await wallet.isSaveEnabled()} · formValid=${JSON.stringify(await wallet.readFormValidity())}`);
		await snap(driver, 'v3-03-form-lleno-compania');

		// Código del FE ANTES del submit (el componente se destruye al cerrar el modal).
		const src = await dumpComponentSource(driver);
		writeFileSync('evidence/mg626/fe-component-source.txt', src, 'utf-8');
		log(`fuente del componente → evidence/mg626/fe-component-source.txt (${src.length} chars)`);
		log(`¿menciona "placeId"? ${/placeId/i.test(src) ? 'SÍ' : 'NO'}`);

		await wallet.saveCard().catch((e: unknown) => log(`saveCard err: ${e instanceof Error ? e.message : String(e)}`));

		let entries: Array<Record<string, unknown>> = [];
		for (let i = 0; i < 12; i++) {
			await driver.pause(1_500);
			entries = await netSnapshot(driver);
			if (entries.some(e => String(e.method).toUpperCase() === 'POST' && /cards/i.test(String(e.url)))) { log(`POST /cards capturado en muestreo ${i + 1}`); break; }
		}
		writeFileSync('evidence/mg626/payload-v3-capture.json', JSON.stringify(entries, null, 2), 'utf-8');
		for (const e of entries) {
			log(`--- [${e.kind}] ${e.method} ${e.url} → ${e.status ?? e.error ?? '?'}`);
			if (e.reqBody) log(`    reqBody: ${String(e.reqBody).slice(0, 1400)}`);
		}

		log(`MODO tras el alta: ${await readMode(driver)}`);
		log(`hasCard(${LAST4}) en COMPAÑÍA = ${await wallet.hasCard(LAST4, 12_000).catch(() => false)}`);
		await snap(driver, 'v3-04-wallet-compania-after-add');

		// ── Aislamiento: ¿el wallet Personal muestra la misma tarjeta? ──────────
		try {
			await harness.ensureProfileMode('personal');
			log(`MODO tras togglear a Personal: ${await readMode(driver)}`);
			await snap(driver, 'v3-05-home-personal');
			await wallet.openWallet();
			log(`wallet PERSONAL: hasCard(${LAST4})=${await wallet.hasCard(LAST4, 8_000).catch(() => false)} · count=${await wallet.countCards().catch(() => -1)}`);
			await snap(driver, 'v3-06-wallet-personal');
			const after = await netSnapshot(driver);
			const allCards = after.filter(e => /allCards/i.test(String(e.url))).map(e => `${e.method} ${e.url} → ${e.status}`);
			log(`GETs allCards observados en la sesión:\n${allCards.join('\n')}`);
		} catch (e) {
			log(`chequeo de aislamiento falló: ${e instanceof Error ? e.message : String(e)}`);
		}

		if (LEAVE_CLEAN) {
			log('MG626_LEAVE_CLEAN=1 → borro la tarjeta para que el spec formal haga un alta REAL');
			await wallet.deleteCard(LAST4).catch((e: unknown) => log(`cleanup err: ${e instanceof Error ? e.message : String(e)}`));
			log(`estado final: hasCard=${await wallet.hasCard(LAST4, 4_000).catch(() => false)}`);
		}
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[mg626-v3] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
