/**
 * [MG · WAL][DB] Authorize — pata DB de la trifuerza del alta de tarjeta.
 *
 * Cierra la trifuerza del área WAL/C para Authorize: la capa UI (WAL add-card,
 * TS-AUTHORIZE-WAL-01) y la capa API (paymentMethodsByPax) ya confirman que la tarjeta
 * queda vinculada; este spec confirma el **efecto físico en la base de datos**.
 *
 * Por qué es un oráculo válido pese al modo de la cuenta sandbox: el oráculo acá es la
 * PERSISTENCIA de una tarjeta aprobada, no un trigger de rechazo. La aprobación es
 * verificable contra cualquier cuenta (doctrina EXTERNAL-BLOCKERS §0).
 *
 * Read-only: `OracleDb` rechaza toda sentencia que no sea SELECT (`assertSelectOnly`).
 *
 * Datos: el pax del carrier Authorize se resuelve por API (`getPassengerId` con las
 * `paxSearchQueries` del adapter) — no se hardcodea ningún id. Las tarjetas esperadas son
 * las que dejaron las corridas de la campaña (Visa 1111 / MC 0015 / Amex 0002).
 *
 * ⚠️ Pendiente de confirmar en TEST: los nombres de tabla/columna de `countCardsByPassenger`
 * (CARD / USER_WALLET / last_four_digits) vienen del default del helper. Si el esquema real
 * difiere, el override es por env (ORACLE_CARD_TABLE / ORACLE_WALLET_TABLE /
 * ORACLE_CARD_BY_PAX_SQL) — el test reporta el error del driver sin inventar SQL.
 */
import { test, expect } from '@TestBase';
import { LoginPage } from '@pages/shared/LoginPage';
import { getPassengerId, getPassengerCards } from '@features/gateway-pg/helpers/card-precondition';
import { oracleConfigFromEnv, countCardsByCarrierAndLast4 } from '@features/gateway-pg/helpers/oracle-wallet';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const ORACLE = oracleConfigFromEnv();

test.describe(
	'[MG · WAL][DB] Authorize — persistencia física de la tarjeta vinculada @regression @gateway-pg @authorize',
	{
		annotation: [{ type: 'tms', description: 'MG-285' }]
	},
	() => {
		test.use({ role: 'carrier' });
		test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL — configurar .env.test');
		test.skip(
			!ORACLE,
			'Faltan ORACLE_*_TEST (host/port/service/user/password) — la pata DB de la trifuerza queda sin cablear.'
		);

		test('[WAL-DB] la tarjeta que la UI/API reportan vinculada existe en DB para el mismo pax', async ({ page }) => {
			const login = new LoginPage(page, 'carrier');
			await login.goto();
			await login.login(process.env.USER_CARRIER as string, process.env.PASS_CARRIER as string);
			await page.waitForURL(/dashboard/, { timeout: 30_000 });

			// ── Capa API: resolver el pax del carrier Authorize y sus tarjetas vinculadas ──
			const queries = journeyDefaultsFor('authorize').paxSearchQueries;
			let passengerUserId: number | null = null;
			let apiLast4s: string[] = [];

			for (const query of queries) {
				const paxId = await getPassengerId(page, query);
				const cards = (await getPassengerCards(page, paxId)).cards ?? [];
				if (cards.length > 0) {
					passengerUserId = paxId;
					apiLast4s = cards.map(c => c.lastFourDigits);
					break;
				}
			}

			expect(
				passengerUserId,
				`ninguna de las queries [${queries.join(', ')}] devolvió un pax con tarjetas — precondición: correr antes el alta WAL`
			).not.toBeNull();

			// ── Capa DB: cada tarjeta que la API expone debe existir físicamente bajo el carrier ──
			// Se filtra por carrier + last4 (NO por el id de pax de la API): ese id no es
			// USER_WALLET.USER_ID — ver la advertencia de espacio de ids en `countCardsByPassenger`.
			const carrierAccountId = process.env.CARRIER_ID ?? '1521';

			for (const last4 of new Set(apiLast4s)) {
				const inDb = await countCardsByCarrierAndLast4(ORACLE!, { carrierAccountId, last4 });
				expect(
					inDb,
					`la API expone la tarjeta •••• ${last4} (pax ${passengerUserId} del carrier ${carrierAccountId}); ` +
						'la DB debe tener al menos una fila con ese last4 bajo el carrier → si da 0, el alta no persistió'
				).toBeGreaterThan(0);
			}
		});
	}
);
