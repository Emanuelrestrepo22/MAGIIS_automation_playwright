// Fase 2 — aplicar diferenciación card-new / card-existing y deprecaciones al JSON normalizado.
// Ejecutar con: node scripts/ai/phase2-apply-card-flow.mjs
import fs from 'node:fs';
import path from 'node:path';

const JSON_PATH = 'docs/gateway-pg/stripe/normalized-test-cases.json';

const raw = fs.readFileSync(JSON_PATH, 'utf8');
const data = JSON.parse(raw);

// Mapa de decisiones Fase 2.
// Cada entrada describe cómo debe quedar un caso tras la resolución:
//   - action: 'canonical-new'     → canónico, flujo "Vincular tarjeta nueva"
//   - action: 'existing-alias'    → derivado, flujo "Usar tarjeta vinculada existente"
//   - action: 'deprecate'         → duplicado redundante, no ejecutar
//   - action: 'collapse-alias'    → alias RV, no ejecutar (trazabilidad cruzada)
//   - titleSuffix: texto a anexar al título
//   - cardFlow: 'new' | 'existing' | 'n/a'
//   - priority: sobrescribe si viene
//   - canonicalRef: apunta al canónico (para existing, deprecate, collapse-alias)
//   - extraTags: tags adicionales

const decisions = {
  // ---- Sección 3.1 — App Pax business sin 3DS
  'TS-STRIPE-TC1017': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1019': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1017', existingAliasId: 'TS-STRIPE-TC1017-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1025': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1017' },
  'TS-STRIPE-TC1027': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1017' },
  'TS-STRIPE-TC1018': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1020': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1018', existingAliasId: 'TS-STRIPE-TC1018-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1026': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1018' },
  'TS-STRIPE-TC1028': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1018' },

  // ---- Sección 3.2 — App Pax business con 3DS
  'TS-STRIPE-TC1021': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1023': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1021', existingAliasId: 'TS-STRIPE-TC1021-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1029': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1021' },
  'TS-STRIPE-TC1031': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1021' },
  'TS-STRIPE-TC1022': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1024': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1022', existingAliasId: 'TS-STRIPE-TC1022-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1030': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1022' },
  'TS-STRIPE-TC1032': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1022' },

  // ---- Sección 4.1 — Carrier colaborador sin 3DS
  'TS-STRIPE-TC1035': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1041': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1035', existingAliasId: 'TS-STRIPE-TC1035-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1043': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1035' },
  'TS-STRIPE-TC1034': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1036': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1034', existingAliasId: 'TS-STRIPE-TC1034-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1042': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1034' },
  'TS-STRIPE-TC1044': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1034' },

  // ---- Sección 4.2 — Carrier colaborador con 3DS
  'TS-STRIPE-TC1037': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1045': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1037', existingAliasId: 'TS-STRIPE-TC1037-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1047': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1037' },
  'TS-STRIPE-TC1038': { action: 'canonical-new', priority: 'P1', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1040': { action: 'existing-alias', priority: 'P1', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1038', existingAliasId: 'TS-STRIPE-TC1038-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1046': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1038' },
  'TS-STRIPE-TC1048': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1038' },

  // ---- Sección 6.1 — Carrier empresa sin 3DS
  'TS-STRIPE-TC1065': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1067': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1065', existingAliasId: 'TS-STRIPE-TC1065-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1073': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1065' },
  'TS-STRIPE-TC1075': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1065' },
  'TS-STRIPE-TC1066': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1068': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1066', existingAliasId: 'TS-STRIPE-TC1066-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1074': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1066' },
  'TS-STRIPE-TC1076': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1066' },

  // ---- Sección 6.2 — Carrier empresa con 3DS
  'TS-STRIPE-TC1069': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1071': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1069', existingAliasId: 'TS-STRIPE-TC1069-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1077': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1069' },
  'TS-STRIPE-TC1079': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1069' },
  'TS-STRIPE-TC1070': { action: 'canonical-new', priority: 'P2', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-TC1072': { action: 'existing-alias', priority: 'P2', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-TC1070', existingAliasId: 'TS-STRIPE-TC1070-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-TC1078': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1070' },
  'TS-STRIPE-TC1080': { action: 'deprecate', canonicalRef: 'TS-STRIPE-TC1070' },

  // ---- Reactivación (matriz_cases2 sección 7)
  'TS-STRIPE-P2-TC060': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC062': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC060', existingAliasId: 'TS-STRIPE-P2-TC060-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-P2-TC061': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC063': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC061', existingAliasId: 'TS-STRIPE-P2-TC061-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },

  // ---- Clonación cancelado (sección 8)
  'TS-STRIPE-P2-TC066': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC068': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC066', existingAliasId: 'TS-STRIPE-P2-TC066-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-P2-TC067': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC069': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC067', existingAliasId: 'TS-STRIPE-P2-TC067-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },

  // ---- Clonación finalizado (sección 9)
  'TS-STRIPE-P2-TC072': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC074': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC072', existingAliasId: 'TS-STRIPE-P2-TC072-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-P2-TC073': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC075': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC073', existingAliasId: 'TS-STRIPE-P2-TC073-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },

  // ---- Edición (sección 10)
  'TS-STRIPE-P2-TC078': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC080': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC078', existingAliasId: 'TS-STRIPE-P2-TC078-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-P2-TC079': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC081': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC079', existingAliasId: 'TS-STRIPE-P2-TC079-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },

  // ---- Edición en conflicto (sección 11)
  'TS-STRIPE-P2-TC084': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC086': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC084', existingAliasId: 'TS-STRIPE-P2-TC084-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },
  'TS-STRIPE-P2-TC085': { action: 'canonical-new', priority: 'P3', cardFlow: 'new', titleSuffix: ' — Vincular tarjeta nueva' },
  'TS-STRIPE-P2-TC087': { action: 'existing-alias', priority: 'P3', cardFlow: 'existing', canonicalRef: 'TS-STRIPE-P2-TC085', existingAliasId: 'TS-STRIPE-P2-TC085-CARD-EXISTING', titleSuffix: ' — Usar tarjeta vinculada existente' },

  // ---- Alias RV (colapsar — trazabilidad cruzada, no ejecutar)
  'TS-STRIPE-TC-RV001': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1017' },
  'TS-STRIPE-TC-RV002': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1018' },
  'TS-STRIPE-TC-RV003': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1011' },
  'TS-STRIPE-TC-RV004': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1012' },
  'TS-STRIPE-TC-RV005': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1013' },
  'TS-STRIPE-TC-RV006': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1014' },
  'TS-STRIPE-TC-RV007': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1015' },
  'TS-STRIPE-TC-RV008': { action: 'collapse-alias', canonicalRef: 'TS-STRIPE-TC1016' },
};

const summary = {
  'canonical-new': 0,
  'existing-alias': 0,
  deprecate: 0,
  'collapse-alias': 0,
  untouched: 0,
};

for (const tc of data.cases) {
  const d = decisions[tc.test_case_id];
  if (!d) {
    summary.untouched++;
    // Asegurar campo card_flow en todos los casos no tocados.
    if (!('card_flow' in tc)) tc.card_flow = 'n/a';
    continue;
  }

  summary[d.action]++;

  if (d.action === 'canonical-new') {
    tc.title = tc.title + d.titleSuffix;
    tc.priority = d.priority;
    tc.card_flow = 'new';
    tc.phase2_status = 'active-canonical';
    tc.critical_flow = d.priority === 'P1';
    if (!tc.tags.includes('@card-new')) tc.tags.push('@card-new');
  } else if (d.action === 'existing-alias') {
    tc.title = tc.title + d.titleSuffix;
    tc.priority = d.priority;
    tc.card_flow = 'existing';
    tc.canonical_ref = d.canonicalRef;
    tc.card_existing_alias_id = d.existingAliasId;
    tc.phase2_status = 'active-card-existing';
    tc.critical_flow = d.priority === 'P1';
    if (!tc.tags.includes('@card-existing')) tc.tags.push('@card-existing');
  } else if (d.action === 'deprecate') {
    tc.phase2_status = 'deprecated-redundant';
    tc.canonical_ref = d.canonicalRef;
    tc.card_flow = 'n/a';
    tc.critical_flow = false;
    tc.priority = 'P3';
    if (!tc.tags.includes('@deprecated')) tc.tags.push('@deprecated');
  } else if (d.action === 'collapse-alias') {
    tc.phase2_status = 'collapsed-alias';
    tc.canonical_ref = d.canonicalRef;
    tc.card_flow = 'n/a';
    tc.critical_flow = false;
    tc.priority = 'P3';
    if (!tc.tags.includes('@alias')) tc.tags.push('@alias');
  }
}

// Actualizar metadata
data.generator = 'critical-flow-prioritizer@phase2';
data.phase2_applied_at = new Date().toISOString();
if (!data.notes) data.notes = [];
data.notes.push(
  'Fase 2 aplicada: diferenciación card-new / card-existing y deprecación de redundantes.',
  'Campo "card_flow" agregado a todos los casos. Valores: new | existing | n/a.',
  'Campo "phase2_status" indica: active-canonical, active-card-existing, deprecated-redundant, collapsed-alias.',
  'Alias TC-RV001..RV008 colapsados a sus canónicos via canonical_ref; no ejecutar por separado.'
);
data.phase2_summary = summary;

fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Fase 2 aplicada.');
console.log(JSON.stringify(summary, null, 2));
