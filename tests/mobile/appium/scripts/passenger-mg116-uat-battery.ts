/**
 * MG-116 — matriz de consistencia de los campos de direccion, sobre App PAX de UAT.
 *
 * QUE HACE DISTINTO A LAS CORRIDAS ANTERIORES
 *   · Cada conducta se valida al nivel del debugger: el request completo, con sus parametros y su
 *     cuerpo de respuesta, capturado dentro del WebView. No hay veredicto que dependa de leer texto
 *     de la pantalla.
 *   · Cada superficie deja CAPTURAS DE PANTALLA. Un request que sale no prueba que el usuario haya
 *     visto algo; la captura es lo que hace auditable el resultado para quien no corrio la prueba.
 *   · Cuando una superficie no se alcanza, en vez de un `false` mudo se vuelca el CAMINO DE SALIDA:
 *     captura, texto visible, elementos tocables y los dialogos que esten tapando la pantalla.
 *
 * LO QUE NO HACE
 * No crea viajes, no guarda direcciones, no toca la wallet y no cierra dialogos que tomen una
 * decision de negocio. En UAT eso ademas seria dejar datos: la corrida es de lectura.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';
import { AddressFieldProbe, summarizeMatrix, type AddressSurface, type SurfaceReport } from '../passenger/AddressFieldProbe';
import {
	HomeOriginSurface,
	HomeDestinationSurface,
	HomeStopSurface,
	ProfileAddressSurface,
	ScheduledTripEditSurface,
	TripTypeAddressSurface
} from '../passenger/surfaces/homeSurfaces';

const TARGET = resolveDriverTarget('passenger');
/**
 * Direccion semilla para las superficies que necesitan un destino ya fijado.
 * Va por variable de entorno: el pasajero de UAT esta vinculado a un carrier de EE.UU. (su direccion
 * guardada es de Texas), asi que un literal argentino no resolveria.
 */
const SEED_DESTINATION = process.env.MG116_SEED_DESTINATION ?? 'Center Ave';

const log = (m: string): void => console.log(`[bateria] ${m}`);
const line = (): void => log('='.repeat(74));

