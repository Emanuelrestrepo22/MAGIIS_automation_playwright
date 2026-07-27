// MP-NOHOLD · cliente individuo — alta de viaje SIN hold (carrier ARG, TEST)
// Convertido del recording test-14.spec.ts (2026-07-22). Alcance TEST aprobado por negocio:
// el alta sin hold llega a creación del viaje; el cobro desde el driver NO se valida aquí
// (no completa en TEST — gap conocido → UAT con tarjetas reales).
//
// MIGRADO a `CarrierHoldSteps.runHoldScenario` (S7, carrier/gateway-standardization) — misma
// cobertura, journey delegado al Step KATA con `gateway: 'mercado-pago'`:
//   - Login dispatcher con creds chain MP · hold OFF vía API (equivalente al toggle UI del
//     recording) SIN restaurar al final (`restoreHold: false`, como el spec original).
//   - Cliente individuo 'Emanuel mercadopago' auto-asigna pasajero y ORIGEN (sin `origin`).
//   - Tarjeta vía `resolveCard({gateway:'mercado-pago',intent:'HAPPY_NO_AUTH'})` (holder APRO,
//     trigger del outcome) + `cardFormFor` (form nativo Angular) + skip si la validación no
//     completa en TEST (sandbox MP no transacciona — UAT-only).
//   - 3DS: MP no lo soporta (`adapter.requires3ds=false`) → se asevera la AUSENCIA del modal.
//
// ⚠️ DRAFT: locators FRAGILE del form MP (NativeAngularCardForm) pendientes de corrida viva.
import { test } from '@TestFixture';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { CarrierHoldSteps } from '@steps/index';

const env = process.env.ENV ?? 'test';
const MP = journeyDefaultsFor('mercado-pago');

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · cliente individuo`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// El fixture KATA (@TestFixture) no define la opción `role` — login explícito en el Step.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway-pg @mercado-pago @carrier @no-hold @happy [MP-NOHOLD-CLIENTE-INDIVIDUO] Alta sin hold con tarjeta APRO → "Buscando chofer"', async ({ page }) => {
		await new CarrierHoldSteps({ page }).runHoldScenario(
			{
				gateway: 'mercado-pago',
				client: MP.client, // 'Emanuel mercadopago' (id=10785) — auto-asigna pasajero y origen
				passenger: MP.client, // la grilla de gestión muestra el nombre del cliente
				destination: MP.destination, // Reconquista 661 (sin origin: auto del cliente individuo)
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
