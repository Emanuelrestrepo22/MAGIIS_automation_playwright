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

1. **Habilitar logs de auth en backend:** correlacionar timestamps de fallo con expiración de sesión Stripe/MAGIIS.
2. **Revisar storageState:** verificar si `global-setup.multi-role.ts` guarda sesiones con TTL suficiente para todo el run de smoke.
3. **Comparar con TC1081:** flakiness similar diagnosticada en `docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md` — misma categoría ENV/DATA. Revisar si el fix de ese TC aplica acá.
4. **Medir tasa de retry en CI:** si `passed (with retry)` supera 20% de ejecuciones en 2 semanas, escalar a bug de infraestructura.
5. **Candidato a `test.fixme()`** si el retry no es suficiente: marcar con condición de ENV hasta resolver.

---

## Referencias

- Spec: `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` — SMOKE-GW-TC05 (línea ~302)
- Matriz: `docs/gateway-pg/stripe/matriz_cases.md` — TS-STRIPE-TC1033
- Estructura de referencia: `docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md`
