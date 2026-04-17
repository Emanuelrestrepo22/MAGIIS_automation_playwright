/**
 * Limpieza de viajes en ambiente TEST.
 *
 * Elimina todos los viajes en "Por Asignar" y cancela los de "En Conflicto"
 * usando los selectores del portal carrier en apps-test.magiis.com.
 *
 * Uso:
 *   pnpm tsx scripts/cleanup/cleanup-test-travels.ts
 *   pnpm tsx scripts/cleanup/cleanup-test-travels.ts --dry-run   (solo cuenta, no elimina)
 */
// Usar el chromium que viene empaquetado con @playwright/test (1.56.1 → chromium-1194)
// para evitar mismatches con el playwright standalone que apunta a chromium-1200.
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const BASE_URL  = process.env.BASE_URL  ?? 'https://apps-test.magiis.com';
const USER      = process.env.USER_CARRIER ?? '';
const PASS      = process.env.PASS_CARRIER ?? '';
const HEADLESS  = process.env.HEADLESS === 'true';
const DRY_RUN   = process.argv.includes('--dry-run');

const END_DATE   = new Date().toISOString().slice(0, 10);
const START_DATE = (() => {
	const d = new Date();
	d.setDate(d.getDate() - 30);
	return d.toISOString().slice(0, 10);
})();
const DASHBOARD_URL = `${BASE_URL}/#/home/carrier/travel/dashboard?find=&startDate=${START_DATE}&endDate=${END_DATE}`;

// Último botón rojo en la primera fila (robusto ante variación de columnas por tipo de viaje).
// En Por Asignar la columna de acciones es la última y el delete es el último botón rojo.
const BTN_ACTION_ROW = 'table tbody tr:first-child button.action-btn.action-btn-red';

// Modal raíz de cancelación — Angular lo monta siempre en el DOM; solo está activo cuando abre.
const MODAL_ROOT = 'app-modal-cancel-travel';

async function waitForTableStable(page: Page): Promise<void> {
	await page.waitForSelector('table tbody', { state: 'visible', timeout: 15_000 }).catch(() => {});
	await page.waitForTimeout(600);
}

async function getTabCount(page: Page, tabText: string): Promise<number> {
	const tab = page.locator('tabset ul li a').filter({ hasText: new RegExp(tabText, 'i') }).first();
	const text = await tab.innerText().catch(() => '0');
	const match = text.match(/\((\d+)\)/);
	return match ? parseInt(match[1], 10) : 0;
}

async function processTab(
	page: Page,
	label: string,
): Promise<number> {
	let count = 0;

	while (true) {
		await waitForTableStable(page);

		// Siempre tomamos el ÚLTIMO botón rojo de la primera fila — es el de eliminar/cancelar.
		const redBtns = page.locator(BTN_ACTION_ROW);
		const btnCount = await redBtns.count();
		if (btnCount === 0) {
			console.log(`[${label}] Sin más filas — total procesadas: ${count}`);
			break;
		}
		const btn = redBtns.last();

		if (DRY_RUN) {
			count++;
			const tabCount = await getTabCount(page, label);
			console.log(`[DRY-RUN][${label}] Fila ${count} detectada — quedan ~${tabCount}`);
			break;
		}

		await btn.click({ force: true });

		// Esperar la apertura completa del modal Bootstrap (clase .show en el div interno)
		const modalDialog = page.locator(`${MODAL_ROOT} div[role="dialog"].show, ${MODAL_ROOT} div.modal.show`);
		const modalOpened = await modalDialog.waitFor({ state: 'visible', timeout: 6_000 })
			.then(() => true)
			.catch(() => false);

		if (modalOpened) {
			// Scoped al modal activo para evitar colisiones con otros modales Angular en el DOM
			const cancelModal = page.locator(MODAL_ROOT);
			const confirmBtn = cancelModal.getByRole('button', { name: /continuar/i });
			await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
			await confirmBtn.click();
			// Esperar cierre completo — el div.show desaparece cuando la animación termina
			await modalDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
			await page.waitForTimeout(300);
			count++;
			console.log(`[${label}] ✓ Viaje #${count} procesado`);
		} else {
			// Modal no abrió — el viaje podría tener un estado especial. Escape + skip.
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);
			console.log(`[${label}] ⚠ Viaje #${count + 1} sin modal — ignorado`);
			const stillThere = await redBtns.last().isVisible().catch(() => false);
			if (stillThere) break; // evitar loop infinito si el botón no triggerea nada
		}
	}

	return count;
}

async function clickTab(page: Page, tabText: string): Promise<void> {
	// Esperar que no haya modales bloqueando el DOM antes de navegar
	await page.locator('div[bsmodal].show, div.modal.show').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
	const tab = page.locator('tabset ul li a').filter({ hasText: new RegExp(tabText, 'i') }).first();
	await tab.waitFor({ state: 'visible', timeout: 10_000 });
	await tab.click();
	await page.waitForTimeout(1_200);
}

async function main(): Promise<void> {
	if (!USER || !PASS) {
		throw new Error('USER_CARRIER / PASS_CARRIER no están definidos en .env.test');
	}

	console.log(`Modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : 'LIVE'} | headless=${HEADLESS}`);
	console.log(`Target: ${BASE_URL}`);

	const browser = await chromium.launch({ headless: HEADLESS, slowMo: DRY_RUN ? 0 : 200 });
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const page    = await context.newPage();

	try {
		// --- Login ---
		console.log(`\nLogin como ${USER}...`);
		await page.goto(`${BASE_URL}/#/authentication/login/carrier`);
		await page.waitForSelector('input[formcontrolname="email"]', { timeout: 20_000 });
		await page.fill('input[formcontrolname="email"]', USER);
		await page.fill('input[formcontrolname="password"]', PASS);
		await page.click('button[type="submit"]');
		await page.waitForURL('**/dashboard**', { timeout: 30_000, waitUntil: 'commit' });
		console.log('Login OK');

		// --- Ir al dashboard de viajes ---
		await page.goto(DASHBOARD_URL);
		await page.waitForSelector('tabset', { timeout: 20_000 });
		console.log('Dashboard de viajes cargado');

		// --- Por Asignar (pestaña por defecto) ---
		const asignarCount = await getTabCount(page, 'asignar');
		console.log(`\n[Por Asignar] ${asignarCount} viajes detectados`);
		const deleted = await processTab(page, 'Por Asignar');

		// --- En Conflicto ---
		const conflictoCount = await getTabCount(page, 'conflicto');
		console.log(`\n[En Conflicto] ${conflictoCount} viajes detectados`);
		if (conflictoCount > 0) {
			await clickTab(page, 'conflicto');
			const cancelled = await processTab(page, 'En Conflicto');
			console.log(`\n=== Resumen ===`);
			console.log(`Por Asignar eliminados : ${deleted}`);
			console.log(`En Conflicto cancelados: ${cancelled}`);
		} else {
			console.log(`\n=== Resumen ===`);
			console.log(`Por Asignar eliminados : ${deleted}`);
			console.log(`En Conflicto           : 0 (nada que hacer)`);
		}
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error('ERROR:', err);
	process.exit(1);
});
