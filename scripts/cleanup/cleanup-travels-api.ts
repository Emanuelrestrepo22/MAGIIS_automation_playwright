/**
 * Cleanup de viajes TEST por API (auto-descubierto) — alternativa robusta al
 * cleanup-test-travels.ts (que depende de selectores UI frágiles).
 *
 * Login carrier → intercepta los XHR GET *travel* del dashboard para juntar travelIds
 * → PUT /carriers/{id}/travels/{travelId}/cancel c/u.
 * Payload de cancelación tomado de tests/features/gateway-pg/helpers/travel-cleanup.ts.
 *
 * Uso:
 *   cross-env ENV=test node --no-warnings --loader ts-node/esm scripts/cleanup/cleanup-travels-api.ts [--dry-run]
 */
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const BASE_URL = process.env.BASE_URL ?? 'https://apps-test.magiis.com';
const USER = process.env.USER_CARRIER ?? '';
const PASS = process.env.PASS_CARRIER ?? '';
const CARRIER_ID = process.env.CARRIER_ID ?? '1521';
const CARRIER_USER_ID = process.env.CARRIER_USER_ID ?? '6715';
const CARRIER_NAME = process.env.CARRIER_DISPLAY_NAME ?? '  Remises EEUU';
const DRY = process.argv.includes('--dry-run');

// Rango amplio para capturar viajes de corridas previas (pasado y futuro cercano).
const FROM = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0, 10); })();
const TO = (() => { const d = new Date(); d.setDate(d.getDate() + 45); return d.toISOString().slice(0, 10); })();

// Estados CANCELABLES (activos). NUNCA tocar DONE ni CANCELLED.
// El tab "Por Asignar"/activo agrupa estos 3; "En Conflicto" = NO_AUTORIZADO.
const CANCELABLE_STATES = [
	'SEARCHING_DRIVER-WITH_DRIVER_ASSIGNED-RESERVED',
	'NO_AUTORIZADO',
];
const PAGE_SIZE = 100;

const travels = new Map<number, string>(); // travelId -> status
let authHeader = '';

function collectFrom(obj: unknown): void {
	if (!obj || typeof obj !== 'object') return;
	if (Array.isArray(obj)) { obj.forEach(collectFrom); return; }
	const o = obj as Record<string, unknown>;
	const id = (typeof o.travelId === 'number' ? o.travelId : (typeof o.id === 'number' ? o.id : null));
	const status = o.status ?? o.travelStatus ?? o.state ?? o.travelServerStatus;
	// Defensa: solo registrar si NO es DONE/CANCELLED.
	if (id !== null && status !== undefined) {
		const s = String(status).toUpperCase();
		if (!s.includes('DONE') && !s.includes('CANCEL')) travels.set(id, String(status));
	}
	for (const v of Object.values(o)) if (v && typeof v === 'object') collectFrom(v);
}

async function main(): Promise<void> {
	if (!USER || !PASS) throw new Error('USER_CARRIER/PASS_CARRIER faltan en .env.test');
	console.log(`Modo: ${DRY ? 'DRY-RUN' : 'LIVE'} | ${BASE_URL} | carrier=${CARRIER_ID} | rango ${FROM}..${TO}`);
	const browser = await chromium.launch({ headless: true });
	const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
	const page = await ctx.newPage();

	page.on('response', (res) => {
		const auth = res.request().headers()['authorization'];
		if (auth && res.url().includes('/magiis-v0.2/')) authHeader = auth;
	});

	console.log(`Login ${USER}...`);
	await page.goto(`${BASE_URL}/#/authentication/login/carrier`);
	await page.waitForSelector('input[formcontrolname="email"]', { timeout: 20_000 });
	await page.fill('input[formcontrolname="email"]', USER);
	await page.fill('input[formcontrolname="password"]', PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL('**/dashboard**', { timeout: 30_000, waitUntil: 'commit' });
	await page.waitForTimeout(3_000); // dejar que dispare algún XHR autenticado
	if (!authHeader) { console.log('⚠ Sin authHeader tras login — abortando.'); await browser.close(); process.exit(1); }
	console.log('Login OK (token capturado)');

	// Consultar el endpoint paginado DIRECTO por API, todas las páginas, por estado cancelable.
	for (const state of CANCELABLE_STATES) {
		for (let pg = 1; pg < 100; pg++) {
			const url = `${BASE_URL}/magiis-v0.2/carriers/${CARRIER_ID}/travels/paginated`
				+ `?page=${pg}&size=${PAGE_SIZE}&column=travelDate&sort=ASC&state=${state}`
				+ `&platform=false&find=&programmed=&travelDateFrom=${FROM}&travelDateTo=${TO}&isPaxVip=false`;
			const res = await page.request.get(url, { headers: { authorization: authHeader } }).catch(() => null);
			if (!res || !res.ok()) { if (pg === 1) console.log(`  [${state}] GET p${pg} -> ${res ? res.status() : 'ERR'}`); break; }
			const before = travels.size;
			const body = await res.json().catch(() => null);
			collectFrom(body);
			const added = travels.size - before;
			if (added === 0) break; // sin nuevos → fin de páginas para este estado
		}
	}

	console.log(`\nRecolectados ${travels.size} travelIds CANCELABLES:`);
	const byStatus: Record<string, number> = {};
	for (const [id, st] of travels) { byStatus[st] = (byStatus[st] ?? 0) + 1; console.log(`  - ${id} [${st}]`); }
	console.log(`Por estado: ${JSON.stringify(byStatus)}`);

	if (DRY) { console.log('\nDRY-RUN: no se cancela nada.'); await browser.close(); return; }

	let ok = 0, fail = 0;
	for (const [id] of travels) {
		const r = await page.request.put(`${BASE_URL}/magiis-v0.2/carriers/${CARRIER_ID}/travels/${id}/cancel`, {
			headers: { authorization: authHeader, 'content-type': 'application/json' },
			data: { travelId: id, carrierUserId: CARRIER_USER_ID, reasonForCancellation: '', canceledBy: 'CARRIER', name: CARRIER_NAME, userId: CARRIER_USER_ID, checkPassengerCancelation: false },
		}).catch(() => null);
		if (r && r.ok()) { ok++; console.log(`✓ ${id}`); } else { fail++; console.log(`✗ ${id} ${r ? r.status() : 'ERR'}`); }
	}
	console.log(`\n=== Resumen: ${ok} cancelados, ${fail} fallidos, de ${travels.size} ===`);
	await browser.close();
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
