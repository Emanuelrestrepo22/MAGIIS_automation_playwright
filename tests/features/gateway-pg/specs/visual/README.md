# Visual Regression Suite — gateway-pg (BL-044)

## Scope (intencionalmente pequeño)

- Modal 3DS Stripe (challenge frame) — piloto en este commit
- [TODO] Popup "no se pudo realizar el pago" (referencia: memoria global `project_bug_viaje_calle_unhappy`)
- [TODO] Formulario CardLinking Stripe
- [TODO] Formulario CardLinking Authorize (post BL-024)
- [TODO] ThreeDSErrorPopup

**NO** se cubre full-page. Solo el componente con `locator.screenshot` / `toHaveScreenshot` clipping.

## Política de baselines

1. **Quién genera**: humano con acceso a TEST ambiente live + Stripe sandbox.
2. **Cuándo**: al estabilizar el spec (sacar `test.fixme()`) o tras cambio aprobado de UI.
3. **Cómo**:
   ```bash
   pnpm exec playwright test tests/features/gateway-pg/specs/visual/3ds-stripe-modal.visual.spec.ts \
     --update-snapshots --project=visual
   ```
4. **Aprobación**: cualquier diff visual debe ser aprobado en MR con captura del antes/después (Playwright HTML reporter lo genera).
5. **Tolerancia**: `maxDiffPixelRatio: 0.02` (2% píxeles). Si el cambio es legítimo, regenerar; si no, investigar regresión.

## CI

Project opcional `visual` en `playwright.gateway-pg.config.ts`. **NO** se incluye en `regression-web` ni `smoke` por default — corre por separado con `--project=visual` para no quemar cuota CI (ver memoria `project_gitlab_ci_quota.md` + BL-042).

## Cómo agregar un componente

1. Identificar el POM/locator en `tests/pages/carrier/` o `tests/pages/shared/`.
2. Crear `<componente>.visual.spec.ts` con `toHaveScreenshot` sobre el locator (NO `page.screenshot`).
3. Marcar `test.fixme()` hasta generar baseline.
4. Documentar el screen en este README.
