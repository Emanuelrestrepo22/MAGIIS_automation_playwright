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
 * ⚠️ FRAGILE (NO verificado en vivo): el modal de credenciales Authorize (componente
 * `odnService`) y el endpoint de red del link/unlink todavía NO existen/observados en el repo.
 * Sus locators son DEFENSIVOS (label/placeholder/role + fallbacks de contenedor). Confirmar en
 * vivo antes de la primera corrida real y ajustar los selectores marcados `// FRAGILE`.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase; `this.page` es getter heredado.
 *   - Import por alias (@TestContext, @utils, @ui) — sin relativos.
 *   - Mini-flujos que cambian estado decorados `@atc`; queries read-only `@step`.
 *   - `expect` importado de `@playwright/test` (NO de `@TestFixture`) para evitar el ciclo
 *     Fixture → Page → Fixture (mismo patrón que CarrierNewTravelPage).
 */

import type { Locator } from '@playwright/test';
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

	/** FRAGILE: link "Vincular" (green-text) de la card. Confirmar clase/estructura en vivo. */
	private readonly vincularLink = (company: GatewayCompany): Locator => this.cardFor(company).locator('a.green-text').first();

	/** FRAGILE: link "Desvincular" (red-text) de la card. Confirmar clase/estructura en vivo. */
	private readonly desvincularLink = (company: GatewayCompany): Locator => this.cardFor(company).locator('a.red-text').first();

	/** FRAGILE: contenedor del modal de credenciales Authorize (componente `odnService`). */
	private readonly authModal = (): Locator => this.page.locator('odn-service, [role="dialog"], .modal').first();

	/**
	 * FRAGILE: campo del modal de credenciales resuelto por label/placeholder/role accesible
	 * que contenga `needle`. DEFENSIVO — el DOM real de `odnService` no está verificado.
	 */
	private readonly authField = (needle: RegExp): Locator => {
		const modal = this.authModal();
		return modal
			.getByLabel(needle)
			.or(modal.getByPlaceholder(needle))
			.or(modal.getByRole('textbox', { name: needle }))
			.first();
	};

	/** FRAGILE: botón de confirmación del modal de credenciales. */
	private readonly authSubmit = (): Locator =>
		this.authModal()
			.getByRole('button', { name: /guardar|vincular|confirmar|aceptar|save|link/i })
			.first();

	/** FRAGILE: popup de confirmación de desvinculación (SweetAlert / modal). */
	private readonly confirmPopup = (): Locator => this.page.locator('.swal2-popup, [role="dialog"], .modal').first();

	// ── Helpers privados de interacción (usados por varios ATC; NO son ATC) ──────────

	/** FRAGILE: rellena el modal de credenciales Authorize. login/transaction requeridos. */
	private async fillAuthorizeCredentials(creds: AuthorizeCreds): Promise<void> {
		await this.authField(/login|api.?login|usuario|user/i).fill(creds.apiLoginId);
		await this.authField(/transaction|clave|key|secret|token/i).fill(creds.transactionKey);
		if (creds.gatewayId) {
			// gatewayId opcional: el modal puede no exponer este campo → no romper si falta.
			await this.authField(/gateway|servicio|service|id/i)
				.fill(creds.gatewayId)
				.catch(() => {
					/* campo ausente en el modal odnService: se ignora (opcional) */
				});
		}
	}

	/** FRAGILE: abre el popup de confirmación de desvinculación (click "Desvincular"). */
	private async openUnlinkPopup(company: GatewayCompany): Promise<void> {
		await this.desvincularLink(company).click();
		await this.confirmPopup().waitFor({ state: 'visible', timeout: 15_000 });
	}

	/** FRAGILE: confirma el popup de desvinculación (botón afirmativo). */
	private async confirmUnlink(): Promise<void> {
		await this.confirmPopup()
			.getByRole('button', { name: /s[ií]|confirmar|aceptar|desvincular|yes|ok/i })
			.first()
			.click();
	}

	// ── API pública KATA ─────────────────────────────────────────────────────────────

	/** Navega al App Store / Interfaces de pago y espera la primera card visible. */
	@step
	async goto(): Promise<void> {
		await this.page.goto(this.buildUrl(INTEGRATIONS_PATH));
		await this.page.locator('.card').first().waitFor({ state: 'visible', timeout: 30_000 });
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
		const footer = card.locator('a, .card-footer, span').last();
		const raw = (await footer.textContent().catch(() => '')) ?? '';
		const actionText = raw.trim().toLowerCase();
		if (actionText.includes('desvincular')) return 'linked';
		if (actionText.includes('no disponible')) return 'unavailable';
		if (actionText.includes('vincular') || actionText.includes('habilitar')) return 'linkable';
		return 'unknown';
	}

	/**
	 * ATC — vincula Authorize con credenciales VÁLIDAS y verifica el estado vinculado.
	 * Precondición: la card Authorize debe estar "Vincular" (green-text) — liberar el slot de
	 * exclusividad antes (GatewaySwitchSteps.unlinkActiveGateway).
	 */
	@atc('MG-220', { severity: 'critical', description: 'Vincular Authorize con credenciales válidas' })
	async linkAuthorize(creds: AuthorizeCreds): Promise<void> {
		await this.vincularLink('authorize').click();
		await this.authModal().waitFor({ state: 'visible', timeout: 15_000 });
		await this.fillAuthorizeCredentials(creds);
		await this.authSubmit().click();
		await expect(this.desvincularLink('authorize'), 'la card Authorize debe quedar vinculada (red-text / "Desvincular")').toBeVisible({ timeout: 20_000 });
		expect(await this.readState('authorize'), 'estado esperado tras vincular = linked').toBe('linked');
	}

	/**
	 * ATC — intenta vincular Authorize con credenciales INVÁLIDAS y verifica el rechazo
	 * controlado (response code E00008) sin activar el gateway.
	 * FRAGILE: el mensaje de error puede venir inline en el modal o como toast/swal.
	 */
	@atc('MG-221', { severity: 'critical', description: 'Impedir vincular Authorize con credenciales inválidas (E00008)' })
	async expectLinkRejected(creds: AuthorizeCreds): Promise<void> {
		await this.vincularLink('authorize').click();
		await this.authModal().waitFor({ state: 'visible', timeout: 15_000 });
		await this.fillAuthorizeCredentials(creds);
		await this.authSubmit().click();
		await expect(this.page.getByText(/E00008|invalid authentication|autenticaci[oó]n|credenciales inv[aá]lidas/i).first(), 'debe mostrar el error de autenticación (E00008) sin vincular').toBeVisible({ timeout: 20_000 });
		expect(await this.readState('authorize'), 'Authorize NO debe quedar vinculada tras credenciales inválidas').not.toBe('linked');
	}

	/**
	 * ATC — desvincula una pasarela (click "Desvincular" → confirmar popup) y verifica el
	 * estado vinculable resultante.
	 * ⚠️ DESTRUCTIVO en runtime: desvincular dispara cleaningWallets en cascada sobre el carrier.
	 */
	@atc('MG-223', { severity: 'critical', description: 'Desvincular pasarela (dispara cleaningWallets)' })
	async unlinkGateway(company: GatewayCompany): Promise<void> {
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
	 * ATC — observa la request de vinculación de Authorize y verifica status 200 (auditoría).
	 * Precondición: Authorize "Vincular" (liberar slot antes). Deja Authorize vinculada.
	 * FRAGILE: el endpoint real del link NO está verificado — ajustar el matcher de URL en vivo
	 * (candidatos: /payment-gateway, /paymentGateway, /vendor, /integration).
	 */
	@atc('MG-226', { severity: 'normal', description: 'La request de link de Authorize retorna 200 + auditoría' })
	async expectLinkStatusOk(creds: AuthorizeCreds): Promise<void> {
		const isGatewayMutation = (url: string): boolean => /payment.?gateway|paymentgateway|vendor|integration/i.test(url);
		await this.vincularLink('authorize').click();
		await this.authModal().waitFor({ state: 'visible', timeout: 15_000 });
		await this.fillAuthorizeCredentials(creds);
		const [response] = await Promise.all([this.page.waitForResponse(r => isGatewayMutation(r.url()) && r.request().method() !== 'GET', { timeout: 20_000 }), this.authSubmit().click()]);
		expect(response.status(), 'la request de vinculación debe retornar status 200').toBe(200);
	}
}
