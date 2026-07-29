# Authorize — log de la corrida viva de la matriz de outcomes

Fecha: **2026-07-28** · Entorno: `test` (apps-test) · Carrier 1521 (Remises EEUU) ·
Rama `carrier/ebiz-matrix-standardization` · Sin ventana destructiva (no se tocó ninguna vinculación).

## Precondición verificada (probe read-only)

`appstore-gateways-probe.spec.ts` → **Authorize = `linked`** ("Desvincular").
Stripe, MercadoPago y eBizCharge = `unavailable` ("No Disponible" / "No disponible en tu región"),
que es la **regla de exclusividad** funcionando, no un bloqueo de backend. Confirma en vivo lo que
`docs/gateway-pg/ebizcharge/EXTERNAL-BLOCKERS.md` §F3 ya sospechaba.

## Resultado por intent

De los 22 casos generados para Authorize: **9 ejecutables** (10 soportados − `HAPPY_PARTIAL_AUTH`
sin oráculo) y 13 skipeados con motivo declarado.

| # | Intent | Resultado | Clasificación |
|---|---|---|---|
| 1 | `HAPPY_NO_AUTH` | ✅ verde **3/3** con `--repeat-each=3` (31.8 / 32.9 / 30.8s) | control positivo sólido |
| 2 | `HAPPY_MASTERCARD` | ✅ verde | — |
| 3 | `HAPPY_AMEX` | ✅ verde | el CVV de 4 dígitos **no** era problema: el form nativo lo acepta |
| 4 | `HAPPY_DISCOVER` | ❌ **rojo** | **bug de producto** — ver hallazgo 1 |
| 5 | `DECLINE_AUTHORIZE` | ⚠️ verde con oráculo corregido | ver hallazgo 2 → **RESUELTO en la ronda 3** (área F) |
| 6 | `DECLINE_INVALID_CVC` | ⚠️ verde con oráculo vacuo | **RESUELTO en la ronda 3** (área F) |
| 7 | `DECLINE_PREPAID_ZERO_BALANCE` | ⚠️ verde con oráculo vacuo | **RESUELTO en la ronda 3** (área F) |
| 8 | `APPROVED_CVV_MISMATCH` | ✅ verde | aprueba con CVV2 sin coincidir, como se esperaba |
| 9 | `APPROVED_AVS_MISMATCH` | ✅ verde | aprueba con AVS sin coincidir |
| — | `HAPPY_PARTIAL_AUTH` | ⏭️ skip "sin oráculo" | pendiente de definir con producto |

`fillZipField` —el selector con fallback posicional que era el principal sospechoso— **no falló en
ninguna corrida**. No se lo tocó.

---

## Hallazgo 1 — MAGIIS bloquea Discover, la pasarela la aprueba (defecto de producto)

**Trifuerza cruzada:**

| Capa | Evidencia |
|---|---|
| **API** (Authorize.net sandbox) | `contract-edge.api.spec.ts` → Discover `6011000000000012` + CVV 900 → **Response Code 1 (Approved)** ✅ |
| **UI** (MAGIIS) | misma tarjeta, form **completo y correcto** → el botón "Validar" queda **`disabled`**; MAGIIS nunca envía el request ❌ |

Snapshot de la página al momento del fallo (todos los campos con el valor correcto):

```
textbox "Número de tarjeta *" : 6011 0000 0000 0012
textbox "MM/AA"               : 12/30
textbox                       : "900"          ← CVV
textbox                       : MAGIIS QA Test ← titular
textbox [active]              : "90210"        ← ZIP
button  (Validar)             : disabled
```

Comparación que aísla la causa: Visa (4111), Mastercard y Amex pasan por el **mismo** flujo y el
mismo código. Solo cambia la marca.

**Pasos para reproducir**
1. Carrier 1521 con Authorize vinculada · portal carrier · Nuevo Viaje.
2. Cliente `fast car`, destino cualquiera. Forma de Pago → *Tarjeta de Crédito - Preautorizada*.
3. Ingresar `6011000000000012`, exp `12/30`, CVV `900`, titular cualquiera, ZIP `90210`.
4. **Resultado obtenido**: "Validar" nunca se habilita.
   **Resultado esperado**: se habilita y la tarjeta valida, como con Visa/MC/Amex.

**Severidad**: media. Authorize.net soporta Discover y nuestro propio pack de contrato API lo
prueba; el carrier no puede dar de alta tarjetas Discover de sus pasajeros.

