/**
 * Componente DB estilo KATA — capa DB de la trifuerza (UI · API · DB).
 *
 * Encapsula una conexión node-oracledb en modo THIN (JS puro, sin Oracle Instant Client),
 * READ-ONLY por diseño: `query()` rechaza cualquier sentencia que no sea SELECT.
 *
 * `oracledb` se carga con import dinámico para no impactar la colección de tests cuando no
 * hay conexión configurada. La config se resuelve del env vía `oracleConfigFromEnv()`.
 *
 * Env (gitignored):
 *   ORACLE_USER · ORACLE_PASSWORD · ORACLE_CONNECT_STRING  (Easy Connect host:puerto/service)
 *   — o las partes sueltas ORACLE_HOST + ORACLE_PORT + ORACLE_SERVICE.
 *
 * Contrato de errores (KATA):
 *   - Métodos públicos: fail-fast, throw con mensaje claro y accionable.
 *   - Utilidades privadas: silenciosas (no logean, no relanzan salvo el guard).
 */

export interface OracleReadConfig {
	user: string;
	password: string;
	connectString: string;
}

/** Entorno DB activo: `uat` o `test` (default). Alineado con tests/config/runtime.ts. */
function currentDbEnv(): 'uat' | 'test' {
	const raw = (process.env.TEST_ENV ?? process.env.ENV ?? 'test').toLowerCase();
	return raw === 'uat' ? 'uat' : 'test';
}

/**
 * Devuelve la config Oracle desde el env (ENV-AWARE), o null si falta alguna variable
 * (→ los tests skipean). La trifuerza DB se valida en el entorno TEST, por eso:
 *   - ENV/TEST_ENV = uat  → credenciales NO sufijadas (`ORACLE_USER`, ... → magiis-uat-v6).
 *   - ENV/TEST_ENV = test → credenciales sufijadas `*_TEST` (`ORACLE_USER_TEST`, ... → magiis-test-v2).
 * Acepta dos formas de connect string: `ORACLE_CONNECT_STRING[_TEST]` (Easy Connect
 * `host:puerto/service`) o las partes sueltas `ORACLE_HOST[_TEST]` + `ORACLE_PORT[_TEST]` +
 * `ORACLE_SERVICE[_TEST]`. READ-ONLY en ambos entornos.
 */
export function oracleConfigFromEnv(): OracleReadConfig | null {
	const suffix = currentDbEnv() === 'uat' ? '' : '_TEST';
	const user = process.env[`ORACLE_USER${suffix}`];
	const password = process.env[`ORACLE_PASSWORD${suffix}`];
	if (!user || !password) return null;

	const host = process.env[`ORACLE_HOST${suffix}`];
	const port = process.env[`ORACLE_PORT${suffix}`];
	const service = process.env[`ORACLE_SERVICE${suffix}`];
	const connectString =
		process.env[`ORACLE_CONNECT_STRING${suffix}`] ?? (host && port && service ? `${host}:${port}/${service}` : undefined);
	if (!connectString) return null;

	return { user, password, connectString };
}

/** Binds posicionales o nombrados para una query parametrizada. */
export type QueryBinds = Record<string, unknown> | unknown[];

export class OracleDb {
	private readonly config: OracleReadConfig;

	/**
	 * @param config Config de conexión read-only. Si se omite, se resuelve del env.
	 * @throws Si no se pasa config y el env no tiene las variables mínimas (fail-fast).
	 */
	constructor(config?: OracleReadConfig | null) {
		const resolved = config ?? oracleConfigFromEnv();
		if (!resolved) {
			throw new Error(
				'OracleDb: falta configuración de conexión (env-aware). En TEST definí ORACLE_USER_TEST, ' +
					'ORACLE_PASSWORD_TEST y ORACLE_CONNECT_STRING_TEST (o ORACLE_HOST_TEST + ORACLE_PORT_TEST + ' +
					'ORACLE_SERVICE_TEST); en UAT las variables sin sufijo. Ver .env / .env.example.'
			);
		}
		this.config = resolved;
	}

