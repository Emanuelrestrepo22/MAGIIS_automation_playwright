// Unit de SignaturePBO con pad fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/SignaturePBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignatureInkMissingError, SignaturePBO } from './SignaturePBO';

function build(ink: boolean, failOn?: 'confirm') {
	const calls: string[] = [];
	const pbo = new SignaturePBO(
		{
			pad: {
				waitUntilShown: async () => void calls.push('shown'),
				sign: async () => (calls.push('sign'), [{ x: 1, y: 2 }]),
				hasInk: async () => (calls.push('ink'), ink),
				confirm: async () => {
					calls.push('confirm');
					if (failOn === 'confirm') throw new Error('Confirm deshabilitado');
				},
				clear: async () => void calls.push('clear'),
				waitUntilClosed: async () => void calls.push('closed')
			}
		},
		{ log: () => undefined }
	);
	return { pbo, calls };
}

test('signAndConfirm: orden esperar -> firmar -> tinta -> confirmar -> cerrado', async () => {
	const { pbo, calls } = build(true);
	const res = await pbo.signAndConfirm();
	assert.deepEqual(calls, ['shown', 'sign', 'ink', 'confirm', 'closed']);
	assert.equal(res.signed, true);
	assert.deepEqual(res.points, [{ x: 1, y: 2 }]);
});

test('signAndConfirm: sin tinta limpia y lanza sin confirmar', async () => {
	const { pbo, calls } = build(false);
	await assert.rejects(() => pbo.signAndConfirm(), SignatureInkMissingError);
	assert.deepEqual(calls, ['shown', 'sign', 'ink', 'clear']);
});

test('signAndConfirm: propaga el error de confirm y no espera cierre', async () => {
	const { pbo, calls } = build(true, 'confirm');
	await assert.rejects(() => pbo.signAndConfirm(), /Confirm deshabilitado/);
	assert.ok(!calls.includes('closed'));
});
