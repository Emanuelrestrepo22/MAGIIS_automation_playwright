/**
 * TM-665 — Verifica QUÉ elemento estaba detectando como "spinner".
 *
 * La corrida anterior reportó `spinnerVisible: true` con un selector amplio
 * (`[class*="loading"]`), que puede matchear cualquier nodo con esa subcadena en la clase sin ser
 * un indicador de carga visible. Antes de afirmar en un ticket que el spinner queda colgado hay
 * que identificar el nodo concreto: etiqueta, clase, tamaño y si el usuario realmente lo ve.
 *
 * Inyecta el 503, teclea, y describe cada candidato con su geometría.
 */

import { remote } from 'webdriverio';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	installWebViewFaultInjection,
	clearWebViewFaultInjection,
	readWebViewFaultInjectionState
} from '../helpers/webViewNetworkCapture';

// El objetivo (ambiente + paquete) se resuelve desde ENV, no desde un literal: con el literal
// anterior `ENV=uat` era inerte y la corrida abria la app de TEST mientras el reporte decia UAT.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;
const TERM = process.env.SPINNER_TERM ?? 'obelis';

const log = (msg: string): void => console.log(`[spinner] ${msg}`);

type Candidate = {
	tag: string;
	className: string;
	id: string;
	width: number;
	height: number;
	top: number;
	display: string;
	visibility: string;
	opacity: string;
	inViewport: boolean;
	text: string;
};

async function describeLoadingCandidates(driver: WebdriverIO.Browser): Promise<Candidate[]> {
	return (await driver.execute(() => {
		const nodes = Array.from(
			document.querySelectorAll('ion-spinner, ion-loading, [class*="spinner"], [class*="loading"]')
		);
		return nodes.map(el => {
			const node = el as HTMLElement;
			const rect = node.getBoundingClientRect();
			const style = getComputedStyle(node);
			return {
				tag: node.tagName.toLowerCase(),
				className: String(node.className ?? ''),
				id: String(node.id ?? ''),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				top: Math.round(rect.top),
				display: style.display,
				visibility: style.visibility,
				opacity: style.opacity,
				inViewport: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0,
				text: (node.textContent ?? '').trim().slice(0, 40)
			};
		});
	})) as Candidate[];
}

async function setValue(driver: WebdriverIO.Browser, value: string): Promise<void> {
	await driver.execute((v: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!target) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(target, v);
		target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, value);
}

function report(label: string, candidates: Candidate[]): void {
	log(`\n${label} — ${candidates.length} nodo(s) que matchean el selector de carga`);
	for (const c of candidates) {
		const realmenteVisible =
			c.inViewport && c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0;
		log(
			`   <${c.tag}> class="${c.className.slice(0, 60)}" ${c.width}x${c.height} top=${c.top} ` +
				`display=${c.display} visibility=${c.visibility} opacity=${c.opacity}`
		);
		log(`      -> ¿lo ve el usuario?: ${realmenteVisible ? 'SÍ' : 'NO'}${c.text ? ` · texto="${c.text}"` : ''}`);
	}
}

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port) || 4723,
		path: '/',
		logLevel: 'error',
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		const hasInput = (await driver.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('input'))
				.filter(visible)
				.some(el => !(el as HTMLInputElement).readOnly);
		})) as boolean;

		if (!hasInput) {
			log('ABORTA: no hay campo de búsqueda editable. Abrí "Buscar dirección" primero.');
			return;
		}

		report('ANTES de tocar nada', await describeLoadingCandidates(driver));

		log('\nInyectando 503 y tecleando…');
		await installWebViewFaultInjection(driver, [
			{
				id: 'spinner-check',
				urlPattern: 'places/autocomplete',
				mode: 'status',
				status: 503,
				body: '{"error":"Service Unavailable"}'
			}
		]);
		await clearWebViewNetworkCapture(driver);

		await setValue(driver, '');
		await driver.pause(800);
		await setValue(driver, TERM);

		await driver.pause(2000);
		report('t+2s (justo tras el fallo)', await describeLoadingCandidates(driver));

		await driver.pause(8000);
		report('t+10s', await describeLoadingCandidates(driver));

		const capture = await readWebViewNetworkCapture(driver);
		const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const state = await readWebViewFaultInjectionState(driver);
		log(`\nrequests interceptadas: ${calls.length} · hits de la regla: ${state.totalHits}`);

		if (state.totalHits === 0) {
			log('OJO: la regla no disparó, así que el 503 no llegó a la app y la observación no vale.');
		}
	} finally {
		await clearWebViewFaultInjection(driver).catch(() => undefined);
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[spinner] Error:', err.message ?? err);
	process.exit(1);
});
