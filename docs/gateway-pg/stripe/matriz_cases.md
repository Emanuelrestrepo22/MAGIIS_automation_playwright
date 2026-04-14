# Test Suite – Stripe · Parte 1: Configuración de Pasarela y Alta de Viaje

> **Proyecto:** Automatización de pruebas – Integración Stripe (Playwright / Appium)
> **Alcance:** Configuración del gateway en Magiis App Store · Altas de viaje desde App Pax y Carrier
> **Nota:** Construir tabla de decisiones y particiones equivalentes en base a los flujos cubiertos por estos test cases.

---

## 1. Configuración de Pasarela Stripe (Magiis App Store)

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1001 | Validar visualizar pasarela Stripe en Magiis App Store y mostrar estado no vinculado antes de configurar credenciales |
| TS-STRIPE-TC1002 | Validar vincular pasarela Stripe desde Magiis App Store con credenciales válidas y reflejar estado vinculado en UI y DB |
| TS-STRIPE-TC1003 | Validar impedir vincular pasarela Stripe desde Magiis App Store con credenciales inválidas y mostrar error controlado sin activar el gateway |
| TS-STRIPE-TC1004 | Validar solicitar confirmación al desvincular pasarela Stripe y no ejecutar acción al cancelar el popup |
| TS-STRIPE-TC1005 | Validar desvincular pasarela Stripe y ocultar método tarjeta preautorizada en alta de viaje desde Carrier |
| TS-STRIPE-TC1006 | Validar exclusividad de pasarela activa e impedir vincular otro gateway mientras Stripe esté activo mostrando mensaje informativo |
| TS-STRIPE-TC1007 | Validar persistencia de estado vinculado de Stripe tras recargar página y navegar entre secciones de Carrier |
| TS-STRIPE-TC1008 | Validar que el request link y unlink de Stripe retorne status 200 y registre evento en logs o auditoría si aplica |

---

## 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal)

### 2.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1009 | E2E Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1010 | E2E Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1011 | E2E Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1012 | E2E Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 2.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1013 | E2E Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1014 | E2E Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1015 | E2E Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1016 | E2E Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

### 2.3 Variantes exploratorias (referenciadas a TC canónicos)

| ID | Descripción | TC Canónico |
|----|-------------|-------------|
| TS-STRIPE-TC-RV001 | E2E Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver | TS-STRIPE-TC1017 |
| TS-STRIPE-TC-RV002 | E2E Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver | TS-STRIPE-TC1018 |
| TS-STRIPE-TC-RV003 | E2E Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada Hold y Cobro desde App Driver | TS-STRIPE-TC1011 |
| TS-STRIPE-TC-RV004 | E2E Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver | TS-STRIPE-TC1012 |
| TS-STRIPE-TC-RV005 | E2E Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS | TS-STRIPE-TC1013 |
| TS-STRIPE-TC-RV006 | E2E Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS | TS-STRIPE-TC1014 |
| TS-STRIPE-TC-RV007 | E2E Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS | TS-STRIPE-TC1015 |
| TS-STRIPE-TC-RV008 | E2E Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS | TS-STRIPE-TC1016 |

---

## 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador)

### 3.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1017 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1018 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1019 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1020 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1025 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1026 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1027 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1028 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 3.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1021 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1022 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1023 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1024 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1029 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1030 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1031 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1032 | E2E Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor

### 4.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1033 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1034 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1035 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1036 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1041 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1042 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1043 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1044 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 4.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1037 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1038 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1039 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1040 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1045 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1046 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1047 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1048 | E2E Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 5. Alta de Viaje desde Carrier – Usuario App Pax

**Nota de trazabilidad y coverage:** los TCs TS-STRIPE-TC1049, TS-STRIPE-TC1050, TS-STRIPE-TC1051, TS-STRIPE-TC1052, TS-STRIPE-TC1057, TS-STRIPE-TC1058, TS-STRIPE-TC1059 y TS-STRIPE-TC1060 corresponden al bloque app pax carrier sin 3DS que hoy esta fallando. Para 3DS, `tests/test-5.spec.ts` se toma como recording de referencia de TS-STRIPE-TC1055, usando la tarjeta Stripe `4000002760003184` (alwaysAuthenticate) para forzar challenge en todas las transacciones. Las filas repetidas en esta seccion se conservan por trazabilidad historica y coverage, aunque varias variantes sean funcionalmente equivalentes.

### 5.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1049 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver |
| TS-STRIPE-TC1050 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver |
| TS-STRIPE-TC1051 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver |
| TS-STRIPE-TC1052 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver |
| TS-STRIPE-TC1057 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver |
| TS-STRIPE-TC1058 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver |
| TS-STRIPE-TC1059 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver |
| TS-STRIPE-TC1060 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver |

### 5.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1053 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1054 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1055 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1056 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1061 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1062 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1063 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validacion 3DS |
| TS-STRIPE-TC1064 | E2E Alta de Viaje desde carrier para usuario app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validacion 3DS |

