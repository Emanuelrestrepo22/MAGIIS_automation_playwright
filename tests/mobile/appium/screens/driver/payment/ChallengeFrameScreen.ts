/**
 * ChallengeFrameScreen — challenge 3DS hosted de Stripe tras COBRAR (tarjeta always-3DS): página en
 * iframe(s) anidados (stripe frame -> challenge/acs). Pasada ÚNICA por intento: la espera con timeout
 * es del PBO.
 *
 * PUNTO DE UNIÓN: es el 3DS de Stripe que otra ola extrae como `screens/shared/Stripe3DS`; cuando
 * exista, el PBO inyecta esa screen en lugar de esta (misma interfaz `ChallengeFrame`).
 */

import type { MobileSession } from '../../../core/MobileSession';
import { PaymentWebContext } from './PaymentWebContext';
import type { ChallengeAction } from './PaymentTypes';

/** Interfaz mínima que el PBO necesita del challenge 3DS (reemplazable por `shared/Stripe3DS`). */
export type ChallengeFrame = {
	tryCompleteById(action: ChallengeAction): Promise<boolean>;
	tryCompleteByText(action: ChallengeAction): Promise<boolean>;
};

const COMPLETE_TEXTS = [
	'complete authentication',
	'complete auth',
	'complete',
	'completar',
	'authorize test payment',
	'authorize',
	'autenticar',
	'finish',
	'submit'
];
const FAIL_TEXTS = ['fail authentication', 'fail auth', 'fail', 'rechazar', 'cancel', 'cancelar'];

export class ChallengeFrameScreen implements ChallengeFrame {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	/** Botón por id de Stripe test (`#test-source-authorize-3ds` / `#test-source-fail-3ds`) o por palabra. */
	tryCompleteById(action: ChallengeAction): Promise<boolean> {
		const targetId = action === 'complete' ? 'test-source-authorize-3ds' : 'test-source-fail-3ds';
		const wordRe = action === 'complete' ? 'complete|completar|authorize|autoriz' : 'fail|rechaz';
		return this.acrossFrames(
			() =>
				this.web
					.execHere(
						(id: string, re: string): boolean => {
							const byId = document.getElementById(id) as HTMLElement | null;
							if (byId && byId.offsetParent !== null) {
								byId.click();
								return true;
							}
							const rx = new RegExp(re, 'i');
							const els = Array.from(
								document.querySelectorAll(
									'button, [role="button"], a, input[type="button"], input[type="submit"]'
								)
							) as HTMLElement[];
							const m = els.find(
								b =>
									b.offsetParent !== null &&
									(rx.test(b.textContent ?? '') || rx.test((b as HTMLInputElement).value ?? ''))
							);
							if (!m) return false;
							m.click();
							return true;
						},
						targetId,
						wordRe
					)
					.catch(() => false),
			2_000,
			800
		);
	}

	/** Botón por texto ("Complete authentication", "Authorize test payment", ...). */
	tryCompleteByText(action: ChallengeAction): Promise<boolean> {
		const wanted = action === 'complete' ? COMPLETE_TEXTS : FAIL_TEXTS;
		return this.acrossFrames(
			() =>
				this.web
					.execHere((texts: string[]): boolean => {
						const norm = (v: unknown) =>
							String(v ?? '')
								.replace(/\s+/g, ' ')
								.trim()
								.toLowerCase();
						const els = Array.from(
							document.querySelectorAll(
								'button, [role="button"], a, input[type="button"], input[type="submit"]'
							)
						) as HTMLElement[];
						const m = els.find(
							b =>
								b.offsetParent !== null &&
								texts.some(
									t =>
										norm(b.textContent).includes(t) ||
										norm((b as HTMLInputElement).value).includes(t)
								)
						);
						if (!m) return false;
						m.click();
						return true;
					}, wanted)
					.catch(() => false),
			3_000,
			1_000
		);
	}

	/** `attempt` en el top y luego en cada iframe (y su primer iframe anidado). Vuelve al top siempre. */
	private async acrossFrames(
		attempt: () => Promise<boolean>,
		topWebMs: number,
		frameWebMs: number
	): Promise<boolean> {
		await this.web.switchToWebView(topWebMs);
		if (await attempt()) return true;

		const iframeCount = await this.web
			.execHere((): number => document.querySelectorAll('iframe').length)
			.catch(() => 0);
		for (let i = 0; i < iframeCount; i++) {
			try {
				await this.web.toTopFrame();
				await this.web.switchToWebView(frameWebMs);
				const frame = this.web.$(`iframe:nth-of-type(${i + 1})`);
				if (!(await frame.isExisting().catch(() => false))) continue;
				await this.web.switchFrame(frame);
				if (await attempt()) {
					await this.web.toTopFrame();
					return true;
				}
				const inner = this.web.$('iframe');
				if (await inner.isExisting().catch(() => false)) {
					await this.web.switchFrame(inner);
					if (await attempt()) {
						await this.web.toTopFrame();
						return true;
					}
				}
			} catch {
				/* siguiente iframe */
			} finally {
				await this.web.toTopFrame();
			}
		}
		return false;
	}
}
