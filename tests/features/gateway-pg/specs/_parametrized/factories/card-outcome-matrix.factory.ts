/**
 * Factory parametrizada — Matriz de outcomes de alta de tarjeta (área C del ATP).
 * ================================================================================
 *
 * `defineCardOutcomeMatrixSuite(gateway)` genera UN caso por intent canónico: ingresa la
 * tarjeta que dispara ese outcome en la pasarela y verifica lo que el sistema debe hacer.
 * Mismas ACCIONES para las 3 pasarelas de form nativo; lo único que cambia es el dato,
 * que sale de `CARD_MATRIX`.
 *
 * Es la suite que convierte los 92 números documentados de eBizCharge en cobertura:
 * antes, de esos 92 solo 3 eran alcanzables desde un spec.
 *
 * ═══ POR QUÉ GENERA TAMBIÉN LOS CASOS QUE NO CORREN ═══
 *
 * Un intent que la pasarela no soporta igual produce un `test` que skipea con la razón
 * declarada en su celda de la matriz. Suena redundante y es lo contrario: si el caso
 * simplemente no se generara, la ausencia de cobertura sería invisible en el reporte, que
 * es exactamente el problema que esta refactorización viene a cerrar. Un skip con motivo
 * es una decisión auditable; un caso ausente es un agujero silencioso.
 *
 * Tres motivos de skip, distinguibles en el reporte:
 *   1. `N/A` — la pasarela no expone ese outcome (razón literal de la celda `{ na }`).
 *   2. `sin oráculo` — la pasarela lo expone pero nadie definió qué debe hacer MAGIIS
 *      (ver `helpers/journey-outcome.ts`: FRAUD_REVIEW, HAPPY_PARTIAL_AUTH, DECLINE_CAPTURE).
 *   3. gate de credenciales del adapter, a nivel describe.
 *
 * NO lleva gate destructivo: ver la nota de ALCANCE DE ESCRITURA en el cuerpo del describe.
 *
 * EXCEPCIÓN: `HAPPY_AUTH`/`FAIL_AUTH` con `adapter.requires3ds === false` NO se generan ni
 * como skip. 3DS es exclusivo de Stripe y la invariante 1 de
 * `assertAdapterFixtureConsistency` lo trata como caso EXCLUIDO, no degradado.
 *
 * REGLAS load-bearing:
 *   1. SIN locators en la factory (regla KATA): toda interacción va por
 *      `CarrierDashboardPage` / `CarrierNewTravelPage` + `CardFormStrategy`.
 *   2. Annotation `tms` por caso desde el registry; key `null` → SIN annotation
 *      (unmapped visible; JAMÁS inventar keys).
 *   3. El oráculo NO se elige acá: sale de `outcomeFor(intent)`, igual para las 4
 *      pasarelas. Cambiar el comportamiento esperado es cambiar ese archivo, no la factory.
 *   4. Stripe lanza en tiempo de definición (Elements valida por otro flujo), igual que
 *      `defineWalletAddCardSuite`.
 */

import type { CardIntent, GatewayName } from '@fixtures/gateways/_shared';

