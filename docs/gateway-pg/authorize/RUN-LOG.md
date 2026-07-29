> Este archivo se creó en la rama `carrier/gateway-standardization` siguiendo el formato del
> RUN-LOG de la campaña de outcomes (rama `carrier/ebiz-matrix-standardization`). Aquélla midió el
> **área C** (alta de tarjeta) y el **área F por intent**; ésta arranca por el **área E/F de la
> suite HOLD**: los happy paths de alta de viaje con pre-autorización activa.

# Authorize — log de corridas de la suite HOLD

Entorno: `test` (apps-test) · Carrier **1521** (Remises EEUU) · Pasarela **Authorize.Net vinculada**.
Motor: `helpers/stepwise-hold-journey.ts` · Taxonomía: `GatewayHoldCase` (14 casos) ·
Factory: `specs/_parametrized/factories/hold.factory.ts`.

---

# Happy paths Hold ON (2026-07-29)

Objetivo de la ronda: convertir en **acreditada** la cobertura que hasta hoy estaba sólo
**declarada**. Antes de esta corrida **ningún** test de la factory de hold se había ejecutado nunca
— la verificación era estática (`tsc` + `eslint` + `--list`), y así lo declaraba el docblock de
`hold.factory.ts`. Los 5 casos happy con Hold ON son el subconjunto de esta ronda.

## Precondición verificada

- `curl --ssl-no-revoke https://apps-test.magiis.com/magiis-v0.2/` → **403** (vivo) antes de arrancar.
- Authorize = `linked` en el carrier 1521. Stripe / MercadoPago / eBizCharge = `unavailable` por la
  **regla de exclusividad** (no es un bloqueo de backend).
- El motor **asevera** (no escribe) `readHoldEnabled() === true` en cada caso Hold ON, así que los 5
  verdes de esta tabla se midieron con la pre-autorización **efectivamente activa**. Ésa es la deuda
  vieja que el eje `holdMode` vino a cerrar: antes un carrier con el toggle en OFF acreditaba un TC
  "Hold ON" igual, porque sin hold el viaje también queda "Por asignar".

### Límite de alcance declarado (no es un bloqueo de esta ronda)

La cuenta de Authorize de `.env.test` está en **Test Mode enlatado**: devuelve `responseCode 1`
(aprobado) para todos los triggers. Para un **happy path eso es exactamente el resultado correcto y
suficiente** — el caso pide que la pasarela apruebe. Lo que **no** se puede leer de estos verdes es
cobertura de rechazo: un verde en un caso de *decline* de Authorize sería el resultado esperado de
una cuenta que aprueba todo, no evidencia de cobertura. Los declines quedan fuera de esta ronda.

## Resultado por caso

| # | Caso (`GatewayHoldCase`) | TC de matriz | Resultado | Clasificación |
|---|---|---|---|---|
| 1 | `personalHappyHoldOn` | TS-AUTHORIZE-TC1011 (§2.1) | ✅ **verde 3/3** (42.7 / 41.8 / 41.8s) | control positivo sólido — sin tocar código |
| 2 | `colaboradorHappyNewHoldOn` | TS-AUTHORIZE-TC1051 (§3.1) | ❌ rojo 3/3 pre-fix → **1 verde / 2 rojos post-fix** (ronda 2) | **defecto de NUESTRO código** — hallazgo 2 cerrado, hallazgos 4 y 5 abiertos |
| 3 | `empresaHappyNewHoldOn` | TS-AUTHORIZE-TC1061 (§4.1) | ❌ rojo 3/3 pre-fix → **1 verde / 2 rojos post-fix** (ronda 2) | ídem caso 2 — mismos dos modos, mismo orden |
| 4 | `colaboradorHappyExistingHoldOn` | TS-AUTHORIZE-TC1053 (§3.1) | ❌ rojo 3/3 pre-fix → ✅ **verde 2/2 post-fix** (35.7 / 42.4s) | **defecto de NUESTRO locator** (hallazgo 1). 3ª repetición perdida por ENVIRONMENT |
| 5 | `empresaHappyExistingHoldOn` | TS-AUTHORIZE-TC1062 (§4.1) | ⏭️ skip 3/3 pre-fix (cascada serial) → ✅ **verde 1/1 post-fix** (34.1s) | ídem caso 4. 2 repeticiones perdidas por ENVIRONMENT |

