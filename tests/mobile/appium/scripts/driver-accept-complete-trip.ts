/**
 * Cierra el E2E Flow 2 desde la APP DRIVER: el conductor va online, acepta el viaje difundido
 * (SEARCHING_DRIVER, p.ej. TRAVEL 67970 creado por la pax app), lo inicia, lo finaliza y lo cierra →
 * el hold eBiz pasa de HOLD a CAPTURE. Orquesta DriverSessionPBO + TripLifecyclePBO sobre MobileSession.
 *
 * Finalizar y cerrar son IRREVERSIBLES: solo se ejecutan con F5_APP_CLOSE=1 y `--confirm`. Sin ambos gates
 * el script aborta antes de abrir la sesión (no toca la app). Sin simulación de ruta GPS: para eso usar
 * `f5-driver-close-trip.ts`.
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test F5_APP_CLOSE=1 \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/driver-accept-complete-trip.ts --confirm
 */

import { getDriverAppConfig } from '../config/appiumRuntime';
import { evaluateGates, GateClosedError, irreversibleCloseGates } from '../core/Gates';
import { I18n } from '../core/I18n';
import { MobileSession } from '../core/MobileSession';
import { DriverSessionPBO, TripLifecyclePBO } from '../pbo';

const log = (m: string): void => console.log(`[driver-flow] ${m}`);

async function run(): Promise<void> {
	const gates = evaluateGates(irreversibleCloseGates({ confirm: process.argv.includes('--confirm') }, process.env));
	if (!gates.open) throw new GateClosedError('Finalizar y cerrar el viaje (irreversible)', gates.missing);

	const session = new MobileSession(getDriverAppConfig());
	try {
		await session.start();
		log('driver happy path: online → aceptar → iniciar → finalizar → resumen → cerrar…');
		// Sin pre-flight de identidad (igual que antes): solo se asegura «Disponible».
		await DriverSessionPBO.forSession(session, log).ensureOnline();
		const trip = TripLifecyclePBO.forSession(session, I18n.forProfile('test-default'), { log });
		const { travelId } = await trip.acceptAssignedTrip();
		await trip.startTrip();
		const summary = await trip.finishTrip({ confirmed: true });
		log(`resumen total=${summary.totalText} pago=${summary.paymentMethod} travelId=${travelId ?? 'n/d'}`);
		const closed = await trip.closeTrip({ confirmed: true });
		log(`RESULT total=${closed.closedTotal ?? summary.totalText} pago=${closed.paymentMethod} firma=${closed.signed}`);
	} finally {
		await session.end();
	}
}

run().catch((e: unknown) => {
	console.error(`[driver-flow] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
