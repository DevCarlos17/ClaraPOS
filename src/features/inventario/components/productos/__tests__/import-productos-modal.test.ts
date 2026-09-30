// `import-productos-modal.tsx` importa `db`/`kysely` (via
// `@/core/db/kysely/kysely`, que a su vez re-exporta `db` desde
// `@/core/db/powersync/db`) y `registrarMovimiento` (`use-kardex.ts`, mismo
// origen). Sin este mock, importar el modulo construye una PowerSyncDatabase
// real a nivel de modulo y revienta con "Worker is not defined" en el
// entorno de test — mismo patron que producto-list-deposito-col.test.tsx.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))

import * as XLSX from 'xlsx'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Unidad } from '@/features/inventario/hooks/use-unidades'
import { buildPlantillaWorkbook } from '../import-productos-modal'

function departamento(overrides: Partial<Departamento> = {}): Departamento {
  return {
    id: 'dep-1',
    codigo: 'DEP-1',
    nombre: 'DEPARTAMENTO EJEMPLO',
    parent_id: null,
    descripcion: null,
    prioridad_visual: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function unidad(overrides: Partial<Unidad> = {}): Unidad {
  return {
    id: 'und-1',
    empresa_id: 'emp-1',
    nombre: 'UNIDAD',
    abreviatura: 'UND',
    es_decimal: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    updated_by: null,
    ...overrides,
  }
}

describe('buildPlantillaWorkbook (PR1 — fix de plantilla: elimina la nota A6 que rompia el re-import)', () => {
  it('SC9: hoja "Inventario" tiene EXACTAMENTE header + 3 filas de ejemplo, y la celda A6 esta vacia/inexistente', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws = wb.Sheets['Inventario']
    expect(ws).toBeDefined()

    const filasConHeader = XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1 })
    expect(filasConHeader).toHaveLength(4) // 1 header + 3 ejemplos

    expect(ws!['A6']).toBeUndefined()
  })

  it('SC10: round-trip con sheet_to_json({defval:""}) (mismo parser que handleFileChange) produce exactamente 3 filas de datos, ninguna con codigo iniciando en "Unidades activas"', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws = wb.Sheets['Inventario']!

    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    expect(parsed).toHaveLength(3)
    for (const row of parsed) {
      expect(String(row.codigo ?? '')).not.toMatch(/^Unidades activas/)
    }
  })

  it('genera la hoja "Componentes Combos" con header + 1 fila de ejemplo (sin cambios de comportamiento en PR1)', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws2 = wb.Sheets['Componentes Combos']
    expect(ws2).toBeDefined()

    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws2!, { defval: '' })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.combo_codigo).toBe('COMBO-001')
  })
})
