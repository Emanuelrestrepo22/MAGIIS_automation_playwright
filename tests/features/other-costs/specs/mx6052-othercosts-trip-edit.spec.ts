// tests/features/other-costs/specs/mx6052-othercosts-trip-edit.spec.ts
//
// MX-6052 — "Otros Costos en edición de viaje no se muestran" (UI, Carrier **V1** — prioridad release).
// E2E: en la edición de un viaje Programado (mode=3), el modal "Agregar Otro Costo" lista los conceptos
// (select NO vacío al primer render — fix de la race condition) y permite seleccionar + agregar uno.
// Complementa la capa API (magiis-api-e2e: otherCosts/search) — capas distintas, sin duplicar.
//
// Fuente de selectores V1: recording `agentic-qa-boilerplate/tests/setup/test-9.spec.ts` (E2E V1, apps-uat)
// + ATR MX-6114 (PASS V1+V2, 14 conceptos). Reusa POMs V1: TravelManagementPage / TravelDetailPage +
// login desacoplado `loginAsDispatcher`.
//
// Trazabilidad: ticket MX-6052 · ATP MX-6102 · ATR MX-6114 · Xray Test MX-6134.
// PRECONDICIÓN de datos: carrier con conceptos de "Otros Costos" configurados + al menos un viaje
// Programado editable (todos los Programados son editables en UAT).

import { test, expect } from '../../../TestBase';
import { loginAsDispatcher } from '../../auth/helpers/login.helpers';
import { TravelManagementPage } from '../../../pages/carrier/TravelManagementPage';
import { TravelDetailPage } from '../../../pages/carrier/TravelDetailPage';

const env = process.env.ENV ?? 'test';

test.describe(`[OTHER-COSTS][${env.toUpperCase()}] Otros Costos en edición de viaje (V1) — Portal Carrier`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] }, locale: 'es-AR' });

	// ESTADO (run vivo UAT 2026-07-16): ✅ login + Gestión de Viajes → Programados + botón "Editar" de la
	// fila (`getByRole('button',{description:'Editar'})`) CONFIRMADOS. ⏳ PENDIENTE (flaky en la página V1
	// de edición — lista dinámica + 500 transitorio + múltiples lápices): el lápiz de "Otros Costos"
	// (Datos Presupuestados) → botón + → modal `app-modal-other-costs-add`. Requiere endurecer esos 3
	// selectores (idealmente codegen headed sobre un Programado). La capa API (magiis-api-e2e
	// `carrier-other-cost-mx6052.api.test.ts`) YA valida el fix (select no vacío) en verde.
	test.fixme(
		'@othercosts @carrier @regression [TS-MX6052-V1-01] modal "Agregar Otro Costo": el select lista conceptos (no vacío) y se puede agregar',
		{
			annotation: [
				{ type: 'tms', description: 'MX-6134' },
				{ type: 'issue', description: 'MX-6052' }
			]
		},
		async ({ page }) => {
			const management = new TravelManagementPage(page);
			const travelDetail = new TravelDetailPage(page);

			await test.step(`Given: dispatcher logueado en carrier (${env.toUpperCase()})`, async () => {
				await loginAsDispatcher(page);
			});

			await test.step('And: primer viaje Programado en edición (mode=3)', async () => {
				await management.goto();
				await management.openScheduledTrips();
				// Botón "Editar" de la fila (icon-button; el tooltip expone aria-description="Editar").
				// getByRole no acepta `description`; se ancla por atributo aria-description con .and(). Ex test-9.
				await page.getByRole('button').and(page.locator('[aria-description="Editar"]')).first().click();
			});

			await test.step('When: se abre "Editar Otros Costos" → "Agregar Otro Costo"', async () => {
				// Lápiz de "Otros Costos" en Datos Presupuestados: icono clickeable junto al label+monto
				// (NO el primer .fa-pencil de la página, que es de Datos Finales). Anclado al texto.
				await page.getByText('Otros Costos', { exact: true }).first()
					.locator('xpath=..').locator('i, [class*="fa"]').last().click();
				// Modal "Editar Otros Costos" → botón + (Agregar) junto al total → modal "Agregar Otro Costo".
				await page.locator('.cost-total .plus-button, .cost-total > div > .plus-button, .plus-button').first().click();
			});

			await test.step('Then: el select de conceptos NO está vacío (AC1 — fix race condition)', async () => {
				const modal = page.locator('app-modal-other-costs-add');
				await expect(modal).toBeVisible({ timeout: 10_000 });
				// abrir el select de concepto
				await modal
					.getByText(/Otro Costo|Seleccion/i)
					.first()
					.click();
				const options = page.getByRole('listitem');
				await expect(options.first()).toBeVisible({ timeout: 10_000 });
				expect(await options.count(), 'el select de Otros Costos debe listar conceptos (no vacío)').toBeGreaterThan(0);
			});

			await test.step('And: al seleccionar un concepto, "Aceptar" habilita y se agrega (AC2)', async () => {
				await page.getByRole('listitem').first().click();
				const accept = page.locator('app-modal-other-costs-add').getByRole('button', { name: 'Aceptar' });
				await expect(accept).toBeEnabled({ timeout: 10_000 });
				await accept.click();
			});

			// NOTE(verify-uat): AC3 (Recalcular → Guardar → persiste, dep MX-6024): descomentar tras confirmar
			// en vivo — usa travelDetail.clickRecalculate() + botón Aceptar del confirm + travelDetail.clickSave().
			void travelDetail;
		}
	);
});
