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
 *   - MGW_LINKED.CARRIER_ACCOUNT_ID (CON guion) · PROVIDER · ACTIVE · DELETE_DATE · STATUS
 *     → CORRECCIÓN (verificado en TEST via MCP, 2026-07-30): la columna STATUS SÍ existe.
 *       Valores observados: NULL en la fila activa, 'UNLINKED' tras desvincular (fila 164,
 *       AUTHORIZE). La desvinculación se acredita por ACTIVE=0 + DELETE_DATE seteado +
 *       STATUS='UNLINKED'; el SQL default no la proyecta aún para no romper overrides.
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

export interface PassengerCardFilter {
	/** user_wallet.user_id dueño del wallet (el passengerUserId del pax). */
	passengerUserId: number | string;
	/** Opcional: restringe el count a las cards con estos últimos 4 dígitos. */
	last4?: string;
}

export interface MgwTransactionsByRefFilter {
	/** transaction_ref (clave de negocio que ata los intentos de cobro del MISMO viaje). */
	transactionRef: string;
	/** Estados que cuentan como "cobro efectivo". Default ['APPROVED','CONFIRM']. */
	statuses?: string[];
}

/** Count de user_wallet del carrier bajo un appId. Read-only. */
export async function countWalletsByCarrierAndApp(
	cfg: OracleReadConfig,
	filter: WalletCarrierAppFilter
): Promise<number> {
	const table = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const sql =
		process.env.ORACLE_WALLET_SQL ??
		`SELECT COUNT(*) AS "cnt" FROM ${table} WHERE carrieraccount_id = :carrierId AND mercadopago_app_id = :appId`;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, {
		carrierId: filter.carrierAccountId,
		appId: filter.appId
	});
	return Number(rows[0]?.cnt ?? 0);
}

/** Count de cards del carrier bajo un appId (JOIN card → user_wallet). Read-only. */
export async function countCardsByCarrierAndApp(
	cfg: OracleReadConfig,
	filter: WalletCarrierAppFilter
): Promise<number> {
	const cardTable = process.env.ORACLE_CARD_TABLE ?? 'CARD';
	const walletTable = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const sql =
		process.env.ORACLE_CARD_SQL ??
		`SELECT COUNT(*) AS "cnt" FROM ${cardTable} c JOIN ${walletTable} w ON c.user_wallet_id = w.id
		  WHERE w.carrieraccount_id = :carrierId AND w.mercadopago_app_id = :appId`;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, {
		carrierId: filter.carrierAccountId,
		appId: filter.appId
	});
	return Number(rows[0]?.cnt ?? 0);
}

/**
 * Count de cards de un pasajero (JOIN card → user_wallet por user_id). Read-only.
 * Opcionalmente filtra por last4. Cierra la brecha de la capa UI del borrado de tarjeta:
 * la UI confirma que la card desaparece del wallet; este count confirma el efecto físico en DB.
 *
 * Overridable por env (mismo patrón que las otras fns):
 *   ORACLE_CARD_TABLE        (default CARD)
 *   ORACLE_WALLET_TABLE      (default USER_WALLET)
 *   ORACLE_CARD_BY_PAX_SQL   (query completa; binds :pax [y :last4] — debe alias "cnt")
 */
/**
 * ⚠️ TRAMPA DE ESPACIO DE IDs (verificado en vivo 2026-07-29, carrier 1521):
 * `passengerUserId` acá es el **USER_ID de plataforma** (`USER_WALLET.USER_ID`), que NO es el
 * `passengerUserId` que devuelve la API del carrier (`GET /passengers/carrier/{id}?lastName=`).
 * Medición: la API devolvió pax 8669 para `emanuel.restrepo@yopmail.com`; su wallet real es
 * id 3383 con `USER_ID = 12055`. Alimentar esta fn con el id de la API devuelve **0 en silencio**
 * — un falso "no hay tarjetas" que parece un fallo de persistencia y no lo es.
 * Si tenés el id de la API, NO uses esta fn: usá `countCardsByCarrierAndLast4`.
 */
