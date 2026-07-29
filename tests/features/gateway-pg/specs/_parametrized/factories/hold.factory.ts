/**
 * Factory parametrizada — Suite HOLD · Alta de viaje con tarjeta preautorizada (retención).
 * =========================================================================================
 *
 * Seam S6 (carrier/gateway-standardization), espejo de `gateway-config.factory.ts` para el
 * área E (Hold). `defineHoldSuite(gateway, options)` genera los tests HOLD de la taxonomía
 * canónica (`GatewayHoldCase`, 14 casos) para cualquier pasarela de form NATIVO Angular,
 * gobernada por su adapter declarativo (`helpers/adapters`) y el registry local
 * (`data/xray-keys.ts` → `hold` / `holdTcIds`).
 *
 * Motor: `runStepwiseHoldJourney` (`helpers/stepwise-hold-journey.ts`) — 13 pasos con
 * assertion por paso, cleanup del viaje en `finally` y precondición API de tarjeta (BL-050).
 * Stripe NO pasa por acá (usa Elements + su propio flujo `fillMinimum`/`selectCardByLast4`);
 * la factory lo rechaza en tiempo de definición.
 *
 * REGLAS load-bearing (idénticas a la factory CFG — trazabilidad emit-all del xray-reporter):
 *   1. Annotation `{type:'tms',description:<MG-key>}` POR TEST, resuelta del registry DENTRO
 *      del loop por caso. Key `null` → NO se emite annotation (unmapped visible; JAMÁS
 *      inventar keys). HOY las 14 keys `hold` están en `null` en las 4 pasarelas → ningún
 *      test de esta factory emite annotation, por diseño.
 *   2. Título con el TC ID de matriz cuando existe: `[TS-<GW>-TCxxxx] @hold Validar ...`.
 *      TC ID `null` → título sin corchete.
 *   3. `test.skip(!adapter.isConfigured(), ...)` a nivel describe (gate de credenciales).
 *   4. SIN locators (regla KATA): toda interacción va por el motor → POM/Steps.
 *
 * ── QUÉ SE GENERA COMO EJECUTABLE Y QUÉ COMO `fixme` (decisión explícita) ────────────────
 * El motor expresa los DOS ejes de la taxonomía vía opciones opt-in (`holdMode`, `cardFlow`
 * — ver el docblock de `stepwise-hold-journey.ts`), así que 13 de los 14 casos se generan
 * EJECUTABLES. Cada eje se cablea desde el spec declarativo, sin ramas por caso:
 *
 *   · `holdAxis: 'on'`  → `holdMode: 'on'`: el motor ASEVERA (sin escribir) que la
 *     pre-autorización está activa. Cierra la deuda vieja de acreditar un TC "Hold ON"
 *     corriendo en realidad con el toggle apagado.
 *   · `holdAxis: null`  → sin `holdMode`: la matriz no fija el eje (Authorize §4.2 / TC1065),
 *     así que el motor tampoco lo toca — la precondición queda declarada, no gestionada.
 *   · `holdAxis: 'off'` → `holdMode: 'off'`: apaga el toggle vía API y lo RESTAURA en el
 *     `finally`. Es DESTRUCTIVO sobre el carrier 1521 COMPARTIDO, así que el motor exige
 *     `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` (mismo guard que la suite CFG) y skipea limpio
 *     sin él. Correr SOLO en ventana exclusiva: con el toggle apagado, cualquier spec de hold
 *     concurrente fallaría por este caso y no por el suyo.
 *   · `cardFlow: 'existing'` → `cardFlow: 'existing'`: el motor SELECCIONA la tarjeta ya
 *     vinculada en vez de borrarla, y omite el fill + "Validar" (sin tarjeta nueva no hay hold
 *     de vinculación). Si el pasajero no la tiene, el caso SKIPEA — la vincula el caso seed de
 *     la matriz (TS-AUTHORIZE-TC1051 / TS-EBIZ-TC1058), no éste.
 *
 * ÚNICO `fixme` que queda (`unsupportedReason`): **decline + Hold OFF** (TS-AUTHORIZE-TC1017).
 * No es una limitación del motor sino del ORÁCULO: `OUTCOME_BY_INTENT` mapea DECLINE_AUTHORIZE
 * a `card-rejected`, y `helpers/journey-outcome.ts` documenta explícitamente que ese desenlace
 * DEPENDE del hold ACTIVO (con hold apagado la vinculación podría no disparar transacción y el
 * rechazo se movería al alta del viaje, o no ocurrir). Sin una corrida real que lo observe no
 * hay assertion honesta que escribir — y el motor rechaza inventarla.
 *
 * El `fixme` NO lleva cuerpo de journey: lanza con el motivo. Flipearlo a `test` sin observar
 * el desenlace real falla en rojo en vez de reportar un PASS falso.
 *
 * Casos cuyo INTENT no soporta la pasarela (`SUPPORTED_INTENTS_BY_GATEWAY`, el resolver
 * LANZA) NO se generan: eBizCharge no expone `DECLINE_ZIP_MISMATCH`, así que
 * `personalAvsNoMatch` desaparece de su suite (y su `holdTcIds` ya es `null`).
 *
 * ── PENDIENTE DE CONFIRMAR EN VIVO (ambiente `apps-test` CAÍDO al escribir esto) ─────────
 *   · Ningún test de esta factory se ejecutó: sólo verificación estática (tsc + eslint +
 *     `--list`). Los 5 casos Authorize migrados sí tienen historia de corridas — ver el
 *     docblock de cada consumidor.
 *   · Los DOS ejes nuevos (`holdMode`, `cardFlow: 'existing'`) NUNCA se ejercitaron contra el
 *     ambiente. Lo que está SIN OBSERVAR, en concreto:
 *       - que el alta con hold APAGADO complete igual y caiga en "Por asignar" (es lo que
 *         afirma la deuda histórica del motor, pero nadie lo corrió por este camino);
 *       - que `POST /carriers/{id}/parameters` persista `enableCreditCardHold=false` con el
 *         resto de los parámetros intactos (el POST re-postea el objeto entero);
 *       - que el desplegable de Forma de Pago exponga la tarjeta guardada tal como la busca
 *         `selectSavedPreauthorizedCard` (locators heredados de las grabaciones, no verificados
 *         en este camino);
 *       - que con tarjeta ya vinculada "Seleccionar Vehículo" habilite sin pasar por "Validar".
 *     Hasta que corran en verde, estos casos son cobertura DECLARADA, no acreditada.
 *   · eBizCharge: `adapter.nativeExtraField` está SIN definir (¿el form nativo eBiz pide un
 *     5° campo?), `linkSuccessStatuses: [200]` es un SUPUESTO (el de Authorize resultó
 *     500/409) y el oráculo `validateNativeCard` / `expectNativeCardRejected` no se verificó
 *     nunca contra eBiz.
 *   · eBizCharge comparte hoy la MISMA referencia de `journeyDefaults` que Stripe/Authorize
 *     (`BASE_GATEWAY_JOURNEY_DEFAULTS` → carrier 1521 US y sus clientes). Si eBiz necesita
 *     otro carrier/cliente, hay que agregar su entrada en `JOURNEY_DEFAULTS_BY_GATEWAY` con
 *     datos verificados — no inventarlos acá.
 */

