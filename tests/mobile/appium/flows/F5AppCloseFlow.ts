/**
 * F5AppCloseFlow — cierre de un viaje ya asignado desde la app Chofer REAL (F5 / W5b).
 *
 * Orquesta SOLO verbos de PBOs (sin locators, sin `process.env`, sin adb): sesión del chofer -> verificar
 * que la oferta es la del viaje esperado -> aceptar -> iniciar -> recorrer la ruta GPS -> finalizar ->
 * leer resumen -> cerrar (con firma si corresponde). Devuelve un resultado tipado que el runner anexa al
 * handoff (`applyF5CloseResult`).
 *
 * IRREVERSIBLE: aceptar/finalizar/cerrar afectan un viaje permanente en TEST. Con `confirmed: false` el
 * flow llega solo hasta dejar la sesión lista (login + «Disponible», reversible) y devuelve
 * `not-confirmed`: nunca acepta, finaliza ni cierra. Sin reintentos.
 */

import type { Evidence } from '../core/Evidence';
import type { MobileSession } from '../core/MobileSession';
import type { I18n } from '../core/I18n';
import type { CarrierProfile } from '../data/carriers';
import {
	parseMoneyText,
	withClosure,
	withFailure,
	type F5AppHandoff,
	type F5AppMeasured,
	type F5AppResult
} from '../contracts/f5AppHandoff';
import type { DriverPreflightExpectation } from '../driver/DriverTripPreflight';
import type { LatLng } from '../gps/GpsRouteFeeder';
import { DriverSessionPBO, GpsSimulationPBO, TripLifecyclePBO, type GpsDriveOptions } from '../pbo';
import { TripConfirmScreen } from '../screens/driver/TripConfirmScreen';

export type F5CloseStage = 'session' | 'offer' | 'accept' | 'start' | 'gps' | 'finish' | 'close';

export type F5AppCloseInput = {
	carrier: CarrierProfile;
	/** Viaje que DEBE ser el de la oferta en pantalla; `null` = no se exige (solo S3 FR sin handoff). */
	travelId: number | null;
	/** Código visible del viaje (`<n>-<canal>`, p. ej. «5282-W»): la oferta no siempre expone el id en la URL. */
	travelCode?: string;
	/** Pre-flight del chofer (identidad + credenciales por si está deslogueado); lo arma el runner. */
	expectation: DriverPreflightExpectation;
	route: LatLng[];
	gps?: GpsDriveOptions;
	/** Sin `true` explícito el flow no hace nada irreversible. */
	confirmed: boolean;
	/** Reanuda un viaje ya aceptado que quedó en «Empezar viaje»: omite sesión, oferta y aceptación. */
	resumeFromToStart?: boolean;
};

export type F5AppClosure = { closedAt: string; measured: F5AppMeasured; result: F5AppResult };

export type F5AppCloseResult =
	| { status: 'not-confirmed'; carrierId: number; steps: string[] }
	| { status: 'closed'; carrierId: number; closure: F5AppClosure; steps: string[] }
	| {
			status: 'failed';
			carrierId: number;
			stage: F5CloseStage;
			message: string;
			/** `true` desde que se aceptó la oferta: el viaje ya no está intacto y se revisa a mano. */
			irreversibleStarted: boolean;
			steps: string[];
	  };

export class OfferMismatchError extends Error {
	constructor(expected: number, seen: string | null) {
		super(`La oferta en pantalla es del viaje ${seen ?? 'n/d'}, no del esperado ${expected}; no se acepta nada.`);
		this.name = 'OfferMismatchError';
	}
}

export class GpsAbortedError extends Error {
	constructor() {
		super('La alimentación GPS fue abortada; el viaje no se finaliza.');
		this.name = 'GpsAbortedError';
	}
}

export type F5AppCloseDeps = {
	session: Pick<DriverSessionPBO, 'startSession'>;
	/** Lee el travelId de la oferta mostrada SIN aceptarla (guard previo al irreversible). */
	offer: { peekTravelId(): Promise<string | null>; readVisibleText?(): Promise<string> };
	trip: Pick<TripLifecyclePBO, 'acceptAssignedTrip' | 'startTrip' | 'finishTrip' | 'closeTrip'>;
	gps: Pick<GpsSimulationPBO, 'driveRoute'>;
	evidence: Pick<Evidence, 'checkpoint'>;
	log?: (message: string) => void;
	/** Reloj en ms (inyectable en unit). Default `Date.now`. */
	now?: () => number;
};

export class F5AppCloseFlow {
	private readonly log: (message: string) => void;
	private readonly now: () => number;

	constructor(private readonly deps: F5AppCloseDeps) {
		this.log = deps.log ?? (m => console.log(m));
		this.now = deps.now ?? Date.now;
	}

	static forSession(session: MobileSession, i18n: I18n, evidence: Evidence, log?: (message: string) => void): F5AppCloseFlow {
		const confirm = new TripConfirmScreen(session, i18n.locale, i18n);
		return new F5AppCloseFlow({
			session: DriverSessionPBO.forSession(session, log),
			offer: {
				peekTravelId: async () => {
					await confirm.waitUntilShown();
					return confirm.readTravelId();
				},
				readVisibleText: () => confirm.readVisibleText()
			},
			trip: TripLifecyclePBO.forSession(session, i18n, log ? { log } : undefined),
			gps: GpsSimulationPBO.forSession(session),
			evidence,
			log
		});
	}

