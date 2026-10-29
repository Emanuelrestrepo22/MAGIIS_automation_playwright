/**
 * Censo de la seccion de VIAJES PROGRAMADOS de App PAX — descubrimiento, no asercion.
 *
 * Existe porque la superficie S6 (editar viaje programado) es la unica de las tres secciones con
 * campo de direccion que todavia no tiene navegador propio en `surfaces/`. Escribirlo a ciegas ya
 * costo caro una vez: un selector adivinado toco un icono de accion y borro el campo Origen del
 * usuario. Asi que primero se mira, despues se escribe.
 *
 * ES DE LECTURA. No crea, no edita, no guarda, no borra. Los unicos taps son de NAVEGACION y
 * siempre sobre el tercio izquierdo de la fila, lejos de cualquier icono de accion que viva a la
 * derecha (en esta app el `.trailing-icon` de una fila de direccion es un TACHO DE BASURA).
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');
const log = (m: string): void => console.log(`[censo-prog] ${m}`);
const line = (): void => log('='.repeat(74));

type NavMap = {
	url: string;
	title: string;
	tabs: { text: string; tag: string }[];
	tappables: { text: string; tag: string; cls: string }[];
	inputs: { placeholder: string; name: string; readOnly: boolean; disabled: boolean; value: string }[];
	visibleText: string;
};

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
		}
	});

	const steps: { step: string; map: NavMap }[] = [];
	let webview = '';

	try {
		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage} · udid=${TARGET.udid}`);
		line();

		const contexts = (await driver.getContexts()) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW: la app no monto su vista web');
		await driver.switchContext(webview);
		await driver.pause(3500);

		const snap = async (step: string): Promise<NavMap> => {
			const map = (await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const txt = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
				return {
					url: location.href.slice(0, 220),
					title: txt(document.querySelector('ion-title') ?? document.createElement('i')).slice(0, 80),
					tabs: Array.from(document.querySelectorAll('ion-tab-button, ion-segment-button'))
						.filter(vis)
						.map(e => ({ text: txt(e).slice(0, 40), tag: e.tagName.toLowerCase() })),
					tappables: Array.from(
						document.querySelectorAll('ion-item, ion-button, button, ion-card, ion-label[role], a')
					)
						.filter(vis)
						.map(e => ({
							text: txt(e).slice(0, 70),
							tag: e.tagName.toLowerCase(),
							cls: (e.className ?? '').toString().slice(0, 60)
						}))
						.filter(e => e.text.length > 0)
						.slice(0, 40),
					inputs: Array.from(document.querySelectorAll('input, textarea'))
						.filter(vis)
						.map(e => {
							const i = e as HTMLInputElement;
							return {
								placeholder: i.placeholder ?? '',
								name: i.name ?? '',
								readOnly: !!i.readOnly,
								disabled: !!i.disabled,
								value: (i.value ?? '').slice(0, 60)
							};
						}),
					visibleText: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 700)
				};
			})) as NavMap;
			steps.push({ step, map });
			log(`--- ${step}`);
			log(`    url    : ${map.url}`);
			log(`    titulo : ${map.title || '(sin ion-title)'}`);
			if (map.tabs.length) log(`    tabs   : ${map.tabs.map(t => `"${t.text}"`).join(' · ')}`);
			log(
				`    inputs : ${map.inputs.length ? map.inputs.map(i => `[${i.placeholder || i.name}]${i.readOnly ? '(ro)' : ''}${i.disabled ? '(dis)' : ''}`).join(' ') : '(ninguno)'}`
			);
			log(`    tocables (primeros 14):`);
			for (const t of map.tappables.slice(0, 14)) log(`        <${t.tag}> "${t.text}"`);
			return map;
		};

		/** Tap de NAVEGACION: tercio izquierdo de la fila, nunca el borde derecho. */
		const tapNav = async (
			needle: string,
			sel = 'ion-item, ion-button, button, ion-card, ion-label, ion-tab-button, a'
		): Promise<boolean> => {
			const box = (await driver
				.execute(
					(s: string, q: string) => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const t = Array.from(document.querySelectorAll(s))
							.filter(vis)
							.find(e => (e.textContent ?? '').toLowerCase().includes(q.toLowerCase()));
						if (!t) return null;
						t.scrollIntoView({ block: 'center' });
						const b = t.getBoundingClientRect();
						if (!b.width || !b.height) return null;
						// Tercio IZQUIERDO: los iconos de accion viven a la derecha.
						return {
							x: b.left + b.width / 6,
							y: b.top + b.height / 2,
							vw: window.innerWidth,
							vh: window.innerHeight
						};
					},
					sel,
					needle
				)
				.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
			if (!box) {
				log(`    (no se encontro nada tocable con "${needle}")`);
				return false;
			}
			await driver.switchContext('NATIVE_APP');
			const wv = await driver.$('//android.webkit.WebView');
			const loc = await wv.getLocation();
			const size = await wv.getSize();
			await driver.performActions([
				{
					type: 'pointer',
					id: 'finger1',
					parameters: { pointerType: 'touch' },
					actions: [
						{
							type: 'pointerMove',
							duration: 0,
							x: Math.round(loc.x + box.x * (size.width / box.vw)),
							y: Math.round(loc.y + box.y * (size.height / box.vh))
						},
						{ type: 'pointerDown', button: 0 },
						{ type: 'pause', duration: 130 },
						{ type: 'pointerUp', button: 0 }
					]
				}
			]);
			await driver.releaseActions().catch(() => undefined);
			await driver.switchContext(webview);
			await driver.pause(3200);
			return true;
		};

		await snap('0 · pantalla de partida');

		// Volver al Home: la corrida puede empezar en cualquier pantalla que dejo la anterior.
		// Los tabs reales de esta app (censados en vivo) son: Inicio · Actividad · Llamar · Mi cuenta.
		await tapNav('inicio', 'ion-tab-button, ion-label');
		await snap('1 · Home');

		// Camino 1: los viajes viven en el tab "Actividad", no en uno llamado "Mis Viajes".
		await tapNav('actividad', 'ion-tab-button, ion-label');
		await snap('2 · tab Actividad');

		// Camino 2: dentro de Actividad suele haber un segmento Programados / Historial / En curso.
		for (const needle of ['programad', 'agendad', 'proximo']) {
			const hit = await tapNav(needle, 'ion-segment-button, ion-label, ion-button, button');
			if (hit) {
				await snap(`3 · tras el segmento "${needle}"`);
				break;
			}
		}

		// Camino 3: abrir el PRIMER viaje programado de la lista, si hay alguno.
		const cards = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-card, ion-item, .travel-item, .card'))
				.filter(vis)
				.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90))
				.filter(t => t.length > 8)
				.slice(0, 10);
		})) as string[];
		log(`    tarjetas de viaje visibles: ${cards.length}`);
		for (const c of cards) log(`        · ${c}`);

		if (cards.length) {
			await tapNav(cards[0].slice(0, 24), 'ion-card, ion-item, .travel-item, .card');
			await snap('3 · tras abrir el primer viaje de la lista');
			// Y desde el detalle, el boton de editar (sin confirmar nada).
			await tapNav('editar', 'ion-button, button, ion-item, ion-label');
			await snap('4 · tras buscar "Editar"');
		} else {
			log('    NO hay viajes programados cargados: la superficie S6 exige crear uno primero.');
		}
	} finally {
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const file = path.join(
			dir,
			`pax-scheduled-trips-census-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
		);
		await writeFile(
			file,
			JSON.stringify({ env: TARGET.env, appPackage: TARGET.appPackage, steps }, null, 2),
			'utf8'
		);
		line();
		log(`censo guardado en ${path.relative(process.cwd(), file)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[censo-prog] la corrida termino con error:', err);
	process.exitCode = 1;
});
