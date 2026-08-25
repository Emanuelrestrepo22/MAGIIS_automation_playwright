// tests/features/gateway-pg/recorded/authorize-contractor-vinculacion-tarjeta.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-7.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje desde el PORTAL CONTRACTOR (no Carrier) con vinculación de tarjeta
//        Authorize.Net preautorizada, para usuario colaborador.
// TRAZABILIDAD CANDIDATA: TS-AUTHORIZE-TC1201 / TC1203 (matriz_cases2.md §1.1)
//   ⚠️ A CONFIRMAR cuál: la grabación SELECCIONA una tarjeta ya vinculada y DESPUÉS la borra para
//   adicionar una nueva, así que toca los dos casos —TC1201 "vincular tarjeta nueva" y TC1203
//   "seleccionar tarjeta vinculada"—. Definir el caso antes de derivar el spec.
// SPEC DERIVADO: (pendiente)
//
// El login se OMITE a propósito (las recordings versionadas no llevan credenciales). En el spec lo
// resuelve `loginAsContractor(page, { gateway: 'authorize' })`.
//
// ─── DIFERENCIAS DEL PORTAL CONTRACTOR vs CARRIER (por esto no se puede reusar el helper tal cual) ─
//   | Aspecto              | Carrier                        | Contractor                      |
//   |----------------------|--------------------------------|---------------------------------|
//   | Login (botón)        | "MAGIIS Account"               | "Login"                         |
//   | Campo de usuario     | #clientSelect + #passenger      | UN SOLO campo "Select a user"   |
//   | Grilla de viajes     | "Trips Management"              | "Trips list"                    |
//   | URL de la grilla     | /carrier/travel/dashboard       | /contractor/travel/listed       |
//   | Celdas de la fila    | pasajero + destino              | pasajero + "Remises EEUU" (el carrier) |
// Ya existe `ContractorNewTravelPage` (legacy y KATA) que hereda del carrier y resuelve el campo
// único de usuario. Lo que falta para automatizar esto es el equivalente de gestión de viajes.
//
// ─── OTROS DATOS QUE ESTA GRABACIÓN CONFIRMÓ ──────────────────────────────────────────
//  · Usuario del portal contractor: colaborador (login propio, distinto del dispatcher del carrier).
//  · Cliente/pasajero: se busca "ema" en el campo único.
//  · Método de pago (texto literal): "Credit Card - Pre-Authorized".
//  · ZIP usado: 30210 (no 90210). Ambos son ZIP neutros en Authorize —no están en la tabla de
//    magic triggers— así que los dos aprueban. El trigger del happy path es el CVV 900.
//  · ESTADO "In Progress": el viaje quedó en progreso porque un DRIVER LO ACEPTÓ. Si nadie lo
//    aceptaba, quedaría en "Searching Driver". Los dos acreditan que el hold funcionó ⇒ de acá
//    salió `HOLD_APPROVED_ROW_STATUS` (regex tolerante) en el helper stepwise: fijar un literal
//    introducía una condición de carrera entre crear el viaje y leer la grilla.
//  · Pago confirmado exitoso desde la App Driver (fase mobile, fuera del alcance de este recording).
//
// ─── BL-050 · PRECONDICIÓN DE TARJETA DUPLICADA ───────────────────────────────────────
// La secuencia de borrado (abrir el dropdown → trash → "Delete" → reabrir) es OBLIGATORIA: si el
// cliente ya tiene vinculada una tarjeta con el MISMO NÚMERO, el botón "Validar" NO se habilita.
//
// ⚠️ Los `nth(3)` / `nth(4)` son locators posicionales del codegen (titular y ZIP). En el spec se
// traducen a `cardFormFor('authorize')` — nunca copiar esto tal cual a un spec.

import { test } from '@playwright/test';

test('recorded — Authorize contractor · vinculación de tarjeta + alta de viaje (referencia)', async ({ page }) => {
	// Login omitido: en el spec lo hace loginAsContractor(page, { gateway: 'authorize' }).
	await page.goto('https://apps-test.magiis.com/#/home/contractor/dashboard');
	await page.getByRole('banner').getByText('New trip').click();

	// Contractor tiene UN SOLO campo de usuario (cliente y pasajero son el mismo).
	await page.getByText('Select a user').click();
	await page.getByRole('textbox', { name: 'Select a user' }).fill('ema');
	await page.locator('.data-with-icon-col').click();

	// Origen y destino.
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.placeholder').first().click();
	await page.getByText('Cazadores 1987, Ciudad Autó').click();

	// BL-050: había una tarjeta ya vinculada → se selecciona, se borra y se reabre el dropdown
	// para poder adicionar la nueva. Sin esto "Validar" no habilita.
	await page.locator('#add_travel_payment_methods > .below > .single > .value > .data-with-icon-col').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
	await page.locator('.focus > .single > .value > .data-with-icon-col').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col > .deselect-payment-method > .fa').click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.locator('#add_travel_payment_methods > .below > .single > .value > .data-with-icon-col').click();
	await page.getByText('Credit Card - Pre-Authorized').click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('magiistest cuatroContractor');
	await page.getByRole('textbox').nth(4).fill('30210');

	// Validación de tarjeta → HOLD DE VINCULACIÓN (primera transacción; ver BL-051).
	await page.getByRole('button', { name: 'Valid' }).click();

	// Armado y envío del servicio → HOLD DEL VIAJE (segunda transacción).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// Verificación en la grilla del contractor ("Trips list", no "Trips Management").
	// El viaje figura como "In Progress" porque el driver ya lo había aceptado.
	await page.getByRole('banner').getByRole('link', { name: 'Trips list' }).click();
	await page.getByRole('cell', { name: 'Emanuel smith' }).first().click();
	await page.getByRole('cell', { name: 'Remises EEUU' }).first().click();
	await page.getByText('In Progress').click();
});
