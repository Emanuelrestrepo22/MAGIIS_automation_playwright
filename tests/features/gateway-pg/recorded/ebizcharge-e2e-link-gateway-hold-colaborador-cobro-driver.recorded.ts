/**
 * E2E eBizCharge — vinculación de pasarela + hold colaborador + cobro desde la Driver App
 * ========================================================================================
 * Grabación de REFERENCIA (`.recorded.ts`), no spec productivo: sirve para portar el flujo a la
 * factory. Ejecutado MANUALMENTE en vivo por el líder de QA el 2026-07-30 y **validado PASS** con
 * evidencia en tres fuentes (UI + `MGW.logs` + CloudWatch).
 *
 * ── COBERTURA — qué test cases cubre este E2E ────────────────────────────────────────────────
 *
 * TC de la matriz (`docs/gateway-pg/ebizcharge/matriz_cases.md`):
 *
 * | TC de matriz     | Sección                          | Cobertura de este E2E |
 * |------------------|----------------------------------|-----------------------|
 * | `TS-EBIZ-TC1051` | §Configuración de Pasarela       | ✅ COMPLETA — vincular con credenciales válidas y reflejar estado vinculado |
 * | `TS-EBIZ-TC1058` | §Alta de Viaje Carrier Colaborador | ✅ COMPLETA — vincular tarjeta + alta de viaje + Hold desde carrier + **Cobro desde App Driver** |
 * | `TS-EBIZ-TC1055` | §Configuración de Pasarela       | 🟡 PARCIAL — se observó el efecto (las otras PSP quedan "No Disponible") pero NO se intentó vincular otra |
 * | `TS-EBIZ-TC1057` | §Configuración de Pasarela       | 🟡 PARCIAL — el link tuvo éxito, pero NO se capturó el status HTTP 200 del request |
 *
 * `TS-EBIZ-TC1058` es el caso central: su texto pide exactamente "vincular tarjeta y Alta de Viaje
 * desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada
 * Hold(desde carrier) y Cobro desde App Driver" — los tramos 3 y 4 de esta grabación.
 *
 * ── ⚠️ XRAY: NO hay Test donde marcar PASS este happy path ──────────────────────────────────
 * Consultado el 2026-07-30 (`project = MG AND labels = ebizcharge`): existen SÓLO 3 Xray Tests
 * de eBizCharge, y ninguno es este flujo:
 *
 *   · MG-145 — vincular EBIZ SIN `zipCode` → espera `ZIPCODE_MISSING`            (unhappy)
 *   · MG-151 — alta de tarjeta EBIZ SIN dirección del pax → `PASSENGER_ADDRESS_NOT_FOUND` (unhappy)
 *   · MG-476 — alta por modales `odnService` (no `vendor/`)                       (otro alcance)
 *
 * Los tres están en "Tareas por hacer". Coincide con el registry: `xray-keys.ts` tiene TODAS las
 * keys de eBiz en `null` (`summary.ebizcharge.with_mg_key = 0`).
 *
 * ⇒ CONSECUENCIA: la evidencia de este E2E va a **Allure**, no a Xray. Para poder acreditarlo en
 *   el Test Execution **MG-559** (ATR eBizCharge) hay que CREAR primero los Xray Tests del happy
 *   path — crear entidades Xray en MG está permitido; crear/transicionar incidencias de producto
 *   en MG, no (los defects van a DEV/MX).
 *
 * ── RELACIÓN CON MG-151: este E2E valida su precondición desde el lado POSITIVO ──────────────
 * MG-151 es el caso NEGATIVO (pax SIN dirección → error). Este E2E ejercitó el POSITIVO: con una
 * dirección válida el alta de tarjeta se aprueba. No acredita MG-151, pero confirma en vivo el
 * delta que MG-151 documenta: **el alta de tarjeta eBiz exige la dirección (`placeId`) del pax**.
 * Es la misma precondición que la matriz anota en §Alta de Viaje Carrier Colaborador.
 * Lo mismo aplica a MG-145 y el `zipCode` del carrier en el tramo de vinculación.
 *
 * Flujo validado en vivo por el líder de QA (los 4 tramos):
 *   1. Login al dashboard de carrier.
 *   2. MAGIIS Apps Store → DESVINCULAR Authorize + VINCULAR la cuenta sandbox de eBizCharge.
 *   3. Alta de viaje con pasajero COLABORADOR + alta de tarjeta Visa happy path.
 *   4. App Driver: aceptar viaje → iniciar viaje → finalizar y cobrar.
 *
 * ── HALLAZGO 1: eBizCharge pide DIRECCIÓN y autocompleta el ZIP ──────────────────────────────
 * El form de tarjeta de eBiz tiene un campo que NO existe en las otras pasarelas: un
 * autocomplete de DIRECCIÓN ("Enter an address"). Al elegir una dirección válida el sistema
 * **autocompleta el código postal**. Authorize pide el ZIP a mano y Stripe/MP no piden dirección.
 *
 * Impacto en el código: `ebizchargeGatewayAdapter` NO declara `nativeExtraField`, así que
 * `NativeAngularCardForm` no llena ningún 5.º campo para eBiz — y este flujo necesita DOS
 * (dirección + el ZIP derivado). Hay que modelar un `nativeExtraField: 'address'` cuyo fill
 * seleccione del autocomplete y luego ASEVERE que el ZIP se autocompletó, en lugar de tipearlo.
 *
 * ── HALLAZGO 2: el modal de vinculación tiene 4 campos y el adapter declara 3 env keys ───────
 * Campos reales del modal (verificados acá):
 *   EBizSubscription-Key · Security Id · User Id · Password        → botón "Save"
 * `ebizchargeGatewayAdapter.credsEnvKeys` sólo tiene:
 *   EBIZ_MERCHANT_USER · EBIZ_MERCHANT_PASSWORD · EBIZ_SECURITY_KEY
 * Falta una env var para el **Subscription-Key**. Mapeo propuesto:
 *   User Id → EBIZ_MERCHANT_USER · Password → EBIZ_MERCHANT_PASSWORD
 *   Security Id → EBIZ_SECURITY_KEY · EBizSubscription-Key → EBIZ_SUBSCRIPTION_KEY (NUEVA)
 *
 * ⚠️ Las 4 credenciales estaban HARDCODEADAS en esta grabación. Se movieron a env vars: el
 * archivo está gitignored, pero dejarlas en claro es exactamente lo que ya obligó a ignorar
 * `authorize2e2_happypath.ts` y `tests/recordings/*`. Cargarlas en `.env.test` —hoy las tres
 * que el adapter espera están AUSENTES, así que sus 23 tests skipean por `isConfigured()`.
 *
 * ── VALIDACIÓN: sólo por DB o API, no por dashboard ──────────────────────────────────────────
 * No hay acceso al dashboard de eBizCharge, así que las transacciones se verifican vía el MCP
 * "Magiis BD de test" (o por API). Tabla y query usadas:
 *
 *   SELECT l.* FROM MGW.logs AS l ORDER BY l.id DESC
 *
 * Evidencia del pago de este flujo (2026-07-30, travel 67815, customer 9869, carrier 1521):
 *   184391  request   /payment/hold      Payment::holdCard     amount 180.31   13:07:52
 *   184392  ebiz      /payment           Ebiz::hold            ref "3234121359" 13:07:54
 *   184393  request   /payment/capture   Payment::captureCard  amount  18.26   13:17:17
 *   184394  ebiz      /payment           Ebiz::capture         ref "3234121359" 13:17:19
 *   184395  response  /payment/capture   Payment::captureCard  {"result":"OK",
 *                                        "transactionStatus":"confirmed"}       13:17:19
 *
 * Dos observaciones: el HOLD reserva el monto del viaje (180.31) y el CAPTURE cobra otro
 * (18.26) ~10 min después; ambos comparten el `transactionRef` de eBiz. Eso da el oráculo de
 * la fase driver: `Ebiz::capture` + `result: "OK"` + `transactionStatus: "confirmed"`.
 * Otras tablas disponibles en la conexión: MGW_LINKED · USER_WALLET · CARD · MGW.
 *
 * ── SEGUNDA VÍA DE VALIDACIÓN: CloudWatch (AWS) ──────────────────────────────────────────────
 * Log group `Test-Logs` → stream `Test-PaymentGateway`, región `us-east-2`. Backend NestJS.
 * Es la vía MÁS PRECISA porque muestra el payload y la respuesta cruda de eBizCharge:
 *
 *   captureCard: { carrier: 1521, amount: 18.26, gatewayCode: 'EBIZ', description: '<origen> =>
 *                  <destino> (smith Emanuel)', intentId: 3234121359, commission: 0.91 }
 *   runTransaction.body { … refNum: '3234121359', command: 'capture' … }
 *   runTransaction.data { runTransactionResult: { resultCode: 'A', result: 'Approved',
 *                         remainingBalance: 0, refNum: '3234121359' } }
 *
 * ORÁCULO DEFINITIVO del cobro eBiz (más fuerte que el de MGW.logs):
 *   `command: 'capture'` + `resultCode: 'A'` + `result: 'Approved'` + `refNum` == el intentId.
 *
 * ── 🔴 HALLAZGO DE SEGURIDAD (reportar a DEV/MX, no a MG) ────────────────────────────────────
 * CloudWatch loguea las CREDENCIALES DEL MERCHANT en TEXTO PLANO:
 *
 *   { password: '<securityId>', userId: '<userId>', securityId: '<securityId>' }
 *
 * Dos problemas en esa única línea:
 *   1. Las credenciales de la pasarela quedan expuestas a cualquiera con acceso al log group.
 *      Deben enmascararse antes de loguear. Aplica a cualquier ambiente, no sólo TEST.
 *   2. `password` y `securityId` llevan el MISMO valor — el del campo "Security Id" del modal,
 *      NO el del campo "Password" que se cargó al vincular. O el backend manda el securityId
 *      como password, o el password real viaja por otra vía. La transacción salió `Approved`
 *      igual, así que hay que confirmar cuál de las dos cosas es.
 * (Los valores concretos NO se transcriben acá a propósito.)
 *
 * ── ⚠️ HALLAZGO: el viaje quedó con ORIGEN == DESTINO ───────────────────────────────────────
 * El `description` del capture muestra el MISMO lugar como origen y destino
 * ("Reconquista 661 … => Reconquista 661 …"), cuando en el flujo se eligió "Cazadores 1987"
 * como destino. Encaja con el defecto de `searchPlace` corregido el 2026-07-29 para el ORIGEN
 * (el shortcut `keepExistingOnNoResults` cortaba antes del retry y conservaba el valor previo):
 * el destino usa el mismo helper con `keepExistingOnNoResults: false`, así que hay que verificar
 * si el problema es de fill o de cómo el backend arma la descripción.
 *
 * ── ⚠️ DATO DE NEGOCIO no documentado: COMISIÓN ─────────────────────────────────────────────
 * `commission: 0.91` sobre `amount: 18.26` = exactamente 5%. No está en la matriz de eBiz.
 * Si la comisión es parte del contrato, merece su propio caso de prueba.
 *
 * ── IMPERFECCIONES CORREGIDAS respecto de la grabación cruda ─────────────────────────────────
 *   · NO COMPILABA: el string 'Confirm' quedó partido en la línea 14 con dos líneas de otro
 *     tramo insertadas en el medio (`Unterminated string literal`), y el archivo cerraba con
 *     `});` + `})` duplicado.
 *   · Credenciales hardcodeadas → env vars.
 *   · Clicks duplicados del codegen (mismo locator 2-4 veces seguidas) eliminados.
 *   · `page.goto` redundantes tras acciones que ya navegan.
 *   · Los dos clicks a "In Progress (1)" / "Finalized (0)" estaban DUPLICADOS y fuera de orden
 *     (aparecían dentro del tramo de desvinculación y otra vez al final).
 *   · Se marcan los locators frágiles que hay que reemplazar al portar: clases Angular
 *     generadas (`.ng-tns-c27-3`, `.bootstrap.width-combo…`) y `getByRole('textbox').nth(N)`.
 *   · La fase driver (tramo 4) NO está en la grabación: se deja como TODO explícito.
 */
