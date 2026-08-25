/**
 * INSPECTOR del CTA "Seleccionar Vehículo" (v2.5.17). Llega a O+D-done, vuelca los detalles del
 * elemento CTA (tag/clase/attrs/disabled/pointer-events/outerHTML + ancestro clickable), lo clickea
 * (WdIO nativo) y hace POLLING de la URL/pantalla 6s para cazar navegación transitoria (rebote).
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[cta] ${m}`);

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const trip = new PassengerNewTripScreen(getPassengerAppConfig(), driver);
		await trip.openNewTrip();
		await trip.setOrigin(process.env.E2E_ORIGIN ?? TEST_DATA.origin);
		await trip.setDestination(process.env.E2E_DESTINATION ?? TEST_DATA.destination);
		log('O+D done, inspeccionando CTA…');

		// Detalles del elemento CTA.
		const info = await driver.execute(() => {
			const norm = (v: unknown) =>
				String(v ?? '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase();
			const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
			// El nodo hoja que contiene el texto del CTA.
			const leaf = all.find(
				e =>
					norm(e.textContent).includes('seleccionar veh') &&
					!Array.from(e.children).some(c => norm((c as HTMLElement).textContent).includes('seleccionar veh'))
			);
			if (!leaf) return { found: false };
			// Ancestro clickable (button/ion-button/[click]/.btn) o el propio leaf.
			let clickable: HTMLElement = leaf;
			for (let n = 0, cur: HTMLElement | null = leaf; n < 5 && cur; n++, cur = cur.parentElement) {
				const t = cur.tagName.toLowerCase();
				if (
					t === 'button' ||
					t === 'ion-button' ||
					cur.getAttribute('role') === 'button' ||
					(cur.className || '').toString().includes('btn')
				) {
					clickable = cur;
					break;
				}
			}
			const cs = getComputedStyle(clickable);
			const attrs: Record<string, string> = {};
			for (const a of Array.from(clickable.attributes)) attrs[a.name] = a.value.slice(0, 60);
			return {
				found: true,
				leafTag: leaf.tagName.toLowerCase(),
				leafCls: (leaf.className || '').toString().slice(0, 80),
				clickTag: clickable.tagName.toLowerCase(),
				clickCls: (clickable.className || '').toString().slice(0, 100),
				attrs,
				disabled: (clickable as HTMLButtonElement).disabled ?? null,
				ariaDisabled: clickable.getAttribute('aria-disabled'),
				pointerEvents: cs.pointerEvents,
				opacity: cs.opacity,
				outerHTML: (clickable.outerHTML || '').replace(/\s+/g, ' ').slice(0, 300)
			};
		});
		log(`CTA element: ${JSON.stringify(info)}`);

		// Click nativo del CTA real: ion-col.travel-btn-confirm.
		let clicked = 'no';
		const cta = await driver.$('ion-col.travel-btn-confirm');
		if (await cta.isDisplayed().catch(() => false)) {
			await cta.click().catch(() => undefined);
			clicked = 'yes';
		}
		log(`click: ${clicked}, polling URL 6s…`);

		// Poll de navegación.
		let last = '';
		for (let i = 0; i < 12; i++) {
			const state = await driver.execute(() => ({
				url: location.href,
				page: (document.querySelector('ion-router-outlet > *:last-child, ion-modal') || {}).tagName || '',
				has: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 60)
			}));
			const s = JSON.stringify(state);
			if (s !== last) {
				log(`t+${i * 500}ms: ${s}`);
				last = s;
			}
			await driver.pause(500);
		}
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[cta] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