export async function countCardsByPassenger(cfg: OracleReadConfig, filter: PassengerCardFilter): Promise<number> {
	const cardTable = process.env.ORACLE_CARD_TABLE ?? 'CARD';
	const walletTable = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const filterByLast4 = filter.last4 != null && filter.last4 !== '';
	const defaultSql =
		`SELECT COUNT(*) AS "cnt" FROM ${cardTable} c JOIN ${walletTable} w ON c.user_wallet_id = w.id
		  WHERE w.user_id = :pax` + (filterByLast4 ? ' AND c.last_four_digits = :last4' : '');
	const sql = process.env.ORACLE_CARD_BY_PAX_SQL ?? defaultSql;
	const binds: Record<string, unknown> = { pax: filter.passengerUserId };
	if (filterByLast4) {
		binds.last4 = filter.last4;
	}
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, binds);
	return Number(rows[0]?.cnt ?? 0);
}

/** Filtro por carrier + last4 — no depende del espacio de ids de pasajero. */
export interface CarrierCardLast4Filter {
	/** `USER_WALLET.CARRIERACCOUNT_ID` (el carrier_account.id, ej. 1521). */
	carrierAccountId: number | string;
	/** Últimos 4 dígitos de la tarjeta (ej. '1111'). */
	last4: string;
}

/**
 * Count de cards con un `last4` dado bajo un carrier. Read-only.
 *
 * Es el oráculo DB correcto cuando el id de pasajero disponible viene de la **API del carrier**
 * (`getPassengerId`), porque ese id NO es `USER_WALLET.USER_ID` — ver la advertencia de
 * `countCardsByPassenger`. El join por `CARRIERACCOUNT_ID` evita el problema por completo:
 * confirma la persistencia física de la tarjeta bajo el carrier bajo prueba, que es lo que el
 * área WAL/C necesita acreditar.
 *
 * Overridable por env (mismo patrón que las otras fns):
 *   ORACLE_CARD_TABLE               (default CARD)
 *   ORACLE_WALLET_TABLE             (default USER_WALLET)
 *   ORACLE_CARD_BY_CARRIER_LAST4_SQL (query completa; binds :carrier y :last4 — debe alias "cnt")
 */
export async function countCardsByCarrierAndLast4(
	cfg: OracleReadConfig,
	filter: CarrierCardLast4Filter
): Promise<number> {
	const cardTable = process.env.ORACLE_CARD_TABLE ?? 'CARD';
	const walletTable = process.env.ORACLE_WALLET_TABLE ?? 'USER_WALLET';
	const defaultSql = `SELECT COUNT(*) AS "cnt" FROM ${cardTable} c JOIN ${walletTable} w ON c.user_wallet_id = w.id
		  WHERE w.carrieraccount_id = :carrier AND c.last_four_digits = :last4`;
	const sql = process.env.ORACLE_CARD_BY_CARRIER_LAST4_SQL ?? defaultSql;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, {
		carrier: filter.carrierAccountId,
		last4: filter.last4
	});
	return Number(rows[0]?.cnt ?? 0);
}

/**
 * Count de filas APROBADAS en mgw_transactions para un transaction_ref dado. Read-only.
 * Detector del gap de idempotencia (AC9 · MG-164 / F-02): tras cobrar y RE-cobrar el MISMO
 * viaje, este count debe ser 1 (una sola fila aprobada). Si el backend NO deduplica por
 * Idempotency-Key, aparece una 2ª fila con el mismo transaction_ref → count=2 → el test da
 * ROJO, y ese rojo ES la evidencia del doble cobro.
 *
 * node-oracledb no bindea un array a un `IN (...)` directamente → los estados se expanden a
 * binds nombrados (:st0, :st1, ...). Overridable por env (mismo patrón que las otras fns):
 *   ORACLE_MGWTX_TABLE  (default MGW_TRANSACTIONS)
 *   ORACLE_MGWTX_SQL    (query completa; binds :ref + :st0.. — debe alias "cnt")
 */
