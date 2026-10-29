/**
 * EXPLORADOR business — "Mis Direcciones" del perfil Compañía (colaborador 9869).
 *
 * El alta de tarjeta eBiz en business falla con PASSENGER_ADDRESS_NOT_FOUND porque el colaborador
 * no tiene dirección guardada (placeId). Este script navega a "Mis Direcciones" en modo Business
 * y vuelca la estructura de la página (¿hay direcciones? ¿hay CTA para agregar? selectores del form).
 * Objetivo: determinar si es DATO (setear dirección → MG-288 pasa) o BUG de producto.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.test.passenger \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-ebiz-business-address.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';

const log = (m: string): void => console.log(`[ebiz-address] ${m}`);

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'business' });
	try {
		await harness.startSession();
		await harness.ensureProfileMode('business');
		log('en modo Business (Compañía)');

		const driver = harness.getDriver();
		const contexts = (await driver.getContexts()) as string[];
		const wv = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (wv) {
			await driver.switchContext(wv);
		}

		// 1) Tap "Mi cuenta" (tab child 4, selector dado por el usuario).
		const tappedAccount = await driver
			.execute(() => {
				const el = document.querySelector('#app-tab-bar > ion-tab-button:nth-child(4)') as HTMLElement | null;
				if (!el) return false;
				el.click();
				return true;
			})
			.catch(() => false);
		log(`tap "Mi cuenta" = ${tappedAccount}`);
		await driver.pause(1_500);

		// 2) Tap "Mis Direcciones".
		const tappedAddr = await driver
			.execute(() => {
				const els = Array.from(
					document.querySelectorAll('a, ion-item, button, ion-label, div, span')
				) as HTMLElement[];
				const t = els.find(
					e => /mis\s+direcciones/i.test((e.textContent || '').trim()) && e.offsetParent !== null
				);
				if (!t) return false;
				t.click();
				return true;
			})
			.catch(() => false);
		log(`tap "Mis Direcciones" = ${tappedAddr}`);
		await driver.pause(2_500);

		// 3) Dump de la página de direcciones.
		const dump = await driver
			.execute(() => {
				const url = location.href;
				const body = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
				const addrItems = Array.from(
					document.querySelectorAll(
						'ion-item, ion-card, [class*="direccion"], [class*="address"], app-addresses *'
					)
				)
					.map(e => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70))
					.filter(Boolean)
					.slice(0, 20);
				const ctas = Array.from(
					document.querySelectorAll(
						'button, ion-button, ion-fab-button, [role="button"], ion-icon[name="add"]'
					)
				)
					.map(e =>
						`${(e.textContent || '').replace(/\s+/g, ' ').trim()}|${e.getAttribute('aria-label') || ''}|${e.getAttribute('name') || ''}`.replace(
							/\|+$/,
							''
						)
					)
					.filter(s => s && s !== '||')
					.slice(0, 20);
				const appTag =
					document
						.querySelector('app-addresses, app-account, ion-router-outlet > *')
						?.tagName?.toLowerCase() ?? '';
				return { url, appTag, addrCount: addrItems.length, addrItems, ctas };
			})
			.catch((e: unknown) => ({ err: e instanceof Error ? e.message : String(e) }));
		log(`MIS DIRECCIONES (business/9869):\n${JSON.stringify(dump, null, 2)}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[ebiz-address] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
