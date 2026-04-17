<!--! MAGIIS AUTOMATION FRAMEWORK -->
# MAGIIS Automation — Playwright + TypeScript

[![E2E Tests — TEST](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/playwright.yml/badge.svg)](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/playwright.yml)
[![Smoke Tests — PROD](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/playwright-prod-smoke.yml/badge.svg)](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/playwright-prod-smoke.yml)

<!-- TOOLING -->
[![typescript-logo]][typescript-site]
[![playwright-logo]][playwright-docu]
[![github-actions]][github-actions-docu]
[![eslint]][eslint-site]
[![node-logo]][node-site]
[![appium-logo]][appium-site]

Framework de automatización web y móvil E2E para la plataforma **MAGIIS**, construido con **Playwright + Appium + TypeScript**. Cubre flujos críticos con arquitectura POM centralizada, pruebas en dispositivos móviles, gestión multi-entorno, autenticación vía API y pipelines CI/CD por entorno (TEST / UAT / PROD).

---

## Tabla de contenidos

1. [Arquitectura multi-entorno](#arquitectura-multi-entorno)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Configuración inicial](#configuración-inicial)
4. [Variables de entorno](#variables-de-entorno)
5. [Scripts disponibles](#scripts-disponibles)
6. [CI/CD — GitHub Actions](#cicd--github-actions)
7. [Secrets y Variables en GitHub](#secrets-y-variables-en-github)
8. [Estrategia de pruebas](#estrategia-de-pruebas)
9. [Cobertura actual](#cobertura-actual)
10. [Estándares técnicos](#estándares-técnicos)
11. [Contribuciones](#contribuciones)

---

## Arquitectura multi-entorno

El framework soporta tres entornos con configuración aislada:

| Entorno | Propósito                     | Archivo env  | CI/CD Workflow                |
|---------|-------------------------------|--------------|-------------------------------|
| `test`  | Desarrollo diario y regresión | `.env.test`  | `playwright.yml`              |
| `uat`   | Validación pre-release (UAT)  | `.env.uat`   | _(manual / pendiente CI)_     |
| `prod`  | Smoke tests en producción     | `.env.prod`  | `playwright-prod-smoke.yml`   |

La variable `ENV` controla qué archivo `.env.<env>` carga `playwright.config.ts` via `dotenv`. El `storageState` y los artefactos de evidencia se segregan por entorno:

```text
evidence/
├── test/
│   ├── artifacts/   # screenshots / videos
│   └── report/      # HTML report
├── uat/
└── prod/

storage/
├── state-carrier-test.json    # sesión guardada (gitignored)
├── state-carrier-uat.json
└── state-carrier-prod.json
```

---

## Estructura del repositorio

```text
magiiss-playwright/
├── .github/
│   └── workflows/
│       ├── playwright.yml             # CI — TEST Web
│       └── playwright-prod-smoke.yml  # CI — PROD smoke Web
├── tests/
│   ├── pages/                         # Page Objects (POM centralizados)
│   │   ├── shared/                    # Interfaces comunes (Carrier y Contractor compartidos)
│   │   ├── carrier/                   # Pages específicos del portal Carrier
│   │   └── contractor/                # Pages específicos de Contractor (futuro)
│   ├── features/                      # Funcionalidades y módulos divididos por dominio (Specs Web)
│   │   ├── auth/
│   │   │   ├── specs/                 # Casos de prueba E2E (auth)
│   │   │   └── fixtures/              # Datos y configuración local del módulo
│   │   └── gateway-pg/
│   │       └── specs/                 # Casos de prueba E2E (pagos)
│   ├── mobile/                        # Automatización Móvil Appium
│   │   └── appium/
│   │       ├── driver/                # Pruebas para MAGIIS Driver App
│   │       └── passenger/             # Pruebas para MAGIIS Passenger App
│   ├── utils/                         # Clientes HTTP y generación de datos
│   └── TestBase.ts                    # Fixtures personalizados (extend test)
├── storage/                           # storageState por entorno (gitignored)
├── evidence/                          # Artefactos de ejecución (gitignored)
├── .env.*                             # Variables de entorno
├── global-setup.multi-role.ts         # Login por rol (carrier/contractor/…) + storageState
├── global-setup.ts                    # ⚠️  DEPRECATED — single-role carrier legacy
├── playwright.config.ts               # Configuración Web Playwright
├── tsconfig.json
└── package.json
```

---

## Configuración inicial

### 1. Clonar el repositorio

```bash
git clone https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright.git
cd MAGIIS_automation_playwright
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar navegadores Playwright

```bash
npm run pw:install
# equivalente: npx playwright install --with-deps chromium
```

### 4. Crear archivos de entorno

Copia la plantilla para el entorno que necesites (nunca subas estos archivos al repo):

```bash
# .env.test
ENV=test
BASE_URL=https://test.magiis.com
AUTH_API_URL=https://test.magiis.com/magiis-v0.2/auth/login
LOGIN_PATH="/carrier/#/auth/login"
DASHBOARD_URL_PATTERN="**/dashboard"
USER_CARRIER=tu-usuario@test.com
PASS_CARRIER=tu-password
HEADLESS=true
```

```bash
# .env.prod
ENV=prod
BASE_URL=https://apps.magiis.com
AUTH_API_URL=https://apps.magiis.com/magiis-v0.2/auth/login
LOGIN_PATH="/#/authentication/login/carrier"
DASHBOARD_URL_PATTERN="**dashboard**"
USER_CARRIER=tu-usuario@prod.com
PASS_CARRIER=tu-password
HEADLESS=true
```

> Todos los archivos `.env.*` están en `.gitignore`. Nunca los publiques.

---

## Setup local

### Requisitos previos

- **Node.js**: v20 (recomendado)
- **Android Studio**
- **Java JDK**
- **Appium Server**

### Pasos para configurar el entorno

1. Clonar el repositorio
2. Copiar `.env.example` a `.env` y completar los valores según la máquina local
3. Descripción de cada variable de entorno:
   - `ANDROID_HOME`: Ruta a la instalación del SDK de Android (ej: `C:/Users/{usuario}/AppData/Local/Android/Sdk` en Windows o `/Users/{usuario}/Library/Android/sdk` en macOS)
   - `ANDROID_SDK_ROOT`: Misma ruta que `ANDROID_HOME` (recomendado)
   - `JAVA_HOME`: Ruta a tu instalación del Java JDK (ej: `C:\Program Files\Java\jdk-xx`)
   - `APPIUM_SERVER_URL`: URL donde escucha el servidor Appium (usualmente `http://localhost:4723`)
   - `ANDROID_UDID`: Identificador del dispositivo Android conectado o emulador
   - `ENV`: Entorno activo para la ejecución (ej: `test`)
   - `DRIVER_EMAIL`: Correo electrónico del conductor para simulaciones móviles
   - `DRIVER_PASSWORD`: Contraseña del conductor

### Cómo levantar Appium Server

Antes de correr las pruebas móviles, debes iniciar el servidor Appium en tu entorno local:

```bash
npx appium
# O si tienes instalado appium de manera global: appium
```

Para el orden exacto de terminales en Windows para Passenger y Driver mobile flows, usa [tests/mobile/appium/README.md](./tests/mobile/appium/README.md). Esa guia es el onboarding canonico de Appium en este repo.

### Ejecutar las pruebas

Utiliza los siguientes scripts definidos en `package.json` para ejecutar los tests:

```bash
# Ejecutar todos los tests E2E en TEST
npm run test:test

# Ejecutar tests humo en TEST
npm run test:test:smoke

# Ejecutar un flujo E2E móvil (App Driver)
npm run test:test:e2e:flow1:mobile

# Abrir el modo UI de Playwright
npm run test:test:ui
```

---

## Variables de entorno

| Variable                | Descripción                                       | Requerida |
|-------------------------|---------------------------------------------------|-----------|
| `ENV`                   | Entorno activo: `test`, `uat`, `prod`             | Sí        |
| `BASE_URL`              | URL base de la aplicación                         | Sí        |
| `AUTH_API_URL`          | Endpoint de login (para global-setup vía API)     | Sí        |
| `LOGIN_PATH`            | Ruta relativa de la página de login               | Sí        |
| `DASHBOARD_URL_PATTERN` | Patrón de URL para verificar dashboard post-login | Sí        |
| `USER_CARRIER`          | Usuario de prueba (rol carrier)                   | Sí        |
| `PASS_CARRIER`          | Contraseña de prueba                              | Sí        |
| `HEADLESS`              | `true` = sin UI / `false` = con navegador visible | No        |

---

## Scripts disponibles

### TEST (desarrollo diario)

| Comando                      | Descripción                                    |
|------------------------------|------------------------------------------------|
| `npm run test:test`          | Todos los tests en TEST (headless)             |
| `npm run test:test:headed`   | Todos los tests en TEST con navegador visible  |
| `npm run test:test:smoke`    | Solo smoke tests en TEST                       |
| `npm run test:test:auth`     | Tests de auth + API en TEST                    |
| `npm run test:test:debug`    | Modo debug interactivo (Playwright Inspector)  |
| `npm run test:test:ui`       | Playwright UI Mode                             |

### UAT

| Comando                      | Descripción                          |
|------------------------------|--------------------------------------|
| `npm run test:uat:smoke`     | Smoke tests en UAT                   |
| `npm run test:uat:regression`| Regresión completa en UAT            |
| `npm run test:uat:headed`    | Regresión en UAT con navegador       |

### PROD

| Comando                            | Descripción                        |
|------------------------------------|------------------------------------|
| `npm run test:prod:smoke`          | Smoke tests en PROD (headless)     |
| `npm run test:prod:smoke:headed`   | Smoke tests en PROD con navegador  |
| `npm run test:prod:regression`     | Regresión completa en PROD         |

### Utilidades

| Comando                   | Descripción                                    |
|---------------------------|------------------------------------------------|
| `npm run test:plan`       | Lista todos los tests sin ejecutarlos          |
| `npm run test:trace`      | Abre el Playwright Trace Viewer                |
| `npm run lint`            | ESLint sobre código fuente TypeScript          |
| `npm run lint:fix`        | Auto-fix de errores ESLint                     |
| `npm run prettier:fix`    | Auto-format con Prettier                       |
| `npm run check:ts`        | Verificación de tipos TypeScript               |
| `npm run clean:all`       | Limpia evidencias, reportes y resultados       |

---

## CI/CD — GitHub Actions

### Workflow 1: `playwright.yml` — E2E Tests (TEST)

**Triggers:**

- Push a `main` o `develop`
- Pull Request hacia `main`
- Ejecución manual (`workflow_dispatch`)

**Qué hace:**

1. Checkout del código
2. Node.js 20 + caché de npm
3. `npm ci` + instala Chromium
4. Construye `.env.test` desde GitHub Secrets/Variables del entorno `test`
5. Ejecuta `npm run test:test`
6. Sube artefactos de evidencia en fallos (14 días)
7. Sube reporte HTML siempre (7 días)

---

### Workflow 2: `playwright-prod-smoke.yml` — Smoke Tests (PROD)

**Triggers:**

- Push a `main` (smoke automático post-merge)
- Ejecución manual (`workflow_dispatch`) con opción `headed`

**Qué hace:**

1. Checkout del código
2. Node.js 20 + caché de npm
3. `npm ci` + instala Chromium
4. Construye `.env.prod` desde GitHub Secrets/Variables del entorno `prod`
5. Ejecuta `npm run test:prod:smoke`
6. Sube evidencia en fallos (30 días)
7. Sube reporte HTML siempre (30 días)

---

## Secrets y Variables en GitHub

Los pipelines construyen el archivo `.env.<env>` en runtime usando secretos y variables configurados **por entorno** en GitHub. **Nunca se hardcodean credenciales en el código.**

> Los secrets y variables son **environment-scoped**: cada entorno (`prod`, `test`, `uat`) tiene su propio conjunto. En el workflow se acceden como `${{ secrets.NOMBRE }}` y `${{ vars.NOMBRE }}` — sin prefijo de entorno, porque GitHub ya los resuelve según el entorno activo del job.

### Entorno `prod` — configuración requerida

#### Secrets (cifrados, solo legibles en Actions)

| Nombre en GitHub  | Variable en `.env.prod` | Descripción              |
|-------------------|-------------------------|--------------------------|
| `USER_CARRIER`    | `USER_CARRIER`          | Usuario de prueba PROD   |
| `PASS_CARRIER`    | `PASS_CARRIER`          | Contraseña de prueba PROD|

#### Variables (visibles, no sensibles)

| Nombre en GitHub | Variable en `.env.prod` | Valor                                            |
|------------------|-------------------------|--------------------------------------------------|
| `BASE_URL`       | `BASE_URL`              | `https://apps.magiis.com`                        |
| `AUTH_API_URL`   | `AUTH_API_URL`          | `https://apps.magiis.com/magiis-v0.2/auth/login` |

### Entorno `test` — configuración requerida

#### Secrets

| Nombre en GitHub  | Variable en `.env.test` | Descripción              |
|-------------------|-------------------------|--------------------------|
| `USER_CARRIER`    | `USER_CARRIER`          | Usuario de prueba TEST   |
| `PASS_CARRIER`    | `PASS_CARRIER`          | Contraseña de prueba TEST|

#### Variables

| Nombre en GitHub | Variable en `.env.test` | Descripción         |
|------------------|-------------------------|---------------------|
| `BASE_URL`       | `BASE_URL`              | URL base de TEST    |
| `AUTH_API_URL`   | `AUTH_API_URL`          | Endpoint auth TEST  |

> Para configurarlos: **GitHub repo → Settings → Environments → [nombre del entorno] → Add secret / Add variable**

---

## Estrategia de pruebas

```text
TEST  →  UAT  →  PROD
 ↑          ↑       ↑
E2E +    Regresión  Smoke
API       pre-release tests
tests
```

| Tipo de test   | Entorno     | Trigger                        | Suite                   |
|----------------|-------------|--------------------------------|-------------------------|
| E2E Auth       | TEST        | Push / PR a main o develop     | `tests/features/auth/specs/` |
| API Tests      | TEST        | Push / PR a main o develop     | `tests/specs/api/`      |
| Regresión UAT  | UAT         | Manual                         | Todas las features      |
| Smoke PROD     | PROD        | Push a main / manual           | `tests/features/smoke/` |

**Decisiones de diseño:**

- `global-setup.multi-role.ts` autentica todos los roles configurados en el `.env` (carrier, contractor, etc.) y persiste un `storageState` separado por rol en `storage/state-<role>-<env>.json`. Los tests individuales no hacen login UI salvo que declaren `storageState: { cookies: [], origins: [] }`. (`global-setup.ts` quedó como referencia legacy; no lo usa la config activa.)
- Los tests de smoke en PROD solo validan flujos críticos (login, dashboard) y no modifican datos.
- Los artefactos (screenshots, videos, reportes) se organizan por entorno y se retienen más tiempo en PROD que en TEST.

---

## Cobertura actual

| Funcionalidad          | Tipo  | Entornos        | Estado      |
|------------------------|-------|-----------------|-------------|
| Login exitoso (carrier)| E2E   | test, uat, prod | Completo    |
| Login fallido          | E2E   | test            | Completo    |
| Auth vía API           | API   | test            | Completo    |
| Dashboard post-login   | Smoke | test, prod      | Completo    |
| Navbar / menú lateral  | E2E   | test            | En progreso |
| Logout                 | E2E   | test            | Pendiente   |
| Control de sesión      | E2E   | test            | Pendiente   |

---

## Estándares técnicos

- **Page Object Model (POM)** — lógica de UI separada de los specs
- **Selectores centralizados** — en `tests/selectors/`, sin selectores inline en los tests
- **Global Setup vía API** — autenticación pre-suite, storageState reutilizado
- **Fixtures personalizados** — `TestBase.ts` extiende `test` de Playwright
- **Multi-entorno** — un único config carga el `.env.<env>` correcto
- **Evidencia aislada** — artefactos y reportes en `evidence/<env>/`
- **Credenciales seguras** — nunca en código; en CI via GitHub Secrets; localmente en `.env.*` (gitignored)
- **TypeScript estricto** — `tsc --noEmit` como verificación de tipos
- **ESLint + Prettier** — calidad y formato uniforme del código

---

## Contribuciones

### Flujo de ramas

```text
main        → producción / smoke tests automáticos
develop     → integración
feature/*   → nuevas funcionalidades
fix/*       → correcciones
```

### Convención de commits

```bash
git checkout -b feature/MAG-123/validar-login-carrier
git commit -m "test(auth): agregar validación de login negativo con credenciales inválidas"
```

Prefijos: `feat`, `fix`, `test`, `chore`, `refactor`, `docs`

### Antes de hacer PR

```bash
npm run check:ts       # sin errores de tipos
npm run lint           # sin errores ESLint
npm run test:test:smoke # smoke local pasa
```

---

## Referencias

- [Playwright Docs](https://playwright.dev/docs/intro)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [GitHub Actions — Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [ESLint](https://eslint.org/)
- [Faker.js](https://fakerjs.dev/)

---

**Proyecto mantenido por el equipo de QA Automation — MAGIIS**
[github.com/Emanuelrestrepo22/MAGIIS_automation_playwright](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright)

---

<!-- BADGES -->
[typescript-logo]: https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white
[typescript-site]: https://www.typescriptlang.org/
[playwright-logo]: https://img.shields.io/badge/playwright-black?style=for-the-badge
[playwright-docu]: https://playwright.dev/
[github-actions]: https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white
[github-actions-docu]: https://docs.github.com/en/actions
[eslint]: https://img.shields.io/badge/ESLint-4B3263?style=for-the-badge&logo=eslint&logoColor=white
[eslint-site]: https://eslint.org/
[node-logo]: https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white
[node-site]: https://nodejs.org/
[appium-logo]: https://img.shields.io/badge/Appium-41BDF5?style=for-the-badge&logo=appium&logoColor=white
[appium-site]: https://appium.io/