Los casos 4 y 5 son **el eje que nunca se había ejercitado** (`cardFlow: 'existing'`). Su primer
verde de la historia es de esta ronda.

## Acreditado vs declarado

| Caso | Antes de esta ronda | Después de esta ronda |
|---|---|---|
| `personalHappyHoldOn` | declarado (verificación estática) | **acreditado** — verde 3/3 con hold aseverado ON |
| `colaboradorHappyNewHoldOn` | declarado | **NO acreditado** — 1 verde / 2 rojos en la re-corrida (ronda 2). Primer verde de su historia, pero el 3/3 no se alcanzó |
| `empresaHappyNewHoldOn` | declarado | **NO acreditado** — ídem, con los mismos dos modos de fallo en el mismo orden |
| `colaboradorHappyExistingHoldOn` | declarado, eje **nunca ejercitado** | **acreditado (2 corridas limpias)** — falta la 3ª para cerrar el 3/3 |
| `empresaHappyExistingHoldOn` | declarado, eje **nunca ejercitado** | **acreditado (1 corrida limpia)** — faltan 2 para cerrar el 3/3 |

Regla aplicada: **una corrida perdida por ENVIRONMENT se descarta, no se cuenta como rojo ni como
verde**, y no habilita relajar nada. Por eso los casos 4 y 5 figuran con las corridas limpias que
tienen, no con un 3/3 que no se midió.

## Lo que se OBSERVÓ del eje `cardFlow: 'existing'`

El docblock de `hold.factory.ts` listaba dos supuestos **sin observar** para este eje. Los dos
quedaron resueltos, y uno de los dos resultó **falso**:

| Supuesto declarado sin observar | Observación en vivo |
|---|---|
| "que el desplegable de Forma de Pago exponga la tarjeta guardada **tal como la busca** `selectSavedPreauthorizedCard`" | **PARCIALMENTE FALSO.** El desplegable **sí** publica la tarjeta guardada — el snapshot del fallo la muestra como una opción propia, `Tarjeta de crédito VISA *** 1111`, con su ícono de borrado al lado. Lo que estaba mal era **el locator**: no la encontraba (hallazgo 1). |
| "que con tarjeta ya vinculada **'Seleccionar Vehículo' habilite sin pasar por 'Validar'**" | **CONFIRMADO.** Con `cardFlow: 'existing'` el motor **no emite** los pasos de fill ni de "Validar" (se ve en la numeración por orden de emisión: el paso 8 es "Seleccionar la tarjeta pre-autorizada YA VINCULADA" y el siguiente ya es el de 3DS), y aun así `waitForVehicleSelectionReady()` pasó y el alta se completó con `POST /travels` devolviendo id. O sea: **la tarjeta ya vinculada habilita el armado del viaje sin un segundo hold de vinculación**, que es exactamente lo que la matriz distingue entre "tarjeta nueva" y "tarjeta vinculada existente". |

Tercer punto verificado, del oráculo final: el viaje llegó a la grilla de Gestión de Viajes y la fila
matcheó `HOLD_APPROVED_ROW_STATUS` (`Buscando chofer|Searching Driver|En progreso|In Progress|Viaje
programado|Scheduled Trip`) — la assertion compara el **texto de la fila**, no lee el campo `state`
de la respuesta del alta. Es decir: **"Por asignar" + estado post-hold-aprobado están acreditados por
UI**; el literal `SEARCHING_DRIVER` del `POST /travels` no lo lee este motor (eso lo mide
`hold-area-f-probe`).

---

## Hallazgo 1 — `savedCardByLast4` resolvía al `<select-dropdown>`, no a la fila de la tarjeta

**Defecto de nuestro código de test.** Es la causa raíz de los 3 rojos pre-fix del caso 4 (y, por
cascada serial, de los 3 skips del caso 5).

El locator anclaba en `.ng-star-inserted`:

```ts
.locator('#add_travel_payment_methods').locator('.ng-star-inserted')
  .filter({ has: … '.deselect-payment-method' }).filter({ hasText: last4 })
```

Angular pone esa clase en **muchos** nodos del componente, incluido el `<select-dropdown>` que
envuelve a todo el desplegable. `.first()` resolvía a ese **envoltorio**, que está `hidden`:

