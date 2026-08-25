/**
 * TEMPORAL (MG-626) — captura del PAYLOAD del POST passengers/{id}/cards en modo Compañía (v2).
 *
 * En la v1 el interceptor del repo (`webViewNetworkCapture`) sólo vio el
 * `GET passengers/8669/addresses` y NO el POST de alta. Hipótesis: el POST sale por un `fetch`
 * cuya referencia fue reemplazada después de instalar el wrapper (Capacitor), o por un canal que
 * el wrapper de la v1 no cubre. Esta v2 instala un interceptor endurecido, inline:
 *   - envuelve `fetch` y además blinda `window.fetch` con un accessor: cualquier reasignación
 *     posterior queda re-envuelta automáticamente;
 *   - parcha `XMLHttpRequest.prototype` (open/send/setRequestHeader);
 *   - parcha `Request`/`Response` no; se registra el body vía clone();
 *   - expone un probe de diagnóstico (identidad de fetch, plugins Capacitor).
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J ENV=test \
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/_tmp-mg626-payload-v2.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';
import type { AppiumDriver } from '../base/AppiumSessionBase';

const log = (m: string): void => console.log(`[mg626-v2] ${m}`);

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
const KEY = '__mg626Net__';

type Entry = {
	kind: string;
	method: string;
	url: string;
	at: string;
	status?: number;
	reqBody?: string;
	resBody?: string;
	error?: string;
};

/** Interceptor endurecido: se inyecta en el webview y sobrevive reasignaciones de window.fetch. */
function installHardened(driver: AppiumDriver, storageKey: string): Promise<unknown> {
	return driver.execute((k: string) => {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const win = window as any;
		if (win[k]?.installed) {
			win[k].clear();
			return 'already';
		}

		const entries: any[] = [];
		const cut = (s: string, n = 20000): string => (s.length <= n ? s : `${s.slice(0, n)}…[+${s.length - n}]`);
		const hdrs = (h: any): Record<string, string> => {
			const o: Record<string, string> = {};
			if (!h) return o;
			try {
				if (typeof Headers !== 'undefined' && h instanceof Headers) {
					h.forEach((v: string, kk: string) => { o[kk] = v; });
					return o;
				}
				if (Array.isArray(h)) { for (const p of h) if (Array.isArray(p)) o[String(p[0])] = String(p[1]); return o; }
				for (const kk of Object.keys(h)) o[kk] = String(h[kk]);
			} catch { /* headers opacos */ }
			return o;
		};
		const bodyStr = async (b: any): Promise<string> => {
			if (b == null) return '';
			if (typeof b === 'string') return b;
			try {
				if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
				if (typeof FormData !== 'undefined' && b instanceof FormData) return Array.from((b as any).entries()).map((e: any) => `${e[0]}=${String(e[1])}`).join('&');
				if (typeof Request !== 'undefined' && b instanceof Request) return await b.clone().text();
				if (typeof Blob !== 'undefined' && b instanceof Blob) return await b.text();
				return JSON.stringify(b);
			} catch { return String(b); }
		};

		// ── fetch (envuelto + blindado contra reasignación) ────────────────────
		const wrap = (orig: any): any => {
			if (!orig || orig.__mg626Wrapped) return orig;
			const wrapped: any = async (...args: any[]) => {
				const at = new Date().toISOString();
				let url = '';
				let method = 'GET';
				let reqHeaders: Record<string, string> = {};
				let reqBody = '';
				try {
					const input = args[0];
					const init = args[1];
					if (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) url = String(input);
					else if (typeof Request !== 'undefined' && input instanceof Request) {
						url = input.url; method = input.method || method; reqHeaders = hdrs(input.headers);
						reqBody = await bodyStr(input);
					}
					if (init?.method) method = init.method;
					if (init?.headers) reqHeaders = Object.assign(reqHeaders, hdrs(init.headers));
					if (typeof init?.body !== 'undefined') reqBody = await bodyStr(init.body);
					const res = await orig.apply(win, args);
					let resBody = '';
					try { resBody = await res.clone().text(); } catch { resBody = '<unreadable>'; }
					entries.push({ kind: 'fetch', method, url, at, status: res.status, reqHeaders, reqBody: cut(reqBody), resBody: cut(resBody) });
					return res;
				} catch (e: any) {
					entries.push({ kind: 'fetch', method, url, at, reqHeaders, reqBody: cut(reqBody), error: String(e?.message ?? e) });
					throw e;
				}
			};
			wrapped.__mg626Wrapped = true;
			return wrapped;
		};

		let current = wrap(win.fetch);
		try {
			Object.defineProperty(win, 'fetch', {
				configurable: true,
				get: () => current,
				set: (v: any) => { current = wrap(v); }
			});
		} catch {
			win.fetch = current; // sin accessor: al menos queda el wrapper inicial
		}

		// ── XHR ───────────────────────────────────────────────────────────────
		const proto: any = XMLHttpRequest.prototype;
		if (!proto.__mg626Xhr) {
			const oOpen = proto.open;
			const oSend = proto.send;
			const oHdr = proto.setRequestHeader;
			proto.open = function (m: string, u: string, ...rest: any[]) {
				(this as any).__mg626 = { method: m || 'GET', url: String(u ?? ''), at: new Date().toISOString(), reqHeaders: {} as Record<string, string> };
				return oOpen.apply(this, [m, u, ...rest]);
			};
			proto.setRequestHeader = function (n: string, v: string) {
				const cx = (this as any).__mg626; if (cx) cx.reqHeaders[n] = v;
				return oHdr.call(this, n, v);
			};
			proto.send = function (b?: any) {
				const self: any = this;
				const cx = self.__mg626;
				if (cx) cx.reqBody = typeof b === 'string' ? b : b ? String(b) : '';
				const fin = (): void => {
					if (!cx || cx.done) return;
					cx.done = true;
					entries.push({ kind: 'xhr', method: cx.method, url: cx.url, at: cx.at, status: self.status, reqHeaders: cx.reqHeaders, reqBody: cut(cx.reqBody ?? ''), resBody: cut(String(self.responseText ?? '')) });
				};
				self.addEventListener('loadend', fin);
				self.addEventListener('error', fin);
				self.addEventListener('abort', fin);
				return oSend.call(this, b);
			};
			proto.__mg626Xhr = true;
		}

		win[k] = {
			installed: true,
			clear: () => { entries.length = 0; },
			snapshot: () => entries.map(e => JSON.parse(JSON.stringify(e))),
			probe: () => ({
				fetchIsWrapped: Boolean((win.fetch as any)?.__mg626Wrapped),
				fetchSrc: String(win.fetch).slice(0, 120),
				hasCapacitor: Boolean(win.Capacitor),
				capPlugins: win.Capacitor?.Plugins ? Object.keys(win.Capacitor.Plugins).slice(0, 40) : [],
				href: location.href,
				entries: entries.length
			})
		};
		return 'installed';
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}, storageKey);
}