import { test, expect } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { ALL_CARD_INTENTS, intentSupport } from '@fixtures/gateways/_shared';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { gatewayTag } from '@features/gateway-pg/helpers/adapters/gateway-tag';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { addCardExpectation, areaFRelocationFor, hasObservedOutcome, outcomeFor } from '@features/gateway-pg/helpers/journey-outcome';
import { cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';
import { assertAuthorizeAccountMeasuresRealAuthorizations } from '@features/gateway-pg/helpers/authorize-account-guard';

export type CardOutcomeMatrixSuiteOptions = {
	/** Subconjunto de intents. Default: `ALL_CARD_INTENTS` (matriz completa). */
	intents?: readonly CardIntent[];
	/** TC ID de matriz por intent (ej. `TS-EBIZ-TC1012`). `null` → título sin corchete. */
	tcIdFor?: (gateway: GatewayName, intent: CardIntent) => string | null;
	/** Key Xray por intent → annotation `tms`. `null` → SIN annotation. */
	xrayKeyFor?: (gateway: GatewayName, intent: CardIntent) => string | null;
	/** Tags extra del título. */
	extraTags?: string;
	/** Limpiar por API la tarjeta previa del pax antes de cada caso. Default true. */
	cleanupBeforeAdd?: boolean;
};

/** Tag por intent, para poder grepear un outcome puntual across pasarelas. */
function intentTag(intent: CardIntent): string {
	return `@intent-${intent.toLowerCase().replace(/_/g, '-')}`;
}

/**
 * Genera la suite de matriz de outcomes de alta de tarjeta para `gateway`.
 * @throws En tiempo de definición si se pide para stripe.
 */
export function defineCardOutcomeMatrixSuite(gateway: GatewayName, options: CardOutcomeMatrixSuiteOptions = {}): void {
	if (gateway === 'stripe') {
		throw new Error(
			"defineCardOutcomeMatrixSuite('stripe'): el alta con Stripe Elements valida por el flujo " +
				'fillMinimum/selectCardByLast4 (otro oráculo) — esta factory cubre el form nativo Angular ' +
				'(authorize/ebizcharge/mercado-pago), igual que defineWalletAddCardSuite.'
		);
	}

	const adapter = getGatewayPgAdapter(gateway);
	const defaults = adapter.journeyDefaults;
	const intents = options.intents ?? ALL_CARD_INTENTS;
	const cleanupBeforeAdd = options.cleanupBeforeAdd ?? true;
	const env = process.env.ENV ?? 'test';
	const extraTags = options.extraTags ? `${options.extraTags} ` : '';

	test.describe(
		`Gateway PG · Carrier · ${adapter.displayName} — matriz de outcomes de alta de tarjeta @gateway ${gatewayTag(gateway)} @cardmatrix @regression`,
		() => {
			test.describe.configure({ mode: 'serial', timeout: 180_000 });
			// El fixture KATA no define la opción `role` — login explícito vía loginAsDispatcher.
			test.use({ storageState: { cookies: [], origins: [] } });

			test.skip(!adapter.isConfigured(), `Requiere ${adapter.credsEnvKeys.join(' + ')} en .env.test (gate del adapter ${gateway}).`);

			// Gate de validez de medición — CRÍTICO en esta suite: si la cuenta es la enlatada de
			// Test Mode, TODOS los triggers de ZIP/CVV devuelven lo mismo y la matriz de outcomes
			// mediría un único comportamiento haciéndolo pasar por cinco. Ver ronda 4 del RUN-LOG.
			test.beforeAll(async () => {
				if (gateway === 'authorize') await assertAuthorizeAccountMeasuresRealAuthorizations();
			});

			// ALCANCE DE ESCRITURA de esta suite: da de alta tarjetas en la wallet del pax, con
			// cleanup idempotente previo por API. Es EXACTAMENTE el alcance de
			// `defineWalletAddCardSuite`, que no lleva gate destructivo y corre en la suite
			// Authorize (MG-285). NUNCA vincula ni desvincula una pasarela, así que no dispara la
			// cascada de `cleaningWallets` — que es la razón por la que existe
			// GATEWAY_ALLOW_DESTRUCTIVE_SWITCH y por la que la suite CFG sí lo exige.
			// Gatear esta suite con ese flag describía mal lo que hace y la dejaba inejecutable.

			for (const intent of intents) {
				const support = intentSupport(gateway, intent);

				// 3DS es EXCLUSIVO Stripe: para el resto el caso queda EXCLUIDO, no degradado
				// (invariante 1 de assertAdapterFixtureConsistency).
				const es3ds = intent === 'HAPPY_AUTH' || intent === 'FAIL_AUTH';
				if (es3ds && !adapter.requires3ds) continue;

				const tcId = options.tcIdFor?.(gateway, intent) ?? null;
				const xrayKey = options.xrayKeyFor?.(gateway, intent) ?? null;
				const details = xrayKey ? { annotation: [{ type: 'tms', description: xrayKey }] } : {};

				// `intentSupport` es puro/síncrono → el last4 entra al título en tiempo de definición.
				const last4 = support.supported ? ` (•••• ${support.card.last4})` : '';
				// `areaFRelocationFor` también es puro → el título dice desde el reporte que este caso
				// verifica el ALTA (área C) y que el rechazo se decide en el área F. Sin esto el título
				// decía "rechazada" en un caso que asserta una aprobación, que es peor que no decir nada.
				const areaF = hasObservedOutcome(intent) ? areaFRelocationFor(gateway, intent) : undefined;
				const etiquetaBase = hasObservedOutcome(intent) ? outcomeFor(intent).label : intent.toLowerCase().replace(/_/g, ' ');
				const etiqueta = areaF ? `alta APROBADA — ${etiquetaBase} se decide en el área ${areaF.area} (cobro)` : etiquetaBase;
				const title = `${tcId ? `[${tcId}] ` : ''}${extraTags}@cardmatrix ${intentTag(intent)} ${intent} — ${etiqueta}${last4} (${env.toUpperCase()})`;

				test(title, details, async ({ page }) => {
					// ── Motivo de skip 1: la pasarela no expone este outcome ──
					if (!support.supported) {
						test.info().annotations.push({ type: 'na', description: support.reason });
						test.skip(true, `[${gateway}/${intent}] N/A — ${support.reason}`);
						return;
					}

					// ── Motivo de skip 2: no hay oráculo de sistema definido ──
					if (!hasObservedOutcome(intent)) {
						const motivo =
							`[${gateway}/${intent}] Sin oráculo de sistema: la pasarela expone el outcome pero nadie definió ` +
							'qué debe mostrar MAGIIS. Definirlo en helpers/journey-outcome.ts (con producto o con una corrida en vivo) ' +
							'antes de habilitar el caso.';
						test.info().annotations.push({ type: 'sin-oraculo', description: motivo });
						test.skip(true, motivo);
						return;
					}

					const card = support.card;
					const expected = outcomeFor(intent);
					// La latencia del sandbox es dato de la celda (eBiz DELAY_*), no un número mágico.
					if (support.slowMs) test.setTimeout(180_000 + support.slowMs);

					const dashboard = new CarrierDashboardPage({ page });
					const travel = new CarrierNewTravelPage({ page });

					await test.step(`Given: dispatcher logueado (${env.toUpperCase()}, creds chain ${gateway})`, async () => {
						// Retry del login ante flake de auth de apps-test (patrón del spec Authorize F4).
						await expect(async () => {
							await loginAsDispatcher(page, { gateway });
						}).toPass({ timeout: 120_000, intervals: [2_000, 4_000, 8_000] });
					});

					if (cleanupBeforeAdd) {
						await test.step('And: precondición — limpiar la tarjeta previa del pax (idempotencia de re-runs)', async () => {
							await cleanupGatewayCardByLast4(page, defaults.paxSearchQueries, card.last4);
						});
					}

					await test.step('When: formulario de nuevo viaje con cliente y destino', async () => {
						await dashboard.openNewTravel();
						await travel.ensureLoaded();
						await travel.selectClient(defaults.walletClient);
						await travel.setDestination(defaults.walletDestination);
					});

					await test.step(`And: se ingresa la tarjeta de ${adapter.displayName} que dispara ${intent} (form ${adapter.cardForm})`, async () => {
						await travel.selectPaymentMethod('Preautorizada');
						await cardFormFor(gateway).fill(page, card);
					});

					// El oráculo sale de journey-outcome, idéntico para las 4 pasarelas. `addCardExpectation`
					// le suma la única corrección que NO es cross-pasarela: si la pasarela evalúa este
					// outcome en la transacción y no en el alta (Authorize con triggers de ZIP/CVV), el
					// área C debe esperar un alta APROBADA — es lo observado en vivo — y la cobertura del
					// rechazo vive en el área F. Ver AREA_F_SCOPED_OUTCOMES en journey-outcome.ts.
					const addCard = addCardExpectation(gateway, intent);
					if (addCard.relocation) {
						test.info().annotations.push({
							type: 'area-f',
							description:
								`[${gateway}/${intent}] El outcome se evalúa en el área F, no en el alta. ${addCard.relocation.reason} ` +
								`Evidencia: ${addCard.relocation.evidence} Este caso verifica el área C (el alta aprueba). ` +
								'El rechazo NO está cubierto hoy: la ronda 4 del RUN-LOG corrió el hold con estos intents y el área F ' +
								'tampoco rechaza (viaje en SEARCHING_DRIVER). Gap declarado, no cobertura pendiente de otra suite.'
						});
					}

					if (addCard.shouldSucceed) {
						const etiquetaThen = addCard.relocation
							? `${expected.label} — pero el outcome se decide en el área ${addCard.relocation.area}: acá el alta APRUEBA (live-verified)`
							: `${expected.label}, base: ${expected.basis}`;
						await test.step(`Then: el sistema da la tarjeta por válida (${etiquetaThen})`, async () => {
							await travel.validateNativeCard(card.last4);
						});
					} else {
						await test.step(`Then: el sistema NO da la tarjeta por válida (${expected.label}, base: ${expected.basis})`, async () => {
							await travel.expectNativeCardRejected();
						});
					}
				});
			}
		}
	);
}