/** Fila de MGW_TRANSACTIONS con las columnas que acreditan un cobro (verificadas en TEST, 2026-07-30). */
export type MgwTransactionRow = {
	id: number;
	transactionRef: string;
	amount: number;
	paymentProvider: string;
	status: string;
	transactionType: string;
};

/**
 * Lee las transacciones de un VIAJE, opcionalmente filtradas por pasarela.
 *
 * Hallazgos verificados en vivo (2026-07-30, MCP sobre magiis-test-v2) que esta función
 * capitaliza y que `countMgwTransactionsByRef` no conocía:
 *   1. `TRANSACTION_REF` **es el travelId** (fila 545: ref='67815' = viaje del exploratorio).
 *      No hace falta inyectar el ref por env: la fase web ya lo captura
 *      (`travel-cleanup.captureCreatedTravelId`).
 *   2. `PAYMENT_PROVIDER` existe como columna ('EBIZ' | 'AUTHORIZE' | …) → la identidad de
 *      pasarela de una transacción ES observable en DB, contra lo que decía el doc previo.
 *   3. El estado final difiere por pasarela: eBiz cierra en 'CONFIRM'; Authorize en 'APPROVED'.
 *
 * Oráculo del cobro eBizCharge (trifuerza, capa DB — reemplaza a MGW.logs, que vive en la base
 * del servicio de gateway y NO es alcanzable desde Oracle):
 *   `readMgwTransactionsByTravel(cfg, { travelId, provider: 'EBIZ' })` → 1 fila con
 *   status 'CONFIRM' y el monto cobrado.
 *
 * Oráculo del NO-cobro (viaje NO_AUTORIZADO, STATE=10): **cero filas** — verificado con los
 * viajes 67797/67798/67799/67813.
 */
export async function readMgwTransactionsByTravel(
	cfg: OracleReadConfig,
	filter: { travelId: number | string; provider?: string }
): Promise<MgwTransactionRow[]> {
	const table = process.env.ORACLE_MGWTX_TABLE ?? 'MGW_TRANSACTIONS';
	const providerClause = filter.provider ? ' AND payment_provider = :provider' : '';
	const sql = `SELECT id AS "id", transaction_ref AS "transactionRef", amount AS "amount",
	       payment_provider AS "paymentProvider", status AS "status", transaction_type AS "transactionType"
	  FROM ${table}
	 WHERE transaction_ref = :ref${providerClause}
	 ORDER BY id DESC`;
	const binds: Record<string, unknown> = { ref: String(filter.travelId) };
	if (filter.provider) binds.provider = filter.provider;
	return new OracleDb(cfg).query<MgwTransactionRow>(sql, binds);
}

export async function countMgwTransactionsByRef(
	cfg: OracleReadConfig,
	filter: MgwTransactionsByRefFilter
): Promise<number> {
	const table = process.env.ORACLE_MGWTX_TABLE ?? 'MGW_TRANSACTIONS';
	const statuses = filter.statuses && filter.statuses.length > 0 ? filter.statuses : ['APPROVED', 'CONFIRM'];
	const binds: Record<string, unknown> = { ref: filter.transactionRef };
	const placeholders = statuses.map((status, i) => {
		const key = `st${i}`;
		binds[key] = status;
		return `:${key}`;
	});
	const sql =
		process.env.ORACLE_MGWTX_SQL ??
		`SELECT COUNT(*) AS "cnt" FROM ${table} WHERE transaction_ref = :ref AND status IN (${placeholders.join(', ')})`;
	const rows = await new OracleDb(cfg).query<{ cnt: number }>(sql, binds);
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
	const rows = await new OracleDb(cfg).query<Record<string, unknown>>(sql, {
		carrierId: filter.carrierAccountId,
		provider: filter.provider
	});
	return rows.map(r => ({
		id: Number(r.id ?? 0),
		provider: String(r.provider ?? ''),
		active: r.active != null ? Number(r.active) : null,
		deleteDate: r.deleteDate != null ? String(r.deleteDate) : null,
		status: r.status != null ? String(r.status) : undefined
	}));
}
