# Proyecto E2E — MAGIIS Hybrid Automation

> **Nombre canónico:** `e2e`
> Cada vez que se mencione "el proyecto e2e" o "el flow e2e" en este repositorio,
> se refiere a esta carpeta, su arquitectura y las convenciones aquí definidas.

---

## Qué es

Suite de automatización E2E **híbrida** que combina:

- **Playwright** → interacción con portales web (carrier, contractor)
- **WebdriverIO + Appium** → interacción con apps Android (driver, passenger)

El mecanismo de comunicación entre ambas capas es un archivo JSON
(`evidence/journey-context/<journeyId>.json`) llamado **JourneyContext**.

---

## Árbol de carpetas

```
tests/e2e/
├── README.md                          ← este archivo
├── gateway/                           ← flows que involucran pasarelas de pago
│   ├── shared/
│   │   ├── e2eFlowConfig.ts           ← tipos y configs de pasarela (gateway-agnostic)
│   │   └── JourneyBridge.ts           ← puente de estado entre Playwright y Appium
│   ├── flow1-carrier-driver/          ← Flow 1: Carrier Web + Driver App
│   │   ├── flow1.e2e.spec.ts          ← spec orquestador (Playwright)
│   │   ├── web-phase.ts               ← fase web: login → crear viaje → JourneyContext
│   │   └── mobile-phase.ts            ← fase mobile: ts-node → harness driver
│   └── flow2-passenger-driver/        ← Flow 2: Passenger App + Driver App [DRAFT]
│       └── (pendiente)
└── (archivos legacy — ver nota al pie)
```

> **Archivos legacy en raíz (`tests/e2e/*.spec.ts`):** sketches anteriores,
> mantenidos solo como referencia histórica. No ejecutar; usar los flows bajo `gateway/`.

---

## Flujos implementados

### Flow 1 — Carrier Web + Driver App

| Fase | Runner | Archivo |
|------|--------|---------|
| Web | Playwright | `flow1-carrier-driver/web-phase.ts` |
| Mobile | ts-node + WebdriverIO | `flow1-carrier-driver/mobile-phase.ts` |
| Orquestador | Playwright spec | `flow1-carrier-driver/flow1.e2e.spec.ts` |

**Secuencia:**

```
[WEB]    Dispatcher login → verifica hold ON → crea viaje (tarjeta Stripe 4242)
[WEB]    Sistema aplica hold → redirige al detalle → status "Buscando conductor"
[BRIDGE] JourneyContext escrito con status: ready-for-driver
[MOBILE] Driver recibe push notification del viaje
[MOBILE] Driver acepta → inicia → finaliza → cierra resumen
[BRIDGE] JourneyContext actualizado: status driver-completed
[VALIDATE] Spec verifica checkpoints + estado final
```

**Comunicación entre fases:**

Playwright no puede correr WebdriverIO en el mismo runtime. Solución:
`mobile-phase.ts` se lanza como **child process** via `spawnSync` desde el spec.
El resultado vuelve por stdout con el marcador `E2E_MOBILE_RESULT:<json>`.

```
flow1.e2e.spec.ts
  └── spawnSync('npx ts-node --esm mobile-phase.ts')
        ├── lee evidence/journey-context/<id>.json
        ├── ejecuta DriverTripHappyPathHarness
        ├── escribe resultado en JourneyContext
        └── stdout: "E2E_MOBILE_RESULT:{...}"
```

**Guard WEB_ONLY:**

Si `APPIUM_SERVER_URL` no está definido o `E2E_WEB_ONLY=true`,
la fase mobile se omite con `test.fixme()` y solo corre la fase web.
Útil para validar el handoff en CI sin dispositivo Android disponible.

---

### Flow 2 — Passenger App + Driver App

Estado: **DRAFT** — pendiente de implementación.

```
[MOBILE] Passenger agrega tarjeta al wallet
[MOBILE] Passenger crea viaje
[BRIDGE] JourneyContext escrito con status: passenger-trip-created
[MOBILE] Driver recibe push notification
[MOBILE] Driver acepta → navega → finaliza viaje
[MOBILE] Passenger verifica cobro procesado
```

---

## Arquitectura gateway-agnostic

El mismo spec corre con cualquier pasarela. Solo cambia la `GatewayFlowConfig`:

```typescript
// e2eFlowConfig.ts
export const GATEWAY_CONFIGS = {
  'stripe-hold-no3ds':      { gateway: 'stripe',       cardLast4: '4242', holdEnabled: true,  requires3DS: false },
  'stripe-hold-3ds':        { gateway: 'stripe',       cardLast4: '3155', holdEnabled: true,  requires3DS: true  },
  'mercado-pago-hold-no3ds':{ gateway: 'mercado-pago', cardLast4: '0000', holdEnabled: true,  requires3DS: false }, // TODO
};
```

Para agregar una nueva pasarela: añadir entrada en `GATEWAY_CONFIGS` y, si la
fase web difiere, extender `web-phase.ts` con un branch por `config.gateway`.
La fase mobile es independiente de la pasarela.

---

## JourneyContext — estados posibles

```
web-created
  └─► ready-for-driver
        └─► driver-completed
              └─► payment-validated
        └─► failed  (en cualquier paso)
```

Archivo en disco: `evidence/journey-context/<journeyId>.json`

Formato de `journeyId`: `flow1-<gateway>-hold-<uuid-corto>`
Ejemplo: `flow1-stripe-hold-no3ds-a3f8c1b2`

---

## Scripts

```bash
# Flow 1 completo (requiere APPIUM_SERVER_URL en .env.test)
pnpm test:e2e:flow1

# Solo fase web — valida handoff sin dispositivo Android
pnpm test:e2e:flow1:web-only

# Solo fase mobile — rerrun con journeyId existente
E2E_JOURNEY_ID=flow1-stripe-hold-no3ds-abc123 pnpm test:e2e:flow1:mobile
```

---

## Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `APPIUM_SERVER_URL` | URL del servidor Appium | `http://localhost:4723` |
| `ANDROID_DEVICE_NAME` | Nombre del emulador/dispositivo | `Pixel_7_API_34` |
| `ENV` | Ambiente target | `test` / `uat` |
| `E2E_WEB_ONLY` | Omitir fase mobile | `true` |
| `E2E_JOURNEY_ID` | JourneyId para relanzar fase mobile | `flow1-stripe-hold-...` |
| `E2E_MOBILE_TIMEOUT_MS` | Timeout fase mobile en ms | `180000` |

Definir en `.env.test` (nunca commitear).

---

## Prerrequisitos del ambiente

- Appium Server corriendo: `npx appium`
- Android emulador o dispositivo físico con Driver App instalada y sesión activa en TEST
- Carrier dispatcher con hold habilitado y tarjeta 4242 disponible en TEST
- Variables de entorno configuradas en `.env.test`

---

## Convenciones de nombrado

| Elemento | Formato | Ejemplo |
|----------|---------|---------|
| TC ID | `E2E-FLOW<N>-TC<NNN>` | `E2E-FLOW1-TC001` |
| JourneyId | `flow<N>-<gateway>-<mode>-<uuid8>` | `flow1-stripe-hold-no3ds-a3f8c1b2` |
| Spec file | `flow<N>.e2e.spec.ts` | `flow1.e2e.spec.ts` |
| Carpeta de flow | `flow<N>-<actor-a>-<actor-b>/` | `flow1-carrier-driver/` |

---

## Agregar un nuevo flow

1. Crear carpeta `tests/e2e/gateway/flow<N>-<actorA>-<actorB>/`
2. Implementar `web-phase.ts` o `mobile-phase-<actor>.ts` según corresponda
3. Crear `flow<N>.e2e.spec.ts` como orquestador
4. Agregar config en `GATEWAY_CONFIGS` si aplica nueva pasarela
5. Agregar scripts en `package.json`: `test:e2e:flow<N>` y variantes
6. Documentar el flujo en este README bajo "Flujos implementados"

---

## Dependencias clave

| Módulo | Propósito |
|--------|-----------|
| `tests/e2e/gateway/shared/JourneyBridge.ts` | API de estado entre fases |
| `tests/e2e/gateway/shared/e2eFlowConfig.ts` | Tipos y configs de pasarela |
| `tests/mobile/appium/harness/DriverTripHappyPathHarness.ts` | Happy path del driver |
| `tests/mobile/appium/config/appiumRuntime.ts` | Config de dispositivo Android |
| `tests/features/gateway-pg/context/gatewayJourneyContext.ts` | Persistencia JSON del journey |
| `tests/pages/carrier/` | POMs del portal carrier (fase web) |
