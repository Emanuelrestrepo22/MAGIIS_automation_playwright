/**
 * Helper READ-ONLY para verificar el CICLO DE VIDA DEL HOLD de un viaje (trifuerza · capa DB).
 * Oráculo real: MAGIIS.CARD_HOLDS (estado estructurado del hold) + MAGIIS.TRAVEL (viaje).
 *
 * NO usar MGW.logs: esa tabla vive en la DB propia del microservicio gateway (MySQL) y es
 * inaccesible desde la red local; CARD_HOLDS es el equivalente Oracle y expone el estado
 * estructurado del hold, no un log crudo.
 *
 * Regla de negocio validada (viajes PROGRAMADOS con hold):
 *   1. Al programar un viaje se hace un HOLD ~2h antes de la hora del viaje (dinero reservado).
 *   2. Si el viaje se CANCELA → el hold pasa a RELEASE (dinero devuelto al cliente).
 *   3. Si el viaje se COMPLETA → el hold pasa a CAPTURE (dinero cobrado).
 *
 * CARD_HOLDS.STATUS observado: HOLD (reservado) · RELEASE (devuelto) · CAPTURE (cobrado).
 * TRAVEL: ISPROGRAMMED (1=programado) · TRAVEL_DATE (hora del viaje) · CANCELEDBY (quién canceló)
 *   · STATE (código de estado del viaje; observado 6=completado · 7=cancelado · 9=programado pendiente).
 *
 * Delega en el componente KATA `tests/components/db/OracleDb` (oracledb THIN, read-only,
 * guard SELECT-only), igual que `oracle-wallet.ts` / `oracle-service-usage.ts`.
 *
 * Todo el SQL es overridable por env para ajustar identificadores sin tocar código:
 *   ORACLE_HOLD_TABLE          (default CARD_HOLDS)
 *   ORACLE_TRAVEL_TABLE        (default TRAVEL)
 *   ORACLE_HOLD_BY_TRAVEL_SQL  (query del hold de un viaje; bind :travelId)
 *   ORACLE_HOLD_LEAK_SQL       (query de cancelados con hold no devuelto; bind :limit)
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';
import type { OracleReadConfig } from '../../../components/db/OracleDb';

// Re-export para el mismo patrón que oracle-wallet / oracle-service-usage.
export { oracleConfigFromEnv };
export type { OracleReadConfig };

/** Estados posibles de CARD_HOLDS.STATUS (observados en magiis-test-v2). */
export const HOLD_STATUS = {
	/** Fondos reservados; viaje pendiente. */
	HOLD: 'HOLD',
	/** Hold liberado → dinero devuelto al cliente (viaje cancelado). */
	RELEASE: 'RELEASE',
	/** Hold capturado → dinero cobrado (viaje completado). */
	CAPTURE: 'CAPTURE'
} as const;

export type HoldStatus = (typeof HOLD_STATUS)[keyof typeof HOLD_STATUS];

/** Fila del hold de un viaje con el contexto del viaje (join CARD_HOLDS + TRAVEL). */
export interface TripHoldRow {
	holdId: number;
	travelId: number;
	provider: string;
	amountHold: number;
	/** HOLD | RELEASE | CAPTURE. */
	holdStatus: string;
	/** Fecha de creación del hold, 'YYYY-MM-DD HH24:MI'. */
	holdCreatedAt: string | null;
	/** Hora programada del viaje (TRAVEL_DATE), 'YYYY-MM-DD HH24:MI'. */
	tripDate: string | null;
	/** TRAVEL.STATE crudo (6=completado · 7=cancelado · 9=programado pendiente, observado). */
	tripState: number | null;
	/** true si el viaje es programado (ISPROGRAMMED=1). */
	isProgrammed: boolean;
	/** Horas entre la creación del hold y la hora del viaje (≈2 en programados). null si falta fecha. */
	hoursBeforeTrip: number | null;
	/** Quién canceló el viaje (p.ej. 'CARRIER'); null si no fue cancelado. */
	canceledBy: string | null;
}

/** Viaje cancelado cuyo hold NO fue devuelto (violación de la regla: dinero no retornado). */
export interface UnreleasedHoldRow {
	holdId: number;
	travelId: number;
	amountHold: number;
	holdStatus: string;
	tripState: number | null;
	canceledBy: string | null;
}

function toTripHoldRow(r: Record<string, unknown>): TripHoldRow {
	return {
		holdId: Number(r.holdId ?? 0),
		travelId: Number(r.travelId ?? 0),
		provider: String(r.provider ?? ''),
		amountHold: Number(r.amountHold ?? 0),
		holdStatus: String(r.holdStatus ?? ''),
		holdCreatedAt: r.holdCreatedAt != null ? String(r.holdCreatedAt) : null,
		tripDate: r.tripDate != null ? String(r.tripDate) : null,
		tripState: r.tripState != null ? Number(r.tripState) : null,
		isProgrammed: Number(r.isProgrammed ?? 0) === 1,
		hoursBeforeTrip: r.hoursBeforeTrip != null ? Number(r.hoursBeforeTrip) : null,
		canceledBy: r.canceledBy != null ? String(r.canceledBy) : null
	};
}

