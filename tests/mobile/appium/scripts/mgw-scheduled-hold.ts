/**
 * VALIDACIÓN DB — viajes PROGRAMADOS con hold. Regla: el hold se hace ~2h antes del viaje;
 * al cancelar el hold pasa a RELEASE (dinero devuelto al cliente).
 * Oráculo: CARD_HOLDS (STATUS: HOLD→RELEASE/CAPTURE) + TRAVEL (ISPROGRAMMED, TRAVEL_DATE, STATE, cancel).
 * READ-ONLY. Oracle local.
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[sched-hold] ${m}`);

async function run(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) {
		log('❌ sin config Oracle');
		process.exit(1);
	}
	const db = new OracleDb(cfg);

	// Holds recientes con datos del viaje: estado del hold, horas entre hold y viaje, programado, cancelación.
	const rows = await db
		.query<Record<string, unknown>>(
			`SELECT h.ID AS "HOLD", h.TRAVEL_ID AS "TRAVEL", h.STATUS AS "HOLD_ST", h.AMOUNT_HOLD AS "AMT",
		        TO_CHAR(h.CREATION_DATE,'YYYY-MM-DD HH24:MI') AS "HOLD_AT",
		        t.ISPROGRAMMED AS "PROG", t.STATE AS "TRIP_ST",
		        TO_CHAR(t.TRAVEL_DATE,'YYYY-MM-DD HH24:MI') AS "TRIP_AT",
		        ROUND((CAST(t.TRAVEL_DATE AS DATE) - CAST(h.CREATION_DATE AS DATE)) * 24, 2) AS "H_BEFORE",
		        t.CANCELEDBY AS "CANC_BY", TO_CHAR(t.SURRENDERDATE,'YYYY-MM-DD HH24:MI') AS "CANC_AT"
		   FROM MAGIIS.CARD_HOLDS h JOIN MAGIIS.TRAVEL t ON t.ID = h.TRAVEL_ID
		  ORDER BY h.ID DESC FETCH FIRST 15 ROWS ONLY`
		)
		.catch((e: unknown) => {
			log(`err join: ${e instanceof Error ? e.message : String(e)}`);
			return [];
		});
	log(`HOLDS + TRIP (${rows.length}) [HOLD_ST · PROG=1 programado · H_BEFORE=horas hold→viaje · CANC=cancelación]:`);
	for (const r of rows) log(JSON.stringify(r));

	// Foco: viajes PROGRAMADOS con hold — ¿el hold se hace ~2h antes? ¿los cancelados están en RELEASE?
	const prog = await db
		.query<Record<string, unknown>>(
			`SELECT h.STATUS AS "HOLD_ST", COUNT(*) AS "N",
		        ROUND(AVG((CAST(t.TRAVEL_DATE AS DATE) - CAST(h.CREATION_DATE AS DATE)) * 24), 2) AS "AVG_H_BEFORE",
		        ROUND(MIN((CAST(t.TRAVEL_DATE AS DATE) - CAST(h.CREATION_DATE AS DATE)) * 24), 2) AS "MIN_H",
		        ROUND(MAX((CAST(t.TRAVEL_DATE AS DATE) - CAST(h.CREATION_DATE AS DATE)) * 24), 2) AS "MAX_H"
		   FROM MAGIIS.CARD_HOLDS h JOIN MAGIIS.TRAVEL t ON t.ID = h.TRAVEL_ID
		  WHERE t.ISPROGRAMMED = 1
		  GROUP BY h.STATUS ORDER BY 2 DESC`
		)
		.catch((e: unknown) => {
			log(`err prog: ${e instanceof Error ? e.message : String(e)}`);
			return [];
		});
	log(`PROGRAMADOS con hold — por estado del hold (horas hold→viaje):`);
	for (const r of prog) log(JSON.stringify(r));

	// ¿Algún viaje CANCELADO cuyo hold NO haya sido devuelto? (violación de la regla → dinero no devuelto)
	const leak = await db
		.query<Record<string, unknown>>(
			`SELECT h.ID AS "HOLD", h.TRAVEL_ID AS "TRAVEL", h.STATUS AS "HOLD_ST", h.AMOUNT_HOLD AS "AMT",
		        t.STATE AS "TRIP_ST", t.CANCELEDBY AS "CANC_BY"
		   FROM MAGIIS.CARD_HOLDS h JOIN MAGIIS.TRAVEL t ON t.ID = h.TRAVEL_ID
		  WHERE t.CANCELEDBY IS NOT NULL AND h.STATUS = 'HOLD'
		  ORDER BY h.ID DESC FETCH FIRST 10 ROWS ONLY`
		)
		.catch(() => []);
	log(`⚠️ Cancelados con hold NO devuelto (STATUS aún HOLD) — deberían ser 0: ${leak.length}`);
	for (const r of leak) log(JSON.stringify(r));
}

run().catch((e: unknown) => {
	console.error(`[sched-hold] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
