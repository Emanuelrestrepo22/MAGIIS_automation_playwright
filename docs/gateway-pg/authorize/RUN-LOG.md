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