```
14 × locator resolved to <select-dropdown … ng-reflect-is-below="false">…</select-dropdown>
     - unexpected value "hidden"
Error: La tarjeta •••• 1111 no figura entre las vinculadas en Forma de Pago: "Cuenta Corriente".
```

Y el snapshot del MISMO fallo mostraba el desplegable **abierto**, con la tarjeta publicada:

```yaml
- generic [ref=e434]: { Cuenta Corriente, ▲ }        # selector, ABIERTO
- list:
  - listitem: Cuenta Corriente
  - listitem: Tarjeta de Crédito - Cargo a Bordo
  - listitem: Tarjeta de Crédito - Preautorizada
  - listitem: { "Tarjeta de crédito VISA *** 1111", <ícono de borrado> }
```

Por qué el defecto era **invisible** hasta esta corrida: `hasSavedCardWithLast4()` decide con
`count() > 0`, y `count()` mide **presencia en el DOM**, no visibilidad. El envoltorio oculto
contaba, así que la precondición del caso decía "la tarjeta está" (correcto, por casualidad) y el
paso siguiente moría al intentar hacerla visible. Misma familia que las trampas de vacuidad ya
documentadas: un lector de presencia no es un oráculo de estado.

**Fix (endurecimiento):** anclar en el `role=listitem` — la opción real del desplegable — que es el
mismo ancla que `chooseNewPreauthorizedCardOption()` ya venía resolviendo bien. El locator pasa a
apuntar a lo que su JSDoc dice que apunta. **No se relajó ninguna aserción**: el `toBeVisible()` que
fallaba sigue ahí, y ahora falla si la tarjeta de verdad no está.

## Hallazgo 2 — el click en `.highlighted` selecciona el método equivocado y cierra el desplegable

**Defecto de nuestro código de test.** Causa de 2 de los 3 rojos del caso 2 y de 2 de los 3 del caso 3.

`selectPreauthorizedCardMethod()` tiene una rama "pax CON tarjeta previa" que replica la grabación
validada: seleccionar la tarjeta guardada es lo que expone su ícono de borrado. Para seleccionarla
clickeaba `.highlighted` — la opción **resaltada**, o sea la **actualmente elegida**.

Ese supuesto sólo vale cuando el sistema ya eligió la tarjeta solo. Si el método por defecto del
pasajero es **otro**, `.highlighted` es ese otro: el click lo **selecciona**, el desplegable se
**cierra**, y el trash desaparece del DOM. El timeout cae en el trash de fallback:

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
  - waiting for locator('#add_travel_payment_methods').locator('.deselect-payment-method').first()
```

Y el snapshot del fallo muestra **Forma de Pago = "Cuenta Corriente"** con el desplegable ya cerrado
(`▼`) — el método equivocado, seleccionado por el propio test. Es la reaparición del mismo problema
que el scope a `#add_travel_payment_methods` había mitigado el 2026-07-28: acotar el `.highlighted`
al desplegable correcto no alcanza si dentro de ese desplegable la opción resaltada no es la tarjeta.

**Fix (endurecimiento):** clickear `.highlighted` **sólo** cuando la opción resaltada es la tarjeta
(`hasSelectedCardWithLast4(last4)`). Cuando la tarjeta está sólo **listada**, su fila ya trae su
propio trash, así que basta con dejar el desplegable abierto y delegar en
`deleteHighlightedOrByLast4`, que ya prefiere el trash de la fila que matchea `last4`. Cero
aserciones tocadas; la post-condición del borrado y la del motor (`hasSavedCardWithLast4=== false`
antes de llenar el form nuevo) siguen intactas.

## Hallazgo 3 — la precondición API de tarjeta no apunta al pasajero del caso (gap, no arreglado)

Es la razón por la que el hallazgo 2 se manifestó: si el borrado por API hubiera limpiado la tarjeta
del pasajero del caso, la rama "pax CON tarjeta" no se habría ejecutado.

`cleanupCardsByLast4(page, defaults.paxSearchQueries, last4)` recibe una lista **ciega y compartida
por los tres actores** — para Authorize `['smith', 'fast', 'Emanuel']` — y **corta en la primera
query que borró algo**. Dos consecuencias medidas:

1. **La query puede resolver un pasajero distinto al del caso.** `getPassengerId` toma el **primer**
   resultado de `?lastName=<query>`, así que `'smith'` puede caer en otro pasajero (p. ej.
   `Nayla Smith`, el colaborador *sin* tarjeta) y el corte-en-la-primera deja al pasajero del caso
   con su tarjeta intacta. El propio motor ya declara este riesgo en el paso 8 del camino
   `existing`, y por eso ahí verifica la precondición **por UI** y no por API.
2. **El pasajero de `empresa individuo` no está en la lista.** Se lo encuentra por `'marce'` →
   `passengerUserId 4951` (dato documentado en el JSDoc de `getPassengerId`), y ninguna de las tres
   queries lo matchea. Para ese actor la precondición por API **nunca** limpia nada.

Además el conteo de "borradas" usa `toDelete.length` e **ignora** el booleano de
`deletePassengerCard`, así que un `DELETE` que devuelva 500 (defecto intermitente ya documentado)
cuenta como borrado y dispara el corte temprano igual.

**No se arregló en esta ronda, a propósito.** `cleanupCardsByLast4` también lo consume la factory
WAL (`wallet-add-card.factory.ts`); recorrer todas las queries y borrar todas las coincidencias
cambiaría el radio de acción de esa suite, y eso merece su propia corrida de verificación. Con el
hallazgo 2 arreglado, el camino por UI —que es el respaldo previsto— ya cubre el caso.

---

## Cambios de código de esta ronda

| Archivo | Cambio | Tipo |
|---|---|---|
| `components/ui/carrier/CarrierNewTravelPage.ts` | `savedCardByLast4` ancla en `role=listitem` en vez de `.ng-star-inserted` | **endurecimiento** — el locator resolvía a un ancestro oculto (hallazgo 1) |
| `components/ui/carrier/CarrierNewTravelPage.ts` | `selectPreauthorizedCardMethod` clickea `.highlighted` sólo si la opción resaltada ES la tarjeta | **corrección de supuesto** — antes seleccionaba el método equivocado (hallazgo 2) |
| `specs/authorize/web/carrier/hold/authorize-hold-matrix.spec.ts` | comentario stale: acotado al único caso `fixme` | documentación (cero código) |

Cero `skip` / `fixme` agregados. Cero aserciones relajadas. Cero timeouts inflados. Ninguna aserción
de texto exacto convertida en regex amplia. `tsc --noEmit` limpio; `eslint` sin errores nuevos (las 2
advertencias de prettier que quedan en el POM son preexistentes, líneas 303/308).

## Corrección de fuentes detectada al medir

`docs/gateway-pg/authorize/ID-MAP.md` marca **TS-AUTHORIZE-TC1053** y **TS-AUTHORIZE-TC1062** como
`(fixme)`, o sea "cobertura declarada, NO ejecutada". Ya no es cierto: los dos son **ejecutables** y
corrieron en verde en esta ronda. El archivo es **GENERATED** (`scripts/ai/build-id-map.mjs` sobre
`docs/gateway-pg/id-map.json`), así que no se editó a mano — hay que **regenerarlo**. Mismo tipo de
staleness que el comentario corregido en `authorize-hold-matrix.spec.ts`.

## Viajes creados y cerrados

**7 creados, 6 cancelados, 1 abierto.**

| travelId | Caso | Cancelado |
|---|---|---|
| 67579 | TC1011 `personalHappyHoldOn` | sí |
| 67582 | TC1011 `personalHappyHoldOn` | sí |
| 67584 | TC1011 `personalHappyHoldOn` | sí |
| 67593 | TC1053 `colaboradorHappyExistingHoldOn` | sí |
| 67595 | TC1062 `empresaHappyExistingHoldOn` | sí |
| 67596 | TC1053 `colaboradorHappyExistingHoldOn` | sí |
| 67597 | TC1062 (corrida descartada por ENVIRONMENT) | **sí, en la ronda 2** — el 503 era transitorio: `PUT /cancel` devolvió **200 al primer intento** |

Los rojos pre-fix de los casos 2, 3 y 4 **no crearon viaje**: murieron en el paso de tarjeta, antes
del submit. El cleanup lo hace el `finally` del motor, no un afterEach del spec.

## Nota de entorno

A mitad de la re-corrida del eje `existing` el ambiente se degradó: `apps-test` pasó de **403 a
503**. Síntomas observados, los tres del manual:

- `cancelTravel 67597 failed: 503 Service Unavailable` → el viaje quedó abierto.
- `expectPassengerInPorAsignar - FAIL: No travel row found for passenger "Marcelle Stripe"` con el
  viaje **sí** creado (67597): el diagnóstico del motor reportó "el viaje NO aparece en NINGUNA
  columna", coherente con un backend que dejó de responder, no con un hold rechazado.
- `[login:dashboard][carrier] dashboard URL no alcanzada` — la sesión se quedó en
  `/#/authentication/login/carrier`.

Se clasificó **ENVIRONMENT**, se **descartaron esas mediciones** y **no se tocó ningún spec**.

## Próximos pasos

1. ~~Cancelar el viaje **67597**~~ — **hecho en la ronda 2** (200 al primer intento).
2. Cerrar el **3/3** de los casos 4 y 5 con el ambiente sano.
3. ~~Re-correr los casos 2 y 3 con el fix del hallazgo 2~~ — **hecho en la ronda 2**: el hallazgo 2
   quedó cerrado, pero los casos siguen **NO acreditados** por los hallazgos **4** y **5**. Lo que
   falta es decidir el arreglo (ver "Qué hace falta para acreditar" en la ronda 2).
4. Regenerar `ID-MAP.md` para que TC1053 / TC1062 dejen de figurar como `(fixme)`.
5. Endurecer `cleanupCardsByLast4` (hallazgo 3) con su propia corrida de verificación de la suite WAL:
   recorrer **todas** las queries, borrar **todas** las coincidencias y contar sólo los `DELETE` que
   devolvieron 2xx.
6. Los 5 casos **Hold OFF** de la taxonomía siguen sin correr: exigen
   `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` y **ventana exclusiva** sobre el carrier 1521.

---

# Ronda 2 — re-corrida de acreditación de TC1051 / TC1061 (2026-07-29)

Objetivo único: **acreditar o refutar** el fix del hallazgo 2 (commit `c7225eb`), que había quedado
aplicado y sin correr porque el ambiente se cayó. Alcance deliberadamente acotado: sólo los dos
casos `cardFlow: 'new'` de la tabla de arriba, `--repeat-each=3`, `--workers=1`, sin tocar
`cleanupCardsByLast4` (hallazgo 3) por decisión explícita — es un helper compartido con la factory
WAL y su cambio necesita su propia corrida.

## Precondición verificada

- `curl --ssl-no-revoke https://apps-test.magiis.com/magiis-v0.2/` → **403** (vivo) antes de arrancar
  y sin degradarse durante las dos corridas.
- Cuenta de Authorize en **Test Mode enlatado** (aprueba todo). Para happy paths es el resultado
  correcto; el límite de alcance de la ronda 1 sigue vigente igual.

## Veredicto: **NO acreditados**. 1 verde / 2 rojos cada uno

| Caso | TC | Repetición 1 | Repetición 2 | Repetición 3 | Veredicto |
|---|---|---|---|---|---|
| `colaboradorHappyNewHoldOn` | TS-AUTHORIZE-TC1051 | ❌ 38.1s — hallazgo 4 | ✅ **40.8s** | ❌ 31.9s — hallazgo 5 | **NO acreditado** |
| `empresaHappyNewHoldOn` | TS-AUTHORIZE-TC1061 | ❌ 34.2s — hallazgo 4 | ✅ **35.1s** | ❌ 31.1s — hallazgo 5 | **NO acreditado** |

Los dos casos fallan y pasan **en el mismo orden y por la misma causa**: no es flake, es
**dependencia de estado**. El resultado de cada repetición lo determina el estado del wallet del
pasajero que dejó la repetición anterior.

## Lo que el fix `c7225eb` SÍ acreditó

El modo de fallo del hallazgo 2 —`TimeoutError` a los 15 s sobre
`#add_travel_payment_methods .deselect-payment-method` con Forma de Pago puesta en el método
equivocado— **no reapareció en ninguna de las 6 corridas**. En la repetición 1 el borrado por UI
**se completa** y el `DELETE` llega al backend (verificado por API: la tarjeta `4760` del pax 4951
dejó de existir), y el test muere **más adelante**. O sea: el fix arregla lo que decía arreglar, y
además la repetición 2 es el **primer verde de la historia** de estos dos casos. Lo que no alcanzó
es el 3/3.

