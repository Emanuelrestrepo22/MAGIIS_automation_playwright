# Convenciones — magiis-playwright (V1)

> **Documento de diagnóstico medido, no un canon estabilizado.** A diferencia de `magiis-carrier-v2-e2e`,
> este repo no tiene una convención consolidada que describir: tiene una convivencia de patrones sin
> resolver. Este documento mide esa realidad tal como está el 2026-09-08, para servir de línea base a las
> olas de mejora futuras — no se declara superior a `CLAUDE.md` (27 KB), `AGENTS.md` ni `ARCHITECTURE.md`
> de este repo, porque en varios puntos **contradice lo que esos documentos prescriben** (ver §8, deuda
> medida). Donde este documento y aquellos discrepen sobre un hecho verificable del código, **manda la
> medición de este documento** — pero la resolución de la contradicción (cuál regla queda vigente) es
> trabajo de una ola de mejora, no de este diagnóstico.
>
> Fecha de la medición: 2026-09-08. Supersede en materia de hechos verificables: ninguna sección completa
> de `CLAUDE.md`/`ARCHITECTURE.md`, pero corrige puntualmente cualquier conteo o afirmación de esos
> documentos que la medición de hoy contradiga.
>
> Referencia de método (no de contenido): `docs/architecture/CONVENTIONS.md` de `magiis-carrier-v2-e2e`
> (`git show origin/main:docs/architecture/CONVENTIONS.md`) y el canon de portafolio en
> `.context/ADR/ADR-0002-organizacion-de-tests-y-variantes-por-repo.md` del repo padre.

---

## 1. Layout — cuatro raíces paralelas de Page Objects (confirmado)

Medido con `find <ruta> -type f | wc -l`:

| Raíz | Archivos | Contenido |
| --- | --- | --- |
| `tests/pages/` | 20 | POMs "clásicos" pre-KATA |
| `tests/components/ui/` | 20 | POMs estilo KATA (`UiBase`), agrupados en subcarpetas `carrier/`, `carrier/card-forms/`, `contractor/` |
| `tests/features/<feature>/pages/` | 9 | `flights/pages/` (3), `gateway-pg/pages/` (3), `service-type-quota/pages/` (3) |
| `tests/pages/gateway-pg/` | 0 (carpeta vacía) | resto de una reorganización anterior |

Son **tres raíces vivas + una carpeta muerta**, no cuatro raíces vivas — el hallazgo previo sobreestimó en
una. La convivencia real es: POMs planos (`tests/pages/`), POMs KATA (`tests/components/ui/`) y POMs
locales a un feature (`tests/features/<feature>/pages/`), sin regla escrita que diga cuándo usar cuál.

**Regla propia incumplida**: `CLAUDE.md`/`AGENTS.md` de este repo declaran que `features/.../pages/` no
debe existir. Medido: existe en **3 features** — `flights`, `gateway-pg`, `service-type-quota` — con 9
archivos en total. La regla está escrita y no se cumple; no es una variante declarada, es deuda (§8).

## 2. Fixtures — dos arquitecturas conviviendo (confirmado)

- `tests/TestBase.ts` (50 líneas) — fixture plano, `test.extend` directo, sin capas.
- `tests/components/{TestContext,TestFixture,ApiFixture,UiFixture,DbFixture}.ts` — arquitectura KATA de 4
  capas (TestContext → ApiBase/UiBase → Fixture → test files), la misma que usa el repo padre.

Uso relativo, medido por import (`grep -rhoE "from '@TestBase|from '@TestFixture'"` sobre `tests/`):
`@TestFixture` (KATA) aparece en **108** ocurrencias vs `@TestBase` (plano) en **33**. KATA es mayoritario
en volumen de imports, pero `TestBase.ts` sigue vivo y no está marcado como legacy en ningún comentario.

## 3. `tests/features/gateway-pg/` — concentración de archivos (confirmado, conteo exacto)

`find tests/features -type f | wc -l` → **214** archivos totales bajo `tests/features/`.
`find tests/features/gateway-pg -type f | wc -l` → **186**.

**186 de 214 = 87 %** de todo `tests/features/` vive en una sola carpeta de proveedor de pago. El resto
—`flights/`, `service-type-quota/`, `auth/` y similares— se reparte los 28 archivos restantes. El hallazgo
previo (186/214) se confirma exacto.

`gateway-pg/` está organizado por **proveedor de pago** (`stripe/`, `authorize/`, `ebizcharge/`,
`mercado-pago/` bajo `specs/`) y no por dominio funcional de negocio — es la misma lógica de "eje de mayor
riesgo primero" que el ADR-0002 ya homologó para `magiis-api-e2e` (riesgo operativo), pero aquí el riesgo
es "qué pasarela", no "solo lectura vs mutación".

