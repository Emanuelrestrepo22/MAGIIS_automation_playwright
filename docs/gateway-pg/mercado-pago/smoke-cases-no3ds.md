# MercadoPago — Smoke TEST (carrier Argentina) · Alcance funcional aprobado

> **Iteración:** cobertura inicial de la pasarela Mercado Pago en **TEST** (carrier Argentina, MP única PSP activa, sin 3DS).
> **Automatización:** web vía **`playwright codegen`** (grabar → convertir a specs KATA); mobile vía **Appium** (borradores autorados aparte).
> **Trigger MP:** el **nombre del titular** (`holderName` = keyword). Happy = `APRO` (con DNI `12345678`).

## Alcance en TEST (aprobado por negocio)

En TEST las tarjetas sandbox MP **no pueden transaccionar**. El negocio aprobó, para esta etapa, que solo sean
funcionales estos flujos (los demás E2E críticos se validan en **UAT con tarjetas reales** tras la estandarización con Stripe):

| # | Flujo funcional en TEST | Nivel |
|---|---|---|
| A | Wallet: adicionar / borrar tarjetas vinculadas (App Pax) | mobile |
| B | Alta de viaje **sin hold** con tarjeta vinculada → hasta creación (sin cobro) | web |
| C | Cargo a Bordo (tarjeta a bordo) → cobro desde App Driver **completa OK** | E2E (web→mobile) |
| D | Viaje calle → cobro desde App Driver **completa OK** | E2E (mobile) |

**Nota clave (gap conocido):** en el alta sin hold, la tarjeta vinculada crea el viaje pero **el cobro al aceptar
desde el driver NO completa** en TEST — comportamiento esperado y aprobado. En cambio Cargo a Bordo y viaje calle
**sí** completan el cobro desde el driver. El "por qué" de esa diferencia se documenta en la captura del modelo (§ final).

## Precondiciones

1. `.env.test` → carrier ARG (`USER_CARRIER`/`PASS_CARRIER`, `BASE_URL`, `CARRIER_ID`), sin definición EEUU que lo pise.
2. Mobile: `DRIVER_EMAIL`/`PASSENGER_EMAIL` (+ pass) del carrier ARG, `APPIUM_SERVER_URL` + `ANDROID_*`, app en TEST.
3. Mercado Pago vinculada y activa como única PSP del carrier ARG.
4. Solo TEST con tarjetas de prueba. Prohibido MP con tarjetas reales en UAT/PROD.

## Datos de tarjeta (fijos — `tests/fixtures/gateways/mercado-pago/cards.ts`)

| Campo | Valor |
|---|---|
| Número (Visa crédito default) | `4509953566233704` |
| CVV | `123` (Amex `1234`) |
| Expiración | `11/30` |
| Documento (`APRO` y `OTHE`) | DNI `12345678` |
| **Nombre del titular** | **el keyword** (`APRO` para happy) ← determina el outcome |

---

## Specs generados (drafts — pendiente corrida viva)

Convertidos de recordings del carrier ARG TEST (cliente individuo Emanuel mercadopago id=10785 / colaborador Emanuel Restrepo):
- **Alta sin hold · cliente individuo** (test-14) → `web/carrier/no-hold/cliente-individuo-no-hold.spec.ts` (`[MP-NOHOLD-CLIENTE-INDIVIDUO]`).
- **Alta sin hold · colaborador de empresa (carrier)** (test-16) → `web/carrier/no-hold/colaborador-no-hold.spec.ts` (`[MP-NOHOLD-02]`).
- **Alta sin hold · colaborador de empresa (contractor)** (test-15) → `web/contractor/no-hold/colaborador-empresa-no-hold.spec.ts` (`[MP-NOHOLD-04]`).
- **Wallet web add/delete** (test-14) → `web/carrier/wallet/cliente-individuo-add-delete-card.spec.ts` (`[MP-WALLET-WEB]`, superficie web del carrier, distinta del wallet mobile del Grupo A).
- **Helper** → `helpers/mercadoPago.helpers.ts` (`fillMercadoPagoNativeCard` + `validateAndSelectMercadoPagoCard`, form nativo MP + oráculo de vinculación).
- **Extensión POM** → `ContractorNewTravelPage.fillJourneyUntilPayment()` (journey contractor sin llenar tarjeta, para gateways no-Stripe).

