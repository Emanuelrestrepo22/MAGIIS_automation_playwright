# Pares resueltos — Fase 2

> **Fase:** 2 (critical-flow-prioritizer)
> **Fecha:** 2026-04-16
> **Input:** `docs/gateway-pg/stripe/duplicados-detectados.md` (52 pares) + `normalized-test-cases.json` (219 casos)
> **Output ejecutable:** `docs/gateway-pg/stripe/normalized-test-cases.json` (actualizado in-place)
> **Handoff:** Fase 3 — script de regeneración xlsx

## Leyenda de decisión

- `diferenciar-new-existing` — el canónico conserva su ID pero describe "Vincular tarjeta nueva". El derivado mantiene su ID numérico y se convierte en la variante "Usar tarjeta vinculada existente" (alias `<canónico>-CARD-EXISTING`).
- `deprecar-redundante` — copia sin valor incremental. Marcado `phase2_status: deprecated-redundant` y referenciado al canónico.
- `colapsar-alias` — alias RV previos. Marcados `phase2_status: collapsed-alias`; no se ejecutan por separado.
- `no-es-duplicado-documentar` — caso que pese al match de título NO representa duplicación; se preserva con nota explícita.

## Terminología crítica

- **Vincular tarjeta nueva** → ejecutar `PassengerWalletScreen.tapAddCard() + fillCardForm() + saveCard()`.
- **Usar tarjeta vinculada existente** → ejecutar `PassengerWalletScreen.selectExistingCard(last4)`.
- Nunca usar "vincular" sin "tarjeta"; el concepto "vincular pasarela Stripe" (setup en Magiis App Store, sección 1) es distinto y se conserva.

---

## Tabla de resolución — Pares de contenido (A)

