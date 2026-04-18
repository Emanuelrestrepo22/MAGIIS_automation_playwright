# Auditoría de Coherencia · Matrices Stripe

**Fecha:** 2026-04-18  
**Rama:** `feature/ai-matriz-coherencia`  
**Fuentes auditadas:**
- `docs/gateway-pg/stripe/matriz_cases.md` (130 TCs)
- `docs/gateway-pg/stripe/matriz_cases2.md` (89 TCs)
- Total: **219 TCs**

## Resumen por clasificación

| Clasificación | Conteo |
|---|---|
| OK | 182 |
| MISMATCH | 3 |
| AMBIGUO | 0 |
| DEPRECATED-ALIAS | 30 |
| NECESITA-CONTEXTO | 4 |

**Leyenda:**

- **OK** — descripción coherente con título de sección.
- **MISMATCH** — descripción contradice sección (ej: sección dice 'desde App Pax' y descripción dice 'desde carrier').
- **AMBIGUO** — ambigüedad sobre card-flow (vincular tarjeta nueva vs usar existente). Ya diferenciada en Fase 2 con sufijos CARD-NEW / CARD-EXISTING.
- **DEPRECATED-ALIAS** — alias RV o TC marcado como `deprecated-redundant`. No se modifica (mantiene trazabilidad).
- **NECESITA-CONTEXTO** — requiere decisión humana (ej: TCs flag fuera-de-sección en Edición/Conflicto).

---

### matriz_cases.md

| TC ID | Sección | Subsección | Clasificación | Razón | Descripción propuesta |
|---|---|---|---|---|---|
| `TS-STRIPE-TC1001` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1002` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1003` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1004` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1005` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1006` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1007` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1008` | 1. Configuración de Pasarela Stripe (Magiis App Store) | — | OK | Sección de configuración de pasarela, descripción conforme. | — |
| `TS-STRIPE-TC1009` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1010` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1011` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – sin validación 3DS | MISMATCH | Sección dice 'desde App Pax / Modo Personal' pero descripción menciona: carrier | Validar Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **Hold desde Alta de Viaje y Cobro desde App Driver** |
| `TS-STRIPE-TC1012` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – sin validación 3DS | MISMATCH | Sección dice 'desde App Pax / Modo Personal' pero descripción menciona: carrier | Validar Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold desde Alta de Viaje, Cobro desde App Driver** |
| `TS-STRIPE-TC1013` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1014` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1015` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1016` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Tarjeta Preautorizada – con validación 3DS | MISMATCH | Sección dice 'desde App Pax / Modo Personal' pero descripción menciona: carrier | Validar Alta de Viaje desde app pax para usuario app pax modo personal con Tarjeta Preautorizada **sin Hold desde Alta de Viaje, Cobro desde App Driver** con validación 3DS |
| `TS-STRIPE-TC-RV001` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV002` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV003` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV004` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV005` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV006` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV007` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC-RV008` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Variantes exploratorias (alias colapsados a TC canónicos) | DEPRECATED-ALIAS | Alias colapsado (RV). Mantener como referencia cruzada. | — |
| `TS-STRIPE-TC1122` | 2. Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal) | Wallet - eliminación de tarjeta vinculada con 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1017` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1019` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1025` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1027` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1018` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1020` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1026` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1028` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1021` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1023` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1029` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1031` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1022` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1024` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1030` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1032` | 3. Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador) | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1033` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1035` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1041` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1043` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1034` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1036` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1042` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1044` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1037` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1045` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1047` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1039` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1038` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1040` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1046` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1048` | 4. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1049` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1050` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1051` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1052` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1057` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1058` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1059` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1060` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1053` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1054` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1055` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1056` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1061` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1062` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1063` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1064` | 5. Alta de Viaje desde Carrier – Usuario App Pax | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1065` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1067` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1073` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1075` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1066` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1068` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1074` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1076` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – sin validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1069` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1071` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1077` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1079` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1070` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1072` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1078` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1080` | 6. Alta de Viaje desde Carrier – Usuario Empresa Individuo | Tarjeta Preautorizada – con validación 3DS | DEPRECATED-ALIAS | Marcado como DEPRECADO en matriz. No requiere cambio. | — |
| `TS-STRIPE-TC1081` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1082` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1083` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1084` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1085` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1086` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1087` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1088` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1089` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1090` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1091` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1092` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1093` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1094` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1095` | 7. Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1096` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1097` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1098` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1099` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1100` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1101` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1102` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1103` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1104` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1105` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1106` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1107` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1108` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1109` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1110` | 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier) | Con validación 3D Secure | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1111` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1112` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1113` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1114` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1115` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1116` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Escenarios de pago exitoso y rechazo genérico | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1117` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1118` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1119` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1120` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Antifraude | OK | Coherente con sección. | — |
| `TS-STRIPE-TC1121` | 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier) | Antifraude | OK | Coherente con sección. | — |

