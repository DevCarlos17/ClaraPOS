# Proposal: Setup infraestructura de testing con Vitest

## Intent

Establecer una infraestructura de testing automatizado en ClaraPOS usando Vitest, para poder verificar la lógica financiera crítica y los schemas de validación con confianza, eliminando el riesgo actual de regresiones silenciosas en un sistema multi-tenant con operaciones inmutables.

## Problem Statement

ClaraPOS no tiene ningún archivo de test (`*.test.ts` / `*.spec.ts`). Esto significa que cada cambio en lógica financiera — cálculos bimonetarios, validaciones Zod, transformaciones de datos — se verifica únicamente a mano, en el navegador, por un humano. Para un sistema que maneja inventario, cuentas por cobrar, retenciones impositivas y registros inmutables, este nivel de verificación es insuficiente.

El riesgo concreto es alto: un error en `currency.ts` (conversión USD↔Bs), en un schema Zod de facturas, o en la lógica de numeración por empresa podría pasar desapercibido durante días, afectar registros financieros que no se pueden editar (inmutabilidad), y comprometer la integridad de múltiples tenants simultáneamente.

Al resolver esto se desbloquea la capacidad de: (a) hacer refactors con red de seguridad, (b) documentar comportamiento esperado como tests ejecutables, (c) detectar regresiones en CI antes de que lleguen a producción.

## Scope

### In scope

- Instalación y configuración de Vitest 3.x como runner de tests
- Configuración standalone `vitest.config.ts` (independiente de `vite.config.ts`)
- Configuración de `tsconfig.test.json` con tipos de Vitest globals
- Setup file `src/test/setup.ts` con `@testing-library/jest-dom`
- Mocks manuales para capas no testeables en Node.js:
  - `src/__mocks__/@powersync/react.ts` (WASM/SQLite no corre en Node)
  - `src/__mocks__/@supabase/supabase-js.ts`
- Scripts en `package.json`: `test`, `test:run`, `test:coverage`, `test:ui`
- Tests de humo para las capas inmediatamente testeables:
  - `src/lib/currency.ts` — conversiones USD↔Bs, formateo
  - `src/lib/format.ts` — formateo de fechas y números
  - `src/lib/utils.ts` — función `cn()` y utilidades puras
  - Schemas Zod representativos (al menos 3-5 de los 41 existentes)
- Configuración de cobertura con `@vitest/coverage-v8`
- UI de Vitest opcional (`@vitest/ui`) para exploración local

### Out of scope

- Tests de componentes React (requieren setup adicional de router, providers)
- Tests de hooks que usan PowerSync (requieren mocks complejos de escritura transaccional)
- Tests de integración con Supabase (requieren entorno real o emulador)
- Tests E2E (Playwright/Cypress) — son un cambio separado
- Cobertura del 100% de los 41 schemas Zod — solo los representativos como punto de partida
- Configuración de CI/CD para ejecutar tests automáticamente — cambio posterior
- Tests del módulo Clínica (aún no implementado)

## Approach

**Vitest standalone** (no extender `vite.config.ts`): el plugin `vite-plugin-pwa` y `vite-plugin-wasm` / `vite-plugin-top-level-await` en `vite.config.ts` son incompatibles con el entorno Node.js de Vitest. Extender esa config haría que el runner falle al intentar procesar plugins diseñados para el browser. La solución es un `vitest.config.ts` propio que reimporte solo lo necesario (aliases de path `@/`), sin plugins de browser.

**happy-dom sobre jsdom**: ClaraPOS usa un stack ESM nativo (React 19, Vite 7, módulos ES). `happy-dom` tiene mejor soporte para ESM y APIs modernas del DOM que `jsdom`, con menor overhead. Para los tests de utilidades puras (sin DOM) se puede usar `environment: 'node'` directamente.

**Exclusión de WASM/PowerSync**: `wa-sqlite` y el motor de PowerSync requieren WebAssembly, que no está disponible en Node.js de forma estable. La estrategia es mock manual: `src/__mocks__/@powersync/react.ts` exporta versiones stub de `usePowerSync`, `useQuery`, `useSuspenseQuery` y el provider. Esto permite testear hooks que _usan_ PowerSync sin ejecutar WASM.

**Punto de entrada con capas puras**: la estrategia inicial es testear primero las capas sin dependencias externas (`src/lib/`), que son también las más críticas para la corrección financiera. Los schemas Zod son el segundo blanco natural — validación pura, sin efectos secundarios, 41 schemas disponibles.

## Constraints

- **WASM no corre en Node.js**: PowerSync/wa-sqlite requiere browser o entorno WASM-capable. Los mocks son obligatorios, no opcionales.
- **Vitest debe ser compatible con Vite 7**: usar Vitest 3.x (la versión 2.x no soporta Vite 7 completamente).
- **@testing-library/react v16**: versión requerida para React 19. La v15 no soporta las nuevas APIs de React 19.
- **Package manager**: solo `yarn`. Nunca `npm install`.
- **TypeScript estricto**: los tests deben pasar `yarn type-check` sin errores. No usar `any` en tests.
- **Sin modificar `vite.config.ts`**: la config de producción no debe tocarse para no romper el build ni el deploy.
- **Presupuesto de tiempo**: setup + primeros tests debe completarse en una sola sesión. No bloquear el desarrollo del módulo Clínica.

## Success Criteria

- [ ] `yarn test:run` ejecuta sin errores en entorno limpio (sin browser abierto)
- [ ] `yarn type-check` pasa sin errores después de agregar `tsconfig.test.json`
- [ ] Tests de `src/lib/currency.ts` cubren: `usdToBs()`, `bsToUsd()`, `formatUsd()`, `formatBs()` con casos límite (tasa cero, valores negativos, precisión decimal)
- [ ] Tests de al menos 3 schemas Zod cubren: caso válido, caso inválido, y mensaje de error esperado
- [ ] `yarn test:coverage` genera reporte de cobertura en `coverage/` con métricas visibles
- [ ] El mock de `@powersync/react` permite que un test que importa un hook PowerSync compile y corra sin WASM
- [ ] `yarn build` sigue funcionando sin cambios (la config de Vitest no interfiere con Vite)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Plugin de Vite incompatible contamina Vitest config | Alta | Alto | Config standalone `vitest.config.ts` que NO extiende `vite.config.ts` |
| `@testing-library/react` v16 tiene breaking changes vs v15 | Media | Medio | Instalar directamente v16; no existe v15 en el proyecto actualmente |
| Tipos de Vitest globals en conflicto con TypeScript global de jest | Baja | Bajo | `tsconfig.test.json` separado, solo incluido en contexto de tests |
| Mock de PowerSync incompleto rompe imports en tests de hooks | Media | Medio | Empezar con mocks mínimos; ampliar cuando se escriban tests de hooks |
| WASM leak en tests (worker thread intenta cargar .wasm) | Baja | Alto | `exclude` explícito de archivos PowerSync/wa-sqlite en vitest.config.ts |

## Dependencies

- **Vite 7** ya instalado — compatible con Vitest 3.x sin cambios adicionales
- **TypeScript strict** ya configurado en `tsconfig.json` — extender en `tsconfig.test.json`
- **Acceso de escritura al `package.json`** para agregar scripts y devDependencies
- No depende de ningún otro cambio pendiente en el backlog

## Estimated Effort

**S** — La infraestructura es configuración y archivos nuevos, sin tocar código de producción existente. Los primeros tests cubren capas puras ya escritas. Estimado: 2-4 horas de trabajo efectivo. El riesgo principal (compatibilidad WASM) ya está analizado y tiene solución definida.