| Par # | ID canónico | ID derivado | Decisión | Nueva descripción canónico | Nueva descripción derivado | Prioridad |
|---|---|---|---|---|---|---|
| 1 | TS-STRIPE-TC1017 | TS-STRIPE-TC1019 | diferenciar-new-existing | Alta de Viaje desde app pax modo business con Hold desde Alta y Cobro desde App Driver — Vincular tarjeta nueva | Alta de Viaje desde app pax modo business con Hold desde Alta y Cobro desde App Driver — Usar tarjeta vinculada existente | P1 / P1 |
| 2 | TS-STRIPE-TC1017 | TS-STRIPE-TC1025 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1017 / TC1019 | P3 |
| 3 | TS-STRIPE-TC1017 | TS-STRIPE-TC1027 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1017 / TC1019 | P3 |
| 4 | TS-STRIPE-TC1018 | TS-STRIPE-TC1020 | diferenciar-new-existing | Alta de Viaje desde app pax modo business sin Hold en Alta, Cobro desde App Driver — Vincular tarjeta nueva | Alta de Viaje desde app pax modo business sin Hold en Alta, Cobro desde App Driver — Usar tarjeta vinculada existente | P2 / P2 |
| 5 | TS-STRIPE-TC1018 | TS-STRIPE-TC1026 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1018 / TC1020 | P3 |
| 6 | TS-STRIPE-TC1018 | TS-STRIPE-TC1028 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1018 / TC1020 | P3 |
| 7 | TS-STRIPE-TC1021 | TS-STRIPE-TC1023 | diferenciar-new-existing | Alta de Viaje app pax business 3DS Hold — Vincular tarjeta nueva | Alta de Viaje app pax business 3DS Hold — Usar tarjeta vinculada existente | P1 / P1 |
| 8 | TS-STRIPE-TC1021 | TS-STRIPE-TC1029 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1021 / TC1023 | P3 |
| 9 | TS-STRIPE-TC1021 | TS-STRIPE-TC1031 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1021 / TC1023 | P3 |
| 10 | TS-STRIPE-TC1022 | TS-STRIPE-TC1024 | diferenciar-new-existing | Alta de Viaje app pax business 3DS sin Hold — Vincular tarjeta nueva | Alta de Viaje app pax business 3DS sin Hold — Usar tarjeta vinculada existente | P1 / P1 |
| 11 | TS-STRIPE-TC1022 | TS-STRIPE-TC1030 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1022 / TC1024 | P3 |
| 12 | TS-STRIPE-TC1022 | TS-STRIPE-TC1032 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1022 / TC1024 | P3 |
| 13 | TS-STRIPE-TC1034 | TS-STRIPE-TC1036 | diferenciar-new-existing | Alta de Viaje carrier colaborador sin Hold — Vincular tarjeta nueva | Alta de Viaje carrier colaborador sin Hold — Usar tarjeta vinculada existente | P2 / P2 |
| 14 | TS-STRIPE-TC1034 | TS-STRIPE-TC1042 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1034 / TC1036 | P3 |
| 15 | TS-STRIPE-TC1034 | TS-STRIPE-TC1044 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1034 / TC1036 | P3 |
| 16 | TS-STRIPE-TC1035 | TS-STRIPE-TC1041 | diferenciar-new-existing | Alta de Viaje carrier colaborador Hold — Vincular tarjeta nueva | Alta de Viaje carrier colaborador Hold — Usar tarjeta vinculada existente | P1 / P1 |
| 17 | TS-STRIPE-TC1035 | TS-STRIPE-TC1043 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1035 / TC1041 | P3 |
| 18 | TS-STRIPE-TC1037 | TS-STRIPE-TC1045 | diferenciar-new-existing | Alta de Viaje carrier colaborador 3DS Hold — Vincular tarjeta nueva | Alta de Viaje carrier colaborador 3DS Hold — Usar tarjeta vinculada existente | P1 / P1 |
| 19 | TS-STRIPE-TC1037 | TS-STRIPE-TC1047 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1037 / TC1045 | P3 |
| 20 | TS-STRIPE-TC1038 | TS-STRIPE-TC1040 | diferenciar-new-existing | Alta de Viaje carrier colaborador 3DS sin Hold — Vincular tarjeta nueva | Alta de Viaje carrier colaborador 3DS sin Hold — Usar tarjeta vinculada existente | P1 / P1 |
| 21 | TS-STRIPE-TC1038 | TS-STRIPE-TC1046 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1038 / TC1040 | P3 |
| 22 | TS-STRIPE-TC1038 | TS-STRIPE-TC1048 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1038 / TC1040 | P3 |
| 23 | TS-STRIPE-TC1065 | TS-STRIPE-TC1067 | diferenciar-new-existing | Alta de Viaje carrier empresa Hold — Vincular tarjeta nueva | Alta de Viaje carrier empresa Hold — Usar tarjeta vinculada existente | P2 / P2 |
| 24 | TS-STRIPE-TC1065 | TS-STRIPE-TC1073 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1065 / TC1067 | P3 |
| 25 | TS-STRIPE-TC1065 | TS-STRIPE-TC1075 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1065 / TC1067 | P3 |
| 26 | TS-STRIPE-TC1066 | TS-STRIPE-TC1068 | diferenciar-new-existing | Alta de Viaje carrier empresa sin Hold — Vincular tarjeta nueva | Alta de Viaje carrier empresa sin Hold — Usar tarjeta vinculada existente | P2 / P2 |
| 27 | TS-STRIPE-TC1066 | TS-STRIPE-TC1074 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1066 / TC1068 | P3 |
| 28 | TS-STRIPE-TC1066 | TS-STRIPE-TC1076 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1066 / TC1068 | P3 |
| 29 | TS-STRIPE-TC1069 | TS-STRIPE-TC1071 | diferenciar-new-existing | Alta de Viaje carrier empresa 3DS Hold — Vincular tarjeta nueva | Alta de Viaje carrier empresa 3DS Hold — Usar tarjeta vinculada existente | P2 / P2 |
| 30 | TS-STRIPE-TC1069 | TS-STRIPE-TC1077 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1069 / TC1071 | P3 |
| 31 | TS-STRIPE-TC1069 | TS-STRIPE-TC1079 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1069 / TC1071 | P3 |
| 32 | TS-STRIPE-TC1070 | TS-STRIPE-TC1072 | diferenciar-new-existing | Alta de Viaje carrier empresa 3DS sin Hold — Vincular tarjeta nueva | Alta de Viaje carrier empresa 3DS sin Hold — Usar tarjeta vinculada existente | P2 / P2 |
| 33 | TS-STRIPE-TC1070 | TS-STRIPE-TC1078 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1070 / TC1072 | P3 |
| 34 | TS-STRIPE-TC1070 | TS-STRIPE-TC1080 | deprecar-redundante | (sin cambio) | DEPRECADO — duplicado de TC1070 / TC1072 | P3 |
| 35 | TS-STRIPE-P2-TC060 | TS-STRIPE-P2-TC062 | diferenciar-new-existing | Reactivación empresa Hold — Vincular tarjeta nueva | Reactivación empresa Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 36 | TS-STRIPE-P2-TC061 | TS-STRIPE-P2-TC063 | diferenciar-new-existing | Reactivación empresa sin Hold — Vincular tarjeta nueva | Reactivación empresa sin Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 37 | TS-STRIPE-P2-TC066 | TS-STRIPE-P2-TC068 | diferenciar-new-existing | Clonación cancelado Hold — Vincular tarjeta nueva | Clonación cancelado Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 38 | TS-STRIPE-P2-TC067 | TS-STRIPE-P2-TC069 | diferenciar-new-existing | Clonación cancelado sin Hold — Vincular tarjeta nueva | Clonación cancelado sin Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 39 | TS-STRIPE-P2-TC072 | TS-STRIPE-P2-TC074 | diferenciar-new-existing | Clonación finalizado Hold — Vincular tarjeta nueva | Clonación finalizado Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 40 | TS-STRIPE-P2-TC073 | TS-STRIPE-P2-TC075 | diferenciar-new-existing | Clonación finalizado sin Hold — Vincular tarjeta nueva | Clonación finalizado sin Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 41 | TS-STRIPE-P2-TC078 | TS-STRIPE-P2-TC080 | diferenciar-new-existing | Edición Hold — Vincular tarjeta nueva | Edición Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 42 | TS-STRIPE-P2-TC079 | TS-STRIPE-P2-TC081 | diferenciar-new-existing | Edición sin Hold — Vincular tarjeta nueva | Edición sin Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 43 | TS-STRIPE-P2-TC084 | TS-STRIPE-P2-TC086 | diferenciar-new-existing | Edición conflicto Hold — Vincular tarjeta nueva | Edición conflicto Hold — Usar tarjeta vinculada existente | P3 / P3 |
| 44 | TS-STRIPE-P2-TC085 | TS-STRIPE-P2-TC087 | diferenciar-new-existing | Edición conflicto sin Hold — Vincular tarjeta nueva | Edición conflicto sin Hold — Usar tarjeta vinculada existente | P3 / P3 |

