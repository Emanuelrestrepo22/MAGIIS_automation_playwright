# Bloqueos externos — Suite Stripe Gateway PG

Estos bloqueos requieren acción humana en el ambiente TEST. No son bugs de automatización.

---

## TC1081 — Cargo a Bordo appPax: `limitExceeded`

**Test afectado:** `apppax-cargo-happy.spec.ts` — `[TS-STRIPE-TC1081]`

**Síntoma:** La URL redirige a `?limitExceeded=false` al crear viaje con método "Cargo a Bordo" para el pasajero appPax (Emanuel Restrepo `emanuel.restrepo@yopmail.com`).

**Causa raíz:** El backend retorna `limitExceeded` cuando el método de pago "Cargo a Bordo" no está habilitado para el pasajero, o cuando se supera el límite diario configurado para ese método.

**Acción requerida:**
1. Acceder al portal carrier en TEST (`https://apps-test.magiis.com/carrier`).
2. Ir a Configuración > Pasajeros > Emanuel Restrepo.
3. Verificar que el método "Cargo a Bordo / Tarjeta de Crédito" esté habilitado.
4. Si existe límite diario, verificar que no haya sido consumido (o resetearlo).
5. Alternativamente: consultar `GET /carriers/{carrierId}/passengers/{passengerId}` para ver `paymentMethods`.

**Tarjeta involucrada:** Ninguna (Cargo a Bordo = cobro desde Driver App al finalizar viaje).

---

## TC1092 — Cargo a Bordo appPax 3DS: tarjeta `4000 0025 0000 3155` no vinculada

**Test afectado:** `apppax-cargo-3ds.spec.ts` — `[TS-STRIPE-TC1092]`

**Síntoma:** El test necesita que el pasajero appPax (Emanuel Restrepo) tenga la tarjeta Stripe de test `4000 0025 0000 3155` (3DS requerido — éxito) vinculada en su wallet.

**Causa raíz:** La tarjeta 3DS no está vinculada al pasajero en el ambiente TEST.

**Acción requerida:**
1. Acceder al portal carrier en TEST.
2. Ir al perfil del pasajero Emanuel Restrepo.
3. Usar `POST /carriers/{carrierId}/paymentMethodsByPax` con el payload de vinculación.
4. Alternativamente: vincular desde la App Pax (Billetera → Agregar tarjeta → `4000 0025 0000 3155`).
5. Verificar en `GET /pax/wallet` que el `last4: 3155` aparece.

**Número de tarjeta:** `4000 0025 0000 3155` — Stripe Test — 3DS requerido (éxito al aprobar).

---

## TC1096 — Cargo a Bordo Colaborador: `limitExceeded`

**Test afectado:** `gateway-pg.smoke.spec.ts` — `[TS-STRIPE-TC1096]` (SMOKE-GW-TC07)

**Síntoma:** La URL redirige a `?limitExceeded=false` al crear viaje con método "Cargo a Bordo" para el colaborador (smith, Emanuel) del cliente Contractor (fast car).

**Causa raíz:** El backend retorna `limitExceeded` cuando el método de pago "Cargo a Bordo / Tarjeta de Crédito" no está habilitado para el colaborador, o cuando se supera el límite diario configurado para ese método.

**Pasajero afectado:** `smith, Emanuel` — colaborador de fast car en TEST (`apiSearchQuery: 'smith'`).

**Acción requerida:**
1. Acceder al portal carrier en TEST (`https://apps-test.magiis.com/carrier`).
2. Ir a Configuración > Pasajeros > smith, Emanuel.
3. Verificar que el método "Cargo a Bordo / Tarjeta de Crédito" esté habilitado.
4. Si existe límite diario, verificar que no haya sido consumido (o resetearlo).
5. Alternativamente: consultar `GET /carriers/{carrierId}/passengers/{passengerId}` para ver `paymentMethods`.

**Tarjeta involucrada:** Ninguna (Cargo a Bordo = cobro desde Driver App al finalizar viaje).

---

## TC1111 — Cargo a Bordo Empresa Individuo: `limitExceeded`

**Test afectado:** `gateway-pg.smoke.spec.ts` — `[TS-STRIPE-TC1111]` (SMOKE-GW-TC09)

**Síntoma:** La URL redirige a `?limitExceeded=false` al crear viaje con método "Cargo a Bordo" para el cliente empresa individuo (Marcelle Stripe).

**Causa raíz:** El backend retorna `limitExceeded` cuando el método de pago "Cargo a Bordo / Tarjeta de Crédito" no está habilitado para el pasajero empresa individuo, o cuando se supera el límite diario.

**Pasajero afectado:** `Marcelle Stripe` — cliente individuo/empresa en TEST (`apiSearchQuery: 'marce'`, `passengerId: 4951`).

**Acción requerida:**
1. Acceder al portal carrier en TEST (`https://apps-test.magiis.com/carrier`).
2. Ir a Configuración > Pasajeros > Marcelle Stripe.
3. Verificar que el método "Cargo a Bordo / Tarjeta de Crédito" esté habilitado.
4. Si existe límite diario, verificar que no haya sido consumido (o resetearlo).
5. Alternativamente: consultar `GET /carriers/{carrierId}/passengers/4951` para ver `paymentMethods`.

**Tarjeta involucrada:** Ninguna (Cargo a Bordo = cobro desde Driver App al finalizar viaje).

---

## Estado actual (2026-04-19)

| TC | Pasajero | Bloqueo | Acción | Responsable |
|---|---|---|---|---|
| TC1081 | Emanuel Restrepo (appPax) | Cargo a Bordo no habilitado / límite diario | Habilitar método o resetear límite en TEST | Equipo QA / Backend |
| TC1092 | Emanuel Restrepo (appPax) | Tarjeta 3DS no vinculada al appPax | Vincular tarjeta desde portal o App Pax | Equipo QA |
| TC1096 | smith, Emanuel (colaborador) | Cargo a Bordo no habilitado / límite diario | Habilitar método o resetear límite en TEST | Equipo QA / Backend |
| TC1111 | Marcelle Stripe (empresa individuo) | Cargo a Bordo no habilitado / límite diario | Habilitar método o resetear límite en TEST | Equipo QA / Backend |
