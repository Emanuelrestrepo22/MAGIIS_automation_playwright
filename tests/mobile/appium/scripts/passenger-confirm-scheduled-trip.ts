/**
 * Confirma el viaje programado que ya quedo armado en `travel-info`, y verifica que aparezca en la
 * lista de Programados. Segundo tramo de `passenger-schedule-trip.ts`, separado a proposito: el tap
 * de confirmacion es el unico de todo el flujo que CREA un dato en UAT, asi que vive en su propio
 * script con su propia precondicion dura.
 *
 * PRECONDICION QUE ABORTA: el medio de pago seleccionado debe ser Efectivo o Cuenta Corriente,
 * leido de la clase `payment-method-selected` del DOM — no de que un tap anterior haya devuelto
 * `true`. Un tap que "salio bien" no prueba que la seleccion cambio; la clase si. Si el seleccionado
 * es Tarjeta de Credito el script termina sin tocar nada.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';

const TARGET = resolveDriverTarget('passenger');
const ALLOWED_PAYMENT = /efectivo|cuenta corriente/i;
const FORBIDDEN = ['3ds', 'autenticacion', 'autenticación', 'propina', 'calific', 'verificar tarjeta', 'cvv'];

const log = (m: string): void => console.log(`[confirmar] ${m}`);
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
		}
	});

	const out: Record<string, unknown> = { env: TARGET.env, appPackage: TARGET.appPackage };
	let webview = '';
	const evidence = new ScreenEvidence(
		driver,
		`pax-confirmar-programado-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
	);

	try {
		const contexts = (await driver.getContexts()) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW');
		await driver.switchContext(webview);
		await driver.pause(3000);

		const tap = async (needle: string, sel: string): Promise<boolean> => {
			const box = (await driver
				.execute(
					(s: string, q: string) => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const cand = Array.from(document.querySelectorAll(s)).filter(
							e => vis(e) && (e.textContent ?? '').toLowerCase().includes(q.toLowerCase())
						);
						const depth = (el: Element): number => {
							let n = 0;
							for (let p = el.parentElement; p; p = p.parentElement) n++;
							return n;
						};
						const t = cand.sort((a, b) => depth(b) - depth(a))[0];
						if (!t) return null;
						t.scrollIntoView({ block: 'center' });
						const b = t.getBoundingClientRect();
						if (!b.width || !b.height) return null;
						return {
							x: b.left + b.width / 2,
							y: b.top + b.height / 2,
							vw: window.innerWidth,
							vh: window.innerHeight
						};
					},
					sel,
					needle
				)
				.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
			if (!box) return false;
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

		const state = async (): Promise<{ url: string; text: string; cta: string; selectedPayment: string }> =>
			(await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const sel = document.querySelector('.payment-method-selected .payment-method-name');
				const cta = Array.from(document.querySelectorAll('button, ion-button'))
					.filter(vis)
					.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
					.filter(t => t.length > 4);
				return {
					url: location.href.slice(0, 100),
					text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
					cta: cta.join(' | ').slice(0, 200),
					selectedPayment: (sel?.textContent ?? '').trim()
				};
			})) as { url: string; text: string; cta: string; selectedPayment: string };

		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage}`);
		line();

		const before = await state();
		out.before = before;
		log(`url ................. ${before.url}`);
		log(`medio seleccionado .. "${before.selectedPayment}"`);
		log(`CTA ................. ${before.cta}`);
		await evidence.capture('01-antes-de-confirmar').catch(() => undefined);

		if (!/travel-info/i.test(before.url)) {
			log(
				'ABORTA: la app no esta en travel-info con un viaje armado. Correr primero passenger-schedule-trip.ts.'
			);
			return;
		}
		if (!ALLOWED_PAYMENT.test(before.selectedPayment)) {
			log(
				`ABORTA: el medio seleccionado es "${before.selectedPayment || '(ninguno)'}", y solo se permite Efectivo o Cuenta Corriente.`
			);
			log('       No se confirma nada. Elegir el medio a mano y volver a correr.');
			return;
		}
		if (!/programad/i.test(before.text)) {
			log('ABORTA: la pantalla no dice "Programado". Sin eso el tap crearia un viaje INMEDIATO, no programado.');
			return;
		}
		log('precondiciones OK -> se confirma el viaje programado');

		const tapped =
			(await tap('programado para', 'button, ion-button')) || (await tap('programado', 'button, ion-button'));
		out.tapped = tapped;
		log(tapped ? 'confirmacion enviada' : 'AVISO: no se encontro el boton de confirmacion');
		await driver.pause(7000);

		const after = await state();
		out.after = after;
		log(`url tras confirmar .. ${after.url}`);
		log(`pantalla ............ ${after.text.slice(0, 200)}`);
		await evidence.capture('02-tras-confirmar').catch(() => undefined);

		const hit = FORBIDDEN.find(f => after.text.toLowerCase().includes(f));
		if (hit) {
			log(`FRENO: la pantalla resultante menciona "${hit}". Se deja intacta, sin tocar mas nada.`);
			return;
		}

		// ------------------------------------------------------- verificar en Actividad > Programados
		await tap('actividad', 'ion-tab-button, ion-label');
		await tap('programad', 'ion-segment-button, ion-label, ion-item');
		const list = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-item, ion-card'))
				.filter(vis)
				.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
				.filter(t => t.length > 10)
				.slice(0, 8);
		})) as string[];
		out.scheduledList = list;
		line();
		log(`viajes en Programados: ${list.length}`);
		for (const t of list) log(`    · ${t.slice(0, 100)}`);
		line();
		await evidence.capture('03-lista-programados').catch(() => undefined);
	} finally {
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const file = path.join(dir, `pax-confirmar-programado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(file, JSON.stringify(out, null, 2), 'utf8');
		log(`volcado -> ${path.relative(process.cwd(), file)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[confirmar] termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
