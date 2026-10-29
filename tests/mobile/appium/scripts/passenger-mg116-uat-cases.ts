/**
 * MG-116 — cobertura por TEST CASE sobre App PAX de UAT, con evidencia por caso.
 *
 * Corre `AddressCaseBattery` sobre el campo `Destino` del home (la superficie migrada, ya
 * caracterizada en la corrida de conductas) y deja, por cada caso: veredicto con el dato medido,
 * captura de pantalla y el JSON con la URL completa de cada request y su cuerpo de respuesta.
 *
 * La captura se engancha DENTRO de la bateria y se dispara apenas termina cada caso. La primera
 * version las sacaba al final, en rafaga: las 9 imagenes salieron con el mismo MD5 y se adjuntaron
 * a Xray como si fueran evidencia por caso. Una captura que no corresponde al caso que dice
 * ilustrar parece respaldo sin serlo, que es peor que no tener captura.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';
import { AddressCaseBattery, type CaseResult } from '../passenger/AddressCaseBattery';
import { AnyEditableAddressSurface } from '../passenger/surfaces/homeSurfaces';

const TARGET = resolveDriverTarget('passenger');
const log = (m: string): void => console.log(`[casos] ${m}`);
const line = (): void => log('='.repeat(76));

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

	const runLabel = `mg116-casos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
	const evidence = new ScreenEvidence(driver, runLabel);
	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		phase: 'cobertura por test case',
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		udid: TARGET.udid,
		surface: '(se resuelve en runtime: primera fila editable)',
		startedAt: new Date().toISOString()
	};
	let results: CaseResult[] = [];

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			out.aborted = 'sin contexto WEBVIEW';
			log('ABORTA: sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		out.startUrl = (await driver.execute(() => window.location.href)) as string;
		log(`URL inicial: ${out.startUrl}`);
		await evidence.capture('00-estado-inicial');

		const cleared = await evidence.clearSafeBlockers();
		out.blockersAtStart = cleared;
		for (const b of cleared.left) log(`BLOQUEO INTACTO: ${b.suggestedExit}`);

		const surface = new AnyEditableAddressSurface();
		const reached = await surface.reach(driver);
		log(`superficie "${surface.label}" alcanzada: ${reached}`);
		out.surfaceReached = reached;
		out.surfaceUsed = surface.label;
		out.fieldSelectorUsed = surface.fieldSelector();
		if (!reached) {
			const pathOut = await evidence.captureUnblockPath('destino');
			out.unblockPath = pathOut;
			log('ABORTA: no se alcanzo el campo Destino. Camino de salida volcado en la evidencia.');
			return;
		}

		line();
		log('COBERTURA POR CASO — superficie Home · Destino');
		line();

		const battery = new AddressCaseBattery(driver, surface.fieldSelector());
		// La captura se engancha DENTRO de la bateria: se toma apenas termina cada caso, con la
		// pantalla todavia en el estado que produjo ese veredicto.
		results = await battery.runAll(async r => {
			await evidence.capture(`${r.key}-${r.status}`);
		});

		line();
		log('RESUMEN');
		line();
		const byStatus = results.reduce<Record<string, number>>((acc, r) => {
			acc[r.status] = (acc[r.status] ?? 0) + 1;
			return acc;
		}, {});
		for (const r of results) log(`  ${r.key.padEnd(8)} ${r.tc.padEnd(5)} ${r.status.padEnd(11)} ${r.title}`);
		log(
			`\n  totales: ${Object.entries(byStatus)
				.map(([k, v]) => `${k}=${v}`)
				.join(' · ')}`
		);

		line();
		log('CAPTURAS');
		line();
		for (const m of evidence.manifest()) log(`  ${m}`);

		out.results = results;
		out.totals = byStatus;
		out.screenshots = evidence.all();
	} finally {
		out.finishedAt = new Date().toISOString();
		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-uat-cases-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`\nEvidencia -> ${f}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch((e: Error) => {
	console.error('[casos] Error:', e.message ?? e);
	process.exit(1);
});
