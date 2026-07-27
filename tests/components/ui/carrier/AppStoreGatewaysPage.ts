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

import type { Locator, Route } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

/** Pasarelas de pago censables en el App Store (match case-insensitive por texto de card). */
export type GatewayCompany = 'stripe' | 'authorize' | 'ebizcharge' | 'mercado-pago';

/** Estado de una card de pasarela clasificado por el link de acción (i18n-proof). */
export type GatewayCardState = 'linked' | 'linkable' | 'unavailable' | 'unknown';

/** Credenciales sandbox Authorize.net leídas de env (NUNCA hardcodear). */
export interface AuthorizeCreds {
	apiLoginId: string;
	transactionKey: string;
	/** Opcional: algunos modales piden un gateway/service id extra (AUTHORIZE_GATEWAY_ID). */
	gatewayId?: string;
}

/** Credenciales merchant eBizCharge leídas de env (EBIZ_MERCHANT_USER / _PASSWORD / EBIZ_SECURITY_KEY). */
export interface EbizchargeCreds {
	merchantUser: string;
	merchantPassword: string;
	securityKey: string;
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
	 * FRAGILE/TODO(live): campos del modal eBizCharge por `formcontrolname` CANDIDATOS (no
	 * confirmados — espejo del patrón Angular Reactive Forms del modal Authorize). Scopeados al
	 * modal eBiz para no matchear inputs de otros modales PSP ocultos. Fijar selectores reales
	 * en la primera corrida viva con EBIZ_* configuradas.
	 */
	private readonly ebizMerchantUserInput = (): Locator =>
		this.ebizModal()
			.locator('input[formcontrolname="merchantUser"], input[formcontrolname="username"], input[formcontrolname="userName"], input[formcontrolname="user"]')
			.first();
	private readonly ebizMerchantPasswordInput = (): Locator =>
		this.ebizModal().locator('input[formcontrolname="merchantPassword"], input[formcontrolname="password"], input[type="password"]').first();
	private readonly ebizSecurityKeyInput = (): Locator =>
		this.ebizModal()
			.locator('input[formcontrolname="securityKey"], input[formcontrolname="securityId"], input[formcontrolname="apiKey"], input[formcontrolname="token"]')
			.first();

