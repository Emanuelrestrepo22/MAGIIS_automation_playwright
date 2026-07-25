/**
 * TCs: TS-AUTHORIZE-TC1002 / TC1003 / TC1005 / TC1006 / TC1008 (docs/gateway-pg/authorize/matriz_cases.md §1)
 * Feature: Configuración de Pasarela Authorize.net en Magiis App Store — F4 · release gateway MG-178
 * Tags: @gateway @authorize @cfg @regression
 *
 * Arquitectura: reusa el switching cross-gateway (GatewaySwitchSteps — @steps) + el POM
 * AppStoreGatewaysPage (@ui/carrier). Login vía loginAsDispatcher(page) (carrier 1521).
 * Cada test se auto-cura la precondición con el switcher (idempotente), por eso el orden serial
 * no acopla estados entre tests.
 *
 * ⚠️⚠️ DESTRUCTIVO EN RUNTIME: vincular/desvincular Authorize desvincula la pasarela activa del
 * carrier 1521 → dispara cleaningWallets en cascada (borra la tarjeta 4242 del pax). Correr SÓLO
 * en ventana exclusiva. TEARDOWN MANUAL: al terminar, el carrier queda con Authorize vinculado y
 * la tarjeta del pax borrada — restaurar con `new GatewaySwitchSteps({ page }).restoreStripe()`
 * (hoy INCOMPLETO: OAuth Connect test-mode + re-seed de tarjeta pendientes, ver TODOs del Step).
 * NO se cablea en un afterAll a propósito (evita teardown destructivo en runs skipeados/parciales
 * y afterAll no expone el fixture `page`).
 *
 * GATE DE DATOS: requiere AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY en .env.test. Sin
 * ellas el describe entero se SKIPea limpio (mismo patrón que los contract specs authorize-sandbox).
 *
 * ✅ RECONCILIADO EN VIVO (HANDOFF-live-reconciliation-2026-07-24): selectores del modal Authorize
 * verificados (input[name="apiLoginKey"]/[name="transactionKey"], acción Link/Unlink, submit Continue,
 * click con toPass). QUIRK: el link válido devuelve HTTP 500 = CONECTADA (400 = NO) → MG-226 asevera
 * ese baseline + defect "500-en-éxito" (DEV/MX). El endpoint del link va por odnService (MG-476).
 */
import { test, expect } from '@TestFixture';
import { AppStoreGatewaysPage } from '@ui/carrier';
import { GatewaySwitchSteps } from '@steps/index';
import { hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

const validAuthorizeCreds = {
	apiLoginId: process.env.AUTHORIZE_API_LOGIN_ID ?? '',
	transactionKey: process.env.AUTHORIZE_TRANSACTION_KEY ?? '',
	gatewayId: process.env.AUTHORIZE_GATEWAY_ID || undefined
};

const invalidAuthorizeCreds = {
	apiLoginId: 'INVALID_LOGIN_ID',
	transactionKey: 'INVALID_TX_KEY'
};

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('Gateway PG · Carrier · Configuración Pasarela Authorize.net @gateway @authorize @cfg @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'Requiere AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY en .env.test (ver docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md §1).');

	test(
		'[TS-AUTHORIZE-TC1002] @cfg vincular Authorize con credenciales válidas',
		{
			annotation: [{ type: 'tms', description: 'MG-220' }]
		},
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });
			const switcher = new GatewaySwitchSteps({ page });

			await test.step('Given: dispatcher logueado + slot de pasarela libre (Authorize vinculable)', async () => {
				await loginAsDispatcher(page);
				await switcher.unlinkActiveGateway();
				expect(await appStore.readState('authorize'), 'Authorize debe quedar vinculable tras liberar el slot').toBe('linkable');
			});

			await test.step('When: vinculo Authorize con credenciales válidas', async () => {
				await appStore.linkAuthorize(validAuthorizeCreds);
			});

			await test.step('Then: la card Authorize queda en estado vinculado', async () => {
				expect(await appStore.readState('authorize'), 'Authorize debe quedar vinculada').toBe('linked');
			});
		}
	);

	test(
		'[TS-AUTHORIZE-TC1003] @cfg impedir vincular Authorize con credenciales inválidas (E00008)',
		{
			annotation: [{ type: 'tms', description: 'MG-221' }]
		},
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });
			const switcher = new GatewaySwitchSteps({ page });

			await test.step('Given: dispatcher logueado + Authorize vinculable', async () => {
				await loginAsDispatcher(page);
				await switcher.unlinkActiveGateway();
				expect(await appStore.readState('authorize'), 'Authorize debe estar vinculable').toBe('linkable');
			});

			await test.step('When/Then: intento vincular con credenciales inválidas → error E00008, gateway inactivo', async () => {
				await appStore.expectLinkRejected(invalidAuthorizeCreds);
			});
		}
	);

	test(
		'[TS-AUTHORIZE-TC1005] @cfg desvincular Authorize y ocultar método preautorizado',
		{
			annotation: [{ type: 'tms', description: 'MG-223' }]
		},
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });
			const switcher = new GatewaySwitchSteps({ page });

			await test.step('Given: Authorize vinculada (switch idempotente)', async () => {
				await loginAsDispatcher(page);
				await switcher.ensureActiveGateway('authorize');
				expect(await appStore.readState('authorize'), 'Authorize debe estar vinculada').toBe('linked');
			});

			await test.step('When: desvinculo Authorize', async () => {
				await appStore.unlinkGateway('authorize');
			});

			await test.step('Then: la card queda vinculable', async () => {
				expect(await appStore.readState('authorize'), 'Authorize debe quedar vinculable tras desvincular').toBe('linkable');
				// TODO F4+: verificar en Alta de Viaje que el método "Tarjeta Preautorizada" ya NO se
				// ofrece (requiere un método de aserción en CarrierNewTravelPage — fuera de alcance F4).
			});
		}
	);

	test(
		'[TS-AUTHORIZE-TC1006] @cfg exclusividad: con Authorize activo no se puede vincular otra pasarela',
		{
			annotation: [{ type: 'tms', description: 'MG-224' }]
		},
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });
			const switcher = new GatewaySwitchSteps({ page });

			await test.step('Given: Authorize vinculada (switch idempotente)', async () => {
				await loginAsDispatcher(page);
				await switcher.ensureActiveGateway('authorize');
				expect(await appStore.readState('authorize'), 'Authorize debe estar vinculada').toBe('linked');
			});

			await test.step('Then: las otras pasarelas de pago NO son vinculables ("No Disponible")', async () => {
				await appStore.expectExclusivity('authorize');
			});
		}
	);

	test(
		'[TS-AUTHORIZE-TC1008] @cfg la request de link/unlink retorna un status de éxito conocido (500|409) + auditoría',
		{
			annotation: [{ type: 'tms', description: 'MG-226' }]
		},
		async ({ page }) => {
			const appStore = new AppStoreGatewaysPage({ page });
			const switcher = new GatewaySwitchSteps({ page });

			await test.step('Given: dispatcher logueado + Authorize vinculable', async () => {
				await loginAsDispatcher(page);
				await switcher.unlinkActiveGateway();
				expect(await appStore.readState('authorize'), 'Authorize debe estar vinculable').toBe('linkable');
			});

			await test.step('When/Then: la request de vinculación retorna un status de éxito conocido (500|409)', async () => {
				await appStore.expectLinkStatusOk(validAuthorizeCreds);
			});
		}
	);
});
