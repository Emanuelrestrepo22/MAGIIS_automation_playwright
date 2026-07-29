/**
 * Registry Xray por pasarela — Fase 3 seams (S2, carrier/gateway-standardization).
 * ================================================================================
 *
 * Fuente de verdad LOCAL del mapeo caso → key Jira/Xray (MG-###) por pasarela,
 * verificado contra Jira (2026-07-25). Lo consumen:
 *   - los adapters (`helpers/adapters/*` — campo `xrayKeys`),
 *   - las factories parametrizadas (S6: annotation `{type:'tms',description:<key>}`
 *     POR TEST, resuelta DENTRO del loop por pasarela),
 *   - el wiring de Test Executions por pasarela (S9/runbook).
 *
 * REGLAS (load-bearing para la trazabilidad emit-all del xray-reporter):
 *   1. Key `null` = el caso NO tiene issue Xray todavía → NO emitir annotation
 *      (el reporter lo cuenta como unmapped visible; JAMÁS inventar keys).
 *   2. Los TC IDs de matriz (`TS-<GW>-TCxxxx`) van en el TÍTULO del test generado:
 *      `[TS-<GW>-TCxxxx] Validar ...`. `null` = la matriz de esa pasarela aún no
 *      define el caso (eBiz/MP sin CFG en matriz — TODO).
 *   3. Las keys de ATC son estructurales (decorator `@atc('MG-###')` en el wrapper
 *      por pasarela del POM) — NO salen de este registry.
 *
 * Simetría CFG Stripe/Authorize confirmada por summaries en Jira; matrices canónicas:
 * `docs/gateway-pg/stripe/matriz_cases.md` (TC1001..1008) y
 * `docs/gateway-pg/authorize/matriz_cases.md` §1 (TC1001..1008, espejo).
 */

import type { GatewayCompany } from '@ui/carrier';

/** Key de issue Jira/Xray del proyecto MG. */
export type XrayIssueKey = `MG-${number}`;

/**
 * Casos del área CFG (Configuración de pasarela en Magiis App Store), en el orden
 * canónico de la matriz TC1001..TC1008 (mismo orden en Stripe y Authorize).
 */
export type GatewayCfgCase =
	| 'viewUnlinked' /*      TC1001 — visualizar pasarela no vinculada */
	| 'linkValid' /*         TC1002 — vincular con credenciales válidas */
	| 'linkInvalid' /*       TC1003 — impedir vincular con credenciales inválidas */
	| 'cancelUnlink' /*      TC1004 — cancelar el popup de desvinculación */
	| 'unlink' /*            TC1005 — desvincular pasarela */
	| 'exclusivity' /*       TC1006 — exclusividad de pasarela activa */
	| 'reloadPersistence' /* TC1007 — persistencia de estado tras reload */
	| 'linkStatus'; /*       TC1008 — status de la request de link/unlink */

/** Registry Xray + matriz de una pasarela. `null` = sin key/TC todavía (no inventar). */
export type GatewayXrayRegistry = {
	/** Keys Xray del área CFG (App Store), por caso canónico. */
	cfg: Record<GatewayCfgCase, XrayIssueKey | null>;
	/** TC IDs de matriz (`TS-<GW>-TCxxxx`) del área CFG, por caso canónico. */
	cfgTcIds: Record<GatewayCfgCase, string | null>;
	/** Keys Xray del área WAL (wallet / alta de tarjeta). */
	wallet: {
		/** Alta de tarjeta (add-card). Authorize: MG-285 (rango WAL completo MG-285..304). */
		addCard: XrayIssueKey | null;
	};
};

/**
 * Registry por pasarela — datos VERIFICADOS en Jira (2026-07-25). Usar tal cual.
 * eBizCharge / Mercado Pago: sin issues CFG/WAL creados aún → `null` (TODO cuando
 * QA cree las issues espejo en MG).
 */
