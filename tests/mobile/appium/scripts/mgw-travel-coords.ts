/**
 * Devuelve las coordenadas de origen (pickup) de un viaje TRAVEL para mockear el GPS del driver.
 * READ-ONLY. Uso: MG_TRAVEL_ID=67971 node --loader ts-node/esm -r dotenv/config <este archivo>
 */
import { OracleDb, oracleConfigFromEnv } from '../../../components/db/OracleDb';

const log = (m: string): void => console.log(`[coords] ${m}`);
const TID = process.env.MG_TRAVEL_ID ?? '67971';

async function run(): Promise<void> {
	const cfg = oracleConfigFromEnv();
	if (!cfg) {
		log('sin config Oracle');
		process.exit(1);
	}
	const db = new OracleDb(cfg);

	const cols = await db
		.query<{ c: string }>(
			`SELECT column_name AS "c" FROM all_tab_columns WHERE owner='MAGIIS' AND table_name='TRAVEL'
		   AND (column_name LIKE '%LAT%' OR column_name LIKE '%LON%' OR column_name LIKE '%ORIG%' OR column_name LIKE '%PICK%' OR column_name LIKE '%FROM%')
		 ORDER BY column_id`
		)
		.catch(() => []);
	log(`cols geo TRAVEL: ${cols.map(c => c.c).join(', ')}`);

	// Intentar columnas comunes de coordenadas de origen.
	const candidates = [
		'ORIGIN_LATITUDE',
		'ORIGINLATITUDE',
		'LATITUDE_FROM',
		'FROM_LATITUDE',
		'PICKUP_LATITUDE',
		'LATITUDE'
	];
	for (const latCol of candidates) {
		const lonCol = latCol.replace(/LAT/g, 'LON').replace('LATITUDE', 'LONGITUDE');
		const rows = await db
			.query<
				Record<string, unknown>
			>(`SELECT ${latCol} AS "lat", ${lonCol} AS "lon" FROM MAGIIS.TRAVEL WHERE ID = :id`, { id: TID })
			.catch(() => null);
		if (rows && rows[0] && rows[0].lat != null) {
			log(`ORIGEN 67971 → lat=${rows[0].lat} lon=${rows[0].lon} (cols ${latCol}/${lonCol})`);
			return;
		}
	}
	log('no encontré columnas de lat/lon de origen con los nombres candidatos — ver "cols geo" arriba');
}

run().catch((e: unknown) => {
	console.error(`[coords] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
