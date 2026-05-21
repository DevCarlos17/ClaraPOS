# Tasks: setup infraestructura de testing con vitest

## Review Workload Forecast

| Métrica | Valor |
|---------|-------|
| Líneas estimadas (nuevas/modificadas) | ~480 |
| Archivos creados | 11 |
| Archivos modificados | 1 |
| Total archivos afectados | 12 |
| Chained PRs recomendado | **Sí** (2 PRs) |
| Riesgo presupuesto 400 líneas | **Medium** (PR-1 ~200 líneas infra, PR-2 ~280 líneas tests) |
| Decisión requerida antes de apply | No |

**Desglose de líneas por archivo:**

| Archivo | Líneas estimadas |
|---------|-----------------|
| `vitest.config.ts` | ~55 |
| `tsconfig.test.json` | ~18 |
| `src/test/setup.ts` | ~3 |
| `src/__mocks__/@powersync/react.ts` | ~45 |
| `src/__mocks__/@supabase/supabase-js.ts` | ~35 |
| `package.json` (delta) | ~14 |
| `src/lib/__tests__/currency.test.ts` | ~85 |
| `src/lib/__tests__/identity.test.ts` | ~90 |
| `src/lib/__tests__/dates.test.ts` | ~45 |
| `src/lib/__tests__/utils.test.ts` | ~30 |
| `src/lib/__tests__/format.test.ts` | ~35 |
| `src/features/inventario/schemas/__tests__/producto-schema.test.ts` | ~75 |
| `src/features/clientes/schemas/__tests__/cliente-schema.test.ts` | ~45 |
| `src/features/configuracion/schemas/__tests__/tasa-schema.test.ts` | ~30 |
| `src/features/ventas/schemas/__tests__/venta-schema.test.ts` | ~40 |
| **TOTAL** | **~645** |

> **Nota**: Las 645 líneas superan el presupuesto de 400 líneas por PR. Se recomienda dividir en 2 PRs encadenados (ver Chained PR Plan al final).

---

## Task Groups

### Group 1: Infraestructura base
**Dependencias:** ninguna  
**Puede ejecutarse en:** batch-1  
**Responsabilidad:** Instalar dependencias, configurar el runner, definir mocks de infraestructura

---

#### TASK-001: Instalar dependencias de testing
- **Acción:** Ejecutar `yarn add -D vitest@^3.2 @vitest/ui@^3.2 @vitest/coverage-v8@^3.2 happy-dom@^15 @testing-library/react@^16 @testing-library/user-event@^14 @testing-library/jest-dom@^6`
- **Archivos:** `package.json` — actualiza `devDependencies` (+7 entradas)
- **Líneas estimadas:** 7 (solo devDependencies, sin contar lock file)
- **Verifica:** `yarn list vitest` muestra versión `^3.2.x` sin errores de resolución
- **REQ:** REQ-001, REQ-006

---

#### TASK-002: Crear vitest.config.ts
- **Acción:** Crear `vitest.config.ts` en la raíz del proyecto con:
  - `defineConfig` importado de `vitest/config` (NO de `vite`)
  - `environment: 'happy-dom'`
  - `globals: true`
  - `setupFiles: ['./src/test/setup.ts']`
  - `include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx']`
  - `exclude` con patterns para `@powersync/**` y `@journeyapps/**`
  - `server.deps.external` para `@journeyapps/wa-sqlite`, `@powersync/web`, `@powersync/common`, `@powersync/kysely-driver`
  - `resolve.alias` con `@/` → `./src` via `fileURLToPath`
  - `coverage` con `provider: 'v8'`, `reporter: ['text', 'html', 'lcov']`, `include: ['src/lib/**', 'src/features/**/schemas/**']`, thresholds `lines: 80, functions: 80, branches: 70`
- **Archivos:** `vitest.config.ts` (nuevo)
- **Líneas estimadas:** ~55
- **Verifica:** `yarn test:run --passWithNoTests` no lanza errores de módulo ni WASM
- **REQ:** REQ-001, REQ-002, REQ-006

---