## La máquina de estados que produce el 1-verde-2-rojos

Medido, no inferido: `cleanupCardsByLast4` **no borra nada** para estos dos actores (ver hallazgo 3),
así que la rama de borrado por UI corre siempre y el wallet del pax queda como lo dejó la corrida
anterior.

```
Repeticion 1  pax CON tarjeta, NO seleccionada (Forma de Pago = default del pax)
              -> rama "solo listada": desplegable ABIERTO, trash de la fila
              -> DELETE OK (confirmado por API)  ->  wallet queda en 0 tarjetas
              -> chooseNewPreauthorizedCardOption no logra REABRIR el desplegable -> ROJO (hallazgo 4)

Repeticion 2  pax SIN tarjeta  ->  no entra a la rama de borrado
              -> camino limpio  ->  VERDE  ->  vincula tarjeta nueva (queda default)

Repeticion 3  pax CON tarjeta y SELECCIONADA (la que acabo de vincular la repeticion 2)
              -> rama "resaltada ES la tarjeta": click en .highlighted CIERRA el desplegable
              -> el trash que queda a mano es el del control CERRADO
              -> se confirma "Eliminar" pero la tarjeta SOBREVIVE  ->  ROJO (hallazgo 5)
```

El estado "pax SIN tarjeta" de la repetición 2 es **exactamente** el que la precondición por API
debía garantizar en las tres. Con el hallazgo 3 resuelto, las tres repeticiones tomarían el camino
que hoy sólo toma la del medio.

## Hallazgo 4 — tras el borrado, el desplegable no se reabre y el fallo queda silencioso

**Defecto de nuestro código de test.** Causa la repetición 1 de los dos casos.

Terminado el borrado, `chooseNewPreauthorizedCardOption()` no encuentra la opción visible y llama a
`openPaymentMethodsDropdown()` — pero **descarta su valor de retorno**, y ese método devuelve `false`
en silencio cuando su trigger (`.below .single .value`) no está visible:

```ts
if (!(await option.isVisible().catch(() => false))) {
    await openPaymentMethodsDropdown();   // <- devuelve false y nadie lo mira
}
await expect(option, 'No apareció la opción "Tarjeta de Crédito - Preautorizada"…').toBeVisible({ timeout: 10_000 });
```

Los dos snapshots del fallo muestran el desplegable **cerrado** (`▼`) con el método por defecto del
pax puesto — `Cuenta Corriente` en TC1051, `Efectivo` en TC1061 —, es decir: el borrado sí reseteó el
selector, y la reapertura nunca ocurrió. La aserción que falla es **correcta**; lo que está mal es
que el paso previo no verifica su propio efecto ni reintenta después de que el modal de confirmación
del borrado se desmonta. Mismo patrón que las trampas de vacuidad ya documentadas: un helper que
devuelve `false` y a nadie le importa es un `if` que miente.

## Hallazgo 5 — borrar desde el control CERRADO confirma el diálogo pero no borra la tarjeta

**Defecto de nuestro código de test.** Causa la repetición 3 de los dos casos.

Cuando la tarjeta **está seleccionada**, la rama del fix hace lo que la grabación validada: abre el
desplegable y clickea `.highlighted` (que ahí sí **es** la tarjeta). Ese click la selecciona y
**cierra el desplegable**. `deleteHighlightedOrByLast4` corre entonces con el desplegable cerrado:
`savedCardByLast4` cuenta 0 (ya no hay `listitem`), cae al locator de respaldo
`#add_travel_payment_methods .deselect-payment-method` — que resuelve al ícono del **control
cerrado** — y clickea ahí. El diálogo de confirmación **aparece** (el click en `Eliminar` no
timeoutea), pero el resultado no es un borrado:

- Oráculo del test: `hasSelectedCardWithLast4('1111')` sigue en `true` tras 10 s, y el snapshot
  muestra Forma de Pago con `Tarjeta de crédito VISA *** 1111` y el desplegable cerrado.
- **Verificación independiente por API**: la tarjeta que vinculó la repetición 2 en el pax 4951
  (`id 4763`) **sigue existiendo** después de la corrida completa. No es un refresco tardío de la
  UI: el borrado **no ocurrió**.

