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
| 5 | `DECLINE_AUTHORIZE` | ⚠️ verde con oráculo corregido | ver hallazgo 2 (queda ambigüedad) |
| 6 | `DECLINE_INVALID_CVC` | ⚠️ verde con oráculo vacuo | re-verificar con el oráculo corregido |
| 7 | `DECLINE_PREPAID_ZERO_BALANCE` | ⚠️ verde con oráculo vacuo | re-verificar |
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
