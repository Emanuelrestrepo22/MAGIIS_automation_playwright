# eBizCharge — log de corridas vivas

> Convención: cada ronda registra QUÉ se corrió, el veredicto por caso y la evidencia que sostiene
> cada afirmación. Nada se declara sin observación citable. Hermanos: `authorize/RUN-LOG.md`
> (matriz de outcomes) y `authorize/RUN-LOG-hold-suite.md` (suite HOLD).

# Ronda 1 — primera corrida viva de la matriz de outcomes (2026-07-30/31)

## Precondición verificada

- Probe read-only del App Store (2026-07-30): `ebizcharge → "Desvincular" → linked` (vinculada
  MANUALMENTE por el usuario con las creds del merchant); `authorize`/`stripe` → "No Disponible"
  (exclusividad), `mercado-pago` → "No disponible en tu región". Gate: `ebizcharge-UI=GO`.
- Creds `EBIZ_MERCHANT_USER` / `EBIZ_MERCHANT_PASSWORD` / `EBIZ_SECURITY_KEY` presentes en
  `.env.test` (el usuario las cargó con los nombres crudos del portal — `UserID`/`password`/
  `securityId`/`EBizSubscription-Key` — y se canonizaron a `EBIZ_*`; la subscription key quedó
  preservada como `EBIZ_SUBSCRIPTION_KEY` para uso API futuro).
- Entorno `test` (apps-test), carrier 1521. Montos de las transacciones de validación del alta:
  **siempre > $10** (confirmado por el usuario en la consola merchant) — MAGIIS transacciona al
  validar, no tokeniza en seco.

## Resultado por caso (matriz `ebizcharge-card-outcomes.spec.ts`, caso por caso)

| Caso | Intent | Tarjeta (fila sandbox) | Esperado (docs/tabla) | Observado vivo | Veredicto |
|---|---|---|---|---|---|
| TC1001 | HAPPY_NO_AUTH | …2224 | aprueba | aprueba + viaje `Buscando chofer` | ✅ (1er run: flake transitorio del geocoder — "No se encontraron resultados"; 2º run verde) |
| TC1003 | HAPPY_SLOW_PROCESSING | …2267 | aprueba con demora | aprueba (~60s reales) | ✅ tras fix: `slowMs` de la celda cableado al oráculo de validación |
| TC1020 | APPROVED_CVV_MISMATCH | …2221 | aprueba | aprueba | ✅ |
| TC1002 | APPROVED_AVS_MISMATCH | …2229 | aprueba (echo AVS NNN) | **RECHAZADA** — "Error al validar tarjeta. Por favor, revise los datos ingresados." | 🔴 divergencia → ver Hallazgo 2 |
| TC1011 | DECLINE_AUTHORIZE | …2228 (05) | rechaza | **ACEPTADA y vinculada** | 🔴 defecto → ver Hallazgo 1 |
| TC1012 | DECLINE_INSUFFICIENT_FUNDS | serie 4000300… (51) | rechaza | ACEPTADA | 🔴 ídem |
| TC1013 | DECLINE_INVALID_TRANSACTION | …2227 (12) | rechaza | ACEPTADA | 🔴 ídem |
| TC1014 | DECLINE_RESTRICTED_CARD | …2221 (62) | rechaza | falla igual (aceptada) | 🔴 ídem |
| TC1015 | DECLINE_INVALID_ISSUER | …2226 (15) | rechaza | falla igual (aceptada) | 🔴 ídem |
| TC1031 | FRAUD_REJECT | …2223 | rechaza | ACEPTADA | 🔴 ídem |
| TC1030 | FRAUD_REVIEW | — | — | skip por diseño (sin oráculo verificado) | ⏭ |

Fixes de test de esta ronda (commit `fix(gateway-pg): [TS-EBIZ-TC1003] default billing address…`):
dirección de facturación default documentada para el 5° campo (dato INERTE al outcome en eBiz;
override por celda) + `slowMs` de la celda sumado al timeout del oráculo de validación.

## Hallazgo 1 — MAGIIS vincula como válidas tarjetas que el procesador DECLINA (defecto de integración)

**La capa PSP quedó aislada con probes SOAP directos** (`runTransaction` `authonly`,
`soap.ebizcharge.net/eBizService.svc`, mismas creds del merchant, monto $12.xx, 2026-07-31):

