// tests/features/flights/specs/alta-viaje-con-vuelo.spec.ts
//
// Feature `flights` — alta de viaje con vuelo asociado (Carrier V1). Ref:
// `../recorded/alta-viaje-con-vuelo.recorded.ts`. Cubre MX-5824/5825/5826 (ATP MX-6120).
//
// Fase C: usa el fixture de PROVISIÓN (`../fixtures/flights.test` → POMs inyectados, sin `new`),
// el LOGIN DESACOPLADO desde la capa auth compartida, y DATOS PROPIOS de la feature. Sin
// acoplamiento a la feature gateway.
//
// REQUISITOS DE EJECUCIÓN: UAT arriba + carrier con app Vuelos (AVIATION) vinculada
// (getFlights = proxy AeroAPI). Pendiente de validación en vivo (UAT caído al codificar).
// La selección del vuelo del listado es recorder-derived.

import { test } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

test.describe(`[FLIGHT][${env.toUpperCase()}] Alta de viaje con vuelo — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@flight @carrier @happy [TS-MX5824-ALTA-VUELO] Alta de viaje con vuelo asociado → visible en Gestión de Viajes', async ({
		page,
		dashboard,
		travel,
		flightModal,
		management
	}) => {
		await test.step(`Given: dispatcher logueado en carrier (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('When: formulario de nuevo viaje abierto', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: cliente, origen y destino = aeropuerto completados', async () => {
			await travel.selectClient(FLIGHT_TEST_DATA.client);
			await travel.setOrigin(FLIGHT_TEST_DATA.origin);
			await travel.setDestination(FLIGHT_TEST_DATA.airportDestination);
		});

		await test.step('And: vuelo asociado vía modal "Información de Vuelo"', async () => {
			await flightModal.open();
			await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
			await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
			await flightModal.accept();
		});

		await test.step('And: vehículo seleccionado y servicio enviado', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: viaje visible en Gestión de Viajes ("Buscando chofer")', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(FLIGHT_TEST_DATA.client, undefined, 'Buscando chofer');
			debugLog('flight', `[ALTA-VUELO] Viaje con vuelo asociado creado en ${env.toUpperCase()} ✅`);
		});
	});
});