## 4. Reorganización previa incompleta — carpetas vacías (confirmado, conteo exacto)

`find tests -type d -empty` → **7 carpetas vacías**:

```
tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo
tests/features/gateway-pg/specs/stripe/carrier/hold
tests/features/gateway-pg/specs/stripe/carrier/operaciones
tests/features/gateway-pg/specs/stripe/carrier/recurrentes
tests/features/gateway-pg/specs/stripe/contractor
tests/pages/gateway-pg
tests/setup
```

Cinco de las siete son restos de una reorganización de `gateway-pg/specs/stripe/` que movió contenido a
otro lado sin limpiar el directorio origen. Es limpieza mecánica de bajo riesgo (§8, ola 1).

## 5. `tests/mobile/appium/scripts/` — archivos sueltos (corregido: 106, no ">100")

`find tests/mobile/appium/scripts -type f | wc -l` → **106** (el hallazgo previo decía "más de 100";
confirmado con precisión). Conviven con estructura organizada en el resto de `tests/mobile/appium/`
(`base/`, `config/`, `contracts/`, `driver/`, `harness/`, `helpers/`, `passenger/`, `recorded/`) — es decir,
`scripts/` es la única subcarpeta de `appium/` sin curar, con un subdirectorio `scripts/_shared/` que
sugiere un intento de organización interrumpido.

## 6. Archivos sueltos en la raíz de `tests/`

`find tests -maxdepth 1 -type f`:

```
tests/.prettierrc
tests/authorize2e2_happypath.ts
tests/test-1.spec.ts
tests/test-11.spec.ts
tests/TestBase.ts
```

`test-1.spec.ts` y `test-11.spec.ts` son nombres sin significado de dominio ni de TC — indistinguibles de
un scratch file de desarrollo. `authorize2e2_happypath.ts` no tiene extensión `.spec.ts`, así que
Playwright no lo recoge como test — su función real (script auxiliar, prueba abandonada) queda sin marcar.

## 7. Qué agrupa cada nivel — specs por carpeta y tags reales

`find <dir> -name '*.spec.ts' | wc -l`:

| Directorio | Specs |
| --- | --- |
| `tests/features/` | 114 |
| `tests/e2e/` | 7 |
| `tests/mobile/` | 4 |
| `tests/integration/`, `tests/components/`, `tests/pages/` | 0 (no contienen specs — son solo componentes/POMs) |

`tests/features/<feature>/specs/` es el nivel donde vive casi toda la suite (114 de ~125 specs totales).
`tests/e2e/` guarda flujos cross-portal punta a punta (`flow1-carrier-driver`, `flow2-passenger-driver`,
`flow3-contractor-driver`); no se solapa con `features/`.

**Tags reales** (`grep -rhoE "@[a-zA-Z0-9_-]+" tests --include="*.spec.ts" | sort | uniq -c`, top 15):

`@regression` (250) · `@features` (172) · `@hold` (126) · `@TestFixture` (108) · `@3ds` (98) ·
`@gateway` (85) · `@cargo-a-bordo` (74) · `@steps` (66) · `@stripe` (58) · `@ui` (52) · `@fixtures` (47) ·
`@smoke` (42) · `@TestBase` (33) · `@carrier` (31) · `@critical` (26).

A diferencia de V2 (`@P1/@P2/@P3` de prioridad fija), V1 no tiene un vocabulario de prioridad estandarizado:
mezcla tags de prioridad (`@smoke`, `@regression`, `@critical`), de dominio (`@carrier`, `@gateway`,
`@flight`), de proveedor (`@stripe`, `@3ds`) y de arquitectura de fixture (`@TestFixture`, `@TestBase` — un
test se etiqueta con la fixture que usa, lo cual documenta la convivencia del punto 2 en el propio título).

## 8. Derivación de suite por path (confirmado — sí ocurre, y es más profundo que un script)

