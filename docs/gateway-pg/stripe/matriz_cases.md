# Test Suite – Stripe · Parte 1: Configuración de Pasarela y Alta de Viaje

> **Proyecto:** Automatización de pruebas – Integración Stripe (Playwright / Appium)
> **Alcance:** Configuración del gateway en Magiis App Store · Altas de viaje desde App Pax y Carrier
> **Nota:** Construir tabla de decisiones y particiones equivalentes en base a los flujos cubiertos por estos test cases.

---

## 1. Configuración de Pasarela Stripe (Magiis App Store)

| ID               | Descripción                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1001 | Validar visualizar pasarela Stripe en Magiis App Store y mostrar estado no vinculado antes de configurar credenciales                        |
| TS-STRIPE-TC1002 | Validar vincular pasarela Stripe desde Magiis App Store con credenciales válidas y reflejar estado vinculado en UI y DB                      |
| TS-STRIPE-TC1003 | Validar impedir vincular pasarela Stripe desde Magiis App Store con credenciales inválidas y mostrar error controlado sin activar el gateway |
| TS-STRIPE-TC1004 | Validar solicitar confirmación al desvincular pasarela Stripe y no ejecutar acción al cancelar el popup                                      |
| TS-STRIPE-TC1005 | Validar desvincular pasarela Stripe y ocultar método tarjeta preautorizada en alta de viaje desde Carrier                                    |
| TS-STRIPE-TC1006 | Validar exclusividad de pasarela activa e impedir vincular otro gateway mientras Stripe esté activo mostrando mensaje informativo            |
| TS-STRIPE-TC1007 | Validar persistencia de estado vinculado de Stripe tras recargar página y navegar entre secciones de Carrier                                 |
| TS-STRIPE-TC1008 | Validar que el request link y unlink de Stripe retorne status 200 y registre evento en logs o auditoría si aplica                            |

---

## 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal)

**Precondición común de App Pax:** antes de ejecutar cualquier flujo de personal, validar en `home` el label bajo el `ion-toggle`. Si muestra `Modo Personal`, el lane es personal. Si muestra `Compañía: <contractor name>`, el lane no corresponde a esta sección y debe cambiarse antes de continuar.

### 2.1 Tarjeta Preautorizada – sin validación 3DS

| ID               | Descripción                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1009 | Validar Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1010 | Validar Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1011 | Validar Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver           |
| TS-STRIPE-TC1012 | Validar Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver       |

### 2.2 Tarjeta Preautorizada – con validación 3DS

| ID               | Descripción                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1013 | Validar Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1014 | Validar Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1015 | Validar Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS                   |
| TS-STRIPE-TC1016 | Validar Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS       |

### 2.3 Variantes exploratorias (referenciadas a TC canónicos)

| ID                 | Descripción                                                                                                                                       | TC Canónico      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| TS-STRIPE-TC-RV001 | Validar Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver                        | TS-STRIPE-TC1017 |
| TS-STRIPE-TC-RV002 | Validar Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver                                  | TS-STRIPE-TC1018 |
| TS-STRIPE-TC-RV003 | Validar Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada Hold y Cobro desde App Driver                                      | TS-STRIPE-TC1011 |
| TS-STRIPE-TC-RV004 | Validar Alta carrier de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver                          | TS-STRIPE-TC1012 |
| TS-STRIPE-TC-RV005 | Validar Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS     | TS-STRIPE-TC1013 |
| TS-STRIPE-TC-RV006 | Validar Alta de Viaje para usuario app pax modo personal desde app pax con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS | TS-STRIPE-TC1014 |
| TS-STRIPE-TC-RV007 | Validar Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS                   | TS-STRIPE-TC1015 |
| TS-STRIPE-TC-RV008 | Validar Alta de Viaje para usuario app pax modo personal con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS               | TS-STRIPE-TC1016 |

### 2.4 Wallet - eliminación de tarjeta vinculada con 3D Secure

| ID               | Descripción                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1122 | Validar validar eliminar satisfactoriamente desde wallet tarjeta previamente vinculada con validación 3D Secure desde app pax modo personal |

**Nota de cobertura:** la tarjeta debe estar ya vinculada y visible en la wallet. La eliminación no dispara challenge 3DS; la clasificación se conserva por la precondición de la tarjeta.

---

## 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador)

**Precondición común de App Pax:** antes de ejecutar cualquier flujo de business / colaborador, validar en `home` el label bajo el `ion-toggle`. Si muestra `Compañía: <contractor name>`, el lane es business. Si muestra `Modo Personal`, el lane no corresponde a esta sección y debe cambiarse antes de continuar.

### 3.1 Tarjeta Preautorizada – sin validación 3DS

| ID               | Descripción                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1017 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1018 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1019 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1020 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1025 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1026 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1027 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1028 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 3.2 Tarjeta Preautorizada – con validación 3DS

| ID               | Descripción                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1021 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1022 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1023 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1024 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1029 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1030 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1031 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1032 | Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor

### 4.1 Tarjeta Preautorizada – sin validación 3DS

