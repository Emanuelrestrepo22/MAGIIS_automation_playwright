/**
 * E2E eBizCharge — Alta de Viaje desde el widget QUOTE con hold, usuario invitado, viaje programado
 * ==================================================================================================
 * Grabación de REFERENCIA (`.recorded.ts`), no spec productivo. Ejecutado MANUALMENTE en vivo por el
 * líder de QA el 2026-07-30 y reportado **PASS en verde**: "alta de viaje quote con hold exitoso".
 *
 * Cierra el último eje que quedaba pendiente de la ronda eBizCharge — el flujo Quote con hold, que en
 * el E2E #2 se había declarado explícitamente como no ejecutado.
 *
 * ── COBERTURA ────────────────────────────────────────────────────────────────────────────────────
 *
 * | TC de matriz     | Sección       | Cobertura |
 * |------------------|---------------|-----------|
 * | `TS-EBIZ-TC1205` | §Flujo Quote  | 🟡 PARCIAL con dos deltas — ver abajo |
 *
 * `TS-EBIZ-TC1205` = "Alta de Viaje desde Quote para usuario **sin datos filiatorios** vinculado a
 * pasajero existente con Tarjeta Preautorizada **Hold** desde Alta de Viaje y Cobro desde App Driver".
 * Es el caso más cercano y el eje central (Quote + hold) coincide, pero hay dos deltas que NO se
 * pueden dar por buenos sin verificar:
 *
 *   1. **¿invitado NUEVO o vinculado a un pax existente?** El caso pide "vinculado a pasajero
 *      existente". Acá se tipearon datos nuevos (`ematrepo@yopmail.com`, teléfono nuevo) y la grilla
 *      mostró **`trepo, ema (inv)`** — el marcador `(inv)` = invitado. Si el backend creó un pax
 *      nuevo en vez de matchear uno existente, esto NO es TC1205 sino una variante sin fila en la
 *      matriz. Se resuelve en la DB, no por inspección de la grabación.
 *   2. **el viaje quedó PROGRAMADO**, no inmediato: se eligió una hora futura (`:30 PM`) y la
 *      confirmación apareció en **"Programados (1)"**. TC1205 no fija el eje de horario.
 *
 * Query para el delta 1 (el oráculo general del front, según el líder de QA):
 *
 *   SELECT l.* FROM MGW.logs AS l ORDER BY l.id DESC
 *
 * ── LO QUE ESTA GRABACIÓN CONFIRMA DEL MOTOR ─────────────────────────────────────────────────────
 * El oráculo del viaje programado que se cableó el 2026-07-30
 * (`expectPassengerInProgramados`): un viaje con hora futura **NO** aparece en "Por asignar" sino en
 * la pestaña "Programados". Acá se ve de forma independiente del alta desde carrier — la pestaña
 * mostró literalmente "Programados (1)". Dos rutas distintas, mismo comportamiento.
 *
 * ── DATOS DE LA GRABACIÓN ────────────────────────────────────────────────────────────────────────
 * · Widget Quote: `#/quote?language=EN&theme=0&pluginKey=MTUyMQ&step=1&c=S`
 *   `pluginKey=MTUyMQ` es base64 de **1521** → el carrier compartido de siempre. La confirmación
 *   vuelve con `k=MTUyMQ`, así que el widget lleva el carrier en la URL, no en sesión.
 * · Tarjeta: `4000200011112222` — Visa CVV2 M (approved) de `EBIZ_CVV2_REFERENCE`. Es la MISMA que
 *   usó el tramo 7 del E2E #2, así que su comportamiento ya estaba observado.
 * · Dirección de la tarjeta: `san martin 536` → el sistema autocompleta el ZIP. Mismo delta eBiz que
 *   documentó el E2E #1 (HALLAZGO 1: eBiz pide dirección y deriva el código postal).
 * · Locale mixto: el portal carrier renderizó en ESPAÑOL ("Contraseña", "Ingresar", "Gestión de
 *   Viajes", "Programados") mientras el widget Quote fue en INGLÉS (`language=EN` en su URL). Al
 *   portar, los locators tienen que ser bilingües en las dos mitades del flujo.
 *
 * ── 🔴 HALLAZGO DE PRODUCTO: typo en la confirmación ─────────────────────────────────────────────
 * El heading de confirmación del widget dice **"Your Trip was confimed!"** — falta la R de
 * "confirmed". Es texto de cara al cliente final (el widget Quote es el embebible público), así que
 * merece reporte. Va a DEV/MX, no a MG: en MG sólo se crean entidades Xray.
 *
 * Consecuencia para la automatización: el assert del heading tiene que matchear el texto REAL con el
 * typo, o el spec falla contra producción. Se deja el literal tal como está y con este comentario,
 * para que nadie lo "corrija" al portarlo y rompa el test.
 *
 * ── IMPERFECCIONES CORREGIDAS respecto de la grabación cruda ─────────────────────────────────────
 * El crudo era `tests/setup/test-14.spec.ts` del repo `agentic-qa-boilerplate` (el HUB de
 * metodología). Se movió acá porque la cobertura de gateway vive en este repo, y porque ahí quedaba
 * dentro del `testDir` del HUB — un `.spec.ts` ejecutable con credenciales en claro que crea viajes
 * reales. Correcciones:
 *
 *   · **NO COMPILABA**: el codegen abrió una pestaña nueva (el widget Quote sale del App Store en
 *     otra tab) y usó `page1` sin declararla nunca — perdió el
 *     `const page1 = await context.waitForEvent('page')`. Reconstruido con `waitForEvent('page')`.
 *   · Credenciales de login hardcodeadas → env vars.
 *   · Clicks duplicados del codegen: `Programados (1)` ×2, el `dblclick` + `click` sobre el mismo
 *     heading de confirmación, y los dos `Trip Note` (se tipeó "quote hold" y después
 *     "quote hold ebiz" — se conserva sólo el valor final).
 *   · `page1.locator('div').nth(1).click()` — ruido posicional sin efecto, eliminado.
 *   · Se marcan FRAGILE los locators posicionales: `getByText('Gestionar').nth(1)`,
 *     `getByRole('button').filter({hasText: /^$/})` (el botón sin texto que abre el widget),
 *     `locator('.placeholder').first()`, `locator('i:nth-child(3)')` y
 *     `getByRole('textbox').nth(3)` (titular de la tarjeta).
 *   · La fase driver NO está en la grabación: queda como TODO.
 */
