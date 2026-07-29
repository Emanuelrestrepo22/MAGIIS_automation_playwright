/**
 * Cancelación PUNTUAL de viajes por ID — contraparte segura de `cleanup-travels-api.ts`.
 *
 * `cleanup-travels-api.ts` barre TODOS los viajes cancelables del carrier. El carrier 1521
 * (Remises EEUU) de TEST es COMPARTIDO entre sesiones de trabajo, así que ese barrido puede
 * cerrar viajes que otra sesión está usando como precondición. Este script cancela SOLO los
 * IDs que se le pasan por argumento — nunca descubre viajes por sí mismo.
 *
 * Endpoint + payload: los MISMOS de `cancelTravel()` en
 * `tests/features/gateway-pg/helpers/travel-cleanup.ts` (no se importa el helper porque su
 * cadena de imports usa aliases de tsconfig que el loader ts-node/esm no resuelve).
 *
 * Uso:
 *   cross-env ENV=test node --no-warnings --loader ts-node/esm \
 *     scripts/cleanup/cancel-travel-by-id.ts 67597 [67598 ...] [--retries=3]
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

const args = process.argv.slice(2);
const retriesArg = args.find((a) => a.startsWith('--retries='));
const RETRIES = retriesArg ? Math.max(1, parseInt(retriesArg.split('=')[1], 10)) : 3;
const IDS = args
	.filter((a) => !a.startsWith('--'))
	.map((a) => parseInt(a, 10))
	.filter((n) => Number.isInteger(n) && n > 0);

async function main(): Promise<void> {
	if (IDS.length === 0) throw new Error('Pasar al menos un travelId. Ej: ... cancel-travel-by-id.ts 67597');
	if (!USER || !PASS) throw new Error('USER_CARRIER/PASS_CARRIER faltan en .env.test');

	console.log(`Cancelación puntual | ${BASE_URL} | carrier=${CARRIER_ID} | ids=${IDS.join(',')} | retries=${RETRIES}`);

	const browser = await chromium.launch({ headless: true });
	const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
	const page = await ctx.newPage();

	let authHeader = '';
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
	await page.waitForTimeout(3_000);
	if (!authHeader) {
		console.log('⚠ Sin authHeader tras login — abortando.');
		await browser.close();
		process.exit(1);
	}
	console.log('Login OK (token capturado)');

	const results: Array<{ id: number; ok: boolean; detail: string }> = [];

	for (const id of IDS) {
		let ok = false;
		let detail = '';
		for (let attempt = 1; attempt <= RETRIES; attempt++) {
			const res = await page.request
				.put(`${BASE_URL}/magiis-v0.2/carriers/${CARRIER_ID}/travels/${id}/cancel`, {
					headers: { authorization: authHeader, 'content-type': 'application/json' },
					data: {
						travelId: id,
						carrierUserId: CARRIER_USER_ID,
						reasonForCancellation: '',
						canceledBy: 'CARRIER',
						name: CARRIER_NAME,
						userId: CARRIER_USER_ID,
						checkPassengerCancelation: false,
					},
				})
				.catch((e: unknown) => {
					detail = `EXC ${String(e)}`;
					return null;
				});

			if (res && res.ok()) {
				ok = true;
				detail = `${res.status()} (intento ${attempt})`;
				console.log(`✓ ${id} cancelado — ${detail}`);
				break;
			}
			if (res) detail = `${res.status()} ${res.statusText()} — ${(await res.text().catch(() => '')).slice(0, 300)}`;
			console.log(`✗ ${id} intento ${attempt}/${RETRIES} → ${detail}`);
			if (attempt < RETRIES) await page.waitForTimeout(4_000);
		}
		results.push({ id, ok, detail });
	}

	console.log('\n=== Resumen ===');
	for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.id} — ${r.detail}`);
	await browser.close();
	if (results.some((r) => !r.ok)) process.exit(2);
}

main().catch((e) => {
	console.error('ERROR', e);
	process.exit(1);
});
