// tests/features/gateway-pg/recorded/authorize-quote-hold-usuario-invitado.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-12.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje PROGRAMADO desde el WIDGET PÚBLICO DE COTIZACIÓN (Quote), CON hold, con
//        mail de un usuario **NO REGISTRADO** en el carrier → el sistema lo crea como INVITADO.
//
// ⚠️ SIN ID DE MATRIZ — [SIN-ID-MATRIZ]
// Este caso NO EXISTE en ninguna matriz: los 14 casos de Authorize §11 y los 20 de Stripe §2 son
// todos "vinculado a usuario/pasajero EXISTENTE". Nadie diseñó el caso del usuario nuevo.
// Antes de derivar un spec hay que CREAR el TC en `docs/gateway-pg/authorize/matriz_cases2.md` §11
// con su ID canónico (rango libre sugerido: TC1285-TC1290, contiguo al bloque). Regla de CLAUDE.md:
// prohibido inventar IDs.
// Conviene crear el PAR completo (con hold / sin hold), porque toda la §11 está estructurada en pares.
//
// ─── REGLA GENERAL DEL FLUJO QUOTE: CONFIRMACIÓN POR EMAIL ─────────────────────────────
// Confirmada por el líder de QA: **TODO viaje que entra por el widget de cotización** requiere que
// el solicitante lo confirme desde su casilla, y al confirmarlo **se da de alta como PROGRAMADO**.
// El viaje NO se concreta con el click en "Confirm your Quote": MAGIIS envía un mail desde
// `no-reply@magiis.com` con un link `confirm_your_trip` y hasta que el cliente NO lo clickea, el
// viaje no existe.
//
// ⚠️ No es exclusivo del usuario invitado. La grabación del caso con mail REGISTRADO
// (`authorize-quote-no-hold-usuario-registrado`) NO capturó este paso, pero también lo requiere —
// ahí quedó fuera del codegen.
//
// ⇒ Es un flujo de DOBLE CANAL (widget + casilla de mail), no una variante de datos. Automatizarlo
//   requiere leer un inbox (acá se usó yopmail) y manejar el popup que abre el link. Hoy la suite
//   NO tiene ningún helper de lectura de mail — es la pieza que falta para que los casos de Quote
//   sean ejecutables de punta a punta.
//
// ─── OTROS DATOS QUE ESTA GRABACIÓN CONFIRMÓ ──────────────────────────────────────────
//  · El solicitante queda como INVITADO, no como usuario registrado:
//      - Celda en la grilla:  "testQuote, magiis (inv)"   ← el "(inv)" es el oráculo del caso
//      - Detalle del viaje:   "Guest magiis testQuote"
//  · Estado de la fila: "Scheduled Trip" (viaje programado). Es un CUARTO estado, distinto de
//    "Searching Driver" / "In Progress" / "No autorizado" ⇒ hay que agregarlo a
//    `HOLD_APPROVED_ROW_STATUS` en el helper stepwise.
//  · Columna: "Programmed (3)" — Programados, igual que el caso sin hold.
//  · EL HOLD NO SE ELIGE EN EL WIDGET: la secuencia de UI es IDÉNTICA a la del caso sin hold — no
//    hay ningún toggle. La diferencia con/sin hold viene de una PREFERENCIA DEL CARRIER
//    (Preferencias Operativas), que se cambió entre ambas corridas. Para automatizar el par hay que
//    tocar esa preferencia, no esta pantalla. Conecta con la deuda "eje del hold sin aseverar".
//  · Diferencia de orden respecto del caso sin hold: acá aparece un "Select" ANTES de la nota del
//    viaje (Select Vehicle → Select → Trip Note → Select). Confirmar si es un paso real o ruido
//    del recorder antes de modelarlo en el POM.
//
// ⚠️ El ajuste de pasajeros (`.pax-count-default` + `i:nth-child(3)`) y los `nth(3)`/`nth(4)` del
// form son locators posicionales del codegen — en el spec se traducen a `cardFormFor('authorize')`.

import { test } from '@playwright/test';

test('recorded — Authorize Quote CON hold · usuario invitado no registrado (referencia)', async ({ page }) => {
	// Login omitido (las recordings versionadas no llevan credenciales). El acceso al Apps Store
	// era sólo para copiar el link público del widget; el widget en sí no requiere sesión.
	await page.goto('https://apps-test.magiis.com/#/quote?language=EN&theme=0&pluginKey=MTUyMQ&step=1&c=S');

	// Origen y destino.
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.placeholder').first().click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('cazadores 1987');
	await page.getByText('Cazadores 1987, Buenos Aires').click();

	// Cantidad de pasajeros (FRAGILE — ver nota del header).
	await page.locator('.d-flex.align-items-center.pax-count-default').dblclick();
	await page.locator('i:nth-child(3)').dblclick();

	// Vehículo + nota. Notar el "Select" extra antes de la nota (ver header).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Select' }).first().click();
	await page.getByRole('textbox', { name: 'Trip Note' }).fill('test case quote con hold');
	await page.getByRole('button', { name: 'Select' }).first().click();

	// Paso 2 — Contacto con mail NO REGISTRADO ⇒ el sistema lo dará de alta como INVITADO.
	await page.getByRole('textbox', { name: 'Name:', exact: true }).fill('magiis');
	await page.getByRole('textbox', { name: 'Last Name:' }).fill('testQuote');
	await page.getByRole('textbox', { name: 'Email:' }).fill('magiisquote@yopmail.com');
	await page.locator('.dropbtn').click();
	await page.getByRole('link', { name: 'Argentina +' }).click();
	await page.getByRole('textbox', { name: 'phone number' }).fill('+54 (11) 2404-85555');

	// Cotización → pago.
	await page.getByRole('button', { name: 'Quote' }).click();
	await page.getByRole('button', { name: 'Payment' }).click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('magiis Quote');
	await page.getByRole('textbox').nth(4).fill('30210');
	await page.getByRole('button', { name: 'Confirm your Quote' }).click();

	// ─── PASO OBLIGATORIO para usuario NO registrado: confirmar el viaje desde el mail ───
	// Hasta este click el viaje NO existe.
	await page.goto('https://yopmail.com/');
	await page.getByRole('textbox', { name: 'Login' }).fill('magiisquote');
	await page.getByRole('button', { name: '' }).click();
	await page.locator('iframe[name="ifinbox"]').contentFrame().getByRole('button', { name: '17:45 no-reply@magiis.com' }).click();
	const confirmPagePromise = page.waitForEvent('popup');
	await page.locator('iframe[name="ifmail"]').contentFrame().getByRole('link', { name: 'confirm_your_trip' }).click();
	const confirmPage = await confirmPagePromise;

	// Verificación en el portal (requiere sesión de carrier): el viaje figura en "Programmed" como
	// INVITADO ("(inv)" / "Guest") y con estado "Scheduled Trip".
	await confirmPage.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	await confirmPage.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await confirmPage.getByRole('link', { name: 'Programmed (3)' }).click();
	await confirmPage.getByRole('cell', { name: 'testQuote, magiis (inv)' }).click();
	await confirmPage.getByText('Scheduled Trip').nth(1).dblclick();
	await confirmPage.getByText('Guest magiis testQuote').click();
	await confirmPage.getByText('magiisquote@yopmail.com').click();
	await confirmPage.getByText('test case quote con hold').click();
});
