# Veredicto de release — Authorize.Net · MG-178

**Fecha:** 2026-07-29 · **Ambiente:** `test` (apps-test) · **Carrier:** 1521 (Remises EEUU) ·
**Rama:** `carrier/ebiz-matrix-standardization` · **Rúbrica:** `regression-testing/SKILL.md` §GO/NO-GO

## Veredicto: 🔴 NO-GO

**Y no por score — por veto.** La rúbrica solo se aplica sobre un pass-rate legítimo, y hoy las áreas
que miden dinero **no producen pass-rate**: el guard de cuenta las corta antes de correr. Eso es el
comportamiento correcto del guard, no una falla de la suite.

---

## Por qué el score no alcanza para decidir

| Factor de la rúbrica | Valor hoy | Aporte |
|---|---|---|
| Pass rate | pack API **6/11 ≈ 55%** · áreas UI de dinero **sin correr** | veto duro (`< 90%`) |
| Regressions | **0 REGRESSION** — los 5 rojos son ENVIRONMENT/KNOWN-BLOCKED por §0 | no penaliza |
| Critical tests | ninguno acredita autorización real | no computable |
| Flaky | `DELETE` de tarjeta en 500 intermitente | penaliza |

`SKILL.md:354` — *"Never auto-GO if … pass rate < 90%"*. El veto se dispara solo.

**El matiz que cambia el número:** los 5 rojos del contract **no son regresión de producto** —
codifican expectativas que la configuración actual de cuenta no puede cumplir. Marcados
`@blocked:<key>` saldrían del pass-rate que gatea (`SKILL.md:255-258, 308-311`) y el veredicto pasaría
de *NO-GO mecánico* a **CAUTION evaluable**. Sin ese marcado, hunden el número por un motivo que no es
calidad de producto.

---

## El bloqueante raíz: dos cuentas de Authorize distintas

Detalle completo en `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md` §0.

- La cuenta de `.env.test` está en **Test Mode** y devuelve la **misma respuesta enlatada** para los
  6 triggers, 15/15 reproducible: `responseCode '1'` · `authCode '000000'` · `transId '0'` ·
  `testRequest '1'` · `avs 'P'` · `cvv ''`.
- El backend de MAGIIS usa **otra** cuenta: produjo `NO_AUTH` con `transId` real `80057692216`,
  imposible en Test Mode.
- **Causa autoinfligida:** `GatewaySwitchSteps.linkAuthorize` vincula con esas mismas creds, así que
  **correr la suite CFG deja al carrier apuntando a la cuenta enlatada** y contamina toda medición de
  pago posterior.

### Consecuencias que hay que decir sin adornos

1. **Ningún verde de Authorize acredita una autorización real.** Los 6 verdes del contract acreditan
   la respuesta del endpoint — así está declarado en `EXTERNAL-BLOCKERS.md:36`, con la consecuencia
   asumida por escrito.
2. **Un verde en un caso de decline no prueba cobertura de decline**: es el resultado esperado de una
   cuenta que aprueba todo.
3. **El hallazgo de la ronda 4 queda reencuadrado**: "los 3 declines no rechazan en ninguna área" no
   es evidencia sobre MAGIIS, es evidencia sobre la cuenta que instaló nuestra propia suite.
4. **Los filtros AVS / Card Code Verification están decididos, no verificados.** El código dice
   "(aplicado 2026-07-28)" en 3 lugares y `docs/gateway-pg/authorize/matriz_cases.md:112` prueba lo
   contrario (CCV deshabilitado, `cvvResultCode` vacío con CVV válido). Mientras `.env.test` apunte a
   la cuenta enlatada, **los filtros son inobservables por construcción**: no se puede distinguir
   "filtro apagado" de "filtro encendido en la otra cuenta".

---

## Lo que sí está acreditado

| Evidencia | Alcance |
|---|---|
| **Área C, 8 de 9 intents verdes** (ronda 1, `--repeat-each=3` en el control) | Acredita que el flujo de alta de tarjeta funciona end-to-end. **No** acredita el outcome de la pasarela |
| **Campaña MANUAL, 16 runs PASSED en MG-558** (ronda 6) | Evidencia manual sin adjuntos, marcada como sobreescribible por el import automatizado. No entra en la rúbrica de `regression-testing` |
| **Visa 13 y 16 dígitos, Mastercard, Amex validan** (ronda 2) | El form no es rígido con el largo del PAN |
| **71 tests Authorize colectando**, `tsc` limpio, 18 unit verdes | Salud de la suite, no del producto |

