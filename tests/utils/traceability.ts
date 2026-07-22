/**
 * traceability.ts — helper canónico de trazabilidad TMS (contrato del orquestador).
 *
 * Empuja las annotations que consumen el reporter Xray (`tests/utils/reporters/xray-reporter.ts`,
 * lee `type:'tms'`) y los links de Allure (`type:'tms'`/`type:'issue'` → magiis.atlassian.net).
 * Consistente con `tests/utils/traceability.ts` de magiis-api-e2e y magiis-carrier-v2-e2e.
 *
 * Uso dentro de un test:
 *   import { annotate } from '@utils/traceability';   // o ruta relativa
 *   test('...', async ({ page }, testInfo) => {
 *     annotate(testInfo, { tms: 'MG-XXXX', tc: 'TS-STRIPE-P2-TC001', issue: 'MG-XXXX' });
 *     // ...
 *   });
 *
 * - `tms`   → key del Test en el TMS. MG (jira-native) tras la migración MX→MG; las MX-XXXX que
 *             ya aparezcan en specs son HISTÓRICAS (Xray MX), pendientes de mapeo. NO fabricar keys MG.
 * - `tc`    → TC-ID interno de la matriz (docs/gateway-pg/<gateway>/matriz_cases*.md).
 * - `issue` → ticket de negocio (MG-XXXX) para el link de Allure.
 *
 * Grano recomendado (ver .agents/project.yaml): annotation a nivel suite/ATP.
 * Sin `tms` el spec NO se exporta a Xray (gap visible en el resumen del reporter) — es esperado
 * hasta que exista el Xray Test correspondiente.
 */
import type { TestInfo } from '@playwright/test';

export interface Traceability {
	/** Key del Test en el TMS — MG-XXXX (jira-native) tras MX→MG; MX-XXXX histórico. Prioridad en el reporter. */
	tms?: string;
	/** TC-ID interno de la matriz de casos (SoT de IDs del repo). */
	tc?: string;
	/** Ticket de negocio — MG-XXXX. Alimenta el link `issue` de Allure. */
	issue?: string;
}

/**
 * Empuja las annotations de trazabilidad en el TestInfo actual. No-op para claves ausentes.
 * Fail-fast: `testInfo` es obligatorio (contrato público).
 */
export function annotate(testInfo: TestInfo, refs: Traceability): void {
	if (!testInfo) throw new Error('[traceability] testInfo es obligatorio');
	if (refs.tms) testInfo.annotations.push({ type: 'tms', description: refs.tms });
	if (refs.tc) testInfo.annotations.push({ type: 'tc', description: refs.tc });
	if (refs.issue) testInfo.annotations.push({ type: 'issue', description: refs.issue });
}