| ID               | Descripción                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1033 | validar vincular tarjeta y Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold(desde carrier) y Cobro** desde App Driver     |
| TS-STRIPE-TC1034 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1035 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1036 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1041 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1042 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1043 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1044 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 4.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
| -- | ----------- |
| TS-STRIPE-TC1037 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1038 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1039 | Validar que al crear viaje desde carrier con cliente contractor y pasajero app pax invitado usando tarjeta threeDSRequired con Hold ON, al fallar la autenticación 3DS se muestra pop-up de error y la URL permanece en el formulario de alta sin crear el viaje |
| TS-STRIPE-TC1040 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1045 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1046 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1047 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1048 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 5. Alta de Viaje desde Carrier – Usuario App Pax

### 5.1 Tarjeta Preautorizada – sin validación 3DS

| ID | Descripción |
| -- | ----------- |
| TS-STRIPE-TC1049 | Validar alta de viaje desde carrier para usuario app pax con tarjeta preautorizada exitosa (4242 4242 4242 4242) con Hold ON — viaje pasa a estado "Buscando conductor" y aparece en columna "Por asignar" sin presentar modal 3DS |
| TS-STRIPE-TC1050 | Validar alta de viaje desde carrier para usuario app pax con tarjeta preautorizada exitosa (4242 4242 4242 4242) con Hold OFF — viaje pasa a estado "Buscando conductor" sin retención de fondos previa |
| TS-STRIPE-TC1051 | Validar que en detalle del viaje aparece red flag "Validación 3DS pendiente" y botón "Reintentar autenticación" tras fallo de 3DS — usuario app pax, Hold ON, tarjeta fail3DS (4000 0000 0000 9235) — estado queda en "No autorizado" y viaje NO aparece en "Buscando conductor" |
| TS-STRIPE-TC1052 | Validar alta de viaje desde carrier para usuario app pax con tarjeta preautorizada exitosa (4242 4242 4242 4242) con Hold OFF — variante origen/destino alternativo |
| TS-STRIPE-TC1057 | Validar que al crear viaje desde carrier para usuario app pax con tarjeta fail3DS (4000 0000 0000 9235) y Hold ON se presenta modal 3DS, al fallar la autenticación aparece pop-up de error y el viaje queda en estado "No autorizado" sin pasar a "Por asignar" |
| TS-STRIPE-TC1058 | Validar alta de viaje desde carrier para usuario app pax con tarjeta preautorizada exitosa (4242 4242 4242 4242) con Hold OFF — variante set 2 |
| TS-STRIPE-TC1059 | Validar que no se permite alta de viaje desde carrier para usuario app pax al intentar vincular tarjeta con fondos insuficientes (4000 0000 0000 9995) con Hold ON — sistema muestra error de declinación y el viaje no se crea |
| TS-STRIPE-TC1060 | Validar alta de viaje desde carrier para usuario app pax con tarjeta preautorizada exitosa (4242 4242 4242 4242) con Hold OFF — variante set 2 alternativo |

### 5.2 Tarjeta Preautorizada – con validación 3DS

| ID | Descripción |
| -- | ----------- |
| TS-STRIPE-TC1053 | Validar alta de viaje desde carrier para usuario app pax con tarjeta success3DS (4000 0025 0000 3155) y Hold ON — modal 3DS se presenta, pasajero aprueba autenticación, viaje pasa a "Buscando conductor" |
| TS-STRIPE-TC1054 | Validar alta de viaje desde carrier para usuario app pax con tarjeta success3DS (4000 0025 0000 3155) y Hold OFF — modal 3DS se presenta, pasajero aprueba autenticación, viaje pasa a "Buscando conductor" sin retención previa |
| TS-STRIPE-TC1055 | Validar alta de viaje desde carrier para usuario app pax con tarjeta always_authenticate (4000 0027 6000 3184) y Hold ON — 3DS forzado en todas las transacciones, autenticación exitosa, viaje pasa a "Buscando conductor" |
| TS-STRIPE-TC1056 | Validar alta de viaje desde carrier para usuario app pax con tarjeta always_authenticate (4000 0027 6000 3184) y Hold OFF — 3DS forzado, autenticación exitosa, viaje activo sin hold |
| TS-STRIPE-TC1061 | Validar reintento exitoso de autenticación 3DS desde detalle del viaje — usuario app pax, Hold ON, fallo inicial con fail3DS (4000 0000 0000 9235), reintento exitoso con success3DS — viaje pasa a "Buscando conductor", red flag y botón "Reintentar" desaparecen |
| TS-STRIPE-TC1062 | Validar alta de viaje desde carrier para usuario app pax con tarjeta always_authenticate (4000 0027 6000 3184) y Hold OFF — variante set 2 |
| TS-STRIPE-TC1063 | Validar cambio a tarjeta vinculada existente desde detalle del viaje tras fallo 3DS — usuario app pax, Hold ON — selección de tarjeta guardada, reintento de hold exitoso, viaje pasa a "Buscando conductor" *(pendiente: requiere payment-method component en travel-detail)* |
| TS-STRIPE-TC1064 | Validar vinculación de tarjeta nueva desde detalle del viaje tras fallo 3DS — usuario app pax, Hold ON — nueva tarjeta success3DS (4000 0025 0000 3155), 3DS aprobado, viaje pasa a "Buscando conductor" *(pendiente: requiere flujo de vinculación en travel-detail)* |