	/**
	 * Ejecuta una query SELECT y devuelve las filas como objetos tipados.
	 * Abre y CIERRA la conexión siempre (aun si la query falla).
	 *
	 * @throws Si la sentencia no es SELECT (guard) o si la ejecución falla.
	 */
	async query<T = Record<string, unknown>>(sql: string, binds: QueryBinds = {}): Promise<T[]> {
		this.assertSelectOnly(sql);
		const oracledb = await this.loadDriver();
		const connection = await oracledb.getConnection(this.config);
		try {
			const result = await connection.execute<T>(sql, binds as never, { outFormat: oracledb.OUT_FORMAT_OBJECT });
			return result.rows ?? [];
		} catch (err) {
			throw new Error(`OracleDb.query falló: ${(err as Error).message}\nSQL: ${sql}`);
		} finally {
			await this.safeClose(connection);
		}
	}

	/**
	 * Data quality: verifica integridad referencial. Ejecuta una query que debe devolver las filas
	 * "huérfanas" (hijas sin padre). Falla si hay al menos una.
	 *
	 * @param orphanSql SELECT que devuelve SOLO las filas huérfanas.
	 * @param binds Binds opcionales para la query.
	 * @param label Etiqueta legible para el mensaje de error (ej. 'trips sin driver').
	 * @throws Si la query devuelve filas (existen huérfanos).
	 */
	async expectNoOrphans(orphanSql: string, binds: QueryBinds = {}, label = 'registros'): Promise<void> {
		const rows = await this.query(orphanSql, binds);
		if (rows.length > 0) {
			throw new Error(
				`OracleDb.expectNoOrphans: se encontraron ${rows.length} ${label} huérfanos.\n` +
					`Primera fila: ${JSON.stringify(rows[0])}`
			);
		}
	}

	/**
	 * Data quality: verifica que dos totales coincidan (ej. suma de detalle vs cabecera).
	 * Cada query debe devolver una única fila con una única columna numérica (o se toma la primera).
	 *
	 * @param leftSql SELECT que devuelve el total esperado.
	 * @param rightSql SELECT que devuelve el total real.
	 * @param binds Binds compartidos por ambas queries.
	 * @param label Etiqueta legible para el mensaje de error.
	 * @throws Si los totales difieren.
	 */
	async expectConsistentTotals(leftSql: string, rightSql: string, binds: QueryBinds = {}, label = 'totales'): Promise<void> {
		const left = this.firstScalar(await this.query(leftSql, binds));
		const right = this.firstScalar(await this.query(rightSql, binds));
		if (left !== right) {
			throw new Error(`OracleDb.expectConsistentTotals: ${label} inconsistentes. Esperado=${left} · Real=${right}.`);
		}
	}

	/**
	 * Data quality: verifica que ninguna de las columnas indicadas tenga NULL en el resultado.
	 *
	 * @param sql SELECT que devuelve las filas a inspeccionar.
	 * @param columns Nombres de columna (tal como salen en el objeto, respetando case) que no deben ser NULL.
	 * @param binds Binds opcionales para la query.
	 * @throws Si alguna fila tiene NULL en alguna de las columnas indicadas.
	 */
	async expectNoNulls(sql: string, columns: string[], binds: QueryBinds = {}): Promise<void> {
		const rows = await this.query<Record<string, unknown>>(sql, binds);
		for (const [i, row] of rows.entries()) {
			const nullCols = columns.filter(col => row[col] === null || row[col] === undefined);
			if (nullCols.length > 0) {
				throw new Error(
					`OracleDb.expectNoNulls: fila ${i} tiene NULL en [${nullCols.join(', ')}].\n` +
						`Fila: ${JSON.stringify(row)}`
				);
			}
		}
	}

	/** Guard SELECT-only: rechaza cualquier sentencia que no empiece con SELECT (tras trim, case-insensitive). */
	private assertSelectOnly(sql: string): void {
		if (!/^select\b/i.test(sql.trim())) {
			throw new Error(`OracleDb es READ-ONLY: solo se permiten sentencias SELECT. Recibido: ${sql.trim().slice(0, 60)}…`);
		}
	}

	/** Carga perezosa del driver oracledb (import dinámico, THIN por defecto). */
	private async loadDriver() {
		return (await import('oracledb')).default;
	}

	/** Cierre silencioso de la conexión: nunca enmascara el error original de la query. */
	private async safeClose(connection: { close: () => Promise<void> }): Promise<void> {
		try {
			await connection.close();
		} catch {
			/* noop: la conexión pudo cerrarse sola o el pool la recicla */
		}
	}

	/** Toma el primer valor escalar de la primera fila de un resultset. */
	private firstScalar(rows: Array<Record<string, unknown>>): number | null {
		const first = rows[0];
		if (!first) return null;
		const value = Object.values(first)[0];
		return value != null ? Number(value) : null;
	}
}