/**
 * Lee el/los hold(s) de un viaje con su contexto (estado del hold, timing hold→viaje, cancelación).
 * Read-only. Usar para aseverar en un spec el ciclo por viaje:
 *   - tras programar  → holdStatus === 'HOLD'  y  hoursBeforeTrip ≈ 2
 *   - tras cancelar   → holdStatus === 'RELEASE'  (dinero devuelto)
 *   - tras completar  → holdStatus === 'CAPTURE'  (dinero cobrado)
 */
export async function readTripHold(cfg: OracleReadConfig, travelId: number | string): Promise<TripHoldRow[]> {
	const holdTable = process.env.ORACLE_HOLD_TABLE ?? 'CARD_HOLDS';
	const travelTable = process.env.ORACLE_TRAVEL_TABLE ?? 'TRAVEL';
	const sql =
		process.env.ORACLE_HOLD_BY_TRAVEL_SQL ??
		`SELECT h.ID AS "holdId", h.TRAVEL_ID AS "travelId", h.PROVIDER_CODE AS "provider",
		        h.AMOUNT_HOLD AS "amountHold", h.STATUS AS "holdStatus",
		        TO_CHAR(h.CREATION_DATE,'YYYY-MM-DD HH24:MI') AS "holdCreatedAt",
		        TO_CHAR(t.TRAVEL_DATE,'YYYY-MM-DD HH24:MI') AS "tripDate",
		        t.STATE AS "tripState", t.ISPROGRAMMED AS "isProgrammed",
		        ROUND((CAST(t.TRAVEL_DATE AS DATE) - CAST(h.CREATION_DATE AS DATE)) * 24, 2) AS "hoursBeforeTrip",
		        t.CANCELEDBY AS "canceledBy"
		   FROM ${holdTable} h JOIN ${travelTable} t ON t.ID = h.TRAVEL_ID
		  WHERE h.TRAVEL_ID = :travelId
		  ORDER BY h.ID DESC`;
	const rows = await new OracleDb(cfg).query<Record<string, unknown>>(sql, { travelId });
	return rows.map(toTripHoldRow);
}

/**
 * Invariante de la regla "cancelado ⇒ dinero devuelto": lista los viajes CANCELADOS
 * (CANCELEDBY no nulo) cuyo hold sigue en STATUS='HOLD' (no fue liberado). Read-only.
 * En un sistema sano esta lista debe estar VACÍA. Cualquier fila = dinero retenido tras
 * cancelar = hallazgo de producto.
 *
 * `settleMinutes` (default 15, override `ORACLE_HOLD_SETTLE_MIN`) excluye holds creados hace
 * menos de N minutos: al cancelar, el RELEASE puede aplicarse de forma asíncrona, así que una
 * cancelación recién hecha podría verse momentáneamente como HOLD sin ser una fuga real.
 */
export async function findCancelledTripsWithUnreleasedHold(
	cfg: OracleReadConfig,
	limit = 50,
	settleMinutes = Number(process.env.ORACLE_HOLD_SETTLE_MIN ?? 15)
): Promise<UnreleasedHoldRow[]> {
	const holdTable = process.env.ORACLE_HOLD_TABLE ?? 'CARD_HOLDS';
	const travelTable = process.env.ORACLE_TRAVEL_TABLE ?? 'TRAVEL';
	const settle = Number.isFinite(settleMinutes) && settleMinutes > 0 ? Math.floor(settleMinutes) : 0;
	const sql =
		process.env.ORACLE_HOLD_LEAK_SQL ??
		`SELECT h.ID AS "holdId", h.TRAVEL_ID AS "travelId", h.AMOUNT_HOLD AS "amountHold",
		        h.STATUS AS "holdStatus", t.STATE AS "tripState", t.CANCELEDBY AS "canceledBy"
		   FROM ${holdTable} h JOIN ${travelTable} t ON t.ID = h.TRAVEL_ID
		  WHERE t.CANCELEDBY IS NOT NULL AND h.STATUS = '${HOLD_STATUS.HOLD}'
		    AND h.CREATION_DATE < (SYSTIMESTAMP - NUMTODSINTERVAL(:settle, 'MINUTE'))
		  ORDER BY h.ID DESC FETCH FIRST :limit ROWS ONLY`;
	const rows = await new OracleDb(cfg).query<Record<string, unknown>>(sql, { settle, limit });
	return rows.map(r => ({
		holdId: Number(r.holdId ?? 0),
		travelId: Number(r.travelId ?? 0),
		amountHold: Number(r.amountHold ?? 0),
		holdStatus: String(r.holdStatus ?? ''),
		tripState: r.tripState != null ? Number(r.tripState) : null,
		canceledBy: r.canceledBy != null ? String(r.canceledBy) : null
	}));
}
