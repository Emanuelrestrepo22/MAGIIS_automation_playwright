/**
 * KATA Component (Layer 3) — Carrier · Magiis App Store · Configuración de Pasarelas de pago.
 *
 * POM nativo (NO delega en un POM legacy: el App Store de pasarelas no tenía page object;
 * el spec stripe/config/gateway-config.spec.ts era placeholder fixme). Los selectores se
 * portan del probe read-only ya verificado en vivo
 * (`tests/features/gateway-pg/specs/authorize/probe/appstore-gateways-probe.spec.ts`) y del
 * soporte legacy i18n-proof (agentic-qa-boilerplate/tests/gateway-legacy/support.ts):
 *   - Ruta: `${BASE_URL}/#/home/carrier/integrations/list`.
 *   - Cards: `.card` con `.card-title` / `.card-subtitle` (empresa) y `.card-footer` (acción).
 *   - Estado por color del link de acción: `a.red-text` = "Desvincular" (vinculada);
 *     `a.green-text` = "Vincular" (vinculable); "No Disponible" = bloqueada por exclusividad.
 *
 * Regla de exclusividad CONFIRMADA (probe F3 2026-07-23, EXTERNAL-BLOCKERS §probe): solo una
 * pasarela activa por carrier. Con Stripe vinculado, Authorize/eBiz/MP salen "No Disponible";
 * al desvincular Stripe pasan a "Vincular" y su modal de credenciales queda disponible.
 *
 * ✅ RECONCILIADO EN VIVO (HANDOFF-live-reconciliation-2026-07-24, actualizado 2026-07-25): selectores
 * verificados contra apps-test. Modal Authorize scopeado por `input[formcontrolname="apiLoginKey"]`
 * (Angular Reactive Forms; el input NO tiene atributo `name`, solo `formcontrolname`+`id`) +
 * `input[formcontrolname="transactionKey"]`; acción i18n-proof `Link`/`Unlink` (inglés) / `Vincular`/`Desvincular`;
 * submit = botón `Continuar`/`Continue` scopeado al modal (hay ~6 modales, 1 por PSP); click del Link con retry `toPass`
 * (handler Angular tardío). QUIRK: el link con creds válidas devuelve un status de éxito conocido — 500
 * (estado limpio) o 409 (carrier 1521 compartido ya vinculado por otra sesión) — nunca 400 (NO conectada) →
 * ver `expectLinkStatusOk` (MG-226) + defect "500/409-en-éxito" (DEV/MX).
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase; `this.page` es getter heredado.
 *   - Import por alias (@TestContext, @utils, @ui) — sin relativos.
 *   - Mini-flujos que cambian estado decorados `@atc`; queries read-only `@step`.
 *   - `expect` importado de `@playwright/test` (NO de `@TestFixture`) para evitar el ciclo
 *     Fixture → Page → Fixture (mismo patrón que CarrierNewTravelPage).
 */

import type { Locator, Request, Route } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import type { GatewayName } from '@fixtures/gateways/_shared';

import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';
// Fuente única de statuses/urlPattern del link (anti-drift POM↔adapter — auditoría R2 T11).
// Import components→features con precedente (card-forms → @features/.../adapters).
import {
	AUTHORIZE_LINK_MUTATION_URL_PATTERN,
	AUTHORIZE_LINK_SUCCESS_STATUSES,
	EBIZCHARGE_LINK_MUTATION_URL_PATTERN,
	EBIZCHARGE_LINK_SUCCESS_STATUSES
} from '@features/gateway-pg/data/link-status-defaults';

/**
 * Pasarelas de pago censables en el App Store (match case-insensitive por texto de card).
 *
 * ALIAS del tipo canónico `GatewayName` (`tests/fixtures/gateways/_shared`) — NO una unión paralela.
 * Antes se declaraba acá una unión propia con los mismos 4 miembros, mientras TODO el resto del
 * código multi-gateway (Steps, adapters, `resolveCard`, `stepwise-hold-journey`) usa `GatewayName`:
 * dos tipos independientes para el mismo dominio obligan a recordar actualizar ambos al agregar una
 * 5ª pasarela. Se conserva el nombre `GatewayCompany` porque es el vocabulario de esta pantalla
 * (la "empresa" que muestra la card) y ya lo consumen `GatewaySwitchSteps` / `xray-keys`.
 */
export type GatewayCompany = GatewayName;

/** Estado de una card de pasarela clasificado por el link de acción (i18n-proof). */
export type GatewayCardState = 'linked' | 'linkable' | 'unavailable' | 'unknown';

/** Credenciales sandbox Authorize.net leídas de env (NUNCA hardcodear). */
export interface AuthorizeCreds {
	apiLoginId: string;
	transactionKey: string;
	/** Opcional: algunos modales piden un gateway/service id extra (AUTHORIZE_GATEWAY_ID). */
	gatewayId?: string;
}

/**
 * Credenciales merchant eBizCharge leídas de env.
 *
 * El modal real tiene **4 campos**, no 3 — verificado en vivo (exploratorio del líder de QA,
 * 2026-07-30, grabación `test-1.spec.ts` del clone principal):
 *   `EBizSubscription-Key` · `Security Id` · `User Id` · `Password` → botón **Save**.
 * El 4.º factor (`EBizSubscription-Key`) es el header de la variante JSON/REST de la Connect
 * API; env var `EBIZ_SUBSCRIPTION_KEY` (documentada en `.env.example`).
 */
export interface EbizchargeCreds {
	merchantUser: string;
	merchantPassword: string;
	securityKey: string;
	subscriptionKey: string;
}

/** Campo del modal de credenciales de link: locator (INLINE en este POM) + valor a llenar. */
type LinkFieldEntry = { input: Locator; value: string };

/** Opciones de los ATC de status del link — parametrizados por `adapter.linkSuccessStatuses` (S4). */
export interface LinkStatusOptions {
	/** Statuses HTTP de éxito conocidos (default: los del wrapper de la pasarela). */
	successStatuses?: number[];
	/** Matcher de URL de la mutación de link (default: el del wrapper de la pasarela). */
	urlPattern?: RegExp;
}