El canon de portafolio (ADR-0002, punto 2) prohíbe derivar la suite del path del archivo. En V1 esto
**sí ocurre**, y no en un solo script sino en la superficie de `package.json` completa: casi todos los
scripts `test:*:gateway:*` seleccionan pasarela con `--grep=@stripe` (tag, correcto) **combinado** con
`-c playwright.gateway-pg.config.ts` (archivo de config dedicado, cuyo único propósito es apuntar
`testDir`/`testMatch` a `tests/features/gateway-pg/`) — es decir, la partición real "gateway-pg vs el
resto" está codificada en **qué config file se invoca**, no en un tag. Ejemplos medidos en
`package.json`: `test:test:gateway`, `test:test:gateway:stripe`, `test:test:gateway:authorize`,
`test:test:gateway:mercadopago`, `test:test:gateway:ebizcharge` (5 variantes base, más sus pares `:xray:ui`
/ `:xray:api`, ~20 scripts en total). Además, `test:test:auth` selecciona por **path literal**
(`tests/features/auth/specs`) sin tag alguno.

Es una variante más fuerte que la de V2 (que solo señalaba "un script legacy lo hacía y se corrigió"): acá
la selección por config-file-y-path es el mecanismo **principal** de la mitad de la superficie de scripts
de `package.json`, conviviendo con selección por tag para la otra mitad (`@smoke`, `@critical`).

## 9. Imports — alias sí se usan, sin consistencia declarada

`tsconfig.json:13-31` declara 15 alias (`@pages`, `@helpers`, `@fixtures`, `@features`, `@config`,
`@utils`, `@TestBase`, `@components`, `@ui`, `@api`, `@steps`, `@db`, `@schemas`, `@TestContext`,
`@UiFixture`, `@ApiFixture`, `@TestFixture`, `@DbFixture`). A diferencia de V2 (donde los alias están
declarados pero **0 archivos** los usan), acá sí hay uso real y masivo:

`grep -rhoE "from ['\"](@[a-z]+/|\.\./|\./)" tests --include="*.ts"`:

| Patrón | Ocurrencias |
| --- | --- |
| `from '../` (relativo, subiendo) | 501 |
| `from '@features/` | 262 |
| `from './` (relativo, mismo nivel) | 183 |
| `from '@playwright/` (paquete externo, no alias propio) | 135 |
| `from '@ui/` | 84 |
| `from '@fixtures/` | 76 |
| `from '@steps/` | 40 |
| `from '@pages/` | 24 |
| `from '@api/` | 24 |

Import relativo (`../` + `./`) sigue siendo mayoritario (684 ocurrencias) frente a alias propios (~510
sumando todos los `@algo/` que no son paquete externo), pero la brecha es mucho menor que en V2 y no hay
ninguna capa del repo que use alias en 0 %: cada capa mezcla ambos estilos. No hay evidencia de que el
alias falle en runtime aquí (a diferencia de la premisa —ya corregida— que tenía V2): es simplemente
un estilo no impuesto, cada autor elige.

## 10. Trazabilidad

Namespace usado: `MG-`, `MX-`, `TS-` y `TC-` coexisten en títulos de test, sin un helper único de
anotación equivalente al `makeAnnotate()` de V2:

- `grep -rhoE "TC-[A-Z0-9-]+" tests --include="*.spec.ts" | sort -u | wc -l` → **14** claves únicas
  `TC-*` en títulos.
- `grep -rlE "@atc\(" tests --include="*.ts" | wc -l` → **15** archivos usan el decorador `@atc('MG-###')`
  (patrón KATA del repo padre), con al menos un placeholder sin resolver medido (`@atc('MG-###')` literal).
- Los títulos de test mezclan formatos: `[TS-AUTH-TC02]`, `[TS-MX5824-TC10]`, `[WAL-DB]`, `[F-02]`, sin una
  gramática única — a diferencia de la convención `TC<NN> <descripción>` que V2 declara y mide al 100 %.

No hay un script equivalente a `extract-tc-map.ts` de V2 que parsee esta trazabilidad de forma auditable;
la única fuente verificada es el reporter de Xray invocado vía `XRAY=1` en los scripts `:xray:` de
`package.json` (ver §11), que opera sobre el resultado de ejecución, no sobre el código fuente.

## 11. Idioma de artefactos legibles por personas

Medido sobre 187 títulos de `test()` en `tests/features/*.spec.ts`: **73 de 187 (39 %)** contienen al
menos un carácter acentuado del español. La mezcla real es de identificador técnico en inglés
(`[TS-MX5826-VA1a]`) seguido de descripción en español (`Aeropuerto en DESTINO → radio de búsqueda`), o
descripciones puramente técnicas sin texto en español (`login con credenciales inválidas` sí, pero también
purely-English strings de debug). A diferencia de V2 (100 % español medido sobre 72 specs), V1 **no tiene
un idioma dominante consistente** — es una convivencia, no una convención declarada.

## 12. Scripts de ejecución y ambientes

