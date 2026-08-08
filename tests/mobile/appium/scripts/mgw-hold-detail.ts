/**
 * Detalle de holds REQUIRES_ACTION del pax (v2.5.19 Stripe): CARD_HOLDS (INTENT_ID/CLIENT_SECRET/
 * STATUS) + MGW_TRANSACTIONS con los CLOB de respuesta Stripe (status/next_action/3DS) para entender
 * por qué el 4242 (no-3DS) queda en requires_action. READ-ONLY.
 */
import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[hold-detail] ${m}`);
const TRAVELS = (process.env.MG_TRAVELS ?? '68233,68234,68235').split(',').map(s => s.trim());

async function run(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) { log('sin cfg'); process.exit(1); }
	const db = new OracleDb(cfg);
	const inList = TRAVELS.map((_, i) => `:t${i}`).join(',');
	const binds: Record<string, unknown> = {};
	TRAVELS.forEach((t, i) => { binds[`t${i}`] = t; });

	const holds = await db.query<Record<string, unknown>>(
		`SELECT ID AS "id", TRAVEL_ID AS "travel", PROVIDER_CODE AS "prov", STATUS AS "status",
		        AMOUNT_HOLD AS "amount", INTENT_ID AS "intentId",
		        DBMS_LOB.SUBSTR(CLIENT_SECRET,60,1) AS "clientSecret"
		   FROM MAGIIS.CARD_HOLDS WHERE TRAVEL_ID IN (${inList}) ORDER BY ID DESC`, binds
	).catch((e: unknown) => { log(`err holds: ${e instanceof Error ? e.message : String(e)}`); return []; });
	log(`CARD_HOLDS:`); for (const r of holds) log(JSON.stringify(r));

	const tx = await db.query<Record<string, unknown>>(
		`SELECT ID AS "id", TRANSACTION_REF AS "ref", TRANSACTION_TYPE AS "type", STATUS AS "status",
		        PAYMENT_PROVIDER AS "prov", AMOUNT AS "amount",
		        DBMS_LOB.SUBSTR(PROVIDER_STATUS,400,1) AS "provStatus",
		        DBMS_LOB.SUBSTR(REQUEST_RESPONSE,600,1) AS "reqResp",
		        DBMS_LOB.SUBSTR(CONFIRM_RESPONSE,600,1) AS "confResp"
		   FROM MAGIIS.MGW_TRANSACTIONS WHERE TRANSACTION_REF IN (${inList}) ORDER BY ID DESC`, binds
	).catch((e: unknown) => { log(`err tx: ${e instanceof Error ? e.message : String(e)}`); return []; });
	log(`MGW_TRANSACTIONS:`); for (const r of tx) log(JSON.stringify(r));
}

run().catch((e: unknown) => { console.error(`[hold-detail] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