## Tabla de resolución — Alias RV (B)

| Par # | ID canónico | ID derivado (RV) | Decisión | Nota |
|---|---|---|---|---|
| 45 | TS-STRIPE-TC1017 | TS-STRIPE-TC-RV001 | colapsar-alias | Alias. No ejecutar; cobertura vive en TC1017 (modo business — CARD-NEW). |
| 46 | TS-STRIPE-TC1018 | TS-STRIPE-TC-RV002 | colapsar-alias | Alias. No ejecutar; cobertura vive en TC1018 (modo business — CARD-NEW sin Hold). |
| 47 | TS-STRIPE-TC1011 | TS-STRIPE-TC-RV003 | colapsar-alias | Alias. No ejecutar. |
| 48 | TS-STRIPE-TC1012 | TS-STRIPE-TC-RV004 | colapsar-alias | Alias. No ejecutar. |
| 49 | TS-STRIPE-TC1013 | TS-STRIPE-TC-RV005 | colapsar-alias | Alias. No ejecutar. |
| 50 | TS-STRIPE-TC1014 | TS-STRIPE-TC-RV006 | colapsar-alias | Alias. No ejecutar. |
| 51 | TS-STRIPE-TC1015 | TS-STRIPE-TC-RV007 | colapsar-alias | Alias. No ejecutar. |
| 52 | TS-STRIPE-TC1016 | TS-STRIPE-TC-RV008 | colapsar-alias | Alias. No ejecutar. |

## Distribución de decisiones

| Decisión | Cantidad |
|---|---|
| diferenciar-new-existing | 22 canónicos + 22 existing = 44 TCs activos |
| deprecar-redundante | 22 |
| colapsar-alias | 8 |
| no-es-duplicado-documentar | 0 |
| **Total pares procesados** | **52** |

## Nuevos IDs creados (alias canónico `-CARD-EXISTING`)

Los derivados que antes eran duplicados ahora son variantes CARD-EXISTING con **dos IDs referenciables**: el original (para trazabilidad con la matriz antigua) y el alias normalizado.

