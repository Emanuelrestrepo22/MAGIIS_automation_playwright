# eBizCharge — Bloqueantes externos (runtime)

> Los **datos + docs** están listos (BL-027). Estos bloqueantes aplican al **runtime** (POM + specs), no a los datos.

## §1 — Confirmar uso de eBizCharge en PROD (USA)

- **Acción:** confirmar con el líder / backend que MAGIIS integra eBizCharge en algún portal/PROD (USA).
- **Si NO se usa:** deprioritizar a P3 o cancelar el runtime (los datos quedan como referencia).

## §2 — Modelo de integración backend

- **Acción:** sesión con backend MAGIIS para confirmar cómo se integra eBizCharge:
  - ¿REST API directa, hosted iframe, o JS SDK?
  - ¿Form de tarjeta propio de eBiz (tipo Stripe Elements) o comparte el form MAGIIS?
  - ¿Endpoints de Hold/Capture equivalentes?
- **Impacto:** define el Page Object (`tests/pages/carrier/ebizcharge/` si el form difiere del compartido).

## §3 — Sandbox / credenciales

- **Acción:** confirmar acceso al sandbox eBizCharge (¿account requerido? ¿keys?), cargar en `.env.test`.
- Las **tarjetas de prueba no son secretas** (doc pública), pero el acceso al sandbox/endpoint puede requerir credenciales.

## §4 — .gitignore (verificar)

- BL-025 dejó pendiente confirmar la excepción de `.gitignore` para `docs/gateway-pg/ebizcharge/ARCHITECTURE.md` (el patrón genérico ignoraba `ARCHITECTURE.md` y solo Stripe tenía excepción). **Verificar** que este archivo quede trackeado.

## §5 — Ambiente

- Toda prueba de pago corre en **TEST** (tarjetas de prueba). **Prohibido** eBizCharge con tarjetas reales en UAT/PROD.

## Orden recomendado

§1 (confirmación uso) → §2 (modelo integración) → §3 (sandbox) → POM → primer spec `tests/features/gateway-pg/specs/ebizcharge/web/carrier/hold/` con intent `HAPPY_NO_AUTH` → sumar `'ebizcharge'` a `ACTIVE_GATEWAYS`.
