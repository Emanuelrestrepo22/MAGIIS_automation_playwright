/**
 * [MX-6057][DB] countsReset — verificación de EFECTO (capa DB, read-only via oracledb Thin mode).
 *
 * Complementa el pack de contrato `counts-reset.api.spec.ts`: la API confirma 200/`true`, pero el
 * reseteo REAL (trips_pending/trips_done → 0), la auditoría (reset_user_id) y que `extra_limit` NO
 * se resetea son aserciones de fila que solo se ven en DB. Cubre EC-DT-02/AC1 (efecto) + EC-AUD-01.
 *
 * Doble gate: requiere conexión Oracle (`ORACLE_*`) + creds carrier (`USER_CARRIER`/`PASS_CARRIER`).
 * Sin cualquiera de las dos, skipea (no rompe la suite). Corre en UAT.
 * El token se obtiene por login UI (no hay endpoint de API-login configurado) — patrón del pack API.
 */

/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '../../../../TestBase';
import { resetCarrierServiceTypeCounts } from '../../helpers/carrier-service-type-counts-reset';
import { oracleConfigFromEnv, readServiceUsageByEmployee } from '../../helpers/oracle-service-usage';
import { LoginPage } from '../../../../pages/shared/LoginPage';
import { extractAuthToken } from '../../helpers/card-precondition';

const CARRIER_ID = process.env.CARRIER_ID ?? '1040';
const USER_ID = Number(process.env.CARRIER_USER_ID ?? 1380);
const EMP_A = Number(process.env.MX6057_EMP_A ?? 2098); // Anakin (contractorEmployeeId, contractor 1741)
const ST_QUOTA = Number(process.env.MX6057_ST_QUOTA ?? 467); // v1.72.6 (service type con cupo)

const ORACLE = oracleConfigFromEnv();
const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);

test.describe('[MX-6057][DB] countsReset — verificación de efecto @regression @service-type-quota', () => {
	test.use({ role: 'carrier' });
	test.skip(!ORACLE, 'Sin conexión Oracle (ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING) — capa DB');
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL');
	// La trifuerza DB ahora SÍ se valida en TEST (magiis-test-v2, credenciales ORACLE_*_TEST).
	// El único gate real es tener conexión Oracle + creds carrier resueltas (arriba).

	let authToken: string;

	test.beforeAll(async ({ browser }) => {
		if (!ORACLE || !CREDS_READY) return;
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			const login = new LoginPage(page, 'carrier');
			await login.goto();
			await login.login(process.env.USER_CARRIER as string, process.env.PASS_CARRIER as string);
			await page.waitForURL(/dashboard/, { timeout: 30_000 });
			let token: string | null = null;
			for (let attempt = 0; attempt < 3 && !token; attempt++) {
				token = await extractAuthToken(page);
			}
			expect(token, 'no se pudo extraer el JWT del SPA tras el login').toBeTruthy();
			authToken = token as string;
		} finally {
			await context.close();
		}
	});

	test('[EC-DT-02/AC1][EC-AUD-01] reset por colaborador → contadores en 0, reset_user_id seteado, extra_limit intacto', async ({ request }) => {
		const config = ORACLE!;
		const before = await readServiceUsageByEmployee(config, EMP_A);

		const res = await resetCarrierServiceTypeCounts(request, {
			carrierId: CARRIER_ID,
			serviceTypeId: ST_QUOTA,
			contractorEmployeeId: EMP_A,
			userId: USER_ID,
			authToken
		});
		expect(res.status, `countsReset esperado 200, body=${res.body}`).toBe(200);

		const after = await readServiceUsageByEmployee(config, EMP_A);
		expect(after.length, 'debe existir al menos una fila de uso para el colaborador').toBeGreaterThan(0);

		for (const row of after) {
			expect(row.tripsPending, 'trips_pending reseteado a 0').toBe(0);
			expect(row.tripsDone, 'trips_done reseteado a 0').toBe(0);
			expect(row.resetUserId, 'reset_user_id = userId de auditoría').toBe(USER_ID);
		}

		// EC-AUD-01: extra_limit NO se resetea (se conserva respecto del before).
		if (before.length === after.length) {
			for (let i = 0; i < after.length; i++) {
				expect(after[i].extraLimit, 'extra_limit NO debe resetearse').toBe(before[i].extraLimit);
			}
		}
	});
});
