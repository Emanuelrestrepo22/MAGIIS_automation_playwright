/**
 * KATA Component (Layer 3) — Stripe 3DS Challenge Modal.
 *
 * Versión KATA del POM `tests/features/gateway-pg/pages/ThreeDSModal.ts`: extiende
 * `UiBase` y expone el modal de autenticación 3DS de Stripe Elements como mini-flujos.
 * Authorize.net NO usa 3DS → este componente NO aplica a otros gateways.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`).
 *   - Locators inline (no se extraen: cada uno se usa 1 vez por método).
 *   - Métodos públicos fail-fast; helpers de espera decorados con @step; el mini-flujo
 *     de aprobación decorado con @atc.
 *
 * NOTA @atc — MAPEO PENDIENTE REASIGNAR: el idmap `atp-mg-gateway-idmap.md` es API-level
 * (TC-PAY-*); los TS-STRIPE-TC10xx (UI/3DS) no tienen 1:1. Se usa el MG más cercano del
 * área D (3DS / validación tarjeta): MG-152 (TC-PAY-D-01) para el success y MG-153
 * (TC-PAY-D-02) para el fail. Reasignar cuando el ATP tenga TCs UI del challenge 3DS.
 */

import type { Frame, FrameLocator, Locator } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';
const THREE_DS_CHALLENGE_FRAME_SELECTOR = 'iframe[name="stripe-challenge-frame"]';
const THREE_DS_TIMEOUT = 60_000;
const THREE_DS_STABILIZATION_DELAY = 10_000;

export class ThreeDsChallengePage extends UiBase {
	readonly overlay: Locator;

	constructor(options: TestContextOptions) {
		super(options);
		this.overlay = this.page.locator(THREE_DS_MODAL_SELECTOR);
	}

	private getBankFrame(): FrameLocator {
		return this.page.frameLocator(THREE_DS_MODAL_SELECTOR).frameLocator(THREE_DS_CHALLENGE_FRAME_SELECTOR);
	}

	private async waitForChallengeFrame(timeout = THREE_DS_TIMEOUT): Promise<Frame> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const frame = this.page
				.frames()
				.find(
					candidate =>
						candidate.name() === 'stripe-challenge-frame' ||
						candidate.url().includes('testmode-acs.stripe.com/3d_secure_2_test')
				);

			if (frame) {
				await frame.waitForLoadState('load', { timeout }).catch(() => undefined);
				return frame;
			}

			// NOTE(tier3-kept): polling propio con deadline — frame Stripe no emite evento DOM de "appeared".
			await this.page.waitForTimeout(250);
		}

		throw new Error('Stripe challenge frame not found');
	}

	@step
	async waitForVisible(timeout = THREE_DS_TIMEOUT): Promise<void> {
		const challengeFrame = await this.waitForChallengeFrame(timeout);
		const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });

		await expect(this.overlay).toBeVisible({ timeout });
		await expect(completeButton).toBeVisible({ timeout });
	}

	/**
	 * Espera NO bloqueante por el overlay 3DS. Si el challenge es opcional (p.ej. tarjeta guardada
	 * que reusa autorización), una ventana de tiempo fija es una fuente clásica de flakiness
	 * (TC1062): si el challenge tarda más que la ventana se pierde. Con `settled` cortamos apenas
	 * el flujo avanzó sin challenge (señal determinista, p.ej. botón de vehículo habilitado o URL de
	 * detalle), en vez de agotar el timeout a ciegas.
	 */
	@step
	async waitForOptionalVisible(timeout = THREE_DS_TIMEOUT, settled?: () => Promise<boolean>): Promise<boolean> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			if (await this.overlay.isVisible().catch(() => false)) return true;
			// El challenge tiene prioridad: solo damos por "asentado sin challenge" si NO hay overlay.
			if (settled && (await settled().catch(() => false))) return false;

			// NOTE(tier3-kept): polling propio con deadline — overlay 3DS es iframe Stripe sin evento DOM propio.
			await this.page.waitForTimeout(500);
		}

		return false;
	}

	@step
	async waitForHidden(timeout = 45_000): Promise<void> {
		const deadline = Date.now() + timeout;
		const challengeFrame = await this.waitForChallengeFrame(timeout);
		const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });
		const vehicleButton = this.page
			.locator('button:visible')
			.filter({ hasText: /Seleccionar Veh[íi]culo/i })
			.first();

		while (Date.now() < deadline) {
			const completeVisible = await completeButton.isVisible().catch(() => false);
			const vehicleVisible = await vehicleButton.isVisible().catch(() => false);
			const vehicleEnabled = vehicleVisible ? await vehicleButton.isEnabled().catch(() => false) : false;

			if (!completeVisible && (!vehicleVisible || vehicleEnabled)) return;

			// NOTE(tier3-kept): condición compuesta (completeVisible + vehicleEnabled) — no reemplazable con retryAsync.
			await this.page.waitForTimeout(500);
		}

		throw new Error('Stripe 3DS modal still visible after timeout');
	}

	/** Mini-flujo ATC: aprueba el challenge 3DS (COMPLETE). @atc MG-152 (pendiente reasignar). */
	@atc('MG-152', { severity: 'critical', description: 'Aprobar el challenge 3DS de Stripe (COMPLETE)' })
	async completeSuccess(): Promise<void> {
		const challengeFrame = await this.waitForChallengeFrame();
		const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });

		await expect(completeButton).toBeVisible({ timeout: THREE_DS_TIMEOUT });
		// NOTE(tier3-kept): estabilización 10s — iframe Stripe no expone evento "ready" post-carga.
		await this.page.waitForTimeout(THREE_DS_STABILIZATION_DELAY);
		await completeButton.click();
	}

	/** Mini-flujo ATC: rechaza el challenge 3DS (FAIL). @atc MG-153 (pendiente reasignar). */
	@atc('MG-153', { severity: 'normal', description: 'Rechazar el challenge 3DS de Stripe (FAIL)' })
	async completeFail(): Promise<void> {
		const challengeFrame = await this.waitForChallengeFrame();
		const failButton = challengeFrame.getByRole('button', { name: /^FAIL$/i });

		await expect(failButton).toBeVisible({ timeout: THREE_DS_TIMEOUT });
		// NOTE(tier3-kept): estabilización 10s — mismo patrón que completeSuccess.
		await this.page.waitForTimeout(THREE_DS_STABILIZATION_DELAY);
		await failButton.click();
	}
}