	async run(input: F5AppCloseInput): Promise<F5AppCloseResult> {
		const { deps } = this;
		const carrierId = input.carrier.carrierId;
		const steps: string[] = [];
		const checkpoints: F5AppResult['checkpoints'] = [];
		const startedAtMs = this.now();
		let stage: F5CloseStage = 'session';
		let irreversibleStarted = false;
		const reached = async (name: string, matchedBy: string): Promise<void> => {
			steps.push(matchedBy);
			checkpoints.push({ stage: name, matchedBy: `pbo:${matchedBy}`, observedAt: new Date(this.now()).toISOString() });
			await deps.evidence.checkpoint(name).catch(() => undefined); // la evidencia no corta la corrida
		};

		try {
			if (!input.resumeFromToStart) {
				await deps.session.startSession(input.expectation);
				steps.push('session.startSession');
			}
			if (!input.confirmed) {
				this.log(`[F5AppCloseFlow] confirmed=false: sesión lista, no se acepta ni cierra nada (carrier ${carrierId}).`);
				return { status: 'not-confirmed', carrierId, steps };
			}

			if (!input.resumeFromToStart) {
				stage = 'offer';
				const seen = await deps.offer.peekTravelId();
				if (input.travelId !== null && seen !== String(input.travelId)) {
					// Sin id en la URL: se acepta solo si el código visible de la oferta es el del handoff.
					const codeMatches =
						seen === null &&
						Boolean(input.travelCode) &&
						((await deps.offer.readVisibleText?.()) ?? '').includes(input.travelCode as string);
					if (!codeMatches) throw new OfferMismatchError(input.travelId, seen);
					this.log(`[F5AppCloseFlow] oferta identificada por código visible «${input.travelCode}».`);
				}
				steps.push('offer.peekTravelId');
				stage = 'accept';
				irreversibleStarted = true;
				await deps.trip.acceptAssignedTrip();
				await reached('confirm', 'trip.acceptAssignedTrip');
			}
			stage = 'start';
			irreversibleStarted = true;
			await deps.trip.startTrip();
			await reached('in-progress', 'trip.startTrip');

			stage = 'gps';
			const feedStartedMs = this.now();
			const drive = await deps.gps.driveRoute(input.route, input.gps ?? {});
			const feedEndedMs = this.now();
			steps.push('gps.driveRoute');
			this.log(
				`[F5AppCloseFlow] gps listo: teórico=${Math.round(drive.theoreticalMeters)} m alimentado=${Math.round(drive.fedMeters)} m abortado=${drive.aborted}`
			);
			if (drive.aborted) throw new GpsAbortedError();

			stage = 'finish';
			const summary = await deps.trip.finishTrip({ confirmed: true });
			await reached('resume', 'trip.finishTrip');

			stage = 'close';
			const close = await deps.trip.closeTrip({ confirmed: true });
			await reached('closed', 'trip.closeTrip');

			const finishedAt = new Date(this.now()).toISOString();
			return {
				status: 'closed',
				carrierId,
				steps,
				closure: {
					closedAt: finishedAt,
					measured: {
						km: Number((drive.fedMeters / 1000).toFixed(3)),
						minutes: Number(((feedEndedMs - feedStartedMs) / 60_000).toFixed(2)),
						kmSource: 'gps-fed',
						routeKm: Number((drive.theoreticalMeters / 1000).toFixed(3))
					},
					result: {
						totalAmountText: summary.totalText,
						totalAmount: parseMoneyText(summary.totalText),
						paymentMethod: close.paymentMethod || summary.paymentMethod,
						closeButtonText: close.closeLabel,
						checkpoints,
						startedAt: new Date(startedAtMs).toISOString(),
						finishedAt
					}
				}
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			this.log(`[F5AppCloseFlow] ERROR en «${stage}»: ${message}`);
			return { status: 'failed', carrierId, stage, message: `[${stage}] ${message}`, irreversibleStarted, steps };
		}
	}
}

/**
 * Pura: anexa el resultado del flow al handoff (copia). `closed` -> `withClosure`; `failed` tras aceptar ->
 * `withFailure` (stage `in-trip`, el detalle va en el mensaje); fallo previo o `not-confirmed` -> intacto.
 */
export function applyF5CloseResult(handoff: F5AppHandoff, result: F5AppCloseResult, at: string): F5AppHandoff {
	if (result.status === 'closed') {
		let out = withClosure(handoff, result.closure);
		if (result.closure.result.totalAmount === null) {
			out = {
				...out,
				observations: [...(out.observations ?? []), `monto "${result.closure.result.totalAmountText}" no interpretable: revisar captura`]
			};
		}
		return out;
	}
	if (result.status === 'failed' && result.irreversibleStarted) return withFailure(handoff, 'in-trip', result.message, at);
	return handoff;
}
