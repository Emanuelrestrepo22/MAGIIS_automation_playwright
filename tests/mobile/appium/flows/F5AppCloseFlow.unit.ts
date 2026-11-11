// Unit de F5AppCloseFlow con PBOs fake (sin Appium). Run: npx tsx --test tests/mobile/appium/flows/F5AppCloseFlow.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCarrier } from '../data/carriers';
import { parseF5AppHandoff } from '../contracts/f5AppHandoff';
import { IrreversibleNotConfirmedError } from '../pbo';
import { F5AppCloseFlow, applyF5CloseResult, type F5AppCloseInput } from './F5AppCloseFlow';

const preparedUrl = new URL('../contracts/fixtures/f5-app-handoff.prepared.json', import.meta.url);
const prepared = () => parseF5AppHandoff(JSON.parse(readFileSync(preparedUrl, 'utf8')));

const route = [
	{ lat: 0, lng: 0 },
	{ lat: 0, lng: 0.001 }
];

function build(opts: { seen?: string | null; aborted?: boolean; gpsThrows?: boolean; signature?: boolean } = {}) {
	const calls: string[] = [];
	let t = 1_700_000_000_000;
	const flow = new F5AppCloseFlow({
		session: { startSession: async () => (calls.push('session'), { driverDisplayName: 'x', appPackage: 'p', online: true }) },
		offer: { peekTravelId: async () => (calls.push('peek'), 'seen' in opts ? opts.seen! : String(prepared().travelId)) },
		trip: {
			acceptAssignedTrip: async () => (calls.push('accept'), { travelId: String(prepared().travelId) }),
			startTrip: async () => void calls.push('start'),
			finishTrip: async o => {
				calls.push('finish');
				if (!o.confirmed) throw new IrreversibleNotConfirmedError('Finalizar');
				return { total: 1645, totalText: '$1,645.00', paymentMethod: 'VISA 4242' };
			},
			closeTrip: async o => {
				calls.push('close');
				if (!o.confirmed) throw new IrreversibleNotConfirmedError('Cerrar');
				return { closedTotal: 1645, paymentMethod: 'VISA 4242', signed: !!opts.signature, closeLabel: 'Cerrar Viaje' };
			}
		},
		gps: {
			driveRoute: async () => {
				calls.push('gps');
				if (opts.gpsThrows) throw new Error('adb caído');
				t += 120_000;
				return { theoreticalMeters: 32_460, fedMeters: 32_000, pointsSent: 10, pointsTotal: 10, aborted: !!opts.aborted };
			}
		},
		evidence: { checkpoint: async s => (calls.push(`shot:${s}`), { path: s } as never) },
		log: () => undefined,
		now: () => t
	});
	return { flow, calls };
}

const input = (over: Partial<F5AppCloseInput> = {}): F5AppCloseInput => ({
	carrier: getCarrier(1901),
	travelId: prepared().travelId,
	expectation: { appPackage: 'p', driverDisplayName: 'x', credentials: { email: 'e', password: 'p' } },
	route,
	confirmed: true,
	...over
});

test('confirmed=true: orden sesión -> oferta -> aceptar -> iniciar -> gps -> finalizar -> cerrar, con evidencia', async () => {
	const { flow, calls } = build();
	const r = await flow.run(input());
	assert.equal(r.status, 'closed');
	assert.deepEqual(calls, [
		'session', 'peek', 'accept', 'shot:confirm', 'start', 'shot:in-progress', 'gps', 'finish', 'shot:resume', 'close', 'shot:closed'
	]);
	if (r.status !== 'closed') return;
	assert.equal(r.closure.result.totalAmount, 1645);
	assert.equal(r.closure.result.closeButtonText, 'Cerrar Viaje');
	assert.equal(r.closure.measured.km, 32);
	assert.equal(r.closure.measured.routeKm, 32.46);
	assert.equal(r.closure.measured.minutes, 2);
	assert.deepEqual(r.closure.result.checkpoints.map(c => c.stage), ['confirm', 'in-progress', 'resume', 'closed']);
});

test('confirmed=false: solo sesión; nunca acepta, finaliza ni cierra', async () => {
	const { flow, calls } = build();
	const r = await flow.run(input({ confirmed: false }));
	assert.equal(r.status, 'not-confirmed');
	assert.deepEqual(calls, ['session']);
});

test('error en GPS (lanza): falla en gps, no finaliza ni cierra, irreversibleStarted=true', async () => {
	const { flow, calls } = build({ gpsThrows: true });
	const r = await flow.run(input());
	assert.equal(r.status, 'failed');
	if (r.status !== 'failed') return;
	assert.equal(r.stage, 'gps');
	assert.equal(r.irreversibleStarted, true);
	assert.ok(!calls.includes('finish') && !calls.includes('close'));
});

test('GPS abortado: falla en gps y no finaliza ni cierra', async () => {
	const { flow, calls } = build({ aborted: true });
	const r = await flow.run(input());
	assert.equal(r.status, 'failed');
	if (r.status === 'failed') assert.match(r.message, /abortada/);
	assert.ok(!calls.includes('finish') && !calls.includes('close'));
});

test('oferta de otro viaje: falla en offer sin aceptar (handoff intacto)', async () => {
	const { flow, calls } = build({ seen: '999' });
	const r = await flow.run(input());
	assert.equal(r.status, 'failed');
	if (r.status !== 'failed') return;
	assert.equal(r.stage, 'offer');
	assert.equal(r.irreversibleStarted, false);
	assert.ok(!calls.includes('accept'));
	const h = prepared();
	assert.equal(applyF5CloseResult(h, r, 'now'), h);
});

test('resumeFromToStart: omite sesión, oferta y aceptación', async () => {
	const { flow, calls } = build();
	const r = await flow.run(input({ resumeFromToStart: true, travelId: null }));
	assert.equal(r.status, 'closed');
	assert.equal(calls[0], 'start');
	assert.ok(!calls.includes('session') && !calls.includes('accept') && !calls.includes('peek'));
});

test('applyF5CloseResult: closed -> handoff cerrado válido; failed tras aceptar -> failed', async () => {
	const ok = await build().flow.run(input());
	const closed = applyF5CloseResult(prepared(), ok, 'now');
	assert.equal(closed.status, 'closed');
	assert.doesNotThrow(() => parseF5AppHandoff(JSON.parse(JSON.stringify(closed))));
	const bad = await build({ gpsThrows: true }).flow.run(input());
	const failed = applyF5CloseResult(prepared(), bad, '2026-11-11T00:00:00Z');
	assert.equal(failed.status, 'failed');
	assert.equal(failed.failure?.stage, 'in-trip');
});
