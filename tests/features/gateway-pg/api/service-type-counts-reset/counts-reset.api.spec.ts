/**
 * [MX-6057][API] Reset de contadores de uso (cupo) de service types del carrier.
 *
 * Endpoint bajo prueba: PUT /magiis-v0.2/carriers/{carrierId}/serviceTypes/countsReset
 * Bug: fallaba con ORA-00932 al resetear un service type completo (filtros null en SQL nativo);
 * fix → JPQL. Este pack automatiza la verificación por curl del ATR como regresión.
 *
 * Trazabilidad:  Bug MX-6057 · ATP MX-6115 · ATR MX-6122
 * Capa: API (contrato HTTP). La aserción de filas afectadas / aislamiento a nivel fila es
 *       DB (Oracle) y queda como validación manual en el ATR — la API solo confirma el contrato.
 *
 * ⚠ Corre contra UAT (carrier 1040). EC-REG-01 muta contadores reales (idempotente → 0).
 *   Datos overridables por env: CARRIER_ID, CARRIER_USER_ID, MX6057_ST_HAPPY, MX6057_ST_OTHER.
 */

// skips env-gated (UAT-only + infra) y `test.fixme` documentados (bloqueados por PO / datos UAT
// pendientes) son intencionales en este pack de regresión.
/* eslint-disable playwright/no-skipped-test, playwright/expect-expect */

import { test, expect } from '../../../../TestBase';
import { resetCarrierServiceTypeCounts } from '../../helpers/carrier-service-type-counts-reset';
import { LoginPage } from '../../../../pages/shared/LoginPage';
import { extractAuthToken } from '../../helpers/card-precondition';

// Datos UAT (ATR MX-6122 / ATP MX-6115) — overridables por env.
const CARRIER_ID = process.env.CARRIER_ID ?? '1040'; // carrier UAT del ATR
const USER_ID = Number(process.env.CARRIER_USER_ID ?? 1380); // auditoría → reset_user_id
const ST_HAPPY = Number(process.env.MX6057_ST_HAPPY ?? 135); // service type del carrier con uso
const ST_OTHER_CARRIER = Number(process.env.MX6057_ST_OTHER ?? 76); // ST del carrier 1481 (aislamiento)
const ST_NONEXISTENT = 99_999_999;
const CARRIER_NONEXISTENT = 99_999_999;
// Contractor "dark empire v1.72.6" (contractorAccountId 1741) + colaborador Anakin (empId 2098) +
// ST con cupo v1.72.6 (467). Datos UAT provistos por QA. Arturitu = empId 3155 (misma empresa 1741).
const CONTRACTOR_ID = Number(process.env.MX6057_CONTRACTOR_ID ?? 1741);
const EMP_A = Number(process.env.MX6057_EMP_A ?? 2098);
const ST_QUOTA = Number(process.env.MX6057_ST_QUOTA ?? 467);

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);

