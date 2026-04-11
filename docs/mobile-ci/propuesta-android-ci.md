# Propuesta: CI/CD con Android Emulator para Tests E2E Híbridos

## Contexto y problema actual

MAGIIS es una plataforma de movilidad donde **la mayoría de los flujos críticos de negocio son híbridos**: comienzan en un portal web (Carrier, Contractor) y se completan en aplicaciones móviles Android (Driver App, Passenger App).

Hoy los tests E2E que involucran mobile **solo pueden correr localmente** porque requieren un dispositivo físico (Samsung Galaxy A05) conectado por USB. Esto significa:

- No hay validación automática en cada PR
- Los flujos móviles no tienen cobertura en CI
- El equipo depende de ejecución manual para detectar regresiones en mobile
- Un bug en la Driver App o Passenger App puede pasar desapercibido hasta producción

---

## Flujos críticos que dependen de mobile

| Flujo | Portal web | App mobile | Estado actual |
|---|---|---|---|
| Carrier crea viaje → Driver acepta y completa | Carrier portal | Driver App | ❌ Solo local |
| Passenger crea viaje → Driver completa → cobro | Passenger App | Driver App | ❌ Solo local |
| Hold Stripe → Capture post-viaje | Carrier portal | Driver App | ❌ Solo local |
| 3DS requerido → Driver finaliza → validar cobro | Carrier portal | Driver App | ❌ Solo local |
| Recurrentes → Driver completa ciclo | Carrier portal | Driver App | ❌ Solo local |

Sin CI mobile, **los flujos de pago más críticos (hold + capture) no tienen validación automática end-to-end**.

---

## Solución propuesta: Android Emulator en GitLab CI

### Arquitectura general

```
GitLab CI Pipeline
│
├── stage: web-tests
│   └── playwright-runner (Node.js + Chromium)
│       → Tests portal Carrier, Contractor, Auth
│       → Guarda JourneyContext en artefacto
│
├── stage: mobile-tests  (depende de web-tests)
│   └── android-runner (Docker con Android SDK)
│       → Appium Server dentro del container
│       → Android Emulator (AVD Pixel 7 API 34)
│       → WebdriverIO conecta al emulador
│       → Lee JourneyContext del stage anterior
│       → Driver App acepta y completa el viaje
│
└── stage: validation
    └── playwright-runner
        → Verifica estado final en portal (CAPTURED, cobro OK)
        → Genera reporte unificado web + mobile
```

### Componentes necesarios

**1. Imagen Docker base con Android SDK**
```dockerfile
FROM ubuntu:22.04

# Java (requerido por Android SDK y Appium)
RUN apt-get install -y openjdk-17-jdk

# Android SDK + emulador
RUN wget https://dl.google.com/android/repository/commandlinetools-linux-*.zip
RUN sdkmanager "platform-tools" "emulator" "system-images;android-34;google_apis;x86_64"

# Node.js + Appium
RUN npm install -g appium
RUN appium driver install uiautomator2

# WebdriverIO + dependencias del proyecto
COPY package.json .
RUN pnpm install
```

**2. Script de inicio del emulador en CI**
```bash
# Crear AVD (Android Virtual Device)
avdmanager create avd -n magiis-ci -k "system-images;android-34;google_apis;x86_64"

# Iniciar emulador en background (sin GUI)
emulator -avd magiis-ci -no-window -no-audio -gpu swiftshader_indirect &

# Esperar a que el emulador esté listo
adb wait-for-device shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'

# Instalar APKs
adb install driver-app-test.apk
adb install passenger-app-test.apk

# Iniciar Appium Server
npx appium --port 4723 --base-path / &
```

**3. GitLab CI Pipeline (`.gitlab-ci.yml`)**
```yaml
stages:
  - web-tests
  - mobile-tests
  - validation

variables:
  ENV: "test"
  MOBILE_ENABLED: "true"
  ANDROID_DEVICE_NAME: "magiis-ci"
  APPIUM_SERVER_URL: "http://localhost:4723"

web-carrier-tests:
  stage: web-tests
  image: mcr.microsoft.com/playwright:v1.x-focal
  script:
    - pnpm install
    - pnpm test:test:gateway-pg:hold --workers=1
  artifacts:
    paths:
      - evidence/journey-context/
    expire_in: 1 hour

mobile-driver-tests:
  stage: mobile-tests
  image: magiis/android-appium:latest   # imagen custom
  needs: [web-carrier-tests]
  services:
    - name: magiis/android-emulator:api34
  script:
    - ./scripts/ci/start-emulator.sh
    - pnpm test:e2e:flow1:mobile --workers=1
  artifacts:
    paths:
      - evidence/
    expire_in: 24 hours

validate-payment:
  stage: validation
  image: mcr.microsoft.com/playwright:v1.x-focal
  needs: [mobile-driver-tests]
  script:
    - pnpm test:e2e:flow1:validation --workers=1
```

