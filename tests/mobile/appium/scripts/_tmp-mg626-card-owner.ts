/**
 * TEMPORAL (MG-626) — ¿de qué wallet/usuario quedó colgada la tarjeta recién creada?
 * Decide si el alta se hizo con el perfil CORPORATIVO (colaborador 9869 / user 13535) o con el
 * perfil INDIVIDUO (pax 8669 / user 12055). READ-ONLY.
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[mg626-owner] ${m}`);

async function main(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) throw new Error('sin config Oracle');
	const db = new OracleDb(cfg);

	const cards = await db.query(
		`SELECT c.id AS "cardId", c.last_four_digits AS "last4", c.user_wallet_id AS "walletId",
		        w.user_id AS "walletUserId", w.carrieraccount_id AS "carrier", w.mercadopago_app_id AS "appId",
		        p.id AS "passengerId", p.email AS "email"
		   FROM card c
		   JOIN user_wallet w ON c.user_wallet_id = w.id
		   LEFT JOIN passenger p ON p.user_id = w.user_id
		  WHERE w.user_id IN (12055, 13535)
		  ORDER BY c.id DESC`
	);
	log(`cards de los dos perfiles:\n${JSON.stringify(cards, null, 2)}`);

	const wallets = await db.query(
		`SELECT id AS "walletId", user_id AS "userId", carrieraccount_id AS "carrier", mercadopago_app_id AS "appId"
		   FROM user_wallet WHERE user_id IN (12055, 13535) ORDER BY id`
	);
	log(`wallets:\n${JSON.stringify(wallets, null, 2)}`);
}

main().then(() => log('done')).catch((e: unknown) => {
	console.error(`[mg626-owner] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
