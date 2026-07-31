// tests/features/flights/specs/editar-vuelo-desde-detalle.spec.ts
//
// Feature `flights` — EDICIÓN de vuelo desde el detalle de viaje (Carrier V1, mode=3).
// Ref: `../recorded/editar-vuelo-desde-detalle.recorded.ts`. Cubre TC-11 del ATP MX-6120
// (precarga edición) + el camino Recalcular (relacionado al defecto recalc de MX-6024).
//
// Fase C/D: fixture de provisión (sin `new`) + login desacoplado (auth) + data propia.
// REQUISITOS: UAT arriba + un viaje Programado con vuelo asociado. Pendiente de validación
// en vivo (UAT caído al codificar). Los pasos marcados NOTE son recorder-derived.

import { test } from '../fixtures/pom.fixtures';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { debugLog } from '../../../helpers';
import { FLIGHT_TEST_DATA } from '../data/flight-data';

const env = process.env.ENV ?? 'test';

test.describe(`[FLIGHT][${env.toUpperCase()}] Edición de vuelo desde detalle — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	async function openFirstScheduledInEdit(
		page: import('@playwright/test').Page,
		management: { goto: () => Promise<void>; openScheduledTrips: () => Promise<void> }
	): Promise<void> {
		await management.goto();
		await management.openScheduledTrips();
		// NOTE(tier3-recorder): entra a edición del primer Programado vía el botón "Editar" (icon-button;
		// tooltip en title/aria-label/aria-description — `description` no es opción válida en getByRole 1.56).
		await page
			.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]')
			.first()
			.click();
	}

	test('@flight @carrier @edit [TS-MX5824-EDIT-VUELO] Cambiar el vuelo asociado desde detalle → Recalcular → Guardar', async ({
		page,
		management,
		flightModal,
		travelDetail
	}) => {
		await test.step(`Given: dispatcher logueado + primer Programado en edición (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
			await openFirstScheduledInEdit(page, management);
		});

		await test.step('When: se cambia la aerolínea/vuelo asociado (Delta)', async () => {
			await flightModal.open();
			await flightModal.searchAirline(FLIGHT_TEST_DATA.changeAirlineQuery, FLIGHT_TEST_DATA.changeAirlineLabel);
			await flightModal.selectFlightByLabel(FLIGHT_TEST_DATA.changeFlightLabel);
			await flightModal.accept();
		});

		await test.step('And: se recalcula y se guarda la edición', async () => {
			await travelDetail.clickRecalculate();
			// NOTE(tier3-recorder): modal de confirmación tras Recalcular — botón "Aceptar".
			await page.getByRole('button', { name: /^Aceptar$/i }).click();
			await travelDetail.clickSave();
			debugLog('flight', `[EDIT-VUELO] Vuelo editado + recalculado + guardado en ${env.toUpperCase()} ✅`);
		});
	});

	test('@flight @carrier @edit [TS-MX5824-DELETE-VUELO] Eliminar el vuelo asociado desde detalle → Recalcular', async ({
		page,
		management,
		flightModal,
		travelDetail
	}) => {
		await test.step(`Given: dispatcher logueado + primer Programado en edición (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
			await openFirstScheduledInEdit(page, management);
		});

		await test.step('When: se elimina el vuelo asociado', async () => {
			await flightModal.deleteAssociatedFlight();
		});

		await test.step('And: se recalcula la edición', async () => {
			await travelDetail.clickRecalculate();
			await page.getByRole('button', { name: /^Aceptar$/i }).click();
			debugLog('flight', `[DELETE-VUELO] Vuelo eliminado + recalculado en ${env.toUpperCase()} ✅`);
		});
	});
});
