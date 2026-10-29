/**
 * E2E eBizCharge #2 — 3 actores × Hold ON/OFF + delete/re-vinculación de tarjeta + viaje programado
 * ==================================================================================================
 * Grabación de REFERENCIA (`.recorded.ts`), no spec productivo: sirve para portar los ejes nuevos a
 * la factory. Ejecutado MANUALMENTE en vivo por el líder de QA el 2026-07-30, continuación de
 * `ebizcharge-e2e-link-gateway-hold-colaborador-cobro-driver.recorded.ts` (la pasarela eBizCharge ya
 * quedó vinculada ahí, así que esta grabación NO repite el switch de pasarela).
 *
 * **Todos los viajes son con tarjeta preautorizada (hold)** — el eje que varía es si la
 * pre-autorización del carrier está ON u OFF, no si hay tarjeta. Todos los viajes se finalizaron
 * exitosamente desde la App Driver.
 *
 * ── COBERTURA — los 7 tramos y su TC de matriz ───────────────────────────────────────────────────
 *
 * | # | Actor                 | Hold | Tarjeta                                   | Ejes nuevos                                    | TC de matriz     |
 * |---|-----------------------|------|-------------------------------------------|------------------------------------------------|------------------|
 * | 1 | empresa individuo     | ON   | Visa AVS `…2223` → DELETE → MC `…2226`    | delete+re-add · PROGRAMADO 12:10 · Send Manual | `TS-EBIZ-TC1259` + `TC1261` |
 * | 2 | personal / app pax    | ON   | Amex `…2225`                              | —                                              | `TS-EBIZ-TC1256` |
 * | 3 | colaborador           | ON   | (sin form — método ya seleccionado)       | PRECIO MANUAL 33.33 → viaje CANCELADO          | ninguno (ver nota) |
 * | 4 | colaborador           | ON   | Amex `…2225`                              | —                                              | `TS-EBIZ-TC1060` |
 * | 5 | ⚠️ PENDIENTE-ACTOR    | OFF  | Amex `…2225`                              | apagado del toggle en Operational Preferences  | `TC1063` o `TC1059` |
 * | 6 | personal              | OFF  | EXISTENTE (no abre el form)               | tarjeta ya vinculada                           | `TS-EBIZ-TC1258` |
 * | 7 | empresa individuo     | OFF  | DELETE → Visa CVV2 `…2222`                | delete+re-add · SEND SERVICE (auto)            | `TS-EBIZ-TC1260` + `TC1262` |
 *
 * `TC1256`..`TC1262` se CREARON en la matriz a partir de esta grabación: los ejes que ejercitó no
 * existían como caso. Ver `docs/gateway-pg/ebizcharge/matriz_cases.md` §Personal, §Eliminación de
 * Tarjeta de la Wallet, §Alta de Viaje Programado y §Despacho.
 *
 * ── ⚠️ TRAMO 5: el actor está SIN RESOLVER ───────────────────────────────────────────────────────
 * El titular de la tarjeta dice "sinhold happycolaborador" pero el cliente seleccionado es
 * "Restrepo, Emanuel" — que en el tramo 6 es usuario PERSONAL. Los dos caminos acreditan TC
 * distintos, así que el tramo queda `PENDIENTE-ACTOR` hasta resolverlo en la DB:
 *
 *   · si el cliente es empresa con colaborador asociado → acredita `TS-EBIZ-TC1059`
 *   · si es personal                                    → acredita `TS-EBIZ-TC1063`, y
 *                                                          "colaborador sin hold" queda PENDIENTE
 *
 * Query (el `travelId` conocido es el del tramo 1: 67817; el resto se deriva por ventana):
 *
 *   SELECT t.id, t.created_at, t.status, c.name AS client_name, c.client_type, p.name AS passenger
 *   FROM   MGW.travels t
 *   JOIN   MGW.clients c ON c.id = t.client_id
 *   LEFT   JOIN MGW.passengers p ON p.id = t.passenger_id
 *   WHERE  t.id BETWEEN 67810 AND 67840 ORDER BY t.id DESC;
 *
 * ── TRAMO 3: por qué no acredita ─────────────────────────────────────────────────────────────────
 * Ejercitó el precio manual (33.33) sobre un viaje de colaborador y después lo CANCELÓ desde
 * gestión de viajes. Un viaje cancelado no acredita el happy path del hold, y "edición de precio en
 * el alta" tampoco es un eje de la matriz. Queda como observación: el precio manual convive con la
 * tarjeta preautorizada sin romper el alta.
 *
 * ── TARJETAS: las 5 son de test eBiz y las 5 son APROBADAS ───────────────────────────────────────
 * Verificado contra `tests/fixtures/gateways/ebizcharge/cards.ts`:
 *
 *   `4000100111112223` → EBIZ_AVS_REFERENCE  · AVS YYX  · approved
 *   `5555444433332226` → EBIZ_CVV2_REFERENCE · MC   CVV2 M · approved
 *   `371122223332225`  → EBIZ_CVV2_REFERENCE · Amex CVV2 M · approved
 *   `6011222233332224` → EBIZ_CVV2_REFERENCE · Disc CVV2 M · approved (intentada y abandonada, tramo 2)
 *   `4000200011112222` → EBIZ_CVV2_REFERENCE · Visa CVV2 M · approved
 *
 * Coherente con happy path: ninguna es de la serie de declines (`4000300…`).
 *
 * ── ⚠️ HALLAZGO CANDIDATO: la máscara del campo "Card number" y el Amex de 15 dígitos ───────────
 * Los dos tramos que usaron Amex necesitaron ~25 acciones de forcejeo (`ArrowRight` repetido +
 * refill) para dejar el número completo — ver el crudo, líneas 94-101 y 159-181. Amex agrupa 4-6-5
 * (`3711 222233 32225`), no 4-4-4-4, y la máscara parece pelearse con eso.
 *
 * NO está confirmado como defecto: puede ser artefacto del codegen (el `fill` de Playwright
 * reescribe el valor entero y la máscara reacciona en cada keystroke). Para confirmarlo hay que
 * reproducir a mano y observar si un humano también pierde dígitos.
 *
 * Lo mismo con el CVV: Amex pide 4 dígitos y el resto 3. En el tramo 2 se ve el ida y vuelta
 * (`123` → `1234` → `123` → `1235` → `3214`) hasta acertar. Si el form no indica el largo esperado
 * por marca, es un candidato a hallazgo de UX.
 *
 * ── VALIDACIÓN: sólo por DB o API, no por dashboard ──────────────────────────────────────────────
 * Sin acceso al dashboard de eBizCharge. El oráculo general del front —para cualquier acción, no
 * sólo pagos— es el MCP "Magiis BD de test":
 *
 *   SELECT l.* FROM MGW.logs AS l ORDER BY l.id DESC
 *
 * Para el cobro, el oráculo fuerte quedó establecido en el E2E #1 (CloudWatch `Test-Logs` →
 * `Test-PaymentGateway`, `us-east-2`): `command: 'capture'` + `resultCode: 'A'` +
 * `result: 'Approved'` + `refNum` == el `intentId` del hold.
 *
 * ── ORÁCULO QUE CAMBIA CON EL VIAJE PROGRAMADO ───────────────────────────────────────────────────
 * Un viaje con hora futura NO cae en la columna "Por asignar" sino en **Programados**. Al portar el
 * tramo 1, `expectPassengerInPorAsignar` no aplica — usar `TravelManagementPage.openScheduledTrips()`.
 * Es la razón por la que el eje `schedule` tiene que parametrizar el oráculo, no sólo el fill.
 *
 * ── IMPERFECCIONES CORREGIDAS respecto de la grabación cruda ─────────────────────────────────────
 * El crudo era `tests/test-1.spec.ts` (296 líneas, un solo `test()`). Se ELIMINÓ del repo: `testDir`
 * del config principal es `./tests` sin `testIgnore`, así que un `.spec.ts` ahí se COLECTA y CORRE —
 * con credenciales en claro y creando 6 viajes reales. Las referencias "crudo línea N" de abajo
 * apuntan a ese archivo; queda respaldado fuera del repo, no versionado.
 *
 *   · Credenciales de login hardcodeadas (crudo líneas 6 y 8) → env vars.
 *   · Los 7 tramos venían en UN solo `test()` sin separación: se segmentaron en `test.step`.
 *   · Forcejeo del número/CVV Amex (crudo 94-101 y 159-181, ~35 acciones) → un solo `fill` por
 *     campo, con el hallazgo documentado arriba en vez de replicado.
 *   · Clicks duplicados de dirección eliminados: crudo 188-197 (8 clicks al mismo "16000 Collins
 *     Avenue"), 218-225 (6 clicks alternando origen/destino), 150-156, 278-280.
 *   · `AudioVolumeUp` × 6 (crudo 266-271) — ruido de teclado capturado por el codegen, sin efecto.
 *   · Re-clicks de `Select User` (crudo 141-143, tres veces el mismo locator).
 *   · Se marcan FRAGILE los locators con índice de compilación Angular (`.ng-tns-c28-3`,
 *     `.ng-tns-c28-14`, `.ng-tns-c28-25`, `.ng-tns-c28-36`, `.ng-tns-c28-65`, `.ng-tns-c28-76`,
 *     `.ng-tns-c28-87`): el número cambia en cada build, NO portar tal cual.
 *   · `getByRole('textbox').nth(3)` (titular) y `input[type="password"]` (CVV) también son
 *     posicionales — al portar usar `NativeAngularCardForm`, que ya los resuelve.
 *   · La fase driver NO está en la grabación (se hizo en el device): queda como TODO por tramo.
 */
