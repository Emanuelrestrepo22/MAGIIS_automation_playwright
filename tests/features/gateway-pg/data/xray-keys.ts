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
 *      `[TS-<GW>-TCxxxx] Validar ...`. `null` = la matriz de esa pasarela no define
 *      el caso (o lo modela sin los ejes de la taxonomía — ver comentarios por bloque).
 *   3. Las keys de ATC son estructurales (decorator `@atc('MG-###')` en el wrapper
 *      por pasarela del POM) — NO salen de este registry.
 *   4. Un mapeo POR ÁREA (ej. área E Hold → MG-158) NO se copia como key 1:1 por caso:
 *      haría que N casos reporten resultado contra el MISMO Test Xray, pisándose. En ese
 *      escenario la key correcta es `null` (el área ya queda cubierta por el `@atc`).
 *
 * Áreas modeladas: CFG (App Store) · WAL (wallet/add-card) · HOLD (alta de viaje con
 * retención) · CARGO (Cargo a Bordo). HOLD y CARGO hoy tienen TODAS las keys MG en `null`
 * en las 4 pasarelas — no existen Tests Xray espejo (`docs/gateway-pg/id-map.json`:
 * `summary.authorize.with_mg_key = 9` = 8 CFG + 1 WAL; `summary.ebizcharge.with_mg_key = 0`).
 *
 * Simetría CFG Stripe/Authorize/eBiz confirmada; matrices canónicas:
 * `docs/gateway-pg/stripe/matriz_cases.md` (TC1001..1008),
 * `docs/gateway-pg/authorize/matriz_cases.md` §1 (TC1001..1008, espejo) y
 * `docs/gateway-pg/ebizcharge/matriz_cases.md` (TC1050..1057, derivación Fase 4).
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

/**
 * Casos del área HOLD (alta de viaje con tarjeta preautorizada — retención previa).
 * Taxonomía canónica: `<tipoCliente><Outcome>[New|Existing][HoldOn|HoldOff]`, derivada de
 * la matriz Authorize §2-§4 (la más granular en el eje Hold ON/OFF × tarjeta nueva/existente).
 * 3DS queda FUERA de esta taxonomía — es exclusivo Stripe y vive en sus specs dedicados.
 */
export type GatewayHoldCase =
	| 'personalHappyHoldOn' /*             carrier · personal · approved · Hold ON */
	| 'personalHappyHoldOff' /*            carrier · personal · approved · Hold OFF */
	| 'personalDeclineHoldOn' /*           carrier · personal · decline genérico · Hold ON */
	| 'personalDeclineHoldOff' /*          carrier · personal · decline genérico · Hold OFF */
	| 'personalAvsNoMatch' /*              carrier · personal · AVS no match (exclusivo Authorize) */
	| 'colaboradorHappyNewHoldOn' /*       carrier · colaborador · tarjeta nueva · Hold ON */
	| 'colaboradorHappyExistingHoldOn' /*  carrier · colaborador · tarjeta existente · Hold ON */
	| 'colaboradorHappyNewHoldOff' /*      carrier · colaborador · tarjeta nueva · Hold OFF */
	| 'colaboradorHappyExistingHoldOff' /* carrier · colaborador · tarjeta existente · Hold OFF */
	| 'empresaHappyNewHoldOn' /*           carrier · empresa individuo · tarjeta nueva · Hold ON */
	| 'empresaHappyExistingHoldOn' /*      carrier · empresa individuo · tarjeta existente · Hold ON */
	| 'empresaHappyNewHoldOff' /*          carrier · empresa individuo · tarjeta nueva · Hold OFF */
	| 'empresaHappyExistingHoldOff' /*     carrier · empresa individuo · tarjeta existente · Hold OFF */
	| 'empresaDecline'; /*                 carrier · empresa individuo · decline genérico */

/**
 * Casos del área CARGO (Cargo a Bordo — cobro directo sin retención previa; el cobro
 * ocurre cuando el driver finaliza el viaje). Eje: tipo de cliente × outcome.
 * Los casos antifraude/3DS de Cargo (Stripe Radar, TC1087+) NO entran acá — sin
 * equivalente cross-gateway (Authorize sólo tiene AVS/CVV; eBiz Fraud Profiler).
 */
