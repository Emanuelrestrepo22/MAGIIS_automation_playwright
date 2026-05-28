# Scripts mobile / Appium — qa-gateway-magiis

> Referencia centralizada de scripts npm relacionados con automatización Appium
> Android (driver y passenger apps). Estos scripts ejecutan harnesses ad-hoc
> útiles para investigación de selectores, smokes manuales, generación de
> dumps y flows recurrentes durante el desarrollo de Screens.
>
> **No son specs Playwright** — corren con `ts-node --esm` directamente.
> Para tests E2E híbridos formales ver `tests/e2e/gateway/flow*/`.

---

## Pre-requisitos comunes

| Tool | Versión | Cómo verificar |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| pnpm | ≥ 10 | `pnpm --version` |
| Appium server | ≥ 2.x corriendo en `APPIUM_SERVER_URL` (default `http://localhost:4723`) | `curl $APPIUM_SERVER_URL/status` |
| Driver UiAutomator2 | instalado | `appium driver list --installed` |
| Emulador Android o dispositivo físico conectado | con APK instalado | `adb devices` |
| Variables Android (.env.test) | `APPIUM_SERVER_URL`, `ANDROID_*`, `DRIVER_EMAIL`/`PASSWORD`, `PASSENGER_EMAIL`/`PASSWORD` | `cat .env.test` |

Defaults del emulador: `Pixel_7`, Android `15.0`. Override con
`ANDROID_DEVICE_NAME` / `ANDROID_PLATFORM_VERSION`.

Packages MAGIIS instalados por ambiente (ver `appiumRuntime.ts`):

| ENV | Driver | Passenger |
|---|---|---|
| test | `com.magiis.app.test.driver` | `com.magiis.app.test.passenger` |
| uat | `com.magiis.app.uat.driver` | `com.magiis.app.uat.passenger` |
| prod | `com.magiis.app.driver` | `com.magiis.app.passenger` |
| savio | — | `com.magiis.app.savio.passenger` |

---

## Configuración Appium MCP (helpers)

Scripts que generan el archivo de configuración MCP para que Appium MCP server
pueda lanzarse contra el driver o passenger app. Salida bajo
`tests/mobile/appium/.generated/`.

| Script | Propósito |
|---|---|
| `pnpm appium:mcp:driver:config` | Genera config MCP del driver app |
| `pnpm appium:mcp:passenger:config` | Genera config MCP del passenger app |
| `pnpm appium:mcp:help` | Imprime ayuda del generador |

---

## Driver app — investigación + smokes

| Script | Propósito |
|---|---|
| `pnpm mobile:driver:home-dump` | Conecta al driver app, navega al home y dumpea page-source + screenshots para descubrir selectores. Default package: `com.magiis.app.test.driver`. |
| `pnpm mobile:driver:login-smoke` | Smoke completo de login del driver app (usa `DRIVER_EMAIL` + `DRIVER_PASSWORD`). Útil para validar credenciales y rutina de autenticación. |

---

## Passenger app — investigación + smokes

| Script | Propósito |
|---|---|
| `pnpm mobile:passenger:home-dump` | Dump de page-source + screenshot del home del passenger app. Etiqueta archivos como `passenger-home`. |
| `pnpm mobile:passenger:login-dump` | Login completo del passenger app y dump del estado post-login. Útil para mapear selectores del shell autenticado. |
| `pnpm appium:passenger:login-dump` | Alias del anterior (mantenido por compatibilidad con un consumer histórico). |
| `pnpm mobile:passenger:profile-mode-smoke` | Smoke del flujo Profile → cambio de modo (personal/business). Confirma que el modal de switch responde. |

---

## Passenger app — flows ad-hoc (wallet / hold / 3DS)

Scripts que ejecutan flows completos de extremo a extremo del passenger app.
Útiles para reproducir manualmente un caso, generar evidencia de selectores
nuevos, o smoke de regresión rápido cuando se modifican Screens.

| Script | Flujo |
|---|---|
| `pnpm mobile:passenger:wallet-cleanup` | Limpia todas las tarjetas guardadas en la wallet del passenger. Necesario antes de runs paralelas con el mismo usuario. Ver `memory/project_pax_wallet_parallel_tests.md`. |
| `pnpm mobile:passenger:wallet-3ds-delete` | Agrega una tarjeta con 3DS y la elimina inmediatamente. Repro rápido para auditar la rutina de DELETE wallet. |
| `pnpm mobile:passenger:personal-3ds-hold-flow` | Hold con tarjeta 3DS sobre cuenta personal del passenger. Incluye challenge 3DS hasta `SEARCHING_DRIVER`. |
| `pnpm mobile:passenger:business-no3ds-hold-flow` | Hold sin 3DS sobre cuenta business. Validación del happy path business. |

---

## Convenciones

1. **Estos scripts NO corren en CI.** Son ad-hoc para desarrollo local.
2. Los dumps generados viven bajo `evidence/manual-capture/` o
   `tests/mobile/appium/.generated/` (ignorados por git).
3. Si un flow se vuelve crítico para regresión → migrarlo a un E2E spec real
   bajo `tests/e2e/gateway/flow*/` con `JourneyContext` persistido.
4. Nunca commitear screenshots con datos reales (números de tarjeta, emails)
   sin redacción previa.

---

## Troubleshooting rápido

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Missing environment variable: APPIUM_SERVER_URL` | `.env.test` no cargado o server no levantado | `appium server` + verificar `.env.test` |
| `Could not start a new session` | Emulador no booteado o package incorrecto | `adb devices` + revisar `ANDROID_*_APP_PACKAGE` |
| `Element not found` después de cambio de versión | App actualizó la pantalla → selectores quedaron viejos | Correr `*-home-dump` o `*-login-dump` para re-mapear |
| Login falla con `Invalid credentials` | `.env.test` con creds vacías o vencidas | Verificar `DRIVER_EMAIL`/`DRIVER_PASSWORD` (o passenger) |
