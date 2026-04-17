r# Test Suite – Stripe · Parte 2: Portal Contractor, Quote, Recurrentes y Operaciones de Viaje

> **Proyecto:** Automatización de pruebas – Integración Stripe (Playwright / Appium)
> **Alcance:** Portal Contractor · Flujos Quote · Viajes Recurrentes · Reactivación · Clonación · Edición

---

## 1. Portal Contractor – Alta de Tarjetas y Vinculación

### 1.1 Colaborador de Contractor – Tarjeta Preautorizada sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC001 | Validar vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC002 | Validar vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC003 | Validar selección de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC004 | Validar selección de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 1.2 Colaborador de Contractor – Tarjeta Preautorizada con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC005 | Validar vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC006 | Validar vinculación de tarjeta y Alta de Viaje desde app pax para usuario colaborador de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 2. Flujo Quote – Alta de Viaje

### 2.1 Usuario sin datos filiatorios (vinculado a pasajero existente)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC007 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC008 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC009 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC010 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.2 Colaborador – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC011 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC012 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC013 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC014 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.3 Colaborador – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC015 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC016 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC017 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC018 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

### 2.4 App Pax – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC019 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC020 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC021 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC022 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.5 App Pax – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC023 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC024 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC025 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC026 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario app pax existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

### 2.6 Empresa Individuo – sin 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC027 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC028 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC029 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC030 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.7 Empresa Individuo – con 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC031 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC032 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC033 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3D Secure |
| TS-STRIPE-P2-TC034 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3D Secure |

---

## 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC035 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC036 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC037 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC038 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC039 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC040 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC041 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC042 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC043 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC044 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC045 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC046 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC047 ⚠️ | Validar vinculación y alta de viaje Recurrente desde carrier para usuario colaborador con tarjeta preautorizada y **edición de fechas** – validar consistencia de datos y finalización desde App Driver (**CASO CRÍTICO**) |

---

## 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC048 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC049 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC050 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC051 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC052 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC053 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC054 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC055 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC056 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC057 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC058 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC059 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC060 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC061 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC062 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC063 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC064 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC065 | Validar Reactivación de viaje cancelado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC066 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC067 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC068 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC069 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC070 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC071 | Validar Clonación de viaje cancelado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC072 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC073 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC074 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC075 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC076 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC077 | Validar Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC078 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC079 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC080 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC081 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC082 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC083 | Validar Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo)

> **Precondiciones:** Fallo de validación 3D Secure u otra variable como saldo insuficiente impiden el hold. Incluye hold con 3D Secure, o tarjeta bloqueada/sin fondos al momento del cobro.

| ID | Descripción |
|----|-------------|
| TS-STRIPE-P2-TC084 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC085 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC086 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC087 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-P2-TC088 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-P2-TC089 | Validar Clonación de viaje finalizado para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 12. Re-validación 3DS Post Fallo

> **Sección pendiente de desarrollo** — casos por definir.

---

*Documento generado a partir del archivo fuente: `TEST_SUITE2.0_matrix parte 2 para Stripe.txt`*
*Fecha: 2026-04-08 | Automatización: Playwright / Appium*