import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';
import type { GatewayHoldCase, XrayIssueKey } from '@features/gateway-pg/data/xray-keys';
import type { GatewayPgAdapter } from '@features/gateway-pg/helpers/adapters/types';
import type { GatewayJourneyDefaults } from '@features/gateway-pg/data/journey-defaults';

import { test } from '@TestFixture';
import { SUPPORTED_INTENTS_BY_GATEWAY } from '@fixtures/gateways/_shared';
import { debugLog } from '@helpers/index';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { runStepwiseHoldJourney } from '@features/gateway-pg/helpers/stepwise-hold-journey';

/** Tipo de actor del alta — determina cliente / pasajero / nombre esperado en la grilla. */
type HoldActor = 'personal' | 'colaborador' | 'empresa';

/** Estado del toggle de hold que declara la matriz. `null` = la matriz no fija el eje. */
type HoldToggleAxis = 'on' | 'off' | null;

/** Flujo de tarjeta que declara la matriz. */
type HoldCardFlow = 'new' | 'existing';

/**
 * Definición declarativa de cada caso de la taxonomía. Los ejes (`actor`, `intent`,
 * `holdAxis`, `cardFlow`) salen de las matrices canónicas por pasarela; los DATOS
 * (cliente/pasajero) los resuelve `journeyDefaultsFor(gateway)` — nunca se hardcodean acá.
 */
type HoldCaseSpec = {
	actor: HoldActor;
	intent: CardIntent;
	holdAxis: HoldToggleAxis;
	cardFlow: HoldCardFlow;
	/** Fragmento humano del título (sin TC ID ni tags — se componen en `defineHoldSuite`). */
	label: string;
};

