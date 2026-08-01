/**
 * TCs: TS-STRIPE-P2-TC060–TC065
 * Feature: Reactivación de Viajes Cancelados — Carrier
 * Tags: @regression @web-only
 *
 * MG-178 FASE 2 — alcance acotado: se implementa TS-STRIPE-P2-TC060 (reactivación de viaje
 * cancelado pagado con TARJETA PREAUTORIZADA / hold) como caso ancla verde, reutilizando la
 * maquinaria de hold (`CarrierReactivationSteps`). El resto (sin hold / variantes / 3DS) queda
 * diferido como DEUDA TÉCNICA para la próxima iteración de cambios en pasarelas de pago.
 *
 * Datos: se usa app pax (conocido-estable, mismo dataset que apppax-hold-no3ds). La variante
 * "Empresa Individuo" original tiene data-init defectuosa (MG-178 gap #5) → diferida.
 * KATA conformance: test del fixture KATA (@TestFixture); orquestación en `CarrierReactivationSteps`
 * (@steps); acción de reactivación mapeada a MG-440 en `CarrierTravelManagementPage` (pendiente reasignar).
 */
import { test } from '@TestFixture';
import { CarrierReactivationSteps } from '@steps/index';
import { TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

// El fixture KATA no define `role` (login explícito vía loginAsDispatcher en el Step).
test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier — Reactivación de Viajes Cancelados @gateway @stripe @hold @regression', () => {
	test.describe('Sin 3DS', () => {
		test('[TS-STRIPE-P2-TC060] @regression @hold reactivación cancelado hold+cobro', async ({ page }) => {
			test.setTimeout(240_000); // flujo real (alta + hold + cancelación + reactivación) es lento en TEST
			await new CarrierReactivationSteps({ page }).runReactivateCancelledPreauth({
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination
			});
		});

		test('[TS-STRIPE-P2-TC061] @regression sin hold reactivación cancelado', async () => {
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: reactivación SIN hold no usa tarjeta preautorizada; diferido a próxima iteración de cambios en pasarelas.'
			);
		});

		test('[TS-STRIPE-P2-TC062] @regression @hold reactivación cancelado hold+cobro variante', async () => {
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: variante diferida; el flujo base de reactivación preautorizada queda cubierto por TC060 (reusa CarrierReactivationSteps).'
			);
		});

		test('[TS-STRIPE-P2-TC063] @regression sin hold reactivación cancelado variante', async () => {
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: reactivación SIN hold; diferido a próxima iteración de cambios en pasarelas.'
			);
		});
	});

	test.describe('Con 3DS', () => {
		test('[TS-STRIPE-P2-TC064] @regression @3ds @hold reactivación cancelado hold+cobro 3DS', async () => {
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: reactivación con 3DS diferida a próxima iteración de pasarelas (flujo hold base en TC060).'
			);
		});

		test('[TS-STRIPE-P2-TC065] @regression @3ds sin hold reactivación cancelado 3DS', async () => {
			test.fixme(
				true,
				'DEUDA TÉCNICA MG-178: reactivación SIN hold + 3DS; diferido a próxima iteración de cambios en pasarelas.'
			);
		});
	});
});
