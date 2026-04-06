const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
	return dirPath;
}

function getRepoRoot() {
	return path.resolve(__dirname, '../../../../../');
}

function getEvidenceDir() {
	return ensureDir(path.join(getRepoRoot(), 'evidence', 'explorer'));
}

function ensureExplorerTempDir() {
	return ensureDir(path.join(getEvidenceDir(), 'tmp'));
}

function getMagiisTargets() {
	return {
		base: process.env.BASE_URL ?? null,
		carrier: process.env.CARRIER_URL ?? process.env.BASE_URL ?? null,
		contractor: process.env.CONTRACTOR_URL ?? null,
		pax: process.env.PAX_URL ?? null
	};
}

async function createBrowser(playwright, options = {}) {
	const browserType = options.browserType ?? 'chromium';
	const headless = options.headless ?? false;
	const slowMo = options.slowMo ?? 100;
	return playwright[browserType].launch({ headless, slowMo });
}

async function takeTimestampedScreenshot(page, name = 'explorer') {
	const evidenceDir = getEvidenceDir();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filePath = path.join(evidenceDir, `${name}-${timestamp}.png`);
	await page.screenshot({ path: filePath, fullPage: true });
	console.log(`[magiis-playwright-explorer] Screenshot saved to ${filePath}`);
	return filePath;
}

module.exports = {
	ensureDir,
	getRepoRoot,
	getEvidenceDir,
	ensureExplorerTempDir,
	getMagiisTargets,
	createBrowser,
	takeTimestampedScreenshot
};