export type GatewayCargoCase =
	| 'personalHappy' /*            carrier · personal · pago exitoso */
	| 'personalDeclineGeneric' /*   carrier · personal · pago rechazado genérico */
	| 'personalDeclineCvv' /*       carrier · personal · CVC/CVV incorrecto */
	| 'colaboradorHappy' /*         carrier · colaborador · pago exitoso */
	| 'colaboradorDeclineGeneric' /* carrier · colaborador · pago rechazado genérico */
	| 'colaboradorDeclineCvv' /*    carrier · colaborador · CVC/CVV incorrecto */
	| 'empresaHappy' /*             carrier · empresa individuo · pago exitoso */
	| 'empresaDeclineGeneric' /*    carrier · empresa individuo · pago rechazado genérico */
	| 'empresaDeclineCvv'; /*       carrier · empresa individuo · CVC/CVV incorrecto */

/** Registry Xray + matriz de una pasarela. `null` = sin key/TC todavía (no inventar). */
export type GatewayXrayRegistry = {
	/** Keys Xray del área CFG (App Store), por caso canónico. */
	cfg: Record<GatewayCfgCase, XrayIssueKey | null>;
	/** TC IDs de matriz (`TS-<GW>-TCxxxx`) del área CFG, por caso canónico. */
	cfgTcIds: Record<GatewayCfgCase, string | null>;
	/**
	 * Keys Xray del área HOLD (alta de viaje con retención).
	 * HOY TODAS `null` en las 4 pasarelas — ver TODO del bloque `stripe.hold`.
	 */
	hold: Record<GatewayHoldCase, XrayIssueKey | null>;
	/** TC IDs de matriz (`TS-<GW>-TCxxxx`) del área HOLD, por caso canónico. */
	holdTcIds: Record<GatewayHoldCase, string | null>;
	/**
	 * Keys Xray del área CARGO (Cargo a Bordo).
	 * HOY TODAS `null` en las 4 pasarelas — ver TODO del bloque `stripe.cargo`.
	 */
	cargo: Record<GatewayCargoCase, XrayIssueKey | null>;
	/** TC IDs de matriz (`TS-<GW>-TCxxxx`) del área CARGO, por caso canónico. */
	cargoTcIds: Record<GatewayCargoCase, string | null>;
	/** Keys Xray del área WAL (wallet / alta de tarjeta). */
	wallet: {
		/** Alta de tarjeta (add-card). Authorize: MG-285 (rango WAL completo MG-285..304). */
		addCard: XrayIssueKey | null;
	};
};

/**
 * Plantilla de keys HOLD sin issue Xray. Devuelve un objeto NUEVO por invocación
 * (nunca compartir la misma referencia entre pasarelas — cada registry es mutable
 * de forma independiente cuando QA cree las issues espejo).
 */
const noHoldKeys = (): Record<GatewayHoldCase, XrayIssueKey | null> => ({
	personalHappyHoldOn: null,
	personalHappyHoldOff: null,
	personalDeclineHoldOn: null,
	personalDeclineHoldOff: null,
	personalAvsNoMatch: null,
	colaboradorHappyNewHoldOn: null,
	colaboradorHappyExistingHoldOn: null,
	colaboradorHappyNewHoldOff: null,
	colaboradorHappyExistingHoldOff: null,
	empresaHappyNewHoldOn: null,
	empresaHappyExistingHoldOn: null,
	empresaHappyNewHoldOff: null,
	empresaHappyExistingHoldOff: null,
	empresaDecline: null
});