	/**
	 * Botón submit de un modal de credenciales = "Continuar" (ESPAÑOL — el modal Authorize mezcla
	 * idiomas: título/campos en inglés "Link your account"/"API Login ID:", botones en español
	 * "Cancelar"/"Continuar"; corrige HANDOFF que asumía "Continue" en inglés). Empieza DISABLED
	 * hasta que el form sea válido (Angular reactive form) — Playwright espera el estado enabled
	 * automáticamente antes del click. Scopeado al modal recibido (hay ~6 modales ocultos, 1 por
	 * PSP, cada uno con su propio submit).
	 */
	private readonly linkSubmitIn = (modal: Locator): Locator =>
		modal.getByRole('button', { name: /^(Continuar|Continue)$/i }).first();

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
	private readonly confirmPopup = (): Locator => this.page.locator('.swal2-popup, [role="dialog"], .modal').first();

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
		return [
			{ input: this.ebizMerchantUserInput(), value: creds.merchantUser },
			{ input: this.ebizMerchantPasswordInput(), value: creds.merchantPassword },
			{ input: this.ebizSecurityKeyInput(), value: creds.securityKey }
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

	/** Abre el popup de desvinculación — mismo patrón (ver openAuthorizeLinkModal). */
	private async openUnlinkPopup(company: GatewayCompany): Promise<void> {
		await expect(async () => {
			await this.desvincularLink(company).click({ timeout: 4_000 });
			await expect(this.confirmPopup()).toBeVisible({ timeout: 8_000 });
		}).toPass({ timeout: 120_000, intervals: [300, 600, 1_000] });
	}

	/** FRAGILE: confirma el popup de desvinculación (botón afirmativo). */
	private async confirmUnlink(): Promise<void> {
		await this.confirmPopup()
			.getByRole('button', { name: /s[ií]|confirmar|aceptar|desvincular|yes|ok/i })
			.first()
			.click();
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
	 * Clasifica el estado de la card de `company`. Query read-only (`unknown` es un resultado
	 * válido de la clasificación, NO un error tragado). i18n-proof: prioriza la clase de color
	 * del link de acción; cae al texto del footer para "No Disponible".
	 */
	@step
	async readState(company: GatewayCompany): Promise<GatewayCardState> {
		const card = this.cardFor(company);
		await card.waitFor({ state: 'visible', timeout: 20_000 });
		const redText = card.locator('a.red-text').first();
		if (await redText.isVisible().catch(() => false)) return 'linked';
		const greenText = card.locator('a.green-text').first();
		if (await greenText.isVisible().catch(() => false)) return 'linkable';
		const raw = ((await card.textContent().catch(() => '')) ?? '').trim().toLowerCase();
		if (raw.includes('desvincular') || raw.includes('unlink')) return 'linked';
		if (raw.includes('no disponible') || raw.includes('not available')) return 'unavailable';
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
	 * Vincula eBizCharge con credenciales merchant VÁLIDAS y verifica el estado vinculado.
	 * Wrapper por pasarela (S4) — SIN `@atc`: eBizCharge aún no tiene key CFG en Jira
	 * (`XRAY_KEYS_BY_GATEWAY.ebizcharge.cfg.linkValid = null`); decorar cuando exista.
	 * FRAGILE/TODO(live): modal y campos eBiz NO confirmados en vivo (ver locators candidatos).
	 */
	@step
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
	 * ATC — desvincula una pasarela (click "Desvincular" → confirmar popup) y verifica el
	 * estado vinculable resultante.
	 * ⚠️ DESTRUCTIVO en runtime: desvincular dispara cleaningWallets en cascada sobre el carrier.
	 */
	@atc('MG-223', { severity: 'critical', description: 'Desvincular pasarela (dispara cleaningWallets)' })
	async unlinkGateway(company: GatewayCompany): Promise<void> {
		if (process.env.AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH !== 'true') {
			throw new Error(
				'unlinkGateway() es DESTRUCTIVO: dispara cleaningWallets en cascada sobre el carrier 1521 (compartido por toda la suite gateway), borrando la tarjeta real del pasajero. ' +
					'Requiere AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH=true puesto explícitamente para correr — no está habilitado por defecto.',
			);
		}
		await this.openUnlinkPopup(company);
		await this.confirmUnlink();
		await expect(this.vincularLink(company), `la card ${company} debe quedar desvinculada (green-text / "Vincular")`).toBeVisible({ timeout: 20_000 });
		expect(await this.readState(company), 'estado esperado tras desvincular = linkable').toBe('linkable');
	}

	/**
	 * Abre el popup de desvinculación y lo CANCELA (no-op verificable: no cambia estado → `@step`,
	 * no `@atc`). Cubre TS-AUTHORIZE-TC1004 (fuera de los 5 tests del spec F4, disponible para uso).
	 * FRAGILE: botón cancelar del popup.
	 */
	@step
	async cancelUnlink(company: GatewayCompany): Promise<void> {
		await this.openUnlinkPopup(company);
		await this.confirmPopup()
			.getByRole('button', { name: /cancelar|no|cerrar|cancel|close/i })
			.first()
			.click();
		await expect(this.confirmPopup(), 'el popup debe cerrarse sin desvincular').toBeHidden({ timeout: 10_000 });
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
	 * `AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH`). Esta ATC deliberadamente NO reutiliza `unlinkGateway()`
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
	}

	/**
	 * ATC — verifica la exclusividad de pasarela: con `activeCompany` vinculada, ninguna otra
	 * pasarela de pago debe ser vinculable ("No Disponible"). Salta cards ausentes en el carrier.
	 */
	@atc('MG-224', { severity: 'critical', description: 'Exclusividad: una sola pasarela activa por carrier' })
	async expectExclusivity(activeCompany: GatewayCompany): Promise<void> {
		expect(await this.readState(activeCompany), `${activeCompany} debe estar vinculada`).toBe('linked');
		const others = (Object.keys(COMPANY_NEEDLE) as GatewayCompany[]).filter(c => c !== activeCompany);
		for (const other of others) {
			if ((await this.cardFor(other).count()) === 0) continue;
			const state = await this.readState(other);
			expect(state, `con ${activeCompany} activa, ${other} NO debe ser vinculable`).not.toBe('linkable');
		}
	}

	/**
	 * ATC — observa la request de vinculación de Authorize y verifica un status de éxito conocido (500|409).
	 * Precondición: Authorize "Vincular" (liberar slot antes). Deja Authorize vinculada.
	 * Wrapper por pasarela (S4); lógica compartida en `expectLinkStatusOkImpl`. Defaults espejo del
	 * adapter authorize (`linkSuccessStatuses: [500, 409]`); `options` permite pasar los del adapter.
	 *
	 * Quirk backend VERIFICADO (HANDOFF §2, actualizado 2026-07-25): 500 = pasarela CONECTADA desde
	 * estado limpio; 409 = CONECTADA cuando el carrier 1521 (compartido por la suite gateway) ya
	 * estaba vinculado por otra sesión — ambos son éxito funcional, ninguno es bug de test.
	 * 400 = NO conectada. El 500/409-en-éxito es smell de API (debería ser 2xx) → Improvement/Defect a DEV/MX (no MG).
	 * FRAGILE: el endpoint real del link NO está verificado — ajustar el matcher de URL en vivo.
	 * Endpoint del link Authorize = odnService (MG-476), NO /vendor/. El matcher incluye odnService.
	 */
	@atc('MG-226', { severity: 'normal', description: 'La request de link de Authorize retorna un status de éxito conocido (500|409)' })
	async expectLinkStatusOk(creds: AuthorizeCreds, options: LinkStatusOptions = {}): Promise<void> {
		await this.expectLinkStatusOkImpl('authorize', {
			fields: this.authorizeLinkFields(creds),
			successStatuses: options.successStatuses ?? [500, 409],
			urlPattern: options.urlPattern ?? /odnservice|payment.?gateway|paymentgateway|vendor|integration|authorize/i
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
			successStatuses: options.successStatuses ?? [200],
			urlPattern: options.urlPattern ?? /odnservice|payment.?gateway|paymentgateway|vendor|integration|ebiz/i
		});
	}
}