import { test } from '@playwright/test';

/** Credenciales del modal de vinculación de eBizCharge — ver HALLAZGO 2. */
const EBIZ = {
	subscriptionKey: process.env.EBIZ_SUBSCRIPTION_KEY ?? '',
	securityId: process.env.EBIZ_SECURITY_KEY ?? '',
	userId: process.env.EBIZ_MERCHANT_USER ?? '',
	password: process.env.EBIZ_MERCHANT_PASSWORD ?? ''
};

/** Tarjeta happy path de eBiz — coincide con `EBIZ_TEST_CARDS.…number = '4000100011112224'`. */
const CARD = {
	number: '4000 1000 1111 2224',
	expiry: '09/30',
	cvv: '123',
	holder: 'smith Emanuel',
	/** El ZIP NO se tipea: lo autocompleta el sistema al elegir la dirección (HALLAZGO 1). */
	address: '1234 Main street',
	addressOption: 'Main Street, Los Angeles, CA, USA'
};

test('[EXPLORATORIO][eBizCharge] switch de pasarela + alta de viaje colaborador + cobro driver', async ({ page }) => {
	// ── 1. Login al dashboard de carrier ───────────────────────────────────────────────────────
	await page.goto('https://apps-test.magiis.com/#/authentication/login/carrier');
	await page.getByRole('textbox', { name: 'eMail' }).fill('remises.eeuu@yopmail.com');
	await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PASS_CARRIER ?? '');
	await page.getByRole('button', { name: 'MAGIIS Account' }).click();

	// ── 2. Apps Store: desvincular Authorize y vincular eBizCharge ─────────────────────────────
	// DESTRUCTIVO sobre el carrier COMPARTIDO 1521: el unlink dispara `cleaningWallets` y la
	// exclusividad deja a las demás pasarelas en "No Disponible". Correr sólo en ventana exclusiva.
	await page.locator('a').filter({ hasText: 'Configuration' }).click();
	await page.getByRole('link', { name: ' MAGIIS Apps Store' }).click();

	await page.getByText('Unlink').first().click();
	await page.getByRole('button', { name: 'Confirm' }).click();
	// Confirmación del backend: "The unlinking process…".
	await page.getByText('The unlinking process').click();

	// FRAGILE: `Link` por posición (nth(3)) — al portar, scopear a la card de eBizCharge.
	await page.goto('https://apps-test.magiis.com/#/home/carrier/integrations/list');
	await page.getByText('Link').nth(3).click();

	await page.getByRole('textbox', { name: 'EBizSubscription-Key' }).fill(EBIZ.subscriptionKey);
	await page.getByRole('textbox', { name: 'Security Id' }).fill(EBIZ.securityId);
	await page.getByRole('textbox', { name: 'User Id' }).fill(EBIZ.userId);
	await page.getByRole('textbox', { name: 'Password' }).fill(EBIZ.password);
	await page.getByRole('button', { name: 'Save' }).click();

	// ── 3. Alta de viaje: cliente contractor + pasajero COLABORADOR + tarjeta nueva ─────────────
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

	// Cliente = empresa contractor ("fast car").
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('fast');
	await page.locator('.data-with-icon-col').first().click();

	// Pasajero = colaborador de ese contractor.
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('eman');
	await page.locator('.highlighted > .data-with-icon-col').click();

	// FRAGILE: `.ng-tns-c27-3` es una clase GENERADA por Angular — cambia entre builds.
	await page.locator('.ng-tns-c27-3.ng-untouched > div > .search-container .placeholder').first().click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.multiple-destination-container .placeholder').click();
	await page.getByText('Cazadores 1987, Ciudad Autó').click();

	// Método de pago → tarjeta preautorizada.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c27-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

	// Form de tarjeta (nativo Angular, igual que Authorize).
	await page.getByRole('textbox', { name: 'Card number *' }).fill(CARD.number);
	await page.getByRole('textbox', { name: 'MM/AA' }).fill(CARD.expiry);
	// El CVV es input[type=password], NO expone rol textbox — por eso el orden posicional salta.
	await page.locator('input[type="password"]').fill(CARD.cvv);
	// FRAGILE: titular por posición.
	await page.getByRole('textbox').nth(3).fill(CARD.holder);

	// ⭐ HALLAZGO 1 — campo DIRECCIÓN exclusivo de eBizCharge: al elegir la sugerencia, el
	// sistema AUTOCOMPLETA el ZIP. NO tipear el ZIP a mano: la grabación cruda hacía
	// `.nth(4).fill('900159')` (6 dígitos, y los ZIP de US son 5), que es ruido del codegen
	// sobre un valor que el sistema ya había puesto. Al portar: aseverar el ZIP, no escribirlo.
	await page.getByRole('textbox', { name: 'Enter an address' }).fill(CARD.address);
	await page.getByRole('listitem').filter({ hasText: CARD.addressOption }).first().click();
	// TODO(portar): expect(zipField).not.toHaveValue('') — verificar el autocompletado.

	await page.getByRole('button', { name: 'Valid' }).click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// Post-submit el portal se queda en /travel/create?limitExceeded=false con el viaje YA creado
	// (comportamiento normal del producto, ver BL-001) — no es un error.
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();

	// ── 4. App Driver: aceptar → iniciar → finalizar y cobrar ──────────────────────────────────
	// TODO(appium): la grabación NO cubre este tramo (es web-only). En la suite lo hace
	// `CargoABordoSteps.driverAppStep` con `APPIUM=1` + `CARGO_MANUAL_ASSIGN=1`, y requiere el
	// pickup dentro de la geocerca del device (`DRIVER_E2E_PICKUP`).
	// Estas pestañas son el reflejo WEB del avance del driver:
	await page.getByRole('link', { name: 'In Progress (1)' }).click();
	await page.getByRole('link', { name: 'Finalized (0)' }).click();

	// ── 5. Validación del cobro — SIN dashboard eBiz, hay DOS vías ─────────────────────────────
	//
	// (a) DB, vía MCP "Magiis BD de test":
	//        SELECT l.* FROM MGW.logs AS l ORDER BY l.id DESC
	//     Esperado: `Ebiz::hold` con el monto del viaje → `Ebiz::capture` con el monto cobrado →
	//     response {"result":"OK","transactionStatus":"confirmed"}.
	//
	// (b) CloudWatch (`Test-Logs` / `Test-PaymentGateway`, us-east-2) — MÁS PRECISA, muestra el
	//     payload y la respuesta cruda de la pasarela. Oráculo definitivo:
	//        command: 'capture' · resultCode: 'A' · result: 'Approved' · refNum == intentId
	//
	// Al portar a spec: (b) es el assert del cobro y (a) sirve para correlacionar hold↔capture
	// por `transactionRef`. Ninguna de las dos es alcanzable desde Playwright directamente —
	// requieren el MCP de DB o la API de CloudWatch, así que el spec web debe dejar el
	// `intentId`/`travelId` en el JourneyContext para que la validación se haga después.
});
