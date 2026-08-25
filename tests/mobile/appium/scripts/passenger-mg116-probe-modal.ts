/**
 * MG-116 — SONDA del estado "buscador abierto": como se cierra realmente.
 *
 * La regresion se traba porque tras enfocar `Origen` el buscador queda abierto y `driver.back()` no
 * lo cierra, asi que los campos `Destino` y `Agregar otro destino` nunca vuelven a ser visibles y las
 * fases siguientes miden cero. Esta sonda no asume nada: fotografia el DOM en ambos estados y prueba
 * los candidatos de cierre uno por uno, informando cual funciona.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');
const log = (m: string): void => console.log(`[probe] ${m}`);

type Snap = {
	url: string;
	readonlyInputs: { placeholder: string; value: string }[];
	editableInputs: { placeholder: string; value: string }[];
	pages: { tag: string; cls: string }[];
	modals: number;
	backdrops: number;
	buttons: { text: string; cls: string; icon: string }[];
};

async function snap(driver: WebdriverIO.Browser, label: string): Promise<Snap> {
	const s = (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const inputs = Array.from(document.querySelectorAll('input')).filter(vis) as HTMLInputElement[];
		return {
			url: window.location.href,
			readonlyInputs: inputs.filter(i => i.readOnly).map(i => ({ placeholder: i.placeholder, value: i.value })),
			editableInputs: inputs.filter(i => !i.readOnly).map(i => ({ placeholder: i.placeholder, value: i.value })),
			pages: Array.from(document.querySelectorAll('.ion-page'))
				.filter(vis)
				.map(p => ({ tag: p.tagName.toLowerCase(), cls: p.className })),
			modals: Array.from(document.querySelectorAll('ion-modal')).filter(vis).length,
			backdrops: Array.from(document.querySelectorAll('ion-backdrop')).filter(vis).length,
			buttons: Array.from(
				document.querySelectorAll('ion-button, button, ion-back-button, ion-icon[role="button"]')
			)
				.filter(vis)
				.slice(0, 18)
				.map(b => ({
					text: (b.textContent ?? '').trim().slice(0, 30),
					cls: (b as HTMLElement).className.slice(0, 60),
					icon: b.querySelector('ion-icon')?.getAttribute('name') ?? b.getAttribute('name') ?? ''
				}))
		};
	})) as Snap;
	log(`\n===== ${label} =====`);
	log(`url: ${s.url}`);
	log(`inputs readonly (${s.readonlyInputs.length}): ${s.readonlyInputs.map(i => `"${i.placeholder}"`).join(', ')}`);
	log(
		`inputs editables (${s.editableInputs.length}): ${s.editableInputs.map(i => `"${i.placeholder}"="${i.value}"`).join(', ')}`
	);
	log(`ion-page visibles: ${s.pages.map(p => `${p.tag}[${p.cls.slice(0, 40)}]`).join(' | ')}`);
	log(`ion-modal: ${s.modals} · ion-backdrop: ${s.backdrops}`);
	log(`botones visibles:`);
	for (const b of s.buttons) log(`   · "${b.text}" icon=${b.icon || '-'} cls=${b.cls}`);
	return s;
}

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
			'appium:deviceName': 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 240
		} as Record<string, unknown>
	});

	const out: Record<string, unknown> = {};
	try {
		const ctx = (await driver.getContexts()) as string[];
		const wv = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!wv) {
			log('sin WEBVIEW');
			return;
		}
		await driver.switchContext(wv);

		out.home = await snap(driver, 'ESTADO 1 — home');

		// Abrir el buscador desde Origen
		await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
				| HTMLInputElement
				| undefined;
			if (!t) return;
			t.focus();
			t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
			t.click();
		});
		await driver.pause(2000);
		out.searchOpen = await snap(driver, 'ESTADO 2 — buscador abierto');

		// Candidatos de cierre, probados en orden. Se para en el primero que devuelva al home.
		const homeOk = async (): Promise<boolean> =>
			((await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return (Array.from(document.querySelectorAll('input')).filter(vis) as HTMLInputElement[]).filter(
					i => i.readOnly && (i.placeholder ?? '').trim().length > 0
				).length;
			})) as number) >= 2;

		const attempts: { name: string; fn: () => Promise<void> }[] = [
			{
				name: 'driver.back() x1',
				fn: async () => {
					await driver.back();
				}
			},
			{
				name: 'ion-back-button click',
				fn: async () => {
					await driver.execute(() => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const b = Array.from(document.querySelectorAll('ion-back-button')).filter(vis)[0];
						(b as HTMLElement | undefined)?.click();
					});
				}
			},
			{
				name: 'boton con icono close/arrow-back',
				fn: async () => {
					await driver.execute(() => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const cands = Array.from(document.querySelectorAll('ion-button, button, ion-icon')).filter(vis);
						const b = cands.find(c => {
							const n = c.querySelector('ion-icon')?.getAttribute('name') ?? c.getAttribute('name') ?? '';
							return /close|arrow-back|chevron-back/i.test(n);
						});
						(b as HTMLElement | undefined)?.click();
					});
				}
			},
			{
				name: 'ion-backdrop click',
				fn: async () => {
					await driver.execute(() => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const b = Array.from(document.querySelectorAll('ion-backdrop')).filter(vis)[0];
						(b as HTMLElement | undefined)?.click();
					});
				}
			},
			{
				name: 'driver.back() x2',
				fn: async () => {
					await driver.back();
					await driver.pause(900);
					await driver.back();
				}
			}
		];

		const tried: { name: string; worked: boolean }[] = [];
		for (const a of attempts) {
			if (await homeOk()) {
				log(`\n(ya estabamos en el home antes de "${a.name}")`);
				break;
			}
			log(`\n--> probando cierre: ${a.name}`);
			await a.fn().catch(() => undefined);
			await driver.pause(1800);
			const ok = await homeOk();
			tried.push({ name: a.name, worked: ok });
			log(`    resultado: ${ok ? 'VOLVIO AL HOME' : 'sigue en el buscador'}`);
			if (ok) break;
		}
		out.closeAttempts = tried;
		out.afterClose = await snap(driver, 'ESTADO 3 — tras intentar cerrar');

		const winner = tried.find(t => t.worked);
		log(`\n${'='.repeat(50)}`);
		log(winner ? `CIERRE QUE FUNCIONA: ${winner.name}` : 'NINGUN candidato de cierre funciono');

		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-probe-modal-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify({ ticket: 'MG-116', target: TARGET, ...out }, null, 2), 'utf8');
		log(`Evidencia -> ${f}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((e: Error) => {
	console.error('[probe] Error:', e.message ?? e);
	process.exit(1);
});
