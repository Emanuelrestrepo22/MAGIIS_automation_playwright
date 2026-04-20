/**
 * Config commitlint — magiis-playwright
 *
 * Formato esperado: <tipo>(<scope>): [TC-ID?] descripcion corta
 *
 * Ejemplos:
 *   feat(smoke): [TS-STRIPE-TC01] validar hold OK
 *   fix(carrier): [TC14] tolerar declined cards
 *   docs(ci): [scripts] actualizar guideline
 *
 * Ver: docs/ci/CI-USAGE-GUIDELINES.md
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Permitir espanol en subject (sin forzar lowercase ni case especifico)
    'subject-case': [0],
    // Body/subject mas largos para detalle tecnico
    'header-max-length': [2, 'always', 150],
    'body-max-line-length': [1, 'always', 200],
    // Tipos permitidos
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'revert', 'perf', 'style', 'ci', 'build'],
    ],
    // Scope opcional pero si se usa debe estar en lowercase con "/"
    'scope-empty': [0],
  },
};