**Decisión tomada**: el test queda **ROJO**. No se cambió la celda de `CARD_MATRIX` a `{na}` — la
pasarela **sí** expone el outcome, así que marcarlo N/A sería esconder el defecto detrás de una
etiqueta que significa otra cosa.

---

## Hallazgo 2 — `expectNativeCardRejected()` era una aserción vacua (defecto de nuestro código)

El probe de diagnóstico sobre la tarjeta de `DECLINE_AUTHORIZE` devolvió:

```
[PROBE][DECLINE] botón Validar: visible=true enabled=false
[PROBE][DECLINE] aparece "Tarjeta válida"? true
```

La versión original del método hacía una sola aserción:

```ts
await expect(cartelDeExito).not.toBeVisible({ timeout: 15_000 });
```

`not.toBeVisible` se satisface con el **primer** chequeo, y en t=0 el cartel todavía no llegó porque
la respuesta de la pasarela está en vuelo. **Pasaba siempre.** Los 3 casos de decline que dieron
verde en la primera corrida eran **falsos verdes**.

**Fix aplicado** (endurecimiento, no relajación): esperar un asentamiento observable —el front
deshabilita "Validar" mientras procesa— y **recién entonces** verificar que el cartel de éxito no
esté. Ahora la aserción no puede pasar de forma vacua: el caso tarda 1.2m en vez de 30s, porque
efectivamente espera.

`DECLINE_AUTHORIZE` **vuelve a pasar** con el oráculo corregido.

### Ambigüedad que queda abierta (no resuelta)

El probe vio el cartel "Tarjeta válida" **presente** a los ~15s del click, y la aserción corregida lo
ve **oculto** al momento del asentamiento. Las dos observaciones no se contradicen necesariamente
—pueden estar mirando instantes distintos— pero **no alcanzan para confiar en la cobertura de
declines en el área C**.

Hipótesis a discriminar en la próxima ronda, en este orden:

1. **El decline de Authorize no se manifiesta al dar de alta la tarjeta.** Su trigger es el **ZIP
   46282**, y el AVS se evalúa en la **transacción de cobro**. Si es así, el alta legítimamente
   aprueba y los intents de decline **pertenecen al área F (hold/cobro), no al área C**. Sería un
   error de ubicación de mi matriz, no un bug de producto.
2. El cartel aparece y desaparece, y el oráculo está corriendo una carrera contra la UI.
3. MAGIIS declara válida una tarjeta que la pasarela rechaza (defecto real).

Discriminador propuesto: correr el mismo intent en **área F** (`runHoldScenario` con
`intent: 'DECLINE_AUTHORIZE'`) y ver si el viaje queda `No autorizado`. Si ahí se manifiesta, la
hipótesis 1 queda confirmada y la matriz se reordena por área.

**Mientras eso no se resuelva**, `DECLINE_INVALID_CVC` y `DECLINE_PREPAID_ZERO_BALANCE` quedan
marcados como **no confiables** en este log aunque el runner los dé verdes: pasaron con el oráculo
vacuo y no se re-corrieron con el corregido.

> **Cerrado en la ronda 3 (más abajo).** La hipótesis 1 quedó confirmada por observación directa y
> los tres declines dejaron de estar "no confiables". El "fix" descrito arriba resultó **insuficiente**:
> el asentamiento por `toBeDisabled()` también era vacuo. Ver hallazgo 5.

---

## Viajes creados

**Cero.** La matriz de outcomes llena el formulario y valida la tarjeta; **no submitea el viaje**.
No quedó ningún viaje en `SEARCHING_DRIVER` que haya que cerrar desde el app driver.

Los viajes los crea la suite de **hold**, que en esta corrida no se ejecutó.

## Cambios de código de esta corrida

| Archivo | Cambio | Tipo |
|---|---|---|
| `specs/_parametrized/factories/card-outcome-matrix.factory.ts` | quitado el gate `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH` | corrección de precondición mal calibrada — la suite solo agrega tarjetas, igual que la WAL que no lo lleva. **Ninguna aserción tocada** |
| `components/ui/carrier/CarrierNewTravelPage.ts` | `expectNativeCardRejected` espera asentamiento antes de verificar | **endurecimiento**: la aserción pasaba vacuamente |

Cero `skip`/`fixme` agregados. Cero aserciones relajadas. Cero timeouts inflados para tapar
lentitud (el `settleMs` de 20s es la ventana de la respuesta de la pasarela, no un parche).

