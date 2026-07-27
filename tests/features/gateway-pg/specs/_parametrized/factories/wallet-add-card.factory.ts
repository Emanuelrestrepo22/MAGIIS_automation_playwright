/**
 * Factory parametrizada — Suite WAL · Alta de tarjeta pre-autorizada desde el alta de viaje.
 * ============================================================================================
 *
 * Seam S7 (carrier/gateway-standardization): `defineWalletAddCardSuite(gateway)` generaliza
 * el spec `authorize-add-card.spec.ts` (mismas ACCIONES, DATOS por pasarela):
 *   - Tarjeta vía `resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' })`.
 *   - Form vía `cardFormFor(gateway)` (adapter.cardForm — form nativo Angular compartido).
 *   - Cliente/destino vía `adapter.journeyDefaults.walletClient/walletDestination` (S8).
 *   - Cleanup de idempotencia vía API (`paxSearchQueries` de los defaults) — la re-validación
 *     de una tarjeta YA vinculada da "Error al validar" (verificado live en Authorize).
 * Consumidores THIN:
 *   - `specs/authorize/web/carrier/wallet/authorize-add-card.spec.ts` (conserva MG-285).
 *   - `specs/mercado-pago/web/carrier/wallet/cliente-individuo-add-delete-card.spec.ts`
 *     (add + delete, sin annotation: registry WAL de MP = null).
 *
 * REGLAS load-bearing:
 *   1. Annotation tms del registry (`adapter.xrayKeys.wallet.addCard`) a nivel describe —
 *      key `null` → SIN annotation (unmapped visible; jamás inventar keys).
 *   2. SIN locators en la factory (regla KATA): interacción vía CarrierDashboardPage /
 *      CarrierNewTravelPage + CardFormStrategy + helper MP (`validateAndSelectMercadoPagoCard`).
 *   3. Validación por pasarela: MP = tarjeta resaltada o `test.skip` (sandbox MP no
 *      transacciona en TEST — UAT-only); Authorize/eBiz = "Validar" + oráculo "Tarjeta
 *      válida" (verificado live Authorize; eBiz asumido — mismo form).
 *   4. Stripe NO soportado todavía (Elements valida por otro flujo — `fillMinimum`/
 *      `selectCardByLast4`); pedirlo lanza en tiempo de definición.
 */

import type { GatewayName } from '@fixtures/gateways/_shared';
import type { Page } from '@playwright/test';

import { test, expect } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { resolveCard } from '@fixtures/gateways/_shared';
import { debugLog } from '@helpers/index';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';
import { getPassengerId, getPassengerCards, deletePassengerCard } from '@features/gateway-pg/helpers/card-precondition';

export type WalletAddCardSuiteOptions = {
	/** TC ID de matriz para el título (ej. 'TS-AUTHORIZE-WAL-01'). Omitido → sin corchete. */
	tcId?: string;
	/** Tags extra del título del test (ej. '@smoke @gateway-pg @carrier'). */
	extraTags?: string;
	/** Tras vincular, eliminar la tarjeta desde el dropdown (flujo add+delete MP). Default false. */
	deleteAfterAdd?: boolean;
	/**
	 * Borrar por API la tarjeta (last4) del pax ANTES del alta — idempotencia de re-runs
	 * (re-validar una tarjeta ya vinculada falla, verificado live Authorize). Default true.
	 */
	cleanupBeforeAdd?: boolean;
};

/**
 * Idempotencia: borra por API la tarjeta (last4) del pax antes del alta. Prueba varias
 * queries de búsqueda (la tarjeta se adjunta al pasajero del alta). Extraído del spec
 * Authorize original; queries por pasarela en `journeyDefaults.paxSearchQueries` (S8).
 */
async function cleanupGatewayCard(page: Page, queries: readonly string[], last4: string): Promise<void> {
	for (const query of queries) {
		try {
			const paxId = await getPassengerId(page, query);
			const resp = await getPassengerCards(page, paxId);
			const cards = resp.cards ?? [];
			const toDelete = cards.filter(card => card.lastFourDigits === last4);
			for (const card of toDelete) await deletePassengerCard(page, paxId, card.id);
			debugLog('gateway-pg:wallet', `[precond] query="${query}" pax=${paxId}: ${cards.length} tarjetas, borradas ${toDelete.length} con last4=${last4}`);
			if (toDelete.length > 0) return;
		} catch (error) {
			debugLog('gateway-pg:wallet', `[precond] query="${query}" skip: ${(error as Error).message}`);
		}
	}
}

