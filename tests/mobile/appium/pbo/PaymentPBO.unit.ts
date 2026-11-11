// Unit de PaymentPBO con screens fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/PaymentPBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NativeFormState, PaymentOutcome } from '../screens/driver/payment/PaymentTypes';
import {
	ChargeButtonDisabledError,
	PaymentPBO,
	describeDisabledButton,
	parseExpiry,
	type PaymentPboDeps
} from './PaymentPBO';

const CARD = { number: '4000 0000 0000 9995', expiry: '12/34', cvc: '123', holderName: 'TEST DRIVER', postal: '90210' };

const emptyState = (over: Partial<NativeFormState> = {}): NativeFormState => ({
	form: 'ng-invalid',
	fields: {
		cardNumber: { found: true, value: '4000', invalid: false },
		cardExpirationDate: { found: false, value: '', invalid: false },
		securityCode: { found: true, value: '', invalid: true }
	},
	chargeValidVisible: false,
	chargeInvalidVisible: true,
	submit: { found: true, disabled: true, text: 'COBRAR' },
	...over
});

type Calls = string[];

function build(
	opts: {
		native?: boolean;
		expiryDigits?: number[];
		submitStates?: Array<{ found: boolean; disabled: boolean }>;
		outcomes?: Array<PaymentOutcome | null>;
		numberOk?: boolean;
		hasPostal?: boolean;
		challengeByText?: boolean[];
	} = {}
) {
	const calls: Calls = [];
	const logs: string[] = [];
	const digits = [...(opts.expiryDigits ?? [4])];
	const submitStates = [...(opts.submitStates ?? [{ found: true, disabled: false }])];
	const outcomes = [...(opts.outcomes ?? [])];
	const byText = [...(opts.challengeByText ?? [true])];
	const deps: PaymentPboDeps = {
		modal: {
			waitUntilShown: async () => 'ready',
			alignToTopFrame: async () => void calls.push('align'),
			exposesNativeForm: async () => opts.native ?? true
		},
		native: {
			fillNumber: async v => (calls.push(`n:number:${v}`), opts.numberOk ?? true),
			fillExpiry: async v => (calls.push(`n:expiry:${v}`), true),
			fillCvc: async v => (calls.push(`n:cvc:${v}`), true),
			fillHolder: async v => (calls.push(`n:holder:${v}`), true),
			fillPostal: async v => (calls.push(`n:postal:${v}`), true),
			hasPostalField: async () => opts.hasPostal ?? true,
			waitForExpiryMounted: async () => true,
			expiryDigitCount: async () => digits.shift() ?? 4,
			readFormState: async () => emptyState()
		},
		stripe: {
			typeInField: async (f, v) => (calls.push(`s:${f}:${v}`), opts.numberOk ?? true),
			fillHolderAndPostal: async (h, p) => (calls.push(`s:holder:${h}:${p}`), true)
		},
		submit: {
			readState: async () => (submitStates.length > 1 ? submitStates.shift()! : submitStates[0]),
			tap: async () => (calls.push('tap'), true)
		},
		result: {
			readVisibleOutcome: async () => (outcomes.length ? outcomes.shift()! : null),
			dismiss: async () => true
		},
		challenge: {
			tryCompleteById: async a => (calls.push(`3ds:id:${a}`), true),
			tryCompleteByText: async () => byText.shift() ?? false
		}
	};
	const pbo = new PaymentPBO(deps, {
		log: m => logs.push(m),
		warn: m => logs.push(`WARN ${m}`),
		settle: async () => undefined,
		nativeDetectTimeoutMs: 60
	});
	return { pbo, calls, logs };
}

test('parseExpiry: variantes y fail-fast', () => {
	assert.deepEqual(parseExpiry('1/2034'), { combined: '01/34', compact: '0134' });
	assert.deepEqual(parseExpiry(' 12 / 34 '), { combined: '12/34', compact: '1234' });
	assert.throws(() => parseExpiry('1234'), /Invalid card expiry/);
});

test('fillCard: rama nativa por presencia del campo; orden número -> vencimiento -> cvc -> titular -> postal', async () => {
	const { pbo, calls } = build({ native: true });
	assert.equal(await pbo.fillCard(CARD), 'native');
	assert.deepEqual(calls, [
		'align',
		'n:number:4000000000009995',
		'n:expiry:12/34',
		'n:cvc:123',
		'n:holder:TEST DRIVER',
		'n:postal:90210'
	]);
});

