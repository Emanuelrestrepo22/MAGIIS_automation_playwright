/**
 * KATA Component (Layer 3) — Carrier · Detalle / Edición de Viaje Programado.
 *
 * Versión KATA del POM `tests/pages/carrier/TravelDetailPage.ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de operaciones (edición de método de
 * pago en viajes programados). Compone el POM legacy internamente (delegación); el POM
 * legacy queda intacto para specs aún no amoldados (multi-session safety).
 *
 * NOTA @atc — MAPEO por área EDIT: el idmap `atp-mg-gateway-idmap.md` tiene el área EDIT
 * (edición de viaje) en MG-415..MG-427 (Level UI). Los mini-flujos de edición se mapean a
 * los MG más cercanos de esa área: MG-415 (TC-PAY-EDIT-01) para vincular/validar tarjeta
 * durante la edición y MG-416 (TC-PAY-EDIT-02) para confirmar y guardar. PENDIENTE
 * REASIGNAR: no hay 1:1 entre los TS-STRIPE-P2-TC078xx UI y los TC-PAY-EDIT-* del idmap.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Mini-flujos de edición decorados con @atc; navegación/acciones puntuales con @step.
 */

import type { Locator } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import type { GatewayName } from '@fixtures/gateways/_shared';
import type { CardFormFillInput } from '@ui/carrier/card-forms';

