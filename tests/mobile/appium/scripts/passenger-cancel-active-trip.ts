/**
 * Cancela el viaje activo del pax (pantalla SEARCHING_DRIVER: "Buscando servicio..." + "Cancelar
 * Viaje"). Sesión BARE (no exige home, porque con viaje activo el pax NO está en home). Tapea
 * "Cancelar Viaje" (click nativo Ionic), vuelca el modal de confirmación y lo confirma.
 * Libera el hold (HOLD→RELEASE).
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-cancel-active-trip.ts
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';
import { getPassengerAppConfig } from '../config/appiumRuntime';

const log = (m: string): void => console.log(`[cancel] ${m}`);

class Bare extends AppiumSessionBase {
	async web(): Promise<void> {
		await this.switchToWebView();
	}
	async tapText(text: string, exact = false): Promise<boolean> {
		const driver = this.getDriver();
		const target = text.toLowerCase();
		for (const b of await driver.$$('button, ion-button, .btn, [role="button"], ion-col, a')) {
			if (!(await b.isDisplayed().catch(() => false))) continue;
			const label = (await b.getText().catch(() => '')).trim().toLowerCase();
			if (exact ? label === target : label.includes(target)) {
				await b.click().catch(() => undefined);
				return true;
			}
		}
		return false;
	}
	async dumpButtons(): Promise<unknown> {
		return this.getDriver().execute(() => {
			const isVisible = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const btns = (
				Array.from(
					document.querySelectorAll('button, ion-button, .btn, [role="button"], ion-col, a')
				) as HTMLElement[]
			)
				.filter(isVisible)
				.map(e => ({
					tag: e.tagName.toLowerCase(),
					cls: (e.className || '').toString().slice(0, 45),
					text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
				}))
				.filter(b => b.text)
				.slice(0, 20);
			return {
				url: location.href,
				bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
				btns
			};
		});
	}
}

async function run(): Promise<void> {
	const s = new Bare(getPassengerAppConfig());
	await s.startSession();
	try {
		await s.web();
		const before = await s.dumpButtons();
		log(`ANTES:\n${JSON.stringify(before, null, 2)}`);

		const tapped = await s.tapText('cancelar viaje');
		log(`tap "Cancelar Viaje": ${tapped ? 'yes' : 'no'}`);
		if (!tapped) {
			log('no hay viaje activo');
			return;
		}
		await s.getDriver().pause(2500);

		const modal = await s.dumpButtons();
		log(`MODAL CONFIRMACIÓN:\n${JSON.stringify(modal, null, 2)}`);

		// Confirmar la cancelación: botón "Si" (exacto, para no matchear otras palabras con "si").
		const confirmed = await s.tapText('si', true);
		log(`confirmar "Si": ${confirmed ? 'yes' : 'no'}`);
		await s.getDriver().pause(3000);

		const after = await s.dumpButtons();
		log(`DESPUÉS (¿volvió a home?):\n${JSON.stringify(after, null, 2)}`);
	} finally {
		await s.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[cancel] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