## Próximos pasos

1. Discriminar la hipótesis del área C vs F para los declines (ver hallazgo 2).
2. Re-correr `DECLINE_INVALID_CVC` y `DECLINE_PREPAID_ZERO_BALANCE` con el oráculo corregido.
3. Cablear la capa DB (`countCardsByPassenger`) para cerrar la trifuerza del área C.
4. Reportar el defecto de Discover en Jira.
5. Observar `HAPPY_PARTIAL_AUTH` y declarar su oráculo.

---

# Ronda 2 — las tarjetas por defecto de Authorize.net (2026-07-28)

Motivo: verificar que el fixture use la lista oficial del sandbox, y cubrir los **largos de PAN**
que la matriz no modela (todas sus entradas son de 16 dígitos salvo Amex, de 15).

## El fixture ya usaba la lista oficial

| Marca | Número oficial | En el fixture | |
|---|---|---|---|
| Visa | `4111111111111111` | `visaSuccess` | ✅ idéntico |
| Mastercard | `5424000000000015` | `mastercardSuccess` | ✅ idéntico |
| American Express | `370000000000002` | `amexSuccess` | ✅ idéntico |
| Discover | `6011000000000012` | `discoverSuccess` | ✅ idéntico (también oficial) |

**No hubo cambio de datos.** Y refuerza el hallazgo 1: la tarjeta que MAGIIS bloquea es la Discover
publicada por Authorize.net, Luhn-válida, en la misma lista que las tres que sí funcionan.

## Resultado del probe `default-cards-probe.spec.ts`

| Tarjeta | Dígitos | "Validar" habilitado | Validada por la pasarela |
|---|---|---|---|
| Visa `4111111111111111` | 16 | ✅ | ❌ **no concluyente** — ver abajo |
| Visa `4007000000027` | 13 | ✅ | ✅ |
| Visa `4012888818888` | 13 | ✅ | ✅ |
| Mastercard `5424000000000015` | 16 | ✅ | ✅ |
| Amex `370000000000002` | 15 | ✅ | ✅ |
| Discover `6011000000000012` | 16 | ❌ | — (el form nunca habilita el submit) |

### Hallazgo 3 — el form acepta PAN de 13 dígitos (dato nuevo, sin defecto)

Las dos Visa de 13 dígitos validan sin problema. La validación de MAGIIS **no es rígida con el
largo del número**, así que no hace falta cobertura defensiva por ese lado. Es información que la
matriz no tenía porque todas sus Visa son de 16.

### Hallazgo 4 — Discover confirmado por segunda vía

El botón "Validar" queda deshabilitado también en este probe, con otro flujo y otro orden de
ejecución. Es un **estado determinístico de la UI**, independiente de tiempos de red: el form
rechaza el número antes de cualquier llamada. Sube la confianza del hallazgo 1 de "observado una
vez" a "reproducible".

### Visa de 16 dígitos: observación NO concluyente

En este probe `4111111111111111` no llegó a validar, pero una hora antes el mismo número pasó
**3/3** en `HAPPY_NO_AUTH`. No lo cuento como defecto porque:

1. **El entorno se degradó durante la ronda**: la corrida de confirmación falló ya en el global
   setup (`[GlobalSetup][carrier] ⚠️ Login failed — skipping storage state`). Con la app rechazando
   logins, cualquier medición es sospechosa.
2. **Hay una causa conocida más probable que un bug**: re-validar una tarjeta YA vinculada devuelve
   "Error al validar" (verificado en vivo en Authorize, documentado en `travel-cleanup.ts` y en la
   factory WAL). Después de docenas de altas de la misma `1111` en las corridas previas, es
   esperable que el pax acumule copias.
3. **El cleanup de idempotencia tiene un límite conocido**: `cleanupGatewayCardByLast4` recorre
   `paxSearchQueries` y **retorna en la primera query que borró algo**. Si la tarjeta quedó
   adherida a más de un pasajero, o si quedan copias en otro, no las limpia todas.

**Riesgo real que esto expone** (independiente de si hubo bug): la suite se degrada con el uso. Un
`HAPPY_NO_AUTH` verde hoy puede ponerse rojo tras N corridas por acumulación de tarjetas, y el
síntoma no se parece en nada a la causa.

Acción propuesta, en orden:
1. Contar por API cuántas tarjetas con `last4=1111` tiene el pax de Authorize (`paymentMethodsByPax`).
2. Si hay más de una, endurecer `cleanupGatewayCardByLast4`: recorrer **todas** las queries y borrar
   **todas** las coincidencias en vez de cortar en la primera productiva.
