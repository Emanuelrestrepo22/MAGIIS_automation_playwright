# Bloqueos externos — Suite Stripe Gateway PG

Estos bloqueos requieren acción humana en el ambiente TEST. No son bugs de automatización.

---

## TC1081 — Cargo a Bordo appPax: `limitExceeded` (RESUELTO — era bug del test)

**Estado (2026-04-20):** 🟢 **Resuelto — NO es un blocker externo.**

**Root cause real:** el spec `apppax-cargo-happy.spec.ts` tenía un guard misleading que interpretaba el redirect a `?limitExceeded=false` post-submit como un error del backend. En realidad, ese redirect es el **comportamiento normal del producto** para Cargo a Bordo con AppPax — el viaje se crea exitosamente, solo que la URL no redirige a `/travels/:id` sino que se queda en `/travel/create?limitExceeded=false`.

**Evidencia:**
- Recorder `tests/test-4.spec.ts` reproduce el mismo flow manual y termina en la misma URL sin ser error.
- Regla de negocio: tipo de servicio "Regular" es ilimitado por diseño; AppPax/empresa-individuo no tienen toggles de limitación (solo colaboradores).
- Cargo a Bordo no usa tarjeta ni formulario Stripe en carrier — el cobro y validación ocurren en Driver App.

**Fix aplicado:** reemplazar guard de URL por validación via `captureCreatedTravelId` (network interception del POST `/travels`). Aplicado a los 11 specs de Cargo a Bordo (apppax/contractor/empresa × happy/3ds/antifraud/declines).

**Rama:** `carrier/cargo-a-bordo-tc1081-fix`

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

## TC1096 — Cargo a Bordo colaborador: `limitExceeded=false`

**Test afectado:** `gateway-pg.smoke.spec.ts` — `[TS-STRIPE-TC1096] SMOKE-GW-TC07`

**Síntoma:** Alta de viaje con colaborador "smith, Emanuel" (fast car) y método "Cargo a Bordo" redirige a `?limitExceeded=false` en vez de crear el viaje.

**Causa raíz:** Contador de uso acumulado del colaborador sobre el tipo de servicio "Regular" llega a un valor que bloquea nuevos viajes. UI permite resetear vía botón "Reiniciar" en Clientes → Gestión Empresas → fast car → Colaboradores → [acciones] → confirmar Aceptar.

**Mitigación automática (desde 2026-04-20):** helper `resetCollaboratorServiceUsage` invoca el endpoint `DELETE /magiis-v0.2/contractorEmployees/{id}/serviceType/{sid}/delete` como precondition step en TC07. IDs canónicos:

- `contractorEmployeeId` de smith, Emanuel en TEST: `1881`
- `serviceTypeId` de "Regular" en TEST: `226`

**Acción manual (si helper falla):**

1. Portal carrier → Clientes → Gestión Empresas → fast car → Colaboradores
2. Fila de `emanuel.smith@yopmail.com` → botón reiniciar → Aceptar

---

## TC1111 — Cargo a Bordo empresa-individuo: sin mitigación automática

**Test afectado:** `gateway-pg.smoke.spec.ts` — `[TS-STRIPE-TC1111] SMOKE-GW-TC09`

**Síntoma:** Potencial redirección a `?limitExceeded=false` al crear viaje para Marcelle Stripe (empresa-individuo) con método "Cargo a Bordo".

**Diagnóstico (2026-04-20):** No hay botón "Reiniciar" en la ficha de empresa-individuo. No existe endpoint público equivalente al de colaboradores (`/contractorEmployees/:id/serviceType/:sid/delete`). Si el test falla con este síntoma, requiere intervención DB/backend por admin.

**Validación pendiente:** ejecutar smoke focalizado `pnpm run test:test:smoke -- -g TS-STRIPE-TC1111 --headed` para confirmar si el síntoma aparece con los datos actuales de Marcelle Stripe en TEST. Si pasa consistentemente, no se requiere mitigación.

---

## Estado actual (2026-04-20)

| TC | Bloqueo | Acción | Responsable |
|---|---|---|---|
| TC1081 | ~~Cargo a Bordo AppPax `limitExceeded=false`~~ | ✅ Resuelto 2026-04-20 — era bug del test, no blocker externo (MR `carrier/cargo-a-bordo-tc1081-fix`) | — |
| TC1092 | Tarjeta 3DS no vinculada al appPax | Vincular tarjeta desde portal o App Pax | Equipo QA |
| TC1096 | Uso acumulado colaborador Regular | **Automatizado** via helper resetCollaboratorServiceUsage | — |
| TC1111 | Potencial `limitExceeded=false` Marcelle Stripe | ✅ Validado PASS 2026-04-20 — sin mitigación requerida | — |