/**
 * Los 14 casos HOLD en orden canónico de taxonomía (`GatewayHoldCase`).
 * Referencias de matriz: authorize §2.1/§2.2/§2.4 (personal), §3.1 (colaborador),
 * §4.1/§4.2 (empresa); ebizcharge TC1058..1070; stripe §5.1/§4.1/§6.1.
 */
const HOLD_CASE_SPECS: Record<GatewayHoldCase, HoldCaseSpec> = {
	personalHappyHoldOn: { actor: 'personal', intent: 'HAPPY_NO_AUTH', holdAxis: 'on', cardFlow: 'new', label: 'usuario personal · tarjeta nueva aprobada · Hold ON' },
	personalHappyHoldOff: { actor: 'personal', intent: 'HAPPY_NO_AUTH', holdAxis: 'off', cardFlow: 'new', label: 'usuario personal · tarjeta nueva aprobada · Hold OFF' },
	personalDeclineHoldOn: { actor: 'personal', intent: 'DECLINE_AUTHORIZE', holdAxis: 'on', cardFlow: 'new', label: 'usuario personal · tarjeta declinada · Hold ON' },
	personalDeclineHoldOff: { actor: 'personal', intent: 'DECLINE_AUTHORIZE', holdAxis: 'off', cardFlow: 'new', label: 'usuario personal · tarjeta declinada · Hold OFF' },
	personalAvsNoMatch: { actor: 'personal', intent: 'DECLINE_ZIP_MISMATCH', holdAxis: 'on', cardFlow: 'new', label: 'usuario personal · ZIP que no coincide (AVS no match) · Hold ON' },
	colaboradorHappyNewHoldOn: { actor: 'colaborador', intent: 'HAPPY_NO_AUTH', holdAxis: 'on', cardFlow: 'new', label: 'colaborador de contractor · tarjeta nueva aprobada · Hold ON' },
	colaboradorHappyExistingHoldOn: { actor: 'colaborador', intent: 'HAPPY_NO_AUTH', holdAxis: 'on', cardFlow: 'existing', label: 'colaborador de contractor · tarjeta vinculada existente · Hold ON' },
	colaboradorHappyNewHoldOff: { actor: 'colaborador', intent: 'HAPPY_NO_AUTH', holdAxis: 'off', cardFlow: 'new', label: 'colaborador de contractor · tarjeta nueva aprobada · Hold OFF' },
	colaboradorHappyExistingHoldOff: { actor: 'colaborador', intent: 'HAPPY_NO_AUTH', holdAxis: 'off', cardFlow: 'existing', label: 'colaborador de contractor · tarjeta vinculada existente · Hold OFF' },
	empresaHappyNewHoldOn: { actor: 'empresa', intent: 'HAPPY_NO_AUTH', holdAxis: 'on', cardFlow: 'new', label: 'empresa individuo · tarjeta nueva aprobada · Hold ON' },
	empresaHappyExistingHoldOn: { actor: 'empresa', intent: 'HAPPY_NO_AUTH', holdAxis: 'on', cardFlow: 'existing', label: 'empresa individuo · tarjeta vinculada existente · Hold ON' },
	empresaHappyNewHoldOff: { actor: 'empresa', intent: 'HAPPY_NO_AUTH', holdAxis: 'off', cardFlow: 'new', label: 'empresa individuo · tarjeta nueva aprobada · Hold OFF' },
	empresaHappyExistingHoldOff: { actor: 'empresa', intent: 'HAPPY_NO_AUTH', holdAxis: 'off', cardFlow: 'existing', label: 'empresa individuo · tarjeta vinculada existente · Hold OFF' },
	// La matriz Authorize §4.2 (TC1065) no fija el eje Hold para el decline de empresa.
	empresaDecline: { actor: 'empresa', intent: 'DECLINE_AUTHORIZE', holdAxis: null, cardFlow: 'new', label: 'empresa individuo · tarjeta declinada' }
};

/** Los 14 casos HOLD en orden canónico de taxonomía. */
export const HOLD_ALL_CASES: GatewayHoldCase[] = Object.keys(HOLD_CASE_SPECS) as GatewayHoldCase[];

/**
 * Los casos que el motor `runStepwiseHoldJourney` ejercita DE VERDAD: hoy todos menos el que
 * carece de oráculo verificado (decline + Hold OFF). Ver el docblock del módulo.
 */
