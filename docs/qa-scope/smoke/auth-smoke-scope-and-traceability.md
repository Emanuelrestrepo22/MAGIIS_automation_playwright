# Auth — Smoke Scope y Trazabilidad

**Suite:** `tests/features/smoke/specs/portals.smoke.spec.ts`
**Script CI:** `pnpm run test:test:smoke`
**Estado:** ✅ Implementado y corriendo en CI (GitLab + GitHub)

---

## Criterios de cobertura

- Login exitoso con credenciales válidas → portal carrier disponible
- Login fallido con credenciales inválidas → mensaje de error visible

---

## Matriz de trazabilidad

| SMOKE ID | TC Fuente | Descripción | Tipo | Steps | Estado CI |
|---|---|---|---|---|---|
| SMOKE-AUTH-TC01 | *(smoke propio, no requiere TC matriz)* | Login exitoso con credenciales válidas — dashboard cargado | Positivo | 3 | ✅ Pasa |
| SMOKE-AUTH-TC02 | *(smoke propio, no requiere TC matriz)* | Login fallido con credenciales inválidas — error visible | Negativo | 3 | ✅ Pasa |

> Los tests de auth feature (TS-AUTH-TC01 / TS-AUTH-TC02) son independientes: cubren token de sesión y texto exacto del error. No están en la suite smoke por diseño — smoke valida disponibilidad básica, no contratos de UI detallados.

---

## Archivos relacionados

| Propósito | Archivo |
|---|---|
| Spec smoke (en CI) | `tests/features/smoke/specs/portals.smoke.spec.ts` |
| Spec auth completo | `tests/features/auth/specs/login-success.e2e.spec.ts` |
| Spec auth negativo completo | `tests/features/auth/specs/login-failure.e2e.spec.ts` |
| Page Object login | `tests/pages/shared/LoginPage.ts` |
| Page Object dashboard | `tests/pages/carrier/DashboardPage.ts` |
