# Spec: setup infraestructura de testing con vitest

## Requirements

### REQ-001: Configuración de Vitest standalone

Vitest debe configurarse como runner independiente que NO extiende `vite.config.ts`,
para evitar cargar plugins de WASM y PWA que no son compatibles con el entorno Node.js.

**Acceptance Criteria:**
- AC-001-1: Existe `vitest.config.ts` en la raíz del proyecto con `environment: 'node'` y sin importar `vite.config.ts`.
- AC-001-2: `vitest.config.ts` define `include: ['src/**/*.{test,spec}.ts']` y excluye archivos `.tsx` (componentes React).
- AC-001-3: El archivo importa solo `defineConfig` de `vitest/config` (no de `vite`).
- AC-001-4: El path alias `@/` está configurado en `vitest.config.ts` apuntando a `./src` sin depender de `vite.config.ts`.
- AC-001-5: Existe `tsconfig.test.json` que extiende `tsconfig.json` y agrega `types: ['vitest/globals']` para que `describe`, `it`, `expect` sean globals sin importar.

### REQ-002: Mocks de infraestructura WASM y servicios externos

Los módulos que dependen de WASM (PowerSync/wa-sqlite) o de Supabase no deben cargarse
durante los tests unitarios. Deben ser reemplazados por mocks explícitos.

**Acceptance Criteria:**
- AC-002-1: Existe `src/test/setup.ts` configurado como `setupFiles` en `vitest.config.ts`.
- AC-002-2: `src/test/setup.ts` mockea `@powersync/react` y `@powersync/web` con `vi.mock()` retornando stubs seguros (sin instanciar WASM).
- AC-002-3: `src/test/setup.ts` mockea el módulo de Supabase (`@/core/auth/supabase-client` o ruta equivalente) con un cliente stub.
- AC-002-4: Ejecutar `yarn test:run` en un proyecto sin wa-sqlite disponible en Node.js NO lanza errores de tipo `Cannot load WASM` ni `WebAssembly is not defined`.
- AC-002-5: Los mocks NO afectan a los módulos bajo `src/lib/` (utilidades puras sin dependencias de infraestructura).

### REQ-003: Scripts de ejecución en package.json

Los scripts deben seguir las convenciones del proyecto y usar `yarn` como runner.

**Acceptance Criteria:**
- AC-003-1: `package.json` incluye `"test": "vitest"` para modo watch interactivo.
- AC-003-2: `package.json` incluye `"test:run": "vitest run"` para ejecución única (CI-friendly).
- AC-003-3: `package.json` incluye `"test:coverage": "vitest run --coverage"` para generar reporte de cobertura.
- AC-003-4: `yarn test:run` finaliza con código de salida 0 cuando todos los tests pasan.
- AC-003-5: `yarn test:run` finaliza con código de salida distinto de 0 cuando al menos un test falla.

### REQ-004: Tests de utilidades puras (src/lib/)

Cada archivo de utilidades puras debe tener su correspondiente archivo de tests que verifique
el comportamiento documentado incluyendo casos borde.

**Acceptance Criteria:**
- AC-004-1: Existe `src/lib/currency.test.ts` con tests para `usdToBs`, `bsToUsd`, `formatUsd`, `formatBs`, `formatTasa`.
- AC-004-2: Existe `src/lib/identity.test.ts` con tests para `isValidRif`, `calcRifCheckDigit`, `isValidCedula`, `sanitizeCedula`, `sanitizeRif`, `normalizarDecimalComa`.
- AC-004-3: Existe `src/lib/utils.test.ts` con tests para `cn` (class merging) y `getPageNumbers`.
- AC-004-4: Existe `src/lib/dates.test.ts` con tests para `todayStr`, `daysAgo`, `startOfMonth`.
- AC-004-5: Existe `src/lib/format.test.ts` con tests para `formatDate`, `formatDateTime`, `formatNumber`.
- AC-004-6: Todos los tests de `src/lib/` pasan sin mocks adicionales (las utilidades son puras).
- AC-004-7: Los casos borde están cubiertos: tasa 0 en `bsToUsd`, NaN en formatters, strings vacíos en identity, valores límite en `getPageNumbers`.

### REQ-005: Tests de schemas Zod críticos

Los schemas Zod que codifican reglas de negocio críticas (precios, identidad fiscal,
validación de pagos) deben tener tests que verifiquen tanto el camino feliz como las
violaciones de cada regla.

