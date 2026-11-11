// Unit de TripResumeScreen / ConfirmModal / SignaturePadScreen con driver fake (sin Appium).
// Run: npx tsx --test tests/mobile/appium/screens/driver/driverScreens.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser } from 'webdriverio';
import type { MobileActorConfig } from '../../config/appiumRuntime';
import { I18n } from '../../core/I18n';
import { MobileSession } from '../../core/MobileSession';
import { ConfirmModal } from './ConfirmModal';
import { SignaturePadScreen, strokePoints } from './SignaturePadScreen';
import { TripResumeScreen, describePaymentButtons, looksLikeMoney } from './TripResumeScreen';

const CONFIG = {
	actor: 'driver',
	environment: 'test',
	appiumServerUrl: 'http://127.0.0.1:4723',
	appiumBasePath: '/',
	appPath: null,
	appPackage: 'com.example.driver',
	appActivity: '.MainActivity',
	deviceName: 'emulator-5554',
	platformVersion: '14',
	udid: 'emulator-5554',
	newCommandTimeout: 60,
	noReset: true,
	fullReset: false,
	chromedriverAutodownload: false,
	chromedriverExecutable: null
} as MobileActorConfig;

type Call = { args: unknown[] };

/** Driver fake: `execute` responde con `handler(args, n)` y registra las llamadas. */
function fake(handler: (args: unknown[], n: number) => unknown, extra: Record<string, unknown> = {}) {
	const calls: Call[] = [];
	const driver = {
		getContext: async () => 'WEBVIEW_com.example',
		execute: async (_fn: unknown, ...args: unknown[]) => {
			calls.push({ args });
			return handler(args, calls.length - 1);
		},
		...extra
	} as unknown as Browser;
	return { session: new MobileSession(CONFIG, { driver, log: () => undefined }), calls };
}

const I18N = new I18n('es', {
	es: {
		'driver.buttons.confirmYes': ['Si', 'Sí'],
		'driver.travelResume.closeTrip': ['Cerrar Viaje', 'Finalizar Viaje'],
		'driver.travelResume.signAndCloseTrip': ['Firmar y Cerrar viaje']
	}
});

test('looksLikeMoney acepta importes con símbolo y rechaza texto/números sueltos', () => {
	assert.equal(looksLikeMoney('$12.50'), true);
	assert.equal(looksLikeMoney('€ 1 234,50'), true);
	assert.equal(looksLikeMoney('12.50'), false);
	assert.equal(looksLikeMoney('Total a Cobrar'), false);
});

test('TripResumeScreen.readTotal parsea el primer span monetario con parseMoneyText', async () => {
	const { session } = fake(() => ['Total a Cobrar', '$1,234.50']);
	const screen = new TripResumeScreen(session, I18N);
	assert.equal(await screen.readTotalText(), '$1,234.50');
	assert.equal(await screen.readTotal(), 1234.5);
});

test('TripResumeScreen.readTotal devuelve null si no hay importe visible', async () => {
	const { session } = fake(() => ['Total a Cobrar']);
	assert.equal(await new TripResumeScreen(session, I18N).readTotal(), null);
});

test('TripResumeScreen.closeRequiresSignature distingue la variante firma vía I18n', async () => {
	const sign = new TripResumeScreen(fake(() => ['Firmar y Cerrar viaje']).session, I18N);
	const plain = new TripResumeScreen(fake(() => ['Cerrar Viaje']).session, I18N);
	assert.equal(await sign.closeRequiresSignature(), true);
	assert.equal(await plain.closeRequiresSignature(), false);
});

test('TripResumeScreen.tapClose toca y devuelve la etiqueta cuando es de cierre', async () => {
	const { session, calls } = fake((_a, n) => (n === 0 ? ['Cerrar Viaje'] : true));
	assert.equal(await new TripResumeScreen(session, I18N).tapClose(), 'Cerrar Viaje');
	assert.equal(calls.length, 2);
});

