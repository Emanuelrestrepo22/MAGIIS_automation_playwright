/**
 * Render docs/mobile/GUIA-APPIUM-MG116-MG117.html -> .pdf (A4, print styles).
 *
 * Run with NODE, never Bun: Bun hangs on Playwright's pipe transport on Windows
 * (same gotcha already documented in the boilerplate's build-onboarding-pdf.mjs,
 * which this script mirrors).
 *
 *   node scripts/render-guia-appium-pdf.mjs
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const htmlPath = resolve(root, 'docs/mobile/GUIA-APPIUM-MG116-MG117.html');
const pdfPath = resolve(root, 'docs/mobile/GUIA-APPIUM-MG116-MG117.pdf');

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
	await page.emulateMedia({ media: 'print' });
	await page.pdf({
		path: pdfPath,
		format: 'A4',
		printBackground: true,
		margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
		displayHeaderFooter: true,
		headerTemplate: '<div></div>',
		footerTemplate:
			'<div style="width:100%;font-size:8px;color:#8792a2;font-family:Segoe UI,Arial,sans-serif;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;">'
			+ '<span>Gu&#237;a Appium &#8212; MG-116 / MG-117 &#8212; MAGIIS QA</span>'
			+ '<span>P&#225;g. <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
			+ '</div>'
	});
	console.log(`OK -> ${pdfPath}`);
} finally {
	await browser.close();
}
