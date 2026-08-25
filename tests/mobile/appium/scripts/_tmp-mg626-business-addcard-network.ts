/**
 * TEMPORAL (MG-626) — captura del PAYLOAD del alta de tarjeta eBiz en modo Compañía.
 *
 * El fix de MG-626 vive en el FE: estando en modo compañía, la app pax debe mandar en el campo
 * RAÍZ `placeId` la primera dirección de PASSENGER_ADDRESSES del perfil individuo vinculado
 * (el colaborador corporativo no tiene direcciones propias → antes fallaba con
 * PASSENGER_ADDRESS_NOT_FOUND). La única prueba directa del fix es el request.
 *
 * Qué hace:
 *   1. Entra en modo Business (Compañía) y abre el wallet.
 *   2. Si la tarjeta objetivo ya está vinculada, la borra (si no, el POST no se dispara).
 *   3. Instala el interceptor fetch/XHR del webview.
 *   4. Alta de tarjeta con el POM (mismos pasos que el spec).
 *   5. Vuelca el tráfico capturado (payload + response) y saca screenshots.
 *   6. Con MG626_LEAVE_CLEAN=1 borra la tarjeta al final, para que el spec formal
 *      ejecute después un alta REAL ('added') y no un 'already-present'.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J ENV=test \
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/_tmp-mg626-business-addcard-network.ts
 */

import { mkdirSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { dumpAppiumState } from '../helpers/appiumDebug';
import {
	clearWebViewNetworkCapture,
	dumpWebViewNetworkCapture,
	installWebViewNetworkCapture,
	readWebViewNetworkCapture
} from '../helpers/webViewNetworkCapture';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';

const log = (m: string): void => console.log(`[mg626-net] ${m}`);

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
const LEAVE_CLEAN = process.env.MG626_LEAVE_CLEAN === '1';

function snapDir(): string {
	mkdirSync('evidence/mg626', { recursive: true });
	return 'evidence/mg626';
}

async function snap(driver: unknown, name: string): Promise<void> {
	try {
		await (driver as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(
			`${snapDir()}/${name}.png`
		);
		log(`screenshot → evidence/mg626/${name}.png`);
	} catch (e) {
		log(`screenshot ${name} err: ${e instanceof Error ? e.message : String(e)}`);
	}
}

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'business' });
	try {
		await harness.ensurePassengerShell();
		log('shell listo en modo Business (Compañía)');
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		await snap(driver, '01-home-business');

		await wallet.openWallet();
		const countBefore = await wallet.countCards().catch(() => -1);
		const hasBefore = await wallet.hasCard(LAST4, 5_000).catch(() => false);
		log(`wallet BUSINESS: count=${countBefore} · hasCard(${LAST4})=${hasBefore}`);
		await snap(driver, '02-wallet-business-before');

		if (hasBefore) {
			log(`la tarjeta …${LAST4} ya está vinculada → la borro para que el POST de alta se dispare`);
			await wallet
				.deleteCard(LAST4)
				.catch((e: unknown) => log(`delete err: ${e instanceof Error ? e.message : String(e)}`));
			log(
				`tras borrar: count=${await wallet.countCards().catch(() => -1)} · hasCard=${await wallet.hasCard(LAST4, 4_000).catch(() => false)}`
			);
			await snap(driver, '03-wallet-business-after-delete');
		}

		// Interceptor de red ANTES de abrir el form.
		await installWebViewNetworkCapture(driver);
		await clearWebViewNetworkCapture(driver);
		log('interceptor fetch/XHR instalado');

		await wallet.tapAddCard();
		await snap(driver, '04-form-card-empty');
		await wallet.fillCardForm(card);
		const validity = await wallet.readFormValidity();
		log(`FormGroup: valid=${validity.formValid} · invalidos=${JSON.stringify(validity.invalidControls)}`);
		log(`GUARDAR habilitado = ${await wallet.isSaveEnabled()}`);
		await snap(driver, '05-form-card-filled');

		await wallet
			.saveCard()
			.catch((e: unknown) => log(`saveCard err: ${e instanceof Error ? e.message : String(e)}`));
		await driver.pause(6_000); // dejar que el POST de alta cierre

		const jsonPath = await dumpWebViewNetworkCapture(driver, 'mg626-business-addcard');
		log(`network capture → ${jsonPath}`);

		// Resumen inline de los requests de alta de tarjeta (lo que importa para el veredicto).
		const capture = await readWebViewNetworkCapture(driver);
		const cardReqs = capture.entries.filter(
			e =>
				/\/cards(\?|$)|passengers\/\d+\/cards/i.test(e.url) ||
				(/card/i.test(e.url) && e.method.toUpperCase() === 'POST')
		);
		log(`requests capturados: ${capture.entries.length} · candidatos de alta: ${cardReqs.length}`);
		for (const e of cardReqs) {
			log(`--- ${e.method} ${e.url} → ${e.status}`);
			log(`    requestBody: ${e.requestBody ?? '<empty>'}`);
			log(`    responseBody: ${(e.responseBody ?? '<empty>').slice(0, 900)}`);
		}

		const hasAfter = await wallet.hasCard(LAST4, 12_000).catch(() => false);
		const countAfter = await wallet.countCards().catch(() => -1);
		log(`RESULTADO alta business: hasCard(${LAST4})=${hasAfter} · count ${countBefore}→${countAfter}`);
		await snap(driver, '06-wallet-business-after-add');
		await dumpAppiumState(driver, 'mg626-business-after-add').catch(() => null);

		if (LEAVE_CLEAN && hasAfter) {
			log('MG626_LEAVE_CLEAN=1 → borro la tarjeta para que el spec formal haga un alta real');
			await wallet
				.deleteCard(LAST4)
				.catch((e: unknown) => log(`cleanup delete err: ${e instanceof Error ? e.message : String(e)}`));
			log(
				`estado final: count=${await wallet.countCards().catch(() => -1)} · hasCard=${await wallet.hasCard(LAST4, 4_000).catch(() => false)}`
			);
		}
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[mg626-net] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
