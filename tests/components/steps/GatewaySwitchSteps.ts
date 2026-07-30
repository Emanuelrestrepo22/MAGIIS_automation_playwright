/**
 * KATA Steps (orquestador de flujo) — Carrier · Switch de Pasarela de pago (App Store).
 *
 * Orquesta el cambio de pasarela activa del carrier reutilizando el POM
 * `AppStoreGatewaysPage` (@ui/carrier). Es la fundación reusable para las suites UI
 * cross-gateway (Authorize / eBizCharge) que sólo son viables switcheando desde Stripe
 * por la regla de exclusividad "una sola pasarela activa por carrier".
 *
 * ⚠️⚠️ DESTRUCTIVO EN RUNTIME — LEER ANTES DE EJECUTAR ⚠️⚠️
 * `ensureActiveGateway` / `unlinkActiveGateway` DESVINCULAN la pasarela activa del carrier
 * (por defecto el carrier 1521, Remises EEUU). Desvincular dispara **cleaningWallets en
 * cascada**: borra las tarjetas guardadas del pax (p.ej. la 4242). Consecuencias:
 *   - Correr SÓLO en una ventana exclusiva (nadie más usando el carrier 1521).
 *   - Requiere credenciales sandbox en `.env.test` (AUTHORIZE_* / EBIZ_*).
 *   - El teardown `restoreStripe()` re-vincula Stripe, pero HOY está INCOMPLETO (ver TODOs:
 *     falta el OAuth Connect test-mode y el re-seed de la tarjeta del pax). Hasta cerrarlos,
 *     la restauración es MANUAL.
 * Nada de esto corre solo: el spec que lo consume gatea por creds (test.skip) y el switching
 * sólo ocurre cuando un humano ejecuta la suite con el ambiente preparado.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase (usa `this.page`); instancia el POM internamente con `{ page: this.page }`.
 *   - Import por alias (@TestContext, @TestFixture, @ui) — sin relativos.
 *   - Orquesta ATC del POM (linkAuthorize / unlinkGateway); NO redecora TCs.
 *   - Credenciales SIEMPRE de env (nunca hardcodear).
 */

import type { TestContextOptions } from '@TestContext';

import { test } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { AppStoreGatewaysPage, type AuthorizeCreds, type EbizchargeCreds, type GatewayCompany } from '@ui/carrier';

/** Pasarelas que el switcher sabe manejar (alias de GatewayCompany). */
export type SwitchableGateway = GatewayCompany;

const ALL_GATEWAYS: SwitchableGateway[] = ['stripe', 'authorize', 'ebizcharge', 'mercado-pago'];