La aserción es correcta y **no se relajó**. Lo que falta es lo que la propia grabación validada hacía
y nuestro código no: **reabrir el desplegable** después de seleccionar la tarjeta, para que el trash
que se clickea sea el de la **fila** de la tarjeta (el que sí borra) y no el del control cerrado
(cuya clase, `deselect-payment-method`, describe *deseleccionar*, no *borrar*).

## Hallazgo 3 — ya no es una hipótesis: está medido

Lectura read-only por API de las tres queries de `paxSearchQueries` para Authorize
(`['smith', 'fast', 'Emanuel']`), buscando `last4 = 1111`:

| Query | Pax que resuelve `getPassengerId` (primer resultado) | Tarjetas | Con `1111` |
|---|---|---|---|
| `smith` | `11129` | 0 | **0** |
| `fast` | `5289` | 2 | **0** |
| `Emanuel` | `8669` | 0 | **0** |
| *(no está en la lista)* | `4951` — pax de `empresa individuo`, se lo encuentra por `marce` | 1 | **1** (default) |

`cleanupCardsByLast4` recorre las tres, no borra nada, y devuelve **0**. Confirmado: para estos dos
actores la precondición por API **es un no-op**, y la rama de borrado por UI —el respaldo— es la que
carga con todo el peso. Sigue **sin arreglarse a propósito** (helper compartido con la factory WAL).

## Qué hace falta para acreditar (decisión pendiente, no ejecutada)

Dos caminos, y conviene decidir antes de tocar código:

1. **Resolver el hallazgo 3** (precondición por API que sí apunte al pax del caso). Elimina la rama
   de borrado por UI de estos casos, con lo que los hallazgos 4 y 5 dejan de ejecutarse acá. Es el
   arreglo de fondo, y exige la corrida de verificación de la suite WAL que ya está anotada.
2. **Resolver 4 y 5 en el POM** (verificar el efecto de `openPaymentMethodsDropdown` y reabrir el
   desplegable antes de borrar). Deja la rama de UI realmente funcional para cualquier estado del
   wallet — que es lo que un respaldo debería ser.

No son excluyentes: 1 quita la dependencia y 2 arregla el respaldo. Ninguno se aplicó en esta ronda:
el alcance pedido era **verificar** el fix, y verificarlo devolvió dos defectos nuevos que merecen su
propia ronda.

## Viajes creados y cerrados en esta ronda

**2 creados, 2 cancelados, 0 abiertos** — más el arrastre de la ronda 1 ya cerrado.

| travelId | Caso | Cancelado |
|---|---|---|
| 67597 | arrastre de la ronda 1 (quedó abierto por el 503) | **sí** — `PUT /cancel` → 200 al primer intento |
| 67604 | TC1051 `colaboradorHappyNewHoldOn` (repetición verde) | sí — por el `finally` del motor |
| 67605 | TC1061 `empresaHappyNewHoldOn` (repetición verde) | sí — por el `finally` del motor |

Las 4 repeticiones rojas **no crearon viaje**: murieron en el paso 9 (método de pago), muy antes del
submit.

El 67597 se cerró con `scripts/cleanup/cancel-travel-by-id.ts`, agregado en esta ronda: cancela
**sólo los IDs que se le pasan**. El `cleanup-travels-api.ts` que ya existía barre *todos* los viajes
cancelables del carrier, y el 1521 de TEST es **compartido** entre sesiones — usarlo para cerrar un
viaje puntual habría cerrado viajes ajenos.

## Riesgos conocidos que NO se manifestaron

- **HTTP 500 en `POST /passengers/{id}/cards`** (re-adición tras borrado por UI, esperable justo en
  TC1061): **no apareció** en ninguna de las 6 corridas.
- **Ambiente**: sin caídas. Ninguna medición de esta ronda se descartó por ENVIRONMENT.

## Cambios de código de esta ronda

| Archivo | Cambio | Tipo |
|---|---|---|
| `scripts/cleanup/cancel-travel-by-id.ts` | **nuevo** — cancelación puntual por travelId, con reintentos | herramienta de limpieza segura sobre carrier compartido |
| `docs/gateway-pg/authorize/RUN-LOG.md` | esta sección + veredicto real en las tablas de la ronda 1 | documentación |

Cero cambios en specs, POMs, helpers o motores. Cero `skip` / `fixme`. Cero aserciones relajadas.
Cero timeouts inflados. `tsc --noEmit` limpio.