export const HOLD_BASE_CASES: GatewayHoldCase[] = HOLD_ALL_CASES.filter(holdCase => unsupportedReason(HOLD_CASE_SPECS[holdCase]) === null);

/**
 * Motivo por el que el caso NO se puede ejercitar honestamente, o `null` si es ejecutable.
 *
 * Ya NO hay motivos de CAPACIDAD: los dos ejes que faltaban (toggle de hold, tarjeta
 * existente) están cableados en el motor. El único bloqueo que queda es de ORÁCULO — un
 * desenlace que nadie observó todavía, que ninguna cantidad de código puede suplir.
 */
function unsupportedReason(spec: HoldCaseSpec): { tag: string; detail: string } | null {
	if (spec.intent !== 'HAPPY_NO_AUTH' && spec.holdAxis === 'off') {
		return {
			tag: 'oráculo decline+HoldOFF no verificado',
			detail: 'el desenlace esperado de un decline con Hold OFF está declarado NO VERIFICADO ' + '(ver `JourneyOutcome.card-rejected` en `helpers/journey-outcome.ts`): `OUTCOME_BY_INTENT` mapea ' + 'DECLINE_AUTHORIZE a `card-rejected`, pero ese desenlace DEPENDE del hold ACTIVO — con el hold ' + 'apagado la vinculación podría no disparar transacción y el rechazo se movería al alta del viaje ' + '(`trip-unauthorized`) o no ocurrir. El motor SÍ sabe apagar el toggle (`holdMode: "off"`); lo que ' + 'falta es OBSERVAR una corrida real y recién ahí mapear el outcome. Sin oráculo confirmado no hay ' + 'assertion honesta que escribir.'
		};
	}

	return null;
}

/** Datos del alta por tipo de actor — SIEMPRE desde `journeyDefaultsFor`, nunca hardcodeados. */
function actorData(actor: HoldActor, defaults: GatewayJourneyDefaults): { client: string; passenger: string } {
	switch (actor) {
		case 'personal':
			// Usuario personal / app pax: el cliente ES el pasajero → el motor no toca el campo.
			return { client: defaults.appPaxPassenger, passenger: defaults.appPaxPassenger };
		case 'colaborador':
			// Cliente = empresa contractor; pasajero = colaborador CON tarjeta activa.
			return { client: defaults.contractorClient, passenger: defaults.contractorPassenger };
		case 'empresa':
			// Empresa individuo (BL-003): cliente y pasajero son el MISMO → auto-asignado.
			return { client: defaults.client, passenger: defaults.client };
	}
}

/** Tag `@happy` / `@unhappy` derivado del intent (no del nombre del caso). */
function outcomeTag(intent: CardIntent): '@happy' | '@unhappy' {
	return intent === 'HAPPY_NO_AUTH' || intent === 'HAPPY_AUTH' ? '@happy' : '@unhappy';
}

/** Sufijo humano del desenlace esperado, para que el título diga qué se asevera. */
function outcomeHint(intent: CardIntent): string {
	return outcomeTag(intent) === '@happy' ? '→ "Por asignar"' : '→ rechazo en la vinculación, sin viaje';
}

export type HoldSuiteOptions = {
	/** Casos a generar (default: los 14 de `HOLD_ALL_CASES`). Orden de generación = orden recibido. */
	cases?: GatewayHoldCase[];
	/**
	 * Sufijo del título del describe, para que un consumidor de UN solo caso siga siendo
	 * identificable en el reporte (ej. `'usuario personal · Hold ON'`).
	 */
	suiteSuffix?: string;
	/** Timeout del describe en ms. Default 240_000 — el de los specs hold Authorize migrados. */
	timeout?: number;
};

/**
 * Genera la suite HOLD de `gateway`. Ver doc del módulo para reglas y capacidades.
 * @throws en TIEMPO DE DEFINICIÓN si la pasarela no usa el form nativo Angular (Stripe).
 */