/**
 * Genera la suite WAL (alta de tarjeta) de `gateway`. Ver doc del módulo.
 * Lanza en TIEMPO DE DEFINICIÓN para stripe (sin driver de validación Elements acá).
 */
export function defineWalletAddCardSuite(gateway: GatewayName, options: WalletAddCardSuiteOptions = {}): void {
	if (gateway === 'stripe') {
		throw new Error(
			"defineWalletAddCardSuite('stripe'): el alta de tarjeta Stripe Elements valida por el flujo fillMinimum/selectCardByLast4 " +
				'(otro oráculo) — la factory WAL cubre hoy el form nativo (authorize/ebizcharge/mercado-pago).'
		);
	}

	const adapter = getGatewayPgAdapter(gateway);
	const defaults = adapter.journeyDefaults;
	const addCardKey = adapter.xrayKeys.wallet.addCard;
	const cleanupBeforeAdd = options.cleanupBeforeAdd ?? true;
	// resolveCard es puro/síncrono → resoluble en tiempo de definición (last4 en el título).
	const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });
	const env = process.env.ENV ?? 'test';
	const titlePrefix = options.tcId ? `[${options.tcId}] ` : '';
	const extraTags = options.extraTags ? `${options.extraTags} ` : '';
	// Key null (eBiz/MP sin issue WAL aún) → SIN annotation (no inventar keys).
	const describeDetails = addCardKey ? { annotation: [{ type: 'tms', description: addCardKey }] } : {};

	// Tag de pasarela SIN guiones (S9): 'mercado-pago' → '@mercadopago' — los scripts npm
	// por pasarela grepean el tag normalizado; el identifier de código NO cambia.
	const gatewayTag = gateway.replace(/-/g, '');

	test.describe(`Gateway PG · Carrier · ${adapter.displayName} — alta de tarjeta pre-autorizada @gateway @${gatewayTag} @wallet @regression`, describeDetails, () => {
		test.describe.configure({ mode: 'serial', timeout: 180_000 });
		// El fixture KATA no define la opción `role` — login explícito vía loginAsDispatcher.
		test.use({ storageState: { cookies: [], origins: [] } });

		test(`${titlePrefix}${extraTags}@wallet vincular tarjeta ${adapter.displayName} (•••• ${card.last4}) desde el alta de viaje (${env.toUpperCase()})`, async ({ page }) => {
			const dashboard = new CarrierDashboardPage({ page });
			const travel = new CarrierNewTravelPage({ page });

			await test.step(`Given: dispatcher logueado (${env.toUpperCase()}, creds chain ${gateway})`, async () => {
				// Retry del login ante flake de auth de apps-test (patrón del spec Authorize F4).
				await expect(async () => {
					await loginAsDispatcher(page, { gateway });
				}).toPass({ timeout: 120_000, intervals: [2_000, 4_000, 8_000] });
			});

			if (cleanupBeforeAdd) {
				await test.step('And: precondición — limpiar tarjeta previa del pax (idempotencia)', async () => {
					await cleanupGatewayCard(page, defaults.paxSearchQueries, card.last4);
				});
			}

			await test.step('When: formulario de nuevo viaje con cliente y destino', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
				await travel.selectClient(defaults.walletClient);
				await travel.setDestination(defaults.walletDestination);
			});

			await test.step(`And: método "Preautorizada" + alta de tarjeta ${adapter.displayName} (form ${adapter.cardForm})`, async () => {
				await travel.selectPaymentMethod('Preautorizada');
				await cardFormFor(gateway).fill(page, card);
			});

			await test.step(`Then: la tarjeta ${adapter.displayName} queda validada/vinculada`, async () => {
				if (gateway === 'mercado-pago') {
					// Vinculación satisfactoria = tarjeta resaltada en el dropdown (recording test-15).
					const mpLink = await validateAndSelectMercadoPagoCard(page);
					test.skip(
						mpLink !== 'linked',
						'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.'
					);
				} else {
					await travel.validateNativeCard();
				}
			});

			if (options.deleteAfterAdd) {
				await test.step('Then: la tarjeta queda vinculada (resaltada en métodos de pago)', async () => {
					await travel.expectHighlightedSavedCard();
				});
				await test.step('When/Then: se elimina la tarjeta vinculada y ya no queda resaltada', async () => {
					await travel.deleteHighlightedSavedCard();
				});
			}
		});
	});
}
