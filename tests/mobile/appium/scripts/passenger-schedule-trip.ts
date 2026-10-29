/**
 * Crea UN viaje programado en App PAX para habilitar la superficie S6 (editar viaje programado),
 * que es la tercera seccion con campo de direccion y hoy no se puede medir: la lista de Programados
 * esta vacia y el guard TM-730 se saltea por falta de dato.
 *
 * MEDIO DE PAGO: cuenta corriente o efectivo, NUNCA tarjeta. No es una preferencia de estilo — una
 * tarjeta puede disparar hold, 3DS o validacion, y la politica de esta campana prohibe automatizar
 * validacion de tarjetas en ambientes que no son de pruebas de pasarela.
 *
 * DISCIPLINA: el script se DETIENE y volca el camino de salida si aparece cualquier pantalla que
 * tome una decision de negocio que no sea la programacion (hold, 3DS, propina, calificacion). Un
 * paso que no reconoce no se fuerza.
 *
 * `MG116_DRY=1` recorre y volca sin tocar el boton final de confirmacion.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';

const TARGET = resolveDriverTarget('passenger');
const DRY = process.env.MG116_DRY === '1';
const DESTINATION = process.env.MG116_SEED_DESTINATION ?? 'Arenales 1233';
/** Terminos que delatan una pantalla que NO se debe atravesar automaticamente. */
const FORBIDDEN = ['3ds', 'autenticacion', 'autenticación', 'propina', 'calific', 'hold', 'verificar tarjeta', 'cvv'];

const log = (m: string): void => console.log(`[programar] ${m}`);
const line = (): void => log('='.repeat(74));