import { TravelDetailPage as LegacyTravelDetailPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';
import { cardFormFor } from '@ui/carrier/card-forms';

export class CarrierTravelDetailPage extends UiBase {
	private readonly legacy: LegacyTravelDetailPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyTravelDetailPage(this.page);
	}

	/** Selecciona una opción del dropdown de Forma de Pago. */
	@step
	async selectPaymentMethodOption(optionText: string | RegExp): Promise<void> {
		await this.legacy.selectPaymentMethodOption(optionText);
	}

	/** Completa los campos Stripe de la tarjeta preautorizada. */
	@step
	async fillPreauthorizedCard(cardNumber: string): Promise<void> {
		await this.legacy.fillPreauthorizedCard(cardNumber);
	}

	/** Confirma (Validar) la tarjeta cargada. */
	@step
	async clickValidateCard(): Promise<void> {
		await this.legacy.clickValidateCard();
	}

	/**
	 * Mini-flujo ATC: durante la edición del viaje, vincula y valida una tarjeta
	 * preautorizada nueva (seleccionar método → completar Stripe → Validar).
	 * @atc MG-415 (área EDIT — pendiente reasignar).
	 */
	@atc('MG-415', { severity: 'critical', description: 'Edición de viaje: vincular + validar tarjeta preautorizada' })
	async linkAndValidatePreauthorizedCard(cardNumber: string): Promise<void> {
		await this.legacy.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
		await this.legacy.fillPreauthorizedCard(cardNumber);
		await this.legacy.clickValidateCard();
	}

	/**
	 * Mini-flujo ATC — variante MULTI-PASARELA de `linkAndValidatePreauthorizedCard`: vincula y
	 * valida una tarjeta durante la edición del viaje usando el form que corresponda a la pasarela
	 * activa (`cardFormFor(gateway)` → Stripe Elements o form nativo Angular).
	 *
	 * Por qué es un método aparte y no un refactor del anterior: el hermano Stripe delega en
	 * `legacy.fillPreauthorizedCard(cardNumber)`, que fija vencimiento/CVV/titular/ZIP desde las
	 * constantes `STRIPE_*` del POM legacy. Rutear Stripe por acá cambiaría su fuente de verdad a
	 * lo que pase el caller — deriva silenciosa en un spec que hoy pasa. El path Stripe queda
	 * intacto byte a byte (multi-session safety, regla del repo).
	 *
	 * ⚠️ FRAGILE / TODO(live) — el Strategy `NativeAngularCardForm` fue construido y verificado
	 * contra el form del ALTA DE VIAJE (`NewTravelPage`), NO contra el de la EDICIÓN del detalle.
	 * Asume que la app reusa el mismo componente Angular de tarjeta preautorizada en ambas
	 * pantallas (mismos `formcontrolname`: creditCardNumber / expiryDate / creditCardCVV /
	 * creditCardOwnerName + 5° campo). Es plausible (misma opción "Tarjeta de Crédito -
	 * Preautorizada") pero NO está confirmado en vivo: la primera corrida real sobre el detalle
	 * con Authorize debe verificarlo y, si los selectores difieren, extraer una variante de
	 * Strategy para esta pantalla en vez de parchear la del alta.
	 *
	 * @atc MG-415 — misma key de área EDIT que el hermano Stripe (mapeo por área, convención del
	 * repo: N mini-flujos → 1 key cuando no hay 1:1 con el idmap). Sólo uno corre por test.
	 */
	@atc('MG-415', { severity: 'critical', description: 'Edición de viaje: vincular + validar tarjeta preautorizada (multi-pasarela)' })
	async linkAndValidateCardForGateway(args: { gateway: GatewayName; card: CardFormFillInput }): Promise<void> {
		await this.legacy.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
		const form = cardFormFor(args.gateway);
		await form.fill(this.page, args.card);
		// El form nativo es reactivo y puede limpiar el número tras un re-render — aseverar el
		// llenado ANTES de disparar la validación contra la pasarela (ver CardFormStrategy).
		await form.expectFilled?.(this.page, args.card);
		await this.legacy.clickValidateCard();
	}

	/**
	 * Mini-flujo ATC: confirma la edición seleccionando una tarjeta ya vinculada,
	 * recalcula el viaje y guarda los cambios. @atc MG-416 (área EDIT — pendiente reasignar).
	 */
	@atc('MG-416', {
		severity: 'critical',
		description: 'Edición de viaje: seleccionar tarjeta vinculada + recalcular + guardar'
	})
	async confirmLinkedCardAndSave(cardLabel: string | RegExp): Promise<void> {
		await this.legacy.selectLinkedCard(cardLabel);
		await this.legacy.clickRecalculate();
		await this.legacy.clickSave();
	}

	// ── Cara RECOVERY (post-fallo 3DS) — área D · ATR MG-511 ─────────────────────
	// Superficie que consumen los specs de recovery: estado NO_AUTORIZADO, red flag
	// "Validación 3DS pendiente" y botones "Reintentar autenticación" / "Cambiar tarjeta".
	// Delegan al POM legacy (locators ya validados). Mapeo por área aceptado: el reintento
	// 3DS desde el detalle se cabla al MG libre más cercano del área D → MG-154. Las demás
	// son verificaciones/locators de lectura (sin @atc).

	/** Badge de estado del viaje en el detalle. */
	statusBadge(): Locator {
		return this.legacy.statusBadge();
	}

	/** Botón "Reintentar autenticación" (retry 3DS tras fallo). */
	retryButton(): Locator {
		return this.legacy.retryButton();
	}

	/** Botón "Cambiar tarjeta" en el detalle del viaje NO_AUTORIZADO. */
	changeCardButton(): Locator {
		return this.legacy.changeCardButton();
	}

	/**
	 * Mini-flujo ATC: reintenta la autenticación 3DS desde el detalle del viaje
	 * (re-dispara el challenge de Stripe). @atc MG-154 (área D — mapeo por área).
	 */
	@atc('MG-154', { severity: 'critical', description: 'Reintentar autenticación 3DS desde el detalle del viaje' })
	async clickRetry(): Promise<void> {
		await this.legacy.clickRetry();
	}

	/** Verifica el estado del viaje en el badge del detalle. */
	@step
	async expectStatus(status: string, timeout = 15_000): Promise<void> {
		await this.legacy.expectStatus(status, timeout);
	}

	/** Verifica que el red flag "Validación 3DS pendiente" esté visible. */
	@step
	async expectRedFlagVisible(): Promise<void> {
		await this.legacy.expectRedFlagVisible();
	}

	/** Verifica que el red flag "Validación 3DS pendiente" haya desaparecido. */
	@step
	async expectRedFlagHidden(): Promise<void> {
		await this.legacy.expectRedFlagHidden();
	}
}
