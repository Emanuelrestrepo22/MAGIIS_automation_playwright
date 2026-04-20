# Smoke Flakiness Report — Gateway PG

> Análisis consolidado de 6 pipelines post-estabilización (2026-04-19).
> Scope: suite `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` (16 TCs).
> Objetivo: identificar flaky tests, clasificar por tipo de fallo, y priorizar fixes.

---

## 1. Matriz TC × Pipeline (pass/fail por run)

| TC | p27977<br>(MR12) | p42247<br>(MR13) | p49983<br>(MR14 v1) | p80052<br>(MR16 v3) | p90660<br>(MR17 opt3DS) | p22913<br>(MR18 nonfatal) | Flaky rate |
|---|---|---|---|---|---|---|---|
| **P2-TC001** (TC11 4242 Hold ON) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **0/6** |
| **P2-TC002** (TC13 4242 Hold OFF) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **0/6** |
| **P2-TC005** (TC12 3DS éxito 3155) | ✅ | ✅ | ✅ | ❌ S06 | ✅ | ❌ S07 | **2/6** |
| **P2-TC090** (TC14 card declinada) | ❌ S04 | ❌ S04 | ❌ S04 | ✅ | ✅ | ✅ | **3/6 (pre-MR16)** |
| **TC1033** (TC05 Carrier Hold ON) | ✅ | ✅ | ✅ | ❌ S01 | ✅ | ✅ | **1/6** |
| **TC1037** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1049** (TC01 AppPax 4242) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1050** (TC03 AppPax Hold OFF) | ✅ | ✅ | ✅ | ✅ | ❌ cleanup | ✅ | **1/6** |
| **TC1053** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1057** (TC10 fail3DS 9235) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1065** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1081** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1096** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| **TC1111** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| SMOKE-AUTH-TC01 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |
| SMOKE-AUTH-TC02 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0/6 |

**11 de 16 TCs son 100% estables** (pass en todos los runs).
**4 TCs son flaky** con rates distintos.

---

## 2. Análisis de los 4 TCs flaky

### 2.1 P2-TC005 (SMOKE-GW-TC12) — 2/6 fallos

**Escenario:** Contractor · Colaborador · Hold ON · tarjeta 3DS éxito (3155).

| Run | Stage | Error | Iter. que causó |
|---|---|---|---|
| p80052 | STEP-06 | `Stripe challenge frame not found` (timeout) | post-MR16 — `waitForVisible()` lanzaba error si no aparecía |
| p22913 | STEP-07 | `expect(page).toHaveURL(/contractor\/dashboard/)` 20s timeout, URL quedó en `/travel/create` | post-MR17 — `waitForOptionalVisible(5_000)` era muy corto, saltaba 2do 3DS antes de que apareciera |

**Clasificación:** **TIMING** (2do 3DS del portal contractor tarda 8-15s en aparecer).

**Estado actual del fix:** MR !19 ya aplicado (timeout `waitForOptionalVisible(18_000)`). Pipeline `2463919899` validando. Probable que resuelva.

### 2.2 P2-TC090 (SMOKE-GW-TC14) — 3/6 fallos PRE-fix, 0/3 POST-fix

**Escenario:** Contractor · Colaborador · Hold ON · tarjeta declinada.

**Evolución:**
- Fallos pre-MR16: card 9995 + 45s timeout en Validar
- Iteración MR14: card 0002 pero `success=true` inesperado
- Iteración MR16: validar `btn.toBe(false)` (card bloquea flow) → ✅ RESUELTO

**Clasificación:** **FLOW** (resuelto). El fix del MR !16 convirtió en test determinístico.

### 2.3 TC1033 (SMOKE-GW-TC05) — 1/6 fallos

**Escenario:** Carrier · Colaborador · Hold ON · 4242.

**Error (p80052):** STEP-01 Login carrier — URL quedó en `/authentication/login/carrier`, timeout 15s de `toHaveURL` expected `/home/carrier/dashboard/`.

**Clasificación:** **ENV** (auth flaky — backend de auth no respondió o devolvió lento). No es bug de código. Ocurre aleatoriamente en TEST.

**Impacto:** único fallo en 6 runs = ~17% flakiness. Típico de entornos compartidos.

### 2.4 TC1050 (SMOKE-GW-TC03) — 1/6 fallos