type Step = { step: string; url: string; text: string; tappables: string[]; inputs: string[] };

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

	const steps: Step[] = [];
	let webview = '';
	const evidence = new ScreenEvidence(
		driver,
		`pax-programar-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
	);

	try {
		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage} · destino="${DESTINATION}" · dry=${DRY}`);
		log('medio de pago buscado: cuenta corriente o efectivo (nunca tarjeta)');
		line();

		const contexts = (await driver.getContexts()) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW');
		await driver.switchContext(webview);
		await driver.pause(4000);

		const snap = async (step: string): Promise<Step> => {
			const s = (await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
				return {
					url: location.href.slice(0, 120),
					text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
					tappables: Array.from(
						document.querySelectorAll(
							'ion-button, button, ion-item, ion-segment-button, ion-select, ion-radio, ion-datetime'
						)
					)
						.filter(vis)
						.map(e => `<${e.tagName.toLowerCase()}> "${t(e).slice(0, 55)}"`)
						.slice(0, 22),
					inputs: Array.from(document.querySelectorAll('input'))
						.filter(vis)
						.map(e => {
							const i = e as HTMLInputElement;
							return `[${i.placeholder || i.name}]${i.readOnly ? '(ro)' : ''}="${(i.value ?? '').slice(0, 30)}"`;
						})
				};
			})) as Omit<Step, 'step'>;
			const full: Step = { step, ...s };
			steps.push(full);
			log(`--- ${step}`);
			log(`    url    : ${full.url}`);
			log(`    inputs : ${full.inputs.join(' ') || '(ninguno)'}`);
			for (const x of full.tappables) log(`        ${x}`);
			await evidence.capture(step.replace(/[^a-z0-9]+/gi, '-').toLowerCase()).catch(() => undefined);

			const hit = FORBIDDEN.find(f => full.text.toLowerCase().includes(f));
			if (hit) {
				log(`    FRENO: la pantalla menciona "${hit}". No se atraviesa automaticamente.`);
				throw new Error(`pantalla no atravesable ("${hit}") en el paso: ${step}`);
			}
			return full;
		};

		const tap = async (
			needle: string,
			sel = 'ion-button, button, ion-item, ion-label, ion-segment-button, ion-radio',
			third = false
		): Promise<boolean> => {
			const box = (await driver
				.execute(
					(s: string, q: string, leftThird: boolean) => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const candidates = Array.from(document.querySelectorAll(s)).filter(
							e => vis(e) && (e.textContent ?? '').toLowerCase().includes(q.toLowerCase())
						);
						// El MAS PROFUNDO gana. Con `div`/`span` en la busqueda, el primer match suele ser un
						// contenedor gigante cuyo centro cae en zona muerta: se toca la nada y el paso se
						// reporta OK. Priorizar por profundidad apunta al control real.
						const depth = (el: Element): number => {
							let n = 0;
							for (let p = el.parentElement; p; p = p.parentElement) n++;
							return n;
						};
						const t = candidates.sort((a, b) => depth(b) - depth(a))[0];
						if (!t) return null;
						t.scrollIntoView({ block: 'center' });
						const b = t.getBoundingClientRect();
						if (!b.width || !b.height) return null;
						return {
							x: b.left + (leftThird ? b.width / 6 : b.width / 2),
							y: b.top + b.height / 2,
							vw: window.innerWidth,
							vh: window.innerHeight
						};
					},
					sel,
					needle,
					third
				)
				.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
			if (!box) {
				log(`    (nada tocable con "${needle}")`);
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
			await driver.pause(2800);
			log(`    tap "${needle}" OK`);
			return true;
		};

		await snap('00-partida');

		// ------------------------------------------------------------------ 1. destino
		//
		// `MG116_SKIP_ADDRESS=1` salta este paso. Hace falta porque escribir en una fila de direccion
		// ABRE el panel de "Mis Direcciones / Ultimos Destinos", y ese panel TAPA el bloque de momento
		// ("Ahora") y de vehiculo. Si el home ya llega con origen y destino cargados — el caso normal
		// tras cualquier corrida anterior — tipear de nuevo solo esconde los controles que hacen falta.
		if (process.env.MG116_SKIP_ADDRESS === '1') {
			log('MG116_SKIP_ADDRESS=1 -> se usan las direcciones que ya tiene el home, sin tipear');
		} else {
			const typed = (await driver.execute((value: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const el = Array.from(document.querySelectorAll('input'))
					.filter(vis)
					.find(i => {
						const inp = i as HTMLInputElement;
						return (
							!inp.readOnly && !inp.disabled && /destino|direccion|direcci/i.test(inp.placeholder ?? '')
						);
					}) as HTMLInputElement | undefined;
				if (!el) return '';
				el.focus();
				el.value = '';
				el.dispatchEvent(new Event('input', { bubbles: true }));
				for (const ch of value) {
					el.value += ch;
					el.dispatchEvent(new Event('input', { bubbles: true }));
				}
				el.dispatchEvent(new Event('change', { bubbles: true }));
				return el.placeholder ?? '(sin placeholder)';
			}, DESTINATION)) as string;
			if (!typed) throw new Error('no hay campo de direccion editable en el home: no se puede fijar destino');
			log(`destino escrito en el campo [${typed}]`);
			await driver.pause(5000);
			await snap('01-predicciones');

			// Elegir la primera prediccion de la lista.
			if (!(await tap(DESTINATION.slice(0, 8), 'ion-item, ion-label, li, div[role="button"]', true))) {
				// Fallback: cualquier fila de la lista de resultados.
				await tap('argentina', 'ion-item, ion-label, li', true);
			}
			await driver.pause(3000);
			await snap('02-destino-fijado');
		}

		// ------------------------------------------------------------------ 2. momento del viaje
		// El control de momento es un `<div>` DESNUDO con el texto "Ahora" (censado en vivo: sin id,
		// sin clase, 35x15 px). No aparece en `ion-button`/`button`/`ion-item`, asi que hay que
		// incluir `div`/`span` en la busqueda o el paso se saltea en silencio.
		const MOMENT_SEL = 'div, span, ion-button, button, ion-item, ion-label';
		if (!(await tap('ahora', MOMENT_SEL))) log('AVISO: no se encontro el control de momento "Ahora"');
		await snap('03-selector-de-momento');

		// El modal trae un `ion-datetime` mas los botones "Ahora" y "Confirmar" (censado en vivo).
		// Programar = fijar el datetime a futuro y confirmar. El valor se escribe por propiedad y se
		// notifica con `ionChange`: Ionic no lee el atributo, escucha el evento.
		const when = new Date(Date.now() + 26 * 60 * 60 * 1000);
		when.setMinutes(0, 0, 0);
		const iso = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}T${String(when.getHours()).padStart(2, '0')}:00:00`;
		const setAt = (await driver.execute((value: string) => {
			const dt = document.querySelector('ion-datetime') as (HTMLElement & { value?: string }) | null;
			if (!dt) return '';
			dt.value = value;
			dt.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
			return String(dt.value ?? '');
		}, iso)) as string;
		if (!setAt) {
			log('AVISO: no hay ion-datetime en pantalla; el modal de momento no quedo abierto');
		} else {
			log(`fecha/hora programada -> ${setAt} (objetivo ${iso})`);
			await driver.pause(1200);
			await snap('04-fecha-elegida');
			if (!(await tap('confirmar', 'ion-button, button')))
				log('AVISO: no se encontro "Confirmar" del modal de momento');
			await snap('05-momento-confirmado');
		}

		// ------------------------------------------------------------------ 3. vehiculo
		if (await tap('seleccionar veh', MOMENT_SEL)) await snap('06-vehiculos');
		// La primera opcion de la lista: en este carrier la etiqueta observada es "Standard".
		if (await tap('standard', 'ion-item, ion-card, button, ion-radio, div, span'))
			await snap('07-vehiculo-elegido');

		// ------------------------------------------------------------------ 4. medio de pago
		// SOLO cuenta corriente o efectivo. Si ninguno esta disponible el script NO cae a tarjeta:
		// deja el volcado y termina, porque forzar tarjeta es exactamente lo que la politica prohibe.
		let paid = '';
		for (const needle of ['cuenta corriente', 'efectivo', 'cash']) {
			if (await tap(needle, 'ion-item, ion-radio, ion-select-option, button, div, span, ion-label')) {
				paid = needle;
				await snap(`07-pago-${needle.replace(/\s+/g, '-')}`);
				break;
			}
		}
		if (!paid) {
			log('AVISO: no se ofrecio cuenta corriente ni efectivo en esta pantalla.');
			log('       NO se elige tarjeta como alternativa. Volcado guardado para decidir a mano.');
		} else {
			log(`medio de pago elegido: ${paid}`);
		}

		await snap('08-antes-de-confirmar');

		// ------------------------------------------------------------------ 5. confirmacion
		if (DRY) {
			line();
			log('DRY=1 -> NO se confirma. El recorrido quedo volcado hasta un tap del final.');
			line();
		} else if (!paid) {
			line();
			log('SIN medio de pago valido -> NO se confirma, para no crear el viaje con tarjeta.');
			line();
		} else {
			const confirmed =
				(await tap('programar viaje', MOMENT_SEL)) ||
				(await tap('confirmar', MOMENT_SEL)) ||
				(await tap('viajo', MOMENT_SEL));
			log(confirmed ? 'confirmacion enviada' : 'AVISO: no se encontro el boton de confirmacion');
			await driver.pause(6000);
			await snap('09-resultado');
		}
	} finally {
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const file = path.join(dir, `pax-programar-viaje-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(
			file,
			JSON.stringify({ env: TARGET.env, dry: DRY, destination: DESTINATION, steps }, null, 2),
			'utf8'
		);
		log(`volcado -> ${path.relative(process.cwd(), file)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[programar] termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