---

## 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo

### 6.1 Tarjeta Preautorizada – sin validación 3DS

| ID               | Descripción                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TS-STRIPE-TC1065 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1066 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1067 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1068 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1073 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1074 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |
| TS-STRIPE-TC1075 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver     |
| TS-STRIPE-TC1076 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver |

### 6.2 Tarjeta Preautorizada – con validación 3DS

| ID               | Descripción                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1069 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1070 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1071 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1072 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1077 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1078 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |
| TS-STRIPE-TC1079 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **Hold y Cobro** desde App Driver con validación 3DS     |
| TS-STRIPE-TC1080 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada **sin Hold y Cobro** desde App Driver con validación 3DS |

---

## 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier)

### 7.1 Escenarios de pago exitoso y rechazo genérico

| ID               | Descripción                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1081 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago exitoso**                   |
| TS-STRIPE-TC1082 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago rechazado genérico**        |
| TS-STRIPE-TC1083 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **fondos insuficientes**           |
| TS-STRIPE-TC1084 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1085 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **CVC incorrecto**                 |
| TS-STRIPE-TC1086 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta robada**                 |

### 7.2 Antifraude

| ID               | Descripción                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TS-STRIPE-TC1087 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla comprobación CVC** (antifraude)                 |
| TS-STRIPE-TC1088 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **riesgo máximo** (antifraude)                          |
| TS-STRIPE-TC1089 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **tarjeta siempre bloqueada** (antifraude)              |
| TS-STRIPE-TC1090 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1091 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **dirección no disponible** (antifraude)                |

### 7.3 Con validación 3D Secure

| ID               | Descripción                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1092 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago exitoso con 3D Secure obligatorio**   |
| TS-STRIPE-TC1093 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **pago rechazado con 3D Secure obligatorio** |
| TS-STRIPE-TC1094 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **error con 3D Secure obligatorio**          |
| TS-STRIPE-TC1095 | Validar Alta de viaje desde carrier para usuario app pax – cargo a bordo – **falla 3D Secure**                          |

---

## 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier)

### 8.1 Escenarios de pago exitoso y rechazo genérico

| ID               | Descripción                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1096 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago exitoso**                   |
| TS-STRIPE-TC1097 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago rechazado genérico**        |
| TS-STRIPE-TC1098 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **fondos insuficientes**           |
| TS-STRIPE-TC1099 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1100 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **CVC incorrecto**                 |
| TS-STRIPE-TC1101 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta robada**                 |

### 8.2 Antifraude

| ID               | Descripción                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1102 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla comprobación CVC** (antifraude)                 |
| TS-STRIPE-TC1103 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **riesgo máximo** (antifraude)                          |
| TS-STRIPE-TC1104 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **tarjeta siempre bloqueada** (antifraude)              |
| TS-STRIPE-TC1105 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1106 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **dirección no disponible** (antifraude)                |

### 8.3 Con validación 3D Secure

| ID               | Descripción                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| TS-STRIPE-TC1107 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago exitoso con 3D Secure obligatorio**   |
| TS-STRIPE-TC1108 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **pago rechazado con 3D Secure obligatorio** |
| TS-STRIPE-TC1109 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **error con 3D Secure obligatorio**          |
| TS-STRIPE-TC1110 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – **falla 3D Secure**                          |

---

## 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier)

### 9.1 Escenarios de pago exitoso y rechazo genérico

| ID               | Descripción                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1111 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago exitoso**                   |
| TS-STRIPE-TC1112 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago rechazado genérico**        |
| TS-STRIPE-TC1113 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **fondos insuficientes**           |
| TS-STRIPE-TC1114 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta reportada como perdida** |
| TS-STRIPE-TC1115 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **CVC incorrecto**                 |
| TS-STRIPE-TC1116 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta robada**                 |

### 9.2 Antifraude

| ID               | Descripción                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TS-STRIPE-TC1117 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **falla comprobación CVC** (antifraude)                 |
| TS-STRIPE-TC1118 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **riesgo máximo** (antifraude)                          |
| TS-STRIPE-TC1119 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **tarjeta siempre bloqueada** (antifraude)              |
| TS-STRIPE-TC1120 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **falla código postal con riesgo elevado** (antifraude) |
| TS-STRIPE-TC1121 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **dirección no disponible** (antifraude)                |

> **Nota:** El ID TS-STRIPE-TC1122 queda asignado al caso DBTS-STRIPE-TC003 de eliminacion desde wallet de una tarjeta 3D Secure ya vinculada en App Pax modo personal. Si la wallet arranca vacia, el runner de ejecucion puede sembrar primero una tarjeta `always_authenticate` de prueba y luego eliminarla; la cobertura objetivo sigue siendo la eliminacion de una tarjeta 3DS ya enlazada.

---

*Documento generado a partir del archivo fuente: `TEST_SUITE_matriz de pruebas - stripe.txt`*
*Fecha: 2026-04-08 | Automatización: Playwright / Appium*
