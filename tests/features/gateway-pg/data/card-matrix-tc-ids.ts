/**
 * Mapa intent → TC ID de la matriz local, por pasarela.
 * ======================================================
 *
 * Los IDs `TS-<GW>-TCxxxx` son de la matriz LOCAL del repo
 * (`docs/gateway-pg/<gw>/matriz_cases.md` + `normalized-test-cases.json`), NO keys de
 * Jira. Poblarlos no inventa trazabilidad: la crea contra un documento que ya existe.
 *
 * Las keys `MG-###` de Xray son otra cosa y van aparte (`data/xray-keys.ts`): las crea QA
 * en Jira y el código JAMÁS las fabrica. Mientras falten, el caso corre con su TC ID en el
 * título y sale `unmapped` del reporter — visible, no silencioso.
 *
 * Rango de la matriz eBizCharge (ver `docs/gateway-pg/ebizcharge/TRACEABILITY.md` §6):
 *   TC1001-1049 → outcome-level preexistente (approved / declines / CVV2 / fraud)
 *   TC1050-1099 → configuración de pasarela + alta carrier
 *   TC1100-1130 → alta App Pax + cargo a bordo
 *   TC1200-1299 → Parte 2 (contractor, quote, recurrentes, operaciones)
 *
 * Los intents de la matriz de outcomes caen en TC1001-1049, que es exactamente el rango
 * que la Fase 4 dejó intacto para los casos outcome-level.
 */

import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';

/**
 * eBizCharge — intents mapeados a su TC de matriz.
 *
 * Los IDs salen del L1 `docs/gateway-pg/ebizcharge/normalized-test-cases.json` (rango
 * outcome-level TC1001-1041, 17 casos `origin: "existing"`). Un intent sin TC declarado
 * corre sin corchete en el título: no se inventa un ID que la matriz no tenga.
 */
const EBIZCHARGE_TC_BY_INTENT: Partial<Record<CardIntent, string>> = {
	HAPPY_NO_AUTH: 'TS-EBIZ-TC1001',
	HAPPY_SLOW_PROCESSING: 'TS-EBIZ-TC1003',
	APPROVED_AVS_MISMATCH: 'TS-EBIZ-TC1002',
	DECLINE_AUTHORIZE: 'TS-EBIZ-TC1011',
	DECLINE_INSUFFICIENT_FUNDS: 'TS-EBIZ-TC1012',
	DECLINE_INVALID_TRANSACTION: 'TS-EBIZ-TC1013',
	DECLINE_RESTRICTED_CARD: 'TS-EBIZ-TC1014',
	DECLINE_INVALID_ISSUER: 'TS-EBIZ-TC1015',
	DECLINE_INVALID_CVC: 'TS-EBIZ-TC1016',
	APPROVED_CVV_MISMATCH: 'TS-EBIZ-TC1020',
	FRAUD_REVIEW: 'TS-EBIZ-TC1030',
	FRAUD_REJECT: 'TS-EBIZ-TC1031'
};

const TC_BY_GATEWAY: Record<GatewayName, Partial<Record<CardIntent, string>>> = {
	stripe: {},
	authorize: {},
	ebizcharge: EBIZCHARGE_TC_BY_INTENT,
	'mercado-pago': {}
};

/**
 * TC ID de matriz para un `(gateway, intent)`, o `null` si la matriz no define uno.
 * Firma compatible con `CardOutcomeMatrixSuiteOptions.tcIdFor`.
 */
export function cardMatrixTcIdFor(gateway: GatewayName, intent: CardIntent): string | null {
	return TC_BY_GATEWAY[gateway][intent] ?? null;
}

/** Cuántos intents tienen TC de matriz declarado — usado por el guard de trazabilidad. */
export function countMappedIntents(gateway: GatewayName): number {
	return Object.keys(TC_BY_GATEWAY[gateway]).length;
}
