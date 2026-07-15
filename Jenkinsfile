// Jenkinsfile — CI preset MAGIIS (qa-gateway-magiis / repo.magiis/magiis-testing)
// ────────────────────────────────────────────────────────────────────────────
// Política CI (2026-07-15): la CI de TRABAJO corre en JENKINS sobre un agente
// DOCKER (imagen oficial de Playwright), NUNCA en GitLab CI (.gitlab-ci.yml está
// comentado/inerte). La MISMA suite también corre en GitHub Actions sobre el
// remoto personal (github/Emanuelrestrepo22) vía .github/workflows/*.
//
// Preset: parametrizado + manual (no trigger automático). Credenciales UAT desde
// el credentials store de Jenkins (withCredentials) — NUNCA hardcodeadas ni en .env
// del repo. Ajustar `credentialsId` a los IDs reales configurados en Jenkins.
// ────────────────────────────────────────────────────────────────────────────

pipeline {
  agent {
    docker {
      image 'mcr.microsoft.com/playwright:v1.56.1-jammy' // igual major que @playwright/test ^1.56
      args '-u root:root'
    }
  }

  parameters {
    choice(name: 'ENV', choices: ['uat', 'test', 'prod'], description: 'Entorno objetivo')
    choice(name: 'SCOPE', choices: ['flights', 'gateway', 'smoke', 'regression'], description: 'Suite a correr')
    string(name: 'GREP', defaultValue: '', description: 'Filtro -g extra de Playwright (vacío = según SCOPE)')
  }

  options {
    timeout(time: 45, unit: 'MINUTES')
    disableConcurrentBuilds()      // evita chocar contra el estado compartido del entorno
    ansiColor('xterm')
  }

  environment {
    ENV = "${params.ENV}"
    HEADLESS = 'true'
    CI = 'true'
  }

  stages {
    stage('Install') {
      steps {
        sh '''
          corepack enable
          pnpm install --frozen-lockfile
          pnpm exec playwright install --with-deps chromium
        '''
      }
    }

    stage('Test') {
      steps {
        // Credenciales del carrier UAT con app Vuelos vinculada (getFlights) + Stripe test cards,
        // inyectadas desde el credentials store de Jenkins. Wire los IDs reales.
        withCredentials([
          usernamePassword(credentialsId: 'magiis-carrier-uat', usernameVariable: 'USER_CARRIER', passwordVariable: 'PASS_CARRIER'),
          string(credentialsId: 'stripe-card-success-direct', variable: 'STRIPE_CARD_SUCCESS_DIRECT')
        ]) {
          sh '''
            set -e
            GREP_ARG=""; [ -n "$GREP" ] && GREP_ARG="-g $GREP"
            case "$SCOPE" in
              flights)    pnpm exec playwright test tests/features/flights --project=chromium $GREP_ARG ;;
              gateway)    pnpm exec playwright test -c playwright.gateway-pg.config.ts --grep=@gateway $GREP_ARG ;;
              smoke)      pnpm exec playwright test --project=chromium --grep=@smoke $GREP_ARG ;;
              regression) pnpm exec playwright test --project=chromium --grep=@regression $GREP_ARG ;;
            esac
          '''
        }
      }
    }

    stage('Allure report') {
      steps {
        sh 'pnpm run allure:gen || true'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'allure-report/**, evidence/**, test-results/**, playwright-report/**', allowEmptyArchive: true
    }
    cleanup {
      sh 'pnpm --if-present run cleanup:test:travels || true'
    }
  }
}
