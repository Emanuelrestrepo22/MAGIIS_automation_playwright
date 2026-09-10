// tests/utils/redact.unit.ts
// Unit test del helper de redacción de secretos (node:test -- sin runner de Playwright).
// Sufijo .unit.ts para que Playwright NO lo recoja como spec.
// Run: npx tsx --test tests/utils/redact.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './redact';

const FAKE_TOKEN =
	'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.FAKE_SIGNATURE_NOT_A_REAL_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXX';

test('redacta Authorization: Bearer <token> en un call log de Playwright', () => {
	const raw =
		'apiRequestContext.fetch: socket hang up\nCall log:\n  - → POST https://api.magiis.com/x\n' +
		`  - authorization: Bearer ${FAKE_TOKEN}\n  - content-type: application/json`;
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes(FAKE_TOKEN), 'el token no debe aparecer en el resultado');
	assert.match(cleaned, /authorization: \[REDACTED\]/i);
	assert.match(cleaned, /content-type: application\/json/); // preserva el resto del volcado
});

test('redacta Authorization en headers serializados como JSON', () => {
	const raw = JSON.stringify({ headers: { Authorization: `Bearer ${FAKE_TOKEN}`, Accept: 'application/json' } });
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
	assert.match(cleaned, /"Authorization":"\[REDACTED\]"/i);
	assert.match(cleaned, /"Accept":"application\/json"/);
});

test('es case-insensitive en el nombre del header', () => {
	const cleaned = redactSecrets(`AUTHORIZATION: Bearer ${FAKE_TOKEN}`);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
});

test('redacta Cookie y Set-Cookie', () => {
	const cleaned = redactSecrets(`Cookie: session=${FAKE_TOKEN}\nSet-Cookie: session=${FAKE_TOKEN}; HttpOnly`);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
});

test('no toca texto sin headers sensibles', () => {
	const raw = 'expect(received).toBe(expected)\n\nExpected: 200\nReceived: 500';
	assert.equal(redactSecrets(raw), raw);
});

test('maneja string vacío sin lanzar', () => {
	assert.equal(redactSecrets(''), '');
});