test('fillCard nativo: reintenta vencimiento compacto sólo si el readback quedó < 4 dígitos', async () => {
	const { pbo, calls, logs } = build({ expiryDigits: [0] });
	await pbo.fillCard(CARD);
	assert.deepEqual(
		calls.filter(c => c.startsWith('n:expiry')),
		['n:expiry:12/34', 'n:expiry:1234']
	);
	assert.ok(logs.some(l => l.startsWith('WARN') && l.includes('compacto')));
});

test('fillCard nativo: sin campo postal no se llena; sin número lanza CardNumberFillError', async () => {
	const a = build({ hasPostal: false });
	await a.pbo.fillCard(CARD);
	assert.ok(!a.calls.some(c => c.startsWith('n:postal')));
	const b = build({ numberOk: false });
	await assert.rejects(() => b.pbo.fillCard(CARD), /No se pudo llenar #cardNumber/);
});

test('fillCard: rama Stripe cuando no hay form nativo; defaults de titular/postal sólo acá', async () => {
	const { pbo, calls } = build({ native: false });
	assert.equal(await pbo.fillCard({ number: '4242424242424242', expiry: '01/30', cvc: '999' }), 'stripe');
	assert.deepEqual(calls.slice(1, 4), ['s:number:4242424242424242', 's:expiry:0130', 's:cvc:999']);
	assert.match(calls[4], /^s:holder:.+:1234567$/);
});

test('submit: espera a que COBRAR se habilite y lo tapea', async () => {
	const { pbo, calls } = build({
		submitStates: [
			{ found: true, disabled: true },
			{ found: true, disabled: false }
		]
	});
	await pbo.submit(5_000);
	assert.deepEqual(calls, ['tap']);
});

test('submit: COBRAR deshabilitado lanza ChargeButtonDisabledError con la radiografía', async () => {
	const { pbo, calls } = build({ submitStates: [{ found: true, disabled: true }] });
	await assert.rejects(
		() => pbo.submit(120),
		(e: unknown) =>
			e instanceof ChargeButtonDisabledError &&
			/COBRAR quedó deshabilitado en 120ms/.test(e.message) &&
			/securityCode\(value="",ng-invalid\)/.test(e.message) &&
			/campos NO montados: cardExpirationDate/.test(e.message)
	);
	assert.ok(!calls.includes('tap'));
});

test('describeDisabledButton: sin culpables ni faltantes', () => {
	const msg = describeDisabledButton(1, emptyState({ fields: {} }));
	assert.match(msg, /campos inválidos\/vacíos: ninguno/);
	assert.match(msg, /campos NO montados: ninguno/);
});

test('waitForOutcome: devuelve declined/trip-lost y asume success sin modal', async () => {
	const lost: PaymentOutcome = { status: 'trip-lost', reason: 'viaje perdido' };
	assert.deepEqual(await build({ outcomes: [null, lost] }).pbo.waitForOutcome(2_000), lost);
	assert.deepEqual(await build().pbo.waitForOutcome(50), { status: 'success' });
});

test('chargeWithCard: resultado tipado con rama, last4 y outcome', async () => {
	const declined: PaymentOutcome = { status: 'declined', reason: 'tarjeta rechazada' };
	const { pbo } = build({ outcomes: [declined] });
	assert.deepEqual(await pbo.chargeWithCard(CARD), {
		method: 'card',
		last4: '9995',
		branch: 'native',
		outcome: declined
	});
});

test('handle3DS: true si el botón aparece (tras reintentos); false + warn si no', async () => {
	assert.equal(await build({ challengeByText: [false, true] }).pbo.handle3DS('complete', 3_000), true);
	const none = build({ challengeByText: [] });
	assert.equal(await none.pbo.handle3DS('fail', 50), false);
	assert.ok(none.logs.some(l => l.startsWith('WARN') && l.includes('3DS fail')));
});

test('tryComplete3DS delega en el challenge por id', async () => {
	const { pbo, calls } = build();
	assert.equal(await pbo.tryComplete3DS('fail'), true);
	assert.deepEqual(calls, ['3ds:id:fail']);
});
