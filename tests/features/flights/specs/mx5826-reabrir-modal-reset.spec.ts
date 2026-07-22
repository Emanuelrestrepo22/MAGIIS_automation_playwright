// tests/features/flights/specs/mx5826-reabrir-modal-reset.spec.ts
//
// Feature `flights` — MX-5826 (release v1.72.6 / 17080): "Estado del vuelo persiste al limpiar
// el modal". Defecto: tras asociar un vuelo, eliminarlo (🗑️ "Eliminar vuelo") y REABRIR el modal
// "Información de Vuelo", el modal reaparece con la aerolínea del vuelo eliminado y "Aceptar"
// HABILITADO (y al Aceptar reasocia el vuelo borrado). Esperado tras fix: modal RESETEADO
// (placeholder "Seleccione Aerolínea" + "Aceptar" DESHABILITADO).
//
// Reusa el POM `FlightInfoModal` (open/searchAirline/selectFlightByLabel/accept/
// deleteAssociatedFlight/isAcceptEnabled) — sin modificar el POM compartido. La aserción del
// reset se apoya en `isAcceptEnabled()===false` (misma semántica que TC10) + reaparición del
// placeholder de aerolínea.
//
// Fixture de provisión (sin `new`) + login desacoplado (auth) + data propia.
// REQUISITOS DE EJECUCIÓN: UAT arriba + carrier con app Vuelos (AVIATION) vinculada.
// NOTE(verificar-vivo): la papelera "Eliminar vuelo" se validó en el DETALLE; confirmar que el
// mismo botón está presente en el ALTA tras asociar el vuelo (mismo componente Angular esperado).

import { test, expect } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

test.describe(`[FLIGHT][${env.toUpperCase()}] Reabrir modal tras eliminar vuelo → reset — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@flight @carrier @regression [TS-MX5826-REABRIR-RESET] Eliminar el vuelo y reabrir el modal → campos vacíos + "Aceptar" deshabilitado (no reasocia)', async ({ page, dashboard, travel, flightModal }) => {
		await test.step(`Given: dispatcher logueado en carrier (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('And: formulario de nuevo viaje con destino = aeropuerto', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(FLIGHT_TEST_DATA.client);
			await travel.setOrigin(FLIGHT_TEST_DATA.origin);
			await travel.setDestination(FLIGHT_TEST_DATA.airportDestination);
		});

		await test.step('And: se asocia un vuelo API vía el modal "Información de Vuelo"', async () => {
			await flightModal.open();
			await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
			await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
			await flightModal.accept();
		});

		await test.step('When: se elimina el vuelo asociado (🗑️ "Eliminar vuelo")', async () => {
			await flightModal.deleteAssociatedFlight();
		});

		await test.step('And: se REABRE el modal de vuelo', async () => {
			await flightModal.open();
		});

		await test.step('Then: el modal está RESETEADO — "Aceptar" DESHABILITADO (no quedó el vuelo borrado)', async () => {
			// Aserción principal del defecto: si el estado persiste (bug), "Aceptar" queda habilitado.
			await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(false);
		});

		await test.step('And: reaparece el placeholder "Seleccione Aerolínea" (sin aerolínea previa cargada)', async () => {
			// Aserción secundaria: en estado reseteado el selector muestra el placeholder, no el
			// nombre de la aerolínea del vuelo eliminado. (Locator crudo — no se toca el POM.)
			await expect(page.getByText('Seleccione Aerolínea')).toBeVisible({ timeout: 10_000 });
			debugLog('flight', `[TS-MX5826] Modal reseteado tras eliminar+reabrir en ${env.toUpperCase()} ✅`);
		});
	});
});
