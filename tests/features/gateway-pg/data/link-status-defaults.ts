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
 * Consumidores: `authorizeGatewayAdapter` / `ebizchargeGatewayAdapter` / `stripeGatewayAdapter`
 * (campos S2) y el POM `AppStoreGatewaysPage` (defaults de los wrappers de status del link).
 *
 * Decisión de capas: vive en `features/data` como fuente única consumida por `components` —
 * excepción de capas ACEPTADA (precedente: `card-forms` → `@features/.../adapters`),
 * registrada en judgment-day 2026-07-27.
 *
 * Semántica Authorize — CORREGIDA con evidencia live 2026-07-28 (campaña exploratoria):
 * el endpoint del link es **`POST vendor/authorize`** y responde **200**, con el estado de la
 * card quedando en `linked`. Verificado con dos probes de red independientes (creds válidas y
 * creds inválidas), ambos con un ÚNICO POST durante el submit.
 *
 * ⚠️ HISTÓRICO — el quirk `500|409` y el endpoint `odnService` (HANDOFF §2 + addendum
 * 2026-07-25) **YA NO REPRODUCEN**. El AC original de la matriz (TS-AUTHORIZE-TC1008: "status
 * 200") vuelve a ser el oráculo correcto, así que el assert deja de tolerar códigos de error:
 * si un deploy futuro devuelve 500/409, el test DEBE fallar (era justamente lo que el quirk
 * tapaba). El TODO de revert-a-2xx queda CERRADO por esta vía.
 *
 * ⚠️ PERO 200 ≠ credenciales validadas: el mismo endpoint devuelve 200 y deja la pasarela
 * `linked` con credenciales INVÁLIDAS (defecto de backend hallado el 2026-07-28, ver
 * `docs/gateway-pg/authorize/DRAFT-improvement-backend-link-500.md`). Por eso el caso de status
 * asserta ADEMÁS la persistencia del estado, y TS-AUTHORIZE-TC1003 (rechazo de credenciales
 * inválidas) queda ROJO a propósito: revela el defecto en vez de taparlo.
 */

/** Status de éxito del link Authorize: 200 (AC de matriz), verificado live 2026-07-28. */
export const AUTHORIZE_LINK_SUCCESS_STATUSES = [200] as const;

/**
 * Matcher VERIFICADO live 2026-07-28: la ÚNICA mutación del submit de link es
 * `POST vendor/authorize`. Estrechado desde el regex amplio anterior (que incluía
 * `odnservice|payment.?gateway|integration|…`) — con el endpoint confirmado, la amplitud solo
 * agregaba riesgo de latchear otra request (p. ej. `vendor/cleaningWallets` del unlink previo,
 * que también responde 200) y asertar su status como si fuera el del link.
 */
export const AUTHORIZE_LINK_MUTATION_URL_PATTERN = /vendor\/authorize/i;

/** TODO(live): [200] ASUMIDO — status real de la request de link eBizCharge NO verificado. */
export const EBIZCHARGE_LINK_SUCCESS_STATUSES = [200] as const;

/** TODO(live): matcher NO verificado — base del matcher Authorize + needle propio eBiz. */
export const EBIZCHARGE_LINK_MUTATION_URL_PATTERN =
	/odnservice|payment.?gateway|paymentgateway|vendor|integration|ebiz/i;

/**
 * TODO(live): [200] ASUMIDO — status real de la mutación de link Stripe NO verificado
 * (mismo criterio de documentación que eBizCharge). En Stripe la mutación NO sale del
 * modal de credenciales (no hay): la dispara el FE al aterrizar de vuelta del OAuth
 * Connect con `?code=ac_...` (setStripeCode). Fijar en la primera corrida viva.
 */
export const STRIPE_LINK_SUCCESS_STATUSES = [200] as const;

/**
 * TODO(live): matcher NO verificado — basado en la ruta backend del VendorController
 * (`vendor/stripe/*`, business docs), espejo del patrón VERIFICADO `vendor/authorize`.
 * Deliberadamente ESTRECHO (a diferencia del matcher amplio de eBiz): durante el
 * onboarding OAuth el browser navega por `connect.stripe.com` disparando POSTs propios
 * de Stripe — un needle amplio con `stripe` los matchearía y el assert tomaría el status
 * de una request AJENA a la mutación de link de MAGIIS.
 */
export const STRIPE_LINK_MUTATION_URL_PATTERN = /vendor\/stripe/i;