3. Recién después volver a medir la Visa de 16 con el entorno estable.

## Artefacto que queda

`tests/features/gateway-pg/specs/authorize/probe/default-cards-probe.spec.ts` — tagged `@probe`,
fuera de `@gateway`/`@authorize`, así que no entra en la regresión. No asserta nada de negocio:
reporta habilitación del submit y validación por marca y largo de PAN. Sirve para re-medir la
matriz marca × largo sin tocar la suite.

Nota sobre su primera versión: usaba `locator.isVisible({timeout})`, que es un chequeo **inmediato**
—el `timeout` se ignora— y medía antes de que llegara la respuesta de la pasarela. Mismo error de
clase que el hallazgo 2. Corregido a `waitFor({ state: 'visible' })`. Vale como recordatorio de que
`isVisible()` no espera y `not.toBeVisible()` se satisface con el primer chequeo: ninguno de los dos
sirve para medir algo asíncrono.

---

# Ronda 3 — se observó el oráculo de decline antes de declararlo (2026-07-28)

Motivo: cerrar la ambigüedad del hallazgo 2. La regla aplicada fue **observar primero, endurecer
después**: en vez de tocar la aserción, se escribió un probe que MIDE qué hace la UI, y sólo con
esos datos se decidió el cambio.

Artefacto: `tests/features/gateway-pg/specs/authorize/probe/decline-oracle-probe.spec.ts` (`@probe`,
fuera de `@gateway`/`@authorize`). No asserta negocio: muestrea el estado en instantes fijos desde el
click en "Validar", captura el texto NUEVO de la página respecto del baseline pre-click (así el copy
real aparece sin depender de un selector que no conocemos) y registra las **respuestas de red** del
alta. Incluye `HAPPY_NO_AUTH` como **control positivo** — sin control no se puede distinguir "el
decline se comporta como una aprobación" de "el decline muestra algo que el oráculo no mira".

## Muestreo temporal — los 3 declines y el control

Resultado **idéntico** en los 4 casos (`--workers=1`):

| t desde el click | "Validar" | "Tarjeta válida" en DOM | visible | texto nuevo en la página |
|---|---|---|---|---|
| pre-click | enabled | 0 | — | — |
| t+2s | **DISABLED** | 1 | **true** | `"Tarjeta válida Validar"` |
| t+5s | DISABLED | 1 | true | `"Tarjeta válida Validar"` |
| t+10s | DISABLED | 1 | true | `"Tarjeta válida Validar"` |
| t+15s | DISABLED | 1 | true | `"Tarjeta válida Validar"` |
| t+20s | DISABLED | 1 | true | `"Tarjeta válida Validar"` |
| t+30s | DISABLED | 1 | true | `"Tarjeta válida Validar"` |

**Copy de rechazo observado: NINGUNO.** En los 30s de muestreo el único texto que aparece es el de
éxito. No hay cartel, toast ni mensaje de error para capturar.

## La red — el discriminador que cierra el caso

| Intent | Trigger | Respuesta del alta |
|---|---|---|
| `HAPPY_NO_AUTH` (control) | CVV 900 / ZIP 90210 | `POST /passengers/5289/cards` → **200** a t+1.70s, tarjeta `id=4673` |
| `DECLINE_AUTHORIZE` | ZIP **46282** | `POST /passengers/5289/cards` → **200** a t+1.19s, tarjeta `id=4674 cardId=936464675` |
| `DECLINE_INVALID_CVC` | CVV **901** | `POST /passengers/5289/cards` → **200** a t+1.12s, tarjeta persistida |
| `DECLINE_PREPAID_ZERO_BALANCE` | ZIP **46228** | `POST /passengers/5289/cards` → **200** a t+1.12s, tarjeta persistida |

El cuerpo de las 4 respuestas trae la tarjeta **persistida**: `id`, `cardId` (el id de perfil de pago
del lado de Authorize), `appCode: "AUTHORIZE"`, `lastFourDigits: "1111"`. El `POST
/carriers/1521/paymentMethodsByPax` posterior ya la lista en la wallet.

## Hipótesis confirmada: la 1 — el decline no se manifiesta en el alta

