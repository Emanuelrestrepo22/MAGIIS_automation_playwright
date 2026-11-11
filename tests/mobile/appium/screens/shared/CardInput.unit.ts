// Unit de helpers puros de tarjeta (sin Appium). Run: npx tsx --test tests/mobile/appium/screens/shared/CardInput.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { last4DigitsOf, parseExpiryParts, sanitizeCardNumber } from './CardInput';

test('parseExpiryParts acepta MM/YY y MM/YYYY y padea el mes', () => {
	assert.deepEqual(parseExpiryParts('1/30'), { month: '01', year: '30', combined: '01/30', compact: '0130' });
	assert.deepEqual(parseExpiryParts(' 12 / 2031 '.replace(/ /g, '')), {
		month: '12',
		year: '31',
		combined: '12/31',
		compact: '1231'
	});
});

test('parseExpiryParts falla rápido con formato inválido', () => {
	assert.throws(() => parseExpiryParts('1230'), /Invalid card expiry/);
	assert.throws(() => parseExpiryParts('12/3'), /Expected MM\/YY or MM\/YYYY/);
});

test('last4DigitsOf extrae los últimos 4 dígitos de etiquetas de tarjeta', () => {
	assert.equal(last4DigitsOf('VISA ****4242'), '4242');
	assert.equal(last4DigitsOf('4242'), '4242');
	assert.equal(last4DigitsOf('4242 4242 4242 1881'), '1881');
});

test('sanitizeCardNumber quita espacios', () => {
	assert.equal(sanitizeCardNumber('4242 4242  4242 4242'), '4242424242424242');
});
