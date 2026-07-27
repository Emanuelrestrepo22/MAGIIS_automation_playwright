/**
 * Factory parametrizada — Suite CFG · Configuración de pasarela en Magiis App Store.
 * ===================================================================================
 *
 * Seam S6 (carrier/gateway-standardization): `defineGatewayConfigSuite(gateway)` genera
 * los tests CFG (matriz TC1001..TC1008) para cualquier pasarela, gobernada por su adapter
 * declarativo (`helpers/adapters`) y el registry Xray local (`data/xray-keys.ts`).
 * Los consumidores por pasarela quedan THIN (1 llamada):
 *   - `specs/authorize/web/carrier/config/authorize-link-unlink.spec.ts` (5 casos base).
 *   - `specs/stripe/config/gateway-config.spec.ts` (casos genéricos + fixme OAuth en el consumidor).
 *   - `specs/ebizcharge/web/carrier/config/ebizcharge-link-unlink.spec.ts` (5 casos base).
 *
 * REGLAS load-bearing (trazabilidad emit-all del xray-reporter):
 *   1. Annotation `{type:'tms',description:<MG-key>}` POR TEST, resuelta del registry
 *      DENTRO del loop por caso. Key `null` → NO se emite annotation (unmapped visible;
 *      JAMÁS inventar keys).
 *   2. Título con el TC ID de matriz cuando existe: `[TS-<GW>-TCxxxx] @cfg Validar ...`.
 *      TC ID `null` (eBiz/MP sin matriz CFG) → título sin corchete.
 *   3. `test.skip(!adapter.isConfigured(), ...)` a nivel describe (gate de credenciales).
 *   4. Guard destructivo respetado: la suite entera skipea limpio sin
 *      `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` (todos los casos vinculan/desvinculan la
 *      pasarela activa del carrier 1521 → cleaningWallets en cascada).
 *   5. SIN locators en la factory (regla KATA): toda interacción va por el POM
 *      `AppStoreGatewaysPage` + el Step `GatewaySwitchSteps`.
 *
 * Capacidades por pasarela:
 *   - Casos que requieren LINK PROGRAMÁTICO (linkValid/linkInvalid/linkStatus) solo se
 *     generan para pasarelas con modal de credenciales modelado (authorize, ebizcharge).
 *     Pedirlos para stripe/mercado-pago lanza en tiempo de definición (error de consumo,
 *     no de runtime) — el consumidor stripe los mantiene `fixme` con nota (OAuth Connect).
 *   - Casos que requieren la pasarela ACTIVA (cancelUnlink/unlink/exclusivity/
 *     reloadPersistence): con driver de link usan `ensureActiveGateway` (idempotente);
 *     sin driver (stripe) skipean limpio si la pasarela no está vinculada ya.
 *
 * Login: `loginAsDispatcher(page)` default — la suite CFG opera sobre el carrier 1521
 * compartido (App Store único para las 4 pasarelas), igual que el spec Authorize F4.
 */

import type { GatewayName } from '@fixtures/gateways/_shared';
import type { GatewayCfgCase, XrayIssueKey } from '@features/gateway-pg/data/xray-keys';
import type { GatewayPgAdapter } from '@features/gateway-pg/helpers/adapters/types';

import { test, expect } from '@TestFixture';
import {
	AppStoreGatewaysPage,
	isGatewayDestructiveSwitchAllowed,
	type AuthorizeCreds,
	type EbizchargeCreds
} from '@ui/carrier';
import { GatewaySwitchSteps } from '@steps/index';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

/** Los 5 casos base de la suite CFG (los del spec Authorize F4 — cobertura de referencia). */
export const GATEWAY_CFG_BASE_CASES: GatewayCfgCase[] = ['linkValid', 'linkInvalid', 'unlink', 'exclusivity', 'linkStatus'];

/** Los 8 casos CFG en orden canónico de matriz (TC1001..TC1008). */
export const GATEWAY_CFG_ALL_CASES: GatewayCfgCase[] = [
	'viewUnlinked',
	'linkValid',
	'linkInvalid',
	'cancelUnlink',
	'unlink',
	'exclusivity',
	'reloadPersistence',
	'linkStatus'
];