**Acceptance Criteria:**
- AC-005-1: Existe `src/features/inventario/schemas/producto-schema.test.ts` con tests del `productoSchema`.
- AC-005-2: `producto-schema.test.ts` verifica el refine `precio_venta_usd >= costo_usd` con datos válidos e inválidos.
- AC-005-3: `producto-schema.test.ts` verifica el refine `precio_mayor_usd <= precio_venta_usd` con datos válidos e inválidos.
- AC-005-4: `producto-schema.test.ts` verifica que combos (`tipo: 'C'`) omiten el refine de precio.
- AC-005-5: Existe `src/features/clientes/schemas/cliente-schema.test.ts` con tests del `clienteSchema`.
- AC-005-6: `cliente-schema.test.ts` verifica que `identificacion` pasa por `sanitizeCedula` + `isValidCedula` correctamente.
- AC-005-7: Existe `src/features/configuracion/schemas/tasa-schema.test.ts` con tests del `tasaSchema`.
- AC-005-8: `tasa-schema.test.ts` verifica que `valor <= 0` falla y `valor > 999999` falla.
- AC-005-9: Existe `src/features/ventas/schemas/venta-schema.test.ts` con tests de `lineaVentaSchema` y `pagoEntrySchema`.
- AC-005-10: `venta-schema.test.ts` verifica que `cantidad <= 0` falla en `lineaVentaSchema`.

### REQ-006: Cobertura de código

La cobertura debe estar habilitada y accesible sin configuración adicional del desarrollador.

**Acceptance Criteria:**
- AC-006-1: `@vitest/coverage-v8` está instalado como devDependency.
- AC-006-2: `vitest.config.ts` define configuración de `coverage` con `provider: 'v8'`, `reporter: ['text', 'html']`, e `include: ['src/lib/**', 'src/features/**/schemas/**']`.
- AC-006-3: Ejecutar `yarn test:coverage` genera el directorio `coverage/` en la raíz del proyecto.
- AC-006-4: El reporte muestra cobertura de líneas, funciones y ramas para los archivos de `src/lib/`.
- AC-006-5: La cobertura de `src/lib/currency.ts` alcanza al menos 90% de líneas.

---

## Scenarios

### SCN-001: Instalación limpia — test runner arranca sin errores

**Given** el proyecto ClaraPOS con `vitest.config.ts`, `src/test/setup.ts` y los archivos de test creados
**When** se ejecuta `yarn test:run`
**Then** el proceso finaliza con código de salida 0, sin errores de módulo no encontrado ni warnings de WASM, y la salida muestra "X tests passed"

---

### SCN-002: WASM no rompe el test runner

**Given** `@powersync/web` y `@powersync/react` instalados (con dependencias WASM)
**When** `vitest.config.ts` usa `environment: 'node'` y `src/test/setup.ts` mockea esos módulos con `vi.mock()`
**Then** ningún test lanza `WebAssembly is not defined`, `Cannot load WASM module`, ni `ReferenceError: WebAssembly`

---

### SCN-003: Cálculo bimonetario — usdToBs redondea a 2 decimales

**Given** la función `usdToBs` de `src/lib/currency.ts`
**When** se llama `usdToBs(100, 36.5)`
**Then** retorna `3650.00` (number, no string)

**When** se llama `usdToBs(1, 36.123456)`
**Then** retorna `36.12` (redondeado a 2 decimales, no `36.123456`)

---

### SCN-004: Conversión inversa — bsToUsd con tasa cero

**Given** la función `bsToUsd` de `src/lib/currency.ts`
**When** se llama `bsToUsd(500, 0)`
**Then** retorna `0` (sin lanzar división por cero ni `Infinity`)

**When** se llama `bsToUsd(3650, 36.5)`
**Then** retorna `100.00`

---

### SCN-005: Validación de RIF venezolano con Módulo 11

**Given** la función `isValidRif` de `src/lib/identity.ts`
**When** se llama `isValidRif('J001234560')` con dígito verificador incorrecto
**Then** retorna `false`

**When** se llama con un RIF con prefijo inválido como `'X001234560'`
**Then** retorna `false`

**When** se llama `isValidRif('J000000000')` (dígito verificador: `calcRifCheckDigit('J00000000')`)
**Then** la función `calcRifCheckDigit` calcula el dígito correcto para que el test pueda construir un RIF válido verificable

---

### SCN-006: Sanitización de cédula — auto-prepend de prefijo V

**Given** la función `sanitizeCedula` de `src/lib/identity.ts`
**When** se llama `sanitizeCedula('22448021')` (dígitos puros sin prefijo, longitud 6-8)
**Then** retorna `'V22448021'`

**When** se llama `sanitizeCedula('V-22.448.021')`
**Then** retorna `'V22448021'` (sin guiones ni puntos)