test.describe('[MX-6057][API] serviceTypes/countsReset @regression @service-type-quota', () => {
	test.use({ role: 'carrier' });
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL — configurar .env.uat');
	test.skip(process.env.ENV === 'test', 'countsReset se valida en UAT');

	let authToken: string;

	// Login por UI UNA sola vez (el endpoint de API-login no está configurado en .env); el token
	// se extrae interceptando el header Authorization del SPA (patrón del smoke spec). En beforeAll
	// para no re-loguear por test y reducir la fragilidad de la interceptación (+ retry).
	test.beforeAll(async ({ browser }) => {
		if (!CREDS_READY || process.env.ENV === 'test') return;
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

	test('[EC-REG-01][EC-DT-02][AC1] reset de service type completo → 200 + "true" (sin ORA-00932)', {
		annotation: [
			{ type: 'tms', description: 'MX-6132' },
			{ type: 'issue', description: 'MX-6057' }
		]
	}, async ({ request }) => {
		// Gate de regresión: la operación responde 200 en lugar de 500/SQLGrammarException.
		const res = await resetCarrierServiceTypeCounts(request, {
			carrierId: CARRIER_ID,
			serviceTypeId: ST_HAPPY,
			userId: USER_ID,
			authToken
		});
		expect(res.status, `esperado 200, body=${res.body}`).toBe(200);
		expect(res.body).toBe('true');
	});

	test('[EC-EP-01] serviceTypeId inexistente → 200 + "true" (no-op, sin validación de input)', async ({ request }) => {
		const res = await resetCarrierServiceTypeCounts(request, {
			carrierId: CARRIER_ID,
			serviceTypeId: ST_NONEXISTENT,
			userId: USER_ID,
			authToken
		});
		expect(res.status).toBe(200);
		expect(res.body).toBe('true');
	});

	test('[EC-ISO-01] serviceType de otro carrier bajo carrierId propio → 200 (aislamiento cross-carrier)', async ({ request }) => {
		// API confirma 200; la NO-afectación del carrier ajeno es aserción DB (manual — ATR).
		const res = await resetCarrierServiceTypeCounts(request, {
			carrierId: CARRIER_ID,
			serviceTypeId: ST_OTHER_CARRIER,
			userId: USER_ID,
			authToken
		});
		expect(res.status).toBe(200);
	});

	test('[EC-NEG-CARRIER] carrierId inexistente → 404 CARRIER_NOT_FOUND', async ({ request }) => {
		// Único error real del endpoint (BaseController: CARRIER_NOT_FOUND).
		const res = await resetCarrierServiceTypeCounts(request, {
			carrierId: CARRIER_NONEXISTENT,
			serviceTypeId: ST_HAPPY,
			userId: USER_ID,
			authToken
		});
		expect(res.status).toBe(404);
	});

	// --- Pendientes: bloqueados por decisión de PO o por datos UAT a derivar en vivo ---

	test('[EC-DT-01] body vacío (todos los filtros null) → reset masivo del carrier', async () => {
		test.fixme(true, 'Destructivo en UAT + pendiente política de PO (¿permitir body vacío o 400?)');
	});

	test('[EC-NEG-01] userId null → reset_user_id NULL (pérdida de auditoría)', async () => {
		test.fixme(true, 'Pendiente PO (¿userId @NotNull?) + la aserción de reset_user_id=NULL es DB');
	});

	test('[EC-ISO-02] aislamiento cross-contractor (mismo carrier)', async () => {
		test.fixme(true, 'Requiere 2 contractorId de UAT + aserción de filas es DB — derivar en vivo');
	});

	// EC-DT-03..08: filtros individuales/combinados con datos reales de UAT (contractor 1741 +
	// colaborador Anakin 2098 + ST v1.72.6 467). Assert = 200 `true` (el efecto por-fila es DB).
	type ComboOpts = Partial<Record<'serviceTypeId' | 'contractorId' | 'contractorEmployeeId', number>>;
	const COMBOS: { id: string; desc: string; opts: ComboOpts }[] = [
		{ id: 'EC-DT-03', desc: 'solo contractorId (010)', opts: { contractorId: CONTRACTOR_ID } },
		{ id: 'EC-DT-04', desc: 'solo contractorEmployeeId (001, AC4)', opts: { contractorEmployeeId: EMP_A } },
		{ id: 'EC-DT-05', desc: 'serviceTypeId + contractorId (110)', opts: { serviceTypeId: ST_QUOTA, contractorId: CONTRACTOR_ID } },
		{ id: 'EC-DT-06', desc: 'serviceTypeId + contractorEmployeeId (101)', opts: { serviceTypeId: ST_QUOTA, contractorEmployeeId: EMP_A } },
		{ id: 'EC-DT-07', desc: 'contractorId + contractorEmployeeId (011)', opts: { contractorId: CONTRACTOR_ID, contractorEmployeeId: EMP_A } },
		{ id: 'EC-DT-08', desc: 'serviceTypeId + contractorId + contractorEmployeeId (111)', opts: { serviceTypeId: ST_QUOTA, contractorId: CONTRACTOR_ID, contractorEmployeeId: EMP_A } }
	];
	for (const c of COMBOS) {
		test(`[${c.id}] ${c.desc} → 200`, async ({ request }) => {
			const res = await resetCarrierServiceTypeCounts(request, {
				carrierId: CARRIER_ID,
				userId: USER_ID,
				authToken,
				...c.opts
			});
			expect(res.status, `esperado 200, body=${res.body}`).toBe(200);
			expect(res.body).toBe('true');
		});
	}
});