import { test } from '@playwright/test';

const CARRIER_EMAIL = 'remises.eeuu@yopmail.com';

/**
 * Tarjetas de test eBizCharge usadas. Todas aprobadas — ver la tabla del encabezado.
 * El ZIP NO se tipea: lo autocompleta el sistema al elegir la dirección (HALLAZGO 1 del E2E #1).
 */
const CARDS = {
	/** `EBIZ_AVS_REFERENCE` → AVS YYX. Vinculada y luego ELIMINADA en el tramo 1. */
	visaAvsYyx: {
		number: '4000 1001 1111 2223',
		expiry: '09/30',
		cvv: '321',
		holder: 'pasajero inviduo empresa',
		address: 'reconquista 661'
	},
	/** `EBIZ_CVV2_REFERENCE` → Mastercard CVV2 M. Re-vinculada tras el delete del tramo 1. */
	mastercard: {
		number: '5555 4444 3333 2226',
		expiry: '09/30',
		cvv: '123',
		holder: 'testcasewith deletecardandhold',
		address: 'ciudad de la paz 2238'
	},
	/** `EBIZ_CVV2_REFERENCE` → Amex CVV2 M. CVV de 4 dígitos, agrupamiento 4-6-5. */
	amex: { number: '3711 222233 32225', expiry: '09/30', cvv: '1234' },
	/** `EBIZ_CVV2_REFERENCE` → Visa CVV2 M. Re-vinculada tras el delete del tramo 7. */
	visaCvv2: {
		number: '4000 2000 1111 2222',
		expiry: '09/30',
		cvv: '123',
		holder: 'individuoempresa happy',
		address: 'ciudad de la paz 2238'
	}
} as const;