export function defineHoldSuite(gateway: GatewayName, options: HoldSuiteOptions = {}): void {
	const adapter: GatewayPgAdapter = getGatewayPgAdapter(gateway);
	const registry = adapter.xrayKeys;
	const defaults = journeyDefaultsFor(gateway);
	const cases = options.cases ?? HOLD_ALL_CASES;

	if (adapter.cardForm !== 'native-angular') {
		throw new Error(`defineHoldSuite('${gateway}'): el motor \`runStepwiseHoldJourney\` sólo soporta pasarelas de form ` + `NATIVO Angular y '${gateway}' usa '${adapter.cardForm}'. Stripe tiene su propio flujo de hold ` + '(Elements + fillMinimum/selectCardByLast4) en `specs/stripe/web/carrier/hold/`.');
	}

	// Filtro por intents que la pasarela SÍ expone: `resolveCard` LANZA para los que no
	// (ej. eBizCharge + DECLINE_ZIP_MISMATCH) → el caso no se genera, en vez de romper la suite.
	const supportedIntents = SUPPORTED_INTENTS_BY_GATEWAY[gateway] as readonly CardIntent[];
	const generated = cases.filter(holdCase => supportedIntents.includes(HOLD_CASE_SPECS[holdCase].intent));
	const droppedByIntent = cases.filter(holdCase => !generated.includes(holdCase));
	if (droppedByIntent.length > 0) {
		debugLog('gateway-pg:hold-factory', `[${gateway}] casos NO generados por intent no soportado: ${droppedByIntent.map(c => `${c} (${HOLD_CASE_SPECS[c].intent})`).join(', ')}`);
	}

	// Tag de pasarela SIN guiones (S9): 'mercado-pago' → '@mercadopago'.
	const gatewayTag = gateway.replace(/-/g, '');
	const env = process.env.ENV ?? 'test';
	const suffix = options.suiteSuffix ? ` — ${options.suiteSuffix}` : '';

	test.describe(`Gateway PG · Carrier · Hold ${adapter.displayName}${suffix} [${env.toUpperCase()}] @gateway @${gatewayTag} @hold @regression`, () => {
		test.describe.configure({ mode: 'serial', timeout: options.timeout ?? 240_000 });
		// El fixture KATA (@TestFixture) no define la opción `role` — el login es explícito.
		test.use({ storageState: { cookies: [], origins: [] } });

		test.skip(!adapter.isConfigured(), `Requiere ${adapter.credsEnvKeys.join(' + ')} en .env.test (gate del adapter ${gateway}).`);

		for (const holdCase of generated) {
			const spec = HOLD_CASE_SPECS[holdCase];
			const tcId = registry.holdTcIds[holdCase];
			const key: XrayIssueKey | null = registry.hold[holdCase];
			// Key null = sin issue Xray aún → SIN annotation (unmapped visible; no inventar keys).
			const details = key ? { annotation: [{ type: 'tms', description: key }] } : {};
			const blocked = unsupportedReason(spec);
			// El TC ID va SIEMPRE primero (token que consume el ID-MAP). El marcador `[FIXME: …]`
			// va al final del título para que `--list`, Allure y el reporte HTML muestren que el
			// caso es un PLACEHOLDER trazable y no cobertura ejecutada.
			// El marcador de gate destructivo va en el TÍTULO (no sólo en el motivo del skip) para que
			// `--list` y el reporte muestren POR QUÉ un caso Hold OFF no corrió, sin abrir el trace.
			const destructiveHint = !blocked && spec.holdAxis === 'off' ? ' [requiere GATEWAY_ALLOW_DESTRUCTIVE_SWITCH]' : '';
			const title = `${tcId ? `[${tcId}] ` : ''}${outcomeTag(spec.intent)} Validar alta de viaje ${adapter.displayName} · ${spec.label} ${outcomeHint(spec.intent)}` + (blocked ? ` [FIXME: ${blocked.tag}]` : destructiveHint);

			if (blocked) {
				// `fixme` = el caso EXISTE en la matriz y queda trazable por su TC ID, pero no se
				// ejecuta. El cuerpo lanza a propósito: flipear `fixme` → `test` sin cablear la
				// capacidad falla en rojo en vez de reportar un PASS que no corresponde.
				test.fixme(title, details, () => {
					throw new Error(`Caso '${holdCase}' no ejecutable por el motor stepwise: ${blocked.detail}`);
				});

				continue;
			}

			const { client, passenger } = actorData(spec.actor, defaults);

			test(title, details, async ({ page }) => {
				await runStepwiseHoldJourney(page, {
					gateway,
					intent: spec.intent,
					client,
					passenger,
					origin: defaults.origin,
					destination: defaults.destination,
					// `holdAxis: null` (la matriz no fija el eje) → se omite `holdMode` y el motor no
					// toca ni asevera el toggle, que es exactamente lo que declara la matriz.
					...(spec.holdAxis ? { holdMode: spec.holdAxis } : {}),
					cardFlow: spec.cardFlow
				});
			});
		}
	});
}