---

## Flag `MOBILE_ENABLED` — ejecución condicional

Para no bloquear el pipeline cuando el emulador no está disponible (ej: PRs rápidos), implementamos una flag:

```typescript
// tests/config/runtime.ts
export const MOBILE_ENABLED = process.env.MOBILE_ENABLED === 'true';

// En la spec E2E:
test('Flow1 — Carrier + Driver happy path', async ({ page }) => {
  // Fase 1: web siempre corre
  const journeyContext = await carrierCreatesTrip(page);

  if (!MOBILE_ENABLED) {
    test.skip(true, 'MOBILE_ENABLED=false — skip fase mobile');
    return;
  }

  // Fase 2: mobile solo si flag activa
  await driverAcceptsAndCompletes(journeyContext);

  // Fase 3: validación web
  await validatePaymentCaptured(page, journeyContext.travelId);
});
```

**Comandos:**
```bash
# Solo web (PRs, desarrollo local rápido)
pnpm test:e2e:flow1

# Completo web + mobile (CI, dispositivo físico conectado)
MOBILE_ENABLED=true pnpm test:e2e:flow1

# Solo mobile (debug de la app)
MOBILE_ONLY=true pnpm test:e2e:flow1:mobile
```

---

## APK Management

Los APKs de Driver App y Passenger App necesitan estar disponibles en CI de forma segura:

**Opción A — GitLab Package Registry (recomendada)**
```bash
# Upload (desde pipeline de magiis-fe o magiis-driver)
curl --upload-file driver-app-test.apk \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/android-apps/test/driver-app.apk" \
  --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}"

# Download (en el pipeline de tests)
curl -o driver-app.apk \
  "${CI_API_V4_URL}/projects/${SOURCE_PROJECT_ID}/packages/generic/android-apps/test/driver-app.apk" \
  --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}"
```

**Opción B — Artefacto del pipeline de build**
- El pipeline de `magiis-driver` genera el APK como artefacto
- El pipeline de tests lo descarga con `needs: [project: magiis-driver, job: build-apk]`

---

## Beneficios concretos para MAGIIS

| Beneficio | Impacto |
|---|---|
| Regresiones en Driver App detectadas en cada PR | Evita bugs en producción en flujos de cobro |
| Hold + Capture validado E2E automáticamente | El flujo más crítico de negocio con cobertura real |
| 3DS + mobile validado sin intervención manual | Reduce tiempo de QA en cada release |
| Reportes unificados web + mobile en GitLab | Visibilidad completa del estado del sistema |
| Base para testing de Passenger App | Escala a Flow 2 (Passenger + Driver) |

---

## Plan de implementación por fases

### Fase 1 — Local estabilizado (en curso)
- [x] Appium + WebdriverIO funcionando en dispositivo físico
- [x] DriverHomeScreen + DriverTripRequestScreen con selectores reales
- [ ] DriverTripNavigationScreen (pendiente dump TravelNavigationPage)
- [ ] Flow1 completo ejecutable con `MOBILE_ENABLED=true`

### Fase 2 — Docker base (próxima semana)
- [ ] Imagen Docker con Android SDK + Appium + Node
- [ ] Script `start-emulator.sh` para CI
- [ ] APK de Driver App en GitLab Package Registry
- [ ] Pipeline básico: web → mobile → validación

### Fase 3 — Pipeline completo
- [ ] Integración con pipeline de `magiis-driver` (APK automático)
- [ ] Reportes unificados (Playwright HTML + evidencias mobile)
- [ ] Notificaciones en Slack/Teams por falla E2E

### Fase 4 — Flow 2 (Passenger App)
- [ ] PassengerWalletScreen + PassengerNewTripScreen con selectores reales
- [ ] Flow2: Passenger crea viaje → Driver acepta → cobro
- [ ] Multi-device en CI (emulador driver + emulador passenger en paralelo)

---

## Estimación de esfuerzo

| Tarea | Complejidad | Responsable |
|---|---|---|
| Dockerfile Android + Appium | Media | Dev/DevOps |
| Script start-emulator.sh | Baja | QA Automation |
| `.gitlab-ci.yml` pipeline E2E | Media | Dev/DevOps |
| APK management en Package Registry | Baja | Dev/DevOps |
| Flow1 spec completo (web + mobile) | Alta | QA Automation |
| Flow2 spec (Passenger + Driver) | Alta | QA Automation |

---

## Referencias técnicas

- [Android Emulator en CI](https://github.com/ReactiveCircus/android-emulator-runner)
- [Appium Docker Android](https://github.com/appium/appium-docker-android)
- [GitLab Package Registry](https://docs.gitlab.com/ee/user/packages/generic_packages/)
- Implementación actual: `tests/mobile/appium/` en este repositorio