**Hipótesis 1 (CONFIRMADA).** En Authorize.net el outcome de estos tres intents lo dispara el ZIP o
el CVV, y ambos son campos de la **respuesta de autorización** (AVS / CVV2): la pasarela los evalúa
en la **transacción**, no al crear el perfil de pago del alta. El alta aprueba, y aprueba **con
razón**. Es un error de **UBICACIÓN de la matriz** (área C vs área F), **no un bug de producto ni un
test debilitado**.

**Hipótesis 2 (DESCARTADA).** No hay carrera: el cartel aparece a t+2s y sigue visible a t+30s. No
aparece-y-desaparece. La observación de la ronda 2 ("presente a los ~15s") y la de la aserción
corregida ("oculto al asentamiento") no se contradecían por mirar instantes distintos — se
contradecían porque la aserción se evaluaba en t≈0, antes de que existiera el cartel.

**Hipótesis 3 (DESCARTADA).** MAGIIS no está ignorando un rechazo de la pasarela: **no hay rechazo**.
La pasarela creó el perfil de pago y devolvió su `cardId`. No hay nada que MAGIIS esté pasando por
alto en esta área.

## Hallazgo 5 — el asentamiento de la ronda 2 TAMBIÉN era vacuo

El dato más incómodo del muestreo: **"Validar" está `disabled` a t+2s y sigue `disabled` a t+30s, con
la tarjeta ya aprobada.** O sea `disabled` **no** significa "procesando": el front deshabilita el
botón en el click (estado de submit) y lo deja deshabilitado **después del éxito**. Entonces
`expect(validar).toBeDisabled({ timeout: 20s })` resuelve en milisegundos y aporta ~0 de espera, y el
`toBeHidden()` que venía detrás seguía evaluándose antes de que la pasarela contestara.

Esto explica el timing que no cerraba: la re-corrida de `DECLINE_INVALID_CVC` tardó **26,7s** cuando
el log de la ronda 2 afirmaba ~1,2m. No tardaba más porque no esperaba más.

Corolario para el futuro: el estado `disabled` de un botón **no sirve como asentamiento** en este
form. El único evento observable que marca el fin del round-trip es la respuesta de
`POST /passengers/{id}/cards`.

## Cambios de código de esta ronda

| Archivo | Cambio | Tipo |
|---|---|---|
| `specs/authorize/probe/decline-oracle-probe.spec.ts` | **nuevo** — probe de muestreo temporal + captura de red, con control positivo | instrumentación (`@probe`, fuera de regresión) |
| `helpers/journey-outcome.ts` | **nuevo** `AREA_F_SCOPED_OUTCOMES` + `areaFRelocationFor()` + `addCardExpectation()`: declara en qué ÁREA evalúa la pasarela cada outcome, con la evidencia en vivo | reubicación de área (additive; `OUTCOME_BY_INTENT` sin tocar) |
| `factories/card-outcome-matrix.factory.ts` | el área C consume `addCardExpectation(gateway,intent)`; título + annotation `area-f` explicitan la reubicación | corrección de ubicación |
| `components/ui/carrier/CarrierNewTravelPage.ts` | `expectNativeCardRejected` v3: asentamiento anclado a la respuesta del alta + aserción de PRESENCIA del rechazo a nivel API | **endurecimiento** |

### Por qué es endurecimiento y no relajación

1. **El área C de los 3 declines pasó de una aserción de AUSENCIA vacua a una de PRESENCIA real.**
   Antes: `toBeHidden()` sobre el cartel de éxito, que pasaba en t≈0 sin verificar nada. Ahora:
   `validateNativeCard()`, que espera hasta 20s a que "Tarjeta válida" esté **visible**. Una
   aserción de presencia con espera no puede pasar vacuamente. El caso asserta más que antes, no menos.
2. **La celda de `CARD_MATRIX` NO se cambió a `{na}`.** La pasarela sí expone el outcome; sólo lo
   expone en otra área. Marcarlo N/A sería mentir sobre la capacidad de la pasarela.
3. **Cero `skip` / `fixme` agregados.** Los 3 casos siguen corriendo y siguen en `@regression`.
4. **`expectNativeCardRejected` (que ahora usan eBiz/MP) quedó más fuerte, no más débil**: se le
   quitó el falso asentamiento y se le agregó una aserción de PRESENCIA del rechazo a nivel API —
   un alta rechazada no puede haber persistido la tarjeta, y la firma del alta exitosa está
   observada en vivo (`2xx` + `id` + `cardId` + `lastFourDigits`), así que su negación es un oráculo
   fundado. **No se asserta copy de UI porque no se observó ninguno** — declarar un texto inventado
   sería exactamente el error que esta ronda vino a corregir.
