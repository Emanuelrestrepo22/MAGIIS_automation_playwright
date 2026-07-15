// tests/features/gateway-pg/fixtures/pom.fixtures.ts
//
// Fixture de PROVISIÓN de POMs para la feature gateway-pg (Fase C, 2026-07-14).
// Extiende TestBase (role/credentials/loginPage/apiClient) y agrega los Page Objects del
// journey de gateway ya instanciados, para que las specs dejen de hacer `const x = new X(page)`.
// Playwright los crea PEREZOSAMENTE (solo si la spec destructura el fixture) → sin costo si no se usan.
//
// Nombrado `.fixtures.ts` (NO `.test.ts`) a propósito: el config base (`playwright.config.ts`,
// testDir ./tests) usa el testMatch por defecto que recolecta `*.test.ts` — un fixture no es un test.
//
// Adopción INCREMENTAL: una spec migra cambiando `import { test } from '../../../TestBase'` por este
// archivo y destructurando `{ dashboard, travel, management, threeDS, ... }`. Las specs no migradas
// siguen usando TestBase + `new` sin cambios.
import { test as base, expect } from '../../../TestBase';
import {
	DashboardPage,
	NewTravelPage,
	TravelManagementPage,
	OperationalPreferencesPage,
	TravelDetailPage,
} from '../../../pages/carrier';
import { ContractorNewTravelPage } from '../../../pages/contractor/NewTravelPage';
import { ThreeDSModal, ThreeDSErrorPopup } from '../pages';

type GatewayPomFixtures = {
	dashboard: DashboardPage;
	travel: NewTravelPage;
	contractorTravel: ContractorNewTravelPage;
	management: TravelManagementPage;
	preferences: OperationalPreferencesPage;
	travelDetail: TravelDetailPage;
	threeDS: ThreeDSModal;
	threeDSError: ThreeDSErrorPopup;
};

export const test = base.extend<GatewayPomFixtures>({
	dashboard: async ({ page }, use) => {
		await use(new DashboardPage(page));
	},
	travel: async ({ page }, use) => {
		await use(new NewTravelPage(page));
	},
	contractorTravel: async ({ page }, use) => {
		await use(new ContractorNewTravelPage(page));
	},
	management: async ({ page }, use) => {
		await use(new TravelManagementPage(page));
	},
	preferences: async ({ page }, use) => {
		await use(new OperationalPreferencesPage(page));
	},
	travelDetail: async ({ page }, use) => {
		await use(new TravelDetailPage(page));
	},
	threeDS: async ({ page }, use) => {
		await use(new ThreeDSModal(page));
	},
	threeDSError: async ({ page }, use) => {
		await use(new ThreeDSErrorPopup(page));
	},
});

export { expect };