`package.json` declara **decenas** de scripts `test:test:*` / `test:uat:*` para cada combinación de
pasarela × superficie (ui/api) × modo (xray/no-xray), más scripts `test:e2e:flow{1,2,3}` para los flujos
cross-portal. Es el patrón de "un script por combinación" en vez de flags parametrizados — cada nueva
pasarela o combinación agrega N líneas a `package.json` en vez de un único script parametrizable con env
vars, que es lo que ya usan los scripts base (`GATEWAYS=stripe`, `XRAY_TEST_PLAN_KEY=MG-178`). El propio
`package.json` demuestra que el mecanismo parametrizable existe pero convive con la variante hardcodeada
por script.

---

## 13. Variantes declaradas frente al canon del padre

| Variante | Razón | Evidencia |
| --- | --- | --- |
| Eje de agrupación de `gateway-pg/`: por proveedor de pago, no por dominio de negocio | Mismo principio ya homologado por ADR-0002 para `magiis-api-e2e` (eje de mayor riesgo primero): en un conjunto de specs de pasarela, "qué proveedor" es el eje que más condiciona el comportamiento del test (3DS, tokenización, webhooks difieren por proveedor) más que el dominio funcional compartido | §3, §8 — 186/214 archivos de `features/` bajo `gateway-pg/`, subcarpetas `stripe/authorize/ebizcharge/mercado-pago` |
| Imports mixtos (alias + relativo) sin regla única | A diferencia de V2, acá el alias sí resuelve y se usa en volumen real (§9); imponer un único estilo hoy exigiría tocar cientos de archivos existentes sin beneficio funcional — mismo argumento de "costo de migración sin beneficio inmediato" que sostiene la variante equivalente de V2 | §9 — conteo de ocurrencias por patrón de import |
| Runtime npm, no Bun | El propio `CLAUDE.md` del padre manda leer `package.json` de cada repo antes de asumir stack; V1 nunca adoptó Bun | `package.json` (script runner: `npm run`, no `bun run`) |

No se declara como variante la derivación de suite por config-file-y-path (§8) ni la convivencia de cuatro
capas de organización de POMs (§1) ni la de fixtures (§2): ninguna de las tres tiene una razón escrita en
`CLAUDE.md`/`AGENTS.md`/`ARCHITECTURE.md` de este repo que las justifique como decisión — son divergencia
sin fundamento, es decir, deuda (§14).

## 14. Deuda medida (ordenada por relación beneficio/riesgo, de mayor a menor)

| Deuda | Impacto | Riesgo de corregirla |
| --- | --- | --- |
| 7 carpetas vacías (§4) | Bajo — ruido para quien navega el árbol, cero funcionalidad afectada | Ninguno: `rmdir` no toca código ni tests. Candidata a ola 1 inmediata. |
| Archivos sueltos en raíz de `tests/` (§6): `test-1.spec.ts`, `test-11.spec.ts` sin nombre de dominio; `authorize2e2_happypath.ts` sin extensión `.spec.ts` | Bajo-medio — confunde a quien busca la suite real; si `test-1`/`test-11` corren en CI son ruido en el reporte, si no corren son basura sin marcar | Bajo: requiere abrir cada uno para decidir si es código vivo, histórico o descartable antes de mover/borrar — no es un `rm` a ciegas. |
| Regla propia incumplida: `features/.../pages/` (§1) en 3 features, 9 archivos | Medio — el propio repo documenta una regla que no sigue, lo cual erosiona la confianza en el resto de `CLAUDE.md`/`AGENTS.md` | Medio: mover 9 archivos implica actualizar sus imports (posiblemente `@features/.../pages/X` en varios specs) y decidir el destino correcto (¿`tests/pages/`? ¿`tests/components/ui/`?) antes de mover, no después. |
| Cuatro raíces de POMs sin regla de cuándo usar cuál (§1) | Alto — cada page object nuevo requiere una decisión no escrita de "dónde va"; sin regla, la próxima adición perpetúa la fragmentación | Alto: no es solo mover archivos, es decidir arquitectónicamente si el destino final es KATA (`tests/components/ui/`) puro, y migrar 20+9 archivos con sus imports y sus fixtures asociadas. Requiere su propio plan de olas, no una tarea suelta. |
| Dos arquitecturas de fixtures conviviendo, `TestBase.ts` sin marcar como legacy (§2) | Alto — mezclar KATA y fixture plano en el mismo repo obliga a cada autor nuevo a inferir cuál usar; 33 imports de `TestBase` siguen vivos | Alto: migrar de `TestBase` a KATA no es mecánico — cambia la forma de inyectar dependencias en cada spec que lo usa. Es trabajo de ola dedicada con verificación de regresión. |
| Derivación de suite por config-file-y-path en ~20 scripts de `package.json` (§8) | Alto — viola directamente el canon de portafolio (ADR-0002 punto 2); cualquier herramienta de reporte que asuma "la suite viene del tag" leerá mal la mitad de la ejecución real de este repo | Medio-alto: requiere que `playwright.gateway-pg.config.ts` deje de ser el mecanismo de partición y que cada pasarela se seleccione 100 % por tag; toca configuración de CI y puede requerir tags nuevos si algún test de gateway no está etiqueted hoy. |
| Trazabilidad sin gramática única en títulos (§10, §11) | Medio — sin un `extract-tc-map.ts` equivalente, la trazabilidad real depende del reporter de ejecución (Xray), no del código fuente; auditar cobertura offline (sin correr la suite) no es posible hoy | Medio: definir una gramática única y un script de extracción es trabajo greenfield (no hay que migrar 187 títulos a la vez, se puede adoptar hacia adelante), pero requiere decisión de producto sobre qué namespace es el vigente (MG vs MX vs TC vs TS). |
| 106 scripts sueltos en `tests/mobile/appium/scripts/` (§5) | Medio — mobile/Appium es una superficie completa sin curar, aislada del resto del repo; bajo riesgo de romper algo fuera de mobile, pero alto volumen | Bajo (aislado) pero alto en esfuerzo: 106 archivos sin categorizar necesitan triage uno por uno antes de decidir estructura — candidato a su propio proyecto, no a una ola corta. |

