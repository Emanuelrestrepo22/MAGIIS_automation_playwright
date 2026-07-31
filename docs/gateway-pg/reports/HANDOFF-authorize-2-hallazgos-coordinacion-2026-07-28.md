# HANDOFF Authorize — 2 hallazgos de coordinación

> **Fecha:** 2026-07-28
> **Rama de origen:** `carrier/gateway-standardization`
> **Destinatario:** sesión que trabaja en `test/oracle-hardening` (worktree `C:\worktrees\mgfix-gs`)
> **Alcance:** Authorize.Net · pasarela, no MAGIIS · sólo coordinación entre sesiones (este documento no cambia código)

Dos hallazgos que corrigen atribución. El primero: el fallo del piloto parametrizado NO es un decline de la pasarela, es residuo de wallet de su propia corrida anterior (BL-050). El segundo: la política `Z → "Authorize and hold for review"` no puede hacer reproducibles los casos Held-for-Review, porque la tarjeta del fixture devuelve `avsResultCode = "P"` y la fila `Z` nunca se evalúa. Sin estas dos correcciones, ambos síntomas se atribuyen a la configuración de la cuenta de Authorize — que es el lugar equivocado a investigar.

---

## Hallazgo 1 — El piloto parametrizado produce un FALSO decline

**Qué.** `tests/features/gateway-pg/specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts` falla con *"Error al validar tarjeta. Por favor, revise los datos ingresados."* Ese mensaje se lee naturalmente como un rechazo de la pasarela. **No lo es.**

**Causa.** El piloto no ejecuta la precondición de limpieza de tarjeta por API. La regla de negocio **BL-050** (ver `docs/ops/BACKLOG.md` § BL-050) es que si el **mismo número de tarjeta** ya está vinculado al pasajero, el botón "Validar" no se habilita y la re-validación falla — con ese mismo mensaje genérico. Como cada corrida vincula la `4111 1111 1111 1111`, la corrida siguiente choca con su propio residuo.

En el código, el piloto delega el journey a `CarrierHoldSteps.runHoldScenario` con `useCardFlow: false` en sus `HAPPY_NO_AUTH_OPTIONS`, así que no corre ninguna precondición de tarjeta. Y aun con `useCardFlow: true`, ese Step resuelve `validateCardPrecondition` — que no borra por `last4` — no `cleanupCardsByLast4`.

**Evidencia (2026-07-28).** El piloto falló con ese error en dos corridas consecutivas. En las **mismas** corridas, el spec `TS-AUTHORIZE-TC1011` (`tests/features/gateway-pg/specs/authorize/web/carrier/hold/personal-hold-on-happy.spec.ts`, consumidor thin de `defineHoldSuite('authorize', …)`) vinculó la tarjeta sin ningún error. TC1011 corre el journey por el motor `runStepwiseHoldJourney`, que sí ejecuta el borrado por API antes de abrir el formulario de alta; su log muestra en cada corrida:

```
[precond API] tarjetas borradas con last4=1111: 1
```

Misma tarjeta, mismo carrier, mismo momento. La única diferencia entre el spec que pasa y el que falla es el cleanup.

**Por qué importa.** El mensaje de la UI es idéntico para los tres casos: "el backend MAGIIS falló", "la pasarela rechazó" y "la tarjeta ya estaba vinculada". Sin discriminar, este falso decline se atribuye a la cuenta de Authorize y manda a revisar la configuración del gateway, que no es donde está el problema.

**Acción sugerida.** Cablear al piloto la misma precondición que usa el motor — `cleanupCardsByLast4` de `tests/features/gateway-pg/helpers/card-precondition.ts` — o excluirlo de las corridas de acreditación hasta que la tenga. No triar su fallo como decline de pasarela mientras no tenga cleanup.

---

## Hallazgo 2 — `Z → hold for review` no puede hacer reproducibles los casos Held-for-Review

**Qué.** Esa sesión registró como beneficio de la política AVS que, con `A/Z/Y → "Authorize and hold for review"`, los casos Held-for-Review `TS-AUTHORIZE-TC1321`, `TS-AUTHORIZE-TC1322` y `TS-AUTHORIZE-TC1323` (`docs/gateway-pg/authorize/matriz_cases2.md`) se volverían reproducibles vía Response Code 4. No se sostiene.

**Causa.** Dos condiciones se acumulan:

1. El formulario de tarjeta de MAGIIS envía **sólo ZIP**, sin street address.
2. El dato decisivo: la tarjeta del fixture (`4111 1111 1111 1111` / CVV `900` / ZIP `90210`, en `tests/fixtures/gateways/authorize/cards.ts`) devuelve `avsResultCode = "P"` — *AVS not applicable* — verificado en un probe API contra la cuenta, con `responseCode = 1` (aprobada).

Es decir: la fila `Z` de la tabla "Address and ZIP Code Responses" **nunca se evalúa** con estos datos de prueba, porque el código que emite la cuenta no es `Z` sino `P`.

**Evidencia (2026-07-28).** Probe API contra la cuenta con los datos del fixture → `avsResultCode = "P"` + `responseCode = 1`. El outcome es aprobación, no hold: el filtro AVS no tiene fila que disparar.

**Por qué importa.** RC 4 no es alcanzable por esa vía. TC1321-1323 siguen fuera de alcance — donde ya estaban: requieren una fraud rule creada a mano en el Merchant Interface. Y poner `Z` en "hold for review" tendría el costo de romper el happy path sin la contrapartida esperada: perdés el verde y no ganás los tres casos.

**Acción sugerida.** No mover `Z` a "hold for review". Mantener TC1321-1323 declarados fuera de alcance con la causa correcta (fraud rule manual, no política AVS). Si se quiere cobertura de RC 4, el camino es la fraud rule en el Merchant Interface, no el filtro AVS.

**Nota de convergencia.** La política finalmente aplicada — `N` y `A` → Decline, `Z`/`W`/`Y` → Allow — es la correcta para la regla de negocio de USA y no tiene este problema. El hallazgo no la contradice; sólo descarta el beneficio que se le había atribuido.

---

## Cierre — hallazgo × acción × archivo afectado

| Hallazgo | Acción | Archivo / config afectado |
|---|---|---|
| 1 — Falso decline por residuo de wallet (BL-050), no por la pasarela | Cablear `cleanupCardsByLast4` al piloto, o excluirlo de las corridas de acreditación hasta que la tenga | `tests/features/gateway-pg/specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts` (consume `cleanupCardsByLast4` de `tests/features/gateway-pg/helpers/card-precondition.ts`) |
| 2 — `Z → hold for review` no hace reproducible RC 4 (`avsResultCode = "P"`) | No mover `Z` a "hold for review"; TC1321-1323 quedan fuera de alcance por fraud rule manual | Política AVS de la cuenta Authorize (Merchant Interface → Fraud Detection Suite); datos en `tests/fixtures/gateways/authorize/cards.ts`; matriz `docs/gateway-pg/authorize/matriz_cases2.md` |
