<!--! MAGIIS AUTOMATION FRAMEWORK -->
# 🧪 MAGIIS Automation - Playwright (TypeScript) 👨🏻‍💻 QA Framework

[![CI Pipeline - E2E Tests](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/ci-e2e.yml/badge.svg)](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright/actions/workflows/ci-e2e.yml)

<!-- TOOLING -->
[![typescript-logo]][typescript-site]
[![playwright-logo]][playwright-docu]
[![github-actions]][github-actions-docu]
[![eslint]][eslint-site]
[![node-logo]][node-site]
[![yarn]][yarn-docu]

Este repositorio contiene el proyecto de automatización de pruebas E2E para la plataforma **MAGIIS**, implementado con **Playwright + TypeScript**. El objetivo es automatizar los **flujos críticos del sistema**, comenzando con el proceso de **Login**, siguiendo buenas prácticas de automatización, estructura POM (Page Object Model), logs de validación y CI/CD.

> 💡 Este framework está diseñado para escalar con el crecimiento funcional de la plataforma MAGIIS.

---

## 📁 Estructura del Repositorio

```bash
├── .github/workflows/         # Pipelines de GitHub Actions
├── coverage/                  # Documentación de cobertura de pruebas
├── tests/
│   ├── pages/                 # Page Objects (estructura POM)
│   ├── specs/                 # Archivos de prueba e2e
│   ├── selectors/             # Selectores centralizados por módulo
│   └── utils/                 # Utilidades: data generator, helpers, etc.
├── TestBase.ts                # Setup de fixtures personalizados
├── global-setup.ts           # Setup previo a test run
├── playwright.config.ts      # Configuración principal de Playwright
├── tsconfig.json             # Configuración TypeScript
├── tsconfig.eslint.json      # Configuración ESLint para TS
├── .env                      # Variables de entorno locales
└── README.md                 # Documentación general del proyecto
```

---

## 🚀 ¿Cómo empezar?

### 1. Clonar el repositorio

```bash
git clone https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright.git
cd MAGIIS_automation_playwright
```

### 2. Instalar dependencias

```bash
npm install
```

> También puedes usar `yarn` si tienes `yarn.lock`.

### 3. Instalar navegadores de Playwright

```bash
npx playwright install
```

### 4. Crear archivo `.env`

```env
# .env
BASE_URL=xxxxxxxxxx
USER_CARRIER_ADMIN=xxxxxxxxx
PASS_CARRIER_ADMIN=xxxxxxxxx
```

> Nunca publiques este archivo en el repositorio (está en `.gitignore`).

---

## 📦 Scripts disponibles

| Comando                    | Descripción                            |
|---------------------------|----------------------------------------|
| `npx playwright test`     | Ejecuta todos los tests e2e            |
| `npx playwright test tests/specs/auth/login-success.e2e.test.ts` | Ejecuta un test específico |
| `npx playwright show-report` | Abre el último reporte HTML           |
| `npm run lint`            | Ejecuta ESLint sobre el código fuente  |

---

## 📁 Carpeta `coverage/` – ¿Qué contiene?

La carpeta `coverage/` contiene la **documentación funcional de cobertura de pruebas automatizadas** en archivos `.md`, con el detalle de:

- Casos cubiertos y pendientes
- ID de test, descripciones y escenarios
- Notas técnicas por flujo funcional
- Trazabilidad con funcionalidades clave

### Ejemplo de archivos:

```bash
coverage/
├── login.md                 # Login: validación de credenciales
├── logout.md                # Logout seguro
├── navbar.md                # Validación del menú lateral
├── errors.md                # Mensajes y errores visibles
├── session-handling.md      # Expiración y control de sesiones
├── README.md                # Índice de cobertura
```

Esta documentación permite tener trazabilidad clara entre el sistema y lo que se valida automáticamente en cada ejecución.

---

## 🛠️ Estándares técnicos

- ✅ Page Object Model (POM)
- ✅ Arquitectura modular y tipada
- ✅ Fixtures personalizados
- ✅ Uso de Faker para generar data dinámica
- ✅ Validaciones con `expect`
- ✅ Logs de ejecución visibles en consola
- ✅ Integración continua (CI) con GitHub Actions
- ✅ Configuración ESLint + TSConfig

---

## 📚 Referencias útiles

- [Playwright Docs](https://playwright.dev/docs/intro)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Dotenv](https://www.npmjs.com/package/dotenv)
- [ESLint](https://eslint.org/)
- [GitHub Actions](https://docs.github.com/en/actions)

---

## 🤝 Contribuciones

Sigue el flujo de ramas y convenciones de commits para mantener el código limpio:

```bash
git checkout -b feature/GX3-123/validar-login
git commit -m "test: (GX3-123) agregar validación de login negativo"
```

Usa el template de Pull Request para documentar cambios y resultados.

---

## 📬 Contacto

Proyecto mantenido por el equipo de **QA Automation en MAGIIS**  
Repositorio: [MAGIIS Automation Playwright](https://github.com/Emanuelrestrepo22/MAGIIS_automation_playwright)

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
[yarn]: https://img.shields.io/badge/yarn-%232C8EBB.svg?style=for-the-badge&logo=yarn&logoColor=white
[yarn-docu]: https://yarnpkg.com/cli
# MAGIIS - Cobertura de pruebas E2E

Este directorio contiene el detalle de la cobertura de pruebas automatizadas usando Playwright y TypeScript.

## Índice de funcionalidades cubiertas

| Funcionalidad         | Archivo                | Estado     |
|----------------------|------------------------|------------|
| Login                | [login.md](login.md)   | ✅ Completo |
| Logout               | [logout.md](logout.md) | ⏳ En progreso |
| Navbar / Menú        | [navbar.md](navbar.md) | ⏳ En progreso |
| Manejo de sesión     | [session-handling.md](session-handling.md) | ❌ Pendiente |
| Control de acceso    | [access-control.md](access-control.md) | ❌ Pendiente |
| Validaciones de error| [errors.md](errors.md) | ✅ Parcial  |

Actualizado por QA Automation Team – `{{fecha}}`
