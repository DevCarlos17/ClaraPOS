# Design: Setup infraestructura de testing con Vitest

## Architecture Overview

```
ClaraPOS (repo raiz)
│
├── vitest.config.ts          ← runner standalone (NO extiende vite.config.ts)
├── tsconfig.test.json        ← tipos Vitest globals, extiende tsconfig.json base
├── package.json              ← +4 scripts, +5 devDependencies
│
├── src/
│   ├── test/
│   │   └── setup.ts          ← jest-dom matchers globales
│   │
│   ├── __mocks__/            ← mocks manuales autodescubiertos por Vitest
│   │   ├── @powersync/
│   │   │   └── react.ts      ← stubs: useQuery, usePowerSync, PowerSyncContext
│   │   └── @supabase/
│   │       └── supabase-js.ts ← stubs: createClient
│   │
│   └── lib/
│       ├── __tests__/
│       │   ├── currency.test.ts
│       │   ├── identity.test.ts
│       │   └── dates.test.ts
│       └── ...
│
└── src/features/
    └── */schemas/__tests__/
        ├── producto-schema.test.ts
        ├── cliente-schema.test.ts
        └── tasa-schema.test.ts
```

**Flujo de ejecución:**

```
yarn test:run
  └─ Vitest lee vitest.config.ts (standalone)
       ├─ environment: happy-dom
       ├─ setupFiles: src/test/setup.ts → registra jest-dom matchers
       ├─ alias @/ → src/ via fileURLToPath
       ├─ exclude: **/node_modules/@powersync/**, **/node_modules/@journeyapps/**
       └─ globals: true → describe/it/expect sin import
           └─ tests en src/**/__tests__/**/*.test.ts
               ├─ src/lib/__tests__/currency.test.ts  (puro, environment: node)
               ├─ src/lib/__tests__/identity.test.ts  (puro, environment: node)
               ├─ src/lib/__tests__/dates.test.ts     (vi.setSystemTime)
               └─ src/features/*/schemas/__tests__/*.test.ts (Zod, puro)
```

## File Structure

```
Archivos NUEVOS a crear:
├── vitest.config.ts
├── tsconfig.test.json
├── src/test/setup.ts
├── src/__mocks__/@powersync/react.ts
├── src/__mocks__/@supabase/supabase-js.ts
├── src/lib/__tests__/currency.test.ts
├── src/lib/__tests__/identity.test.ts
├── src/lib/__tests__/dates.test.ts
├── src/features/inventario/schemas/__tests__/producto-schema.test.ts
├── src/features/clientes/schemas/__tests__/cliente-schema.test.ts
└── src/features/configuracion/schemas/__tests__/tasa-schema.test.ts

Archivos MODIFICADOS:
└── package.json  (scripts + devDependencies)

Archivos NO TOCADOS:
└── vite.config.ts, tsconfig.json, src/*, migrations/*
```

