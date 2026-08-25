/**
 * TEMPORAL (MG-626) — precheck READ-ONLY de la precondición de AC1.
 *
 * Objetivo: confirmar, ANTES de correr el flujo en device, si el pax 9869 (corporativo / modo
 * compañía) tiene un perfil individuo vinculado con al menos una fila en PASSENGER_ADDRESSES.
 * Sin esa dirección el fix del FE no tiene placeId que mandar y AC1 no es alcanzable.
 *
 * READ-ONLY: usa el componente KATA OracleDb (guard SELECT-only).
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.test npx tsx -r dotenv/config \
 *     tests/mobile/appium/scripts/_tmp-mg626-db-precheck.ts
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[mg626-db] ${m}`);
const PAX = process.env.MG626_PAX_ID ?? '9869';
const CARRIER = process.env.MG626_CARRIER_ID ?? '1521';

async function main(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) {
		throw new Error('Sin config Oracle en el env (ORACLE_*_TEST). No se puede prechequear la precondición.');
	}
	const db = new OracleDb(cfg);

	// 1) Descubrimiento de esquema: tablas candidatas.
	const tables = await db.query<{ TABLE_NAME: string }>(
		`SELECT table_name AS "TABLE_NAME" FROM all_tables
		  WHERE owner = UPPER(:owner)
		    AND (table_name LIKE '%PASSENGER%' OR table_name LIKE '%ADDRESS%' OR table_name LIKE '%COLLABORATOR%' OR table_name LIKE '%COMPANY%')
		  ORDER BY table_name`,
		{ owner: cfg.user }
	);
	log(`tablas candidatas (${tables.length}): ${tables.map(t => t.TABLE_NAME).join(', ')}`);

	// 2) Columnas de PASSENGER_ADDRESSES (si existe) y de PASSENGER.
	for (const t of ['PASSENGER_ADDRESSES', 'PASSENGER']) {
		if (!tables.some(x => x.TABLE_NAME === t)) {
			log(`-- ${t}: NO existe con ese nombre exacto`);
			continue;
		}
		const cols = await db.query<{ C: string; D: string }>(
			`SELECT column_name AS "C", data_type AS "D" FROM all_tab_columns
			  WHERE owner = UPPER(:owner) AND table_name = :t ORDER BY column_id`,
			{ owner: cfg.user, t }
		);
		log(`-- ${t} (${cols.length} cols): ${cols.map(c => `${c.C}:${c.D}`).join(', ')}`);
	}

	for (const t of ['PASSENGERPROFILE', 'PASSENGERACCOUNT']) {
		const cols = await db.query<{ C: string; D: string }>(
			`SELECT column_name AS "C", data_type AS "D" FROM all_tab_columns
			  WHERE owner = UPPER(:owner) AND table_name = :t ORDER BY column_id`,
			{ owner: cfg.user, t }
		);
		log(`-- ${t} (${cols.length} cols): ${cols.map(c => `${c.C}:${c.D}`).join(', ')}`);
	}

	// 3) ¿Quién es el pax 9869? Buscar por ID y por email en PASSENGER.
	const byId = await db.query(
		`SELECT id AS "id", user_id AS "userId", email AS "email", defaultcarrier_id AS "carrier", app_name AS "app"
		   FROM passenger WHERE id = :pax OR user_id = :pax`,
		{ pax: Number(PAX) }
	);
	log(`PASSENGER id/user_id = ${PAX}:\n${JSON.stringify(byId, null, 2)}`);

	const byEmail = await db.query(
		`SELECT id AS "id", user_id AS "userId", email AS "email", defaultcarrier_id AS "carrier", app_name AS "app"
		   FROM passenger WHERE LOWER(email) = LOWER(:mail) ORDER BY id`,
		{ mail: process.env.PASSENGER_EMAIL ?? 'emanuel.restrepo@yopmail.com' }
	);
	log(`PASSENGER por email:\n${JSON.stringify(byEmail, null, 2)}`);

	// 4) Direcciones de cada passenger id encontrado.
	const ids = [...new Set([...byId, ...byEmail].map(r => Number((r as Record<string, unknown>).id)))].filter(Boolean);
	for (const id of ids) {
		const addrs = await db.query(
			`SELECT id AS "id", name AS "name", place_id AS "placeId", main_text AS "mainText",
			        address_type AS "addressType", creation_date AS "createdAt"
			   FROM passenger_addresses WHERE passenger_id = :id ORDER BY id`,
			{ id }
		);
		log(`PASSENGER_ADDRESSES de passenger_id=${id} → ${addrs.length} fila(s):\n${JSON.stringify(addrs, null, 2)}`);
	}
	log(`carrier de referencia del ticket = ${CARRIER}`);

	// 5) Modelo corporativo: qué tablas atan un pax a una empresa/cliente/colaborador.
	const corpTables = await db.query<{ T: string }>(
		`SELECT table_name AS "T" FROM all_tables
		  WHERE owner = UPPER(:owner)
		    AND (table_name LIKE '%CLIENT%' OR table_name LIKE '%COLLAB%' OR table_name LIKE '%EMPLOY%'
		         OR table_name LIKE '%CONTRACT%' OR table_name LIKE '%USER%')
		  ORDER BY table_name`,
		{ owner: cfg.user }
	);
	log(`tablas corp/user (${corpTables.length}): ${corpTables.map(t => t.T).join(', ')}`);

	// 6) PASSENGERPROFILE + PASSENGERACCOUNT de ambos pax.
	for (const id of ids) {
		const prof = await db.query(
			`SELECT id AS "id", passengeruser_id AS "passengerUserId" FROM passengerprofile WHERE id = :id OR passengeruser_id = :id`,
			{ id }
		);
		const acc = await db.query(
			`SELECT id AS "id", carrieraccount_id AS "carrier", passenger_id AS "passengerId", deleted AS "deleted",
			        idforcarrier AS "idForCarrier", external_id AS "externalId", account_id AS "accountId"
			   FROM passengeraccount WHERE passenger_id = :id ORDER BY id`,
			{ id }
		);
		log(`pax ${id} → passengerprofile=${JSON.stringify(prof)} · passengeraccount=${JSON.stringify(acc)}`);
	}

	// 7) Buscar cualquier tabla con columna PLACE_ID (para ver de dónde puede salir el placeId raíz).
	const placeCols = await db.query<{ T: string; C: string }>(
		`SELECT table_name AS "T", column_name AS "C" FROM all_tab_columns
		  WHERE owner = UPPER(:owner) AND column_name LIKE '%PLACE%' ORDER BY table_name`,
		{ owner: cfg.user }
	);
	log(`columnas PLACE_* (${placeCols.length}): ${placeCols.map(c => `${c.T}.${c.C}`).join(', ')}`);

	// 8) Vínculo corporativo del pax (CONTRACTOR_EMPLOYEE) — quién es la "compañía".
	const ceCols = await db.query<{ C: string }>(
		`SELECT column_name AS "C" FROM all_tab_columns WHERE owner = UPPER(:owner) AND table_name = 'CONTRACTOR_EMPLOYEE' ORDER BY column_id`,
		{ owner: cfg.user }
	);
	log(`CONTRACTOR_EMPLOYEE cols: ${ceCols.map(c => c.C).join(', ')}`);

	for (const id of ids) {
		const ce = await db
			.query(`SELECT * FROM contractor_employee WHERE passenger_id = :id`, { id })
			.catch((e: unknown) => [{ err: e instanceof Error ? e.message.slice(0, 160) : String(e) }]);
		log(`contractor_employee de passenger_id=${id}: ${JSON.stringify(ce)}`);
	}

	// 9) Cards actuales del pax (efecto físico del alta) — user_wallet + card por user_id.
	for (const r of [...byId, ...byEmail]) {
		const row = r as Record<string, unknown>;
		const cards = await db
			.query(
				`SELECT c.id AS "cardId", c.last_four_digits AS "last4", w.id AS "walletId",
			        w.carrieraccount_id AS "carrier", w.mercadopago_app_id AS "appId"
			   FROM card c JOIN user_wallet w ON c.user_wallet_id = w.id
			  WHERE w.user_id = :paxuser ORDER BY c.id DESC`,
				{ paxuser: Number(row.userId) }
			)
			.catch((e: unknown) => [{ err: e instanceof Error ? e.message.slice(0, 160) : String(e) }]);
		log(`cards de user_id=${row.userId} (${row.email}) → ${JSON.stringify(cards)}`);
	}
}

main()
	.then(() => log('done'))
	.catch((e: unknown) => {
		console.error(`[mg626-db] ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	});
