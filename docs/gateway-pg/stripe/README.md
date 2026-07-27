# Stripe — Documentación QA Oficial

> **Estado:** ACTIVO — pasarela canónica de referencia del feature gateway-pg (runtime web + specs en ejecución).
> **SoT de trazabilidad/IDs:** [`matriz_cases.md`](./matriz_cases.md) + [`matriz_cases2.md`](./matriz_cases2.md)
> **SoT de datos:** [`tests/fixtures/gateways/stripe/`](../../../tests/fixtures/gateways/stripe/)
> **Specs:** [`tests/features/gateway-pg/specs/stripe/`](../../../tests/features/gateway-pg/specs/stripe/)

Stripe es la **pasarela canónica de referencia**: el resto de gateways ([`../authorize/`](../authorize/), etc.) espejan la estructura documental de este directorio. Además del template estándar de 6 archivos (`ARCHITECTURE` · `matriz_cases` · `matriz_cases2` · `TRACEABILITY` · `EXTERNAL-BLOCKERS` · `CHANGELOG`), este directorio conserva los **artefactos extra del pipeline de análisis (L1–L3)** — normalización, detección de duplicados y auditoría — que solo existen aquí porque Stripe fue el primer gateway con runtime.

---

## Contenido del directorio

| Archivo | Propósito | Audiencia |
| --- | --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arquitectura específica Stripe (Elements, 3DS/SCA, triggers, mapping MAGIIS) | QA + Dev runtime |
| [`AUDIT-REPORT.md`](./AUDIT-REPORT.md) | Auditoría de la suite y de las matrices (pipeline de análisis) | Lead QA / Auditoría |
| [`CHANGELOG.md`](./CHANGELOG.md) | Historial cronológico de cambios documentales | Auditoría |
| [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md) | Bloqueos externos (sandbox, credenciales, coordinación) | Lead QA / Tech lead |
| [`STRIPE_Test_Suite_Matriz_Sincronizado.xlsx`](./STRIPE_Test_Suite_Matriz_Sincronizado.xlsx) | Export sincronizado de la matriz para stakeholders fuera de git | QA functional / PM |
| [`TRACEABILITY.md`](./TRACEABILITY.md) | Trazabilidad TCs ↔ specs / intents canónicos cross-gateway | Orquestación / Codex |
| [`duplicados-detectados.md`](./duplicados-detectados.md) | Pares duplicados detectados durante la normalización de matrices | QA functional |
| [`matriz_cases.md`](./matriz_cases.md) | Matriz canónica Parte 1 — `TS-STRIPE-TC1001..1126` (vinculación, hold, 3DS, antifraude, cargo a bordo) | QA functional |
| [`matriz_cases2.md`](./matriz_cases2.md) | Matriz canónica Parte 2 — `TS-STRIPE-P2-TC001..090` (Portal Contractor, Quote, recurrentes, operaciones de viaje) | QA functional |
| [`normalized-test-cases.json`](./normalized-test-cases.json) | L1 — casos normalizados machine-readable generados desde las matrices (`critical-flow-prioritizer`) | Pipelines / Codex |
| [`pares-resueltos.md`](./pares-resueltos.md) | Resolución documentada de los pares duplicados detectados | QA functional |

> Los artefactos de pipeline (`normalized-test-cases.json`, `duplicados-detectados.md`, `pares-resueltos.md`, `AUDIT-REPORT.md`, `.xlsx`) son **outputs generados**: la fuente de verdad siguen siendo las dos matrices `.md`.

---

## Orden de lectura recomendado

### Onboarding rápido (15 min)

1. `README.md` (este archivo) — qué hay y por qué.
2. `ARCHITECTURE.md` §1-3 — propósito + modelo + flujo Stripe en MAGIIS.
3. `matriz_cases.md` §índice — panorama de cobertura Parte 1.

### Lectura QA functional completa (1-2 h)

1. `ARCHITECTURE.md` completo — incluye triggers, endpoints, decisiones.
2. `matriz_cases.md` — TCs canónicos Parte 1.
3. `matriz_cases2.md` — TCs Parte 2 (Contractor / Quote / recurrentes).
4. `duplicados-detectados.md` + `pares-resueltos.md` — qué se colapsó y por qué.
5. `EXTERNAL-BLOCKERS.md` — qué sigue bloqueado.

### Cuando vayas a escribir o modificar un spec

1. `TRACEABILITY.md` — qué TC mapea a qué spec / intent.
2. `normalized-test-cases.json` — tags, prioridad y `card_flow` del TC objetivo.
3. [`tests/features/gateway-pg/specs/README.md`](../../../tests/features/gateway-pg/specs/README.md) — layout de specs y comandos de ejecución.

---

## Links rápidos

- **Fixture canónico:** [`tests/fixtures/gateways/stripe/`](../../../tests/fixtures/gateways/stripe/)
- **Resolver cross-gateway:** [`tests/fixtures/gateways/_shared/`](../../../tests/fixtures/gateways/_shared/) — `resolveCard({ gateway: 'stripe', intent })`
- **Specs:** [`tests/features/gateway-pg/specs/stripe/`](../../../tests/features/gateway-pg/specs/stripe/)
- **Doc oficial Stripe testing:** https://docs.stripe.com/testing

---

## Convención de IDs

- **Canónicos Parte 1:** `TS-STRIPE-TC1001..1126` (`matriz_cases.md`).
- **Canónicos Parte 2:** `TS-STRIPE-P2-TC001..090` (`matriz_cases2.md`).
- **Variantes `-CARD-EXISTING`:** sufijo sobre el ID canónico (ej. `TS-STRIPE-TC1017-CARD-EXISTING`) para la diferenciación card-new / card-existing introducida en Fase 2.
- **Aliases RV:** `TS-STRIPE-TC-RV001..RV008` quedaron **colapsados** a sus canónicos vía `canonical_ref` — no ejecutar por separado (ver tabla de aliases en `matriz_cases.md`).
- **Esquema viejo `TS-GATEWAY-TCnn`:** SUPERSEDED — se conserva solo como referencia histórica en [`docs/gateway-pg/test-ids.md`](../test-ids.md); no usar para specs nuevos.

Los IDs son la fuente de trazabilidad entre matrices, specs y reportes — ver `CLAUDE.md` §"Regla de trazabilidad de IDs".
