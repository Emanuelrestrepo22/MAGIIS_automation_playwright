#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

process.chdir(__dirname);

function resolvePlaywright() {
	const candidates = [
		process.cwd(),
		path.resolve(__dirname, '../../../../'),
		__dirname
	];

	for (const base of candidates) {
		try {
			const scopedRequire = createRequire(path.join(base, 'package.json'));
			return scopedRequire('playwright');
		} catch (error) {
			// Try next base path.
		}
	}

	throw new Error(
		'Could not resolve Playwright. Ensure the project root dependency is installed.'
	);
}

function getCodeToExecute() {
	const args = process.argv.slice(2);

	if (args.length > 0 && fs.existsSync(args[0])) {
		const filePath = path.resolve(args[0]);
		console.log(`[magiis-playwright-explorer] Executing file: ${filePath}`);
		return fs.readFileSync(filePath, 'utf8');
	}

	if (args.length > 0) {
		console.log('[magiis-playwright-explorer] Executing inline code');
		return args.join(' ');
	}

	if (!process.stdin.isTTY) {
		return fs.readFileSync(0, 'utf8');
	}

	throw new Error('No code provided. Pass a file, inline code, or stdin.');
}

function cleanupOldTempFiles() {
	try {
		const files = fs.readdirSync(__dirname);
		for (const file of files) {
			if (file.startsWith('.temp-execution-') && file.endsWith('.cjs')) {
				try {
					fs.unlinkSync(path.join(__dirname, file));
				} catch (error) {
					// Ignore cleanup errors.
				}
			}
		}
	} catch (error) {
		// Ignore cleanup errors.
	}
}

function wrapCodeIfNeeded(code) {
	const hasRequire = code.includes('require(');
	const hasAsyncIIFE =
		code.includes('(async () => {') || code.includes('(async()=>{');

	if (hasRequire && hasAsyncIIFE) {
		return code;
	}

	if (!hasRequire) {
		return `
const playwright = global.__MAGIIS_PLAYWRIGHT__;
const { chromium, firefox, webkit, devices } = playwright;
const helpers = require('./lib/helpers');

(async () => {
	try {
${code}
	} catch (error) {
		console.error('[magiis-playwright-explorer] Automation error:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
})();
`;
	}

	if (!hasAsyncIIFE) {
		return `
(async () => {
	try {
${code}
	} catch (error) {
		console.error('[magiis-playwright-explorer] Automation error:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
})();
`;
	}

	return code;
}

async function main() {
	cleanupOldTempFiles();
	const playwright = resolvePlaywright();
	const rawCode = getCodeToExecute();
	const code = wrapCodeIfNeeded(rawCode);
	const tempFile = path.join(__dirname, `.temp-execution-${Date.now()}.cjs`);

	global.__MAGIIS_PLAYWRIGHT__ = playwright;
	fs.writeFileSync(tempFile, code, 'utf8');

	try {
		require(tempFile);
	} catch (error) {
		console.error('[magiis-playwright-explorer] Execution failed:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

main().catch(error => {
	console.error('[magiis-playwright-explorer] Fatal error:', error.message);
	process.exit(1);
});
