#!/usr/bin/env node
/** Analiza un reporte JSON de Playwright y resume metricas. */
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('Uso: node analyze-run.mjs <path-to-json>');
  process.exit(1);
}

const raw = readFileSync(path, 'utf8');
// El reporter JSON arranca con { ... "config" (puede tener whitespace/newline entre ellos)
const match = raw.match(/\{\s*"config"/);
if (!match) throw new Error('No se encontro arranque del reporte Playwright');
const doc = JSON.parse(raw.slice(match.index));

const buckets = { passed: [], failed: [], timedOut: [], skipped: [], flaky: [], interrupted: [] };
const byFile = new Map();

function walk(suite, fileHint) {
  const file = fileHint || suite.file || suite.title || '';
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const last = results[results.length - 1] || {};
      const status = last.status || test.status || 'unknown';
      const title = (spec.title || '').slice(0, 180);
      const entry = { file, title, status, duration: last.duration || 0, error: (last.error?.message || '').slice(0, 200) };
      const bucket = buckets[status === 'expected' || status === 'passed' ? 'passed'
        : status === 'unexpected' || status === 'failed' ? 'failed'
        : status === 'timedOut' ? 'timedOut'
        : status === 'skipped' ? 'skipped'
        : status === 'flaky' ? 'flaky'
        : 'interrupted'];
      if (bucket) bucket.push(entry);
      const agg = byFile.get(file) || { passed: 0, failed: 0, skipped: 0, timedOut: 0 };
      if (status === 'expected' || status === 'passed') agg.passed++;
      else if (status === 'unexpected' || status === 'failed') agg.failed++;
      else if (status === 'timedOut') agg.timedOut++;
      else if (status === 'skipped') agg.skipped++;
      byFile.set(file, agg);
    }
  }
  for (const sub of suite.suites || []) walk(sub, file);
}

for (const s of doc.suites || []) walk(s);

const total = Object.values(buckets).reduce((a, b) => a + b.length, 0);
const pct = (n) => total ? ((n / total) * 100).toFixed(1) : 0;

console.log('# Resumen');
console.log(`Total: ${total}`);
console.log(`Passed: ${buckets.passed.length} (${pct(buckets.passed.length)}%)`);
console.log(`Failed: ${buckets.failed.length} (${pct(buckets.failed.length)}%)`);
console.log(`TimedOut: ${buckets.timedOut.length} (${pct(buckets.timedOut.length)}%)`);
console.log(`Skipped: ${buckets.skipped.length} (${pct(buckets.skipped.length)}%)`);
console.log(`Flaky: ${buckets.flaky.length}`);

console.log('\n# Por archivo');
const rows = [...byFile.entries()].sort((a, b) => (b[1].failed + b[1].timedOut) - (a[1].failed + a[1].timedOut));
for (const [file, agg] of rows.slice(0, 30)) {
  console.log(`${agg.passed}P ${agg.failed}F ${agg.timedOut}T ${agg.skipped}S  ${file}`);
}

console.log('\n# Failed (top 20)');
for (const e of buckets.failed.slice(0, 20)) {
  console.log(`- [${e.file}] ${e.title}`);
  if (e.error) console.log(`    ${e.error.slice(0, 160)}`);
}
console.log('\n# TimedOut (top 10)');
for (const e of buckets.timedOut.slice(0, 10)) {
  console.log(`- [${e.file}] ${e.title}`);
}

console.log('\n# Skipped / fixme (top 20)');
for (const e of buckets.skipped.slice(0, 20)) {
  console.log(`- [${e.file}] ${e.title}`);
}
