/**
 * Sonda: ¿es instrumentable el WebView de un build de PRODUCCION de App PAX?
 *
 * POR QUE EXISTE. Toda la medicion de MG-116 depende de leer la red DENTRO del WebView
 * (`installWebViewNetworkCapture` inyecta JS via el contexto WEBVIEW de Appium). Ese canal usa el
 * mismo protocolo de devtools que `chrome://inspect`. Un build de release normalmente deshabilita
 * el WebView depurable, y en ese caso `getContexts()` devuelve solo NATIVE_APP: sin contexto web no
 * hay inyeccion, no hay captura, y toda conducta que se mide leyendo requests es inmedible.
 *
 * Esta sonda responde eso con un dato, no con una suposicion, ANTES de gastar una corrida completa
 * de ~15 min en un dispositivo fisico para descubrir que nada se pudo medir.
 *
 * NO escribe nada, NO toca datos: abre una sesion, pregunta los contextos, los imprime y cierra.
 *
 * Uso:
 *   ENV=prod ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.ateg.passenger \
 *   ANDROID_UDID=<udid> APPIUM_SERVER_URL=http://localhost:4723 \
 *   node --loader ts-node/esm tests/mobile/appium/scripts/probe-prod-webview.ts
 */

import { remote } from 'webdriverio';

import { resolveDriverTarget } from './_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');

async function main(): Promise<void> {
	console.log(`[sonda] ambiente=${TARGET.env}  paquete=${TARGET.appPackage}  udid=${TARGET.udid}`);

	const driver = await remote({
		hostname: new URL(TARGET.appiumUrl).hostname,
		port: Number(new URL(TARGET.appiumUrl).port || 4723),
		path: '/',
		logLevel: 'error',
		capabilities: {
			platformName: 'Android',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:automationName': 'UiAutomator2',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:udid': TARGET.udid,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:appPackage': TARGET.appPackage,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:appActivity': '.MainActivity',
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:noReset': true,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:forceAppLaunch': true,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			'appium:newCommandTimeout': 120
		}
	});

	try {
		await driver.pause(9000);

		const contexts = (await driver.getContexts().catch((e: Error) => {
			console.log(`[sonda] getContexts() FALLO: ${e.message}`);
			return [];
		})) as unknown as string[];

		console.log(`[sonda] contextos disponibles: ${JSON.stringify(contexts.map(String))}`);

		const webview = contexts.map(String).find(c => c.startsWith('WEBVIEW'));
		if (!webview) {
			console.log('[sonda] VEREDICTO: NO hay contexto WEBVIEW.');
			console.log('        El build de produccion no expone el WebView a devtools, asi que la captura de red');
			console.log('        no se puede instalar. Toda conducta que se mida leyendo requests es INMEDIBLE aca.');
			console.log('        Solo queda verificable lo observable en pantalla.');
		} else {
			console.log(`[sonda] hay contexto web: ${webview}`);
			await driver.switchContext(webview);
			await driver.pause(2500);
			const url = await driver.getUrl().catch(() => '(no se pudo leer)');
			console.log(`[sonda] URL actual: ${url}`);
			const enLogin = url.includes('/login') || url.includes('invalid_token=true');
			console.log(`[sonda] VEREDICTO: WebView instrumentable. Sesion iniciada: ${enLogin ? 'NO (esta en login)' : 'SI'}`);
		}

		// Pantalla nativa, para saber que ve el usuario aunque no haya WebView.
		await driver.switchContext('NATIVE_APP').catch(() => undefined);
		const fuente = await driver.getPageSource().catch(() => '');
		const textos = [...fuente.matchAll(/text="([^"]{3,40})"/g)].map(m => m[1]).slice(0, 12);
		console.log(`[sonda] textos visibles en la pantalla nativa: ${JSON.stringify(textos)}`);
	} finally {
		await driver.deleteSession().catch(() => undefined);
	}
}

main().catch((e: Error) => {
	console.error(`[sonda] error: ${e.message}`);
	process.exit(1);
});
