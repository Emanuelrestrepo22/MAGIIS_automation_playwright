/**
 * TripLifecyclePBO — ciclo de vida del viaje del chofer: aceptar oferta -> iniciar -> finalizar ->
 * leer resumen -> cerrar (con firma si el botón es «Firmar y Cerrar viaje»). Compone las screens de
 * `screens/driver/*` y `SignaturePBO`; NO tiene locators.
 *
 * Irreversibles: `finishTrip` y `closeTrip` finalizan/cierran un viaje real (no hay reintento). Exigen
 * `confirmed: true` explícito del llamador (el gate de ambiente/handoff vive en `F5CloseTripPlan`).
 *
 * TODO (sin confirmar contra dump): orden exacto tras `tapClose`. El código legado documenta «Firmar y
 * Cerrar» -> modal de firma y «requiere un segundo tap post-firma». Acá, tras `tapClose`: si el cierre
 * requiere firma -> firma; luego, si aparece un `app-confirm-modal`, se confirma (ventana corta). El
 * «segundo tap» post-firma NO está modelado hasta verificarlo en device.
 */

import type { I18n } from '../core/I18n';
import type { MobileSession } from '../core/MobileSession';
import { tryUntil } from '../core/Waits';
import { ConfirmModal } from '../screens/driver/ConfirmModal';
import { TripConfirmScreen } from '../screens/driver/TripConfirmScreen';
import { TripInProgressScreen } from '../screens/driver/TripInProgressScreen';
import { TripResumeScreen } from '../screens/driver/TripResumeScreen';
import { TripToStartScreen } from '../screens/driver/TripToStartScreen';
import { SignaturePBO } from './SignaturePBO';

export class IrreversibleNotConfirmedError extends Error {
	constructor(action: string) {
		super(`[TripLifecyclePBO] ${action} es irreversible: pasar { confirmed: true } explícito.`);
		this.name = 'IrreversibleNotConfirmedError';
	}
}

export type TripSummary = { total: number | null; totalText: string; paymentMethod: string };
export type CloseResult = { closedTotal: number | null; paymentMethod: string; signed: boolean; closeLabel: string };
export type IrreversibleOptions = { confirmed: boolean };

export type TripLifecycleDeps = {
	confirm: Pick<TripConfirmScreen, 'waitUntilShown' | 'readTravelId' | 'acceptOffer' | 'waitUntilLeft'>;
	toStart: Pick<TripToStartScreen, 'waitUntilShown' | 'tapStartTrip' | 'waitForConfirmModal' | 'confirmStart' | 'waitUntilLeft'>;
	inProgress: Pick<TripInProgressScreen, 'waitUntilShown' | 'tapEndTrip' | 'waitForConfirmModal' | 'confirmEnd' | 'waitUntilLeft'>;
	resume: Pick<
		TripResumeScreen,
		'waitUntilShown' | 'readTotal' | 'readTotalText' | 'readPaymentMethod' | 'closeRequiresSignature' | 'tapClose'
	>;
	modal: Pick<ConfirmModal, 'isShown' | 'confirm' | 'waitUntilClosed'>;
	signature: Pick<SignaturePBO, 'signAndConfirm'>;
};

export type TripLifecycleRuntime = {
	log: (message: string) => void;
	/** Ventana para detectar el modal opcional post-cierre (default 3 s). */
	closeModalDetectMs?: number;
};

export class TripLifecyclePBO {
	private readonly log: (message: string) => void;
	private readonly closeModalDetectMs: number;

	constructor(
		private readonly deps: TripLifecycleDeps,
		out: Partial<TripLifecycleRuntime> = {}
	) {
		this.log = out.log ?? (m => console.log(m));
		this.closeModalDetectMs = out.closeModalDetectMs ?? 3_000;
	}

	static forSession(session: MobileSession, i18n: I18n, out?: Partial<TripLifecycleRuntime>): TripLifecyclePBO {
		return new TripLifecyclePBO(
			{
				confirm: new TripConfirmScreen(session, i18n.locale, i18n),
				toStart: new TripToStartScreen(session, i18n.locale, i18n),
				inProgress: new TripInProgressScreen(session, i18n.locale, i18n),
				resume: new TripResumeScreen(session, i18n),
				modal: new ConfirmModal(session, i18n),
				signature: SignaturePBO.forSession(session, out)
			},
			out
		);
	}

	/** Acepta la oferta del viaje asignado. Devuelve el `travelId` de la URL (null si no vino). */
	async acceptAssignedTrip(): Promise<{ travelId: string | null }> {
		await this.deps.confirm.waitUntilShown();
		const travelId = await this.deps.confirm.readTravelId();
		await this.deps.confirm.acceptOffer();
		await this.deps.confirm.waitUntilLeft();
		this.log(`[TripLifecyclePBO] Oferta aceptada (travelId=${travelId ?? 'n/d'}).`);
		return { travelId };
	}

	/** «Empezar Viaje» + «Sí»; espera a que la pantalla se vaya (viaje en curso). */
	async startTrip(): Promise<void> {
		await this.deps.toStart.waitUntilShown();
		await this.deps.toStart.tapStartTrip();
		await this.deps.toStart.waitForConfirmModal();
		await this.deps.toStart.confirmStart();
		await this.deps.toStart.waitUntilLeft();
		this.log('[TripLifecyclePBO] Viaje iniciado.');
	}

	/** «Finalizar Viaje» + «Sí» (IRREVERSIBLE) y llega al resumen. */
	async finishTrip(options: IrreversibleOptions): Promise<TripSummary> {
		if (!options.confirmed) throw new IrreversibleNotConfirmedError('Finalizar el viaje');
		await this.deps.inProgress.waitUntilShown();
		await this.deps.inProgress.tapEndTrip();
		await this.deps.inProgress.waitForConfirmModal();
		await this.deps.inProgress.confirmEnd();
		await this.deps.inProgress.waitUntilLeft();
		this.log('[TripLifecyclePBO] Viaje finalizado; resumen visible.');
		return this.readSummary();
	}

	/** Lee total y medio de pago del resumen (sin tocar nada). */
	async readSummary(): Promise<TripSummary> {
		await this.deps.resume.waitUntilShown();
		return {
			total: await this.deps.resume.readTotal(),
			totalText: await this.deps.resume.readTotalText(),
			paymentMethod: await this.deps.resume.readPaymentMethod()
		};
	}

	/** Cierra el viaje desde el resumen (IRREVERSIBLE); con firma si el botón es «Firmar y Cerrar viaje». */
	async closeTrip(options: IrreversibleOptions): Promise<CloseResult> {
		if (!options.confirmed) throw new IrreversibleNotConfirmedError('Cerrar el viaje');
		const summary = await this.readSummary();
		const requiresSignature = await this.deps.resume.closeRequiresSignature();
		const closeLabel = await this.deps.resume.tapClose();
		if (requiresSignature) await this.deps.signature.signAndConfirm();
		const modalShown = await tryUntil(() => this.deps.modal.isShown(), {
			timeout: this.closeModalDetectMs,
			label: 'modal post-cierre'
		});
		if (modalShown) {
			await this.deps.modal.confirm();
			await this.deps.modal.waitUntilClosed();
		}
		this.log(`[TripLifecyclePBO] Viaje cerrado (firma=${requiresSignature}, medio=${summary.paymentMethod || 'n/d'}).`);
		return { closedTotal: summary.total, paymentMethod: summary.paymentMethod, signed: requiresSignature, closeLabel };
	}
}