export const XRAY_KEYS_BY_GATEWAY: Record<GatewayCompany, GatewayXrayRegistry> = {
	stripe: {
		cfg: {
			viewUnlinked: 'MG-211',
			linkValid: 'MG-212',
			linkInvalid: 'MG-213',
			cancelUnlink: 'MG-214',
			unlink: 'MG-215',
			exclusivity: 'MG-216',
			reloadPersistence: 'MG-217',
			linkStatus: 'MG-218'
		},
		cfgTcIds: {
			viewUnlinked: 'TS-STRIPE-TC1001',
			linkValid: 'TS-STRIPE-TC1002',
			linkInvalid: 'TS-STRIPE-TC1003',
			cancelUnlink: 'TS-STRIPE-TC1004',
			unlink: 'TS-STRIPE-TC1005',
			exclusivity: 'TS-STRIPE-TC1006',
			reloadPersistence: 'TS-STRIPE-TC1007',
			linkStatus: 'TS-STRIPE-TC1008'
		},
		wallet: { addCard: 'MG-284' }
	},
	authorize: {
		cfg: {
			viewUnlinked: 'MG-219',
			linkValid: 'MG-220',
			linkInvalid: 'MG-221',
			cancelUnlink: 'MG-222',
			unlink: 'MG-223',
			exclusivity: 'MG-224',
			reloadPersistence: 'MG-225',
			linkStatus: 'MG-226'
		},
		// Matriz authorize/matriz_cases.md §1 — espejo TC1001..1008 de Stripe.
		cfgTcIds: {
			viewUnlinked: 'TS-AUTHORIZE-TC1001',
			linkValid: 'TS-AUTHORIZE-TC1002',
			linkInvalid: 'TS-AUTHORIZE-TC1003',
			cancelUnlink: 'TS-AUTHORIZE-TC1004',
			unlink: 'TS-AUTHORIZE-TC1005',
			exclusivity: 'TS-AUTHORIZE-TC1006',
			reloadPersistence: 'TS-AUTHORIZE-TC1007',
			linkStatus: 'TS-AUTHORIZE-TC1008'
		},
		// WAL authorize = MG-285..304; add-card (spec actual) = MG-285.
		wallet: { addCard: 'MG-285' }
	},
	ebizcharge: {
		// Las issues CFG de eBizCharge NO existen en Jira todavía → keys en null, sin
		// annotation, `unmapped` visible en el reporter. Las keys las crea QA; el código
		// jamás las fabrica. Lista de las que hay que crear:
		// docs/gateway-pg/ebizcharge/MG-KEYS-REQUEST.md
		cfg: {
			viewUnlinked: null,
			linkValid: null,
			linkInvalid: null,
			cancelUnlink: null,
			unlink: null,
			exclusivity: null,
			reloadPersistence: null,
			linkStatus: null
		},
		// Los TC IDs de matriz SÍ existen desde la Fase 4 (derivación del L1 Stripe):
		// docs/gateway-pg/ebizcharge/matriz_cases.md:55-62 + normalized-test-cases.json.
		// Son IDs LOCALES de la matriz, no keys de Jira: poblarlos no inventa nada, y
		// recupera el `[TS-EBIZ-TCxxxx]` en el título de cada caso.
		cfgTcIds: {
			viewUnlinked: 'TS-EBIZ-TC1050',
			linkValid: 'TS-EBIZ-TC1051',
			linkInvalid: 'TS-EBIZ-TC1052',
			cancelUnlink: 'TS-EBIZ-TC1053',
			unlink: 'TS-EBIZ-TC1054',
			exclusivity: 'TS-EBIZ-TC1055',
			reloadPersistence: 'TS-EBIZ-TC1056',
			linkStatus: 'TS-EBIZ-TC1057'
		},
		wallet: { addCard: null }
	},
	'mercado-pago': {
		// TODO: Mercado Pago aún sin issues CFG en Jira ni TC IDs de matriz para CFG.
		cfg: {
			viewUnlinked: null,
			linkValid: null,
			linkInvalid: null,
			cancelUnlink: null,
			unlink: null,
			exclusivity: null,
			reloadPersistence: null,
			linkStatus: null
		},
		cfgTcIds: {
			viewUnlinked: null,
			linkValid: null,
			linkInvalid: null,
			cancelUnlink: null,
			unlink: null,
			exclusivity: null,
			reloadPersistence: null,
			linkStatus: null
		},
		wallet: { addCard: null }
	}
};

/**
 * Casos del pack de CONTRATO del sandbox Authorize (`api/authorize-sandbox/*`), en el
 * orden de los 4 spec files: happy → decline → cvv/avs → edge.
 */
export type AuthorizeContractCase =
	| 'happyVisa' /*       Visa + CVV 900 + ZIP neutro → Response Code 1 */
	| 'happyMastercard' /* Mastercard + CVV 900 + ZIP neutro → Response Code 1 */
	| 'happyAmex' /*       Amex + CVV 4 dígitos + ZIP neutro → Response Code 1 */
	| 'echoCvv' /*         echo cvvResultCode "M" (contrato Security Settings) */
	| 'declineZip46282' /* ZIP 46282 → Response Code 2 (decline genérico) */
	| 'cvv901' /*          CVV 901 → cvvResultCode "N" */
	| 'cvv904' /*          CVV 904 → cvvResultCode "P" */
	| 'avs46205' /*        ZIP 46205 → avsResultCode "N" */
	| 'happyDiscover' /*   Discover + CVV 900 → Response Code 1 */
	| 'avs46204' /*        ZIP 46204 → avsResultCode "G" (issuer no-USA) */
	| 'partial46225' /*    ZIP 46225 → aprobación parcial */
	| 'prepaid46228'; /*   ZIP 46228 → prepaid balance cero procesado */