async function run(): Promise<void> {
	const u = new URL(TARGET.appiumUrl);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port) || 4723,
		path: '/',
		logLevel: 'error',
		connectionRetryTimeout: 60_000,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300
		} as Record<string, unknown>
	});

	const runLabel = `mg116-uat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
	const evidence = new ScreenEvidence(driver, runLabel);
	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		phase: 'matriz de consistencia de campos de direccion',
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		udid: TARGET.udid,
		seedDestination: SEED_DESTINATION,
		startedAt: new Date().toISOString()
	};
	const reports: SurfaceReport[] = [];
	const unreachable: Record<string, unknown>[] = [];

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW.');
			out.aborted = 'sin contexto WEBVIEW';
			return;
		}
		await driver.switchContext(webview);

		const startUrl = (await driver.execute(() => window.location.href)) as string;
		log(`URL inicial: ${startUrl}`);
		out.startUrl = startUrl;
		await evidence.capture('estado-inicial');

		if (/\/login/i.test(startUrl)) {
			log('ABORTA: la app esta en el login y `.env.uat` no trae credenciales de pasajero.');
			log('CAMINO DE SALIDA: iniciar sesion a mano en el dispositivo, o completar');
			log('                  PASSENGER_EMAIL / PASSENGER_PASSWORD en .env.uat con un usuario de UAT.');
			out.aborted = 'app en login sin credenciales de UAT';
			return;
		}

		// -------------------------------------------------------------- desbloqueo previo
		line();
		log('DESBLOQUEO — que hay tapando la pantalla antes de empezar');
		line();
		const cleared = await evidence.clearSafeBlockers();
		out.blockersAtStart = cleared;
		if (cleared.dismissed.length === 0 && cleared.left.length === 0) {
			log('  sin dialogos: la pantalla esta libre.');
		}
		for (const b of cleared.dismissed) log(`  CERRADO   <${b.kind}> "${b.text.slice(0, 90)}"`);
		for (const b of cleared.left) {
			log(`  INTACTO   <${b.kind}> "${b.text.slice(0, 90)}"`);
			log(`            botones: ${b.buttons.join(' / ') || '(ninguno)'}`);
			log(`            SALIDA: ${b.suggestedExit}`);
		}

		// -------------------------------------------------------------- la matriz
		const probe = new AddressFieldProbe(driver);
		const all: AddressSurface[] = [
			new HomeOriginSurface(),
			new HomeDestinationSurface(),
			new HomeStopSurface(SEED_DESTINATION),
			// Los tipos de viaje que el home ofrece hoy. Uno que este carrier no habilite se reporta
			// como superficie inalcanzable, con su camino de salida, y nunca como defecto.
			new TripTypeAddressSurface('S4', 'Ida y Vuelta'),
			new TripTypeAddressSurface('S5', 'Solo Ida'),
			new ScheduledTripEditSurface(),
			new ProfileAddressSurface()
		];
		/**
		 * `MG116_ONLY=S2,S3` corre solo esas superficies.
		 *
		 * POR QUE HACE FALTA: el home mantiene UNA fila de direccion activa y, al escribir en ella, se
		 * abre el panel de "Mis Direcciones / Ultimos Destinos" — que reemplaza al formulario. La
		 * superficie siguiente ya no encuentra su campo y se reporta SIN_DATOS aunque el producto este
		 * bien. Medir de a una superficie por sesion, con la app relanzada en medio, es lo que hace que
		 * el SIN_DATOS signifique "no se alcanzo" y no "la corrida se contamino a si misma".
		 */
		const only = (process.env.MG116_ONLY ?? '')
			.split(',')
			.map(s => s.trim().toUpperCase())
			.filter(Boolean);
		const surfaces = only.length ? all.filter(s => only.includes(s.id.toUpperCase())) : all;
		if (only.length) log(`filtro MG116_ONLY=${only.join(',')} -> ${surfaces.map(s => s.id).join(',') || '(ninguna)'}`);

		for (const surface of surfaces) {
			await evidence.capture(`${surface.id}-antes`);
			const report = await probe.runBattery(surface);
			reports.push(report);

			if (!report.reached) {
				// Una superficie inalcanzable NO es un defecto del producto. Se vuelca el material para
				// que una persona reproduzca el paso a mano y decida.
				const pathOut = await evidence.captureUnblockPath(surface.id);
				unreachable.push({ surfaceId: surface.id, surfaceLabel: surface.label, ...pathOut });
				log(`\n  ${surface.id} NO ALCANZADA — camino de salida volcado:`);
				log(`     url: ${pathOut.url}`);
				log(`     captura: ${pathOut.shot.relPath}`);
				log(`     elementos tocables en pantalla (primeros 12):`);
				for (const t of pathOut.tappables.slice(0, 12)) {
					log(`       <${t.tag}>${t.id ? `#${t.id}` : ''} "${t.text}"${t.classes ? `  .${t.classes}` : ''}`);
				}
				for (const b of pathOut.blockers) log(`     BLOQUEO: ${b.suggestedExit}`);
				continue;
			}

			// Captura por conducta que no haya salido en PASS: es la evidencia visual del hallazgo.
			for (const v of report.verdicts) {
				if (v.status !== 'PASS') await evidence.capture(`${surface.id}-${v.behavior}-${v.status}`);
			}
			await evidence.capture(`${surface.id}-despues`);
		}

		// -------------------------------------------------------------- salida
		line();
		log('MATRIZ DE CONSISTENCIA');
		line();
		for (const l of summarizeMatrix(reports)) log(`  ${l}`);

		line();
		log('DETALLE POR SUPERFICIE');
		line();
		for (const r of reports) {
			log(`\n${r.surfaceId} — ${r.surfaceLabel}   (${r.reached ? 'alcanzada' : 'NO alcanzada'})`);
			for (const v of r.verdicts) log(`   ${v.behavior} ${v.status.padEnd(11)} ${v.verdict}`);
		}

		line();
		log('CAPTURAS DE PANTALLA (rutas relativas al repo)');
		line();
		for (const m of evidence.manifest()) log(`  ${m}`);

		out.reports = reports;
		out.unreachable = unreachable;
		out.screenshots = evidence.all();
		out.matrix = summarizeMatrix(reports);
	} finally {
		out.finishedAt = new Date().toISOString();
		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-uat-battery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`\nEvidencia -> ${f}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch((e: Error) => {
	console.error('[bateria] Error:', e.message ?? e);
	process.exit(1);
});