/** Aguja de texto (case-insensitive) para localizar la card de cada empresa. Del probe F3. */
const COMPANY_NEEDLE: Record<GatewayCompany, RegExp> = {
	stripe: /stripe/i,
	authorize: /authorize/i,
	ebizcharge: /ebiz/i,
	'mercado-pago': /mercado/i
};

const INTEGRATIONS_PATH = '/#/home/carrier/integrations/list';

/**
 * Guard de operaciones DESTRUCTIVAS de pasarela (S5): renombrado cross-gateway a
 * `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH` (el switch ya no es Authorize-only). El nombre viejo
 * `AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH` se mantiene como ALIAS retrocompatible.
 * Exportado (S6) para que la factory CFG (`gateway-config.factory.ts`) skipee limpio
 * la suite destructiva en vez de reventar dentro de `unlinkGateway()`.
 */
export function isGatewayDestructiveSwitchAllowed(): boolean {
	return process.env.GATEWAY_ALLOW_DESTRUCTIVE_SWITCH === 'true' || process.env.AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH === 'true';
}

export class AppStoreGatewaysPage extends UiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	// ── Locators extraídos (reuso 2+ → miembros de instancia, regla KATA) ────────────

	/** Card de una pasarela filtrada por el texto de la empresa (case-insensitive). */
	cardFor(company: GatewayCompany): Locator {
		return this.page.locator('.card').filter({ hasText: COMPANY_NEEDLE[company] }).first();
	}

	/** Link de acción "vincular" — por CLASE (green-text). Diagnóstico en vivo descartó `getByText`
	 * (exact match daba count=0 pese a que `evaluate()` confirmó textContent==="Vincular" — probable
	 * timing del churn Angular al evaluar el locator). La clase es el discriminador ESTABLE (count=1
	 * en TODOS los dumps). El click debe ser `.click()` NORMAL de Playwright (CDP, evento "trusted") —
	 * un native `el.click()` vía evaluate() NO abre el modal (evento no confiable para el handler
	 * Angular), confirmado por diagnóstico quirúrgico con elementFromPoint + native-click. */
	private readonly vincularLink = (company: GatewayCompany): Locator =>
		this.cardFor(company).locator('a.green-text').first();

	/** Link de acción "desvincular" — por CLASE (red-text), mismo razonamiento. */
	private readonly desvincularLink = (company: GatewayCompany): Locator =>
		this.cardFor(company).locator('a.red-text').first();

	/**
	 * Modal de credenciales Authorize — scopeado por su campo único `formcontrolname="apiLoginKey"`.
	 * CORRECCIÓN vs HANDOFF (verificado en vivo con el modal REAL abierto, dump de outerHTML): el
	 * input NO tiene atributo `name` — tiene `formcontrolname="apiLoginKey"` (Angular Reactive Forms)
	 * + `id="apiLoginKey"`. `ng-reflect-name` (debug-only, Angular dev mode) generó la confusión.
	 */
	private readonly authModal = (): Locator =>
		this.page.locator('.modal, [role="dialog"]').filter({ has: this.page.locator('input[formcontrolname="apiLoginKey"]') }).first();

	/** Campos del modal Authorize por `formcontrolname` (verificado en vivo, corrige HANDOFF §1). */
	private readonly apiLoginInput = (): Locator => this.page.locator('input[formcontrolname="apiLoginKey"]');
	private readonly transactionKeyInput = (): Locator => this.page.locator('input[formcontrolname="transactionKey"]');

	/**
	 * FRAGILE/TODO(live): modal de credenciales eBizCharge — NO verificado en vivo (S4). Sin un
	 * campo distintivo confirmado (como `apiLoginKey` en Authorize), se scopea por el TEXTO de la
	 * pasarela dentro del dialog (hay ~6 modales ocultos, 1 por PSP). Confirmar en corrida viva.
	 */
	private readonly ebizModal = (): Locator =>
		this.page.locator('.modal, [role="dialog"]').filter({ hasText: /ebiz/i }).first();

	/**
	 * Campos del modal eBizCharge por NOMBRE ACCESIBLE — verificados en vivo (exploratorio del
	 * líder de QA, 2026-07-30): el modal real expone `EBizSubscription-Key`, `Security Id`,
	 * `User Id` y `Password` como accessible names de sus textboxes. Reemplaza a los 11
	 * `formcontrolname` candidatos que nunca se confirmaron. Scopeados al modal eBiz porque hay
	 * ~6 modales PSP ocultos en el DOM, y `Password` existe también en el de Authorize.
	 */
	private readonly ebizSubscriptionKeyInput = (): Locator =>
		this.ebizModal().getByRole('textbox', { name: 'EBizSubscription-Key' }).first();
	private readonly ebizSecurityKeyInput = (): Locator =>
		this.ebizModal().getByRole('textbox', { name: 'Security Id' }).first();
	private readonly ebizMerchantUserInput = (): Locator =>
		this.ebizModal().getByRole('textbox', { name: 'User Id' }).first();
	private readonly ebizMerchantPasswordInput = (): Locator =>
		this.ebizModal().getByRole('textbox', { name: 'Password' }).first();

	/**
	 * Botón submit de un modal de credenciales. NO es uniforme entre pasarelas — cada dato está
	 * verificado en vivo por separado:
	 *   · Authorize → "Continuar" (el modal mezcla idiomas: campos en inglés, botones en español).
	 *   · eBizCharge → **"Save"** (exploratorio 2026-07-30 — el matcher viejo `Continuar|Continue`
	 *     no lo encontraba y el link de eBiz moría por timeout).
	 * Empieza DISABLED hasta que el form sea válido (Angular reactive form) — Playwright espera el
	 * estado enabled automáticamente antes del click. Scopeado al modal recibido (hay ~6 modales
	 * ocultos, 1 por PSP, cada uno con su propio submit).
	 */
	private readonly linkSubmitIn = (modal: Locator): Locator =>
		modal.getByRole('button', { name: /^(Continuar|Continue|Save|Guardar)$/i }).first();

	/** Modal de credenciales de link por pasarela (solo Authorize verificado live). */
	private linkModalFor(company: GatewayCompany): Locator {
		switch (company) {
			case 'authorize':
				return this.authModal();
			case 'ebizcharge':
				return this.ebizModal();
			default:
				// stripe = OAuth Connect (sin modal de creds); mercado-pago sin modal modelado.
				throw new Error(`Modal de credenciales de '${company}' no modelado — solo authorize/ebizcharge tienen modal de link en este POM.`);
		}
	}

	/** FRAGILE: popup de confirmación de desvinculación (SweetAlert / modal). */
	/**
	 * Popup de confirmación de desvinculación — filtrado por VISIBILIDAD, no `.first()` del DOM.
	 *
	 * POR QUÉ (fix live 2026-07-28): el selector matchea **7 diálogos** en esta página (la app
	 * pre-renderiza modales ocultos, p. ej. el login de GNET) y el primero en orden de DOM está
	 * OCULTO. Con `.first()` el `expect(...).toBeVisible()` evaluaba ese modal ajeno y fallaba
	 * aunque el popup real estuviera abierto — diagnóstico live: tras el click el popup SÍ estaba
	 * en pantalla (botones visibles "Cancelar"/"Confirmar") y el assert daba rojo igual.
	 * `filter({ visible: true })` selecciona el diálogo realmente presentado.
	 */
	private readonly confirmPopup = (): Locator =>
		this.page.locator('.swal2-popup, [role="dialog"], .modal').filter({ visible: true }).first();

	/**
	 * Botones del popup de confirmación de desvinculación, anclados AL BOTÓN y no al contenedor.
	 *
	 * POR QUÉ (fix live 2026-07-28): el popup real de MAGIIS NO usa ninguno de los contenedores
	 * que `confirmPopup()` busca — un probe con el popup ABIERTO mostró `.swal2-popup`,
	 * `[role=dialog]` y `.modal` con 7 matches TODOS invisibles (son el modal oculto de login de
	 * GNET del App Store), mientras los botones "Cancelar" y "Confirmar" del popup sí estaban
	 * visibles. Por eso `expect(confirmPopup()).toBeVisible()` fallaba aunque el popup estuviera
	 * en pantalla, y la suite CFG nunca podía desvincular.
	 * El filtro `{ visible: true }` es OBLIGATORIO: el modal oculto de GNET también tiene un
	 * botón "Cancelar" y sin filtrar `.first()` devolvía ese.
	 */
	private readonly unlinkConfirmButton = (): Locator =>
		this.page
			// `confirm` agregado (verificado en vivo 2026-07-30): en locale inglés el popup de
			// desvinculación usa el botón "Confirm", que el matcher anterior no cubría.
			.getByRole('button', { name: /^\s*(confirmar|confirm|aceptar|s[ií]|yes|ok)\s*$/i })
			.filter({ visible: true })
			.first();

	/** Botón de cancelación del mismo popup (ver `unlinkConfirmButton` para el por qué del anclaje). */
	private readonly unlinkCancelButton = (): Locator =>
		this.page
			.getByRole('button', { name: /^\s*(cancelar|cancel|cerrar|close|no)\s*$/i })
			.filter({ visible: true })
			.first();

	// ── Helpers privados de interacción (usados por varios ATC; NO son ATC) ──────────

	/** Campos del modal de link Authorize (locators verificados en vivo). `gatewayId` no se usa hoy. */
	private authorizeLinkFields(creds: AuthorizeCreds): LinkFieldEntry[] {
		return [
			{ input: this.apiLoginInput(), value: creds.apiLoginId },
			{ input: this.transactionKeyInput(), value: creds.transactionKey }
		];
	}

	/** Campos del modal de link eBizCharge — FRAGILE/TODO(live): locators candidatos sin confirmar. */
	private ebizchargeLinkFields(creds: EbizchargeCreds): LinkFieldEntry[] {
		// Orden del modal real (verificado 2026-07-30): Subscription-Key → Security Id → User Id → Password.
		return [
			{ input: this.ebizSubscriptionKeyInput(), value: creds.subscriptionKey },
			{ input: this.ebizSecurityKeyInput(), value: creds.securityKey },
			{ input: this.ebizMerchantUserInput(), value: creds.merchantUser },
			{ input: this.ebizMerchantPasswordInput(), value: creds.merchantPassword }
		];
	}

	/**
	 * Abre el modal de link de `company` con retry: el handler (click) del <a>Link</a> puede no
	 * estar bindeado al primer intento (Angular legacy) → `toPass` reintenta el click + espera
	 * `readyField` (primer campo del modal) visible.
	 *
	 * La sección "Interfaces de pago" de este dashboard sufre un REFRESH PERIÓDICO (probable
	 * polling de estado del gateway contra backend): el link puede existir en el DOM en el
	 * instante T y desaparecer/recrearse en T+1 (confirmado en vivo: `readState()` encuentra el
	 * link, pero el intento inmediatamente posterior de `scrollIntoViewIfNeeded`/`click` timeoutea
	 * porque el locator ya no resuelve a ningún elemento — no es un problema de scroll ni de
	 * actionability, es que el elemento literalmente no está durante esa ventana). Por eso el retry
	 * usa timeouts CORTOS por intento (para no quemar el presupuesto esperando en una ventana
	 * muerta) y MUCHOS intentos dentro de una ventana total generosa, en vez de pocos intentos con
	 * timeout largo.
	 *
	 * Además, el estado de la card puede seguir actualizándose tras `networkidle` (probable
	 * socket/polling en tiempo real ajeno a requests HTTP normales — confirmado que `readState()`
	 * ve 'linkable' pero el click inmediatamente posterior ya no encuentra el link, incluso con
	 * waitFor(attached)). Mitigación: minimizar la ventana lectura→acción a una única operación —
	 * click DIRECTO con timeout corto (si el link no está EN ESE INSTANTE, falla rápido y el
	 * toPass reintenta el ciclo completo desde cero) en vez de encadenar waitFor+evaluate+click
	 * (cada paso extra es una oportunidad más para que el estado cambie por debajo).
	 */
	private async openLinkModalFor(company: GatewayCompany, readyField: Locator): Promise<void> {
		await expect(async () => {
			await this.vincularLink(company).click({ timeout: 4_000 });
			await expect(readyField).toBeVisible({ timeout: 8_000 });
		}).toPass({ timeout: 120_000, intervals: [300, 600, 1_000] });
	}

	/**
	 * Impl privada COMPARTIDA del link por modal de credenciales (S4). SIN decorar — las keys de
	 * ATC son estructurales y viven en los wrappers por pasarela (`linkAuthorize` @atc MG-220;
	 * `linkEbizcharge` sin key aún). Abre el modal, llena `fields`, submitea y verifica el estado
	 * vinculado resultante.
	 */
	private async linkGateway(company: GatewayCompany, fields: LinkFieldEntry[]): Promise<void> {
		await this.openLinkModalFor(company, fields[0].input);
		for (const field of fields) {
			await field.input.fill(field.value);
		}
		await this.linkSubmitIn(this.linkModalFor(company)).click();
		await expect(this.desvincularLink(company), `la card ${company} debe quedar vinculada ("Unlink"/"Desvincular")`).toBeVisible({ timeout: 20_000 });
		expect(await this.readState(company), 'estado esperado tras vincular = linked').toBe('linked');
	}

	/**
	 * Impl privada COMPARTIDA del rechazo de link (S4). SIN decorar (keys en los wrappers).
	 * `errorPattern` es el matcher de error POR PASARELA (E00008 es Authorize-only).
	 * FRAGILE: el mensaje de error puede venir inline en el modal o como toast/swal.
	 */
	private async expectLinkRejectedImpl(company: GatewayCompany, args: { fields: LinkFieldEntry[]; errorPattern: RegExp }): Promise<void> {
		await this.openLinkModalFor(company, args.fields[0].input);
		for (const field of args.fields) {
			await field.input.fill(field.value);
		}
		await this.linkSubmitIn(this.linkModalFor(company)).click();
		await expect(this.page.getByText(args.errorPattern).first(), `debe mostrar el error de autenticación de ${company} sin vincular`).toBeVisible({
			timeout: 20_000
		});
		expect(await this.readState(company), `${company} NO debe quedar vinculada tras credenciales inválidas`).not.toBe('linked');
	}

	/**
	 * Impl privada COMPARTIDA del status de la request de link (S4). SIN decorar (keys en los
	 * wrappers). `successStatuses`/`urlPattern` vienen del wrapper por pasarela (defaults espejo
	 * de `adapter.linkSuccessStatuses` / `adapter.linkMutationUrlPattern`) o del caller vía
	 * `LinkStatusOptions` (factories S6 pasan los del adapter).
	 */
	private async expectLinkStatusOkImpl(
		company: GatewayCompany,
		args: { fields: LinkFieldEntry[]; successStatuses: number[]; urlPattern: RegExp }
	): Promise<void> {
		const isGatewayMutation = (url: string): boolean => args.urlPattern.test(url);
		await this.openLinkModalFor(company, args.fields[0].input);
		for (const field of args.fields) {
			await field.input.fill(field.value);
		}
		const [response] = await Promise.all([
			this.page.waitForResponse(r => isGatewayMutation(r.url()) && r.request().method() !== 'GET', { timeout: 20_000 }),
			this.linkSubmitIn(this.linkModalFor(company)).click()
		]);
		expect(response.status(), `link ${company}: 400 = NO conectada`).not.toBe(400);
		expect(
			args.successStatuses,
			`status observado (${response.status()}) fuera de los códigos de éxito conocidos (${args.successStatuses.join('|')}) — posible comportamiento nuevo, revisar`
		).toContain(response.status());
	}

	/**
	 * Abre el popup de desvinculación — mismo patrón (ver openAuthorizeLinkModal), con
	 * `force: true` por el refresh periódico del FE.
	 *
	 * POR QUÉ `force` (fix live 2026-07-28): la lista del App Store se re-renderiza cada
	 * ~700 ms (ver `goto()`), así que el link de acción rara vez cumple el check de
	 * ESTABILIDAD de Playwright (mismo bounding box en 2 frames consecutivos) → el click
	 * expiraba a los 4 s en cada intento y el `toPass` agotaba sus 120 s sin llegar a
	 * clickear nunca. `force` saltea el check de actionability pero SIGUE siendo un evento
	 * de mouse por CDP (trusted) en la posición del elemento — requisito del handler Angular
	 * (un `el.click()` por `evaluate()` NO abre el popup, verificado en diagnóstico previo).
	 * El oráculo real del intento es el popup visible: si el click cayó al vacío, el `toPass`
	 * reintenta; no se pierde robustez, se elimina la espera imposible.
	 */
	private async openUnlinkPopup(company: GatewayCompany): Promise<void> {
		await expect(async () => {
			const link = this.desvincularLink(company);
			await link.scrollIntoViewIfNeeded({ timeout: 4_000 });
			await link.click({ timeout: 4_000, force: true });
			// Oráculo del popup abierto = su botón afirmativo VISIBLE (ver `unlinkConfirmButton`).
			await expect(this.unlinkConfirmButton()).toBeVisible({ timeout: 8_000 });
		}).toPass({ timeout: 120_000, intervals: [300, 600, 1_000] });
	}

	/** Confirma el popup de desvinculación (botón afirmativo visible — ver `unlinkConfirmButton`). */
	private async confirmUnlink(): Promise<void> {
		await this.unlinkConfirmButton().click();
	}

	// ── API pública KATA ─────────────────────────────────────────────────────────────

	/**
	 * Navega al App Store y espera a que el estado de las cards se ESTABILICE antes de devolver el
	 * control. ROOT CAUSE confirmado en vivo (loop de lecturas cada 700ms sin ninguna interacción):
	 * al cargar la página, la card de una pasarela muestra un estado INICIAL/optimista (ej. "Vincular",
	 * green-text) que ~750ms después el fetch real al backend CORRIGE al estado verdadero (ej.
	 * "Desvincular", red-text). Leer el estado o clickear ANTES de esa corrección opera sobre datos
	 * stale — el link que se buscaba (verde) ya no existe tras la corrección, y ningún reintento lo
	 * encuentra porque el cambio es real y permanente, no un parpadeo. Fix: esperar `networkidle`
	 * (todas las llamadas de estado del gateway ya resueltas) antes de considerar la página lista.
	 */
	@step
	async goto(): Promise<void> {
		await this.page.goto(this.buildUrl(INTEGRATIONS_PATH));
		await this.page.locator('.card').first().waitFor({ state: 'visible', timeout: 30_000 });
		await this.cardFor('authorize').waitFor({ state: 'visible', timeout: 20_000 });
		await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
			/* si networkidle no se alcanza (polling en background), el timeout ya dio margen suficiente */
		});
	}

	/**
	 * Recarga el App Store y espera la MISMA estabilización que `goto()` (cards visibles +
	 * networkidle) antes de devolver el control — leer el estado inmediatamente tras un
	 * reload opera sobre el estado INICIAL/optimista (ver root cause en `goto()`).
	 * Lo consume el caso `reloadPersistence` de la factory CFG (S6).
	 */
	@step
	async reload(): Promise<void> {
		await this.page.reload();
		await this.page.locator('.card').first().waitFor({ state: 'visible', timeout: 30_000 });
		await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
			/* si networkidle no se alcanza (polling en background), el timeout ya dio margen suficiente */
		});
	}

	/**
	 * Clasifica el estado de la card de `company`. Query read-only (`unknown` es un resultado
	 * válido de la clasificación, NO un error tragado).
	 *
	 * CLASIFICA POR EL **TEXTO** DEL LINK DE ACCIÓN, no por su clase de color (fix live
	 * 2026-07-28): la clase es AMBIGUA — "No Disponible" (pasarela bloqueada por la regla de
	 * exclusividad) también se renderiza como `a.red-text`, igual que "Desvincular". El check
	 * por clase devolvía `linked` para una pasarela NO vinculada → `currentActiveGateway()`
	 * elegía la pasarela equivocada y la suite CFG intentaba desvincular una card cuyo link no
	 * abre popup (click al vacío → timeout del toPass). Evidencia: dump del DOM con
	 * `a.red-text` presente y visible en una card cuya acción era "No Disponible".
	 * El locator SIGUE siendo por clase (discriminador estable, ver `vincularLink`); lo que
	 * cambia es que se decide por el texto DE ESE elemento — mismo criterio que el probe
	 * read-only del App Store, cuya clasificación coincidió con la realidad en todos los dumps.
	 */
	@step
	async readState(company: GatewayCompany): Promise<GatewayCardState> {
		const card = this.cardFor(company);
		await card.waitFor({ state: 'visible', timeout: 20_000 });
		// ESTADO ESTABILIZADO (fix live 2026-07-28): el FE pinta un render OPTIMISTA con el
		// estado ANTERIOR/cacheado del carrier y lo corrige ~750 ms después con el fetch real
		// (más un refresh periódico ~700 ms — ver `goto()`). Leer el primer frame devolvía el
		// estado histórico del carrier: con Authorize REALMENTE vinculada, el frame optimista
		// mostraba "Stripe: Desvincular / Authorize: Vincular" (verificado contra el probe
		// read-only, que espera más y sí veía el estado real). Consecuencias que esto causaba:
		// `currentActiveGateway()` elegía la pasarela equivocada y la suite CFG clickeaba un
		// link que desaparecía al corregirse el DOM → timeout de 120 s del toPass; y el smoke
		// era intermitente (1er intento rojo, 2º verde).
		// Se devuelve el valor sólo cuando DOS lecturas consecutivas coinciden.
		let previous: GatewayCardState | null = null;
		for (let attempt = 0; attempt < 6; attempt++) {
			const current = await this.classifyCardState(card);
			if (previous === current) return current;
			previous = current;
			// Ventana de settle deliberada (> el ciclo de refresh del FE), no un sleep arbitrario.
			await this.page.waitForTimeout(900);
		}
		return previous ?? 'unknown';
	}

	/**
	 * Clasificación pura de una card ya visible (sin esperas de settle — eso lo hace `readState`).
	 * Decide por el **TEXTO** del link de acción, no por su clase de color: la clase es AMBIGUA —
	 * "No Disponible" (pasarela bloqueada por exclusividad) también se renderiza como `a.red-text`,
	 * igual que "Desvincular". El locator sigue siendo por clase (discriminador estable, ver
	 * `vincularLink`); lo que decide es el texto de ESE elemento — mismo criterio que el probe
	 * read-only del App Store, cuya clasificación coincidió con la realidad en todos los dumps.
	 */
	private async classifyCardState(card: Locator): Promise<GatewayCardState> {
		const actionLink = card.locator('a.red-text, a.green-text').first();
		if (await actionLink.isVisible().catch(() => false)) {
			const action = ((await actionLink.textContent().catch(() => '')) ?? '').trim().toLowerCase();
			if (action.includes('no disponible') || action.includes('not available')) return 'unavailable';
			if (action.includes('desvincular') || action.includes('unlink')) return 'linked';
			if (action.includes('vincular') || action.includes('link') || action.includes('habilitar')) return 'linkable';
		}
		// Fallback al texto completo de la card (sin link de acción visible, p.ej. MP fuera de región).
		const raw = ((await card.textContent().catch(() => '')) ?? '').trim().toLowerCase();
		if (raw.includes('no disponible') || raw.includes('not available')) return 'unavailable';
		if (raw.includes('desvincular') || raw.includes('unlink')) return 'linked';
		if (raw.includes('vincular') || raw.includes('link') || raw.includes('habilitar')) return 'linkable';
		return 'unknown';
	}

	/**
	 * ATC — vincula Authorize con credenciales VÁLIDAS y verifica el estado vinculado.
	 * Precondición: la card Authorize debe estar "Vincular" (green-text) — liberar el slot de
	 * exclusividad antes (GatewaySwitchSteps.unlinkActiveGateway).
	 * Wrapper por pasarela (S4): la key de ATC es ESTRUCTURAL acá; la lógica vive en `linkGateway`.
	 */
	@atc('MG-220', { severity: 'critical', description: 'Vincular Authorize con credenciales válidas' })
	async linkAuthorize(creds: AuthorizeCreds): Promise<void> {
		await this.linkGateway('authorize', this.authorizeLinkFields(creds));
	}

	/**
	 * ATC — vincula eBizCharge con credenciales merchant VÁLIDAS y verifica el estado vinculado.
	 * Wrapper por pasarela (key ESTRUCTURAL — TS-EBIZ-TC1051). Decorado el 2026-07-31: el Test SÍ
	 * existe, es MG-141 (A-01) del ATR de acciones estandarizadas MG-559, no un Test "de eBizCharge"
	 * — de ahí que antes se concluyera que no había key.
	 * Modal y campos eBiz CONFIRMADOS en vivo el 2026-07-30 (4 campos: EBizSubscription-Key /
	 * Security Id / User Id / Password, botón Save).
	 */
	@atc('MG-141', { severity: 'critical', description: 'Vincular pasarela eBizCharge con cuenta PSP válida' })
	async linkEbizcharge(creds: EbizchargeCreds): Promise<void> {
		await this.linkGateway('ebizcharge', this.ebizchargeLinkFields(creds));
	}

	/**
	 * ATC — intenta vincular Authorize con credenciales INVÁLIDAS y verifica el rechazo
	 * controlado (response code E00008 — matcher Authorize-only) sin activar el gateway.
	 * Wrapper por pasarela (S4); lógica compartida en `expectLinkRejectedImpl`.
	 */
	@atc('MG-221', { severity: 'critical', description: 'Impedir vincular Authorize con credenciales inválidas (E00008)' })
	async expectLinkRejected(creds: AuthorizeCreds): Promise<void> {
		await this.expectLinkRejectedImpl('authorize', {
			fields: this.authorizeLinkFields(creds),
			errorPattern: /E00008|invalid authentication|autenticaci[oó]n|credenciales inv[aá]lidas/i
		});
	}

	/**
	 * Intenta vincular eBizCharge con credenciales INVÁLIDAS y verifica el rechazo sin activar
	 * el gateway. Wrapper por pasarela (S4) — SIN `@atc` (sin key CFG eBiz aún).
	 * FRAGILE/TODO(live): matcher de error genérico — el copy real del rechazo eBiz NO está
	 * confirmado (E00008 es Authorize-only); fijar el matcher en la primera corrida viva.
	 */
	@step
	async expectEbizchargeLinkRejected(creds: EbizchargeCreds): Promise<void> {
		await this.expectLinkRejectedImpl('ebizcharge', {
			fields: this.ebizchargeLinkFields(creds),
			errorPattern: /error|inv[aá]lid|incorrect|credencial|autenticaci[oó]n|denied|failed/i
		});
	}

	/**
	 * Impl privada COMPARTIDA del unlink (post-review F1). SIN decorar — las keys de ATC son
	 * ESTRUCTURALES y viven en los wrappers por pasarela (`unlinkAuthorize` @atc MG-223;
	 * `unlinkStripe` @atc MG-215; eBiz/MP sin key aún). Desvincula (click "Desvincular" →
	 * confirmar popup) y verifica el estado vinculable resultante.
	 * ⚠️ DESTRUCTIVO en runtime: desvincular dispara cleaningWallets en cascada sobre el carrier.
	 */
	private async unlinkGatewayImpl(company: GatewayCompany): Promise<void> {
		if (!isGatewayDestructiveSwitchAllowed()) {
			throw new Error(
				'unlinkGateway() es DESTRUCTIVO: dispara cleaningWallets en cascada sobre el carrier 1521 (compartido por toda la suite gateway), borrando la tarjeta real del pasajero. ' +
					'Requiere GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true puesto explícitamente para correr (alias legacy AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH también aceptado) — no está habilitado por defecto.',
			);
		}
		await this.openUnlinkPopup(company);
		await this.confirmUnlink();
		// El detach del backend es `@Async` + cascade `cleaningWallets`, y la lista del App Store
		// sirve un render cacheado: el estado real puede tardar MÁS que la ventana del assert
		// (verificado live 2026-07-28: la desvinculación SÍ se aplicó en backend — el probe
		// read-only la confirmó — pero la card seguía mostrando "Desvincular" al expirar los 20 s).
		// `reload()` + `readState` estabilizado dentro de `toPass` espera el efecto REAL sin
		// depender del refresh optimista del FE.
		await expect(async () => {
			await this.reload();
			expect(await this.readState(company), 'estado esperado tras desvincular = linkable').toBe('linkable');
		}).toPass({ timeout: 60_000, intervals: [2_000, 4_000, 6_000] });
	}

	/** ATC — desvincula Authorize. Wrapper por pasarela (key ESTRUCTURAL — TS-AUTHORIZE-TC1005). */
	@atc('MG-223', { severity: 'critical', description: 'Desvincular pasarela (dispara cleaningWallets)' })
	async unlinkAuthorize(): Promise<void> {
		await this.unlinkGatewayImpl('authorize');
	}

	/** ATC — desvincula Stripe. Wrapper por pasarela (key ESTRUCTURAL — TS-STRIPE-TC1005). */
	@atc('MG-215', { severity: 'critical', description: 'Desvincular pasarela Stripe (dispara cleaningWallets)' })
	async unlinkStripe(): Promise<void> {
		await this.unlinkGatewayImpl('stripe');
	}

	/** ATC — desvincula eBizCharge (dispara cleaningWallets). Wrapper por pasarela (key ESTRUCTURAL —
	 * TS-EBIZ-TC1054). MG-165 (G-01) Step 5: "reabrir el modal y presionar Confirmar → se invoca
	 * cleaningWallets e inicia la desvinculación".
	 * NO lleva MG-166: ese Test exige que las wallets locales queden vacías, y acá no se mira ni una
	 * — lo acredita `api/vendor-cleaning-wallets/cleaning-wallets-db.api.spec.ts` contra Oracle. */
	@atc('MG-165', { severity: 'critical', description: 'Confirmar el modal de desvinculación de eBizCharge dispara cleaningWallets' })
	async unlinkEbizcharge(): Promise<void> {
		await this.unlinkGatewayImpl('ebizcharge');
	}

	/** Desvincula Mercado Pago. Wrapper por pasarela — SIN `@atc`: MP aún sin key CFG de unlink (nunca inventar). */
	@step
	async unlinkMercadoPago(): Promise<void> {
		await this.unlinkGatewayImpl('mercado-pago');
	}

	/**
	 * Desvincula la pasarela `company` despachando al wrapper por pasarela (SIN decorator acá:
	 * cada invocación acredita la key @atc del gateway CORRECTO — fix post-review F1: la key
	 * fija MG-223 acreditaba unlinks de Stripe/eBiz/MP a Authorize).
	 * ⚠️ DESTRUCTIVO en runtime (ver `unlinkGatewayImpl`).
	 */
	async unlinkGateway(company: GatewayCompany): Promise<void> {
		switch (company) {
			case 'authorize':
				return this.unlinkAuthorize();
			case 'stripe':
				return this.unlinkStripe();
			case 'ebizcharge':
				return this.unlinkEbizcharge();
			case 'mercado-pago':
				return this.unlinkMercadoPago();
		}
	}

	/**
	 * Abre el popup de desvinculación y lo CANCELA (no-op verificable: no cambia estado → `@step`,
	 * no `@atc`). Cubre TS-AUTHORIZE-TC1004 (fuera de los 5 tests del spec F4, disponible para uso).
	 * FRAGILE: botón cancelar del popup.
	 */
	@step
	async cancelUnlink(company: GatewayCompany): Promise<void> {
		await this.openUnlinkPopup(company);
		await this.unlinkCancelButton().click();
		// El cierre se verifica por la desaparición del botón afirmativo (mismo anclaje que la apertura).
		await expect(this.unlinkConfirmButton(), 'el popup debe cerrarse sin desvincular').toBeHidden({ timeout: 10_000 });
		expect(await this.readState(company), `${company} sigue vinculada tras cancelar`).toBe('linked');
	}

	/**
	 * ATC — fuerza (mock) un fallo HTTP en `vendor/cleaningWallets` durante la desvinculación y
	 * verifica que el FE NO reporte éxito falso: el ícono de éxito NO debe aparecer y la pasarela
	 * debe seguir "linked" (retryable) pese al 500.
	 *
	 * ⚠️ NO destructivo por construcción: `page.route()` intercepta la request ANTES de que
	 * salga del browser — el backend real de `cleaningWallets` NUNCA se contacta, a diferencia
	 * de `unlinkGateway()` (que sí ejecuta el unlink real y por eso exige el guard
	 * `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH`, ex `AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH`). Esta ATC deliberadamente NO reutiliza `unlinkGateway()`
	 * (sus aserciones esperan el ÉXITO de la desvinculación, el escenario opuesto al de este TC).
	 *
	 * Tampoco reutiliza los helpers privados `openUnlinkPopup`/`confirmPopup` (FRAGILE, confirmado
	 * en vivo 2026-07-25): el selector combinado `.swal2-popup, [role="dialog"], .modal` de
	 * `confirmPopup()` matchea `.first()` contra el elemento equivocado cuando hay más de un
	 * `[role="dialog"]` en el DOM (esta pantalla tiene varios modales ocultos, 1 por PSP — mismo
	 * patrón ya documentado para `authModal()`), y su `toPass` de 120s queda reintentando un click
	 * sobre un link ya tapado por el popup real. Este ATC usa un locator propio, scopeado por el
	 * texto real del popup ("Desvincular Mercado Pago" — ver título del modal), evitando ese bug.
	 *
	 * @atc MG-169 — área G (bug transversal: cleaningWallets no debe reportar éxito falso, TC-PAY-G-05).
	 */
	@atc('MG-169', { severity: 'critical', description: 'Fallo mockeado (500) de cleaningWallets no debe reportar éxito falso' })
	async expectUnlinkFailureShowsRealError(company: GatewayCompany): Promise<void> {
		await this.page.route('**/vendor/cleaningWallets/**', (route: Route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Mocked failure — MG-169 (no reportar éxito falso)' })
			})
		);

		// Guard anti-mutación (post-review A2): el supuesto "unlink = SOLO cleaningWallets" NO
		// está verificado live — el mock intercepta ese patrón, pero cualquier OTRA mutación
		// disparada por el flujo llegaría REAL al backend. Registrar toda request no-GET fuera
		// del patrón mockeado y fallar al final del ATC si hubo alguna.
		const unexpectedMutations: string[] = [];
		const onRequest = (request: Request): void => {
			if (request.method() !== 'GET' && !/\/vendor\/cleaningWallets\//i.test(request.url())) {
				unexpectedMutations.push(`${request.method()} ${request.url()}`);
			}
		};
		this.page.on('request', onRequest);

		try {
			await this.desvincularLink(company).click();

			// Popup scopeado por el texto real ("Desvincular <PSP>") — más preciso que el selector
			// genérico `confirmPopup()`, que puede matchear un modal oculto de otra pasarela.
			const popup = this.page
				.locator('ngb-modal-window[role="dialog"], .modal, [role="dialog"], .swal2-popup')
				.filter({ hasText: /desvincular/i })
				.first();
			await expect(popup, 'debe abrirse el popup de confirmación de desvinculación').toBeVisible({ timeout: 15_000 });
			await popup
				.getByRole('button', { name: /^confirmar$/i })
				.first()
				.click();

			// El bug documentado (TC-PAY-G-05) es un toast/ícono de ÉXITO INCONDICIONAL — NO debe
			// aparecer cuando el backend respondió 500 a la desvinculación.
			const successIcon = this.page.locator('.swal2-icon.swal2-success, .swal2-success');
			await expect(successIcon, 'BUG MG-169: el FE mostró un ícono/toast de ÉXITO pese al 500 mockeado de cleaningWallets').toBeHidden({
				timeout: 8_000
			});

			// Prueba funcional robusta (no depende del copy del toast): un fallo de backend NO puede
			// dejar el FE "creyendo" que se desvinculó — la card debe seguir "linked" (y por lo tanto
			// reintentable: el link "Desvincular" sigue visible).
			expect(await this.readState(company), 'BUG MG-169: la pasarela quedó "no vinculada" en el FE pese al 500 mockeado — éxito falso').toBe(
				'linked'
			);
		} finally {
			this.page.off('request', onRequest);
		}

		expect(
			unexpectedMutations,
			'GUARD MG-169: el flujo de unlink disparó mutaciones NO mockeadas (fuera de **/vendor/cleaningWallets/**) que llegaron REALES al backend — el supuesto "unlink = solo cleaningWallets" no se sostiene; verificar en vivo antes de confiar en este mock.'
		).toEqual([]);
	}

	/**
	 * Impl privada COMPARTIDA de la exclusividad (post-review F1). SIN decorar — las keys de ATC
	 * son ESTRUCTURALES y viven en los wrappers por pasarela (`expectExclusivityAuthorize` @atc
	 * MG-224; `expectExclusivityStripe` @atc MG-216; eBiz/MP sin key aún). Con `activeCompany`
	 * vinculada, ninguna otra pasarela de pago debe ser vinculable ("No Disponible"). Salta
	 * cards ausentes en el carrier.
	 */
	private async expectExclusivityImpl(activeCompany: GatewayCompany): Promise<void> {
		expect(await this.readState(activeCompany), `${activeCompany} debe estar vinculada`).toBe('linked');
		const others = (Object.keys(COMPANY_NEEDLE) as GatewayCompany[]).filter(c => c !== activeCompany);
		for (const other of others) {
			if ((await this.cardFor(other).count()) === 0) continue;
			const state = await this.readState(other);
			expect(state, `con ${activeCompany} activa, ${other} NO debe ser vinculable`).not.toBe('linkable');
		}
	}

	/** ATC — exclusividad con Authorize activa. Wrapper por pasarela (key ESTRUCTURAL — TS-AUTHORIZE-TC1006). */
	@atc('MG-224', { severity: 'critical', description: 'Exclusividad: una sola pasarela activa por carrier' })
	async expectExclusivityAuthorize(): Promise<void> {
		await this.expectExclusivityImpl('authorize');
	}

	/** ATC — exclusividad con Stripe activa. Wrapper por pasarela (key ESTRUCTURAL — TS-STRIPE-TC1006). */
	@atc('MG-216', { severity: 'critical', description: 'Exclusividad: con Stripe activa no se puede vincular otra pasarela' })
	async expectExclusivityStripe(): Promise<void> {
		await this.expectExclusivityImpl('stripe');
	}

	/** ATC — exclusividad con eBizCharge activa. Wrapper por pasarela (key ESTRUCTURAL — TS-EBIZ-TC1055).
	 * MG-143 (A-03) del ATR estandarizado MG-559: "se garantiza una sola PSP conectada por carrier". */
	@atc('MG-143', { severity: 'critical', description: 'Exclusividad: con eBizCharge activa no se puede vincular otra pasarela' })
	async expectExclusivityEbizcharge(): Promise<void> {
		await this.expectExclusivityImpl('ebizcharge');
	}

	/** Exclusividad con Mercado Pago activa. Wrapper — SIN `@atc`: MP aún sin key CFG de exclusividad (nunca inventar). */
	@step
	async expectExclusivityMercadoPago(): Promise<void> {
		await this.expectExclusivityImpl('mercado-pago');
	}

	/**
	 * Verifica la exclusividad despachando al wrapper por pasarela (SIN decorator acá: cada
	 * invocación acredita la key @atc del gateway CORRECTO — fix post-review F1: la key fija
	 * MG-224 acreditaba la exclusividad de Stripe/eBiz/MP a Authorize).
	 */
	async expectExclusivity(activeCompany: GatewayCompany): Promise<void> {
		switch (activeCompany) {
			case 'authorize':
				return this.expectExclusivityAuthorize();
			case 'stripe':
				return this.expectExclusivityStripe();
			case 'ebizcharge':
				return this.expectExclusivityEbizcharge();
			case 'mercado-pago':
				return this.expectExclusivityMercadoPago();
		}
	}

	/**
	 * ATC — observa la request de vinculación de Authorize y verifica el status de éxito del AC (200).
	 * Precondición: Authorize "Vincular" (liberar slot antes). Deja Authorize vinculada.
	 * Wrapper por pasarela (S4); lógica compartida en `expectLinkStatusOkImpl`. Defaults desde la
	 * fuente única `data/link-status-defaults.ts`; `options` permite pasar los del adapter.
	 *
	 * EVIDENCIA LIVE 2026-07-28 (campaña exploratoria, dos probes de red independientes): el submit
	 * dispara UNA sola mutación, `POST vendor/authorize`, y responde **200** dejando la card en
	 * `linked`. Corrige DOS afirmaciones del HANDOFF §2 que ya no reproducen: el quirk `500|409` y
	 * el endpoint `odnService`. Se vuelve al AC original de la matriz (status 200): el assert ya NO
	 * tolera códigos de error, así que un 500/409 futuro FALLA (era lo que el quirk tapaba).
	 * ⚠️ 200 ≠ credenciales validadas: el endpoint responde 200 y vincula incluso con credenciales
	 * INVÁLIDAS (defecto de backend, ver DRAFT-improvement en docs/gateway-pg/authorize/) — por eso
	 * el caso asserta además la persistencia del estado.
	 */
	@atc('MG-226', { severity: 'normal', description: 'La request de link de Authorize retorna status 200 (AC de matriz) y la pasarela queda vinculada' })
	async expectLinkStatusOk(creds: AuthorizeCreds, options: LinkStatusOptions = {}): Promise<void> {
		await this.expectLinkStatusOkImpl('authorize', {
			fields: this.authorizeLinkFields(creds),
			// Defaults desde la FUENTE ÚNICA compartida con el adapter (link-status-defaults.ts).
			successStatuses: options.successStatuses ?? [...AUTHORIZE_LINK_SUCCESS_STATUSES],
			urlPattern: options.urlPattern ?? AUTHORIZE_LINK_MUTATION_URL_PATTERN
		});
	}

	/**
	 * Observa la request de vinculación de eBizCharge y verifica un status de éxito conocido.
	 * Wrapper por pasarela (S4) — SIN `@atc` (sin key CFG eBiz aún). Deja eBiz vinculada.
	 * TODO(live): default `[200]` ASUMIDO (espejo del adapter ebizcharge) — status real de la
	 * request de link eBiz NO verificado; matcher de URL candidato sin confirmar.
	 */
	@step
	async expectEbizchargeLinkStatusOk(creds: EbizchargeCreds, options: LinkStatusOptions = {}): Promise<void> {
		await this.expectLinkStatusOkImpl('ebizcharge', {
			fields: this.ebizchargeLinkFields(creds),
			// Defaults desde la FUENTE ÚNICA compartida con el adapter (link-status-defaults.ts).
			successStatuses: options.successStatuses ?? [...EBIZCHARGE_LINK_SUCCESS_STATUSES],
			urlPattern: options.urlPattern ?? EBIZCHARGE_LINK_MUTATION_URL_PATTERN
		});
	}
}
