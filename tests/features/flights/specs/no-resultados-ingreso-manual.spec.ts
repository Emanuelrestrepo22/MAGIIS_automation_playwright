// tests/features/flights/specs/no-resultados-ingreso-manual.spec.ts
//
// Feature `flights` — TC17 (Bloque D, ATP MX-6120): getFlights sin resultados.
// Al buscar una aerolínea + un número de vuelo INEXISTENTE, getFlights responde 200 con `[]`
// (resultado vacío = 200 normal, NO error). El modal "Información de Vuelo" muestra
// "No se encontraron vuelos con esas características" y ofrece el botón "Ingreso Manual".
// Comportamiento validado en vivo contra UAT v1.72.6 (carrier 1040, AVIATION vinculada).
//
// Fixture de provisión (sin `new`) + login desacoplado (auth) + data propia.
// REQUISITOS DE EJECUCIÓN: UAT arriba + carrier con app Vuelos (AVIATION) vinculada.

import { test } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

test.describe(`[FLIGHT][${env.toUpperCase()}] getFlights sin resultados → Ingreso Manual — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// locale es-AR: la app MAGIIS renderiza en inglés por defecto para este usuario en UAT;
	// los locators de la suite son en español. Forzamos el locale del browser a español.
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] }, locale: 'es-AR' });

	test('@flight @carrier @negative [TS-MX5824-TC17] Búsqueda sin resultados muestra "No se encontraron vuelos" + "Ingreso Manual"', async ({
		page,
		dashboard,
		travel,
		travelForm,
		flightModal
	}) => {
		await test.step(`Given: dispatcher logueado en carrier (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: formulario de nuevo viaje con destino = aeropuerto', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			// Helper propio de vuelos (typeahead real; el origen auto-completa del cliente).
			await travelForm.selectClient(FLIGHT_TEST_DATA.clientSearch, FLIGHT_TEST_DATA.clientOption);
			await travelForm.setAirportDestination(FLIGHT_TEST_DATA.destinationSearch, FLIGHT_TEST_DATA.airportOption);
		});

		await test.step('When: se busca una aerolínea + número de vuelo inexistente', async () => {
			await flightModal.open();
			await flightModal.searchExpectingNoResults(
				FLIGHT_TEST_DATA.airlineQuery,
				FLIGHT_TEST_DATA.airlineLabel,
				FLIGHT_TEST_DATA.missingFlightNumber
			);
		});

		await test.step('Then: el modal ofrece el ingreso manual (aserción dentro del POM)', async () => {
			debugLog(
				'flight',
				`[TC17] getFlights 200 [] → "No se encontraron vuelos" + "Ingreso Manual" en ${env.toUpperCase()} ✅`
			);
		});
	});
});