test('TripResumeScreen.tapClose falla sin tocar si la etiqueta no es de cierre', async () => {
	const { session, calls } = fake(() => ['Cancelar']);
	await assert.rejects(() => new TripResumeScreen(session, I18N).tapClose(), /etiqueta inesperada/);
	assert.equal(calls.length, 1);
});

test('TripResumeScreen.tapClose falla si el botón está deshabilitado', async () => {
	const { session } = fake((_a, n) => (n === 0 ? ['Cerrar Viaje'] : false));
	await assert.rejects(() => new TripResumeScreen(session, I18N).tapClose(), /deshabilitado/);
});

test('TripResumeScreen.tapExtra lanza si no hay extra en la posición', async () => {
	const { session } = fake(() => '');
	await assert.rejects(() => new TripResumeScreen(session, I18N).tapExtra(2), /posición 2/);
});

test('ConfirmModal.tapYes pasa las variantes i18n de «Sí» a la página', async () => {
	const { session, calls } = fake(() => 'Si');
	assert.equal(await new ConfirmModal(session, I18N).tapYes(), 'Si');
	assert.deepEqual(calls[0]!.args[1], ['Si', 'Sí']);
});

test('ConfirmModal.tapYes lanza si no hay botón; tapNo lanza si no hay botón', async () => {
	const { session } = fake(() => '');
	await assert.rejects(() => new ConfirmModal(session, I18N).tapYes(), /«Sí» no encontrado/);
	const { session: s2 } = fake(() => false);
	await assert.rejects(() => new ConfirmModal(s2, I18N).tapNo(), /«No» no encontrado/);
});

test('ConfirmModal.isShown es false si execute falla', async () => {
	const { session } = fake(() => {
		throw new Error('boom');
	});
	assert.equal(await new ConfirmModal(session, I18N).isShown(), false);
});

test('strokePoints escala el trazo al rect del canvas', () => {
	const pts = strokePoints({ x: 100, y: 200, w: 200, h: 100 });
	assert.equal(pts.length, 5);
	assert.deepEqual(pts[0], { x: 140, y: 250 });
	assert.deepEqual(pts[4], { x: 260, y: 260 });
});

test('SignaturePadScreen.sign lanza si el canvas no está visible', async () => {
	const { session } = fake(() => null);
	await assert.rejects(() => new SignaturePadScreen(session).sign(), /canvas de firma no visible/);
});

test('SignaturePadScreen.sign dibuja con touch actions y devuelve los puntos', async () => {
	let performed: unknown[] = [];
	const { session } = fake(() => ({ x: 0, y: 0, w: 100, h: 100 }), {
		performActions: async (a: unknown[]) => {
			performed = a;
		},
		releaseActions: async () => undefined
	});
	const pts = await new SignaturePadScreen(session).sign();
	assert.equal(pts.length, 5);
	assert.equal(performed.length, 1);
});

test('SignaturePadScreen.confirm lanza si el botón no está', async () => {
	const { session } = fake(() => false);
	await assert.rejects(() => new SignaturePadScreen(session).confirm(), /«Confirm»/);
});

test('describePaymentButtons: íconos sin texto se clasifican y el activo se marca (DOM 11/11)', () => {
	assert.deepEqual(
		describePaymentButtons([
			{ className: 'payment active', text: '', html: '<ion-icon name="cash-outline"></ion-icon>' },
			{ className: 'payment', text: '', html: '<ion-icon name="card"></ion-icon>' }
		]),
		['cash (activo)', 'card']
	);
	assert.deepEqual(
		describePaymentButtons([
			{ className: 'payment active', text: '', html: '<i></i>' },
			{ className: 'payment', text: '', html: '<i></i>' }
		]),
		['cash (activo)', 'card']
	);
	assert.deepEqual(describePaymentButtons([{ className: 'payment', text: 'VISA 4242', html: '' }]), ['VISA 4242']);
	assert.deepEqual(describePaymentButtons([]), []);
});
