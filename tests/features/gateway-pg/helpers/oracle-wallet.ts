/**
 * Helper READ-ONLY para verificar el EFECTO de la desvinculación de pasarela / cleaning wallets
 * (POST vendor/cleaningWallets — área G, ATR MG-515) — cierra la brecha de la capa API, que
 * solo valida el contrato HTTP (200/404/400), no el borrado físico ni el estado del link.
 *
 * Delega en el componente KATA `tests/components/db/OracleDb` (oracledb THIN, read-only,
 * guard SELECT-only), igual que `oracle-service-usage.ts`.
 *
 * ⚠ NOMBRES DE TABLA/COLUMNA (confirmados contra el esquema real magiis-uat-v6, que la trifuerza
 *   reusa estructuralmente en magiis-test-v2):
 *   - USER_WALLET.CARRIERACCOUNT_ID  (SIN guion) · MERCADOPAGO_APP_ID · USER_ID
 *   - CARD.USER_WALLET_ID (FK) · LAST_FOUR_DIGITS · MERCADOPAGO_APP_ID
 *   - MGW_LINKED.CARRIER_ACCOUNT_ID (CON guion) · PROVIDER · ACTIVE · DELETE_DATE
 *     → NO existe columna STATUS en el esquema observado. El estado CLEANING_WALLETS→UNLINKED
 *       descrito por backend NO es una columna física acá: la desvinculación se infiere de
 *       ACTIVE=0 y/o DELETE_DATE seteado. Si TEST tuviera STATUS, sobreescribir con
 *       `ORACLE_WALLET_MGW_SQL` (incluir alias "status"). [confirmar en TEST]
 *
 * Toda la tabla / SQL es overridable por env para ajustar identificadores sin tocar código:
 *   ORACLE_WALLET_TABLE   (default USER_WALLET)
 *   ORACLE_WALLET_SQL     (query de count de wallets; binds :carrierId, :appId)
 *   ORACLE_CARD_TABLE     (default CARD)
 *   ORACLE_CARD_SQL       (query de count de cards; binds :carrierId, :appId)
 *   ORACLE_WALLET_MGW_SQL (query de estado del link; bind :carrierId, :provider)
 */

import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';
import type { OracleReadConfig } from '../../../components/db/OracleDb';

// Re-export para backward-compat con el patrón de las specs (mismo estilo que oracle-service-usage).
export { oracleConfigFromEnv };
export type { OracleReadConfig };

export interface MgwLinkRow {
	id: number;
	provider: string;
	/** 1 = vinculado activo; 0 / null = desvinculado. */
	active: number | null;
	/** Fecha de baja; no-null tras cleaning. */
	deleteDate: string | null;
	/** Sólo presente si el esquema/override expone STATUS (no es columna física en el esquema base). */
	status?: string | null;
}

export interface WalletCarrierAppFilter {
	/** carrier_account.id dueño de los wallets (NO el userId admin). */
	carrierAccountId: number | string;
	/** MercadopagoApp.id del provider. */
	appId: number | string;
}

export interface MgwLinkFilter {
	carrierAccountId: number | string;
	provider: string;
}

/** Count de user_wallet del carrier bajo un appId. Read-only. */
export async function countWalletsByCarrierAndApp(cfg: OracleReadConfig, filter: WalletCarrierAppFilter): Promise<number> {
	const table = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const sql =
		process.env.ORACLE_WALLET_SQL ??
		`SELECT COUNT(*) AS "cnt" FROM ${table} WHERE carrieraccount_id = :carrierId AND mercadopago_app_id = :appId`;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, { carrierId: filter.carrierAccountId, appId: filter.appId });
	return Number(rows[0]?.cnt ?? 0);
}

/** Count de cards del carrier bajo un appId (JOIN card → user_wallet). Read-only. */
export async function countCardsByCarrierAndApp(cfg: OracleReadConfig, filter: WalletCarrierAppFilter): Promise<number> {
	const cardTable = process.env.ORACLE_CARD_TABLE ?? 'CARD';
	const walletTable = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const sql =
		process.env.ORACLE_CARD_SQL ??
		`SELECT COUNT(*) AS "cnt" FROM ${cardTable} c JOIN ${walletTable} w ON c.user_wallet_id = w.id
		  WHERE w.carrieraccount_id = :carrierId AND w.mercadopago_app_id = :appId`;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, { carrierId: filter.carrierAccountId, appId: filter.appId });
	return Number(rows[0]?.cnt ?? 0);
}

/** Lee las filas de mgw_linked del carrier para un provider (ordenadas por id desc). Read-only. */
export async function readMgwLinkStatus(cfg: OracleReadConfig, filter: MgwLinkFilter): Promise<MgwLinkRow[]> {
	const sql =
		process.env.ORACLE_WALLET_MGW_SQL ??
		`SELECT id AS "id", provider AS "provider", active AS "active", delete_date AS "deleteDate"
		   FROM mgw_linked
		  WHERE carrier_account_id = :carrierId AND provider = :provider
		  ORDER BY id DESC`;
	const rows = await new OracleDb(cfg).query<Record<string, unknown>>(sql, { carrierId: filter.carrierAccountId, provider: filter.provider });
	return rows.map(r => ({
		id: Number(r.id ?? 0),
		provider: String(r.provider ?? ''),
		active: r.active != null ? Number(r.active) : null,
		deleteDate: r.deleteDate != null ? String(r.deleteDate) : null,
		status: r.status != null ? String(r.status) : undefined
	}));
}
