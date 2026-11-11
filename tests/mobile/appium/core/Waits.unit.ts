// Unit de Waits (sin Appium). Run: npx tsx --test tests/mobile/appium/core/Waits.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WaitTimeoutError, tryUntil, until, waitForWebVisible, type WebExecutor } from './Waits';

test('until devuelve el valor en cuanto la condición se cumple', async () => {
	let calls = 0;
	const v = await until(() => (++calls >= 3 ? 'listo' : false), { timeout: 1000, interval: 5 });
	assert.equal(v, 'listo');
	assert.equal(calls, 3);
});

test('until lanza WaitTimeoutError con la etiqueta al vencer', async () => {
	await assert.rejects(
		until(() => false, { timeout: 40, interval: 5, label: 'botón Aceptar' }),
		(e: unknown) => e instanceof WaitTimeoutError && /botón Aceptar/.test(e.message) && e.timeoutMs === 40
	);
});

test('tryUntil devuelve null al vencer, sin lanzar', async () => {
	assert.equal(await tryUntil(() => null, { timeout: 30, interval: 5 }), null);
});

test('una excepción dentro de la condición cuenta como "aún no" y se reintenta', async () => {
	let calls = 0;
	const v = await until(
		() => {
			if (++calls < 3) throw new Error('stale element');
			return 7;
		},
		{ timeout: 1000, interval: 5 }
	);
	assert.equal(v, 7);
});

test('respeta el timeout total (no espera de más)', async () => {
	const t0 = Date.now();
	await tryUntil(() => false, { timeout: 60, interval: 1000 });
	assert.ok(Date.now() - t0 < 500);
});

test('waitForWebVisible devuelve el selector que matcheó', async () => {
	const seen: string[] = [];
	const driver: WebExecutor = {
		execute: async (_script, selector) => {
			seen.push(selector);
			return selector === 'app-b';
		}
	};
	const matched = await waitForWebVisible(driver, { id: 'x', web: ['app-a', 'app-b'] }, { timeout: 200, interval: 5 });
	assert.equal(matched, 'app-b');
	assert.deepEqual(seen.slice(0, 2), ['app-a', 'app-b']);
});

test('waitForWebVisible falla si el locator no tiene selector web', async () => {
	const driver: WebExecutor = { execute: async () => true };
	await assert.rejects(waitForWebVisible(driver, { id: 'solo-texto', textKey: 'k' }), /no tiene selector web/);
});

test('waitForWebVisible vence con WaitTimeoutError si nunca es visible', async () => {
	const driver: WebExecutor = { execute: async () => false };
	await assert.rejects(waitForWebVisible(driver, { id: 'x', web: 'app-a' }, { timeout: 30, interval: 5 }), WaitTimeoutError);
});