## Detailed Design

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    // Globals: describe, it, expect, vi sin necesidad de import explícito
    globals: true,

    // happy-dom: mejor soporte ESM que jsdom, menos overhead
    // Tests de funciones puras pueden sobreescribir con @vitest-environment node
    environment: 'happy-dom',

    // Setup file: registra @testing-library/jest-dom matchers globales
    setupFiles: ['./src/test/setup.ts'],

    // Patrón de archivos de test
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],

    // Excluir directorios con WASM y workers — no cargar en Node.js
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/node_modules/@powersync/**',
      '**/node_modules/@journeyapps/**',
    ],

    // Dependencias que NO deben procesarse como ESM por Vitest
    // wa-sqlite y powersync usan WASM binario — los mocks en __mocks__/ los interceptan
    server: {
      deps: {
        external: [
          '@journeyapps/wa-sqlite',
          '@powersync/web',
          '@powersync/common',
          '@powersync/kysely-driver',
        ],
      },
    },

    // Cobertura con v8 (nativo, sin instrumentación babel)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Solo medir cobertura en capas testeables (excluir rutas, layouts, providers)
      include: ['src/lib/**', 'src/features/**/schemas/**'],
      exclude: [
        'src/lib/auth-utils.ts',   // depende de Supabase client
        'src/lib/csv-parser.ts',   // I/O File — test de integración futuro
        'src/lib/excel-parser.ts', // I/O File — test de integración futuro
        'src/**/__tests__/**',
        'src/__mocks__/**',
      ],
      thresholds: {
        // Umbrales mínimos para las capas cubiertas
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },

  resolve: {
    alias: {
      // Mismo alias que vite.config.ts para que los imports @/ funcionen en tests
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

### tsconfig.test.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    // Vitest expone tipos globales via @vitest/globals
    // Al agregar aquí NO contaminamos el tsconfig.json de producción
    "types": ["vitest/globals", "@testing-library/jest-dom"],

    // Los tests sí pueden emitir (para que tsc --project tsconfig.test.json funcione)
    "noEmit": true,

    // Incluir archivos de test y mocks en el scope de type-checking
    "verbatimModuleSyntax": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "vitest.config.ts"
  ]
}
```

> **Nota**: `yarn type-check` usa `tsconfig.json` (producción). Para type-check de tests:
> `tsc --noEmit --project tsconfig.test.json`. Se puede agregar como script separado.

### src/test/setup.ts

```typescript
// Registra los matchers de @testing-library/jest-dom globalmente
// (toBeInTheDocument, toHaveValue, toBeDisabled, etc.)
import '@testing-library/jest-dom'
```

> Archivo intencionalmente mínimo. Los matchers de jest-dom se extienden sobre
> `expect` de Vitest automáticamente via el module augmentation de la librería.

### src/__mocks__/@powersync/react.ts

```typescript
// Mock manual de @powersync/react para entorno Node.js (sin WASM)
// Vitest resuelve este archivo automáticamente cuando un módulo importa
// '@powersync/react', gracias al directorio __mocks__ en src/

import { vi } from 'vitest'
import { createContext } from 'react'
import type { AbstractPowerSyncDatabase } from '@powersync/common'

// Contexto stub — permite que useContext no retorne undefined en tests
export const PowerSyncContext = createContext<AbstractPowerSyncDatabase | null>(null)

// useQuery stub: retorna estado vacío por defecto, configurable con vi.fn()
export const useQuery = vi.fn().mockReturnValue({
  data: [],
  isLoading: false,
  error: null,
  isFetching: false,
  refresh: vi.fn(),
})

// useSuspenseQuery stub
export const useSuspenseQuery = vi.fn().mockReturnValue({
  data: [],
  isLoading: false,
  error: null,
  isFetching: false,
  refresh: vi.fn(),
})

// usePowerSync stub: retorna objeto con métodos de escritura mockeados
export const usePowerSync = vi.fn().mockReturnValue({
  execute: vi.fn().mockResolvedValue({ rows: { _array: [], length: 0 } }),
  writeTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: { _array: [], length: 0 } }) }
    return cb(tx)
  }),
  getAll: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(null),
})

// PowerSyncProvider stub: renderiza children directamente sin inicializar WASM
export function PowerSyncProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  return children
}
```

### src/__mocks__/@supabase/supabase-js.ts

```typescript
// Mock manual de @supabase/supabase-js para entorno Node.js
// Solo mockea la superficie usada por ClaraPOS (auth + from().select/insert)

import { vi } from 'vitest'

const mockSupabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(),
  }),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
    }),
  },
}

export const createClient = vi.fn().mockReturnValue(mockSupabaseClient)
```

### package.json changes

```diff
  "scripts": {
    "dev": "vite --port 3000",
    "build": "vite build",
    "serve": "vite preview",
    "lint": "eslint",
    "format": "prettier --write .",
    "type-check": "tsc --noEmit",
+   "test": "vitest",
+   "test:run": "vitest run",
+   "test:coverage": "vitest run --coverage",
+   "test:ui": "vitest --ui",
+   "type-check:test": "tsc --noEmit --project tsconfig.test.json",
    "deploy": "yarn run build && wrangler deploy",
    "preview": "yarn run build && wrangler dev"
  },
  "devDependencies": {
    ...existing...
+   "vitest": "^3.2.0",
+   "@vitest/ui": "^3.2.0",
+   "@vitest/coverage-v8": "^3.2.0",
+   "happy-dom": "^15.0.0",
+   "@testing-library/react": "^16.0.0",
+   "@testing-library/user-event": "^14.0.0",
+   "@testing-library/jest-dom": "^6.0.0"
  }
```

> **Nota**: `@testing-library/react` v16 es requerida para React 19. La v15 no soporta
> las nuevas APIs de concurrent rendering de React 19.

## Test Patterns

### Pattern: test de función pura

Archivo: `src/lib/__tests__/currency.test.ts`

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { usdToBs, bsToUsd, formatUsd, formatBs, formatTasa } from '@/lib/currency'

describe('usdToBs()', () => {
  it('convierte correctamente con tasa positiva', () => {
    expect(usdToBs(10, 36.5)).toBe(365)
  })

  it('retorna 0 si usd es 0', () => {
    expect(usdToBs(0, 36.5)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    // 1.005 * 1 = 1.005 → debe redondear a 1.01 (banker's rounding no aplica aquí)
    expect(usdToBs(1.005, 1)).toBe(1.01)
  })

  it('maneja tasa con 4 decimales de precisión', () => {
    expect(usdToBs(100, 36.1234)).toBe(3612.34)
  })
})

describe('bsToUsd()', () => {
  it('convierte correctamente', () => {
    expect(bsToUsd(365, 36.5)).toBe(10)
  })

  it('retorna 0 si tasa es 0 (evita división por cero)', () => {
    expect(bsToUsd(100, 0)).toBe(0)
  })

  it('retorna 0 si bs es 0', () => {
    expect(bsToUsd(0, 36.5)).toBe(0)
  })
})

describe('formatUsd()', () => {
  it('formatea con símbolo $ y 2 decimales', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
  })

  it('retorna $0.00 para NaN', () => {
    expect(formatUsd('texto')).toBe('$0.00')
  })

  it('acepta string numérico', () => {
    expect(formatUsd('99.99')).toBe('$99.99')
  })

  it('formatea 0 correctamente', () => {
    expect(formatUsd(0)).toBe('$0.00')
  })
})

describe('formatBs()', () => {
  it('formatea con prefijo Bs.', () => {
    // Nota: el separador decimal en es-VE es coma
    expect(formatBs(1234.56).startsWith('Bs.')).toBe(true)
  })

  it('retorna Bs. 0,00 para NaN', () => {
    expect(formatBs('texto')).toBe('Bs. 0,00')
  })
})

describe('formatTasa()', () => {
  it('muestra 4 decimales con coma', () => {
    expect(formatTasa(36.5)).toBe('36,5000')
  })

  it('retorna 0,0000 para NaN', () => {
    expect(formatTasa('texto')).toBe('0,0000')
  })
})
```

### Pattern: test de schema Zod

Archivo: `src/features/inventario/schemas/__tests__/producto-schema.test.ts`

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { productoSchema } from '@/features/inventario/schemas/producto-schema'

// Datos base válidos reutilizables en cada test
const base = {
  codigo: 'PRD-001',
  tipo: 'P' as const,
  nombre: 'Crema hidratante',
  departamento_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  costo_usd: 5,
  precio_venta_usd: 10,
  stock_minimo: 0,
}

describe('productoSchema — caso válido', () => {
  it('parsea un producto bien formado', () => {
    const result = productoSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('transforma codigo y nombre a mayúsculas', () => {
    const result = productoSchema.safeParse({ ...base, codigo: 'prd-001', nombre: 'crema xyz' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.codigo).toBe('PRD-001')
      expect(result.data.nombre).toBe('CREMA XYZ')
    }
  })
})

describe('productoSchema — regla de negocio: precio_venta >= costo', () => {
  it('falla si precio_venta_usd < costo_usd', () => {
    const result = productoSchema.safeParse({ ...base, precio_venta_usd: 3, costo_usd: 5 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('precio_venta_usd')
    }
  })

  it('permite precio_venta_usd igual al costo (límite exacto)', () => {
    const result = productoSchema.safeParse({ ...base, precio_venta_usd: 5, costo_usd: 5 })
    expect(result.success).toBe(true)
  })

  it('combos (tipo C) saltan la validación de precio vs costo', () => {
    const result = productoSchema.safeParse({
      ...base,
      tipo: 'C',
      precio_venta_usd: 1,
      costo_usd: 99,
    })
    expect(result.success).toBe(true)
  })
})

describe('productoSchema — regla de negocio: precio_mayor <= precio_venta', () => {
  it('falla si precio_mayor_usd > precio_venta_usd', () => {
    const result = productoSchema.safeParse({ ...base, precio_mayor_usd: 15, precio_venta_usd: 10 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('precio_mayor_usd')
    }
  })

  it('permite precio_mayor_usd null', () => {
    const result = productoSchema.safeParse({ ...base, precio_mayor_usd: null })
    expect(result.success).toBe(true)
  })
})
```

### Pattern: test con mock de fecha

Archivo: `src/lib/__tests__/dates.test.ts`

```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayStr, daysAgo, startOfMonth } from '@/lib/dates'

describe('todayStr()', () => {
  beforeEach(() => {
    // Fijar el sistema en una fecha conocida: 2026-03-15
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna la fecha de hoy en formato YYYY-MM-DD', () => {
    expect(todayStr()).toBe('2026-03-15')
  })
})

describe('daysAgo()', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna la fecha de N días atrás', () => {
    expect(daysAgo(7)).toBe('2026-03-08')
  })

  it('retorna hoy si n=0', () => {
    expect(daysAgo(0)).toBe('2026-03-15')
  })

  it('cruza límite de mes correctamente', () => {
    expect(daysAgo(15)).toBe('2026-02-28')
  })
})

describe('startOfMonth()', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna el primer día del mes actual', () => {
    expect(startOfMonth()).toBe('2026-03-01')
  })
})
```

## Decisions

| Decision | Elegido | Alternativas | Fundamento |
|----------|---------|--------------|------------|
| Test environment | `happy-dom` | `jsdom` | Mejor soporte ESM nativo; React 19 usa APIs modernas del DOM que jsdom implementa con retraso. Para tests de funciones puras se puede sobreescribir a `node` con el docblock `@vitest-environment node` |
| Config approach | `vitest.config.ts` standalone | Extender `vite.config.ts` | `vite-plugin-pwa`, `vite-plugin-wasm` y `vite-plugin-top-level-await` son plugins de browser. En Node.js, intentan registrar manejadores que no existen. La extensión contamina el runner y causa errores de import en WASM |
| Coverage provider | `v8` | `istanbul` | `v8` usa el instrumentador nativo de Node.js; zero configuración extra, sin transformaciones babel. `istanbul` requiere plugins adicionales para ESM y tiene mayor overhead |
| Mock strategy | Mocks manuales en `src/__mocks__/` | `vi.mock()` inline | Los módulos WASM no tienen stubs automáticos. Los mocks en `__mocks__/` son autodescubiertos por Vitest para todos los tests sin repetición; centraliza la definición |
| PowerSync exclusión | `server.deps.external` + `exclude` patterns | Solo `vi.mock()` | Doble barrera: `exclude` evita que Vitest intente cargar archivos `.wasm` durante el scan; `server.deps.external` evita que Vite los procese al resolver imports |
| tsconfig separado | `tsconfig.test.json` | Agregar `vitest/globals` al tsconfig.json base | Los tipos `vitest/globals` exponen `describe`, `it`, `expect` globalmente. Contaminar `tsconfig.json` los haría visibles en código de producción, confundiendo el type-checker en archivos no-test |
| Versión Vitest | `^3.2.x` | `^2.x` | Vitest 3.x es la versión con soporte oficial para Vite 7. La v2 no soporta la nueva API de plugins de Vite 7 |
| `@testing-library/react` | `^16.x` | `^15.x` | React 19 cambió el API interno de `act()` y el manejo de concurrent features. La v16 de Testing Library se alinea con estas APIs; la v15 produce warnings y puede fallar en tests con `Suspense` |

## Constraints Respected

- **WASM no corre en Node.js**: mocks manuales en `src/__mocks__/@powersync/` + `server.deps.external` como doble barrera. Los tests nunca intentan inicializar el motor SQLite.
- **Vitest 3.x para Vite 7**: alineado con la versión correcta para evitar incompatibilidades de plugin API.
- **TypeScript estricto**: `tsconfig.test.json` extiende el base con `strict: true` heredado. Los mocks están tipados (no `any`). Los tests deben pasar `tsc --noEmit --project tsconfig.test.json`.
- **verbatimModuleSyntax: true**: los mocks usan `import type` para imports de tipos y `import` para valores, respetando la restricción de TypeScript 5.x que prohíbe mezclarlos en un mismo statement.
- **Sin modificar vite.config.ts**: el `vitest.config.ts` es 100% independiente. `yarn build` no se ve afectado.
- **yarn como package manager**: todos los comandos de instalación usan `yarn add --dev`. No se invoca `npm`.
- **Solo español en UI**: los tests verifican mensajes de error en español tal como están definidos en los schemas Zod (`'El codigo es requerido'`, `'Minimo 3 caracteres'`, etc.).
- **Filtro empresa_id**: out of scope en esta fase (los tests de hooks con PowerSync son un cambio posterior). Los tests de capas puras no tienen dependencia de `empresa_id`.
- **Presupuesto S**: setup de infraestructura + primeros tests de `src/lib/` y 3 schemas Zod representativos. Sin tests de componentes React ni hooks (cambio posterior).
