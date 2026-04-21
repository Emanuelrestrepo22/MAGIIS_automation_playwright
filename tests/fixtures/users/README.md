# `tests/fixtures/users/` — Source of Truth de usuarios

Fixtures centralizados de usuarios/credenciales para toda la suite MAGIIS Playwright.

**Estado:** BL-009 Fase 2 (SoT skeleton) — los fixtures existen pero NO están
adoptados todavía por `runtime.ts`, `gatewayPortalRuntime.ts` ni los scripts
mobile. La adopción se hace en Fase 3.

---

## Estructura

```
tests/fixtures/users/
├── types.ts                          # WebUser, MobileUser, PortalRole, MobileRole, UserEnvironment
├── internal/
│   └── env-resolver.ts               # helper privado — lazyEnv, requireEnv
├── web-portals/
│   ├── dispatcher.ts                 # DISPATCHER (carrier)
│   ├── contractor-collaborator.ts    # CONTRACTOR_COLLABORATOR (contractor)
│   └── index.ts                      # barrel
├── mobile/
│   ├── driver.ts                     # DRIVER (Android app)
│   ├── passenger.ts                  # PASSENGER_APP_USER (Android app)
│   └── index.ts                      # barrel
├── passengers.ts                     # PASSENGERS — dominio sin creds (re-export legacy)
├── index.ts                          # barrel raíz — importar desde aquí
└── README.md
```

---

## Cuándo usar cada fixture

| Necesito… | Fixture | Ejemplo |
|---|---|---|
| Login al portal Carrier | `DISPATCHER[env]` | Crear viaje, vincular tarjeta, preautorizar |
| Login al portal Contractor | `CONTRACTOR_COLLABORATOR[env]` | Alta de viaje con colaborador |
| Login a la app Driver (Android) | `DRIVER[env]` | Aceptar viaje, simular ruta GPS |
| Login a la app Passenger (Android) | `PASSENGER_APP_USER[env]` | Wallet, alta de viaje desde la app |
| Passenger de dominio (dropdown carrier) | `PASSENGERS.colaborador` | Seleccionar pasajero al crear viaje |

**Regla clave:** un fixture con credenciales es para hacer **login**. Un
fixture de `PASSENGERS` es para describir **qué cliente/colaborador** aparece
en el dropdown del formulario de viaje. No mezclar.

---

## Ejemplo de uso

```typescript
import { DISPATCHER, PASSENGER_APP_USER, PASSENGERS } from 'tests/fixtures/users';

// Login dispatcher carrier (ambiente activo definido por ENV)
const { email, password } = DISPATCHER.test;
await loginPage.login(email, password);

// Login passenger app mobile
const passengerUser = PASSENGER_APP_USER.test;
await appiumLogin(passengerUser.email, passengerUser.password);

// Seleccionar pasajero en dropdown carrier (sin credenciales)
await newTravelPage.selectPassenger(PASSENGERS.colaborador.searchName);
```

---

## Resolución por ambiente

Los fixtures están indexados por ambiente: `test`, `uat`, `prod`. Cada getter
`email` / `password` se evalúa **lazy** contra `process.env.*` — así rotar
credenciales requiere solo cambiar el env file, nunca código.

**Orden de lookup** (primera variable presente gana):

1. Variable scoped por ambiente (ej: `USER_CARRIER_PROD`)
2. Variable genérica / fallback (ej: `USER_CARRIER`)

El fallback genérico existe por compatibilidad con `.env.test`, `.env.uat`
y `.env.prod` actuales. Cuando BL-009 Fase 1 separe los archivos por
ambiente y rote las creds PROD, podremos eliminar el fallback.

---

## Tabla de env vars consumidas

