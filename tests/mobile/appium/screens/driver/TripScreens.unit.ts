// Unit de TripConfirm/TripToStart/TripInProgress con driver fake (sin Appium). Run: npx tsx --test tests/mobile/appium/screens/driver/TripScreens.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser } from 'webdriverio';
import type { MobileActorConfig } from '../../config/appiumRuntime';
import { I18n, type I18nDictionaries } from '../../core/I18n';
import { MobileSession } from '../../core/MobileSession';
import {
	TRIP_CONFIRM_LOCATORS,
	TripConfirmScreen,
	isConfirmUrl,
	parseTravelIdFromUrl
} from './TripConfirmScreen';
import { TRIP_IN_PROGRESS_LOCATORS, TripInProgressScreen, deriveInProgressShown, isInProgressUrl } from './TripInProgressScreen';
import { TRIP_TO_START_LOCATORS, TripToStartScreen, isToStartUrl } from './TripToStartScreen';

const CONFIG = { actor: 'driver' } as unknown as MobileActorConfig;

type FakeEl = { displayed: boolean; text?: string; clicks: number };
type Dom = { url: string; css: Record<string, FakeEl>; buttons: FakeEl[] };

function el(displayed: boolean, text = ''): FakeEl {
	return { displayed, text, clicks: 0 };
}

function wrap(e: FakeEl | undefined) {
	return {
		isDisplayed: async () => e?.displayed ?? false,
		click: async () => {
			if (e) e.clicks++;
		},
		getText: async () => e?.text ?? ''
	};
}

function sessionFor(dom: Dom): MobileSession {
	const driver = {
		getContext: async () => 'WEBVIEW_com.example',
		execute: async () => dom.url,
		$: (sel: string) => wrap(dom.css[sel]),
		$$: async () => dom.buttons.map(b => wrap(b))
	} as unknown as Browser;
	return new MobileSession(CONFIG, { driver, log: () => undefined });
}

const DICTS: I18nDictionaries = {
	es: { 'driver.buttons.accept': ['Aceptar'], 'driver.travelToStart.startTrip': ['Empezar Viaje'], 'driver.buttons.confirmYes': ['Si', 'Sí'], 'driver.travelInProgress.endTrip': ['Finalizar Viaje'] },
	fr: { 'driver.buttons.accept': ['TODO-verificar'], 'driver.travelToStart.startTrip': ['TODO-verificar'], 'driver.buttons.confirmYes': ['TODO-verificar'], 'driver.travelInProgress.endTrip': ['TODO-verificar'] }
};

test('funciones puras: travelId, URLs y estado de in-progress', () => {
	assert.equal(parseTravelIdFromUrl('/navigator/TravelConfirmPage;data={"travelId":61545,"x":1}'), '61545');
	assert.equal(parseTravelIdFromUrl('/navigator/home'), null);
	assert.equal(isConfirmUrl('/navigator/TravelConfirmPage;data=1'), true);
	assert.equal(isToStartUrl('/navigator/TravelToStartPage;showMapOnlyOnce=null'), true);
	assert.equal(isInProgressUrl('/navigator/TravelInProgressPage'), true);
	assert.equal(isInProgressUrl('/x/travelnavigation'), true);
	assert.equal(isInProgressUrl('/navigator/home'), false);
	assert.equal(deriveInProgressShown({ url: '/home', pageVisible: true, endVisible: true }), true);
	assert.equal(deriveInProgressShown({ url: '/home', pageVisible: true, endVisible: false }), false);
});

test('locators: sin xpath ni texto crudo; clave i18n declarada para botones', () => {
	const all = [
		...Object.values(TRIP_CONFIRM_LOCATORS),
		...Object.values(TRIP_TO_START_LOCATORS),
		...Object.values(TRIP_IN_PROGRESS_LOCATORS)
	];
	for (const l of all) {
		assert.equal(l.native, undefined, l.id);
		assert.ok(!JSON.stringify(l).includes('@text'), l.id);
	}
	assert.equal(TRIP_CONFIRM_LOCATORS.acceptButton.textKey, 'driver.buttons.accept');
});

test('TripConfirmScreen: estado observable y acceptOffer por clase', async () => {
	const accept = el(true);
	const dom: Dom = {
		url: '/navigator/TravelConfirmPage;data={"travelId":777}',
		css: { 'app-page-travel-confirm button.btn.primary': accept, 'app-page-travel-confirm': el(true) },
		buttons: []
	};
	const screen = new TripConfirmScreen(sessionFor(dom), 'es', new I18n('es', DICTS));
	assert.deepEqual(await screen.readState(), { shown: true, acceptVisible: true, travelId: '777' });
	await screen.acceptOffer(200);
	assert.equal(accept.clicks, 1);
});

test('TripConfirmScreen: fallback por texto i18n en es; en fr pendiente NO inventa y falla por timeout', async () => {
	const btn = el(true, ' Aceptar ');
	const dom: Dom = { url: '/x', css: {}, buttons: [btn] };
	await new TripConfirmScreen(sessionFor(dom), 'es', new I18n('es', DICTS)).acceptOffer(200);
	assert.equal(btn.clicks, 1);

	const frBtn = el(true, 'Accepter');
	const frDom: Dom = { url: '/x', css: {}, buttons: [frBtn] };
	const fr = new TripConfirmScreen(sessionFor(frDom), 'fr', new I18n('fr', DICTS));
	await assert.rejects(() => fr.acceptOffer(60), /Timeout/);
	assert.equal(frBtn.clicks, 0);
});

test('TripToStartScreen: start + modal de confirmación', async () => {
	const start = el(true);
	const yes = el(true);
	const dom: Dom = {
		url: '/navigator/TravelToStartPage;showMapOnlyOnce=null',
		css: { 'button.btn.primary.trip-pax-start': start, 'app-confirm-modal': el(false), 'app-confirm-modal button.btn.primary': yes },
		buttons: []
	};
	const screen = new TripToStartScreen(sessionFor(dom), 'es', new I18n('es', DICTS));
	assert.deepEqual(await screen.readState(), { shown: true, startVisible: true, confirmModalVisible: false });
	await screen.tapStartTrip(200);
	assert.equal(start.clicks, 1);
	dom.css['app-confirm-modal']!.displayed = true;
	await screen.waitForConfirmModal(200);
	await screen.confirmStart(200);
	assert.equal(yes.clicks, 1);
});

test('TripInProgressScreen: estado, tapEndTrip y waitUntilLeft', async () => {
	const finish = el(true);
	const dom: Dom = {
		url: '/navigator/home',
		css: { 'app-page-travel-in-progress': el(true), 'app-page-travel-in-progress button.btn.finish': finish },
		buttons: []
	};
	const screen = new TripInProgressScreen(sessionFor(dom), 'es', new I18n('es', DICTS));
	assert.deepEqual(await screen.readState(), { shown: true, endVisible: true, confirmModalVisible: false });
	await screen.tapEndTrip(200);
	assert.equal(finish.clicks, 1);
	dom.css['app-page-travel-in-progress']!.displayed = false;
	finish.displayed = false;
	await screen.waitUntilLeft(200);
	assert.equal(await screen.isShown(), false);
});