| Tarjeta | Respuesta DIRECTA del PSP | Vía alta de tarjeta MAGIIS |
|---|---|---|
| …2224 happy | `ResultCode A — Approved` · AVS YYY · CVV M · AuthCode real | vinculada ✓ |
| …2228 decline 05 | **`ResultCode D — Declined` · `ErrorCode 10205 "Do not Honor"`** (RefNum 3234133983) | **vinculada como válida** ✗ |
| …2229 AVS NNN | `ResultCode A — Approved` · **echo `AvsResultCode NNN`** (RefNum 3234189816) | rechazada ✗ |

Conclusión (evidencia de 3 capas: tabla vendor + PSP directo + UI MAGIIS):
- La tabla de triggers por número **SÍ funciona** en la cuenta merchant del equipo (docs del
  vendor confirmadas: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>;
  "simulating the FDMS Nashville responses on the sandbox server").
- **La validación del alta de MAGIIS no propaga el decline del procesador**: 6 tarjetas que el
  PSP declina (05/51/12/15/62/fraud-reject) quedaron vinculadas como método de pago válido.
  Riesgo de negocio: el rechazo real aparece recién al COBRAR el viaje (o nunca en el alta) —
  un pasajero con tarjeta sin fondos viaja igual.
- Clasificación (defect-management doctrine): la integración eBiz es feature PRE-release →
  **Defect** (no Bug), severidad **Critical** (flujo de dinero). Borrador listo para filear:
  `docs/gateway-pg/reports/DEFECT-ebiz-alta-no-propaga-decline-2026-07-31.md` (MG es scope
  Xray-only: lo abre el usuario/líder en el proyecto DEV que corresponda).
- Los 6 casos QUEDAN ROJOS a propósito (la expectativa de negocio es correcta: una tarjeta
  declinada no debe vincularse). En el ATR van como FAILED con el defecto linkeado — NO se
  debilita el oráculo para ponerlos verdes.

## Hallazgo 2 — MAGIIS rechaza el alta cuando el echo AVS es NNN (divergencia, decisión de negocio pendiente)

El PSP APRUEBA la …2229 (con echo AVS NNN); MAGIIS la rechaza con el error genérico. Combinado
con el Hallazgo 1: **la validación de MAGIIS parece decidir por el resultado AVS, no por el
approve/decline del procesador** (explica los dos hallazgos a la vez).

⚠ NO se ajustó el oráculo de TC1002: rechazar AVS NNN coincide con la regla de negocio USA
"sin match de ZIP = falla" (definida por el usuario para Authorize), así que puede ser
comportamiento DESEADO — pero la expectativa de la matriz (`APPROVED_AVS_MISMATCH` → aprueba)
viene de la tabla del PSP, y con UNA observación no se flipea. Pendiente: decisión de negocio
(¿el alta debe rechazar AVS NNN?) → si sí, el caso pasa a esperar rechazo con base
`live-verified` + regla citada, y el intent se renombra en la próxima ronda del idmap.

## Viajes creados (cierre manual desde app driver, a cargo del usuario)

Los 3 casos verdes crearon 1 viaje cada uno (TC1001, TC1003, TC1020) — quedan en
`Buscando chofer` hasta el cierre manual.

## Próximos pasos

1. Suite HOLD eBiz (`ebizcharge-hold.spec.ts`) — alta con hold; cierre driver manual.
2. Cargo a bordo eBiz.
3. CFG (link/unlink/exclusividad) AL FINAL — destructiva, avisar al usuario antes.
4. Acreditación en MG-559 con evidencia adjunta por run (directiva del usuario): verdes PASSED +
   evidencia; los 6 del Hallazgo 1 FAILED + defecto.
5. Decisión de negocio del Hallazgo 2 → ajustar (o no) el oráculo de TC1002 con base citada.

## Validación exploratoria — devolución del hold al cancelar viaje programado (2026-07-31, QA lead + verificación API/DB)

**PASS en trifuerza para el viaje 67969** (colaborador desde carrier, programado, Hold ON $207.93,
cancelado por el carrier): `CARD_HOLDS` fila 1683 transicionó **`HOLD` → `RELEASE`** (mismo intent
`3234201165`, mismo monto) · logs MGW `Approved, remainingBalance 0` → `CANCELLED BY_COLLECTOR`
(21:11:41–43) · PSP directo **`Voided` / "Voided Sale"** (AuthCode 178428).
Para el 67962 el release también se acreditó (PSP `Voided`, $10), con la observación de que lo
liberado fue el hold de VALIDACIÓN de la tarjeta — nunca se colocó hold de monto de viaje y
`CARD_HOLDS` no tiene fila (IDs consecutivos 1678→1683: nunca se escribió, no se borró). Decisión
del QA lead: no es bug; queda como observación de diseño de trazabilidad.