/**
 * Keys Xray del pack de CONTRATO del sandbox Authorize — issues REALES creadas en MG
 * el 2026-07-28 y verificadas en Jira; miembros del Test Execution `MG-558` y del
 * Test Set `MG-602` ("ATP · SBX — Contrato sandbox Authorize.Net (BL-036)").
 *
 * TCID LOCAL (label `tcid:` en Jira, área SBX del idmap del ATP):
 *   MG-590 = TC-PAY-SBX-01 · MG-591 = TC-PAY-SBX-02 · MG-592 = TC-PAY-SBX-03
 *   MG-593 = TC-PAY-SBX-04 · MG-594 = TC-PAY-SBX-05 · MG-595 = TC-PAY-SBX-06
 *   MG-596 = TC-PAY-SBX-07 · MG-597 = TC-PAY-SBX-08 · MG-598 = TC-PAY-SBX-09
 *   MG-599 = TC-PAY-SBX-10 · MG-600 = TC-PAY-SBX-11 · MG-601 = TC-PAY-SBX-12
 * Los summaries en Jira siguen el estándar del generador del ATP:
 * `MG-602 | TC<n>: Validar …` (n = 1..12, mismo orden que este registry).
 *
 * NIVEL DE ABSTRACCIÓN (load-bearing — no reutilizar estas keys para otra cosa):
 * estos 12 Tests acreditan el CONTRATO del sandbox de Authorize.net (la respuesta del
 * PSP: `responseCode`, `cvvResultCode`, `avsResultCode`), NO el flujo UI de Alta de
 * Viaje que describen los TC de matriz `TS-AUTHORIZE-TC1016/1021/1031/1041` & co.
 * Cablear estos contract tests API a esos TC de matriz sería INFLAR EVIDENCIA: el test
 * solo verifica lo que devuelve la pasarela, no que el viaje se cree (ni el estado en
 * DB, ni el error en UI). El flujo UI de esos TC sigue SIN automatizar — gap declarado
 * en `docs/gateway-pg/authorize/matriz_cases.md` §§2.2-2.5.
 */
export const AUTHORIZE_CONTRACT_XRAY_KEYS: Record<AuthorizeContractCase, XrayIssueKey> = {
	happyVisa: 'MG-590', /*       TC1  · tcid TC-PAY-SBX-01 */
	happyMastercard: 'MG-591', /* TC2  · tcid TC-PAY-SBX-02 */
	happyAmex: 'MG-592', /*       TC3  · tcid TC-PAY-SBX-03 */
	echoCvv: 'MG-593', /*         TC4  · tcid TC-PAY-SBX-04 */
	declineZip46282: 'MG-594', /* TC5  · tcid TC-PAY-SBX-05 */
	cvv901: 'MG-595', /*          TC6  · tcid TC-PAY-SBX-06 */
	cvv904: 'MG-596', /*          TC7  · tcid TC-PAY-SBX-07 */
	avs46205: 'MG-597', /*        TC8  · tcid TC-PAY-SBX-08 */
	happyDiscover: 'MG-598', /*   TC9  · tcid TC-PAY-SBX-09 */
	avs46204: 'MG-599', /*        TC10 · tcid TC-PAY-SBX-10 */
	partial46225: 'MG-600', /*    TC11 · tcid TC-PAY-SBX-11 */
	prepaid46228: 'MG-601' /*     TC12 · tcid TC-PAY-SBX-12 */
};

/**
 * Test Set Xray que agrupa el pack de CONTRATO del sandbox Authorize (los 12 de arriba).
 * Es el prefijo de los summaries (`MG-602 | TC<n>: …`), el eje de agrupación por feature.
 * NO es un Test Execution: los resultados siguen yendo a `MG-558` (ver más abajo).
 */
export const AUTHORIZE_CONTRACT_XRAY_TEST_SET: XrayIssueKey = 'MG-602';

/**
 * Test Executions por pasarela (creados 2026-07-25, env `test`).
 * La EXECUTION key se pasa por shell al importar resultados
 * (ej. `XRAY_EXECUTION_KEY=MG-558 npm run test:test:gateway:authorize:xray`).
 */
export const XRAY_EXECUTIONS_TEST_ENV: Record<GatewayCompany, XrayIssueKey> = {
	authorize: 'MG-558',
	ebizcharge: 'MG-559',
	stripe: 'MG-560',
	'mercado-pago': 'MG-561'
};

/** Nombre de la env var que documenta la execution por pasarela (ver `.env.example`, S9). */
export const XRAY_EXECUTION_ENV_VAR: Record<GatewayCompany, string> = {
	authorize: 'XRAY_EXECUTION_AUTHORIZE',
	ebizcharge: 'XRAY_EXECUTION_EBIZCHARGE',
	stripe: 'XRAY_EXECUTION_STRIPE',
	'mercado-pago': 'XRAY_EXECUTION_MERCADOPAGO'
};

/**
 * Denylist recomendada para `XRAY_KEY_DENYLIST` (CSV): keys que JAMÁS deben recibir
 * resultado como Test (épicas/planes/executions/containers — no son Tests Xray).
 */
export const XRAY_KEY_DENYLIST_RECOMMENDED =
	'MG-3,MG-178,MG-509,MG-510,MG-511,MG-512,MG-513,MG-514,MG-515,MG-516,MG-553,MG-557,MG-558,MG-559,MG-560,MG-561,MG-602';
