# MercadoPago — Bloqueantes externos (runtime)

> Los **datos + docs** están listos (BL-026). Estos bloqueantes aplican al **runtime** (POM + specs), no a los datos.

## §1 — Confirmar uso de MercadoPago en PROD (LATAM)

- **Acción:** confirmar con el líder / backend que MAGIIS integra MercadoPago en el Carrier de LATAM.
- **Si NO se usa:** deprioritizar o cancelar el runtime (los datos quedan como referencia).

## §2 — Modelo de integración backend

- **Acción:** confirmar cómo integra MAGIIS MercadoPago:
  - ¿Checkout API, Card Payment Brick, o Checkout Pro / Wallet?
  - ¿El nombre del titular (trigger) viaja al SDK de MP tal cual se ingresa en el form MAGIIS?
  - ¿Endpoints de Hold/Capture?
- **Impacto:** define el Page Object.

## §3 — Sandbox / credenciales

- **Acción:** confirmar test user + credenciales sandbox MP (`MP_*` en `.env.test`): public key + access token de la cuenta de prueba.
- Las **tarjetas de prueba no son secretas** (doc pública), pero el sandbox requiere test user/credenciales.

## §4 — Documento (DNI) y país

- Approved requiere DNI `12345678`. Confirmar si el form MAGIIS LATAM expone el campo documento y cómo lo envía.
- La doc analizada es de **Argentina** (`mercadopago.com.ar`). Verificar si otros países LATAM de MAGIIS usan las mismas tarjetas/keywords.

## §5 — Ambiente

- Toda prueba de pago corre en **TEST** (tarjetas de prueba). **Prohibido** MP con tarjetas reales en UAT/PROD.

## Orden recomendado

§1 → §2 → §3/§4 → POM → primer spec `tests/features/gateway-pg/specs/mercado-pago/web/carrier/hold/` con intent `HAPPY_NO_AUTH` → sumar `'mercado-pago'` a `ACTIVE_GATEWAYS`.