#### TASK-003: Crear tsconfig.test.json
- **Acción:** Crear `tsconfig.test.json` en la raíz que extiende `./tsconfig.json` con:
  - `compilerOptions.types: ['vitest/globals', '@testing-library/jest-dom']`
  - `compilerOptions.noEmit: true`
  - `compilerOptions.verbatimModuleSyntax: true`
  - `include: ['src/**/*.ts', 'src/**/*.tsx', 'vitest.config.ts']`
- **Archivos:** `tsconfig.test.json` (nuevo)
- **Líneas estimadas:** ~18
- **Verifica:** `yarn tsc --noEmit --project tsconfig.test.json` no reporta errores de tipo sobre `describe`/`it`/`expect` en archivos de test
- **REQ:** REQ-001

---

#### TASK-004: Agregar scripts a package.json
- **Acción:** Agregar en la sección `scripts` de `package.json`:
  ```
  "test": "vitest"
  "test:run": "vitest run"
  "test:coverage": "vitest run --coverage"
  "test:ui": "vitest --ui"
  "type-check:test": "tsc --noEmit --project tsconfig.test.json"
  ```
- **Archivos:** `package.json` — sección `scripts` (+5 entradas)
- **Líneas estimadas:** 7 (delta neto)
- **Verifica:** `yarn test:run --passWithNoTests` sale con código 0
- **REQ:** REQ-003

---

#### TASK-005: Crear src/test/setup.ts
- **Acción:** Crear `src/test/setup.ts` con un único import:
  ```typescript
  import '@testing-library/jest-dom'
  ```
- **Archivos:** `src/test/setup.ts` (nuevo)
- **Líneas estimadas:** 3
- **Verifica:** Archivo existe y es importado por `vitest.config.ts` como `setupFiles`
- **REQ:** REQ-002

---

### Group 2: Mocks de infraestructura
**Dependencias:** Group 1 (TASK-001 debe estar completo para que los tipos estén disponibles)  
**Puede ejecutarse en:** batch-1 (en paralelo con TASK-003, TASK-004, TASK-005)  
**Responsabilidad:** Aislar WASM y Supabase del entorno de test

---

#### TASK-006: Crear mock de @powersync/react
- **Acción:** Crear `src/__mocks__/@powersync/react.ts` con stubs exportados:
  - `PowerSyncContext` — `createContext<AbstractPowerSyncDatabase | null>(null)`
  - `useQuery` — `vi.fn()` retornando `{ data: [], isLoading: false, error: null, isFetching: false, refresh: vi.fn() }`
  - `useSuspenseQuery` — mismo shape que `useQuery`
  - `usePowerSync` — `vi.fn()` retornando `{ execute, writeTransaction, getAll, get }` todos como `vi.fn()`
  - `PowerSyncProvider` — función que retorna `children` directamente (sin WASM)
  - Usar `import type` para todos los imports de tipos (respetar `verbatimModuleSyntax: true`)
- **Archivos:** `src/__mocks__/@powersync/react.ts` (nuevo, directorio `@powersync/` a crear)
- **Líneas estimadas:** ~45
- **Verifica:** Un test que importe `useQuery` de `@powersync/react` recibe el stub sin errores WASM
- **REQ:** REQ-002

---

#### TASK-007: Crear mock de @supabase/supabase-js
- **Acción:** Crear `src/__mocks__/@supabase/supabase-js.ts` con:
  - `mockSupabaseClient` — objeto con `auth` (getSession, getUser, signInWithPassword, signOut, onAuthStateChange todos `vi.fn()`), `from` (`vi.fn()` con método chain select/insert/update/delete/eq/single), `functions.invoke`, `storage.from`
  - `export const createClient = vi.fn().mockReturnValue(mockSupabaseClient)`
  - Usar `import type` para imports de tipos
- **Archivos:** `src/__mocks__/@supabase/supabase-js.ts` (nuevo, directorio `@supabase/` a crear)
- **Líneas estimadas:** ~35
- **Verifica:** Un test que use el cliente Supabase no hace llamadas HTTP reales
- **REQ:** REQ-002

---

### Group 3: Tests de src/lib/
**Dependencias:** Group 1, Group 2  
**Puede ejecutarse en:** batch-2 (todos en paralelo entre sí)  
**Responsabilidad:** Cobertura de las utilidades puras en src/lib/