**Grupo B completo** (cliente individuo + colaborador de empresa desde ambos portales). Compilan (tsc) y Playwright los lista. ⚠️ Locators FRAGILE (CVV `input[type=password]`, número de documento `nth(4)`, trash `ng-tns`) + reintento de `Validar` requieren confirmación en corrida viva.

---

## Grupo A — Wallet / administración de tarjetas (App Pax mobile · Appium)

| ID | Título | `holderName` | Resultado esperado |
|---|---|---|---|
| MP-WALLET-01 | Validar adicionar tarjeta a la billetera | `APRO` | Debería vincular la tarjeta y quedar visible en la billetera (`hasCard(last4)=true`) |
| MP-WALLET-02 | Validar borrar tarjeta de la billetera | — | Debería eliminar la tarjeta (`hasCard(last4)=false`) |

**Anclaje:** `tests/mobile/appium/passenger/PassengerWalletScreen.ts` (`openWallet`/`tapAddCard`/`fillCardForm`/`saveCard`/`hasCard`/`deleteCard`);
borrado también por API `helpers/card-precondition.ts` (`deletePassengerCard`). ⚠️ El form actual asume Stripe Elements — **variante MP pendiente** (ver captura).

---

## Grupo B — Alta de viaje SIN hold (web · codegen → spec KATA)

Termina en creación del viaje. **No** se valida el cobro (gap conocido → UAT).

| ID | Portal · Actor | Resultado esperado |
|---|---|---|
| MP-NOHOLD-01 | Carrier · cliente individuo (AppPax/personal) | Sin modal → viaje "Buscando chofer" (SEARCHING_DRIVER) |
| MP-NOHOLD-02 | Carrier · colaborador de empresa | "Buscando chofer" |
| MP-NOHOLD-04 | Contractor · colaborador de empresa | Redirige a `/contractor/dashboard` |

> **Nota (contexto MP):** "empresa" y "colaborador de empresa" son el **mismo actor** — un cliente empresa/contractor se opera a través de su colaborador. Por eso no hay un caso "Empresa" separado (el antiguo MP-NOHOLD-03 se fusiona con MP-NOHOLD-02/04). Grupo B queda en 3 casos distintos: cliente individuo + colaborador de empresa desde cada portal.

**Pasos base (a grabar con codegen):** login dispatcher/contractor → Hold **OFF** en preferencias operativas →
nuevo viaje (cliente/pasajero + origen/destino Buenos Aires) → tarjeta fija + **`holderName = APRO`** (+ DNI) →
seleccionar vehículo → enviar servicio → verificar "Buscando chofer" (o redirect dashboard en Contractor).

**Anclaje de conversión:** POMs `DashboardPage`, `OperationalPreferencesPage` (`setHoldEnabled(false)`), `NewTravelPage`,
`TravelManagementPage`, `ContractorNewTravelPage`; aserción `expectPassengerInPorAsignar(pax, undefined, 'Buscando chofer')`.
Tags: `@smoke @gateway-pg @mercado-pago @no-hold @happy`.

**Comando codegen (sesión limpia):** `cross-env ENV=test npx playwright codegen "$BASE_URL"`

---

## Grupo C — Cargo a Bordo E2E (web alta → App Driver cobra OK)

Fase web (alta) grabable con codegen; fase mobile (cobro driver) con Appium.

| ID | Actor | Resultado esperado |
|---|---|---|
| MP-CARGO-01 | AppPax | Alta desde carrier → driver acepta → finaliza → **cobra OK** (`waitForPaymentOutcome='success'`) |
| MP-CARGO-02 | Colaborador | E2E cobro OK |
| MP-CARGO-03 | Empresa | E2E cobro OK |

