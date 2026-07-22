// tests/features/flights/fixtures/pom.fixtures.ts
//
// Fixture de PROVISIÓN de POMs para la feature flights (Fase C, 2026-07-14).
// Extiende TestBase y agrega los POMs del alta/edición de viaje con vuelo ya instanciados
// (formulario + detalle de viaje compartidos + modal de vuelo propio de la feature). Playwright
// los crea perezosamente. Las specs de flights importan `test` desde acá y destructuran los POMs,
// sin `new`.
//
// Nombrado `.fixtures.ts` (NO `.test.ts`) para NO ser recolectado por el testMatch por defecto
// del config base.
import { test as base, expect } from '../../../TestBase';
import { DashboardPage, NewTravelPage, TravelManagementPage, TravelDetailPage } from '../../../pages/carrier';
import { FlightInfoModal, CarrierTravelForm } from '../pages';

type FlightsFixtures = {
	dashboard: DashboardPage;
	travel: NewTravelPage;
	management: TravelManagementPage;
	travelDetail: TravelDetailPage;
	flightModal: FlightInfoModal;
	travelForm: CarrierTravelForm;
};

export const test = base.extend<FlightsFixtures>({
	dashboard: async ({ page }, use) => {
		await use(new DashboardPage(page));
	},
	travel: async ({ page }, use) => {
		await use(new NewTravelPage(page));
	},
	management: async ({ page }, use) => {
		await use(new TravelManagementPage(page));
	},
	travelDetail: async ({ page }, use) => {
		await use(new TravelDetailPage(page));
	},
	flightModal: async ({ page }, use) => {
		await use(new FlightInfoModal(page));
	},
	travelForm: async ({ page }, use) => {
		await use(new CarrierTravelForm(page));
	}
});

export { expect };
