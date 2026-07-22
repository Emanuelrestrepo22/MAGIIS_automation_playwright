# Gap de entorno — método de pago de gateway ausente en `test` (apps-test)

**Fecha:** 2026-07-17 · **Detectado por:** corrida live smoke gateway `ENV=test` · **Severidad:** bloqueante para automatización de gateway en `test`.

## Resumen

Las suites de automatización de **gateway/pagos** (Stripe: hold, 3DS, cargo-a-bordo, recurrentes, recovery, contractor, e2e) **no son ejecutables en el entorno `test` (apps-test)** porque la cuenta carrier/contractor de prueba **no tiene habilitado el método de pago "Preautorizada" (tarjeta/Stripe)**. El flujo depende de ese método para vincular tarjeta y disparar el hold.

**No es un defecto de las pruebas ni del login** — es configuración del entorno.

## Evidencia (corrida real)

- Comando: `cross-env ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=smoke --workers=1`
- Resultado: **26 ejecutados / 26 fallan / 8 skipped**, todos por la misma causa.
- Punto de fallo: `tests/pages/carrier/NewTravelPageBase.ts:617` (`fillPreauthorizedCard`)
  ```
  TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  waiting for locator('#add_travel_payment_methods select-dropdown .options li')
    .filter({ hasText: 'Preautorizada' }).first() to be visible
  ```
- Snapshot del formulario "Nuevo Viaje" en apps-test: el dropdown **Forma de Pago** solo ofrece **"Cuenta Corriente"** — no aparece "Preautorizada".
- Secuencia previa OK: login ✅ → dashboard ✅ → "Nuevo Viaje" ✅ → form (cliente/origen/destino) ✅ → **falla al elegir pago**.
- Cuenta observada: carrier "Remises EEUU" / contractor "Fast Car US50000" / cliente "smith, Emanuel".

## Impacto

- Todas las suites que vinculan tarjeta (la gran mayoría de `tests/features/gateway-pg/`) quedan bloqueadas en `test`.
- El feature de gateway hoy solo es ejecutable en **UAT (apps-uat)**, donde Stripe/Preautorizada está habilitado (coincide con `default_env: uat`).

## Acción para DevOps / configuración (para habilitar `test`)

Habilitar en la cuenta carrier/contractor de prueba de `apps-test` el **método de pago de gateway ("Preautorizada" / integración Stripe)**, equivalente a como está en UAT:

1. Confirmar que el carrier de prueba tenga la integración de pasarela (Stripe) activa en `test`.
2. Verificar que el colaborador/contractor tenga habilitado el pago con tarjeta preautorizada (no solo Cuenta Corriente).
3. Cargar en `.env.test` las variables que hoy solo están en UAT si aplica: `STRIPE_CARD_*`, credenciales de carrier con gateway.

## Verificación tras el fix

```
cross-env ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=smoke --workers=1
```
Debe aparecer "Preautorizada" en el dropdown Forma de Pago y el smoke pasar.

## Alternativa (sin tocar `test`)

Correr la regresión de gateway en **UAT**:
```
cross-env ENV=uat npx playwright test -c playwright.gateway-pg.config.ts --grep=@gateway --workers=1
```
