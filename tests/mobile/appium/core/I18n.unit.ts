// Unit de I18n + Locator (sin Appium). Run: npx tsx --test tests/mobile/appium/core/I18n.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRIVER_UI_TEXTS } from '../driver/DriverFlowSelectors';
import { I18n, I18nKeyMissingError, I18nPendingTextError, localeForProfile } from './I18n';
import { defineLocator, orderedStrategies, resolveWebSelectors } from './Locator';

test('t devuelve el texto canónico por locale', () => {
	assert.equal(new I18n('es').t('driver.travelInProgress.endTrip'), 'Finalizar Viaje');
	assert.equal(new I18n('en').t('driver.travelInProgress.endTrip'), 'End Trip');
});

test('key faltante falla (no devuelve la key)', () => {
	assert.throws(() => new I18n('es').t('driver.no.existe'), I18nKeyMissingError);
});

test('endTrip y closeTrip están desambiguadas (distinta key, distinta pantalla)', () => {
	const i = new I18n('es');
	assert.notEqual(i.t('driver.travelInProgress.endTrip'), i.t('driver.travelResume.closeTrip'));
	assert.equal(i.t('driver.travelResume.signAndCloseTrip'), 'Firmar y Cerrar viaje');
	assert.ok(i.variants('driver.travelResume.closeTrip').includes('Finalizar Viaje'), 'legado vive como variante');
});

test('locale por perfil: fr-1901 -> fr, test-mp -> es; perfil desconocido falla', () => {
	assert.equal(localeForProfile('fr-1901'), 'fr');
	assert.equal(I18n.forProfile('test-mp').locale, 'es');
	assert.throws(() => localeForProfile('otro'), /no tiene locale/);
});

test('fr: textos TODO-verificar fallan al pedirlos y se reportan', () => {
	const fr = I18n.forProfile('fr-1901');
	assert.throws(() => fr.t('driver.buttons.accept'), I18nPendingTextError);
	assert.equal(fr.pendingKeys().length, 8);
	assert.deepEqual(fr.missingKeys(), []);
});

test('es y en no tienen keys pendientes y tienen las mismas keys', () => {
	const es = new I18n('es');
	const en = new I18n('en');
	assert.deepEqual(es.pendingKeys(), []);
	assert.deepEqual(en.pendingKeys(), []);
	assert.deepEqual(es.missingKeys(), []);
	assert.deepEqual(en.missingKeys(), []);
});

test('paridad con DRIVER_UI_TEXTS: cada texto ES/EN existente está cubierto por alguna key', () => {
	const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
	const all = new Set<string>();
	for (const l of ['es', 'en'] as const) {
		const i = new I18n(l);
		for (const key of [
			'driver.buttons.accept',
			'driver.buttons.confirmYes',
			'driver.travelToStart.startTrip',
			'driver.travelInProgress.endTrip',
			'driver.travelResume.closeTrip',
			'driver.travelResume.signAndCloseTrip',
			'driver.home.available',
			'driver.home.notAvailable'
		]) {
			for (const v of i.variants(key)) all.add(norm(v));
		}
	}
	for (const list of Object.values(DRIVER_UI_TEXTS)) for (const text of list) assert.ok(all.has(norm(text)), `falta "${text}"`);
});

test('matches: exacto, insensible a mayúsculas/espacios', () => {
	const i = new I18n('es');
	assert.equal(i.matches('  cerrar   viaje ', 'driver.travelResume.closeTrip'), true);
	assert.equal(i.matches('Cerrar', 'driver.travelResume.closeTrip'), false);
	assert.equal(i.matches(null, 'driver.travelResume.closeTrip'), false);
});

test('Locator: orden accessibility id -> resource-id/clase -> web -> texto -> xpath', () => {
	const loc = defineLocator({
		id: 'x',
		native: { accessibilityId: 'ok' },
		web: ['app-a button.btn', 'button.btn'],
		textKey: 'driver.buttons.accept'
	});
	assert.deepEqual(
		orderedStrategies(loc).map(s => s.kind),
		['accessibilityId', 'web', 'web', 'text']
	);
	assert.equal(orderedStrategies(loc)[0]!.value, '~ok');
	assert.deepEqual(resolveWebSelectors({ id: 'y', web: 'a' }), ['a']);
	assert.deepEqual(orderedStrategies({ id: 'z', native: { xpath: '//x' }, textKey: 'k' }).map(s => s.kind), ['text', 'xpath']);
	assert.throws(() => defineLocator({ id: 'vacío' }), /ninguna estrategia/);
});

test('forProfileWithEnv: APP_LOCALE pisa el locale del perfil; vacío usa el perfil; inválido lanza', () => {
	assert.equal(I18n.forProfileWithEnv('test-default', { APP_LOCALE: 'en' }).locale, 'en');
	assert.equal(I18n.forProfileWithEnv('test-default', {}).locale, 'es');
	assert.equal(I18n.forProfileWithEnv('test-default', { APP_LOCALE: ' ' }).locale, 'es');
	assert.throws(() => I18n.forProfileWithEnv('test-default', { APP_LOCALE: 'pt' }), /APP_LOCALE="pt" inválido/);
});
