# Auth — Casos de prueba: Login

**Feature:** Auth / Login  
**Portal:** Carrier  
**Ambiente:** TEST  
**Scope:** Autenticación del portal web carrier. IDs propios del grupo auth (`TS-AUTH-TCxx`) — independientes de la matriz Stripe/Gateway PG.

---

## Convención de IDs

| Prefijo | Grupo | Rango |
| ------- | ----- | ----- |
| `TS-AUTH-TCxx` | Login / Sesión | TC01 → TC99 |

Estos IDs no pertenecen al sistema `TS-STRIPE-TCxxxx`. Son exclusivos de la feature de autenticación.

---

## Tabla de casos

| ID | Descripción | Tipo | Prioridad | Spec |
| -- | ----------- | ---- | --------- | ---- |
| TS-AUTH-TC01 | Login exitoso portal carrier con credenciales válidas — redirección al dashboard y token de sesión persistente | Positivo | P1 | `tests/features/auth/specs/login-success.e2e.spec.ts` |
| TS-AUTH-TC02 | Login fallido portal carrier con credenciales inválidas — mensaje de error "El usuario y/o contraseña son incorrectos", URL permanece en pantalla de login | Negativo | P1 | `tests/features/auth/specs/login-failure.e2e.spec.ts` |

---

## Detalle por caso

### TS-AUTH-TC01 — Login exitoso portal carrier

**Precondiciones:**
- Sesión limpia (sin storageState previo)
- Credenciales válidas disponibles en variables de entorno (`CARRIER_USER`, `CARRIER_PASS` o equivalente)

**Pasos:**
1. Navegar a `/authentication/login/carrier`
2. Ingresar email y contraseña válidos
3. Click en "Ingresar"

**Resultado esperado:**
- Debería redirigir al dashboard del portal carrier
- Debería existir un token de sesión (localStorage o cookie) con valor no vacío

**Tags:** `@smoke @auth @login`

---

### TS-AUTH-TC02 — Login fallido con credenciales inválidas

**Precondiciones:**
- Sesión limpia (sin storageState previo)
- Credenciales inválidas generadas dinámicamente (email y password aleatorios)

**Pasos:**
1. Navegar a `/authentication/login/carrier`
2. Ingresar email y contraseña inválidos
3. Click en "Ingresar"

**Resultado esperado:**
- Debería permanecer en la pantalla de login (URL no cambia)
- Debería mostrar mensaje de error: *"El usuario y/o contraseña son incorrectos"*

**Tags:** `@regression @auth @login @negative`

---

## Gaps y pendientes

| Gap | Descripción |
| --- | ----------- |
| TC03 | Login con email válido y contraseña vacía — validación HTML5 vs backend |
| TC04 | Login con usuario bloqueado / inactivo |
| TC05 | Cierre de sesión (logout) — token eliminado, redirección a login |
| TC06 | Expiración de sesión — redirección automática al vencer el token |
| TC07 | Login desde storageState expirado — comportamiento del bootstrap |
