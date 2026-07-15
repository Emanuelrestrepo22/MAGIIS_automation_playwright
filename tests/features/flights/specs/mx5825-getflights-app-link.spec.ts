// tests/features/flights/specs/mx5825-getflights-app-link.spec.ts
//
// Feature `flights` — MX-5825 (release v1.72.6 / 17080): en el PRIMER linkeo de la app Vuelos
// (sin re-login), el FE dispara `getFlights` con el service name en `null` →
// `.../flights/getFlights/{carrierId}/null?...` → 404 (causa FE: `flightApiName` no persiste
// hasta re-login). Esperado tras fix: el request lleva el serviceName real (NO `null`) → NO 404.
//
// Guarda de regresión de RED: al buscar vuelos desde el modal se intercepta `getFlights` y se
// asevera que (a) el segmento serviceName NO es `null` y (b) el status NO es 404. Esta guarda
// atrapa el defecto en cualquier búsqueda, sin depender de reproducir el estado exacto de
// "recién vinculado". Adjunta URL+status como evidencia (regla payload en fallos).
//
// Fixture de provisión (sin `new`) + login desacoplado (auth) + data propia.
// REQUISITOS DE EJECUCIÓN: UAT arriba + carrier con app Vuelos (AVIATION) vinculada.
// NOTE(repro-exacta): para forzar el estado "primer linkeo" habría que desvincular/vincular la
// app Vuelos sin re-login (ver `../recorded/app-link-lifecycle.recorded.ts`); la guarda de red
// de abajo es la verificación durable del defecto y no requiere ese estado.

import { test, expect } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

// Endpoint (V1 = V2): GET .../flights/getFlights/{carrierId}/{serviceName}?...
const GET_FLIGHTS_RE = /\/flights\/getFlights\//i;
// serviceName === "null" (el defecto): .../getFlights/{id}/null(?|/|fin)
const SERVICE_NAME_NULL_RE = /\/getFlights\/[^/]+\/null(?:[/?]|$)/i;

test.describe(`[FLIGHT][${env.toUpperCase()}] getFlights no manda serviceName null (app-link) — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@flight @carrier @regression [TS-MX5825-GETFLIGHTS-NOTNULL] getFlights lleva serviceName real (no "null") y no responde 404', async ({ page, dashboard, travel, flightModal }) => {
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

		let url = '';
		let status = 0;

		await test.step('When: se abre el modal y se busca una aerolínea (dispara getFlights)', async () => {
			await flightModal.open();
			// Registrar la espera del response ANTES de disparar la búsqueda.
			const responsePromise = page.waitForResponse(r => GET_FLIGHTS_RE.test(r.url()), { timeout: 30_000 });
			await flightModal.searchAirline(FLIGHT_TEST_DATA.airlineQuery, FLIGHT_TEST_DATA.airlineLabel);
			const response = await responsePromise;
			url = response.url();
			status = response.status();

			// Evidencia (regla payload): request URL + status.
			debugLog('flight', `[TS-MX5825] getFlights → ${status} ${url}`);
			await test.info().attach('getFlights-request', {
				body: JSON.stringify({ url, method: response.request().method(), status }, null, 2),
				contentType: 'application/json'
			});
		});

		await test.step('Then: el serviceName NO es "null" (defecto MX-5825)', async () => {
			expect(url, `getFlights envió serviceName "null": ${url}`).not.toMatch(SERVICE_NAME_NULL_RE);
		});

		await test.step('And: el status NO es 404', async () => {
			expect(status, `getFlights respondió ${status} para ${url}`).not.toBe(404);
		});
	});
});
