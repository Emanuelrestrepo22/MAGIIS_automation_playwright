/**
 * EXPLORADOR DB — HOLD/refund de viajes (Oracle). Valida: viaje programado → hold ~2h antes;
 * al cancelar → devolución (void/refund). Oráculos: CARD_HOLDS (holds) + MGW_TRANSACTIONS (tx gateway).
 * READ-ONLY. Oracle local (bypasea el MCP DB caído). CLOBs vía DBMS_LOB.SUBSTR, fechas vía TO_CHAR.
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[mgw-db] ${m}`);
const DT = (c: string) => `TO_CHAR(${c},'YYYY-MM-DD HH24:MI:SS')`;

async function run(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) { log('❌ sin config Oracle'); process.exit(1); }
	log(`conectado: ${cfg.connectString} (${cfg.user})`);
	const db = new OracleDb(cfg);

	// ── CARD_HOLDS: estructura + recientes ──────────────────────────────────
	const chCols = await db.query<{ col: string; type: string }>(
		`SELECT column_name AS "col", data_type AS "type" FROM all_tab_columns WHERE owner='MAGIIS' AND table_name='CARD_HOLDS' ORDER BY column_id`
	).catch(() => []);
	log(`CARD_HOLDS cols (${chCols.length}): ${chCols.map(c => `${c.col}:${c.type}`).join(', ')}`);

	// Recientes: solo columnas NO-CLOB (las detecto del describe) + fechas formateadas.
	const chScalar = chCols.filter(c => !['CLOB', 'BLOB', 'NCLOB'].includes(c.type));
	const chSelect = chScalar.map(c => (['DATE', 'TIMESTAMP(6)', 'TIMESTAMP'].includes(c.type) ? `${DT(c.col)} AS "${c.col}"` : `${c.col} AS "${c.col}"`)).join(', ');
	if (chSelect) {
		const chRows = await db.query<Record<string, unknown>>(`SELECT ${chSelect} FROM MAGIIS.CARD_HOLDS ORDER BY ID DESC FETCH FIRST 8 ROWS ONLY`).catch((e: unknown) => { log(`err CARD_HOLDS: ${e instanceof Error ? e.message : String(e)}`); return []; });
		log(`RECENT CARD_HOLDS (${chRows.length}):`);
		for (const r of chRows) log(JSON.stringify(r));
	}

	// ── MGW_TRANSACTIONS: tipos/estados + recientes (sin CLOB crudo) ─────────
	const kinds = await db.query<{ TYPE: string; STATUS: string; CNT: number }>(
		`SELECT transaction_type AS "TYPE", status AS "STATUS", COUNT(*) AS "CNT" FROM MAGIIS.MGW_TRANSACTIONS GROUP BY transaction_type, status ORDER BY 3 DESC FETCH FIRST 20 ROWS ONLY`
	).catch(() => []);
	log(`MGW_TX tipos×estados: ${kinds.map(k => `${k.TYPE}/${k.STATUS}=${k.CNT}`).join(' · ')}`);

	const tx = await db.query<Record<string, unknown>>(
		`SELECT ID AS "ID", TRANSACTION_REF AS "REF", TRANSACTION_TYPE AS "TYPE", STATUS AS "STATUS", AMOUNT AS "AMOUNT",
		        PAYMENT_PROVIDER AS "PROV", ${DT('REQUEST_DATE')} AS "REQ", ${DT('APPROVED_DATE')} AS "APPROVED",
		        ${DT('CANCEL_DATE')} AS "CANCEL", ${DT('CONFIRM_DATE')} AS "CONFIRM",
		        DBMS_LOB.SUBSTR(PROVIDER_STATUS, 90, 1) AS "PSTATUS"
		   FROM MAGIIS.MGW_TRANSACTIONS ORDER BY ID DESC FETCH FIRST 12 ROWS ONLY`
	).catch((e: unknown) => { log(`err MGW_TX: ${e instanceof Error ? e.message : String(e)}`); return []; });
	log(`RECENT MGW_TRANSACTIONS (${tx.length}):`);
	for (const r of tx) log(JSON.stringify(r));
}

run().catch((e: unknown) => { console.error(`[mgw-db] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
