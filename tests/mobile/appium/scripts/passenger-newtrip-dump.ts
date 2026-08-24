/**
 * DUMP RAW del DOM webview de la pantalla ACTUAL del passenger app (v2.5.17).
 * No navega ni depende de selectores viejos: attach (noReset) → switch WEBVIEW → vuelca los
 * elementos interactivos visibles (page component, ion-segment tabs, inputs/searchbars, botones)
 * con lo necesario para construir selectores CSS y re-mapear PassengerNewTripScreen.
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-newtrip-dump.ts
 */

import { writeFileSync } from 'node:fs';
import { AppiumSessionBase } from '../base/AppiumSessionBase';
import { getPassengerAppConfig } from '../config/appiumRuntime';

const log = (m: string): void => console.log(`[newtrip-dump] ${m}`);

class Dumper extends AppiumSessionBase {
	async dump(): Promise<unknown> {
		await this.switchToWebView();
		return this.getDriver().execute(() => {
			const isVisible = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = window.getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const desc = (el: Element): Record<string, unknown> => {
				const h = el as HTMLElement;
				const attrs: Record<string, string> = {};
				for (const a of Array.from(h.attributes)) {
					if (['id', 'name', 'formcontrolname', 'placeholder', 'type', 'value', 'color', 'class', 'aria-label', 'label', 'slot', 'fill', 'role', 'expand'].includes(a.name)) {
						attrs[a.name] = a.value.slice(0, 80);
					}
				}
				return {
					tag: h.tagName.toLowerCase(),
					text: (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
					...attrs
				};
			};
			// Page component (children of the router outlet).
			const pages = Array.from(document.querySelectorAll('ion-router-outlet > *'))
				.map(e => `${e.tagName.toLowerCase()}${(e as HTMLElement).offsetParent === null ? '(hidden)' : ''}`);
			const seg = Array.from(document.querySelectorAll('ion-segment, ion-segment-button')).filter(isVisible).map(desc);
			const inputs = Array.from(document.querySelectorAll('ion-input, input, ion-searchbar, ion-textarea')).filter(isVisible).map(desc);
			const buttons = Array.from(document.querySelectorAll('ion-button, button, [role="button"], ion-fab-button, ion-item[button]')).filter(isVisible).map(desc);
			const items = Array.from(document.querySelectorAll('ion-item, ion-card, ion-list > *')).filter(isVisible).map(desc).slice(0, 30);
			const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
			return { url: location.href, pages, seg, inputs, buttons, items, bodyText };
		});
	}
}

async function run(): Promise<void> {
	const d = new Dumper(getPassengerAppConfig());
	await d.startSession();
	try {
		const dom = await d.dump();
		const out = 'evidence/ebiz/newtrip-dom-v2517.json';
		writeFileSync(out, JSON.stringify(dom, null, 2));
		log(`DOM → ${out}`);
		log(JSON.stringify(dom, null, 2));
	} finally {
		await d.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[newtrip-dump] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