async function toWebView(driver: AppiumDriver): Promise<string | null> {
	const ctxs = (await driver.getContexts().catch(() => [])) as string[];
	const wv = ctxs.find(x => String(x).startsWith('WEBVIEW'));
	if (wv) await driver.switchContext(wv);
	return wv ?? null;
}

async function probe(driver: AppiumDriver): Promise<unknown> {
	return driver.execute((k: string) => (window as never as Record<string, { probe?: () => unknown }>)[k]?.probe?.() ?? 'no-capture', KEY).catch((e: unknown) => `probe-err:${e instanceof Error ? e.message : String(e)}`);
}

async function snapshot(driver: AppiumDriver): Promise<Entry[]> {
	return (await driver.execute((k: string) => (window as never as Record<string, { snapshot?: () => unknown[] }>)[k]?.snapshot?.() ?? [], KEY).catch(() => [])) as Entry[];
}

async function run(): Promise<void> {
	mkdirSync('evidence/mg626', { recursive: true });
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'business' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		log('shell en modo Business');

		await wallet.openWallet();
		if (await wallet.hasCard(LAST4, 5_000).catch(() => false)) {
			log(`…${LAST4} ya vinculada → borro para forzar el POST`);
			await wallet.deleteCard(LAST4).catch((e: unknown) => log(`delete err: ${e instanceof Error ? e.message : String(e)}`));
		}

		await toWebView(driver);
		log(`install → ${String(await installHardened(driver, KEY))}`);
		log(`probe pre-form: ${JSON.stringify(await probe(driver))}`);

		await wallet.tapAddCard();
		await wallet.fillCardForm(card);
		log(`GUARDAR habilitado = ${await wallet.isSaveEnabled()}`);

		// Re-asegurar el interceptor justo antes del submit (el POM cambia de contexto).
		await toWebView(driver);
		log(`probe pre-save: ${JSON.stringify(await probe(driver))}`);

		await wallet.saveCard().catch((e: unknown) => log(`saveCard err: ${e instanceof Error ? e.message : String(e)}`));

		// Muestreo repetido: el POST puede resolver después del dismiss del modal.
		let entries: Entry[] = [];
		for (let i = 0; i < 12; i++) {
			await driver.pause(1_500);
			await toWebView(driver);
			entries = await snapshot(driver);
			const post = entries.find(e => e.method?.toUpperCase() === 'POST' && /cards/i.test(e.url ?? ''));
			log(`muestreo ${i + 1}/12 → entries=${entries.length}${post ? ' · POST /cards CAPTURADO' : ''}`);
			if (post) break;
		}

		log(`probe post-save: ${JSON.stringify(await probe(driver))}`);
		const outPath = 'evidence/mg626/payload-v2-capture.json';
		writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf-8');
		log(`capture completo → ${outPath} (${entries.length} entries)`);

		for (const e of entries) {
			log(`--- [${e.kind}] ${e.method} ${e.url} → ${e.status ?? e.error ?? '?'}`);
			if (e.reqBody) log(`    reqBody: ${e.reqBody.slice(0, 1200)}`);
			if (/cards/i.test(e.url ?? '') && e.resBody) log(`    resBody: ${e.resBody.slice(0, 800)}`);
		}

		log(`hasCard(${LAST4}) final = ${await wallet.hasCard(LAST4, 12_000).catch(() => false)}`);
		await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot('evidence/mg626/07-v2-wallet-after-add.png').catch(() => {});
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[mg626-v2] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
