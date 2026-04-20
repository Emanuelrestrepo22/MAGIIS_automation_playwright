# TC14 Stabilization — TS-STRIPE-P2-TC090

**Fecha:** 2026-04-19
**Rama:** `fix/tier4-tc14-selectcard-tolerant`
**Archivos tocados:**
- `tests/pages/carrier/NewTravelPageBase.ts`
- `tests/pages/contractor/NewTravelPage.ts`
- `tests/features/smoke/specs/gateway-pg.smoke.spec.ts`

---

## Síntoma

TC14 falla con `Button did not become enabled before timeout` en `NewTravelPageBase.ts:175` (método `waitForEnabledButton`).

El fallo ocurre en el step `fillMinimum` del spec, antes de llegar al assertion `vehicleBtnEnabled=false`.

---

## Root cause

Cadena de llamadas para TC14 (contractor, card 0002 — generic_decline):

```
ContractorNewTravelPage.fillMinimum
  → selectCardByLast4('0002', skipValidate=false)
    → clickValidateCard()
      → waitForEnabledButton(validateCardButton, 45_000)
        → throws: "Button did not become enabled before timeout"
```

Con la card `0002` (generic_decline), Stripe puede rechazar el PaymentMethod antes de que el botón "Validar" se habilite, o rechazarlo post-click. En ambos casos, `clickValidateCard()` con su `waitForEnabledButton(45s)` lanza error antes de que el spec llegue a su assertion correcta.

El método `clickValidateCardAllowingReject()` ya existía para manejar este caso (escenario 1: botón nunca habilita; escenario 2: error post-click), pero `selectCardByLast4` siempre usaba `clickValidateCard()` cuando `skipValidate=false`.

---

## Fix

**Opción A** — flag `allowDecline` en `selectCardByLast4` + `expectDecline` en `NewTravelFormInput`.

### `NewTravelFormInput` — nueva propiedad

```typescript
// ANTES: no existía

// DESPUÉS
expectDecline?: boolean;
// Si true, fillMinimum usa clickValidateCardAllowingReject() — no lanza timeout
// cuando Stripe declina antes de habilitar "Validar" (TC14: card 0002).
```

### `selectCardByLast4` — nueva firma

```typescript
// ANTES
async selectCardByLast4(last4: string, skipValidate = false): Promise<void>

// DESPUÉS
async selectCardByLast4(last4: string, skipValidate = false, allowDecline = false): Promise<void>
```

Cuando `allowDecline=true` y `skipValidate=false`:
- Llama `clickValidateCardAllowingReject()` en lugar de `clickValidateCard()`
- No lanza error si el botón nunca habilita (retorna `success=false`)
- No lanza error si Stripe rechaza post-click

### `fillMinimum` — carrier y contractor

```typescript
// ANTES
await this.selectCardByLast4(opts.cardLast4, opts.skipCardValidation ?? false);

// DESPUÉS
await this.selectCardByLast4(opts.cardLast4, opts.skipCardValidation ?? false, opts.expectDecline ?? false);
```

### TC14 spec — invocación de `fillMinimum`

```typescript
// ANTES
await travel.fillMinimum({
  client:      TEST_DATA.contractorColaborador,
  passenger:   TEST_DATA.contractorColaborador,
  origin:      TEST_DATA.origin,
  destination: TEST_DATA.destination,
  cardLast4:   STRIPE_TEST_CARDS.declined.slice(-4),
});

// DESPUÉS
await travel.fillMinimum({
  client:        TEST_DATA.contractorColaborador,
  passenger:     TEST_DATA.contractorColaborador,
  origin:        TEST_DATA.origin,
  destination:   TEST_DATA.destination,
  cardLast4:     STRIPE_TEST_CARDS.declined.slice(-4),
  expectDecline: true,
});
```

---

## Impacto en happy paths

- TC01–TC13 no pasan `expectDecline`. El valor por defecto es `false`, por lo que `clickValidateCard()` sigue siendo el camino para todos los tests happy.
- `skipCardValidation` sigue funcionando igual — sin cambios de comportamiento para los tests que lo usan.
- La firma de `selectCardByLast4` es retrocompatible (tercer parámetro con default `false`).

---

## Cards detectadas como "declined" con este flag

Cualquier card que se pase con `expectDecline: true`. No hay hardcoding de last4 — el caller es responsable de declarar su intención. TC14 usa `0002` (generic_decline).

Cards conocidas que deberían usar este flag:
- `0002` — generic_decline (TC14)
- `9995` — insufficient_funds (si se porta igual en hold authorize)

---

## Validación

- Local: worktree sin `node_modules` instalados. Validación por inspección de código + TSC manual no ejecutable.
- Cambios tipados correctamente: `expectDecline?: boolean` en el type, threaded consistentemente en ambos `fillMinimum`.
- CI: pipeline post-merge debe correr TC14 en 2–3 runs consecutivos sin falla para confirmar estabilidad.
- Riesgo residual: si Stripe tarda más de 8s en habilitar el botón "Validar" para una card válida, el timeout de `clickValidateCardAllowingReject(8_000)` retornaría `success=false`. Pero `expectDecline` solo se pasa para cards conocidas como declinadas, por lo que este riesgo es aceptable.