---

## Defectos abiertos que pesan en la decisión

| Defecto | Estado | Impacto en el GO |
|---|---|---|
| **Discover bloqueada en la UI** mientras Authorize.net la aprueba (confirmado por 2 vías) | Comentado en `MG-527` (#34511) y `MG-178` (#34512), sin ticket `Error` por decisión de gobierno | Si algún test que lo cubre es `@critical`, es **veto duro** (`SKILL.md:354`) |
| **`DELETE` de tarjeta → 500 intermitente** (6 cards: 4706, 4709, 4712, 4715, 4719, 4728) | Sin ticket propio. Sobrevive a la caída del servicio → defecto propio, no ambiental | Contamina mediciones; obligó a construir un guard de atribución |
| **`HAPPY_PARTIAL_AUTH` sin oráculo** — 4 `SEARCHING_DRIVER` vs 1 `NO_AUTH` en 5 muestras | Fuera de `OUTCOME_BY_INTENT` a propósito | Riesgo de dinero **no descartado**: autorizar USD 1.23 sobre USD 163.92 y crear el viaje igual. No afirmable con la cuenta enlatada |

---

## Camino crítico al GO

**B1 → B2 → re-medir → clasificar → veredicto.** Los dos primeros pasos no se cierran con código.

| # | Paso | Owner | Desbloquea |
|---|---|---|---|
| **B1** | API Login ID + Transaction Key de la **cuenta del equipo** en `.env.test` + **re-vincular** la pasarela | Dueño de la cuenta / Lead QA | **Todo.** Sin esto nada que mida dinero es medible |
| **B2** | Verificar en Merchant Interface que CCV y Enhanced AVS estén realmente en `N = Decline` | Administrador de la cuenta | `DECLINE_INVALID_CVC` y `DECLINE_ZIP_MISMATCH`. **No es observable hasta que B1 esté hecho** — el orden es B1 → B2, no en paralelo |
| — | Re-medir área C, área F y los 3 declines con la cuenta alineada | — | Pass-rate legítimo |
| — | Clasificar los rojos remanentes en REGRESSION / KNOWN / ENVIRONMENT | — | Que la rúbrica sea aplicable |
| — | Re-emitir este veredicto con los números reales | — | La decisión |

**Si en la re-medición el viaje sigue quedando `SEARCHING_DRIVER` con Response Code 2 desde la
pasarela, eso sí es defecto de producto de severidad alta** (pre-autorización rechazada tratada como
aprobada) y hay que reportarlo antes de cualquier GO.

### Pregunta que puede cambiar la naturaleza del veredicto

`EXTERNAL-BLOCKERS.md` §2 sigue abierta: **¿MAGIIS usa Authorize en producción?** Si la respuesta es
"sin uso productivo previsto", la matriz de Authorize es documentación de referencia y el release no
necesita un GO de esta pasarela — la pregunta pasa a ser de cobertura, no de gate.

---

## Nota metodológica — las 5 trampas de vacuidad de la campaña

La campaña encontró 5 construcciones que producían **verdes que no verificaban nada**. Son
independientes del dominio de pasarelas y valen como checklist para cualquier suite Playwright:

| # | Construcción | Por qué pasa vacuamente |
|---|---|---|
| 1 | `expect(x).not.toBeVisible({timeout})` / `toBeHidden()` | se satisface con el primer chequeo; el `timeout` no se consume |
| 2 | `locator.isVisible({timeout})` | chequeo inmediato — **ignora** el `timeout` |
| 3 | `expect(botón).toBeDisabled()` como asentamiento | en este form `disabled` = "ya se submiteó", no "procesando" |
| 4 | `getByText(...).first().waitFor(visible)` | mide el índice 0, no el estado del conjunto |
| 5 | un **guard fail-open** (veredicto nulo ⇒ no lanza) | un verde bajo él no prueba que la precondición se cumpla, solo que no se pudo determinar. Cerrado en `fe07901` |

Regla: **una aserción de ausencia nunca es oráculo por sí sola**, y **un lector inmediato nunca es un
asentamiento**.

---

## Higiene

**0 viajes abiertos** al cierre de la ronda 5, verificado con `cleanup-travels-api.ts --dry-run`.
Ningún spec quedó con `skip` o `fixme` agregado para forzar un verde. `CARD_MATRIX` no se relajó en
ninguna ronda: los casos que no se pueden medir están bloqueados por guard, no silenciados.