/** Plantilla de keys CARGO sin issue Xray (mismo criterio que `noHoldKeys`). */
const noCargoKeys = (): Record<GatewayCargoCase, XrayIssueKey | null> => ({
	personalHappy: null,
	personalDeclineGeneric: null,
	personalDeclineCvv: null,
	colaboradorHappy: null,
	colaboradorDeclineGeneric: null,
	colaboradorDeclineCvv: null,
	empresaHappy: null,
	empresaDeclineGeneric: null,
	empresaDeclineCvv: null
});

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
		// TODO(xray): NO existen Tests Xray 1:1 por caso HOLD en MG — el área E (Hold) mapea
		// por ÁREA a MG-158 (`@atc('MG-158')` en `CarrierTravelManagementPage`, idmap API-level
		// sin 1:1 con TS-STRIPE-TC10xx). Poner MG-158 acá convertiría un mapeo por área en un
		// falso 1:1 y contaminaría N casos con el mismo resultado → se dejan `null` y el
		// reporter los cuenta como unmapped visible. Poblar cuando QA cree los Tests espejo.
		hold: noHoldKeys(),
		// Matriz stripe/matriz_cases.md §5.1 (personal, sin 3DS), §4.1 (colaborador), §6.1 (empresa).
		holdTcIds: {
			personalHappyHoldOn: 'TS-STRIPE-TC1049',
			personalHappyHoldOff: 'TS-STRIPE-TC1050',
			// TC1059 = decline por fondos insuficientes (4000…9995) Hold ON — equivalencia
			// declarada por la matriz Authorize §2.2 ("Equivalente Stripe: TS-STRIPE-TC1059").
			personalDeclineHoldOn: 'TS-STRIPE-TC1059',
			// La matriz Stripe no define un decline personal con Hold OFF (§5.1 sólo Hold ON).
			personalDeclineHoldOff: null,
			// AVS granular es exclusivo Authorize; Stripe lo cubre vía Radar en Cargo (§7.2), no acá.
			personalAvsNoMatch: null,
			colaboradorHappyNewHoldOn: 'TS-STRIPE-TC1033',
			colaboradorHappyExistingHoldOn: 'TS-STRIPE-TC1041',
			colaboradorHappyNewHoldOff: 'TS-STRIPE-TC1034',
			colaboradorHappyExistingHoldOff: 'TS-STRIPE-TC1036',
			empresaHappyNewHoldOn: 'TS-STRIPE-TC1065',
			empresaHappyExistingHoldOn: 'TS-STRIPE-TC1067',
			empresaHappyNewHoldOff: 'TS-STRIPE-TC1066',
			empresaHappyExistingHoldOff: 'TS-STRIPE-TC1068',
			// §6 no define decline para empresa individuo en alta de viaje (sólo en Cargo, TC1112).
			empresaDecline: null
		},
		// TODO(xray): mismo criterio que `hold` — el área F (Cargo) mapea por área a MG-161.
		cargo: noCargoKeys(),
		// Matriz stripe/matriz_cases.md §7.1 (personal), §8.1 (colaborador), §9.1 (empresa).
		cargoTcIds: {
			personalHappy: 'TS-STRIPE-TC1081',
			personalDeclineGeneric: 'TS-STRIPE-TC1082',
			personalDeclineCvv: 'TS-STRIPE-TC1085',
			colaboradorHappy: 'TS-STRIPE-TC1096',
			colaboradorDeclineGeneric: 'TS-STRIPE-TC1097',
			colaboradorDeclineCvv: 'TS-STRIPE-TC1100',
			empresaHappy: 'TS-STRIPE-TC1111',
			empresaDeclineGeneric: 'TS-STRIPE-TC1112',
			empresaDeclineCvv: 'TS-STRIPE-TC1115'
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
		// TODO(xray): Authorize tiene 9 issues MG creadas (8 CFG + 1 WAL) — `id-map.json`
		// → `summary.authorize.with_mg_key = 9`. NO existe ningún Test Xray para HOLD/CARGO →
		// todas las keys `null` (unmapped visible; JAMÁS inventar keys). Poblar cuando QA cree
		// las issues espejo, mismo criterio que el bloque `ebizcharge.cfg`.
		hold: noHoldKeys(),
		// Matriz authorize/matriz_cases.md §2.1/§2.2/§2.4 (personal), §3.1/§3.2 (colaborador),
		// §4.1/§4.2 (empresa). Authorize sandbox no expone 3DS → todos los casos son sin 3DS.
		holdTcIds: {
			personalHappyHoldOn: 'TS-AUTHORIZE-TC1011',
			personalHappyHoldOff: 'TS-AUTHORIZE-TC1012',
			personalDeclineHoldOn: 'TS-AUTHORIZE-TC1016',
			personalDeclineHoldOff: 'TS-AUTHORIZE-TC1017',
			personalAvsNoMatch: 'TS-AUTHORIZE-TC1031',
			// TC1051 es el caso seed (vincular tarjeta + alta) — canónico del par "tarjeta nueva
			// Hold ON"; TC1052 es su duplicado sin seed y NO se modela como caso aparte.
			colaboradorHappyNewHoldOn: 'TS-AUTHORIZE-TC1051',
			colaboradorHappyExistingHoldOn: 'TS-AUTHORIZE-TC1053',
			colaboradorHappyNewHoldOff: 'TS-AUTHORIZE-TC1054',
			colaboradorHappyExistingHoldOff: 'TS-AUTHORIZE-TC1055',
			empresaHappyNewHoldOn: 'TS-AUTHORIZE-TC1061',
			empresaHappyExistingHoldOn: 'TS-AUTHORIZE-TC1062',
			empresaHappyNewHoldOff: 'TS-AUTHORIZE-TC1063',
			empresaHappyExistingHoldOff: 'TS-AUTHORIZE-TC1064',
			empresaDecline: 'TS-AUTHORIZE-TC1065'
		},
		// Sólo los DOS casos happy tienen Test Xray, y las keys se leyeron EN VIVO de Jira
		// (2026-07-29) para no cablear por inferencia:
		//   · MG-529 = "MG-200 | TC33: Validar cargo a bordo Authorize usuario personal happy y
		//     pago exitoso" (label `tcid:TC-PAY-COB-33`).
		//   · MG-539 = "MG-200 | TC36: Validar cargo a bordo Authorize usuario colaborador happy y
		//     pago exitoso" (label `tcid:TC-PAY-COB-36`).
		// Ambos títulos describen el flujo desde Carrier con cobro exitoso, que es exactamente lo
		// que ejecutan `personalHappy` y `colaboradorHappy` de la factory. Los 6 declines y el caso
		// `empresaHappy` quedan `null` a propósito: NO existe Test Xray para ellos y fabricar una
		// key inflaría evidencia. Quedan unmapped VISIBLES (el reporter los cuenta como tales).
		cargo: {
			...noCargoKeys(),
			personalHappy: 'MG-529',
			colaboradorHappy: 'MG-539'
		},
		// Matriz authorize/matriz_cases.md §7.1 (personal TC1081-1083), §8 (colaborador
		// TC1096-1098) y §9 (empresa TC1111/1112 + TC1105 "CVC incorrecto").
		cargoTcIds: {
			personalHappy: 'TS-AUTHORIZE-TC1081',
			personalDeclineGeneric: 'TS-AUTHORIZE-TC1082',
			personalDeclineCvv: 'TS-AUTHORIZE-TC1083',
			colaboradorHappy: 'TS-AUTHORIZE-TC1096',
			colaboradorDeclineGeneric: 'TS-AUTHORIZE-TC1097',
			colaboradorDeclineCvv: 'TS-AUTHORIZE-TC1098',
			empresaHappy: 'TS-AUTHORIZE-TC1111',
			empresaDeclineGeneric: 'TS-AUTHORIZE-TC1112',
			empresaDeclineCvv: 'TS-AUTHORIZE-TC1105'
		},
		// WAL authorize = MG-285..304; add-card (spec actual) = MG-285.
		wallet: { addCard: 'MG-285' }
	},
	ebizcharge: {
		// REFUTADO el 2026-07-31 el "eBizCharge aún sin NINGUNA issue MG creada" que decía este
		// bloque. Los Tests de eBizCharge SÍ existen: son las **acciones estandarizadas** del Test
		// Execution MG-559 ("ATR · EBIZCHARGE — acciones estandarizadas, Ronda 1", 33 Tests, leídos
		// en vivo con `bun xray exec get MG-559`). No están redactados por pasarela — un mismo Test
		// se ejecuta una vez por PSP y el ATR fija cuál (MG-558 Authorize · MG-559 eBizCharge ·
		// MG-560 Stripe · MG-561 MercadoPago). Por eso la búsqueda por summary/label "eBizCharge"
		// devolvía casi nada y se concluyó que no existían.
		//
		// Lo que se cablea acá es SOLO donde el caso CFG cubre lo que el Test valida, verificado
		// contra los Steps reales de cada issue. Las keys que siguen en `null` NO son olvidos:
		// cada una tiene su motivo escrito. Sigue vigente que las keys las crea QA y el código
		// jamás las fabrica.
		cfg: {
			// Sin Test entre los 33: ninguno valida "ver la pasarela NO vinculada" como caso propio
			// (es precondición de MG-141, su Step 2).
			viewUnlinked: null,
			// MG-141 (A-01) "vincular la pasarela cuando el carrier tiene una cuenta PSP válida".
			// Steps 3-4: vincular y volver a consultar el connectedAccount → MGWLinked activo. El caso
			// `linkValid` hace exactamente eso y además lo acredita por DB (`MGW_LINKED`).
			linkValid: 'MG-141',
			// Sin Test: MG-145 es el negativo eBiz por `zipCode` FALTANTE, no por credenciales
			// inválidas. Son cosas distintas y el modal eBiz no tiene campo zipCode (4 campos,
			// verificado en vivo) → cablear MG-145 acá sería cruzar la key.
			linkInvalid: null,
			// MG-165 (G-01) "se muestra el modal de aviso antes de desvincular". Su Step 4 es
			// "Presionar Cancelar → el modal se cierra SIN invocar cleaningWallets; la pasarela sigue
			// conectada", que es literal lo que asserta `cancelUnlink`.
			cancelUnlink: 'MG-165',
			// MG-165 Step 5: "Reabrir el modal y presionar Confirmar → se invoca cleaningWallets e
			// inicia la desvinculación". `unlink` cubre ese paso.
			// NO se cablea MG-166 acá a propósito: MG-166 (G-02) exige que las wallets/tarjetas
			// locales queden VACÍAS y el link desactivado, y este caso UI sólo mira que el estado
			// vuelva a `linkable` (tiene su propio TODO por la mitad del AC que no verifica). Ese
			// Test ya lo acredita `api/vendor-cleaning-wallets/cleaning-wallets-db.api.spec.ts`, que
			// sí cuenta filas en Oracle. Cablearlo también acá lo pondría PASSED sin haber mirado
			// una sola wallet.
			unlink: 'MG-165',
			// MG-143 (A-03) "se garantiza una sola PSP conectada por carrier (exclusividad)".
			exclusivity: 'MG-143',
			// Sin Test: la persistencia tras recargar no es un caso del ATP estandarizado.
			reloadPersistence: null,
			// Queda `null` a propósito aunque MG-141 Step 3 diga "deberia responder 200": el
			// `linkSuccessStatuses: [200]` del adapter eBiz está declarado como ASUMIDO, nunca
			// verificado en vivo. Si el status real fuera 201, este caso daría rojo y arrastraría
			// MG-141 a FAILED por una suposición nuestra, no por un fallo del producto. Cablear
			// cuando se confirme el status contra el backend.
			linkStatus: null
		},
		// Los TC IDs de matriz SÍ existen desde la derivación determinística Fase 4 (2026-07-26):
		// ebizcharge/matriz_cases.md §"Configuración de Pasarela eBizCharge" → TC1050..TC1057
		// (matriz_cases.md:55-62 + normalized-test-cases.json), espejo 1:1 de
		// TS-STRIPE-TC1001..TC1008 (columna "Ref Stripe" de la propia matriz).
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
		// MG-148 (C-01) "poder dar de alta una tarjeta válida cuando el pax va a pagar sus viajes".
		// Se cablea SÓLO al caso seed (TC1058, `colaboradorHappyNewHoldOn`), que es el que existe para
		// vincular la tarjeta — los otros cuatro casos de tarjeta nueva también la dan de alta, pero su
		// propósito es la permutación de Hold ON/OFF, y si uno de ellos fallara por el hold arrastraría
		// MG-148 a FAILED culpando al alta de tarjeta. El seed corrió verde en vivo el 2026-07-30
		// (viaje 67831) con la tarjeta 4000100011112224 y su fila en `CARD_HOLDS` con
		// PROVIDER_CODE='EBIZ'.
		hold: { ...noHoldKeys(), colaboradorHappyNewHoldOn: 'MG-148' },
		// Matriz ebizcharge/matriz_cases.md — colaborador TC1058..1062, personal TC1063..1066,
		// empresa TC1067..1070. Asimetrías reales frente a Authorize/Stripe:
		//   · personal: las 4 filas (TC1063..1066) son TODAS "Hold OFF" (variantes de
		//     origen/destino, refs TS-STRIPE-TC1050/1052/1058/1060) → NO hay fila personal
		//     con Hold ON en la matriz eBiz. Nota: existe TS-EBIZ-TC1040 ("Hold happy path
		//     (parametrizado)", intent HAPPY_NO_AUTH) pero es una fila cross-gateway SIN tipo
		//     de cliente → no se mapea 1:1 a `personalHappyHoldOn` (decisión de QA pendiente).
		//   · declines: los declines eBiz (TC1010..1016) son filas por TRIGGER de tarjeta, sin
		//     ejes tipo-de-cliente ni Hold ON/OFF → no hay correspondencia 1:1 con la taxonomía.
		//   · AVS: eBiz NO soporta el intent DECLINE_ZIP_MISMATCH (el resolver lanza; sus
		//     números AVS son referencia y todos devuelven approved) → caso inaplicable.
		holdTcIds: {
			personalHappyHoldOn: null,
			personalHappyHoldOff: 'TS-EBIZ-TC1063',
			personalDeclineHoldOn: null,
			personalDeclineHoldOff: null,
			personalAvsNoMatch: null,
			// TC1058 es el caso seed ("vincular tarjeta y Alta de Viaje", ref TS-STRIPE-TC1033);
			// TC1060 es su duplicado sin seed y NO se modela como caso aparte.
			colaboradorHappyNewHoldOn: 'TS-EBIZ-TC1058',
			colaboradorHappyExistingHoldOn: 'TS-EBIZ-TC1062',
			colaboradorHappyNewHoldOff: 'TS-EBIZ-TC1059',
			colaboradorHappyExistingHoldOff: 'TS-EBIZ-TC1061',
			empresaHappyNewHoldOn: 'TS-EBIZ-TC1067',
			empresaHappyExistingHoldOn: 'TS-EBIZ-TC1069',
			empresaHappyNewHoldOff: 'TS-EBIZ-TC1068',
			empresaHappyExistingHoldOff: 'TS-EBIZ-TC1070',
			empresaDecline: null
		},
		cargo: noCargoKeys(),
		// Matriz ebizcharge/matriz_cases.md — Cargo a Bordo personal TC1108..1110,
		// colaborador TC1111..1113, empresa TC1114..1116 (única área eBiz completa 9/9).
		cargoTcIds: {
			personalHappy: 'TS-EBIZ-TC1108',
			personalDeclineGeneric: 'TS-EBIZ-TC1109',
			personalDeclineCvv: 'TS-EBIZ-TC1110',
			colaboradorHappy: 'TS-EBIZ-TC1111',
			colaboradorDeclineGeneric: 'TS-EBIZ-TC1112',
			colaboradorDeclineCvv: 'TS-EBIZ-TC1113',
			empresaHappy: 'TS-EBIZ-TC1114',
			empresaDeclineGeneric: 'TS-EBIZ-TC1115',
			empresaDeclineCvv: 'TS-EBIZ-TC1116'
		},
		wallet: { addCard: null }
	},
	'mercado-pago': {
		// TODO(xray): Mercado Pago aún sin issues CFG en Jira ni TC IDs de matriz para CFG.
		// HOLD/CARGO también todo `null`: mercado-pago/matriz_cases.md modela los casos por
		// TRIGGER (holderName APRO/OTHE/SECU…), sin ejes tipo-de-cliente ni Hold ON/OFF, y no
		// tiene sección Cargo a Bordo → ningún caso de la taxonomía tiene TC ID 1:1.
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
		hold: noHoldKeys(),
		holdTcIds: {
			personalHappyHoldOn: null,
			personalHappyHoldOff: null,
			personalDeclineHoldOn: null,
			personalDeclineHoldOff: null,
			personalAvsNoMatch: null,
			colaboradorHappyNewHoldOn: null,
			colaboradorHappyExistingHoldOn: null,
			colaboradorHappyNewHoldOff: null,
			colaboradorHappyExistingHoldOff: null,
			empresaHappyNewHoldOn: null,
			empresaHappyExistingHoldOn: null,
			empresaHappyNewHoldOff: null,
			empresaHappyExistingHoldOff: null,
			empresaDecline: null
		},
		cargo: noCargoKeys(),
		cargoTcIds: {
			personalHappy: null,
			personalDeclineGeneric: null,
			personalDeclineCvv: null,
			colaboradorHappy: null,
			colaboradorDeclineGeneric: null,
			colaboradorDeclineCvv: null,
			empresaHappy: null,
			empresaDeclineGeneric: null,
			empresaDeclineCvv: null
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
 * el 2026-07-28 y verificadas en Jira; miembros del Test Execution `MG-558`, del
 * Test Set `MG-602` ("ATP · SBX — Contrato sandbox Authorize.Net (BL-036)") y del
 * Test Plan `MG-178` ("ATP · Release Pasarelas de Pago (Gateway) — 4 PSP").
 *
 * TCID LOCAL (label `tcid:` en Jira, área SBX del idmap del ATP):
 *   MG-590 = TC-PAY-SBX-01 · MG-591 = TC-PAY-SBX-02 · MG-592 = TC-PAY-SBX-03
 *   MG-593 = TC-PAY-SBX-04 · MG-594 = TC-PAY-SBX-05 · MG-595 = TC-PAY-SBX-06
 *   MG-596 = TC-PAY-SBX-07 · MG-597 = TC-PAY-SBX-08 · MG-598 = TC-PAY-SBX-09
 *   MG-599 = TC-PAY-SBX-10 · MG-600 = TC-PAY-SBX-11 · MG-601 = TC-PAY-SBX-12
 *
 * NOMENCLATURA CANÓNICA EN JIRA (normalizada 2026-07-29 al estándar del generador
 * del ATP, `scripts/atp-bulk-create.mjs` del boilerplate):
 *   - summary  = `MG-602 | TC<n>: Validar contrato sandbox Authorize.Net: <caso>`
 *                (n = 1..12, mismo orden que este registry).
 *   - labels   = `atp-mg-gateway-release` + `tcid:<TCID>` + payment · gateway ·
 *                authorize · automatable-api · automation-candidate · regression ·
 *                automated. (La label `api` se retiró: el vocabulario del ATP usa
 *                `automatable-api`.)
 *   - Test Type = `Cucumber` con Gherkin poblado (igual que el hermano API MG-551),
 *                no `Generic`. El Gherkin va sin acentos, como el resto del ATP.
 *   - description = ADF de 9 secciones h3 del generador (User Story · Clasificación ·
 *                Precondiciones · Datos · Resultado esperado · Resultado obtenido ·
 *                Endpoints / DB · Trazabilidad · Observaciones).
 *   - parent   = `MG-135` (epic *QA Test Repository*) · issue link `tests` → `MG-3`
 *                (ancla del release). BL-036 no es issue de MG: va en Trazabilidad.
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
 * NO es el Test Plan: el ATP del release es `MG-178`, del que los 12 también son miembros.
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