**When** se llama `sanitizeCedula('E12345678')`
**Then** retorna `'E12345678'` (prefijo E se preserva)

---

### SCN-007: Schema producto — refines de precio

**Given** el `productoSchema` de `src/features/inventario/schemas/producto-schema.ts`
**When** se parsea un objeto con `costo_usd: 100, precio_venta_usd: 80` (precio < costo) y `tipo: 'P'`
**Then** `schema.safeParse(data).success === false` y el error está en el path `['precio_venta_usd']`

**When** se parsea con `costo_usd: 50, precio_venta_usd: 100, precio_mayor_usd: 120` (precio mayor > venta)
**Then** `schema.safeParse(data).success === false` y el error está en el path `['precio_mayor_usd']`

**When** `tipo: 'C'` (combo) con `precio_venta_usd < costo_usd`
**Then** `schema.safeParse(data).success === true` (combos omiten el refine de precio)

---

### SCN-008: Schema cliente — validación de identificación

**Given** el `clienteSchema` de `src/features/clientes/schemas/cliente-schema.ts`
**When** se parsea `{ identificacion: 'V-22.448.021', nombre: 'CLIENTE TEST', limite_credito_usd: 0 }`
**Then** `result.success === true` y `result.data.identificacion === 'V22448021'` (sanitizado)

**When** se parsea con `identificacion: 'X99999999'` (prefijo inválido)
**Then** `result.success === false` con mensaje de error de formato inválido

---

### SCN-009: Schema tasa — validaciones de rango

**Given** el `tasaSchema` de `src/features/configuracion/schemas/tasa-schema.ts`
**When** se parsea `{ valor: 0 }`
**Then** `result.success === false` (debe ser positivo)

**When** se parsea `{ valor: -1 }`
**Then** `result.success === false`

**When** se parsea `{ valor: 1000000 }` (supera el máximo de 999999)
**Then** `result.success === false`

**When** se parsea `{ valor: 36.5 }`
**Then** `result.success === true`

---

### SCN-010: Utilidades de fechas — formato YYYY-MM-DD

**Given** las funciones `todayStr`, `daysAgo`, `startOfMonth` de `src/lib/dates.ts`
**When** se llama `todayStr()`
**Then** retorna un string que matches `/^\d{4}-\d{2}-\d{2}$/`

**When** se llama `daysAgo(0)`
**Then** retorna el mismo valor que `todayStr()`

**When** se llama `startOfMonth()`
**Then** retorna un string que termina en `-01` y matches `/^\d{4}-\d{2}-01$/`

---

### SCN-011: Paginación — getPageNumbers con pocos y muchos items

**Given** la función `getPageNumbers` de `src/lib/utils.ts`
**When** se llama `getPageNumbers(1, 3)` (3 páginas totales ≤ 5)
**Then** retorna `[1, 2, 3]` (sin puntos suspensivos)

**When** se llama `getPageNumbers(5, 10)` (página en medio)
**Then** el resultado contiene `1`, `'...'`, `4`, `5`, `6`, `'...'`, `10`

**When** se llama `getPageNumbers(1, 1)`
**Then** retorna `[1]`

---

### SCN-012: Cobertura generada correctamente

**Given** `@vitest/coverage-v8` instalado y configurado en `vitest.config.ts`
**When** se ejecuta `yarn test:coverage`
**Then** existe el directorio `coverage/` con al menos `index.html` y el reporte de texto en stdout muestra columnas `% Stmts`, `% Branch`, `% Funcs`, `% Lines`

---

### SCN-013: normalizarDecimalComa — separador venezolano

**Given** la función `normalizarDecimalComa` de `src/lib/identity.ts`
**When** se llama con `'250,50'`
**Then** retorna `'250.50'`

**When** se llama con `'1.250,50'`
**Then** retorna `'1250.50'` (elimina el punto de miles)

**When** se llama con `250` (number, no string)
**Then** retorna el valor original sin transformar (`250`)

---

### SCN-014: formatBs y formatUsd — valores degenerados

**Given** las funciones `formatUsd` y `formatBs` de `src/lib/currency.ts`
**When** se llama `formatUsd(NaN)` o `formatUsd('texto')`
**Then** retorna `'$0.00'` (valor por defecto, sin lanzar excepción)

**When** se llama `formatBs(NaN)` o `formatBs('abc')`
**Then** retorna `'Bs. 0,00'`

**When** se llama `formatUsd(1234567.89)`
**Then** retorna `'$1,234,567.89'` (separador de miles con coma, estilo en-US)
