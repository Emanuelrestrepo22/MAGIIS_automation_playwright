// tests/features/flights/specs/aceptar-habilitacion.spec.ts
//
// Feature `flights` — TC10 (bloque TC-07, ATP MX-6120): tabla de decisión del binding `disabled`
// del botón "Aceptar" del modal "Información de Vuelo".
//   modal-flights.component.html:230 → disabled = (flightIata=='') && (manualValidity==false || (!radioNational && !radioInternational))
//
// Eje central (determinista, validado en vivo UAT v1.72.6):
//   - Modal recién abierto (sin vuelo API + sin ingreso manual) → Aceptar DESHABILITADO.
//   - Vuelo API seleccionado del listado (flightIata != '')             → Aceptar HABILITADO.
//
// NOTE: las filas de MODO MANUAL de la tabla (número + Arribos/Partidas) requieren entrar por
// "Ingreso Manual" (solo aparece tras un getFlights 200 []); los helpers `enterManualMode`,
// `setFlightNumber` y `selectDirection` del POM las cubren, pero se dejan fuera de las aserciones
// automatizadas hasta iterar en vivo (evita falsos rojos por la mecánica de manualValidity).
//
// Fixture de provisión (sin `new`) + login desacoplado (auth) + data propia.
// REQUISITOS DE EJECUCIÓN: UAT arriba + carrier con app Vuelos (AVIATION) vinculada.

import { test, expect } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

test.describe(`[FLIGHT][${env.toUpperCase()}] Habilitación de "Aceptar" (tabla de decisión) — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// locale es-AR: la app renderiza en inglés por defecto para este usuario en UAT; los locators
	// de la suite son en español. Forzamos el locale del browser a español (verificado green TC17).
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] }, locale: 'es-AR' });

	test('@flight @carrier @decision-table [TS-MX5824-TC10] "Aceptar" deshabilitado sin vuelo → habilitado al seleccionar un vuelo API', async ({ page, dashboard, travel, travelForm, flightModal }) => {
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

		await test.step('When: se abre el modal — Then: "Aceptar" está DESHABILITADO (fila flightIata="" sin manual)', async () => {
			await flightModal.open();
			await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(false);
		});

		await test.step('When: se selecciona un vuelo API — Then: "Aceptar" se HABILITA (fila flightIata!="")', async () => {
			await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
			await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
			await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(true);
			debugLog('flight', `[TC10] Aceptar disabled→enabled según selección de vuelo API en ${env.toUpperCase()} ✅`);
		});
	});
});