---

### matriz_cases2.md

| TC ID | Sección | Subsección | Clasificación | Razón | Descripción propuesta |
|---|---|---|---|---|---|
| `TS-STRIPE-P2-TC001` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada sin 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC002` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada sin 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC003` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada sin 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC004` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada sin 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC005` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada con 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC006` | 1. Portal Contractor – Alta de Tarjetas y Vinculación | Colaborador de Contractor – Tarjeta Preautorizada con 3DS | OK | Coherente con sección (contractor + app pax business). | — |
| `TS-STRIPE-P2-TC007` | 2. Flujo Quote – Alta de Viaje | Usuario sin datos filiatorios (vinculado a pasajero existente) | OK | Coherente. | — |
| `TS-STRIPE-P2-TC008` | 2. Flujo Quote – Alta de Viaje | Usuario sin datos filiatorios (vinculado a pasajero existente) | OK | Coherente. | — |
| `TS-STRIPE-P2-TC009` | 2. Flujo Quote – Alta de Viaje | Usuario sin datos filiatorios (vinculado a pasajero existente) | OK | Coherente. | — |
| `TS-STRIPE-P2-TC010` | 2. Flujo Quote – Alta de Viaje | Usuario sin datos filiatorios (vinculado a pasajero existente) | OK | Coherente. | — |
| `TS-STRIPE-P2-TC011` | 2. Flujo Quote – Alta de Viaje | Colaborador – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC012` | 2. Flujo Quote – Alta de Viaje | Colaborador – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC013` | 2. Flujo Quote – Alta de Viaje | Colaborador – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC014` | 2. Flujo Quote – Alta de Viaje | Colaborador – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC015` | 2. Flujo Quote – Alta de Viaje | Colaborador – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC016` | 2. Flujo Quote – Alta de Viaje | Colaborador – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC017` | 2. Flujo Quote – Alta de Viaje | Colaborador – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC018` | 2. Flujo Quote – Alta de Viaje | Colaborador – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC019` | 2. Flujo Quote – Alta de Viaje | App Pax – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC020` | 2. Flujo Quote – Alta de Viaje | App Pax – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC021` | 2. Flujo Quote – Alta de Viaje | App Pax – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC022` | 2. Flujo Quote – Alta de Viaje | App Pax – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC023` | 2. Flujo Quote – Alta de Viaje | App Pax – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC024` | 2. Flujo Quote – Alta de Viaje | App Pax – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC025` | 2. Flujo Quote – Alta de Viaje | App Pax – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC026` | 2. Flujo Quote – Alta de Viaje | App Pax – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC027` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC028` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC029` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC030` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – sin 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC031` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC032` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC033` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC034` | 2. Flujo Quote – Alta de Viaje | Empresa Individuo – con 3DS | OK | Coherente. | — |
| `TS-STRIPE-P2-TC035` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC036` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC037` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC038` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC039` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC040` | 3. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC041` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC042` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC043` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC044` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC045` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC046` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC047` | 4. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC048` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC049` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC050` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC051` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC052` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC053` | 5. Viajes Recurrentes – Portal Carrier (Usuario App Pax) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC054` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC055` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC056` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC057` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC058` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC059` | 6. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC060` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC062` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC061` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC063` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC064` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC065` | 7. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC066` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC068` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC067` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC069` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC070` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC071` | 8. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC072` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC074` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC073` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC075` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC076` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC077` | 9. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC078` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC080` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC079` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC081` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC082` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | NECESITA-CONTEXTO | Sección 'Edición' con descripción 'Clonación' — flag fuera-de-sección ya documentado. | — |
| `TS-STRIPE-P2-TC083` | 10. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo) | — | NECESITA-CONTEXTO | Sección 'Edición' con descripción 'Clonación' — flag fuera-de-sección ya documentado. | — |
| `TS-STRIPE-P2-TC084` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC086` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC085` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC087` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | OK | Coherente. | — |
| `TS-STRIPE-P2-TC088` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | NECESITA-CONTEXTO | Sección 'Edición en conflicto' con descripción 'Clonación' — flag fuera-de-sección ya documentado. | — |
| `TS-STRIPE-P2-TC089` | 11. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo) | — | NECESITA-CONTEXTO | Sección 'Edición en conflicto' con descripción 'Clonación' — flag fuera-de-sección ya documentado. | — |
