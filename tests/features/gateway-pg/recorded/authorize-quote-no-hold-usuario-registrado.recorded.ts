// tests/features/gateway-pg/recorded/authorize-quote-no-hold-usuario-registrado.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-8.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje desde el WIDGET PÚBLICO DE COTIZACIÓN (Quote), SIN hold, con mail de un
//        usuario YA REGISTRADO en la plataforma → se vincula al usuario existente.
// TRAZABILIDAD: TS-AUTHORIZE-TC1215 (docs/gateway-pg/authorize/matriz_cases2.md §11)
//   ⚠️ ID a confirmar: se completaron mail Y teléfono, así que no discrimina entre TC1215
//   (vínculo por mail) y TC1213 (por teléfono) — ambos son "personal + sin hold".
// SPEC DERIVADO: specs/authorize/web/quote/personal-quote-no-hold-happy.spec.ts
// POM CREADO A PARTIR DE ACÁ: components/ui/QuoteWidgetPage.ts
//
// El login se OMITE a propósito (las recordings versionadas no llevan credenciales). Ojo: el login
// acá NO era para el widget —que es público— sino para llegar al Apps Store y copiar el link.
//
// ─── LO QUE ESTA GRABACIÓN REVELÓ (el flujo Quote no estaba automatizado para NINGUNA pasarela;
//     specs/stripe/quote/quote-colaborador.spec.ts estaba entero en test.fixme por falta de POM) ─
//  · El widget es PÚBLICO, sin login: `#/quote?pluginKey=<base64(carrierId)>`.
//    `pluginKey=MTUyMQ` = base64("1521") SIN padding.
//  · El IDIOMA sale del query param (`language=EN`), NO de `ensureSpanishLanguage` como el resto
//    de la suite ⇒ el widget corre en inglés y los locators difieren del portal.
//  · El PAGO vive DENTRO del widget: botón "Payment" después de "Quote". No se convierte desde
//    Cotizaciones del portal (hipótesis inicial descartada por esta grabación).
//  · El form de tarjeta es el MISMO form nativo Angular del portal ⇒ el spec reusa
//    `cardFormFor('authorize')` sin duplicar nada.
//  · ⚠️ TODO viaje de Quote requiere CONFIRMACIÓN POR MAIL del solicitante (regla general del
//    flujo, confirmada por el líder de QA): al confirmar la cotización, MAGIIS envía un mail y el
//    alta se produce recién cuando el cliente lo confirma desde su casilla. Esta grabación NO
//    capturó ese paso —quedó fuera del codegen— pero es OBLIGATORIO: sin él no hay viaje.
//    El paso está capturado en `authorize-quote-hold-usuario-invitado.recorded.ts`.
//  · El viaje resultante se da de alta como PROGRAMADO ("Programmed"), NO como "Por asignar" —
//    resultado válido según el oráculo de QA (Por asignar | Programados = PASS).
//  · El hold NO se elige en el widget: no hay ningún toggle. Comparando con la grabación
//    `authorize-quote-hold-usuario-invitado` (misma secuencia de UI), la diferencia con/sin hold
//    viene de una PREFERENCIA DEL CARRIER, no de un control de esta pantalla.
//
// ⚠️ El ajuste de cantidad de pasajeros (`.pax-count-default` + `i:nth-child(3)`) es un locator
// posicional sin semántica. En el POM quedó expuesto aparte como `increasePassengerCount()`
// marcado FRAGILE, fuera del happy path (el default de 1 pax alcanza).

import { test } from '@playwright/test';

test('recorded — Authorize Quote SIN hold · mail de usuario registrado (referencia)', async ({ page }) => {
	// Login omitido. El acceso al Apps Store era sólo para copiar el link del widget:
	//   Apps Store → "Manage" (nth 3) → botones de copia del link público.
	// El widget en sí NO requiere sesión.
	await page.goto('https://apps-test.magiis.com/#/quote?language=EN&theme=0&pluginKey=MTUyMQ&step=1&c=S');

	// Origen y destino (typeahead del widget, label en inglés).
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('cazadores 1987');
	await page.getByText('Cazadores 1987, Buenos Aires').click();

	// Cantidad de pasajeros (FRAGILE — ver nota del header).
	await page.locator('.d-flex.align-items-center.pax-count-default').dblclick();
	await page.locator('i:nth-child(3)').dblclick();

	// Vehículo + nota del viaje.
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('textbox', { name: 'Trip Note' }).fill('test case quote authorize sin hold');
	await page.getByRole('button', { name: 'Select' }).first().click();

	// Paso 2 — Contacto. El mail corresponde a un usuario YA REGISTRADO: el sistema lo vincula
	// al existente (los demás datos se completan igual, no los auto-rellena).
	await page.getByRole('textbox', { name: 'Name:', exact: true }).fill('Emanuel');
	await page.getByRole('textbox', { name: 'Last Name:' }).fill('Restrepo');
	await page.getByRole('textbox', { name: 'Email:' }).fill('emanuel.restrepo@yopmail.com');
	await page.locator('.dropbtn').click();
	await page.getByRole('link', { name: 'Argentina +' }).click();
	await page.getByRole('textbox', { name: 'phone number' }).fill('+54 (11) 2404-8846');

	// Cotización → pago (el form de tarjeta se monta acá).
	await page.getByRole('button', { name: 'Quote' }).click();
	await page.getByRole('button', { name: 'Payment' }).click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('Emanuel restrepo');
	await page.getByRole('textbox').nth(4).fill('90210');

	// Confirmación de la cotización. ⚠️ NO alcanza para crear el viaje: MAGIIS envía un mail al
	// solicitante y el alta recién se produce cuando ÉL lo confirma desde su casilla (regla general
	// del flujo Quote, confirmada por el líder de QA — ver el header). Esta grabación NO capturó ese
	// paso; está en `authorize-quote-hold-usuario-invitado.recorded.ts`.
	await page.getByRole('button', { name: 'Confirm your Quote' }).click();

	// Verificación en el portal (requiere sesión de carrier): el viaje aparece en "Programmed".
	await page.goto('https://apps-test.magiis.com/#/home/carrier/travel/dashboard');
	await page.getByRole('link', { name: 'Programmed (2)' }).click();
	await page.getByRole('cell', { name: '-S ' }).dblclick();
	await page.getByText('emanuel.restrepo@yopmail.com').click();
});