import { test, expect } from '@playwright/test';

const CARRIER_EMAIL = 'remises.eeuu@yopmail.com';

/** Visa CVV2 M (approved) de `EBIZ_CVV2_REFERENCE`. El ZIP lo autocompleta la dirección. */
const CARD = {
	number: '4000 2000 1111 2222',
	expiry: '09/30',
	cvv: '123',
	holder: 'ematrepoquote holdebiz',
	address: 'san martin 536',
	addressOption: 'San Martín 536, AAL, Ciudad',
};

/** Invitado del widget: datos NUEVOS, sin usuario previo en el sistema (ver delta 1 del encabezado). */
const GUEST = {
	firstName: 'ema',
	lastName: 'trepo',
	email: 'ematrepo@yopmail.com',
	phone: '+1 (654) 148-54848',
};

test('[EXPLORATORIO][eBizCharge] Quote con hold · invitado · viaje programado', async ({ page, context }) => {
	test.slow();

	await test.step('1. Login al dashboard de carrier', async () => {
		await page.goto('https://apps-test.magiis.com/#/authentication/login/carrier');
		// Portal en ESPAÑOL en esta corrida — ver la nota de locale mixto del encabezado.
		await page.getByRole('textbox', { name: /Email|eMail/i }).fill(CARRIER_EMAIL);
		await page.getByRole('textbox', { name: /Contraseña|Password/i }).fill(process.env.PASS_CARRIER ?? '');
		await page.getByRole('button', { name: /Ingresar|MAGIIS Account/i }).click();
		await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	});

	// El widget Quote se abre desde el App Store y sale en una PESTAÑA NUEVA — es lo que el codegen
	// perdió (usaba `page1` sin declararla). Hay que capturarla con `waitForEvent('page')`.
	let quote!: import('@playwright/test').Page;

	await test.step('2. Abrir el widget Quote desde MAGIIS Apps Store (pestaña nueva)', async () => {
		await page.getByText('MAGIIS Apps Store').click();
		// FRAGILE: "Gestionar" por posición y un botón SIN texto. Al portar, scopear a la card del
		// widget Quote en vez de usar índices.
		await page.getByText('Gestionar').nth(1).click();

		const popupPromise = context.waitForEvent('page');
		await page.getByRole('button').filter({ hasText: /^$/ }).click();
		quote = await popupPromise;
		await quote.waitForLoadState('domcontentloaded');
		// El widget lleva el carrier en la URL: `pluginKey=MTUyMQ` = base64('1521').
		await expect(quote).toHaveURL(/#\/quote\?.*pluginKey=MTUyMQ/);
	});

	await test.step('3. Cotizar: origen, destino, HORA FUTURA y pasajeros', async () => {
		// FRAGILE: `.placeholder` por posición — el widget reusa la misma clase para origen y destino.
		await quote.locator('.placeholder').first().click();
		await quote.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
		await quote.getByText('Reconquista 661, Ciudad Autó').click();

		await quote.locator('.placeholder').first().click();
		await quote.getByRole('textbox', { name: 'Enter an address' }).fill('carlos gardel 3163');
		await quote.getByText('Carlos Gardel 3163, Ciudad').click();

		// VIAJE PROGRAMADO: se elige una hora futura. Es lo que después manda el viaje a la pestaña
		// "Programados" en vez de "Por asignar" (delta 2 del encabezado).
		await quote.getByText(':30 PM').first().click();

		// Cantidad de pasajeros. FRAGILE: `i:nth-child(3)` es el botón "+" por posición.
		await quote.locator('.d-flex.align-items-center.pax-count-default').click();
		await quote.locator('i:nth-child(3)').click();

		await quote.getByRole('button', { name: 'Select Vehicle' }).click();
		await quote.getByRole('button', { name: 'Select' }).first().click();
	});

	await test.step('4. Datos del INVITADO (sin usuario previo) + cotizar', async () => {
		await quote.getByRole('textbox', { name: 'Trip Note' }).fill('quote hold ebiz');
		await quote.getByRole('textbox', { name: 'Name:', exact: true }).fill(GUEST.firstName);
		await quote.getByRole('textbox', { name: 'Last Name:' }).fill(GUEST.lastName);
		await quote.getByRole('textbox', { name: 'Email:' }).fill(GUEST.email);
		await quote.getByRole('textbox', { name: 'phone number' }).fill(GUEST.phone);
		await quote.getByRole('button', { name: 'Quote' }).click();
	});

	await test.step('5. Pago: vincular tarjeta con HOLD y confirmar la cotización', async () => {
		await quote.getByRole('button', { name: 'Payment' }).click();
		await quote.getByRole('textbox', { name: 'Card number *' }).fill(CARD.number);
		await quote.getByRole('textbox', { name: 'MM/AA' }).fill(CARD.expiry);
		// FRAGILE: el CVV es un `input[type=password]`; el titular, `textbox` por índice.
		await quote.locator('input[type="password"]').fill(CARD.cvv);
		await quote.getByRole('textbox').nth(3).fill(CARD.holder);

		// Delta eBiz: se elige una DIRECCIÓN y el sistema autocompleta el ZIP (no se tipea).
		await quote.locator('.placeholder').first().click();
		await quote.getByRole('textbox', { name: 'Enter an address' }).fill(CARD.address);
		await quote.getByText(CARD.addressOption).click();

		await quote.getByRole('button', { name: 'Confirm your Quote' }).click();

		// ⚠️ El texto real tiene un TYPO del producto: "confimed" sin la R. NO corregir el literal —
		// matchea la UI tal como está. Ver el hallazgo del encabezado (reportar a DEV/MX).
		await expect(quote.getByRole('heading', { name: 'Your Trip was confimed!' })).toBeVisible({ timeout: 30_000 });
	});

	await test.step('6. Oráculo en el portal: el viaje quedó en PROGRAMADOS', async () => {
		await page.bringToFront();
		await page.getByRole('banner').getByRole('link', { name: /Gestión de Viajes|Trips Management/i }).click();
		await page.getByRole('link', { name: /Programados/i }).click();
		// El invitado aparece con el marcador `(inv)` — la evidencia del delta 1 del encabezado.
		await expect(page.getByRole('cell', { name: /trepo, ema \(inv\)/i })).toBeVisible({ timeout: 15_000 });
	});

	// TODO fase driver: aceptar → iniciar → finalizar → cobrar. Oráculo del cobro eBiz (establecido en
	// el E2E #1, CloudWatch `Test-Logs` → `Test-PaymentGateway`): `command: 'capture'` +
	// `resultCode: 'A'` + `result: 'Approved'` + `refNum` == el intentId del hold.
});
