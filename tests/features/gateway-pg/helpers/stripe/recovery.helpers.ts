/**
 * Stripe Recovery helpers — Stripe-specific.
 * ============================================
 *
 * Helpers que orquestan flujos de recuperación post-3DS específicos de Stripe.
 * Authorize.net NO requiere 3DS → estos helpers NO aplican a otros gateways.
 *
 * Movidos desde `stripe.helpers.ts` en 2026-05-13 (organización multi-gateway).
 */

import type { Page } from '@playwright/test';
import type { TravelIdRef } from '@features/gateway-pg/helpers/travel-cleanup';
import { expect } from '@playwright/test';
import {
	NewTravelPage,
	OperationalPreferencesPage,
	TravelManagementPage,
	travelDetailHrefSelector
} from '@pages/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { captureCreatedTravelId } from '@features/gateway-pg/helpers/travel-cleanup';
import { cleanupGatewayCardByLast4, extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';
import { STRIPE_TEST_CARDS } from '../../data/stripeTestData';
import { extractTravelIdFromUrl } from '../journey-url.helpers';

/** Datos mínimos del alta que deriva en el fallo 3DS recuperable. */
export type FailedThreeDsSeedOptions = {
	/** Cliente del viaje (opcional; app pax lo auto-asigna desde el pasajero). */
	client?: string;
	passenger: string;
	origin: string;
	destination: string;
	/**
	 * Query API (`lastName`) para la limpieza de idempotencia BL-050 del seed.
	 * Default: última palabra del nombre del pasajero (p. ej. "Restrepo").
	 */
	apiSearchQuery?: string;
};

/**
 * Idempotencia BL-050 del seed 3DS: desvincula del wallet del pasajero toda tarjeta con los
 * últimos 4 indicados (default: threeDSRequired 3220). La tarjeta se attachea al COMPLETAR
 * los iframes de Stripe (antes del desenlace del challenge), así que cada corrida del seed
 * la deja vinculada; BL-050 bloquea "Validar" cuando el MISMO número ya está en el wallet →
 * sin esta limpieza el 2.º test de un archivo serial — y el 1.º en re-runs — muere en la
 * validación con un error que no es el que el caso quiere medir (misma disciplina que
 * `CarrierEditVariantsSteps.cleanupPaxCard`, review 2026-08-05 HIGH-2).
 *
 * Silent-fail por diseño: si el JWT no se captura o el pasajero no resuelve por API, la
 * limpieza es no-op y el flujo continúa (la validación tiene su propio retry/re-fill).
 */
export async function ensureRecoverableCardIdempotence(
	page: Page,
	opts: { passenger: string; apiSearchQuery?: string; cardLast4?: string }
): Promise<void> {
	// Warm-up del JWT (patrón retry ×3 — ver CarrierEditVariantsSteps.runHoldScenario).
	let token: string | null = null;
	for (let attempt = 0; attempt < 3 && !token; attempt++) {
		token = await extractAuthToken(page);
	}
	// La búsqueda API es por lastName: el nombre completo suele no matchear, la última
	// palabra sí ("Emanuel Restrepo" → "Restrepo"). `apiSearchQuery` la sobreescribe.
	const fallbackLastName = opts.passenger.trim().split(/\s+/).slice(-1);
	const queries = opts.apiSearchQuery ? [opts.passenger, opts.apiSearchQuery] : [opts.passenger, ...fallbackLastName];
	await cleanupGatewayCardByLast4(page, queries, opts.cardLast4 ?? STRIPE_TEST_CARDS.threeDSRequired.slice(-4));
}

/** URL del detalle read-only de un viaje (hash routing del portal carrier). */
const TRAVEL_DETAIL_URL_PATTERN = /\/travels\/[\w-]+/;

/**
 * ¿La URL del detalle ASENTÓ? Espera llegar al patrón del detalle y luego una ventana de
 * estabilidad SIN navegación saliente (se espera el BOUNCE: timeout = no hubo navegación
 * fuera del detalle → asentó). Event-driven, sin esperas fijas.
 */
async function settledOnTravelDetail(page: Page, stabilityMs = 6_000): Promise<boolean> {
	const onDetail = await page
		.waitForURL(TRAVEL_DETAIL_URL_PATTERN, { timeout: 8_000 })
		.then(() => true)
		.catch(() => false);
	if (!onDetail) return false;
	const bounced = await page
		.waitForURL(url => !TRAVEL_DETAIL_URL_PATTERN.test(url.href), { timeout: stabilityMs })
		.then(() => true)
		.catch(() => false);
	return !bounced;
}

/**
 * ⚠ CONSERVADO PARA EL RE-ENABLE de los specs de detalle — NO lo usa el seed vigente.
 *
 * Intenta posicionar la página en el detalle READ-ONLY del viaje tras un challenge
 * post-envío no exitoso. EVIDENCIA 2026-08-07 (FE v1.72.8, corridas TC1057 + probe):
 * la ruta `/#/home/carrier/travels/{id}` fue ELIMINADA del producto — un boot completo
 * (about:blank → goto) rebota a `#/`, la grilla ya no publica anclas `a[href*="/travels/"]`
 * (acciones = botones fa-pencil/fa-list/fa-times) y la superficie vigente
 * (`travel/detail?travelId=X&mode=1|2|3`) NO contiene red flag ni "Reintentar
 * autenticación". Mientras el producto no re-publique la superficie, esta función termina
 * en su throw diagnóstico — que es exactamente la señal deseada si alguien des-skipea los
 * specs de detalle antes de tiempo. Escalera: redirect real → boot completo → ancla de
 * fila (si volviera a existir) → throw.
 *
 * @returns travelId del viaje, con la página YA posicionada en su detalle.
 */
export async function gotoTravelDetailAfterPostSubmitChallenge(page: Page, createdRef: TravelIdRef): Promise<string> {
	const urlId = await Promise.race([extractTravelIdFromUrl(page), page.waitForTimeout(8_000).then(() => null)]).catch(
		() => null
	);
	if (urlId) return urlId;

	if (createdRef.travelId) {
		const travelId = String(createdRef.travelId);
		const base = page.url().split('/#/')[0];
		const detailUrl = `${base}/#/home/carrier/travels/${travelId}`;

		// (2) Boot completo cross-document — el goto puede ser interrumpido por una navegación
		// propia del FE ("navigation interrupted"): cuenta como bounce y se reintenta acotado.
		for (let attempt = 1; attempt <= 2; attempt++) {
			await page.goto('about:blank');
			const navigated = await page
				.goto(detailUrl)
				.then(() => true)
				.catch(() => false);
			if (navigated && (await settledOnTravelDetail(page))) return travelId;
		}

		// (3) Ancla de la fila en "En conflicto" (superficie real de producto para NO_AUTORIZADO).
		const management = new TravelManagementPage(page);
		await management.goto();
		const enConflictoTab = page
			.locator('tabset ul li a')
			.filter({ hasText: /en conflicto/i })
			.first();
		await enConflictoTab.click().catch(() => undefined);
		const detailLink = page.locator(travelDetailHrefSelector(createdRef.travelId)).first();
		const linkVisible = await detailLink
			.waitFor({ state: 'visible', timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		if (linkVisible) {
			await detailLink.click();
			if (await settledOnTravelDetail(page)) return travelId;
		}

		throw new Error(
			`setupTravelWithFailed3DS: el detalle del viaje ${travelId} no asentó — goto directo rebotado por la SPA ` +
				`y ancla de fila en "En conflicto" ${linkVisible ? 'clickeada sin asentar' : 'NO publicada en el dashboard'} ` +
				`(URL final: ${page.url()}) — posible cambio de producto en la superficie del detalle para viajes ` +
				'NO_AUTORIZADO (reportar, no enmascarar).'
		);
	}
	throw new Error(
		'setupTravelWithFailed3DS: sin redirect a /travels NI POST /travels capturado tras el challenge post-envio — ' +
			'el camino "NO_AUTORIZADO via challenge fallido" puede haber cambiado en el producto (reportar, no enmascarar).'
	);
}

/**
 * Verifica en la GRILLA de Gestión de Viajes (pestaña "En Conflicto") que el viaje recién
 * creado quedó en "No Autorizado" — el ORÁCULO vigente del estado NO_AUTORIZADO en FE
 * v1.72.8, donde el detalle read-only `/travels/{id}` ya no existe (ver
 * `gotoTravelDetailAfterPostSubmitChallenge`). Ancla la fila por el código web
 * ("NNNN-W", `travelIdForCarrier` capturado del POST /travels); si el DTO no lo trajo,
 * cae a fila por apellido del pasajero + texto "No autorizado".
 *
 * Navega con boot COMPLETO (about:blank → dashboard): una navegación same-document desde
 * el formulario post-challenge es pisada por la SPA (evidencia corridas TC1057 2026-08-07).
 */
export async function expectTravelInEnConflicto(
	page: Page,
	createdRef: TravelIdRef,
	opts: { passenger: string }
): Promise<void> {
	await page.goto('about:blank');
	const management = new TravelManagementPage(page);
	await management.goto();
	const enConflictoTab = page
		.locator('tabset ul li a')
		.filter({ hasText: /en conflicto/i })
		.first();
	await expect(enConflictoTab, 'la pestaña "En Conflicto" debe existir en Gestión de Viajes').toBeVisible({
		timeout: 15_000
	});
	await enConflictoTab.click();

	const row = createdRef.travelIdForCarrier
		? page
				.locator('tbody tr')
				.filter({ hasText: `${createdRef.travelIdForCarrier}-W` })
				.first()
		: page
				.locator('tbody tr')
				.filter({ hasText: opts.passenger.trim().split(/\s+/).slice(-1)[0] })
				.filter({ hasText: /No autorizado/i })
				.last();
	await expect(
		row,
		`seed: el viaje ${createdRef.travelIdForCarrier ? `${createdRef.travelIdForCarrier}-W` : `de ${opts.passenger}`} debe figurar en "En Conflicto"`
	).toBeVisible({ timeout: 20_000 });
	await expect(row, 'seed: la fila debe mostrar estado "No autorizado"').toContainText(/No autorizado/i, {
		timeout: 10_000
	});
}

/**
 * Crea un viaje con fallo 3DS RECUPERABLE y completa el fallo.
 *
 * Regla de negocio card threeDSRequired (4000000000003220) + Hold ON (flujo v1.72.8 de
 * DOS ventanas): "Validar" dispara un hold REAL → challenge de VALIDACIÓN (ventana 1),
 * que se APRUEBA (fallarlo aborta el alta); el envío dispara el challenge POST-ENVÍO
 * (ventana 2), que se RECHAZA vía FAIL → el viaje queda en NO_AUTORIZADO (columna
 * "En Conflicto" del dashboard, verificada como oráculo del seed). El FE ya NO redirige
 * a un detalle `/travels/{id}` (ruta eliminada — ver gotoTravelDetailAfterPostSubmitChallenge);
 * la página queda posicionada en Gestión de Viajes → "En Conflicto".
 *
 * Se usa 3220 (recuperable, resultado según COMPLETE/FAIL) — NO fail3DS/1629, que
 * declina el cobro de forma nativa e irrecuperable (el retry volvería a declinar).
 *
 * Stripe-specific: usa `STRIPE_TEST_CARDS.threeDSRequired` + `ThreeDsChallengePage`
 * (iframe Stripe; semántica corregida de waitForHidden — no exige vehículo habilitado,
 * que tras un challenge FALLIDO queda deshabilitado por diseño).
 *
 * @returns travelId del viaje creado en estado NO_AUTORIZADO (id interno del POST /travels).
 */
export async function setupTravelWithFailed3DS(page: Page, opts: FailedThreeDsSeedOptions): Promise<string> {
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const threeDS = new ThreeDsChallengePage({ page });

	// Idempotencia BL-050: sin esto, la 3220 vinculada por la corrida/test anterior
	// bloquea "Validar" y el seed muere antes de llegar al challenge.
	await ensureRecoverableCardIdempotence(page, opts);

	await preferences.goto();
	await preferences.ensureHoldEnabled();
	await travel.goto();
	await travel.fillMinimum({
		...opts,
		// FIX 2026-07-21: threeDSRequired = 4000000000003220 (exige 3DS; recuperable vía
		// COMPLETE/FAIL). El fallo se logra rechazando el challenge (completeFail); el retry
		// posterior con completeSuccess recupera el viaje. (9235 no mostraba challenge; 1629
		// declina nativo → irrecuperable, romperia TC1061).
		cardLast4: STRIPE_TEST_CARDS.threeDSRequired.slice(-4)
	});
	// DOS VENTANAS de challenge (fix 2026-08-06, corridas recovery/conflicto): con el hold
	// ejecutandose en la VALIDACION ("Validar" = hold real), el challenge de ESA ventana al
	// fallar ABORTA el alta (no hay viaje -> no hay NO_AUTORIZADO). El estado recuperable del
	// sujeto (MG-155/TC1051..1061) nace del fallo POST-SUBMIT: se aprueba el challenge de
	// validacion (si aparece), se envia, y se RECHAZA el challenge post-envio. Si el challenge
	// post-envio NO aparece y el viaje navega igual, el camino "NO_AUTORIZADO via challenge
	// fallido" ya no existe en el producto -> el caller falla con diagnostico explicito
	// (posible CAMBIO DE PRODUCTO a reportar, no se enmascara).
	const validationChallenge = await threeDS.waitForOptionalVisible(8_000);
	if (validationChallenge) {
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();
	}

	// Listener del POST /travels: el FE actual puede NO redirigir a /travels tras el challenge
	// post-envio fallido (UX nueva: error inline recuperable) — el viaje EXISTE igual (se crea
	// en el send, antes del challenge). El id capturado permite navegar al detalle por id y
	// asertar NO_AUTORIZADO sin depender del redirect (oraculo modernizado, sujeto intacto).
	const createdRef = await captureCreatedTravelId(page);
	try {
		await travel.submit();

		await threeDS.waitForVisible();
		await threeDS.completeFail();
		await threeDS.waitForHidden();

		// Oráculo del seed (superficie vigente): la fila del viaje en "En Conflicto" con
		// "No autorizado". El id retornado sale del POST /travels capturado — el redirect
		// a /travels/{id} ya no existe en el producto.
		await expectTravelInEnConflicto(page, createdRef, { passenger: opts.passenger });
		if (!createdRef.travelId) {
			throw new Error(
				'setupTravelWithFailed3DS: viaje visible en "En Conflicto" pero SIN POST /travels capturado — ' +
					'no hay id para retornar (revisar el interceptor captureCreatedTravelId).'
			);
		}
		return String(createdRef.travelId);
	} finally {
		await createdRef.dispose();
	}
}
