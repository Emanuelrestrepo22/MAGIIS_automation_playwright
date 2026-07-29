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
| 2 | `colaboradorHappyNewHoldOn` | TS-AUTHORIZE-TC1051 (§3.1) | ❌ rojo 3/3 pre-fix → **pendiente de re-corrida** | **defecto de NUESTRO código** (hallazgo 2) + 1 corrida perdida por ENVIRONMENT |
| 3 | `empresaHappyNewHoldOn` | TS-AUTHORIZE-TC1061 (§4.1) | ❌ rojo 3/3 pre-fix → **pendiente de re-corrida** | ídem caso 2 |
| 4 | `colaboradorHappyExistingHoldOn` | TS-AUTHORIZE-TC1053 (§3.1) | ❌ rojo 3/3 pre-fix → ✅ **verde 2/2 post-fix** (35.7 / 42.4s) | **defecto de NUESTRO locator** (hallazgo 1). 3ª repetición perdida por ENVIRONMENT |
| 5 | `empresaHappyExistingHoldOn` | TS-AUTHORIZE-TC1062 (§4.1) | ⏭️ skip 3/3 pre-fix (cascada serial) → ✅ **verde 1/1 post-fix** (34.1s) | ídem caso 4. 2 repeticiones perdidas por ENVIRONMENT |

Los casos 4 y 5 son **el eje que nunca se había ejercitado** (`cardFlow: 'existing'`). Su primer
verde de la historia es de esta ronda.

## Acreditado vs declarado

| Caso | Antes de esta ronda | Después de esta ronda |
|---|---|---|
| `personalHappyHoldOn` | declarado (verificación estática) | **acreditado** — verde 3/3 con hold aseverado ON |
| `colaboradorHappyNewHoldOn` | declarado | **NO acreditado** — rojo por defecto propio, fix aplicado, re-corrida pendiente |
| `empresaHappyNewHoldOn` | declarado | **NO acreditado** — ídem |
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
| 67597 | TC1062 (corrida descartada por ENVIRONMENT) | **NO** — `cancelTravel` devolvió **503** |

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

1. Cancelar el viaje **67597** en cuanto el backend responda (quedó abierto por el 503).
2. Cerrar el **3/3** de los casos 4 y 5 con el ambiente sano.
3. Re-correr los casos 2 y 3 (`colaboradorHappyNewHoldOn` / `empresaHappyNewHoldOn`) con el fix del
   hallazgo 2 y acreditarlos.
4. Regenerar `ID-MAP.md` para que TC1053 / TC1062 dejen de figurar como `(fixme)`.
5. Endurecer `cleanupCardsByLast4` (hallazgo 3) con su propia corrida de verificación de la suite WAL:
   recorrer **todas** las queries, borrar **todas** las coincidencias y contar sólo los `DELETE` que
   devolvieron 2xx.
6. Los 5 casos **Hold OFF** de la taxonomía siguen sin correr: exigen
   `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` y **ventana exclusiva** sobre el carrier 1521.
