/**
 * Utilidad de diagnóstico — vuelca los elementos con texto de la pantalla actual.
 * Usar para descubrir selectores cuando Appium Inspector no está disponible.
 *
 * Ejecutar (desde la raíz del proyecto):
 *   ANDROID_HOME=... npx ts-node tests/mobile/appium/scripts/dump-home-screen.ts
 */
import { remote } from 'webdriverio';

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http',
		hostname: 'localhost',
		port: 4723,
		path: '/',
		logLevel: 'error',
		capabilities: {
			platformName:               'Android',
			'appium:automationName':    'UiAutomator2',
			'appium:deviceName':        'SM-A055M',
			'appium:udid':              'R92XB0B8F3J',
			'appium:appPackage':        'com.magiis.app.test.driver',
			'appium:appActivity':       '.MainActivity',
			'appium:noReset':           true,
			'appium:forceAppLaunch':    true,
			'appium:newCommandTimeout': 60,
		} as Record<string, unknown>,
	});

	await driver.pause(4000);

	const src: string = await driver.getPageSource();

	// Extraer elementos con text o content-desc no vacíos
	const lines = src.split('\n').filter((l: string) =>
		(l.includes('text="') || l.includes('content-desc="')) &&
		!l.includes('text=""') &&
		!l.includes('content-desc=""')
	);

	console.log('\n=== ELEMENTOS CON TEXTO EN PANTALLA HOME ===\n');
	lines.forEach((l: string) => {
		// Extraer atributos clave: class, text, content-desc, resource-id
		const classMatch     = l.match(/class="([^"]+)"/);
		const textMatch      = l.match(/text="([^"]+)"/);
		const descMatch      = l.match(/content-desc="([^"]+)"/);
		const resourceMatch  = l.match(/resource-id="([^"]+)"/);

		const cls      = classMatch?.[1]?.split('.').pop() ?? '';
		const text     = textMatch?.[1] ?? '';
		const desc     = descMatch?.[1] ?? '';
		const resId    = resourceMatch?.[1] ?? '';

		if (text || desc) {
			console.log(`[${cls}]${resId ? ` id:${resId}` : ''} text="${text}"${desc ? ` desc="${desc}"` : ''}`);
		}
	});

	console.log('\n=== FIN DEL DUMP ===\n');

	await driver.deleteSession();
}

run().catch(e => {
	console.error('Error:', e.message);
	process.exit(1);
});
