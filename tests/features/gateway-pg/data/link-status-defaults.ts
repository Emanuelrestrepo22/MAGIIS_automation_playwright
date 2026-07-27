/**
 * link-status-defaults.ts — FUENTE ÚNICA de los statuses de éxito y el matcher de URL
 * de la mutación de link por pasarela (auditoría R2, T11 — anti-drift POM ↔ adapter).
 *
 * Antes estos valores vivían DUPLICADOS: como defaults hardcodeados en
 * `AppStoreGatewaysPage.expectLinkStatusOk` / `expectEbizchargeLinkStatusOk` (`?? [500,409]`
 * / `?? [200]` / regex) Y como campos del adapter declarativo (`linkSuccessStatuses` /
 * `linkMutationUrlPattern`). Un cambio en uno sin el otro producía drift silencioso.
 * Mismo patrón de fuente única que `data/xray-keys.ts`.
 *
 * Consumidores: `authorizeGatewayAdapter` / `ebizchargeGatewayAdapter` (campos S2) y el POM
 * `AppStoreGatewaysPage` (defaults de los wrappers de status del link).
 *
 * Decisión de capas: vive en `features/data` como fuente única consumida por `components` —
 * excepción de capas ACEPTADA (precedente: `card-forms` → `@features/.../adapters`),
 * registrada en judgment-day 2026-07-27.
 *
 * Semántica Authorize (quirk backend VERIFICADO — HANDOFF §2 + addendum 2026-07-25):
 * 500 = conectada desde estado limpio; 409 = ya vinculada por otra sesión; 400 = NO
 * conectada. TODO revert a 2xx cuando DEV corrija el endpoint (odnService, MG-476) —
 * ver `docs/gateway-pg/authorize/DRAFT-improvement-backend-link-500.md`.
 */

/** Statuses de éxito del link Authorize (quirk 500|409 verificado — nunca 400). */
export const AUTHORIZE_LINK_SUCCESS_STATUSES = [500, 409] as const;

/**
 * Matcher VERIFICADO live de la mutación de link Authorize (endpoint = odnService, MG-476).
 * Caveat de amplitud (juicio R2): el endpoint verificado es odnService; los needles adicionales
 * (vendor|integration|authorize|payment.?gateway) se conservan como red de seguridad pre-campaña —
 * estrechar a /odnservice/i tras confirmar en la primera corrida viva que ninguna otra mutación
 * no-GET se dispara durante el submit.
 */
export const AUTHORIZE_LINK_MUTATION_URL_PATTERN = /odnservice|payment.?gateway|paymentgateway|vendor|integration|authorize/i;

/** TODO(live): [200] ASUMIDO — status real de la request de link eBizCharge NO verificado. */
export const EBIZCHARGE_LINK_SUCCESS_STATUSES = [200] as const;

/** TODO(live): matcher NO verificado — base del matcher Authorize + needle propio eBiz. */
export const EBIZCHARGE_LINK_MUTATION_URL_PATTERN = /odnservice|payment.?gateway|paymentgateway|vendor|integration|ebiz/i;
