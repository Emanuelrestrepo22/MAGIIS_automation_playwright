# Plan · Smoke UAT con tarjetas reales — Authorize.net

> **Objetivo**: acreditar en UAT, con tarjeta real, los dos comportamientos que gatean el pase a
> producción de la pasarela Authorize:
> **(A)** el dinero vuelve al pax al cancelar un viaje programado con pre-autorización activa;
> **(B)** el alta de viaje desde app culmina satisfactoriamente con el cobro cerrando el viaje.
>
> Pasarela 1 de 4 del release MG-178. Ejecución **manual** (política: automatización de gateway solo
> en `test`; UAT gateway = manual). Registro en un Test Execution propio de UAT.
>
> Estado: **BLOQUEADO en precondiciones** — ver §3. El preflight de §2 ya está hecho.

---

## 1. Casos bajo prueba (Xray real)

Los tests nativos de Authorize cubren los dos comportamientos con más precisión que los tests de
área genéricos. Cadena canónica, en orden de ejecución:

| # | Test | tcid | Qué acredita | Estado Xray |
|---|---|---|---|---|
| 1 | [MG-220](https://magiis.atlassian.net/browse/MG-220) | TC-PAY-CFG-10 | Authorize vinculado con credenciales válidas, estado Vinculado en UI **y** DB | LISTO PARA RELEASE |
| 2 | [MG-286](https://magiis.atlassian.net/browse/MG-286) | TC-PAY-WAL-03 | Alta de tarjeta real desde **App PAX modo Personal**, visible en Billetera | LISTO PARA RELEASE |
| 3 | [MG-349](https://magiis.atlassian.net/browse/MG-349) | TC-PAY-COB-04 | Pre-autorización activada → hold por monto estimado + margen configurado | LISTO PARA RELEASE |
| 4 | [MG-347](https://magiis.atlassian.net/browse/MG-347) | TC-PAY-COB-02 | **(B)** Alta desde App PAX Personal → flujo completo hasta finalización por App Driver | LISTO PARA RELEASE |
| 5 | [MG-524](https://magiis.atlassian.net/browse/MG-524) | TC-PAY-COB-25 | **(B)** Misma cadena con Hold ON y cobro por `priorAuthCapture` (RC1) | LISTO PARA RELEASE |
| 6 | [MG-350](https://magiis.atlassian.net/browse/MG-350) | TC-PAY-COB-05 | **(B)** Capa PSP: la transacción pasa de *autorizado* a *cobrado* en Authorize | LISTO PARA RELEASE |
| 7 | [MG-356](https://magiis.atlassian.net/browse/MG-356) | TC-PAY-COB-11 | **(A)** Cancelar viaje con hold **antes de la captura** → autorización liberada, sin fondos retenidos | Tareas por hacer |
| 8 | [MG-627](https://magiis.atlassian.net/browse/MG-627) | TC-PAY-E-04 | **(A)** Versión de área del mismo comportamiento; ya verde en `test` con eBizCharge, necesita el sello UAT | LISTO PARA RELEASE |

**Segunda ola (requiere esperar el batch de settlement, ver §5)**

| # | Test | tcid | Qué acredita |
|---|---|---|---|
| 9 | [MG-528](https://magiis.atlassian.net/browse/MG-528) | TC-PAY-COB-40 | Refund total de una transacción **ya settled** |
| 10 | [MG-531](https://magiis.atlassian.net/browse/MG-531) | TC-PAY-COB-41 | Refund parcial y saldo restante correcto |

---

## 2. Preflight — estado real de UAT (medido, no asumido)

| Capa | Estado | Dato medido |
|---|---|---|
| Web UAT | OK | `https://apps-uat.magiis.com` → 200 |
| API UAT | OK | `https://apps-uat.magiis.com/magiis-v0.2/` → 200 |
| Oracle UAT | OK | `magiis-uat-v6…rds.amazonaws.com:1521/ORCL`, usuario `magiis`, alcanzable desde esta máquina |
| Link Authorize | **ACTIVO** | `MGW_LINKED` id **136** · `CARRIER_ACCOUNT_ID=1721` · `PROVIDER=AUTHORIZE` · `ACTIVE=1` · creado 2026-01-21 |
| Exclusividad | Coherente | 1 solo gateway activo por carrier: AUTHORIZE→1721 · EBIZ→1921 · MERCADOPAGO→1040 · **STRIPE→0 activos** |
| Carrier 1721 | `kinetic@yopmail.com` | Único usuario admin: `MAGIISUSER` id 143324, `ENABLED=1` |
| Credenciales `.env.uat` | **NO corresponden** | `USER_CARRIER=uatremiseriamagiis@gmail.com` → user 1380 → **carrier 1040** (el de MercadoPago) |
| Método de pago tarjeta | **DESHABILITADO** | `CARRIER_PAYMENT_METHODS_CONFIG` del 1721: `CREDIT_CARD_ENABLED=0` en las 6 filas (APP_PAX, CARRIER, CONTRACTOR, INTERFACES, MAIN, QUOTE); `DEFAULT_SELECTION='CASH'` |
| Historia de holds Authorize | **CERO** | `CARD_HOLDS` en UAT solo tiene filas MERCADOPAGO y STRIPE; ninguna `PROVIDER_CODE='AUTHORIZE'` en toda la tabla |
| Holds vivos heredados | 3 | ids 75 (MP, $140, 2025-05-26), 26 y 23 (STRIPE, $4.99, 2024-11-12) en `STATUS='HOLD'` — datos viejos, ajenos a este smoke |
| Carrier 1481 | Libre de gateway | 7 links Authorize históricos, todos `ACTIVE=0`; último unlink 2026-05-19 → sin conflicto de exclusividad |

**Esquema UAT confirmado** (para las consultas de verificación):

```
MGW_LINKED   : ID, CARRIER_ACCOUNT_ID, API_KEY, PROVIDER, CREATE_DATE, DELETE_DATE, ACTIVE, STATUS
CARD_HOLDS   : ID, TRAVEL_ID, PROVIDER_CODE, INTENT_ID, AMOUNT_HOLD, CREATION_DATE, EXPIRED_DATE, STATUS, CLIENT_SECRET
CARRIERACCOUNT / CARRIER_USER (CARRIER_ACCOUNT_ID, USER_ID) / MAGIISUSER / USER_WALLET / CARD
CARRIER_PAYMENT_METHODS_CONFIG : CARRIERACCOUNT_ID, TYPE_CONFIG, CREDIT_CARD_ENABLED, …
```

> Ojo: en UAT `CARD_HOLDS` usa `AMOUNT_HOLD` (no `AMOUNT`) y `CARRIERACCOUNT` va **sin** guion bajo,
> mientras `MGW_LINKED.CARRIER_ACCOUNT_ID` **sí** lo lleva. `MGW_LINKED.STATUS` existe en UAT (era
> `null` en la fila 136).

---

## 3. Bloqueadores de precondición

| # | Bloqueador | Impacto | Acción / dueño |
|---|---|---|---|
| B1 | No hay credenciales del carrier **1721**, el único con Authorize activo en UAT | Bloquea los 8 casos | Recuperar acceso a `kinetic@yopmail.com` (buzón yopmail, reset por mail) **o** vincular Authorize en el carrier **1481** (libre de exclusividad, con credenciales a confirmar). Vincular en 1040 exigiría desvincular MercadoPago → **no hacerlo**, rompe otra campaña |
| B2 | `CREDIT_CARD_ENABLED=0` en las 6 configs del 1721 | El medio "Tarjeta preautorizada" podría no ofrecerse en alta de viaje ni en App PAX | Confirmar en UI si el link de gateway lo expone igual; si no, habilitar tarjeta en la config de métodos de pago del carrier antes del caso 2 |
| B3 | `.env.uat` no tiene credenciales de **App PAX** ni de **App Driver** | Bloquea (B): el alta desde app y la finalización por el driver | Aportar usuario/clave de pax y driver de UAT del carrier elegido |
| B4 | Indeterminado si la cuenta Authorize de UAT es **sandbox o producción** | Con sandbox la tarjeta real se rechaza y el smoke no prueba nada; con producción mueve dinero real | Verificar en el Merchant Interface de Authorize a qué cuenta apunta el link (pata PSP, a tu cargo) |
| B5 | Authorize nunca ejecutó un hold en UAT (0 filas) | El camino está virgen: alto riesgo de reproducir el defecto de eBizCharge (hold real en el PSP sin registro en MAGIIS) | Ninguna acción previa: es justamente lo que el smoke debe detectar. Refuerza que la pata PSP **no es opcional** |

---

## 4. Verificación por capas (trifuerza + PSP)

Cada caso se acredita en las cuatro capas. La pata PSP es la que salvó el release de eBizCharge:
un hold puede existir en el proveedor sin ninguna fila local.

| Capa | Herramienta | Quién |
|---|---|---|
| UI | App PAX / App Driver / portal Carrier en `apps-uat.magiis.com` | QA humano (la tarjeta real la tipea una persona) |
| API MAGIIS | endpoints de `validate` / `hold` / `epayment` sobre `/magiis-v0.2/` | agente |
| Oracle UAT | `CARD_HOLDS`, `TRAVEL`, `USER_WALLET`, `CARD`, `MGW_LINKED` (read-only) | agente |
| PSP Authorize | Merchant Interface (`Unsettled Transactions` / `Search`) — estado, AuthCode, monto | QA humano; el agente indica qué transacción buscar y qué estado esperar |

### Consultas de verificación listas para usar

```sql
-- Hold del viaje bajo prueba (reemplazar :travelId)
SELECT ID, TRAVEL_ID, PROVIDER_CODE, INTENT_ID, AMOUNT_HOLD, STATUS, CREATION_DATE, EXPIRED_DATE
  FROM CARD_HOLDS WHERE TRAVEL_ID = :travelId ORDER BY ID DESC;

-- ¿Authorize dejó rastro local alguna vez? (control del riesgo B5)
SELECT PROVIDER_CODE, STATUS, COUNT(*) TOTAL, MAX(CREATION_DATE) ULTIMO
  FROM CARD_HOLDS GROUP BY PROVIDER_CODE, STATUS ORDER BY 1, 2;

-- Estado del link del carrier
SELECT ID, CARRIER_ACCOUNT_ID, PROVIDER, ACTIVE, STATUS, CREATE_DATE, DELETE_DATE
  FROM MGW_LINKED WHERE CARRIER_ACCOUNT_ID = :carrierId ORDER BY ID DESC;

-- Tarjeta del pax en la billetera (tras el caso 2)
SELECT w.ID WALLET_ID, w.USER_ID, c.ID CARD_ID, c.LAST_FOUR_DIGITS
  FROM USER_WALLET w JOIN CARD c ON c.USER_WALLET_ID = w.ID
 WHERE w.USER_ID = :passengerUserId;

-- Barrido de cierre: que no quede nada retenido por este smoke
SELECT ID, TRAVEL_ID, PROVIDER_CODE, AMOUNT_HOLD, STATUS, CREATION_DATE
  FROM CARD_HOLDS WHERE STATUS = 'HOLD' AND CREATION_DATE >= TRUNC(SYSDATE);
```

---

## 5. Los dos caminos del reintegro (comportamiento A)

Distinción crítica con tarjeta real, porque el dinero se comporta distinto:

```
viaje programado con hold activo
        |
        +-- cancelado ANTES del batch de settlement  -->  VOID de la autorización
        |     dinero nunca se movió; la retención cae del estado de cuenta en días
        |     acredita: MG-356 · MG-627
        |
        +-- cancelado DESPUES de la captura/settlement -->  REFUND
              el dinero salió y vuelve: 5-10 dias hábiles según el emisor
              acredita: MG-528 · MG-531
```

Authorize liquida por **batch diario** según el corte configurado en el merchant. Por eso el caso 7
(void) debe ejecutarse el **mismo día**, antes del corte; y los casos 9-10 (refund) exigen esperar a
que la transacción quede `settled`, típicamente al día siguiente. Planificar el smoke en dos jornadas.

---

## 6. Reglas de dinero real

1. Montos **mínimos** en cada viaje de prueba; el margen del hold se suma sobre el estimado.
2. La tarjeta real la ingresa **una persona**. El agente no tipea datos de tarjeta en ningún formulario.
3. Cada viaje de prueba se registra con `travelId`, `INTENT_ID` y monto para poder reconciliar.
4. **Barrido de cierre obligatorio** al terminar cada jornada: ningún hold del smoke puede quedar
   vivo en el PSP ni en `CARD_HOLDS` (consulta en §4).
5. Cualquier divergencia entre capas (PSP dice retenido / MAGIIS no tiene fila, o al revés) se
   reporta como hallazgo, no se "arregla" en caliente.

---

## 7. Registro y evidencia

- **Test Execution** propio de UAT bajo el ATP [MG-178](https://magiis.atlassian.net/browse/MG-178),
  separado de [MG-560](https://magiis.atlassian.net/browse/MG-560) (Ronda 1, entorno `test`), con
  environment `uat`. Los Test Executions parentan a la épica de proceso QA MG-509.
- Evidencia en `evidence/uat/authorize/<caso>/` — capturas de UI, respuestas de API, filas de DB y
  la captura del Merchant Interface por transacción.
- Documento de cierre por comportamiento, con el mismo formato que
  `evidence/test/ebizcharge/hold-release/VALIDACION-hold-release-67962-67969.md`: cronología por
  capa y correlación de identidad `INTENT_ID` == referencia del PSP.

---

*Preflight ejecutado 2026-08-03 contra `magiis-uat-v6` (read-only). Los datos de §2 son medidos en
vivo; los bloqueadores de §3 son los que faltan resolver para poder ejecutar.*