const ORIGIN = 'Ciudad de la Paz 2238, Buenos';
const DESTINATION = 'Reconquista 661, Buenos Aires';

test('[EXPLORATORIO][eBizCharge] 3 actores × Hold ON/OFF + delete/re-add de tarjeta + programado', async ({ page }) => {
	test.slow();

	await test.step('0. Login al dashboard de carrier', async () => {
		await page.goto('https://apps-test.magiis.com/#/authentication/login/carrier');
		await page.getByRole('textbox', { name: 'eMail' }).fill(CARRIER_EMAIL);
		await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PASS_CARRIER ?? '');
		await page.getByRole('button', { name: 'MAGIIS Account' }).click();
		await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 1 — empresa individuo · Hold ON · vincular → ELIMINAR → vincular otra · PROGRAMADO
	//           `TS-EBIZ-TC1259` (delete+re-add) + `TS-EBIZ-TC1261` (programado + asignación manual)
	//           travelId real: 67817
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('1. Empresa individuo · Hold ON · delete+re-add · viaje PROGRAMADO con asignación manual', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

		// FRAGILE: el cliente se abrió por `.row.justify-content-sm-end` (layout). Al portar:
		// `NewTravelPageBase.selectClient('emanu')`.
		await page.locator('.row.justify-content-sm-end').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('emanu');
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

		// Origen y destino ya venían precargados en el form (valores frecuentes del carrier).
		await page.getByText(ORIGIN).click();
		await page.getByText(DESTINATION).click();

		// Parada intermedia.
		await page
			.locator(
				'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill('ciudad de la paz 2238');
		await page.getByText('Ciudad de la Paz 2238, Buenos Aires, Argentina', { exact: true }).click();

		// ── 1.a Vincular la PRIMERA tarjeta (Visa AVS YYX) ────────────────────────────────────────
		// FRAGILE: `.ng-tns-c28-3` es índice de compilación Angular. Al portar:
		// `CarrierNewTravelPage` + `NativeAngularCardForm`.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.visaAvsYyx.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.visaAvsYyx.expiry);
		await page.locator('input[type="password"]').fill(CARDS.visaAvsYyx.cvv);
		await page.getByRole('textbox').nth(3).fill(CARDS.visaAvsYyx.holder);
		await page
			.locator(
				'.ng-untouched.ng-pristine.ng-invalid > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill(CARDS.visaAvsYyx.address);
		await page.getByRole('listitem').filter({ hasText: DESTINATION }).click();
		await page.getByRole('button', { name: 'Valid' }).click();

		// ── 1.b ELIMINAR la tarjeta recién vinculada ──────────────────────────────────────────────
		// EJE NUEVO: la matriz no tenía caso de eliminación de tarjeta de la wallet (sólo
		// desvinculación de PASARELA, TC1054). Al portar: `deleteHighlightedSavedCard()`.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
		await page
			.locator('.ng-star-inserted.highlighted > .data-with-icon-col > .deselect-payment-method > .fa')
			.click();
		await page.getByRole('button', { name: 'Delete' }).click();

		// ── 1.c Vincular una tarjeta DISTINTA (Mastercard) ────────────────────────────────────────
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.mastercard.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.mastercard.expiry);
		await page.locator('input[type="password"]').fill(CARDS.mastercard.cvv);
		await page.getByRole('textbox').nth(3).fill(CARDS.mastercard.holder);
		await page
			.locator(
				'.ng-untouched.ng-pristine.ng-invalid > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill(CARDS.mastercard.address);
		await page
			.locator('select-dropdown')
			.getByText('Ciudad de la Paz 2238, Buenos Aires, Argentina', { exact: true })
			.click();
		await page.getByRole('button', { name: 'Valid' }).click();

		// ── 1.d VIAJE PROGRAMADO: cambiar "Now" por una hora futura ───────────────────────────────
		// EJE NUEVO: la matriz sólo tenía EDICIÓN de programados (§310), no el alta.
		// Al portar: `setPickupTime('12:10 PM')`. El oráculo pasa a ser la columna Programados.
		await page.getByText('Now').first().click();
		await page.locator('#id_tab_add_travel').getByText('12:10 PM').click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();

		// ── 1.e Despacho MANUAL + asignación del conductor ────────────────────────────────────────
		// Al portar: `clickSendManualAndAssign()`.
		await page.getByRole('button', { name: 'Send Manual' }).click();
		await page.goto('https://apps-test.magiis.com/#/home/carrier/driver/list/Assign?id=67817&limitExceeded=false');
		await page.getByRole('button', { name: 'Total Fleet (10)' }).click();
		await page.getByText('Assign').nth(2).click();

		// TODO fase driver: aceptar → iniciar → finalizar → cobrar. Oráculo: `Ebiz::capture` +
		// `resultCode: 'A'` en CloudWatch. Se ejecutó en el device, fuera de esta grabación.
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 2 — personal / app pax · Hold ON · Amex nueva            `TS-EBIZ-TC1256` (CREADO)
	//           §116 de la matriz sólo tenía Hold OFF: este eje no existía.
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('2. Personal (app pax) · Hold ON · vincular Amex nueva', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('emanue');
		await page.locator('.data-with-icon-col').first().click();

		await page.getByText(ORIGIN).click();
		await page.getByText(DESTINATION).click();
		await page
			.locator(
				'.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder'
			)
			.click();
		await page.getByText('IFTS N°16, Teodoro García,').click();

		// FRAGILE: `.ng-tns-c28-14`.
		// En el crudo se tipeó primero la Discover `6011222233332224` y se abandonó sin validar;
		// se resolvió con la Amex. Ver el HALLAZGO del CVV/máscara en el encabezado.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-14').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.amex.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.amex.expiry);
		await page.locator('input[type="password"]').fill(CARDS.amex.cvv);
		await page.getByRole('textbox').nth(3).fill('amexhappyhold paxpax');
		await page
			.locator(
				'.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill('11000 collins avenue miami');
		await page.getByText('Collins Avenue, Miami Beach, FL, USA').click();
		await page.getByRole('button', { name: 'Valid' }).click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();
		await page.getByRole('button', { name: 'Send Manual' }).click();
		await page.getByText('Assign').nth(2).click();
		await page.getByRole('button', { name: 'Assign' }).click();
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 3 — colaborador · Hold ON · PRECIO MANUAL 33.33 → viaje CANCELADO
	//           NO acredita: viaje cancelado + el precio manual no es eje de la matriz.
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('3. Colaborador · Hold ON · precio manual 33.33 → cancelado (NO acredita)', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

		// Cliente = empresa contractor ("fast car"), pasajero = colaborador ("nay").
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('fast car');
		await page.locator('.data-with-icon-col').click();
		await page
			.locator(
				'.ng-tns-c28-25.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.first()
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
		await page.getByText(DESTINATION).click();

		await page.getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('nay');
		await page.locator('.highlighted > .data-with-icon-col').click();

		await page.locator('.bootstrap.width-combo.input-search.ng-dirty > .below > .single > .placeholder').click();
		await page.getByText('16001 Collins Avenue, North').click();
		await page.getByText('✕').nth(2).click();
		await page.getByText('Reconquista 661, Ciudad Autó').click();
		await page
			.locator(
				'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByText(ORIGIN).click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();

		// PRECIO MANUAL: dos toggles + el importe. Al portar: `setManualPrice(33.33)`.
		await page.locator('.form-group > .form-group > .switch > .switch-label').first().click();
		await page.locator('.form-group > .form-group > .switch > .switch-label').first().click();
		await page.getByRole('spinbutton').fill('33.33');
		await page.getByRole('button', { name: 'Send Manual' }).click();

		// Cancelación desde gestión de viajes → por eso el tramo no acredita el happy path.
		await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
		await page.locator('.action-btn.action-btn-red').click();
		await page.getByRole('button', { name: 'Continue' }).click();
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 4 — colaborador · Hold ON · Amex nueva                              `TS-EBIZ-TC1060`
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('4. Colaborador · Hold ON · vincular Amex nueva', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('fast');
		await page.getByText('fast car (+12545555555)').click();

		await page.getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('nay');
		await page.locator('.highlighted > .data-with-icon-col').click();

		// FRAGILE: `.ng-tns-c28-36`.
		await page
			.locator(
				'.ng-tns-c28-36.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.first()
			.click();
		await page.getByText('Reconquista 661, Ciudad Autó').click();
		await page
			.locator(
				'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByText(ORIGIN).click();

		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-36').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.amex.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.amex.expiry);
		await page.locator('input[type="password"]').fill(CARDS.amex.cvv);
		await page.getByRole('textbox').nth(3).fill('happycolaborador amexhold');
		await page
			.locator(
				'.ng-untouched.ng-pristine.ng-invalid > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill('16000 collins avenue');
		await page.getByRole('listitem').filter({ hasText: '16000 Collins Avenue, Sunny' }).click();
		await page.getByRole('button', { name: 'Valid' }).click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();
		await page.getByRole('button', { name: 'Send Manual' }).click();
		await page.getByText('Assign').nth(2).click();
		await page.locator('button').nth(3).click();
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 5 — ⚠️ PENDIENTE-ACTOR · Hold OFF · Amex nueva            `TC1063` o `TC1059`
	//           Acá se APAGA la pre-autorización del carrier: todo lo que sigue es Hold OFF.
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('5. Apagar pre-autorización + alta con Amex nueva (actor PENDIENTE de resolver en DB)', async () => {
		// ⚠️ DESTRUCTIVO sobre el carrier COMPARTIDO 1521: apagar el toggle envenena cualquier
		// spec de hold que corra después. Al portar, el motor lo restaura SIEMPRE (`holdMode`).
		await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
		await page.locator('a').filter({ hasText: 'Configuration' }).click();
		await page.getByRole('link', { name: 'Operational Preferences' }).click();
		await page.getByRole('heading', { name: 'Card Payments ►' }).click();
		await page.locator('.switch-handle').click();
		await page.locator('.form-group > .switch > .switch-label').click();

		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('emanue');
		// ⚠️ Cliente "Restrepo, Emanuel" pero titular "sinhold happycolaborador" — la contradicción
		// que deja el actor sin resolver. Ver la query del encabezado.
		await page.getByText('Restrepo, Emanuel (+541124048846)').click();

		await page.getByText(ORIGIN).click();
		await page.getByText(DESTINATION).click();
		await page
			.locator(
				'.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder'
			)
			.click();
		await page.getByText(ORIGIN).click();

		// FRAGILE: `.ng-tns-c28-65`.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-65').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.amex.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.amex.expiry);
		await page.locator('input[type="password"]').fill(CARDS.amex.cvv);
		await page.getByRole('textbox').nth(3).fill('sinhold happycolaborador');
		await page
			.locator(
				'.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
		await page.getByRole('listitem').filter({ hasText: DESTINATION }).click();
		await page.getByRole('button', { name: 'Valid' }).click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();
		await page.getByRole('button', { name: 'Send Manual' }).click();
		await page.getByText('Assign').nth(2).click();
		await page.getByRole('button', { name: 'Assign' }).click();
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 6 — personal · Hold OFF · tarjeta EXISTENTE                `TS-EBIZ-TC1258` (CREADO)
	//           §116 tenía 4 variantes de "vincular nueva", ninguna de tarjeta ya vinculada.
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('6. Personal · Hold OFF · usar tarjeta vinculada EXISTENTE (sin abrir el form)', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('eman');
		await page.getByText('Restrepo, Emanuel (+541124048846)').click();

		await page.getByText(ORIGIN).click();
		await page.getByText(DESTINATION).click();
		await page
			.locator(
				'.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder'
			)
			.click();
		await page.getByText(ORIGIN).click();

		// FRAGILE: `.ng-tns-c28-76`. La tarjeta ya está vinculada (la del tramo 5): se selecciona y
		// el form NO se abre. Al portar: `selectSavedCard()` / `cardFlow: 'existing'`.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-76').click();
		await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();
		await page.getByRole('button', { name: 'Send Manual' }).click();
		await page.getByText('Assign').nth(2).click();
		await page.getByRole('button', { name: 'Assign' }).click();
	});

	// ══════════════════════════════════════════════════════════════════════════════════════════════
	// TRAMO 7 — empresa individuo · Hold OFF · DELETE → Visa nueva · SEND SERVICE
	//           `TS-EBIZ-TC1260` (delete+re-add Hold OFF) + `TS-EBIZ-TC1262` (despacho automático)
	// ══════════════════════════════════════════════════════════════════════════════════════════════
	await test.step('7. Empresa individuo · Hold OFF · delete+re-add · SEND SERVICE (despacho automático)', async () => {
		await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
		await page.locator('#clientSelect').getByText('Select User').click();
		await page.getByRole('textbox', { name: 'User to Search' }).fill('eman');
		// Cliente DISTINTO del de los tramos 5-6: "smith, Emanuel" = empresa individuo.
		await page.getByText('smith, Emanuel (+1124048846)').click();

		await page.getByText(ORIGIN).click();
		await page.getByText(DESTINATION).click();
		await page
			.locator(
				'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByText(ORIGIN).click();

		// ── 7.a ELIMINAR la tarjeta vinculada ─────────────────────────────────────────────────────
		// FRAGILE: `.ng-tns-c28-87` + `.fa.fa-trash` por posición.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-87').click();
		await page.locator('.fa.fa-trash').first().click();
		await page.getByRole('button', { name: 'Delete' }).click();

		// ── 7.b Vincular una Visa nueva ───────────────────────────────────────────────────────────
		// Nota: el método sigue rotulado "Credit Card - Pre-Authorized" aunque el toggle del carrier
		// esté OFF — el label del método NO refleja el estado de la pre-autorización.
		await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-87').click();
		await page.locator('select-dropdown').getByText('Credit Card - Pre-Authorized').click();
		await page.getByRole('textbox', { name: 'Card number *' }).fill(CARDS.visaCvv2.number);
		await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARDS.visaCvv2.expiry);
		await page.locator('input[type="password"]').fill(CARDS.visaCvv2.cvv);
		await page.getByRole('textbox').nth(3).fill(CARDS.visaCvv2.holder);
		await page
			.locator(
				'.ng-untouched.ng-pristine.ng-invalid > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
			)
			.click();
		await page.getByRole('textbox', { name: 'Enter an address' }).fill(CARDS.visaCvv2.address);
		await page
			.locator('select-dropdown')
			.getByText('Ciudad de la Paz 2238, Buenos Aires, Argentina', { exact: true })
			.click();
		await page.getByRole('button', { name: 'Valid' }).click();

		await page.getByRole('button', { name: 'Select Vehicle' }).click();

		// ── 7.c SEND SERVICE: despacho automático, sin elegir conductor ───────────────────────────
		// EJE NUEVO: los tramos 1-6 usaron Send Manual + Assign. Al portar: `clickSendService()`.
		await page.getByRole('button', { name: 'Send Service' }).click();
	});

	// ⚠️ TODO al portar: RESTAURAR la pre-autorización a ON. El tramo 5 la apagó y esta grabación
	// NO la vuelve a encender — el carrier 1521 queda con Hold OFF para la próxima sesión.
});
