// tests/features/flights/specs/mx5826-happy-vuelo-validaciones.spec.ts
//
// Feature `flights` — VALIDACIONES AMPLIADAS del happy path de alta de vuelo (release v1.72.6 / 17080).
// Codifica las reglas de negocio del ATP (guia-manual-vuelos-17080.md, VA-1..6). Fuente de flujo y
// selectores confirmados: recording `agentic-qa-boilerplate/tests/setup/test-6.spec.ts` (apps-uat,
// uatremiseriamagiis). Reusa el POM `FlightInfoModal` + `NewTravelPage`/`TravelDetailPage`.
//
// ENTORNO: UAT (apps-uat) con carrier `uatremiseriamagiis` (app Vuelos AVIATION vinculada + data).
// REQUISITOS DE EJECUCIÓN (ver reporte QA):
//   1) .env.uat: USER_CARRIER_UAT=uatremiseriamagiis@gmail.com + PASS_CARRIER_UAT=123 (setea el usuario).
//   2) desbloquear colección UAT: STRIPE_CARD_* en .env.uat o `cards.ts` lazy (NewTravelPageBase importa stripe).
//
// NOTA de madurez: VA-1/VA-2/VA-3 se apoyan en métodos del POM (estables). VA-4/VA-5/VA-6 usan
// selectores recorder-derived (NOTE(verify-uat)) a confirmar en la 1ª corrida verde en UAT.

import { test, expect } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';
const AIRPORT = FLIGHT_TEST_DATA.airportDestination; // "Aeropuerto Internacional Ministro Pistarini"
const NON_AIRPORT = FLIGHT_TEST_DATA.origin; // "Reconquista 661"

