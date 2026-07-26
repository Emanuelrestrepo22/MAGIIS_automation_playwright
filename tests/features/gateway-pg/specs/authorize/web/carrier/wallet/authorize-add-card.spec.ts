// Authorize (web) · alta de tarjeta pre-autorizada desde el alta de viaje del carrier (1521, TEST).
// Réplica del flujo MP wallet (mismas ACCIONES) con DATOS Authorize (form nativo compartido, NO Stripe iframes).
// Authorize NUNCA aplica 3DS. A diferencia de MP, Authorize SÍ transacciona en sandbox test → sin skip.
// tms MG-285 (área WAL — alta de tarjeta). Login como carrier 1521 vía framework (.env.test).
import { test, expect } from '@TestBase';
import { DashboardPage, NewTravelPage } from '@pages/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { fillAuthorizeNativeCard } from '@features/gateway-pg/helpers/authorize.helpers';
import { getPassengerId, getPassengerCards, deletePassengerCard } from '@features/gateway-pg/helpers/card-precondition';

// Idempotencia: borra por API la tarjeta Authorize (last4) del pax antes del alta, para que cada corrida
// arranque limpia (re-validar una tarjeta ya-vinculada da "Error al validar"). Prueba varias queries de
// búsqueda del pax/cliente porque la tarjeta se adjunta al pasajero del alta.
async function cleanupAuthorizeCard(page: import('@playwright/test').Page, last4: string): Promise<void> {
	for (const query of ['smith', 'fast', 'Emanuel']) {
		try {
			const paxId = await getPassengerId(page, query);
			const resp = await getPassengerCards(page, paxId);
			const cards = (resp.cards ?? []) as Array<{ id: number; lastFourDigits: string }>;
			const toDelete = cards.filter((c) => c.lastFourDigits === last4);
			for (const c of toDelete) await deletePassengerCard(page, paxId, c.id);
			// eslint-disable-next-line no-console
			console.log(`[precond] query="${query}" pax=${paxId}: ${cards.length} tarjetas, borradas ${toDelete.length} con last4=${last4}`);
			if (toDelete.length > 0) return;
		} catch (e) {
			// eslint-disable-next-line no-console
			console.log(`[precond] query="${query}" skip: ${(e as Error).message}`);
		}
	}
}

const env = process.env.ENV ?? 'test';

// Tarjeta Authorize aprobada (doc sandbox): Visa 4111 + CVV 900 + ZIP 10001. VERIFICADA en vivo:
// valida OK ("Tarjeta válida") sobre un pax con estado limpio.
// ⚠️ REPETIBILIDAD (para 3× PASS): re-validar la MISMA tarjeta sobre un pax que YA la tiene vinculada
// da "Error al validar tarjeta / revise los datos" (no es dedup de tiempo: es tarjeta-ya-vinculada).
// Rotar marca no sirve (MC 5424 / Discover 6011 NO habilitan "Validar" en este form; solo Visa 4111
// valida confiablemente). ⇒ la repetibilidad requiere el manejo card-precondition (nueva-vs-existente +
// cleanup) de la suite Stripe (helpers/card-precondition.ts + CarrierHoldSteps.resolveCardFlow).
// PRÓXIMA ITERACIÓN P3: parametrizar ese card-flow para Authorize (form nativo) en vez de standalone.
const AUTHORIZE_APPROVED = { number: '4111111111111111', cvv: '900', zip: '10001', exp: '12/34' };

test.describe('Gateway PG · Carrier · Authorize — alta de tarjeta pre-autorizada @gateway @authorize @wallet @regression', {
	annotation: [{ type: 'tms', description: 'MG-285' }],
}, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test(`[TS-AUTHORIZE-WAL-01] @wallet vincular tarjeta Authorize (Visa 4111) desde el alta de viaje (${env.toUpperCase()})`, async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);

		await test.step('Given: dispatcher logueado en carrier 1521 (Authorize vinculada)', async () => {
			// Retry del login ante flake de auth de apps-test (mismo que endurece loving-mendel en LoginPage;
			// este worktree tiene el LoginPage base sin ese retry). Re-navega a login en cada intento.
			await expect(async () => {
				await loginAsDispatcher(page); // default = carrier 1521 (USER_CARRIER en .env.test)
			}).toPass({ timeout: 120_000, intervals: [2_000, 4_000, 8_000] });
		});

		await test.step('And: precondición — limpiar tarjeta Authorize previa del pax (idempotencia)', async () => {
			await cleanupAuthorizeCard(page, AUTHORIZE_APPROVED.number.slice(-4));
		});

		await test.step('When: formulario de nuevo viaje con cliente y destino', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(TEST_DATA.contractorClient);
			await travel.setDestination(TEST_DATA.destination);
		});

		await test.step('And: método "Preautorizada" + alta de tarjeta Authorize (4111/CVV900/ZIP10001)', async () => {
			await travel.selectPaymentMethod('Preautorizada');
			await fillAuthorizeNativeCard(page, {
				number: AUTHORIZE_APPROVED.number,
				cvv: AUTHORIZE_APPROVED.cvv,
				zip: AUTHORIZE_APPROVED.zip,
				exp: AUTHORIZE_APPROVED.exp,
			});
			await page.getByRole('button', { name: /^(Valid|Validar)$/i }).click();
		});

		await test.step('Then: la tarjeta Authorize queda validada ("Tarjeta válida")', async () => {
			// Oráculo real (verificado en vivo): la validación exitosa muestra "Tarjeta válida" / "Valid card"
			// y deshabilita el botón "Validar". (Authorize sandbox aprueba 4111 + CVV 900 + ZIP 10001.)
			await expect(page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first()).toBeVisible({ timeout: 20_000 });
		});
	});
});