/** Casos que exigen link programático (modal de credenciales modelado en el POM). */
const CASES_NEEDING_LINK_DRIVER: GatewayCfgCase[] = ['linkValid', 'linkInvalid', 'linkStatus'];

export type GatewayConfigSuiteOptions = {
	/** Casos a generar (default: los 5 base). Orden de generación = orden recibido. */
	cases?: GatewayCfgCase[];
};

/** Driver de link por pasarela — despacha a los wrappers del POM (keys @atc estructurales). */
type GatewayLinkDriver = {
	linkValid(appStore: AppStoreGatewaysPage): Promise<void>;
	linkInvalid(appStore: AppStoreGatewaysPage): Promise<void>;
	linkStatusOk(appStore: AppStoreGatewaysPage, adapter: GatewayPgAdapter): Promise<void>;
};

/** Credenciales sandbox Authorize de env (mismas keys que `adapter.authorize.credsEnvKeys`). */
function authorizeCredsFromEnv(): AuthorizeCreds {
	return {
		apiLoginId: process.env.AUTHORIZE_API_LOGIN_ID ?? '',
		transactionKey: process.env.AUTHORIZE_TRANSACTION_KEY ?? '',
		gatewayId: process.env.AUTHORIZE_GATEWAY_ID || undefined
	};
}

/** Credenciales merchant eBizCharge de env (mismas keys que `adapter.ebizcharge.credsEnvKeys`). */
function ebizchargeCredsFromEnv(): EbizchargeCreds {
	return {
		merchantUser: process.env.EBIZ_MERCHANT_USER ?? '',
		merchantPassword: process.env.EBIZ_MERCHANT_PASSWORD ?? '',
		securityKey: process.env.EBIZ_SECURITY_KEY ?? ''
	};
}

const INVALID_AUTHORIZE_CREDS: AuthorizeCreds = { apiLoginId: 'INVALID_LOGIN_ID', transactionKey: 'INVALID_TX_KEY' };
const INVALID_EBIZCHARGE_CREDS: EbizchargeCreds = {
	merchantUser: 'INVALID_MERCHANT_USER',
	merchantPassword: 'INVALID_MERCHANT_PASSWORD',
	securityKey: 'INVALID_SECURITY_KEY'
};

const LINK_DRIVERS: Partial<Record<GatewayName, GatewayLinkDriver>> = {
	authorize: {
		linkValid: appStore => appStore.linkAuthorize(authorizeCredsFromEnv()),
		linkInvalid: appStore => appStore.expectLinkRejected(INVALID_AUTHORIZE_CREDS),
		linkStatusOk: (appStore, adapter) =>
			appStore.expectLinkStatusOk(authorizeCredsFromEnv(), {
				successStatuses: adapter.linkSuccessStatuses,
				urlPattern: adapter.linkMutationUrlPattern
			})
	},
	ebizcharge: {
		linkValid: appStore => appStore.linkEbizcharge(ebizchargeCredsFromEnv()),
		linkInvalid: appStore => appStore.expectEbizchargeLinkRejected(INVALID_EBIZCHARGE_CREDS),
		linkStatusOk: (appStore, adapter) =>
			appStore.expectEbizchargeLinkStatusOk(ebizchargeCredsFromEnv(), {
				successStatuses: adapter.linkSuccessStatuses,
				urlPattern: adapter.linkMutationUrlPattern
			})
	}
	// stripe: OAuth Connect (sin modal de creds) — TODO F5. mercado-pago: modal sin modelar.
};