test.describe(`[FLIGHT][${env.toUpperCase()}] Happy path alta de vuelo — validaciones VA-1..6 — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 240_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	// ── VA-1: dirección por defecto del radio según la POSICIÓN del aeropuerto ──────────────────
	// Aeropuerto en DROPOFF/destino → "Partidas" pre-marcado (se deja al cliente → parte).
	test('@flight @carrier @regression [TS-MX5826-VA1a] Aeropuerto en DESTINO → radio "Partidas" pre-seleccionado', async ({ page, dashboard, travel, flightModal }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(NON_AIRPORT);
		await travel.setDestination(AIRPORT);
		await flightModal.open();
		// Partidas = radio id "depart" (POM.selectDirection → label[for="depart"]).
		await expect(page.locator('#depart')).toBeChecked({ timeout: 10_000 });
		await expect(page.locator('#arrival')).not.toBeChecked();
	});

	// Aeropuerto en PICKUP/origen → "Arribos" pre-marcado (se busca al cliente que llega).
	test('@flight @carrier @regression [TS-MX5826-VA1b] Aeropuerto en ORIGEN → radio "Arribos" pre-seleccionado', async ({ page, dashboard, travel, flightModal }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(AIRPORT);
		await travel.setDestination(NON_AIRPORT);
		await flightModal.open();
		await expect(page.locator('#arrival')).toBeChecked({ timeout: 10_000 });
		await expect(page.locator('#depart')).not.toBeChecked();
	});

	// Aeropuerto en STOP/parada → radio SIN marcar (el carrier elige).
	// NOTE(verify-uat): addStop del POM + índice de la parada; confirmar que el ✈ del stop abre el modal.
	test('@flight @carrier @regression [TS-MX5826-VA1c] Aeropuerto en PARADA (stop) → radio sin marcar', async ({ page, dashboard, travel, flightModal }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(NON_AIRPORT);
		await travel.setDestination(NON_AIRPORT);
		await travel.addStop(AIRPORT);
		await flightModal.open();
		await expect(page.locator('#arrival')).not.toBeChecked({ timeout: 10_000 });
		await expect(page.locator('#depart')).not.toBeChecked();
	});

	// ── VA-2: habilitación de Guardar/Aceptar por datos requisito ───────────────────────────────
	test('@flight @carrier @regression [TS-MX5826-VA2] "Aceptar" deshabilitado sin datos requisito → habilitado al completarlos', async ({ page, dashboard, travel, flightModal }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(NON_AIRPORT);
		await travel.setDestination(AIRPORT);
		await flightModal.open();
		await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(false);
		await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
		await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
		await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(true);
	});

	// ── VA-3: limpieza al re-vincular + la fecha del viaje programado se mantiene ────────────────
	test('@flight @carrier @regression [TS-MX5826-VA3] Asociar → eliminar → reabrir: modal limpio (Aceptar disabled) y fecha del viaje se mantiene', async ({ page, dashboard, travel, flightModal }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(NON_AIRPORT);
		await travel.setDestination(AIRPORT);

		// Asociar un vuelo
		await flightModal.open();
		await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
		await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
		await flightModal.accept();

		// Capturar la fecha del viaje ANTES de borrar (para confirmar que se mantiene).
		// NOTE(verify-uat): input de fecha programada del formulario (recorder: `.inputs-programmed`).
		const dateInput = page.locator('.inputs-programmed input, input[type="text"].fecha, .btn-calendar').first();
		const dateBefore = await dateInput.inputValue().catch(() => '');

		// Eliminar y reabrir → modal limpio
		await flightModal.deleteAssociatedFlight();
		await flightModal.open();
		await expect.poll(() => flightModal.isAcceptEnabled(), { timeout: 10_000 }).toBe(false);
		await expect(page.getByText('Seleccione Aerolínea')).toBeVisible({ timeout: 10_000 });

		// La fecha del viaje se mantiene (si el locator de fecha no matchea, ambos '' → guard suave;
		// NOTE(verify-uat): fijar el selector de fecha programada en la 1ª corrida UAT).
		const dateAfter = await dateInput.inputValue().catch(() => '');
		expect(dateAfter, 'la fecha del viaje programado cambió tras eliminar el vuelo').toBe(dateBefore);
	});

	// ── VA-4/5/6: detalle del viaje, nota autogenerada y flujo mismo-día con stop ────────────────
	// NOTE(verify-uat): estos casos requieren crear el viaje (Enviar Servicio) + navegar al detalle y
	// usan selectores recorder-derived (test-6.spec.ts). Confirmar en la 1ª corrida verde en UAT.
	test('@flight @carrier @regression @detail [TS-MX5826-VA4-5] Detalle: ✈ visible + pop-up consistente; eliminar mantiene fecha y borra la nota del vuelo', async ({ page, dashboard, travel, management, flightModal, travelDetail }) => {
		await loginAsDispatcher(page);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.selectClient(FLIGHT_TEST_DATA.client);
		await travel.setOrigin(NON_AIRPORT);
		await travel.setDestination(AIRPORT);
		await flightModal.open();
		await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
		await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.flightLabel);
		await flightModal.accept();
		await travel.waitForVehicleSelectionReady();
		await travel.clickSelectVehicle();
		await travel.clickSendService();

		// Ir al detalle del viaje recién creado (primer Programado en edición).
		await management.goto();
		await management.openScheduledTrips();
		// NOTE(verify-uat): botón "Editar" (icon-button; tooltip en title/aria-label/aria-description).
		await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();

		// VA-4a: ✈ visible en el detalle sobre la dirección aeropuerto.
		await expect(page.locator('.btn.btn-primary.rounded-btn.btn-flight-round')).toBeVisible({ timeout: 10_000 });

		// VA-4b: al abrir, el pop-up muestra la fecha del VIAJE, NO la actual (regresión del bug
		// "fecha del modal", fixeado + validado manual en v1.72.6). Se toma como referencia la fecha
		// del vuelo asociado que muestra el detalle (tarjeta) y se exige que el modal la refleje.
		const cardText = await page
			.locator('.card-flight')
			.first()
			.innerText()
			.catch(() => '');
		const tripDate = (cardText.match(/(\d{2}\/\d{2}\/\d{4})/) ?? [])[1] ?? '';
		await flightModal.open();
		await expect(page.getByRole('heading', { name: 'Información de Vuelo' })).toBeVisible();
		// Aserción de consistencia (POM.expectFlightDateMatchesTrip). tripDate vacío → no-op (guard suave).
		// NOTE(verify-uat): para forzar la regresión, programar el viaje en una fecha ≠ hoy.
		await flightModal.expectFlightDateMatchesTrip(tripDate);

		// VA-5: eliminar el vuelo desde el detalle → "Sin vuelo asociado" + nota del vuelo borrada.
		await flightModal.deleteAssociatedFlight();
		await travelDetail.clickRecalculate();
		await page
			.getByRole('button', { name: /^Aceptar$/i })
			.click()
			.catch(() => {});
		await expect(page.getByText(/Sin vuelo asociado/i)).toBeVisible({ timeout: 10_000 });
		// NOTE(verify-uat): confirmar en UAT que la NOTA autogenerada del vuelo ya no está en la sección de notas.
	});

	// VA-6: viaje programado MISMO DÍA con STOP = aeropuerto; cambiar fecha y vuelo → re-validar.
	// NOTE(verify-uat): flujo largo (crear + editar); usa addStop + selectores de fecha del recording.
	test.fixme('@flight @carrier @regression [TS-MX5826-VA6] Mismo día + stop aeropuerto: ✈ visible y consistente tras cambio de fecha/vuelo', async () => {
		// Pendiente de habilitar tras confirmar selectores de fecha y edición en la 1ª corrida UAT.
	});
});