export class GatewaySwitchSteps extends UiBase {
	readonly appStore: AppStoreGatewaysPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.appStore = new AppStoreGatewaysPage({ page: this.page });
	}

	/** Lee las credenciales Authorize de env. Lanza si faltan (el spec ya gatea con test.skip). */
	private authorizeCredsFromEnv(): AuthorizeCreds {
		const apiLoginId = process.env.AUTHORIZE_API_LOGIN_ID ?? '';
		const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY ?? '';
		if (!apiLoginId || !transactionKey) {
			throw new Error('Faltan AUTHORIZE_API_LOGIN_ID / AUTHORIZE_TRANSACTION_KEY en .env.test ' + '(ver docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md §1).');
		}
		return { apiLoginId, transactionKey, gatewayId: process.env.AUTHORIZE_GATEWAY_ID || undefined };
	}

	/**
	 * Lee las credenciales merchant eBizCharge de env (mismas keys que declara el adapter
	 * `ebizcharge.credsEnvKeys` — helpers/adapters). Lanza si faltan (el spec gatea con
	 * `test.skip(!adapter.isConfigured(), ...)` antes de llegar acá).
	 */
	private ebizchargeCredsFromEnv(): EbizchargeCreds {
		const merchantUser = process.env.EBIZ_MERCHANT_USER ?? '';
		const merchantPassword = process.env.EBIZ_MERCHANT_PASSWORD ?? '';
		const securityKey = process.env.EBIZ_SECURITY_KEY ?? '';
		if (!merchantUser || !merchantPassword || !securityKey) {
			throw new Error('Faltan EBIZ_MERCHANT_USER / EBIZ_MERCHANT_PASSWORD / EBIZ_SECURITY_KEY en .env.test (ver .env.example y el adapter ebizcharge.credsEnvKeys).');
		}
		return { merchantUser, merchantPassword, securityKey };
	}

	/** Navega al App Store y devuelve la pasarela actualmente vinculada (o null). */
	async currentActiveGateway(): Promise<SwitchableGateway | null> {
		await this.appStore.goto();
		for (const gateway of ALL_GATEWAYS) {
			if ((await this.appStore.readState(gateway)) === 'linked') return gateway;
		}
		return null;
	}

	/**
	 * Desvincula la pasarela actualmente activa (si hay). Deja el carrier sin pasarela y las
	 * cards en "Vincular" — libera el slot de exclusividad para poder vincular otra.
	 * ⚠️ DESTRUCTIVO: dispara cleaningWallets. Devuelve la pasarela desvinculada (o null).
	 */
	async unlinkActiveGateway(): Promise<SwitchableGateway | null> {
		const active = await this.currentActiveGateway();
		if (!active) return null;

		await test.step(`Desvincular pasarela activa (${active}) — DESTRUCTIVO (cleaningWallets)`, async () => {
			await this.appStore.unlinkGateway(active);
		});

		return active;
	}

	/**
	 * Idempotente: garantiza que `gateway` sea la pasarela activa del carrier.
	 *   - Ya activa → no-op.
	 *   - Otra activa → la desvincula (DESTRUCTIVO) y vincula la target (creds de env).
	 * Implementadas: `authorize` (F4) y `ebizcharge` (S5 — FRAGILE: modal eBiz sin verificar live).
	 * stripe (OAuth Connect = live F5) y mercado-pago lanzan (TODO).
	 */
	async ensureActiveGateway(gateway: SwitchableGateway): Promise<void> {
		const active = await this.currentActiveGateway();
		if (active === gateway) return;

		await test.step(`Switch de pasarela: ${active ?? 'ninguna'} → ${gateway}`, async () => {
			if (active) await this.appStore.unlinkGateway(active);
			switch (gateway) {
				case 'authorize':
					await this.appStore.linkAuthorize(this.authorizeCredsFromEnv());
					break;
				case 'ebizcharge':
					// S5 — mismo patrón que linkAuthorize (modal de creds); creds del adapter
					// ebizcharge (EBIZ_*). FRAGILE/TODO(live): selectores del modal sin confirmar.
					await this.appStore.linkEbizcharge(this.ebizchargeCredsFromEnv());
					break;
				case 'stripe':
					// TODO F5: restaurar Stripe vía Connect test-mode (portar el OAuth loop de
					// agentic-qa-boilerplate/tests/gateway-legacy/link-stripe-gateway.test.ts).
					throw new Error('ensureActiveGateway(stripe) no implementado — requiere OAuth Connect test-mode (TODO F5).');
				case 'mercado-pago':
					throw new Error('ensureActiveGateway(mercado-pago) no implementado — fuera de alcance F4.');
			}
		});
	}

	/**
	 * Teardown: restaura Stripe como pasarela activa del carrier.
	 * ⚠️ DESTRUCTIVO + INCOMPLETO: hoy `ensureActiveGateway('stripe')` lanza (OAuth pendiente),
	 * por eso se atrapa y se registra un aviso de RESTAURACIÓN MANUAL en vez de romper el run.
	 * TODOs para cerrarlo:
	 *   - Implementar el switch a Stripe vía Connect test-mode (TODO F5 en ensureActiveGateway).
	 *   - Re-seed de la tarjeta 4242 del pax (cleaningWallets la borró al desvincular) —
	 *     confirmar el helper de alta de tarjeta (wallet add-card) antes de habilitar.
	 *
	 * ── DEUDA DE CONVENCIÓN (documentada 2026-07-29) ─────────────────────────────────────────
	 * El resto de la capa Steps auto-limpia con `try/finally` DENTRO del propio orquestador
	 * (`CarrierHoldSteps.runHoldScenario`, `ContractorHoldSteps.runColaboradorScenario`,
	 * `CargoABordoSteps.runCargoScenario`): el caller no puede olvidarse del cleanup. Acá, en
	 * cambio, el restore es un método público SEPARADO que el spec debe acordarse de invocar — y
	 * es justamente el Step cuyas operaciones son destructivas sobre estado COMPARTIDO (carrier
	 * 1521), donde olvidarse duele más.
	 *
	 * NO se convierte al patrón self-cleaning todavía a propósito: mientras `restoreStripe()` siga
	 * incompleto (los dos TODOs de arriba), envolverlo en un `try/finally` automático haría que
	 * CADA spec que switchee pasarela emita el warning de "RESTAURACIÓN MANUAL" — ruido sin
	 * beneficio, porque el restore real no ocurre.
	 *
	 * CRITERIO DE CIERRE: cuando el OAuth Connect test-mode + el re-seed de tarjeta estén
	 * implementados, mover la restauración a un `try/finally` dentro de `ensureActiveGateway`
	 * (o de un wrapper `withGateway(gateway, fn)`), convergiendo con los otros tres Steps.
	 */
	async restoreStripe(): Promise<void> {
		await test.step('Teardown: restaurar Stripe (DESTRUCTIVO / INCOMPLETO)', async () => {
			try {
				await this.ensureActiveGateway('stripe');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				// eslint-disable-next-line no-console -- aviso deliberado de teardown manual
				console.warn(`⚠️ RESTAURACIÓN MANUAL REQUERIDA: el carrier quedó SIN Stripe activo. ${message} ` + 'Re-vincular Stripe y re-seed de la tarjeta del pax manualmente en la ventana exclusiva.');
			}
		});
	}
}