/** Título humano por caso (sin TC ID ni tags — se componen en `defineGatewayConfigSuite`). */
function caseTitle(cfgCase: GatewayCfgCase, adapter: GatewayPgAdapter): string {
	const name = adapter.displayName;
	switch (cfgCase) {
		case 'viewUnlinked':
			return `visualizar pasarela ${name} no vinculada`;
		case 'linkValid':
			return `vincular ${name} con credenciales válidas`;
		case 'linkInvalid':
			return `impedir vincular ${name} con credenciales inválidas`;
		case 'cancelUnlink':
			return `cancelar el popup de desvinculación sin desvincular ${name}`;
		case 'unlink':
			return `desvincular ${name}`;
		case 'exclusivity':
			return `exclusividad: con ${name} activa no se puede vincular otra pasarela`;
		case 'reloadPersistence':
			return `persistencia del estado vinculado de ${name} tras recargar`;
		case 'linkStatus':
			return `la request de link de ${name} retorna un status de éxito conocido (${adapter.linkSuccessStatuses.join('|')})`;
	}
}

/**
 * Precondición "pasarela activa": con driver de link delega en el switch idempotente;
 * sin driver (stripe/mp) NO puede vincular programáticamente → skip limpio si la
 * pasarela no está ya vinculada (en vez del throw de `ensureActiveGateway`).
 */
async function ensureActiveGatewayOrSkip(switcher: GatewaySwitchSteps, gateway: GatewayName, hasDriver: boolean): Promise<void> {
	if (hasDriver) {
		await switcher.ensureActiveGateway(gateway);
		return;
	}
	const active = await switcher.currentActiveGateway();
	test.skip(
		active !== gateway,
		`Precondición no automatizable: ${gateway} debe estar vinculada (link programático no disponible — OAuth/TODO) y la activa es '${active ?? 'ninguna'}'.`
	);
}

/**
 * Genera la suite CFG de `gateway`. Ver doc del módulo para reglas y capacidades.
 * Lanza en TIEMPO DE DEFINICIÓN si se piden casos de link para una pasarela sin driver.
 */
