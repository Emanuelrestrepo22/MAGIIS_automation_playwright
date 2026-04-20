# tests/recordings — Playwright Codegen archive

Directorio de **recordings** — capturas de `npx playwright codegen` con valor de referencia pero NO ejecutables como tests.

---

## ¿Qué es esto?

Cuando usás `npx playwright codegen https://apps-test.magiis.com/...` para explorar un flujo nuevo o capturar selectores reales, el output queda en `tests/test-N.spec.ts`. Estos archivos son **snapshots de sesiones de exploración** — útiles como referencia pero:

- No tienen asserts significativos
- Tienen selectores frágiles (CSS por posición, duplicados)
- Capturan sesiones con reintentos, errores del user, acciones de debug
- No respetan convenciones de Page Object Model

## ¿Por qué están acá y no en `tests/`?

**Evitar que Playwright los descubra como tests ejecutables.**

`playwright.config.ts` usa el default `testMatch: **/*.{spec,test}.ts`. Esta carpeta usa `.recorded.ts` → **no se incluyen en el test suite**.

## ¿Cuándo consultar un recording?

Casos de uso válidos:

1. **Debugging de selectores obsoletos** — el sitio cambió y un test productivo se rompe. Los recordings muestran cómo lucía el DOM cuando fueron capturados.
2. **Reconstrucción de flows antiguos** — si un spec productivo se borró por error, el recording puede ayudar a reconstruir.
3. **Onboarding rápido** — un dev nuevo ve la secuencia real de acciones de un flow de negocio.

## ¿Cuándo NO usar un recording?

- NO usar como test productivo
- NO copiar los selectores tal cual a un POM — revisar y mejorar
- NO mantener recordings vivos más de ~90 días sin consultarse

## Convenciones

### Nombre de archivo

```
<YYYY-MM-DD>-<scope-feature>.recorded.ts
```

Ejemplos:
- `2026-04-14-create-trip-cargo-abordo.recorded.ts`
- `2026-04-14-preautorizada-3ds-with-prefs.recorded.ts`

### Header obligatorio

Cada recording debe tener al inicio:

```typescript
/**
 * RECORDING — no ejecutable (filename *.recorded.ts no matchea Playwright testMatch).
 *
 * Fecha captura: YYYY-MM-DD
 * Flow capturado: <breve descripción del flow de negocio>
 * Capturado con: npx playwright codegen <url>
 *
 * Spec productivo equivalente (si existe):
 *   tests/features/.../<spec>.spec.ts
 *
 * Por qué se conserva: <razón específica — selectores útiles / flow complejo / etc.>
 *
 * Status: REFERENCIA — revisar antes de reusar selectores, muchos son frágiles.
 */
```

## Mantenimiento

- **Revisión trimestral:** si un recording no se consultó en 90 días → candidato a eliminación.
- **Política anti-bloat:** máximo **10-12 recordings vivos**. Si crece más, consolidar o archivar.
- **Archivado:** recordings eliminados quedan en git history — recuperables con `git log --all -- tests/recordings/<file>`.

## Tracking

Ver `docs/ops/BACKLOG.md` → BL-020 para el plan de migración a specs productivos.

---

## Listado actual

| Archivo | Flow | Spec productivo equivalente |
|---|---|---|
| `2026-04-13-preautorizada-3ds-stripe-form.recorded.ts` | Habilitar Cobros + viaje Stripe con 3DS | `gateway-pg/specs/stripe/web/carrier/hold/*.spec.ts` |
| `2026-04-14-create-trip-cargo-abordo.recorded.ts` | Alta viaje completa + Cargo a Bordo | `gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` |
| `2026-04-14-create-trip-cargo-abordo-minimal.recorded.ts` | Flow mínimo Cargo a Bordo | idem |
| `2026-04-14-multirole-carrier-contractor-preauth.recorded.ts` | Logout carrier + login contractor + preautorizada 3DS | `gateway-pg/specs/stripe/web/contractor/*.spec.ts` |
| `2026-04-14-preautorizada-3ds-compact.recorded.ts` | Preautorizada + 3DS compacto | `gateway-pg/specs/stripe/web/carrier/hold/*.spec.ts` |
| `2026-04-14-preautorizada-3ds-retries.recorded.ts` | Preautorizada 3DS con reintentos (formulario rellenado varias veces) | idem |
| `2026-04-14-preautorizada-3ds-with-prefs.recorded.ts` | Toggle Cobros en preferencias + preautorizada 3DS | idem |

**Total:** 7 recordings activos.
