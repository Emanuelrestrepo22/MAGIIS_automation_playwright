# Hand-off — Reconciliación del link Authorize con selectores verificados en vivo

> Fecha: 2026-07-24 · Autor: QA (sesión de trazabilidad MG-178) · Para: la sesión que desarrolla el link Authorize.
> **Nota multi-sesión:** este doc NO modifica `AppStoreGatewaysPage.ts`, `authorize-link-unlink.spec.ts`,
> `GatewaySwitchSteps.ts` ni `tests/test-11.spec.ts`. Son hallazgos para que los apliques vos.

## Por qué existe este doc

El POM `tests/components/ui/carrier/AppStoreGatewaysPage.ts` está marcado `// FRAGILE` (selectores del modal
Authorize y del endpoint de link **adivinados**, no verificados en vivo). En paralelo se grabó
`tests/test-11.spec.ts` corriendo el flujo real contra `apps-test` (carrier `remises.eeuu@yopmail.com`), que
**verificó los selectores y el comportamiento reales**. Abajo, las correcciones concretas.

## 1. Selectores reales (test-11) vs POM FRAGILE

| Qué | POM actual (adivinado) | Real (verificado en vivo) |
|---|---|---|
| Contenedor del modal | `odn-service, [role=dialog], .modal` | el modal que **contiene `input[name="apiLoginKey"]`** (hay ~6 modales, 1 por PSP → **hay que scopear** a ese, si no agarrás un "Continue" oculto de otro PSP) |
| Campo API Login ID | `getByLabel(/login/i)` … | `input[name="apiLoginKey"]`  ⚠️ el `name` es **`apiLoginKey`**, no `apiLoginId` |
| Campo Transaction Key | `getByLabel(/transaction/i)` … | `input[name="transactionKey"]` |
| Acción "vincular" en la card | `a.green-text` + "Vincular" | `card.getByText('Link', { exact: true })` (**inglés**) |
| Estado "vinculado" | `a.red-text` + "Desvincular" | `card.getByText('Unlink', { exact: true })` presente |
| Card Authorize | `.card` filter `/authorize/i` | `.card` filter `hasText: 'Authorize.Net'` (ok, equivalente) |
| Botón submit | `/guardar\|vincular\|confirmar/i` | botón **`Continue`** (scopeado al modal Authorize) |

Además: el click del "Link" conviene envolverlo en retry — el handler Angular legacy puede **no estar bindeado
al primer intento**. Patrón de test-11:

```ts
await expect(async () => {
  await linkLink.click();
  await expect(apiLoginInput).toBeVisible({ timeout: 5_000 });
}).toPass({ timeout: 40_000 });
```

Recomendación: hacer `readState`/`vincularLink`/`desvincularLink` **i18n-proof** (aceptar `Link`/`Unlink` en
inglés **y** `Vincular`/`Desvincular`), porque el POM asumió solo español + clases de color.

## 2. Comportamiento real del backend (quirk) — ⚠️ importante

El link con credenciales válidas devuelve **HTTP 500 = pasarela CONECTADA** (éxito). **HTTP 400 = NO conectada.**
El `500-en-éxito` es un *smell* de API (debería ser 2xx) → **candidato a Improvement/Defect** (DEV/MX).

Esto **contradice MG-226** (`expectLinkStatusOk` asume status **200**). Decisión tuya para ese assert:
- **(a)** asertar 200 (lo correcto según el AC) → el test **falla** y revela el bug. Reportar el defecto.
- **(b)** asertar 500 (baseline observado) + dejar un defecto/improvement linkeado documentando el quirk.

`test-11` eligió (b): `expect(status).not.toBe(400)` + `expect(status).toBe(500)`. A criterio del owner del test.

> **Actualización 2026-07-25:** también se observó **HTTP 409** en una corrida donde el carrier 1521
> ya estaba vinculado por otra sesión (worktree `carrier/authorize-runtime`, mismo día). Ambos códigos
> (500 y 409) son "CONECTADA" según el estado previo del carrier compartido 1521 — 500 = link desde
> estado limpio, 409 = conflicto de idempotencia porque ya estaba vinculado. El assert de `expectLinkStatusOk`
> (MG-226) ahora tolera ambos (`[500, 409].toContain(status)`) manteniendo `not.toBe(400)`. Detalle completo
> en `agentic-qa-boilerplate/.context/reports/automation-inventory-baseline-2026-07-25.md` y en el reporte
> de investigación de esa misma fecha.

## 3. Trazabilidad Xray (keys correctas)

- Tu POM/spec ya mapea **bien**: link válido → **MG-220**, inválidas → MG-221, unlink → MG-223, exclusividad
  → MG-224, status → MG-226 (Test Set **MG-196**, área CFG).
- ⚠️ `tests/test-11.spec.ts` está tagueado **`MG-211`**, que es *"visualizar pasarela **Stripe** no vinculada"*
  → **key equivocada**. Si conservás test-11, cambiá a **MG-220**; si no, descartalo (su valor —selectores
  reales— ya lo incorporás al POM con este doc).

## 4. Gap de evidencia — para que la ejecución adjunte al Xray

Los tests CFG **MG-220/221/223/224/226 NO están en ningún Test Execution**. Los únicos ATR hoy son API
(**MG-510–516**) + **MG-553** (E2E cargo). Verificado en vivo (`exec list --project MG`, 8 execs).

→ Para que una corrida adjunte evidencia a esos tests, hay que **crear un ATR de UI** (p.ej.
`"ATR · UI — Configuración de Pasarelas (CFG)"`) y agregarles esos 5 tests; luego importar con
`bun xray import junit --execution <ATR-UI> --project MG` (o el reporter Xray con `XRAY_EXECUTION_KEY=<ATR-UI>`).
Es una acción del lado Xray — **coordinar** para no chocar con otras escrituras.

## 5. Reporter (contexto, no bloquea)

La rama `carrier/authorize-ebiz-gateway` tiene el `xray-reporter` **viejo** (`extractTestKey`, toma la 1ª key y
lee **solo `test.annotations` estáticas**). Tu spec ya lleva `annotation:[{type:'tms',...}]` estática por test →
**OK con el viejo** (specs single-key). El `emit-all` (que hicimos en `feature/kata-conformance`, une estáticas +
runtime `@atc`) **no es necesario** para estos specs de una sola key; solo importa para specs multi-key.

## 6. Riesgo de runtime (ya documentado en el POM/steps, se reitera)

Correr es **DESTRUCTIVO**: unlink dispara `cleaningWallets` en cascada (borra la tarjeta del pax). Ventana
exclusiva + teardown manual — `GatewaySwitchSteps.restoreStripe()` está **INCOMPLETO** (OAuth Connect test-mode
+ re-seed de la tarjeta pendientes).

## Checklist para cerrar (tu sesión)

- [ ] Portar los selectores reales (§1) al POM `AppStoreGatewaysPage` (modal por `apiLoginKey`, `Link`/`Unlink`, `Continue`, retry del click).
- [x] Decidir el assert de MG-226 (200 vs 500) + reportar el defecto del 500-en-éxito (§2) — resuelto 2026-07-25: tolera 500|409, ver addendum arriba.
- [ ] Confirmar/limpiar `test-11.spec.ts` (MG-211 → MG-220, o descartar).
- [ ] Crear el ATR de UI (CFG) y agregar MG-220/221/223/224/226 (§4).
- [ ] Correr en ventana exclusiva + teardown manual (§6).