---

#### TASK-008: Tests de currency.ts
- **Acción:** Crear `src/lib/__tests__/currency.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `usdToBs()` — conversión positiva, tasa cero retorna 0, redondeo a 2 decimales (1 * 36.1234 = 36.12), tasa con 4 decimales de precisión
  - `bsToUsd()` — conversión correcta, tasa cero retorna 0 (evita división por cero), bs cero retorna 0
  - `formatUsd()` — símbolo `$`, 2 decimales, NaN retorna `'$0.00'`, string numérico funciona, valor 0
  - `formatBs()` — prefijo `'Bs.'`, NaN retorna `'Bs. 0,00'`, valor 1234.56
  - `formatTasa()` — 4 decimales con coma, NaN retorna `'0,0000'`
  - Cubrir SCN-003, SCN-004, SCN-014
- **Archivos:** `src/lib/__tests__/currency.test.ts` (nuevo, directorio `__tests__/` a crear)
- **Líneas estimadas:** ~85
- **Verifica:** `yarn test:run` pasa todos los tests de este archivo; cobertura `src/lib/currency.ts` ≥ 90%
- **REQ:** REQ-004, REQ-006 (AC-006-5)

---

#### TASK-009: Tests de identity.ts
- **Acción:** Crear `src/lib/__tests__/identity.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `sanitizeCedula()` — dígitos puros → prepend V, con guiones/puntos, prefijo E se preserva (SCN-006)
  - `isValidCedula()` — formatos válidos e inválidos, longitud límite (5 y 9 dígitos)
  - `sanitizeRif()` — zero-pad a 9 dígitos, prefijo J, prefijo P
  - `isValidRif()` — prefijo inválido X retorna false, dígito verificador incorrecto retorna false, construir RIF válido con `calcRifCheckDigit` (SCN-005)
  - `calcRifCheckDigit()` — cálculo Módulo 11 con valor conocido
  - `normalizarDecimalComa()` — `'250,50'` → `'250.50'`, `'1.250,50'` → `'1250.50'`, number pasa sin cambio (SCN-013)
- **Archivos:** `src/lib/__tests__/identity.test.ts` (nuevo)
- **Líneas estimadas:** ~90
- **Verifica:** `yarn test:run` pasa; funciones de identity cubiertas > 85%
- **REQ:** REQ-004

---

#### TASK-010: Tests de dates.ts
- **Acción:** Crear `src/lib/__tests__/dates.test.ts` con docblock `@vitest-environment node` usando `vi.setSystemTime` cubriendo:
  - `todayStr()` — fijar fecha `2026-03-15`, retorna `'2026-03-15'` (SCN-010)
  - `daysAgo()` — n=7 retorna `'2026-03-08'`, n=0 retorna hoy, cruce de mes n=15 retorna `'2026-02-28'`
  - `startOfMonth()` — retorna `'2026-03-01'`
  - Usar `beforeEach`/`afterEach` con `vi.setSystemTime` y `vi.useRealTimers()`
- **Archivos:** `src/lib/__tests__/dates.test.ts` (nuevo)
- **Líneas estimadas:** ~45
- **Verifica:** `yarn test:run` pasa; mocking de tiempo no afecta otros tests
- **REQ:** REQ-004

---

#### TASK-011: Tests de utils.ts
- **Acción:** Crear `src/lib/__tests__/utils.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `cn()` — merge básico de clases, conflicto Tailwind resuelto correctamente (e.g. `text-red-500` + `text-blue-500` → `text-blue-500`), valores falsy ignorados
  - `getPageNumbers()` — 3 páginas retorna `[1, 2, 3]` (sin dots), 1 página retorna `[1]`, página en medio de 10 contiene `1, '...', currentPage-1, currentPage, currentPage+1, '...', 10` (SCN-011)
- **Archivos:** `src/lib/__tests__/utils.test.ts` (nuevo)
- **Líneas estimadas:** ~30
- **Verifica:** `yarn test:run` pasa
- **REQ:** REQ-004 (AC-004-3)

---

#### TASK-012: Tests de format.ts
- **Acción:** Crear `src/lib/__tests__/format.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `formatDate()` — `'2026-03-15'` → `'15/03/2026'`, string inválido retorna el input original (no lanza)
  - `formatDateTime()` — `'2026-03-15T10:30:00Z'` → incluye fecha y hora, string inválido retorna el input
  - `formatNumber()` — valor numérico con 2 decimales en locale `es-VE`, NaN retorna `'0'`, decimals custom (e.g. 4)
