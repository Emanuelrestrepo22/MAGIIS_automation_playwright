# Branch protection — Settings manuales

Este documento describe la configuracion objetivo de branch protection en GitLab y GitHub para magiis-playwright.
Como requiere permisos admin y UI, no es aplicable via PR — se aplica manualmente cuando el equipo este estable.

**Trigger para activar:** equipo >= 2 devs estables por >= 1 mes.

---

## GitLab — `repo.magiis/magiis-testing`

### Settings -> Merge requests

- [x] Pipelines must succeed
- [x] All threads resolved
- Approvals required: **1** (escalable a 2 cuando equipo >= 3)

### Settings -> Protected branches -> `main`

- Allowed to merge: Maintainers
- Allowed to push: No one (force merge via MR)
- Allowed to force push: No one
- Require code owner approval: [x] (cuando CODEOWNERS este populado)

### Settings -> Repository -> Push rules

- Commit message regex:
  ```
  ^(feat|fix|refactor|docs|test|chore|revert|perf|style|ci|build)(\([^)]+\))?:\s+(\[[A-Z]+-[A-Z0-9-]+\]\s+)?.+
  ```
- Deny commits with secrets: [x]

---

## GitHub — mirror del repo

### Settings -> Branches -> Rule para `main`

- [x] Require a pull request before merging
  - Required approvals: 1
  - [x] Dismiss stale approvals when new commits are pushed
  - [x] Require review from Code Owners
- [x] Require status checks to pass before merging
  - [x] Require branches to be up to date before merging
  - Status checks: `quick-checks`, `e2e-test`
- [x] Require conversation resolution before merging
- [ ] Require signed commits (opcional, si se usa GPG)
- [ ] Require linear history (opcional)
- [x] Do not allow bypassing the above settings
- [ ] Restrict who can push (dejar libre hasta equipo >= 3)

### Settings -> Actions -> General

- Fork pull request workflows from outside collaborators: Require approval for first-time contributors

---

## Cuando activar

Activar estos settings solo cuando:
- **Ya hay >= 2 devs** (sino Erika se auto-bloquea)
- **Fase 4 estable >= 1 mes** (hooks funcionales, metricas fluidas)
- **Jefe o Tech Lead aprueba** la politica de proteccion

Hasta entonces, mantener gates relajados para permitir trabajo fluido.

---

## Referencias

- `docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md` seccion Fase 5
- `docs/ci/CI-USAGE-GUIDELINES.md`
- `.github/CODEOWNERS`
- `docs/ops/BACKLOG.md` BL-017