**Capacidad nueva para la campaña — capa PSP por SOAP** (cumple la restricción sin-dashboard):
`GetTransactionDetails(securityToken, transactionRefNum)` y `SearchTransactions(...)` contra
`soap.ebizcharge.net/eBizService.svc` (ns `http://eBizCharge.ServiceModel.SOAP`), token con las
3 creds de `.env.test`. El `RefNum` del PSP == `intentId` de MGW == `CARD_HOLDS.INTENT_ID`. El
reloj del PSP corre 7 h detrás del de la DB. Ciclo confirmado de `CARD_HOLDS.STATUS`:
`HOLD` → `RELEASE` (cancelación) | `CAPTURE` (cobro).

Evidencia: `evidence/test/ebizcharge/hold-release/VALIDACION-hold-release-67962-67969.md`
(+ 3 respuestas XML crudas del PSP en la misma carpeta). Barrido de cierre: **cero retenciones
vivas** en la ventana del merchant.

## Ronda de trifuerza sobre los declines (2026-07-31) — el Hallazgo 1 se DESCOMPONE en 3 causas

Se agregó la **pata PSP forense** al camino de decline de `card-outcome-matrix.factory.ts`: cuando el
oráculo UI falla, el diagnóstico consulta el procesador por SOAP (filtrando por last4) y
`paymentMethodsByPax` para ver si la tarjeta persistió. Helper nuevo:
`tests/features/gateway-pg/helpers/ebiz-psp.ts`. Utilities silenciosas — sin creds o error de red
NO alteran el veredicto UI (la capa es forense, no decide).

Re-corrida caso por caso de los 6 declines. **No son un solo hallazgo:**

### Causa 1 — Defecto de integración CONFIRMADO en 3 capas (4 casos, no 6)

El PSP declinó **esa transacción puntual** con su código, y la tarjeta **quedó vinculada** como
método de pago del pax 5289:

| TC | Tarjeta | RefNum del PSP | Veredicto del procesador | Persistencia |
|---|---|---|---|---|
| TC1011 | …2228 | 3234213576 | `D-Declined` · 10205 "Do not Honor" | **quedó vinculada** |
| TC1012 | …2224 (`4000300611112224`) | 3234213591 | `D-Declined` · 10251 "Insufficient funds" | **quedó vinculada** |
| TC1013 | …2227 | 3234213603 | `D-Declined` · 10212 "Invalid Transaction" | **quedó vinculada** |
| TC1014 | …2221 | 3234213606 | `D-Declined` · 10262 "Restricted Card" | **quedó vinculada** |

Esto **eleva** la evidencia del defecto: antes era "el PSP declina según la doc del vendor"; ahora es
"el PSP declinó ESTA transacción, con RefNum y código, y la tarjeta igual quedó como medio de pago".

### Causa 2 — TC1031 (FRAUD_REJECT, …2223) NO es el mismo defecto

El PSP **APROBÓ** (RefNum 3234213621, `A-Approved`, luego `Voided`). El fraud profiler de esta cuenta
merchant no declina, o el trigger no está activo. Que MAGIIS vincule la tarjeta es **coherente** con
lo que contestó el procesador: el rojo es del ORÁCULO (la doc promete un rechazo antifraude que el
sandbox no produce), no de la integración. Refuta además la hipótesis "Fraud Review / Response Code 4"
que sugería el mensaje de error: no hubo review, hubo approve.

### Causa 3 — TC1015 (DECLINE_INVALID_ISSUER, …2226) es gap del MODELO del test

Cero transacciones en el PSP **y** la tarjeta no persistió. Es el único caso con `exp 0922`
(vencida): la expiración se valida del lado del cliente, la request nunca sale, y no hay mensaje de
rechazo **de pasarela** que `expectNativeCardRejected` pueda assertar. No es defecto de producto —
el caso necesita otro oráculo (validación de formulario, área del futuro MG-482).

### Dos gotchas que costaron intentos

- **last4 colisionados**: `…2224` es last4 del happy `4000100011112224` **y** del insufficient-funds
  `4000300611112224`; `…2221` es del CVV-mismatch **y** del restricted-card. El filtro forense por
  last4 devuelve filas de ambas tarjetas → leer la transacción de la ventana, no la primera fila.
- **`mode: 'serial'`** (`card-outcome-matrix.factory.ts:99`): un rojo **saltea el resto** de la matriz
  (`N did not run`) y `--max-failures` no lo evita. Los declines se corren **de uno** por `--grep`.