- **Archivos:** `src/lib/__tests__/format.test.ts` (nuevo)
- **Líneas estimadas:** ~35
- **Verifica:** `yarn test:run` pasa; `date-fns` funciona sin mocks adicionales
- **REQ:** REQ-004 (AC-004-5)

---

### Group 4: Tests de schemas Zod críticos
**Dependencias:** Group 1, Group 2  
**Puede ejecutarse en:** batch-2 (en paralelo con Group 3)  
**Responsabilidad:** Validar reglas de negocio codificadas en schemas Zod

---

#### TASK-013: Tests de producto-schema.ts
- **Acción:** Crear `src/features/inventario/schemas/__tests__/producto-schema.test.ts` con docblock `@vitest-environment node` cubriendo:
  - Parseo válido con objeto base (código, tipo P, costo y precio correctos)
  - Transform `codigo` y `nombre` a mayúsculas
  - Refine precio_venta ≥ costo: falla con precio 3 y costo 5, path del error es `'precio_venta_usd'` (SCN-007)
  - Límite exacto: precio_venta === costo → success
  - Combo tipo C: precio_venta < costo → success (refine saltado)
  - Refine precio_mayor ≤ precio_venta: falla con precio_mayor 15 y precio_venta 10, path `'precio_mayor_usd'`
  - precio_mayor null → success
- **Archivos:** `src/features/inventario/schemas/__tests__/producto-schema.test.ts` (nuevo, directorio `__tests__/` a crear)
- **Líneas estimadas:** ~75
- **Verifica:** `yarn test:run` pasa; reglas de negocio críticas de precio cubiertas
- **REQ:** REQ-005 (AC-005-1 a AC-005-4)

---

#### TASK-014: Tests de cliente-schema.ts
- **Acción:** Crear `src/features/clientes/schemas/__tests__/cliente-schema.test.ts` con docblock `@vitest-environment node` cubriendo:
  - Parseo válido con `identificacion: 'V-22.448.021'` → `result.data.identificacion === 'V22448021'` (sanitizado, SCN-008)
  - `nombre` transformado a mayúsculas
  - Prefijo inválido `'X99999999'` → `result.success === false`
  - String muy corto → falla validación min(3)
  - `limite_credito_usd: 0` → válido; valor negativo → falla
- **Archivos:** `src/features/clientes/schemas/__tests__/cliente-schema.test.ts` (nuevo, directorio `__tests__/` a crear)
- **Líneas estimadas:** ~45
- **Verifica:** `yarn test:run` pasa; sanitización y validación de cédula verificadas
- **REQ:** REQ-005 (AC-005-5, AC-005-6)

---

