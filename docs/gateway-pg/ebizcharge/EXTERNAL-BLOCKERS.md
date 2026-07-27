# eBizCharge — Bloqueantes externos (runtime)

> Los **datos + docs** están listos (BL-027). Estos bloqueantes aplican al **runtime** (POM + specs), no a los datos.

> **✅ Resultado del probe F3 (2026-07-23) — "No Disponible" = regla de exclusividad, NO bloqueo de backend.** Probe read-only contra apps-test, carrier **1521 (Remises EEUU, US)**, v1.72.8. La card **EBizCharge existe** y muestra **"No Disponible"** porque **Stripe está vinculado** y solo una pasarela puede estar activa por carrier (exclusividad, ATP MG-224 / BL-037). **Al desvincular Stripe, eBiz pasa a "Vincular".** Evidencia: `evidence/test/probe/{appstore-all,ebizcharge-card}.png`. **Consecuencia:** el runtime UI de eBiz es viable vía switching (igual que Authorize). **Prerrequisitos reales (no backend):** (1) credenciales sandbox eBiz `EBIZ_*` para el modal (§3); (2) ventana exclusiva para el switching destructivo sobre 1521 (cleaningWallets al desvincular). Nota: eBiz aún **no tiene specs API contract** (a diferencia de Authorize) → su cobertura ejecutable depende 100% del runtime UI.

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
