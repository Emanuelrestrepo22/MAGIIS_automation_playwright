/**
 * Fixture `{db}` — capa DB de la trifuerza para specs de gateway-pg.
 *
 * Extiende TestBase (sin modificarlo) y expone `db: OracleDb`. La instancia es LAZY:
 * OracleDb solo se construye (y por ende solo resuelve/valida la config del env) cuando
 * el test destructura `{ db }`. Un spec puro-UI que no lo pida no paga ningún costo ni
 * requiere Oracle configurado. La conexión real recién se abre al llamar a `db.query(...)`.
 *
 * Uso en un spec:
 *   import { test, expect } from '../fixtures/db.fixtures';
 *   test('reset countsReset limpia el uso', async ({ db }) => {
 *     const rows = await db.query('SELECT trips_pending FROM ... WHERE employee_id = :id', { id: 42 });
 *     expect(rows).toHaveLength(0);
 *   });
 */
import { test as base, expect } from '../../../TestBase';
import { OracleDb } from '../../../components/db/OracleDb';

type DbFixtures = {
	db: OracleDb;
};

const test = base.extend<DbFixtures>({
	// LAZY: `new OracleDb()` corre dentro del use, o sea solo si el test destructura {db}.
	// Si el env no está configurado, el constructor hace fail-fast con mensaje claro.
	db: async ({}, use: (db: OracleDb) => Promise<void>) => {
		const db = new OracleDb();
		await use(db);
	}
});

export { test, expect };
