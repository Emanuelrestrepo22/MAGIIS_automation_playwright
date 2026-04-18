# TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT — App bloquea alta de viaje si pax tiene viaje activo o en conflicto

| Campo | Valor |
| --- | --- |
| **ID** | TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT |
| **Feature** | PASSENGER / New Trip / Concurrency guard |
| **Módulo** | `new-trip` |
| **Portal** | App Pax (Android) |
| **Ambiente** | TEST |
| **Tipo** | Negativo / borde |
| **Prioridad** | P1 |
| **Flujo crítico** | Sí — regla de negocio dura |
| **Estado** | Validado manualmente 2026-04-17 |

---

## User story
**Como** passenger
**Cuando** intento crear un viaje teniendo otro ya en curso o en conflicto no autorizado
**Debo** ver un mensaje claro que me bloquee la creación
**Para** evitar duplicados y cobros indebidos.

## Caso de uso
UC-PAX-TRIP-CREATE-BLOCKED-CONCURRENT

## Precondiciones
1. Passenger logueado.
2. Tarjeta vinculada en Billetera.
3. Al menos una de estas condiciones en backend:
   - **Condición A**: Existe viaje del pax en estado `SEARCHING_DRIVER` (pestaña "Por asignar" en Carrier).
   - **Condición B**: Existe viaje del pax en estado `EN_CURSO` / `ACCEPTED` (Carrier).
   - **Condición C**: Existe viaje del pax en pestaña **"En conflicto"** con estado `NO_AUTORIZADO` (hold Stripe falló o 3DS no completado).

## Datos de prueba
| Campo | Valor |
| --- | --- |
| Tarjeta | Cualquiera vinculada |
| Origen / Destino | Cualquier par válido |
| Viaje previo | 1+ viaje del mismo user en cualquiera de las 3 condiciones |

## Pasos

| # | Acción | Resultado esperado | Selector canónico |
| --- | --- | --- | --- |
| 1 | Asegurar precondición: carrier muestra al menos 1 viaje del pax en `Por asignar`, `En curso` o `En conflicto-NO_AUTORIZADO` | Evidencia en carrier | N/A (backend) |
| 2 | En app Pax, llenar Origen + Destino | `app-travel-info` con estimaciones | `app-travel-info.ion-page` |
| 3 | Tap **Viajo Ahora Standard - $precio** | Aparece modal bloqueante | `button.travel-btn-confirm` |
| 4 | Capturar modal de bloqueo | Modal `app-confirm-modal` con título `Ya tiene un viaje creado` y CTA `Aceptar` | `app-confirm-modal.ion-page`; `span:"Ya tiene un viaje creado"`; `button.btn.primary` texto `Aceptar` |
| 5 | Tap **Aceptar** | Modal cierra, user vuelve a `app-travel-info` con datos intactos (no pierde origen/destino/vehículo) | `app-travel-info.ion-page` visible, campos persistidos |
| 6 | Repetir tap **Viajo Ahora** sin limpiar precondición | Mismo modal aparece — bloqueo persistente | Igual selector |
| 7 | **Resolver precondición**: carrier cancela/borra viajes activos y del pax en "En conflicto" | Carrier muestra listas vacías para ese pax | N/A (backend) |
| 8 | Tap **Viajo Ahora Standard** nuevamente en app Pax | NO aparece el modal bloqueante; dispara popup 3DS Visa (si tarjeta 3DS) | — |
| 9 | Completar 3DS (COMPLETE) | Navega a `app-driver-available` con búsqueda de driver | `app-driver-available.ion-page` |

## Resultado esperado
- **Debería** mostrar modal `Ya tiene un viaje creado` cuando existe viaje previo en cualquiera de los 3 estados.
- **Debería** NO disparar ningún popup 3DS mientras haya bloqueo.
- **Debería** preservar origen, destino y selección de vehículo tras cerrar el modal de bloqueo.
- **Debería** NO llamar al backend de payment/hold mientras el bloqueo esté activo (sin cobros parciales).
- **Debería** permitir la creación apenas se resuelve la precondición (todos los viajes anteriores cerrados/cancelados/borrados).
- **Debería** tratar viajes `NO_AUTORIZADO` en "En conflicto" como bloqueantes igual que los activos.

## Resultado obtenido (ejecución 2026-04-17)
Reproducción confirmada. El bloqueo funciona también con viajes históricos en `NO_AUTORIZADO` — no solo con viajes activos. El modal se repite de forma consistente hasta que se limpia la condición.

## Evidencia
Ubicación: `evidence/manual-capture/pax-trip-hold-3ds/`

| Step | Archivo |
| --- | --- |
| Primera aparición del modal | `trip-step-05-after-viajo-ahora-2026-04-17T04-25-07-936Z.txt` |
| Tras cerrar modal, vuelve a travel-info | `trip-step-06-back-to-travel-info-2026-04-17T04-32-41-181Z.txt` |

## Observaciones
- La expresión "viaje creado" en el mensaje es engañosa: también aplica a viajes **viejos en `NO_AUTORIZADO`** (hold fallido). **Sugerir mejora UX**: distinguir entre "tiene un viaje activo" y "tiene un viaje no autorizado pendiente de limpieza" con CTA "Ver viaje" que lleve a Actividad.
- La app NO ofrece una forma directa de limpiar los viajes en conflicto desde el pax — requiere intervención desde Carrier o equivalente.
- **Posible bug reportable**: viajes `NO_AUTORIZADO` no deberían quedar bloqueando la experiencia pax indefinidamente; deberían auto-limpiarse o exponerse al pax para cancelar.

## Trazabilidad
- Bloquea el happy path: `TC-PAX-NEW-TRIP-HOLD-3DS.md`.
- Posible bug asociado: _(pendiente — abrir en Jira: "Viajes NO_AUTORIZADO históricos bloquean alta nueva sin CTA de limpieza para el pax")_
- Screens Appium: `PassengerNewTripScreen.ts` debe exponer `detectTripAlreadyCreatedModal()`.
- Estado backend a validar: endpoints que devuelven 409/400 tras conflicto, y estado `NO_AUTORIZADO` en DB.
