/**
 * KATA Architecture — Layer 4: DB Fixture (trifuerza · capa DB).
 *
 * Fixture standalone que expone `{ db }` para specs de integración/validación DB.
 * LAZY: `OracleDb` solo se construye si el test destructura `{ db }`; un spec puro-UI
 * no paga costo ni requiere Oracle configurado. La conexión real recién se abre al
 * llamar a `db.query(...)`.
 *
 * Selección de credenciales ENV-AWARE la resuelve `OracleDb`/`oracleConfigFromEnv`
 * (ver tests/components/db/OracleDb.ts): en `test` usa `ORACLE_*_TEST` (magiis-test-v2),
 * en `uat` las no sufijadas (magiis-uat-v6). READ-ONLY (guard SELECT-only) en ambos.
 *
 * Uso:
 *   import { test, expect } from '@DbFixture';
 *   test('reset limpia contadores', async ({ db }) => {
 *     const rows = await db.query('SELECT ... WHERE id = :id', { id: 42 });
 *     expect(rows).toHaveLength(0);
 *   });
 */

import { test as base, expect } from '@playwright/test';

import { OracleDb } from '@db/OracleDb';

export type DbFixtures = {
	db: OracleDb;
};

export const test = base.extend<DbFixtures>({
	// LAZY: new OracleDb() corre dentro del use — solo si el test destructura {db}.
	// Si el env no está configurado, el constructor hace fail-fast con mensaje claro.
	// eslint-disable-next-line no-empty-pattern
	db: async ({}, use) => {
		await use(new OracleDb());
	}
});

export { expect };