---

## 15. Olas de mejora propuestas

1. **Ola 0 — limpieza mecánica de riesgo cero.** Borrar las 7 carpetas vacías (§4). Abrir y clasificar
   `test-1.spec.ts`, `test-11.spec.ts`, `authorize2e2_happypath.ts` (§6) y decidir por archivo: mover,
   renombrar o borrar. Ningún cambio de arquitectura, ningún import roto posible. Riesgo: ninguno.
2. **Ola 1 — cerrar la regla incumplida de `features/.../pages/`.** Migrar los 9 archivos de
   `flights/pages/`, `gateway-pg/pages/`, `service-type-quota/pages/` a un destino único (a decidir:
   `tests/components/ui/<feature>/` es el más alineado con el volumen de imports KATA medido en §2).
   Riesgo: bajo-medio — imports a actualizar, pero el conteo de archivos es acotado (9) y verificable con
   `tsc` después de mover.
3. **Ola 2 — declarar la variante de `gateway-pg/` formalmente** (añadir la fila de la §13 de este
   documento a `ARCHITECTURE.md`/`CLAUDE.md` de este repo, con su evidencia) **y, en paralelo, migrar la
   selección de pasarela de config-file-y-path a tag puro** (§8), porque ambas tocan el mismo área
   (`gateway-pg/` + `package.json`) y conviene resolverlas en la misma ventana de cambio antes de que se
   agregue una quinta pasarela. Riesgo: medio-alto — toca `package.json` y potencialmente CI; requiere
   verificar que cada test de `gateway-pg/` tenga ya el tag de proveedor necesario antes de retirar el
   config file dedicado.
4. **Ola 3 — unificar arquitectura de fixtures (`TestBase` → KATA).** La más cara y de mayor riesgo:
   requiere migrar 33 imports de `TestBase` uno por uno, verificando que el reemplazo KATA no cambie el
   comportamiento de setup/teardown de cada spec. Se propone última porque su costo depende de que las
   olas 1-2 ya hayan reducido la superficie de POMs planos que hoy dependen de `TestBase`.
5. **Fuera de estas olas — mobile/Appium (§5, 106 archivos) y trazabilidad (§10-§11).** Ambas son
   superficies aisladas del resto del repo (mobile no comparte fixtures con web; trazabilidad es aditiva,
   no bloqueante). Se recomienda tratarlas como proyectos propios con su propio diagnóstico, no como una
   ola más de esta lista — mezclar su triage con las olas 1-3 diluiría el foco de cada una.

---

**Footer de sesión**

- skills_loaded: ninguno (Regla Cero del prompt: sin `Agent`, sin delegación; trabajo directo con
  `Read`/`Grep`/`Bash`)
- mcps_used: ninguno
- clis_used: `find`, `grep`, `wc` (Bash / Git Bash) para las mediciones de este documento
- testing_levels_touched: ninguno — tarea de documentación pura, cero tests ejecutados ni modificados
- screenshots_captured: ninguno