| Fixture | Ambiente | Variables (en orden de preferencia) |
|---|---|---|
| `DISPATCHER.test` | test | `USER_CARRIER_TEST` → `USER_CARRIER` · `PASS_CARRIER_TEST` → `PASS_CARRIER` |
| `DISPATCHER.uat` | uat | `USER_CARRIER_UAT` → `USER_CARRIER` · `PASS_CARRIER_UAT` → `PASS_CARRIER` |
| `DISPATCHER.prod` | prod | `USER_CARRIER_PROD` → `USER_CARRIER` · `PASS_CARRIER_PROD` → `PASS_CARRIER` |
| `CONTRACTOR_COLLABORATOR.test` | test | `USER_CONTRACTOR_TEST` → `USER_CONTRACTOR` · `PASS_CONTRACTOR_TEST` → `PASS_CONTRACTOR` |
| `CONTRACTOR_COLLABORATOR.uat` | uat | `USER_CONTRACTOR_UAT` → `USER_CONTRACTOR` · `PASS_CONTRACTOR_UAT` → `PASS_CONTRACTOR` |
| `CONTRACTOR_COLLABORATOR.prod` | prod | `USER_CONTRACTOR_PROD` → `USER_CONTRACTOR` · `PASS_CONTRACTOR_PROD` → `PASS_CONTRACTOR` |
| `DRIVER.test` | test | `DRIVER_EMAIL_TEST` → `DRIVER_EMAIL` · `DRIVER_PASSWORD_TEST` → `DRIVER_PASSWORD` |
| `DRIVER.uat` | uat | `DRIVER_EMAIL_UAT` → `DRIVER_EMAIL` · `DRIVER_PASSWORD_UAT` → `DRIVER_PASSWORD` |
| `DRIVER.prod` | prod | `DRIVER_EMAIL_PROD` → `DRIVER_EMAIL` · `DRIVER_PASSWORD_PROD` → `DRIVER_PASSWORD` |
| `PASSENGER_APP_USER.test` | test | `PASSENGER_EMAIL_TEST` → `PASSENGER_EMAIL` · `PASSENGER_PASSWORD_TEST` → `PASSENGER_PASSWORD` |
| `PASSENGER_APP_USER.uat` | uat | `PASSENGER_EMAIL_UAT` → `PASSENGER_EMAIL` · `PASSENGER_PASSWORD_UAT` → `PASSENGER_PASSWORD` |
| `PASSENGER_APP_USER.prod` | prod | `PASSENGER_EMAIL_PROD` → `PASSENGER_EMAIL` · `PASSENGER_PASSWORD_PROD` → `PASSENGER_PASSWORD` |

El error de missing-env se dispara solo cuando se lee `fixture.email` o
`fixture.password` — importar el barrel no evalúa nada.

---

## Reglas de uso

1. **Nunca hardcodear credenciales en specs.** Si falta un rol, agregar un
   fixture nuevo en esta carpeta; no inventar env vars sueltas en el spec.
2. **Nunca hacer `process.env.USER_CARRIER` en código de producto.** Consumir
   `DISPATCHER[env]` desde el barrel.
3. **No mezclar web y mobile.** Un fixture web expone `WebUser`, un mobile
   expone `MobileUser`. Los tipos son distintos a propósito.
4. **Respetar el sufijo de ambiente.** Si en el futuro PROD requiere un user
   distinto, se agrega `USER_CARRIER_PROD` al `.env.prod` y los tests que
   pidan `DISPATCHER.prod` lo usan automáticamente — sin tocar código.

---

## Cuándo agregar un rol nuevo

1. ¿Es web o mobile? → elegir carpeta.
2. ¿Tiene credenciales propias o reusa otro rol? → si reusa, re-exportar.
3. Crear archivo siguiendo el patrón `dispatcher.ts` / `driver.ts`:
   - exportar una constante `ROLE_NAME` con forma `EnvironmentMap<WebUser | MobileUser>`.
   - usar `lazyEnv` para cada campo sensible.
   - documentar env vars consumidas en el header del archivo.
4. Agregarlo al `index.ts` local y al barrel raíz.
5. Actualizar este README (tabla de env vars + "Cuándo usar cada fixture").

---

## Referencias cruzadas

- **BACKLOG BL-009 Fase 1** — rotación de credenciales PROD + separación
  `.env.prod` → `.env.prod.local` gitignored. Acción humana pendiente, NO
  parte de este ticket.
- **BACKLOG BL-009 Fase 3** — adopción: migrar `tests/config/runtime.ts`
  (`resolveRoleCredentials`) y `tests/config/gatewayPortalRuntime.ts`
  (`getPortalCredentials`) + scripts `tests/mobile/appium/scripts/*` para
  que consuman estos fixtures en vez de `process.env.*` directo.
- **BACKLOG BL-009 Fase 4** — legacy cleanup: deprecar
  `tests/features/gateway-pg/data/passengers.ts` y unificar bajo
  `tests/fixtures/users/passengers.ts`.
- **Arquitectura general:** `docs/ARCHITECTURE.md` §4 "Dónde agregar data nueva".
- **Convención de test data:** `CLAUDE.md` §"Stripe — tarjetas de prueba".
