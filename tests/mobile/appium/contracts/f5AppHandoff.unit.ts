// Unit test del contrato de handoff W5a <-> W5b (sin Appium).
// Run: npx tsx --test tests/mobile/appium/contracts/f5AppHandoff.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	assertReadyToClose,
	f5AppHandoffPath,
	parseF5AppHandoff,
	parseMoneyText,
	readF5AppHandoff,
	withClosure,
	withFailure,
	writeF5AppHandoff
} from './f5AppHandoff';

const prepared = () => ({
	runId: 'run-1',
	carrierId: 1901,
	travelId: 70001,
	code: 'T-70001',
	driverId: 4965,
	vehicleId: 3849,
	ownerId: 3287,
	scenario: 'EF-NC-COM',
	currency: 'EUR',
	quoted: { total: 120.5, otherCosts: 0 },
	app: { package: 'com.magiis.app.test.driver', version: '2.6.17', udid: 'emulator-5554' }
});

const closure = () => ({
	closedAt: '2026-11-12T10:00:00.000Z',
	measured: { km: 31.2, minutes: 18.5, kmSource: 'gps-fed' as const, routeKm: 32.4 },
	result: {
		totalAmountText: '1 645,00 €',
		totalAmount: 1645,
		paymentMethod: 'Cuenta corriente',
		closeButtonText: 'Firmar y Cerrar viaje',
		checkpoints: [{ stage: 'closed', matchedBy: 'url:home', observedAt: '2026-11-12T10:00:00.000Z' }],
		startedAt: '2026-11-12T09:40:00.000Z',
		finishedAt: '2026-11-12T10:00:00.000Z'
	}
});

test('handoff mínimo de W5a es válido y asume status=prepared', () => {
	const h = parseF5AppHandoff(prepared());
	assert.equal(h.status, 'prepared');
	assert.equal(h.schemaVersion, 1);
	assert.equal(h.travelId, 70001);
});

test('preserva campos extra que agregue W5a', () => {
	const h = parseF5AppHandoff({ ...prepared(), extraW5a: { x: 1 } }) as unknown as Record<string, unknown>;
	assert.deepEqual(h.extraW5a, { x: 1 });
});

test('lista TODAS las violaciones juntas', () => {
	const bad = { ...prepared(), travelId: 0, code: '', quoted: { total: -1 }, app: { package: 'p' } };
	assert.throws(
		() => parseF5AppHandoff(bad),
		(e: Error) =>
			/travelId/.test(e.message) &&
			/code/.test(e.message) &&
			/quoted\.total/.test(e.message) &&
			/quoted\.otherCosts/.test(e.message) &&
			/app\.udid/.test(e.message)
	);
});

test('rechaza no-objeto, schemaVersion distinta, status inválido y moneda mal formada', () => {
	assert.throws(() => parseF5AppHandoff('x'), /objeto JSON/);
	assert.throws(() => parseF5AppHandoff({ ...prepared(), schemaVersion: 2 }), /schemaVersion/);
	assert.throws(() => parseF5AppHandoff({ ...prepared(), status: 'done' }), /status/);
	assert.throws(() => parseF5AppHandoff({ ...prepared(), currency: 'eur' }), /currency/);
});

test('status=closed exige closedAt, measured y result; failed exige failure', () => {
	assert.throws(() => parseF5AppHandoff({ ...prepared(), status: 'closed' }), /closedAt[\s\S]*measured[\s\S]*result/);
	assert.throws(() => parseF5AppHandoff({ ...prepared(), status: 'failed' }), /failure/);
});

test('withClosure anexa el cierre, no muta y deja la nota diferido-f7', () => {
	const base = parseF5AppHandoff(prepared());
	const closed = withClosure(base, closure());
	assert.equal(base.status, 'prepared');
	assert.equal(closed.status, 'closed');
	assert.equal(closed.measured?.km, 31.2);
	assert.ok(closed.observations?.some(o => /diferido-f7/.test(o)));
	assert.doesNotThrow(() => parseF5AppHandoff(closed));
	// quoted queda intacto: nunca se pisa con el total recalculado por la app
	assert.deepEqual(closed.quoted, base.quoted);
});

test('withFailure es válido y trunca el mensaje', () => {
	const f = withFailure(parseF5AppHandoff(prepared()), 'in-trip', 'x'.repeat(900), '2026-11-12T10:00:00.000Z');
	assert.equal(f.status, 'failed');
	assert.equal(f.failure?.message.length, 500);
	assert.doesNotThrow(() => parseF5AppHandoff(f));
});

test('assertReadyToClose: prepared pasa; closed y failed bloquean (sin reintento)', () => {
	const base = parseF5AppHandoff(prepared());
	assert.doesNotThrow(() => assertReadyToClose(base));
	assert.throws(() => assertReadyToClose(withClosure(base, closure())), /ya está cerrado/);
	assert.throws(() => assertReadyToClose(withFailure(base, 'in-trip', 'boom', '2026-11-12T10:00:00.000Z')), /failed/);
});

test('ruta canónica y sanitizado del alias de carrier', () => {
	const p = f5AppHandoffPath('test', 1901, '/repo').replace(/\\/g, '/');
	assert.ok(p.endsWith('/repo/evidence/test/f5-app-handoff-1901.json'), p);
	assert.ok(f5AppHandoffPath('test', '../x', '/repo').replace(/\\/g, '/').endsWith('f5-app-handoff-x.json'));
	assert.throws(() => f5AppHandoffPath('test', '..'), /carrier inválido/);
});

test('escritura atómica + relectura; falla clara si no existe o es ilegible', () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'f5-handoff-'));
	const file = path.join(dir, 'evidence', 'test', 'h.json');
	writeF5AppHandoff(file, parseF5AppHandoff(prepared()));
	assert.equal(readF5AppHandoff(file).travelId, 70001);
	assert.deepEqual(readdirSync(path.dirname(file)), ['h.json']); // sin .tmp residual
	assert.match(readFileSync(file, 'utf8'), /\n$/);
	assert.throws(() => readF5AppHandoff(path.join(dir, 'nope.json')), /No existe el handoff/);
	assert.throws(() => writeF5AppHandoff(file, { ...parseF5AppHandoff(prepared()), travelId: -1 }), /travelId/);
});

test('parseMoneyText: formatos AR/US/FR y casos no interpretables', () => {
	assert.equal(parseMoneyText('$1,645.00'), 1645);
	assert.equal(parseMoneyText('$ 1.645,00'), 1645);
	assert.equal(parseMoneyText('1 645,00 €'), 1645);
	assert.equal(parseMoneyText('1 645,50 €'), 1645.5);
	assert.equal(parseMoneyText('€ 12,5'), 12.5);
	assert.equal(parseMoneyText('$1,645'), 1645);
	assert.equal(parseMoneyText('$0.00'), 0);
	assert.equal(parseMoneyText(''), null);
	assert.equal(parseMoneyText('sin monto'), null);
});
