// scripts/scaffold-feature.ts
//
// Genera un MÓDULO DE FEATURE nuevo bajo `tests/features/<feature>/` siguiendo el patrón
// escalable establecido en la encapsulación (Fase A/B/C):
//   - sustrato compartido REUSADO (BasePage, LoginPage, POMs de viaje, login de auth)
//   - POM PROPIO de la feature (`extends BasePage`)
//   - fixture de PROVISIÓN (`TestBase.extend()` → sin `new` en las specs)
//   - data PROPIA + spec starter desacoplada de otras features
//
// Uso:
//   node --no-warnings --loader ts-node/esm scripts/scaffold-feature.ts <feature> [--dry-run]
//   (o vía npm: `pnpm scaffold:feature -- <feature>` / `pnpm scaffold:feature:dry -- <feature>`)
// Ejemplos: `... scaffold-feature.ts other-costs`  ·  `... scaffold-feature.ts flights --dry-run`

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--dry');
const rawName = args.find((a) => !a.startsWith('-'));

if (!rawName) {
	console.error('✗ Falta el nombre de la feature.');
	console.error('  Uso: node --loader ts-node/esm scripts/scaffold-feature.ts <feature> [--dry-run]');
	process.exit(1);
}

// Normalización: acepta "otherCosts" | "other-costs" | "Other_Costs" → kebab + Pascal + camel.
const kebab = rawName
	.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
	.replace(/[_\s]+/g, '-')
	.replace(/-+/g, '-')
	.toLowerCase()
	.replace(/^-|-$/g, '');

if (!/^[a-z][a-z0-9-]*$/.test(kebab)) {
	console.error(`✗ Nombre inválido tras normalizar: "${kebab}". Usá letras/números/guiones (ej: other-costs).`);
	process.exit(1);
}

const pascal = kebab.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
const dataConst = kebab.replace(/-/g, '_').toUpperCase() + '_TEST_DATA';
const tcPrefix = kebab.replace(/-/g, '').toUpperCase();
const label = kebab.toUpperCase();

const root = join('tests', 'features', kebab);

if (existsSync(root)) {
	console.error(`✗ La feature ya existe: ${root} — abortando para no sobreescribir.`);
	process.exit(1);
}

const featurePage = [
	`import type { Page } from '@playwright/test';`,
	`import { BasePage } from '../../../pages/shared/BasePage';`,
	``,
	`/**`,
	` * ${pascal}Page — POM propio de la feature ${kebab}.`,
	` * Extiende BasePage (sustrato compartido) para reusar las primitivas de widgets Angular V1`,
	` * (openDropdown / chooseDropdownOption / waitForAutocompleteOptionsReady / waitForLoadingOverlayToDisappear).`,
	` */`,
	`export class ${pascal}Page extends BasePage {`,
	`\tconstructor(page: Page) {`,
	`\t\tsuper(page);`,
	`\t\t// TODO: declarar los locators propios de la feature acá.`,
	`\t}`,
	``,
	`\t// TODO: acciones del feature (reusar las primitivas heredadas de BasePage).`,
	`}`,
	``,
].join('\n');

const pagesIndex = [
	`// tests/features/${kebab}/pages/index.ts`,
	`// Superficie canónica de POMs propios de la feature ${kebab}.`,
	`export { ${pascal}Page } from './${pascal}Page';`,
	``,
].join('\n');

