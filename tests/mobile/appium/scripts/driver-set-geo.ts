/**
 * Mockea el GPS del driver a un pickup (default Ciudad de la Paz 2238, Belgrano) vía Appium
 * setGeoLocation, para que el viaje difundido en esa zona aparezca en "Viajes Disponibles".
 *
 * Uso: MG_LAT=-34.5620 MG_LON=-58.4520 APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/driver-set-geo.ts
 */
import { AppiumSessionBase } from '../base/AppiumSessionBase';
import { getDriverAppConfig } from '../config/appiumRuntime';

const log = (m: string): void => console.log(`[set-geo] ${m}`);
const LAT = Number(process.env.MG_LAT ?? '-34.5620');
const LON = Number(process.env.MG_LON ?? '-58.4520');

class Bare extends AppiumSessionBase {}

async function run(): Promise<void> {
	const s = new Bare(getDriverAppConfig());
	await s.startSession();
	try {
		const driver = s.getDriver();
		log(`setGeoLocation → lat=${LAT} lon=${LON}`);
		await (driver as unknown as { setGeoLocation: (loc: { latitude: number; longitude: number; altitude: number }) => Promise<unknown> })
			.setGeoLocation({ latitude: LAT, longitude: LON, altitude: 15 });
		log('geo seteada; esperando 12s a que background-geolocation propague…');
		await driver.pause(12_000);
		const loc = await (driver as unknown as { getGeoLocation: () => Promise<unknown> }).getGeoLocation().catch(() => 'n/a');
		log(`getGeoLocation → ${JSON.stringify(loc)}`);
	} finally {
		await s.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[set-geo] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
