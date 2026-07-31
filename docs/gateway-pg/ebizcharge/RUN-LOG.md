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
