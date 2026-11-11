/**
 * DriverTripPaymentScreen — FACHADA legada del Cargo a Bordo (strangler, paso 8 de la migración POM+PBO).
 *
 * La lógica vive ahora en:
 *   - `screens/driver/payment/*`  (POM: modal de cobro, form nativo, form Stripe, COBRAR, resultado, 3DS)
 *   - `pbo/PaymentPBO.ts`         (verbos de negocio con resultado tipado)
 *
 * Esta clase conserva la API pública (y los tipos re-exportados) para los consumidores actuales
 * (`DriverCargoDeclineHarness`, `DriverViajeCalleScreen`, `scripts/driver-*`) y delega en `PaymentPBO`
 * sobre una `MobileSession` que envuelve el mismo driver. Pendiente: reapuntar consumidores al PBO y
 * deprecar esta fachada.
 *
 * Dos ramas de form de tarjeta, elegidas por PRESENCIA del campo nativo (no por pasarela):
 *   A) NATIVA — `credit-card-payment-data` con inputs Ionic propios, sin iframes.
 *   B) STRIPE ELEMENTS — cada campo en su iframe `__privateStripeFrame`; único camino con 3DS.
 *
 * 🔴 TIMING: la ventana del driver-candidato para completar el cobro es CORTA; si el fill tarda, el
 *    viaje se cancela ("El Viaje fue Cancelado" / "Viaje perdido").
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';
import { MobileSession } from '../core/MobileSession';
import { PaymentPBO } from '../pbo/PaymentPBO';
import type { CardData, PaymentOutcome } from '../screens/driver/payment/PaymentTypes';

export type { CardData, PaymentOutcome };

export class DriverTripPaymentScreen extends AppiumSessionBase {
	private cached: { driver: AppiumDriver; pbo: PaymentPBO } | null = null;

	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	/** PBO sobre el driver vigente (se recrea si la sesión se reinició y el driver cambió). */
	private pbo(): PaymentPBO {
		const driver = this.getDriver();
		if (!this.cached || this.cached.driver !== driver) {
			const session = new MobileSession(this.config, { driver });
			this.cached = { driver, pbo: PaymentPBO.forSession(session) };
		}
		return this.cached.pbo;
	}

	/** Espera a que el modal de cobro (overlay activo) esté listo para tipear. */
	async waitForPaymentScreen(timeout = 30_000): Promise<boolean> {
		return this.pbo().waitForChargeModal(timeout);
	}

	/** Llena la tarjeta (rama nativa o Stripe según el form que renderizó la app). */
	async fillCardForm(card: CardData): Promise<void> {
		await this.pbo().fillCard(card);
	}

	/** Tap COBRAR cuando la app lo habilita; si no, lanza con la radiografía del form. */
	async submitPayment(enableTimeout = 12_000): Promise<void> {
		await this.pbo().submit(enableTimeout);
	}

	/** Espera el resultado del cobro (decline / viaje perdido / éxito por ausencia de modal). */
	async waitForPaymentOutcome(timeout = 25_000): Promise<PaymentOutcome> {
		return this.pbo().waitForOutcome(timeout);
	}

	/** Cierra el alert bloqueante (Viaje perdido/Cancelado) o el attention modal. */
	async dismissAttentionModal(): Promise<boolean> {
		return this.pbo().dismissAttention();
	}

	/** Una pasada del challenge 3DS de Stripe (complete/fail); `true` si lo resolvió. */
	async tryComplete3DS(action: 'complete' | 'fail' = 'complete'): Promise<boolean> {
		return this.pbo().tryComplete3DS(action);
	}

	/** Completa (o falla) el challenge 3DS hasta `timeout`; no lanza si no aparece. */
	async handle3DSChallenge(action: 'complete' | 'fail', timeout = 30_000): Promise<void> {
		await this.pbo().handle3DS(action, timeout);
	}

	/** Flujo completo: llenar tarjeta -> COBRAR -> esperar resultado. */
	async fillAndSubmit(card: CardData, outcomeTimeout = 25_000): Promise<PaymentOutcome> {
		return (await this.pbo().chargeWithCard(card, { outcomeTimeoutMs: outcomeTimeout })).outcome;
	}
}