**Agrupacion de variantes para coverage:**

| Grupo canonico | IDs | Estado de coverage | Nota |
|----|----|----|----|
| Hold sin 3DS | TS-STRIPE-TC1049, TS-STRIPE-TC1051, TS-STRIPE-TC1057, TS-STRIPE-TC1059 | Fallidos actuales / manual pending | Variantes equivalentes del mismo flujo base |
| Sin Hold sin 3DS | TS-STRIPE-TC1050, TS-STRIPE-TC1052, TS-STRIPE-TC1058, TS-STRIPE-TC1060 | Fallidos actuales / manual pending | Variantes equivalentes del mismo flujo base |
| Hold con 3DS | TS-STRIPE-TC1053, TS-STRIPE-TC1055, TS-STRIPE-TC1061, TS-STRIPE-TC1063 | Recording de referencia disponible | `tests/test-5.spec.ts` ancla TC1055 con `4000002760003184` |
| Sin Hold con 3DS | TS-STRIPE-TC1054, TS-STRIPE-TC1056, TS-STRIPE-TC1062, TS-STRIPE-TC1064 | Pendiente de validar con recording equivalente | Mantener trazabilidad al mismo patron de 3DS |

---

## 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo

### 6.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1065 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1066 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1067 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1068 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1073 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1074 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1075 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1076 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 6.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1069 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1070 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1071 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1072 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1077 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1078 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1079 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1080 | E2E Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier)

### 7.1 Escenarios de pago exitoso y rechazo genérico

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1081 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago exitoso** |
| TS-STRIPE-TC1082 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago rechazado genérico** |
| TS-STRIPE-TC1083 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **fondos insuficientes** |
| TS-STRIPE-TC1084 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1085 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **CVC incorrecto** |
| TS-STRIPE-TC1086 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta robada** |

### 7.2 Antifraude

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1087 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla comprobación CVC** (antifraude) |
| TS-STRIPE-TC1088 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **riesgo máximo** (antifraude) |
| TS-STRIPE-TC1089 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta siempre bloqueada** (antifraude) |
| TS-STRIPE-TC1090 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1091 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **dirección no disponible** (antifraude) |

### 7.3 Con validación 3D Secure

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1092 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago exitoso con 3D Secure obligatorio** |
| TS-STRIPE-TC1093 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago rechazado con 3D Secure obligatorio** |
| TS-STRIPE-TC1094 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **error con 3D Secure obligatorio** |
| TS-STRIPE-TC1095 | E2E Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla 3D Secure** |

---

## 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier)

### 8.1 Escenarios de pago exitoso y rechazo genérico

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1096 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago exitoso** |
| TS-STRIPE-TC1097 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago rechazado genérico** |
| TS-STRIPE-TC1098 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **fondos insuficientes** |
| TS-STRIPE-TC1099 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1100 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **CVC incorrecto** |
| TS-STRIPE-TC1101 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta robada** |

### 8.2 Antifraude

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1102 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla comprobación CVC** (antifraude) |
| TS-STRIPE-TC1103 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **riesgo máximo** (antifraude) |
| TS-STRIPE-TC1104 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta siempre bloqueada** (antifraude) |
| TS-STRIPE-TC1105 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1106 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **dirección no disponible** (antifraude) |

### 8.3 Con validación 3D Secure

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1107 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago exitoso con 3D Secure obligatorio** |
| TS-STRIPE-TC1108 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago rechazado con 3D Secure obligatorio** |
| TS-STRIPE-TC1109 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **error con 3D Secure obligatorio** |
| TS-STRIPE-TC1110 | E2E Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla 3D Secure** |

---

## 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier)

### 9.1 Escenarios de pago exitoso y rechazo genérico

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1111 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago exitoso** |
| TS-STRIPE-TC1112 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago rechazado genérico** |
| TS-STRIPE-TC1113 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **fondos insuficientes** |
| TS-STRIPE-TC1114 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1115 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **CVC incorrecto** |
| TS-STRIPE-TC1116 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta robada** |

### 9.2 Antifraude

| ID | Descripción |
|----|-------------|
| TS-STRIPE-TC1117 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **falla comprobación CVC** (antifraude) |
| TS-STRIPE-TC1118 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **riesgo máximo** (antifraude) |
| TS-STRIPE-TC1119 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta siempre bloqueada** (antifraude) |
| TS-STRIPE-TC1120 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1121 | E2E Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **dirección no disponible** (antifraude) |

> **Nota:** El ID TS-STRIPE-TC1122 queda pendiente de completar en el documento fuente.

---

*Documento generado a partir del archivo fuente: `TEST_SUITE_matriz de pruebas - stripe.txt`*
*Fecha: 2026-04-08 | Automatización: Playwright / Appium*