**Escenario:** Carrier · AppPax · Hold OFF.

**Error (p90660):** STEP `[CLEANUP] Restaurar hold en preferencias operativas` — `TimeoutError: page.waitForResponse: Timeout 15000ms` en `saveAndCaptureParametersPayload` (POST parameters no llegó).

**Clasificación:** **ENV** (backend TEST lento al persistir preferencias operativas).

**Estado actual del fix:** MR !18 ya aplicó `try/catch` en `restoreHoldForSmoke` — no-fatal. El cleanup no invalidará el test aunque el backend falle.

---

## 3. Clasificación consolidada

| Tipo | TCs | Estrategia |
|---|---|---|
| **FLOW** (test mal diseñado) | P2-TC090 (ex) | ✅ Resuelto (MR !16) |
| **TIMING** (timeouts cortos) | P2-TC005 | 🔄 MR !19 aplicado, validando |
| **ENV** (entorno TEST flaky) | TC1033, TC1050 | ✅ TC1050 ya con no-fatal cleanup (MR !18). TC1033 requiere retry strategy |

---

## 4. Hallazgos laterales positivos

1. **`workflow.auto_cancel.on_new_commit: interruptible` funcionando:**
   - Pipeline `2463772397` (MR !15) → `canceled` automático al llegar commit posterior.
   - Ahorra compute y evita choques de estado compartido.

2. **Cleanup TC11 (MR !12) desbloqueó TC12:**
   - Pre-MR12: TC12 fallaba intermitente por viaje activo de TC11 sin limpiar.
   - Post-MR12: TC12 estable salvo por timing del 2do 3DS.

3. **Trazabilidad ID resuelta:**
   - 4 TCs pre-MR11 con `[SIN-ID-MATRIZ]` → ahora tienen ID canónico (P2-TC001/002/005/090).
   - Pipeline Tests tab muestra cada TC con su ID de matriz.

---

## 5. Plan de fixes priorizado (Fase 2)

### Tier 1 — Validar fixes ya aplicados

| # | Test | Fix aplicado | Validación pendiente |
|---|---|---|---|
| 1 | P2-TC005 (TC12) | MR !19 timeout 18s | Pipeline `2463919899` result |
| 2 | TC1050 (TC03) | MR !18 no-fatal cleanup | Próximo run con hold OFF |

### Tier 2 — Fixes nuevos si Tier 1 no alcanza

| # | Test | Tipo | Propuesta |
|---|---|---|---|
| 3 | TC1033 (TC05) | ENV | `test.retry(1)` solo sobre STEP-01 del login. O mover login a `test.beforeAll` con retry propio. |
| 4 | P2-TC005 si sigue flaky | TIMING | Aumentar `waitForOptionalVisible` a 30s, o agregar chequeo alterno: si URL cambió a dashboard sin 2do 3DS, pasar directamente. |

### Tier 3 — Mejora estructural del smoke

| # | Item | Beneficio |
|---|---|---|
| 5 | Reducir serialización donde sea posible | Tests independientes que no comparten user → paralelizable |
| 6 | Agregar `test.retry(1)` globalmente a smoke | Mitiga cualquier flaky residual sin comprometer señal |
| 7 | Separar `@env-flaky` tags | Tests que dependen del entorno TEST tienen política de retry distinta |

---

## 6. Recomendación final

**Inmediata:**
1. **Esperar resultado de pipeline `2463919899`** (MR !19). Si TC12 pasa, el TIMING queda resuelto.
2. **No aplicar más parches reactivos** hasta ver N=3 pipelines seguidos sin fallos sobre el mismo TC.

**Mediano plazo:**
3. Implementar `test.retry(1)` en smoke — mitiga los 2 ENV flakies (TC1033, TC1050) sin más refactor.
4. Documentar en `docs/smoke/FLAKY-BASELINE.md` los 4 TCs conocidos con su frecuencia para monitoreo.

**Largo plazo:**
5. Cuando smoke sea 100% estable 10 runs seguidos → mover a gate de deploy.
6. Revisar tests flaky históricos con más frecuencia que 15% — considerar si el test real falla o hay desviación del env.

---

**Fuente:** pipelines analizados en `C:\Users\Erika\AppData\Local\Temp\smoke-flakiness-analysis\*.xml`.
**Generado:** 2026-04-19.