5. **Ningún timeout se infló para tapar lentitud.** El `settleMs` de 20s pasó de ser una ventana que
   no se usaba a ser la ventana real de la respuesta del alta (observada a t+1.1-1.7s).

### Lo que sigue SIN estar verificado (declarado a propósito)

El `basis` de `OUTCOME_BY_INTENT` **no** se subió a `live-verified` para `DECLINE_INVALID_CVC` ni
`DECLINE_PREPAID_ZERO_BALANCE`. Razón: `basis` cubre el par (área C + `expectedTravelStatus`), y lo
que esta ronda observó en vivo es **sólo el área C**. El `expectedTravelStatus: 'No autorizado'`
(área F) sigue siendo `documented-class`: nadie corrió el hold con estas tarjetas todavía. La
evidencia en vivo quedó registrada donde sostiene exactamente lo que prueba — en
`AREA_F_SCOPED_OUTCOMES`, junto al hecho del área C. Subir un `basis` que abarca una afirmación no
observada sería declarar un oráculo sin haberlo visto.

## Estado final de los 3 declines

| Intent | Estado en la ronda 2 | Veredicto de la ronda 3 |
|---|---|---|
| `DECLINE_AUTHORIZE` | ⚠️ verde con oráculo corregido, ambigüedad abierta | ✅ **confiable** — área C reubicada: el alta APRUEBA (live-verified). Verde 1/1 con aserción de presencia. Cobertura del rechazo pendiente en área F. |
| `DECLINE_INVALID_CVC` | ❌ no confiable (oráculo vacuo) | ✅ **confiable** — ídem. Verde 1/1. |
| `DECLINE_PREPAID_ZERO_BALANCE` | ❌ no confiable (oráculo vacuo) | ✅ **confiable** — ídem. Verde 1/1. |

Corrida de confirmación: los 3 en el spec real de la matriz (`authorize-card-outcomes.spec.ts`,
`--workers=1`) → **3 passed en 1.8m** (~36s por caso, en línea con los ~31s del happy path, que es
lo esperable: ahora los 4 hacen el mismo trabajo).

## Viajes creados

**Cero.** Ni el probe ni la matriz submitean el viaje. Sí quedaron tarjetas `•••• 1111` de más en la
wallet del pax 5289 (una por caso), que el `cleanupGatewayCardByLast4` del inicio de cada caso
absorbe — ya corrigiendo todas las coincidencias desde el commit `661a3a8`.

## Próximos pasos

1. **Área F**: correr `runHoldScenario` con `DECLINE_AUTHORIZE` / `DECLINE_INVALID_CVC` /
   `DECLINE_PREPAID_ZERO_BALANCE` y verificar que el viaje quede `No autorizado`. Es lo que falta
   para subir el `basis` de esos intents a `live-verified` de punta a punta.
2. Observar el copy del rechazo en una pasarela que **sí** declina en el alta (eBizCharge: sus
   triggers son por NÚMERO de tarjeta, no por ZIP/CVV, así que deberían manifestarse en el área C).
   Con ese copy, `expectNativeCardRejected` puede pasar a assertar PRESENCIA de texto en la UI.
3. Reportar el defecto de Discover en Jira (hallazgos 1 + 4, pendiente de la ronda 1).
4. Cablear la capa DB (`countCardsByPassenger`) para cerrar la trifuerza del área C.
5. Observar `HAPPY_PARTIAL_AUTH` y declarar su oráculo.

## Nota de entorno

Durante la ronda el login del carrier falló una vez (`page.goto` timeout 20s en
`/#/authentication/login/carrier`), tumbando `DECLINE_INVALID_CVC` a mitad de corrida. Se clasificó
**ENVIRONMENT**, no se tocó ningún spec y se re-corrió el subconjunto. Salud verificada antes y
después con `curl --ssl-no-revoke https://apps-test.magiis.com/magiis-v0.2/` → 403 (vivo).

También quedó una falla **preexistente y ajena** a esta ronda en el proyecto `unit`:
`stripe-card-declined.unit.spec.ts` no encuentra el iframe de Stripe Elements. Causa conocida y ya
documentada en la precondición de la ronda 1: en el carrier 1521 la pasarela vinculada es Authorize y
Stripe está `unavailable` por la regla de exclusividad, así que el form de Elements nunca se renderiza.
No se tocó.