**Anclaje:** alta web con `selectPaymentMethod('CargoABordo')`; cobro mobile
`tests/mobile/appium/driver/DriverTripPaymentScreen.ts` (`fillCardForm`/`submitPayment`/`waitForPaymentOutcome`) +
`harness/DriverTripHappyPathHarness.ts` (`confirm→in-progress→resume→closed`). ⚠️ POM driver hardcodeado a Stripe — variante MP pendiente.

---

## Grupo D — Viaje calle E2E (driver-initiated · Appium)

| ID | Flujo | Resultado esperado |
|---|---|---|
| MP-CALLE-01 | Driver inicia viaje calle → finaliza → cobra tarjeta a bordo | Cobro satisfactorio → home `FROM_TRAVEL_CLOSED` |

**Anclaje:** script `tests/mobile/appium/scripts/start-viaje-calle-flow.ts` (selectores DOM P1→P10) + `DriverTripPaymentScreen`.
No hay POM/spec formal aún — se formaliza al automatizar.

---

## Fuera de alcance TEST (→ UAT con tarjetas reales)

- Hold ON / preautorización (todos los actores).
- Cobro E2E desde driver de tarjeta **vinculada** sin hold (no completa en TEST — gap conocido).
- Declines transaccionales (`OTHE`/`FUND`/`SECU`/… vía authorize/capture) y `DECLINE_CAPTURE`.
- 3DS (`HAPPY_AUTH`/`FAIL_AUTH`) — N/A en MP.
- Keyword `TEST` (regla de montos — outcome por monto, no por holderName).
- Demás E2E críticos post-estandarización Stripe.

## Captura del modelo de integración (desbloquea automatización — §2)

Registrar durante la ejecución/grabación (web y mobile):

- [ ] ¿Qué **form de tarjeta** presenta MP en cada superficie? (App Pax wallet add-card; App Driver Cargo a Bordo). ¿Checkout API / Card Payment Brick / Wallet? ¿Mismo shared form o difiere de Stripe Elements?
- [ ] ¿El `holderName` viaja tal cual y dispara el outcome? (confirmar `APRO`).
- [ ] ¿El campo **DNI** está expuesto en el form MAGIIS LATAM? ¿Cómo se envía?
- [ ] **Selectores** del form (web y mobile) para los POM MP.
- [ ] **Por qué el cobro de tarjeta vinculada no completa pero Cargo a Bordo sí**: capturar el punto exacto de fallo del cobro vinculado (para el reporte a negocio/dev y el gate UAT).

Volcar en [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4 y en los `webTodos`/`mobileTodos`/`validationTodos` del
[adapter](../../../tests/features/gateway-pg/helpers/adapters/mercadoPagoGatewayAdapter.ts).

## Registro de ejecución

| ID | Estado (Pass/Fail/Blocked) | Evidencia | Observaciones |
|---|---|---|---|
| MP-WALLET-01 | | | |
| MP-WALLET-02 | | | |
| MP-NOHOLD-01 (cliente individuo) | | | |
| MP-NOHOLD-02 (colaborador · carrier) | | | |
| MP-NOHOLD-04 (colaborador · contractor) | | | |
| MP-CARGO-01 | | | |
| MP-CARGO-02 | | | |
| MP-CARGO-03 | | | |
| MP-CALLE-01 | | | |

## Referencias

- [`matriz_cases.md`](./matriz_cases.md) — matriz completa `TS-MP-TCxxxx` (todos los keywords)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — mecanismo de trigger + tabla de keywords
- [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md) — bloqueantes de runtime (§2 integración)
- [`../../../tests/features/gateway-pg/specs/mercado-pago/README.md`](../../../tests/features/gateway-pg/specs/mercado-pago/README.md) — slot de specs
- Referencia web: `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` · mobile: `tests/mobile/appium/` + `tests/e2e/gateway/`
