// Unit test de helpers de texto ES/EN (sin Appium).
// Run: npx tsx --test tests/mobile/appium/driver/DriverFlowSelectors.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVER_UI_TEXTS, matchesAnyText } from './DriverFlowSelectors';

test('accept: ES y EN', () => {
	assert.equal(matchesAnyText('Aceptar', DRIVER_UI_TEXTS.accept), true);
	assert.equal(matchesAnyText(' Accept ', DRIVER_UI_TEXTS.accept), true);
	assert.equal(matchesAnyText('Entrar', DRIVER_UI_TEXTS.accept), false);
});

test('confirmYes: Si/Sí/Yes pero no No', () => {
	for (const t of ['Si', 'Sí', 'Yes']) assert.equal(matchesAnyText(t, DRIVER_UI_TEXTS.confirmYes), true);
	assert.equal(matchesAnyText('No', DRIVER_UI_TEXTS.confirmYes), false);
});

test('endTrip/startTrip/closeTrip EN', () => {
	assert.equal(matchesAnyText('End Trip', DRIVER_UI_TEXTS.endTrip), true);
	assert.equal(matchesAnyText('Start Trip', DRIVER_UI_TEXTS.startTrip), true);
	assert.equal(matchesAnyText('Close Trip', DRIVER_UI_TEXTS.closeTrip), true);
	assert.equal(matchesAnyText('Sign and Close Trip', DRIVER_UI_TEXTS.closeTrip), true);
});

test('texto vacío nunca matchea', () => {
	assert.equal(matchesAnyText('', DRIVER_UI_TEXTS.accept), false);
	assert.equal(matchesAnyText(null, DRIVER_UI_TEXTS.accept), false);
});
