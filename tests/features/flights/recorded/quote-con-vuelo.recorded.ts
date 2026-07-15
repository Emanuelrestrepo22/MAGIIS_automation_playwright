// tests/features/flights/recorded/quote-con-vuelo.recorded.ts
//
// REFERENCIA (no se ejecuta — naming *.recorded.ts fuera de testMatch).
// Recording del camino de QUOTE / Reservación Online con VUELO ASOCIADO.
// Trazabilidad: TS-MX5824-TC18 (ATP MX-6120) · ejecución + evidencia en ATR MX-6128 · MX-5824.
//
// El widget de cotización es PÚBLICO (sin login): `#/quote?pluginKey=<base64 carrierId>`
// (MTA0MA = carrier 1040). Reusa el MISMO modal "Información de Vuelo" (getFlights/AVIATION)
// que el flujo Carrier → el POM estable es `../pages/FlightInfoModal.ts` (open/searchAirline/
// selectFlightByLabel/accept). Validado en vivo contra UAT v1.72.6 el 2026-07-15.
//
// Flujo: quote widget → origen + destino=aeropuerto → "Añadir Detalles del Vuelo" → modal de
// vuelo (aerolínea → Buscar → seleccionar card → Aceptar) → Paso 2 datos de pasajero →
// Confirmación de Reserva. Los `page.goto(...step=2...)` y `travel/detail?travelId=NNN&mode=3`
// del codegen original son RUIDO del recorder (IDs hardcodeados); el wizard avanza por botones.

import { test } from '@playwright/test';

test('recorded — quote (Reservación Online) con vuelo asociado (referencia)', async ({ page }) => {
	// Widget público de cotización del carrier 1040 (sin login).
	await page.goto('https://apps-uat.magiis.com/#/quote?language=ES&theme=0&pluginKey=MTA0MA&step=1&c=S');

	// Origen (typeahead) + Destino = aeropuerto → habilita "Añadir Detalles del Vuelo".
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('reconquista 661');
	await page.getByText('Reconquista 661, Ciudad Autó').click();
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('ezeiza');
	await page.getByText('Aeropuerto Internacional').click();

	// Detalles del vuelo dentro del quote — MISMO modal "Información de Vuelo" que Carrier.
	await page.getByRole('button', { name: 'Añadir Detalles del Vuelo ' }).click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('argentina');
	await page.getByText('AR - Aerolíneas Argentinas').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	// NOTE(recorder→POM): selección de fila = SINGLE click sobre la card `.card-flight` (tr-select),
	// no dblclick — usar FlightInfoModal.selectFlightByLabel.
	await page.getByRole('button', { name: 'Aceptar' }).click();

	// Paso 2 — Contacto y Servicio (datos de pasajero).
	await page.getByRole('textbox', { name: 'Nombre:' }).fill('emanuel');
	await page.getByRole('textbox', { name: 'Apellido:' }).fill('restrepo');
	await page.getByRole('textbox', { name: 'Email:' }).fill('emadavresgar@gmail.com');
	await page.getByRole('textbox', { name: 'phone number' }).fill('+54 (11) 2404-8846');
	// → continúa a Confirmación de Reserva.
});
