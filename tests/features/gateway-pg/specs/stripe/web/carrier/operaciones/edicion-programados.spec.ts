/**
 * TCs: TS-STRIPE-P2-TC078-TC083
 * Feature: Edicion de Viajes Programados - Carrier - Empresa Individuo
 * Tags: @regression @web-only
 *
 * KATA conformance (feature/kata-conformance): amoldado al patrón de hold/cargo.
 *   - test/expect del fixture KATA (@TestFixture); orquestación del flujo de edición en
 *     `CarrierTravelEditSteps.runScheduledTripCardEdit` (@steps); Page components @ui/carrier
 *     (`CarrierTravelManagementPage`, `CarrierTravelDetailPage`) + 3DS @ui
 *     (`ThreeDsChallengePage`, `ThreeDsErrorPopup`).
 * ATCs mapeados en las Page components (área EDIT del idmap): linkAndValidatePreauthorizedCard
 *   → MG-415, confirmLinkedCardAndSave → MG-416, 3DS success/fail → MG-152/153.
 *   mapeo por área aceptado (idmap sin 1:1 entre TS-STRIPE-P2-TC078xx UI y TC-PAY-EDIT-*).
 */
import { test } from '@TestFixture';
import { CarrierTravelEditSteps } from '@steps/index';

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });
test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · Empresa Individuo - Edicion de Viajes Programados @gateway @stripe @hold @3ds @regression', () => {
	test('[TS-STRIPE-P2-TC078] @regression @hold alta + edicion hold+cobro', async ({ page }) => {
		test.setTimeout(180_000);
		await new CarrierTravelEditSteps({ page }).runScheduledTripCardEdit();
	});

	test.describe('Sin 3DS', () => {
		test('[TS-STRIPE-P2-TC079] @regression sin hold alta + edicion', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC080] @regression @hold alta + edicion hold+cobro variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC081] @regression sin hold alta + edicion variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
	});

	test.describe('Con 3DS', () => {
		test('[TS-STRIPE-P2-TC082] @regression @3ds @hold clonacion finalizado hold+cobro 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
		test('[TS-STRIPE-P2-TC083] @regression @3ds sin hold clonacion finalizado 3DS', async () => {
			test.fixme(true, 'PENDIENTE: depende de P2-TC078');
		});
	});
});