| ID original (conservado) | Alias CARD-EXISTING normalizado | Canónico CARD-NEW |
|---|---|---|
| TS-STRIPE-TC1019 | TS-STRIPE-TC1017-CARD-EXISTING | TS-STRIPE-TC1017 |
| TS-STRIPE-TC1020 | TS-STRIPE-TC1018-CARD-EXISTING | TS-STRIPE-TC1018 |
| TS-STRIPE-TC1023 | TS-STRIPE-TC1021-CARD-EXISTING | TS-STRIPE-TC1021 |
| TS-STRIPE-TC1024 | TS-STRIPE-TC1022-CARD-EXISTING | TS-STRIPE-TC1022 |
| TS-STRIPE-TC1036 | TS-STRIPE-TC1034-CARD-EXISTING | TS-STRIPE-TC1034 |
| TS-STRIPE-TC1041 | TS-STRIPE-TC1035-CARD-EXISTING | TS-STRIPE-TC1035 |
| TS-STRIPE-TC1045 | TS-STRIPE-TC1037-CARD-EXISTING | TS-STRIPE-TC1037 |
| TS-STRIPE-TC1040 | TS-STRIPE-TC1038-CARD-EXISTING | TS-STRIPE-TC1038 |
| TS-STRIPE-TC1067 | TS-STRIPE-TC1065-CARD-EXISTING | TS-STRIPE-TC1065 |
| TS-STRIPE-TC1068 | TS-STRIPE-TC1066-CARD-EXISTING | TS-STRIPE-TC1066 |
| TS-STRIPE-TC1071 | TS-STRIPE-TC1069-CARD-EXISTING | TS-STRIPE-TC1069 |
| TS-STRIPE-TC1072 | TS-STRIPE-TC1070-CARD-EXISTING | TS-STRIPE-TC1070 |
| TS-STRIPE-P2-TC062 | TS-STRIPE-P2-TC060-CARD-EXISTING | TS-STRIPE-P2-TC060 |
| TS-STRIPE-P2-TC063 | TS-STRIPE-P2-TC061-CARD-EXISTING | TS-STRIPE-P2-TC061 |
| TS-STRIPE-P2-TC068 | TS-STRIPE-P2-TC066-CARD-EXISTING | TS-STRIPE-P2-TC066 |
| TS-STRIPE-P2-TC069 | TS-STRIPE-P2-TC067-CARD-EXISTING | TS-STRIPE-P2-TC067 |
| TS-STRIPE-P2-TC074 | TS-STRIPE-P2-TC072-CARD-EXISTING | TS-STRIPE-P2-TC072 |
| TS-STRIPE-P2-TC075 | TS-STRIPE-P2-TC073-CARD-EXISTING | TS-STRIPE-P2-TC073 |
| TS-STRIPE-P2-TC080 | TS-STRIPE-P2-TC078-CARD-EXISTING | TS-STRIPE-P2-TC078 |
| TS-STRIPE-P2-TC081 | TS-STRIPE-P2-TC079-CARD-EXISTING | TS-STRIPE-P2-TC079 |
| TS-STRIPE-P2-TC086 | TS-STRIPE-P2-TC084-CARD-EXISTING | TS-STRIPE-P2-TC084 |
| TS-STRIPE-P2-TC087 | TS-STRIPE-P2-TC085-CARD-EXISTING | TS-STRIPE-P2-TC085 |

## Casos deprecados (no ejecutar)

Los siguientes 22 IDs quedan marcados `phase2_status: deprecated-redundant`. Fase 3 debe eliminarlos o marcarlos en la xlsx como "deprecado".

TC1025, TC1027, TC1026, TC1028, TC1029, TC1031, TC1030, TC1032, TC1042, TC1044, TC1043, TC1047, TC1046, TC1048, TC1073, TC1075, TC1074, TC1076, TC1077, TC1079, TC1078, TC1080.

## Observaciones y flags para validación humana

- TC1033 (sección 4.1) se conserva como caso seed de "vincular tarjeta" (único explícito en la matriz); no participa del triplete.
- TC1039 (sección 4.2) es un caso **negativo específico** (fallo 3DS con cliente contractor + pasajero invitado); no se diferencia CARD-NEW/EXISTING; se conserva con `card_flow: n/a`.
- TC082, TC083, TC088, TC089 (secciones 10 y 11 de `matriz_cases2.md`) tienen descripción "Clonación" dentro de secciones de Edición — anomalía de redacción reportada a QA. Se preservan con flag y `card_flow: n/a` hasta validación.
- Sección 12 de `matriz_cases2.md` ("Re-validación 3DS Post Fallo") sigue pendiente de desarrollo; sin acción en Fase 2.

## Handoff a Fase 3 (script xlsx)

1. **Leer** `docs/gateway-pg/stripe/normalized-test-cases.json` como fuente de verdad.
2. **Para cada caso `phase2_status: active-canonical`:** actualizar el título en la xlsx con el nuevo descriptor (ya trae el sufijo " — Vincular tarjeta nueva"). Setear prioridad del campo `priority`.
3. **Para cada caso `phase2_status: active-card-existing`:** actualizar título con " — Usar tarjeta vinculada existente" y agregar una columna/metadato "Alias CARD-EXISTING" con el valor de `card_existing_alias_id`.
4. **Para cada caso `phase2_status: deprecated-redundant`:** marcar en la xlsx como DEPRECADO (prefijo `[DEPR]` en título + celda de estado), conservando la fila para trazabilidad histórica. Referenciar `canonical_ref`.
5. **Para cada caso `phase2_status: collapsed-alias` (RV*):** marcar como "Alias trazabilidad" con `canonical_ref` visible; no ejecutable.
6. **Regenerar TABLA DE DECISIONES** en `docs/gateway-pg/stripe/ARCHITECTURE.md` si existe sección derivada de la matriz.
7. **No tocar** los 145 casos no impactados (campo `phase2_status` ausente).