const pomFixtures = [
	`// tests/features/${kebab}/fixtures/pom.fixtures.ts`,
	`// Fixture de PROVISIÓN de POMs para la feature ${kebab} (patrón Fase C).`,
	`// Nombrado .fixtures.ts (NO .test.ts) para no ser recolectado por el testMatch base.`,
	`import { test as base, expect } from '../../../TestBase';`,
	`import { DashboardPage, NewTravelPage, TravelManagementPage } from '../../../pages/carrier';`,
	`import { ${pascal}Page } from '../pages';`,
	``,
	`type ${pascal}Fixtures = {`,
	`\tdashboard: DashboardPage;`,
	`\ttravel: NewTravelPage;`,
	`\tmanagement: TravelManagementPage;`,
	`\t${camel}: ${pascal}Page;`,
	`};`,
	``,
	`export const test = base.extend<${pascal}Fixtures>({`,
	`\tdashboard: async ({ page }, use) => {`,
	`\t\tawait use(new DashboardPage(page));`,
	`\t},`,
	`\ttravel: async ({ page }, use) => {`,
	`\t\tawait use(new NewTravelPage(page));`,
	`\t},`,
	`\tmanagement: async ({ page }, use) => {`,
	`\t\tawait use(new TravelManagementPage(page));`,
	`\t},`,
	`\t${camel}: async ({ page }, use) => {`,
	`\t\tawait use(new ${pascal}Page(page));`,
	`\t},`,
	`});`,
	``,
	`export { expect };`,
	``,
].join('\n');

const dataFile = [
	`// tests/features/${kebab}/data/${kebab}-data.ts`,
	`// Datos propios de la feature ${kebab} (autónoma, sin acoplar a otras features).`,
	`export const ${dataConst} = {`,
	`\t// TODO: datos de prueba (cliente, origen, destino, etc.).`,
	`} as const;`,
	``,
].join('\n');

const spec = [
	`// tests/features/${kebab}/specs/${kebab}.smoke.spec.ts`,
	`// Feature ${kebab} — smoke starter. Usa el fixture de provisión (sin \`new\`),`,
	`// el login desacoplado de la capa auth, y datos propios de la feature.`,
	`import { test } from '../fixtures/pom.fixtures';`,
	`import { loginAsDispatcher } from '../../auth/helpers/login.helpers';`,
	`import { ${dataConst} } from '../data/${kebab}-data';`,
	``,
	`test.describe('[${label}] ${kebab} — smoke (starter)', () => {`,
	`\ttest.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });`,
	``,
	`\ttest('@${kebab} @carrier @smoke [TS-${tcPrefix}-TC01] TODO describir el caso', async ({ page, dashboard, travel }) => {`,
	`\t\tawait loginAsDispatcher(page);`,
	`\t\tawait dashboard.openNewTravel();`,
	`\t\tawait travel.ensureLoaded();`,
	`\t\tvoid ${dataConst};`,
	`\t\t// TODO: completar el flujo del feature (usar el POM propio ${camel} + assertions).`,
	`\t});`,
	`});`,
	``,
].join('\n');

const files: Record<string, string> = {
	[`${root}/pages/${pascal}Page.ts`]: featurePage,
	[`${root}/pages/index.ts`]: pagesIndex,
	[`${root}/fixtures/pom.fixtures.ts`]: pomFixtures,
	[`${root}/data/${kebab}-data.ts`]: dataFile,
	[`${root}/specs/${kebab}.smoke.spec.ts`]: spec,
	[`${root}/contracts/.gitkeep`]: '',
	[`${root}/helpers/.gitkeep`]: '',
	[`${root}/recorded/.gitkeep`]: '',
};

console.log('');
console.log(`Feature: ${kebab}  (POM: ${pascal}Page · fixture key: ${camel} · data: ${dataConst})${dryRun ? '  [DRY-RUN]' : ''}`);
console.log('');
for (const [path, content] of Object.entries(files)) {
	if (dryRun) {
		console.log(`  would create  ${path}  (${content.length} bytes)`);
	} else {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content, 'utf8');
		console.log(`  created  ${path}`);
	}
}
console.log('');
if (dryRun) {
	console.log('DRY-RUN — no se escribió nada. Quitá --dry-run para generar.');
} else {
	console.log('✓ Feature scaffolded.');
	console.log('Próximos pasos:');
	console.log(`  1. Implementá ${pascal}Page (locators + acciones reales del feature).`);
	console.log(`  2. Completá ${kebab}-data.ts con los datos de prueba.`);
	console.log(`  3. Escribí el flujo en specs/${kebab}.smoke.spec.ts (destructurá { ${camel} } del fixture).`);
}
