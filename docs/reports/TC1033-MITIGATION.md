# TC1033 — Mitigación de Flakiness: retry(1)

**Fecha:** 2026-04-19
**Autor:** Agente scripts/tier2-tc1033-lint-cards (Claude Sonnet 4.6)
**Rama:** scripts/tier2-tc1033-lint-cards

---

## Test Case

- **ID:** TS-STRIPE-TC1033
- **Archivo spec:** `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` — SMOKE-GW-TC05
- **Descripción matriz:** Validar vincular tarjeta y Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada Hold (desde carrier) y Cobro desde App Driver — Vincular tarjeta nueva (seed)
- **Flujo:** Portal Carrier (Playwright) — dispatcher loga, habilita Hold en preferencias, crea viaje para colaborador con tarjeta sin 3DS (4242). Resultado esperado: viaje en SEARCHING_DRIVER sin modal 3DS.
- **Prioridad:** P1 (activo)

---

## Síntoma

El test falla de forma intermitente antes de completar el formulario o al validar el estado final en gestión de viajes. El fallo no es determinístico: en algunas ejecuciones CI pasa, en otras falla en el step de login/auth (`loginAsDispatcher`) o en la navegación a preferencias operativas.

Clasificación: **ENV — auth intermitente** (sesión expira o backend lento al inicio del test).

---

## Mitigación aplicada

**`retry(1)` local** — el test tiene un segundo intento automático antes de reportar fallo.

Implementación en spec:

```typescript
// Mitigación temporal TC1033: retry(1) por fallos ENV intermitentes de auth.
// Root cause pendiente investigación. Ver docs/reports/TC1033-MITIGATION.md.
test.describe('[TS-STRIPE-TC1033] Colaborador · Hold ON · sin 3DS (4242) → SEARCHING_DRIVER', () => {
  test.describe.configure({ retries: 1 });
  test('...', async ({ page }) => { ... });
});
```

Scope del retry: **solo TC1033 (SMOKE-GW-TC05)**. No afecta otros tests del mismo spec file.

---

## Limitación conocida

El retry **esconde el síntoma, no lo resuelve**. Si el root cause es una sesión expirada o un backend con latencia variable, la segunda ejecución usará un estado limpio y probablemente pasará — enmascarando la falla real en el reporte final de CI.

Consecuencias:

- El test puede reportar `passed (with retry)` en CI mientras el problema subyacente persiste.
- Si la causa raíz empeora (mayor frecuencia de fallos ENV), el retry se volverá insuficiente.

---

## Próximos pasos (root cause)

### Hallazgo de arquitectura (2026-04-20 — BL-002)

El smoke corre con `--project=chromium` (script `test:test:smoke:gateway`), que **no aplica el `storageState` preautenticado** del `global-setup.multi-role.ts`. Esto implica que cada test del smoke ejecuta `loginAsDispatcher` completo — `goto` + `clearCookies` + `login` + `ensureDashboardLoaded` — y el flakiness puede originarse en cualquiera de esas 3 fases sin señal diferenciada en el reporte.

Los projects `carrier` / `contractor` sí consumen el `storageState` persistido pero el smoke no los utiliza para evitar contaminar `Record new` / codegen.

### Instrumentación aplicada (2026-04-20)

- `loginAsDispatcher` y `loginAsContractor` envuelven cada fase (`goto`, `submit`, `dashboard`) en `runLoginPhase`:
  - En éxito → `debugLog('auth', '[role:phase] ok in Xms')`
  - En fallo → rethrow con prefijo `[login:<phase>][role] ...original... (after Xms)`
- Activación: `DEBUG=auth` en `.env.test` o export en CI. Sin `DEBUG=auth` los logs de éxito no se emiten; los fallos siempre quedan en el error.
- Archivo: `tests/features/gateway-pg/fixtures/gateway.fixtures.ts`.

Este cambio no altera el control flow — sólo categoriza la falla. Los `retry(1)` actuales siguen aplicando.

### Próximos pasos ejecutables

1. **Primera corrida CI post-instrumentación:** revisar si los fallos clasifican como `[login:goto]`, `[login:submit]` o `[login:dashboard]`. Usar los stacktraces del HTML report, no los logs.
2. Según el bucket dominante:
   - `goto` → ajustar timeouts de `LoginPage.goto` o reducir `clearCookies + re-goto` doble.
   - `submit` → investigar rate limit del endpoint auth en TEST (correlacionar horario de falla vs otros tests en serie).
   - `dashboard` → revisar timeout de `DashboardPage.ensureDashboardLoaded` (hoy 15s + 10s). El shell Angular puede necesitar más en backend frío.
3. **Comparar con TC1081** (`docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md`) — ese era bug de automation (guard mal interpretando `limitExceeded=false`). TC1033 no muestra ese patrón hoy, pero validar si hay señal similar.
4. **Medir tasa de retry en CI:** si `passed (with retry)` supera 20% en 2 semanas, escalar a bug de infra.
5. **Candidato a `test.fixme()`** si el retry no es suficiente: marcar con condición de ENV hasta resolver.

---

## Referencias

- Spec: `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` — SMOKE-GW-TC05 (línea ~302)
- Matriz: `docs/gateway-pg/stripe/matriz_cases.md` — TS-STRIPE-TC1033
- Estructura de referencia: `docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md`
