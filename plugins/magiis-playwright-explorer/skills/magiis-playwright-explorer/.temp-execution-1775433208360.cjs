
const playwright = global.__MAGIIS_PLAYWRIGHT__;
const { chromium, firefox, webkit, devices } = playwright;
const helpers = require('./lib/helpers');

(async () => {
	try {
console.log('magiis-playwright-explorer ok')
	} catch (error) {
		console.error('[magiis-playwright-explorer] Automation error:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
})();
