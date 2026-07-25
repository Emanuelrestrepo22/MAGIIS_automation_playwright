/**
 * Helper READ-ONLY para leer los contadores de uso de cupo (ContractorEmployeeServiceTypeUsage)
 * y verificar el EFECTO del reset countsReset (MX-6057) — cierra la brecha de la capa API, que
 * solo valida el contrato HTTP (200/true), no el reseteo real.
 *
 * NOTA DE ARQUITECTURA: la conexión oracledb (THIN, read-only, guard SELECT-only) vive ahora en
 * el componente KATA `tests/components/db/OracleDb`. Este helper delega ahí pero MANTIENE su API
 * pública intacta (`OracleReadConfig`, `oracleConfigFromEnv`, `ServiceUsageRow`,
 * `readServiceUsageByEmployee`) para no romper las specs que ya lo importan.
 *
 * Confirmar nombres reales de tabla/columnas contra el esquema UAT (ver ATP MX-6115 / ticket MX-6057):
 *   ORACLE_USAGE_TABLE  (default CONTRACTOR_EMPLOYEE_SERVICE_TYPE_USAGE)
 *   ORACLE_USAGE_SQL    (opcional — query completa que sobreescribe la default; bind :empId)
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';
import type { OracleReadConfig } from '../../../components/db/OracleDb';

// Re-export para backward-compat: las specs siguen importando estos símbolos desde este módulo.
export { oracleConfigFromEnv };
export type { OracleReadConfig };

export interface ServiceUsageRow {
	tripsPending: number;
	tripsDone: number;
	resetUserId: number | null;
	resetDate: string | null;
	extraLimit: number | null;
}

/**
 * Lee las filas de uso de un colaborador (por contractorEmployeeId). Read-only, cierra la conexión.
 * La tabla y (opcionalmente) la query se resuelven por env para poder ajustar los identificadores
 * reales del esquema sin tocar código.
 */
export async function readServiceUsageByEmployee(
	cfg: OracleReadConfig,
	contractorEmployeeId: number
): Promise<ServiceUsageRow[]> {
	const table = process.env.ORACLE_USAGE_TABLE ?? 'CONTRACTOR_EMPLOYEE_SERVICE_TYPE_USAGE';
	const sql =
		process.env.ORACLE_USAGE_SQL ??
		`SELECT trips_pending AS "tripsPending", trips_done AS "tripsDone",
		        reset_user_id AS "resetUserId", reset_date AS "resetDate", extra_limit AS "extraLimit"
		   FROM ${table}
		  WHERE employee_id = :empId`;

	const rows = await new OracleDb(cfg).query<ServiceUsageRow>(sql, { empId: contractorEmployeeId });
	return rows.map(r => ({
		tripsPending: Number(r.tripsPending ?? 0),
		tripsDone: Number(r.tripsDone ?? 0),
		resetUserId: r.resetUserId != null ? Number(r.resetUserId) : null,
		resetDate: r.resetDate != null ? String(r.resetDate) : null,
		extraLimit: r.extraLimit != null ? Number(r.extraLimit) : null
	}));
}
