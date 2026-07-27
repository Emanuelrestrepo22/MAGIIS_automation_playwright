// MP-NOHOLD-02 · portal Carrier, colaborador de contractor — alta de viaje SIN hold (ARG, TEST)
// Convertido del recording test-16.spec.ts (2026-07-22). Cliente = contractor "QA Idea Flight",
// pasajero = colaborador "Emanuel Restrepo". Alcance TEST aprobado por negocio: llega a creación
// del viaje ("Buscando chofer"); el cobro desde el driver NO se valida aquí (gap conocido → UAT).
//
// MIGRADO a `CarrierHoldSteps.runHoldScenario` (S7, carrier/gateway-standardization) — misma
// cobertura, journey delegado al Step KATA con `gateway: 'mercado-pago'`:
//   - Hold OFF vía API (equivalente al toggle UI del recording) SIN restaurar (`restoreHold:false`).
//   - Tarjeta APRO vía resolver cross-gateway + form nativo Angular + skip si la validación
//     no completa en TEST (sandbox MP no transacciona — UAT-only).
//   - 3DS: MP no lo soporta → se asevera la AUSENCIA del modal.
//
// ⚠️ DRAFT: locators FRAGILE del form MP (NativeAngularCardForm) pendientes de corrida viva.
import { test } from '@TestFixture';
import { CarrierHoldSteps } from '@steps/index';

const env = process.env.ENV ?? 'test';

// Datos TEST propios de este escenario (cliente contractor + colaborador — no son defaults).
const MP_CLIENT = 'QA Idea Flight'; // cliente (contractor)
const MP_COLABORADOR = 'Emanuel Restrepo'; // pasajero/colaborador → grilla muestra "Restrepo, Emanuel"
const MP_ORIGIN = 'Avenida Cabildo 990, Buenos Aires';
const MP_DESTINATION = 'Cazadores 1987, Buenos Aires';

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · Carrier colaborador`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// El fixture KATA (@TestFixture) no define la opción `role` — login explícito en el Step.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway @gateway-pg @mercadopago @carrier @no-hold @happy [MP-NOHOLD-02] Colaborador de contractor · alta sin hold con tarjeta APRO → "Buscando chofer"', async ({ page }) => {
		await new CarrierHoldSteps({ page }).runHoldScenario(
			{
				gateway: 'mercado-pago',
				client: MP_CLIENT,
				passenger: MP_COLABORADOR,
				origin: MP_ORIGIN,
				destination: MP_DESTINATION,
			},
			{
				hold: 'off',
				restoreHold: false, // el spec original dejaba el hold OFF (no lo restauraba)
				threeDs: false,
				useCardFlow: false,
				trackTravelId: false,
				waitForCreation: false,
				waitForVehicleReady: true,
				matchDestination: false,
				expectStatus: 'Buscando chofer',
			},
		);
	});
});
