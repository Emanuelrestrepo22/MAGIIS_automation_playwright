r# Test Suite – Stripe · Parte 2: Portal Contractor, Quote, Recurrentes y Operaciones de Viaje

> **Proyecto:** Automatización de pruebas – Integración Stripe (Playwright / Appium)
> **Alcance:** Portal Contractor · Flujos Quote · Viajes Recurrentes · Reactivación · Clonación · Edición

---

## 1. Portal Contractor – Alta de Tarjetas y Vinculación

### 1.1 Colaborador de Contractor – Tarjeta Preautorizada sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC001 | E2E vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC002 | E2E vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC003 | E2E selección de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC004 | E2E selección de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 1.2 Colaborador de Contractor – Tarjeta Preautorizada con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC005 | E2E vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC006 | E2E vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 2. Flujo Quote – Alta de Viaje

### 2.1 Usuario sin datos filiatorios (vinculado a pasajero existente)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC007 | E2E Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC008 | E2E Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC009 | E2E Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC010 | E2E Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.2 Colaborador – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC011 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC012 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC013 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC014 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.3 Colaborador – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC015 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC016 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC017 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC018 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

### 2.4 App Pax – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC019 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC020 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC021 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC022 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.5 App Pax – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC023 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC024 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC025 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC026 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

### 2.6 Empresa Individuo – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC027 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC028 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC029 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC030 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.7 Empresa Individuo – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC031 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC032 | E2E Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC033 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC034 | E2E Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

---

## 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC035 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC036 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC037 | E2E selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC038 | E2E selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC039 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC040 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC041 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC042 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC043 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC044 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC045 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC046 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC047 ⚠️ | E2E vinculación y alta de viaje Recurrente desde carrier para usuario colaborador con tarjeta preautorizada y **edición de fechas** – validar consistencia de datos y finalización desde App Driver (**CASO CRÍTICO**) |

---

## 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC048 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC049 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC050 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC051 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC052 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC053 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC054 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC055 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC056 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC057 | E2E selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC058 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC059 | E2E vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC060 | E2E Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC061 | E2E Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC062 | E2E Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC063 | E2E Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC064 | E2E Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC065 | E2E Reactivación de viaje cancelado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC066 | E2E Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC067 | E2E Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC068 | E2E Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC069 | E2E Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC070 | E2E Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC071 | E2E Clonación de viaje cancelado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC072 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC073 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC074 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC075 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC076 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC077 | E2E Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC078 | E2E Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC079 | E2E Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC080 | E2E Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC081 | E2E Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC082 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC083 | E2E Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo)

> **Precondiciones:** Fallo de validación 3D Secure u otra variable como saldo insuficiente impiden el hold. Incluye hold con 3D Secure, o tarjeta bloqueada/sin fondos al momento del cobro.

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC084 | E2E Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC085 | E2E Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC086 | E2E Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC087 | E2E Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC088 | E2E Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC089 | E2E Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 12. Re-validación 3DS Post Fallo

> **Sección pendiente de desarrollo** — casos por definir.

---

*Documento generado a partir del archivo fuente: `TEST_SUITE2.0_matrix parte 2 para Stripe.txt`*
*Fecha: 2026-04-08 | Automatización: Playwright / Appium*