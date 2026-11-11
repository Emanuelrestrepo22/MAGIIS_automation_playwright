// Unit de PassengerWalletPBO con screens fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/PassengerWalletPBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PassengerWalletPBO,
	type CardFormPort,
	type MenuPort,
	type RowsPort,
	type WalletPort
} from './PassengerWalletPBO';

type RowResult = { status: string; label: string };

function build(opts: {
	counts?: number[];
	rowResults?: RowResult[];
	menuDelete?: boolean;
	menuPrincipal?: boolean;
	countDrops?: boolean;
	hasCard?: boolean[];
	toast?: boolean;
}) {
	const log: string[] = [];
	const counts = [...(opts.counts ?? [1])];
	const rowResults = [...(opts.rowResults ?? [])];
	const hasCard = [...(opts.hasCard ?? [])];
	const wallet: WalletPort = {
		tapAddCard: async () => void log.push('tapAddCard'),
		hasCard: async () => hasCard.shift() ?? false,
		isCardFormOpen: async () => false
	};
	const rows: RowsPort = {
		countCards: async () => (counts.length > 1 ? (counts.shift() as number) : (counts[0] ?? 0)),
		clickCardRowAction: async (digits, icon) => {
			log.push(`row:${digits}:${icon}`);
			return rowResults.shift() ?? { status: 'clicked-direct', label: 'VISA 4242' };
		},
		waitForCardCountToDrop: async () => opts.countDrops ?? true
	};
	const menu: MenuPort = {
		tapDeleteInMenu: async () => opts.menuDelete ?? true,
		tapPrincipalInMenu: async () => opts.menuPrincipal ?? true,
		waitForPrincipalToast: async () => opts.toast ?? true
	};
	const cardForm: CardFormPort = {
		fillCardForm: async () => void log.push('fill'),
		saveCard: async () => {
			log.push('save');
			return '3ds-visible';
		},
		listIframeMetadata: async () => []
	};
	const dialog = { confirmDeleteDialogIfPresent: async () => false };
	return { pbo: new PassengerWalletPBO(wallet, rows, menu, cardForm, dialog), log };
}

test('addCard: AGREGAR -> llenar -> GUARDAR y devuelve lo observado tras el submit', async () => {
	const { pbo, log } = build({});
	const result = await pbo.addCard({ number: '4242424242424242', expiry: '12/30', cvc: '123' });
	assert.deepEqual(log, ['tapAddCard', 'fill', 'save']);
	assert.deepEqual(result, { submitOutcome: '3ds-visible' });
});

test('deleteCard: normaliza a últimos 4 dígitos y confirma por baja de conteo', async () => {
	const { pbo, log } = build({ counts: [2], rowResults: [{ status: 'clicked-direct', label: 'VISA 4242' }] });
	await pbo.deleteCard('VISA ****4242');
	assert.deepEqual(log, ['row:4242:trash']);
});

test('deleteCard: tarjeta inexistente falla con el mensaje legado', async () => {
	const { pbo } = build({ rowResults: [{ status: 'not-found', label: '' }] });
	await assert.rejects(pbo.deleteCard('4242'), /card ending 4242 not found/);
});

test('deleteCard: si el menú no ofrece eliminar falla', async () => {
	const { pbo } = build({ rowResults: [{ status: 'opened-options', label: 'x' }], menuDelete: false });
	await assert.rejects(pbo.deleteCard('4242'), /delete action not found for card ending 4242/);
});

test('deleteCard: conteo que no baja falla', async () => {
	const { pbo } = build({ counts: [2], countDrops: false });
	await assert.rejects(pbo.deleteCard('4242'), /wallet count did not decrease/);
});

test('deleteFirstVisibleCard: lista vacía devuelve null sin tocar filas', async () => {
	const { pbo, log } = build({ counts: [0] });
	assert.equal(await pbo.deleteFirstVisibleCard(), null);
	assert.deepEqual(log, []);
});

test('deleteAllVisibleCards: respeta maxIterations y corta en lista vacía', async () => {
	const { pbo } = build({
		counts: [3, 3, 3, 3],
		rowResults: [
			{ status: 'clicked-direct', label: 'a' },
			{ status: 'clicked-direct', label: 'b' }
		]
	});
	assert.equal(await pbo.deleteAllVisibleCards(2), 2);
});

test('selectCard: ya es principal no hace nada más', async () => {
	const { pbo } = build({ rowResults: [{ status: 'already-default', label: '' }], toast: false });
	await pbo.selectCard('4242');
});

test('selectCard: menú sin acción Principal falla; estado desconocido falla', async () => {
	const a = build({ rowResults: [{ status: 'opened-options', label: '' }], menuPrincipal: false });
	await assert.rejects(a.pbo.selectCard('4242'), /principal action not found/);
	const b = build({ rowResults: [{ status: 'missing-action', label: '' }] });
	await assert.rejects(b.pbo.selectCard('4242'), /card ending 4242 not found/);
});

test('verifyCardAdded: devuelve cuando la tarjeta aparece y falla con el estado observado si no', async () => {
	const ok = build({ hasCard: [false, true] });
	await ok.pbo.verifyCardAdded('4242', 2_000);
	const ko = build({ counts: [1] });
	await assert.rejects(
		ko.pbo.verifyCardAdded('4242', 300),
		/card ending 4242 not found after 300ms; modalVisible=false; cardCount=1/
	);
});