export function defineGatewayConfigSuite(gateway: GatewayName, options: GatewayConfigSuiteOptions = {}): void {
	const adapter = getGatewayPgAdapter(gateway);
	const registry = adapter.xrayKeys;
	const driver = LINK_DRIVERS[gateway];
	const cases = options.cases ?? GATEWAY_CFG_BASE_CASES;

	const unsupported = cases.filter(cfgCase => CASES_NEEDING_LINK_DRIVER.includes(cfgCase) && !driver);
	if (unsupported.length > 0) {
		throw new Error(
			`defineGatewayConfigSuite('${gateway}'): los casos [${unsupported.join(', ')}] requieren link programático ` +
				`y '${gateway}' no tiene modal de credenciales modelado (drivers: ${Object.keys(LINK_DRIVERS).join(', ')}). ` +
				'Mantenerlos fixme en el consumidor con nota (ver consumidor stripe).'
		);
	}

	test.describe(`Gateway PG · Carrier · Configuración Pasarela ${adapter.displayName} @gateway @${gateway} @cfg @regression`, () => {
		test.describe.configure({ mode: 'serial', timeout: 180_000 });
		// El fixture KATA no define la opción `role` — login explícito vía loginAsDispatcher.
		test.use({ storageState: { cookies: [], origins: [] } });

		test.skip(!adapter.isConfigured(), `Requiere ${adapter.credsEnvKeys.join(' + ')} en .env.test (gate del adapter ${gateway}).`);
		test.skip(
			!isGatewayDestructiveSwitchAllowed(),
			'Suite CFG DESTRUCTIVA (link/unlink de la pasarela activa del carrier 1521 → cleaningWallets en cascada): ' +
				'requiere GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true explícito (alias legacy AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH). ' +
				'Correr SOLO en ventana exclusiva.'
		);

		for (const cfgCase of cases) {
			const tcId = registry.cfgTcIds[cfgCase];
			const key: XrayIssueKey | null = registry.cfg[cfgCase];
			const title = `${tcId ? `[${tcId}] ` : ''}@cfg Validar ${caseTitle(cfgCase, adapter)}`;
			// Key null = sin issue Xray aún → SIN annotation (unmapped visible; no inventar keys).
			const details = key ? { annotation: [{ type: 'tms', description: key }] } : {};

			test(title, details, async ({ page }) => {
				const appStore = new AppStoreGatewaysPage({ page });
				const switcher = new GatewaySwitchSteps({ page });

				await test.step('Given: dispatcher logueado (carrier 1521, App Store compartido)', async () => {
					await loginAsDispatcher(page);
				});

				switch (cfgCase) {
					case 'viewUnlinked': {
						await test.step('Given: slot de pasarela libre (unlink de la activa si hay)', async () => {
							await switcher.unlinkActiveGateway();
						});
						await test.step(`Then: la card ${gateway} es visible y vinculable`, async () => {
							expect(await appStore.readState(gateway), `${gateway} debe mostrarse vinculable (no vinculada)`).toBe('linkable');
						});
						break;
					}
					case 'linkValid': {
						await test.step('Given: slot de pasarela libre', async () => {
							await switcher.unlinkActiveGateway();
							expect(await appStore.readState(gateway), `${gateway} debe quedar vinculable tras liberar el slot`).toBe('linkable');
						});
						await test.step('When: vinculo con credenciales válidas', async () => {
							await driver!.linkValid(appStore);
						});
						await test.step('Then: la card queda en estado vinculado', async () => {
							expect(await appStore.readState(gateway), `${gateway} debe quedar vinculada`).toBe('linked');
						});
						break;
					}
					case 'linkInvalid': {
						await test.step('Given: slot de pasarela libre', async () => {
							await switcher.unlinkActiveGateway();
							expect(await appStore.readState(gateway), `${gateway} debe estar vinculable`).toBe('linkable');
						});
						await test.step('When/Then: intento vincular con credenciales inválidas → rechazo controlado, gateway inactivo', async () => {
							await driver!.linkInvalid(appStore);
						});
						break;
					}
					case 'cancelUnlink': {
						await test.step(`Given: ${gateway} vinculada`, async () => {
							await ensureActiveGatewayOrSkip(switcher, gateway, Boolean(driver));
						});
						await test.step('When/Then: cancelo el popup de desvinculación → sigue vinculada', async () => {
							await appStore.cancelUnlink(gateway);
						});
						break;
					}
					case 'unlink': {
						await test.step(`Given: ${gateway} vinculada`, async () => {
							await ensureActiveGatewayOrSkip(switcher, gateway, Boolean(driver));
						});
						await test.step('When: desvinculo la pasarela', async () => {
							await appStore.unlinkGateway(gateway);
						});
						await test.step('Then: la card queda vinculable', async () => {
							expect(await appStore.readState(gateway), `${gateway} debe quedar vinculable tras desvincular`).toBe('linkable');
						});
						break;
					}
					case 'exclusivity': {
						await test.step(`Given: ${gateway} vinculada`, async () => {
							await ensureActiveGatewayOrSkip(switcher, gateway, Boolean(driver));
						});
						await test.step('Then: las otras pasarelas NO son vinculables ("No Disponible")', async () => {
							await appStore.expectExclusivity(gateway);
						});
						break;
					}
					case 'reloadPersistence': {
						await test.step(`Given: ${gateway} vinculada`, async () => {
							await ensureActiveGatewayOrSkip(switcher, gateway, Boolean(driver));
							expect(await appStore.readState(gateway), `${gateway} debe estar vinculada antes del reload`).toBe('linked');
						});
						await test.step('When: recargo el App Store', async () => {
							await appStore.reload();
						});
						await test.step('Then: el estado vinculado persiste tras el reload', async () => {
							expect(await appStore.readState(gateway), `${gateway} debe seguir vinculada tras recargar`).toBe('linked');
						});
						break;
					}
					case 'linkStatus': {
						await test.step('Given: slot de pasarela libre', async () => {
							await switcher.unlinkActiveGateway();
							expect(await appStore.readState(gateway), `${gateway} debe estar vinculable`).toBe('linkable');
						});
						await test.step('When/Then: la request de vinculación retorna un status de éxito conocido', async () => {
							await driver!.linkStatusOk(appStore, adapter);
						});
						break;
					}
				}
			});
		}
	});
}