#### TASK-015: Tests de tasa-schema.ts
- **Acción:** Crear `src/features/configuracion/schemas/__tests__/tasa-schema.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `valor: 0` → `result.success === false` (SCN-009)
  - `valor: -1` → `result.success === false`
  - `valor: 1000000` (> 999999) → `result.success === false`
  - `valor: 36.5` → `result.success === true`
  - `valor: 0.0001` (mínimo positivo) → `result.success === true`
  - `valor: 999999` (límite exacto) → `result.success === true`
- **Archivos:** `src/features/configuracion/schemas/__tests__/tasa-schema.test.ts` (nuevo, directorio `__tests__/` a crear)
- **Líneas estimadas:** ~30
- **Verifica:** `yarn test:run` pasa; validación de tasa cambiaria verificada
- **REQ:** REQ-005 (AC-005-7, AC-005-8)

---

#### TASK-016: Tests de venta-schema.ts
- **Acción:** Crear `src/features/ventas/schemas/__tests__/venta-schema.test.ts` con docblock `@vitest-environment node` cubriendo:
  - `lineaVentaSchema` con `cantidad: 0` → `result.success === false` (AC-005-10)
  - `lineaVentaSchema` con `cantidad: -1` → `result.success === false`
  - `lineaVentaSchema` con `cantidad: 1`, `precio_unitario_usd: 0` → `result.success === true`
  - `pagoEntrySchema` con `monto: 0` → `result.success === false`
  - `pagoEntrySchema` con moneda válida `'USD'` y `'BS'` → success
  - `pagoEntrySchema` con moneda inválida → `result.success === false`
- **Archivos:** `src/features/ventas/schemas/__tests__/venta-schema.test.ts` (nuevo, directorio `__tests__/` a crear)
- **Líneas estimadas:** ~40
- **Verifica:** `yarn test:run` pasa
- **REQ:** REQ-005 (AC-005-9, AC-005-10)

---

## Dependency Graph

```
batch-1 ─────────────────────────────────── batch-2
│                                           │
TASK-001 (yarn add)                         ├─ TASK-008 (currency.test.ts)
    │                                       ├─ TASK-009 (identity.test.ts)
    ├── TASK-002 (vitest.config.ts)         ├─ TASK-010 (dates.test.ts)
    ├── TASK-003 (tsconfig.test.json)       ├─ TASK-011 (utils.test.ts)
    ├── TASK-004 (package.json scripts)     ├─ TASK-012 (format.test.ts)
    ├── TASK-005 (src/test/setup.ts)        ├─ TASK-013 (producto-schema.test.ts)
    ├── TASK-006 (@powersync mock)          ├─ TASK-014 (cliente-schema.test.ts)
    └── TASK-007 (@supabase mock)           ├─ TASK-015 (tasa-schema.test.ts)
                                            └─ TASK-016 (venta-schema.test.ts)

TASK-001 debe completarse ANTES que TASK-002..007 (tipos de vitest disponibles)
TASK-002..007 deben completarse ANTES que TASK-008..016 (runner configurado)
TASK-008..016 son independientes entre sí (paralelo total)
```

---

## Batch Plan

| Batch | Tasks | Puede paralelizarse | PR recomendado |
|-------|-------|---------------------|----------------|
| batch-1a | TASK-001 | No (bloqueante) | — |
| batch-1b | TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007 | **Sí** (todos en paralelo) | PR-1 (~200 líneas) |
| batch-2 | TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016 | **Sí** (todos en paralelo) | PR-2 (~445 líneas) |

**Total tasks:** 16  
**Total líneas estimadas:** ~645

---

## Chained PR Plan

### PR-1: `feat: testing infrastructure — vitest config + mocks`
- TASK-001 + TASK-002 + TASK-003 + TASK-004 + TASK-005 + TASK-006 + TASK-007
- Líneas: ~198 (dentro del presupuesto 400)
- Incluye: runner funcional con `yarn test:run --passWithNoTests` → exit code 0

### PR-2: `feat: unit tests — lib utilities + critical Zod schemas` *(base: PR-1)*
- TASK-008 a TASK-016
- Líneas: ~445 (supera presupuesto individual, pero es todo test code — sin lógica de negocio)
- Alternativa: dividir en PR-2a (lib tests) y PR-2b (schema tests) si el reviewer lo prefiere

---

## Definition of Done

- [ ] `yarn test:run` pasa todos los tests con exit code 0
- [ ] `yarn test:run` muestra exactamente 0 errores de tipo `Cannot load WASM` ni `WebAssembly is not defined`
- [ ] `yarn type-check` sin errores (tsconfig.json de producción no contaminado)
- [ ] `yarn type-check:test` sin errores (tsconfig.test.json con tipos vitest globals)
- [ ] `yarn build` sin cambios (vite.config.ts no tocado)
- [ ] `yarn test:coverage` genera directorio `coverage/` con `index.html`
- [ ] Cobertura de `src/lib/currency.ts` ≥ 90% líneas (AC-006-5)
- [ ] Cobertura global de `src/lib/**` ≥ 80% líneas (threshold configurado)
- [ ] Los 16 tests files cubren los 14 scenarios del spec
- [ ] Ningún test usa `any` explícito
