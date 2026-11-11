// Unit de TripLifecyclePBO con screens fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/TripLifecyclePBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IrreversibleNotConfirmedError, TripLifecyclePBO } from './TripLifecyclePBO';

function build(opts: { signature?: boolean; modalAfterClose?: boolean; signFails?: boolean } = {}) {
	const calls: string[] = [];
	const rec = (name: string) => async () => void calls.push(name);
	const pbo = new TripLifecyclePBO(
		{
			confirm: {
				waitUntilShown: rec('confirm.shown'),
				readTravelId: async () => '61545',
				acceptOffer: rec('confirm.accept'),
				waitUntilLeft: rec('confirm.left')
			},
			toStart: {
				waitUntilShown: rec('start.shown'),
				tapStartTrip: rec('start.tap'),
				waitForConfirmModal: rec('start.modal'),
				confirmStart: rec('start.yes'),
				waitUntilLeft: rec('start.left')
			},
			inProgress: {
				waitUntilShown: rec('end.shown'),
				tapEndTrip: rec('end.tap'),
				waitForConfirmModal: rec('end.modal'),
				confirmEnd: rec('end.yes'),
				waitUntilLeft: rec('end.left')
			},
			resume: {
				waitUntilShown: rec('resume.shown'),
				readTotal: async () => 12.5,
				readTotalText: async () => '$12.50',
				readPaymentMethod: async () => 'VISA 4242',
				closeRequiresSignature: async () => opts.signature ?? false,
				tapClose: async () => (calls.push('resume.close'), opts.signature ? 'Firmar y Cerrar viaje' : 'Cerrar Viaje')
			},
			modal: {
				isShown: async () => opts.modalAfterClose ?? false,
				confirm: async () => (calls.push('modal.confirm'), 'Sí'),
				waitUntilClosed: rec('modal.closed')
			},
			signature: {
				signAndConfirm: async () => {
					calls.push('signature');
					if (opts.signFails) throw new Error('sin tinta');
					return { signed: true, points: [] };
				}
			}
		},
		{ log: () => undefined, closeModalDetectMs: 5 }
	);
	return { pbo, calls };
}

test('acceptAssignedTrip: espera, lee travelId, acepta y espera a que se vaya', async () => {
	const { pbo, calls } = build();
	assert.deepEqual(await pbo.acceptAssignedTrip(), { travelId: '61545' });
	assert.deepEqual(calls, ['confirm.shown', 'confirm.accept', 'confirm.left']);
});

test('startTrip: tap -> modal -> Sí -> pantalla se va', async () => {
	const { pbo, calls } = build();
	await pbo.startTrip();
	assert.deepEqual(calls, ['start.shown', 'start.tap', 'start.modal', 'start.yes', 'start.left']);
});

test('finishTrip: exige confirmed y no toca nada sin él', async () => {
	const { pbo, calls } = build();
	await assert.rejects(() => pbo.finishTrip({ confirmed: false }), IrreversibleNotConfirmedError);
	assert.deepEqual(calls, []);
});

test('finishTrip: finaliza y devuelve total + medio de pago del resumen', async () => {
	const { pbo, calls } = build();
	const summary = await pbo.finishTrip({ confirmed: true });
	assert.deepEqual(calls, ['end.shown', 'end.tap', 'end.modal', 'end.yes', 'end.left', 'resume.shown']);
	assert.deepEqual(summary, { total: 12.5, totalText: '$12.50', paymentMethod: 'VISA 4242' });
});

test('closeTrip sin firma: no firma y devuelve resultado tipado', async () => {
	const { pbo, calls } = build({ signature: false });
	const res = await pbo.closeTrip({ confirmed: true });
	assert.ok(!calls.includes('signature'));
	assert.deepEqual(res, { closedTotal: 12.5, paymentMethod: 'VISA 4242', signed: false, closeLabel: 'Cerrar Viaje' });
});

test('closeTrip con firma: tapClose antes de firmar', async () => {
	const { pbo, calls } = build({ signature: true });
	const res = await pbo.closeTrip({ confirmed: true });
	assert.ok(calls.indexOf('resume.close') < calls.indexOf('signature'));
	assert.equal(res.signed, true);
	assert.equal(res.closeLabel, 'Firmar y Cerrar viaje');
});

test('closeTrip: confirma el modal post-cierre si aparece', async () => {
	const { pbo, calls } = build({ modalAfterClose: true });
	await pbo.closeTrip({ confirmed: true });
	assert.deepEqual(calls.slice(-2), ['modal.confirm', 'modal.closed']);
});

test('closeTrip: error de firma se propaga', async () => {
	const { pbo } = build({ signature: true, signFails: true });
	await assert.rejects(() => pbo.closeTrip({ confirmed: true }), /sin tinta/);
});

test('closeTrip: sin confirmed no toca nada', async () => {
	const { pbo, calls } = build();
	await assert.rejects(() => pbo.closeTrip({ confirmed: false }), IrreversibleNotConfirmedError);
	assert.deepEqual(calls, []);
});
