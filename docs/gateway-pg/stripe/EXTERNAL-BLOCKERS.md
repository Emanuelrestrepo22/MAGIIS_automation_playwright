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
4. Alternativamente: consultar `GET /carriers/{carrierId}/passengers/{passengerId}` para ver `paymentMethods`.

**Nota (2026-04-20):** En UI el tipo de servicio "Regular" muestra límite ilimitado. No existe botón UI ni endpoint público para resetear uso acumulado en pasajeros AppPax. Si el síntoma persiste con contador acumulado, requiere intervención directa en DB/backend por admin.

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
| TC1081 | Cargo a Bordo AppPax `limitExceeded=false` sin endpoint público | Intervención DB/backend si se dispara | Backend |
| TC1092 | Tarjeta 3DS no vinculada al appPax | Vincular tarjeta desde portal o App Pax | Equipo QA |
| TC1096 | Uso acumulado colaborador Regular | **Automatizado** via helper resetCollaboratorServiceUsage | — |
| TC1111 | Potencial `limitExceeded=false` Marcelle Stripe | Validación pendiente + intervención DB si aplica | Equipo QA |
