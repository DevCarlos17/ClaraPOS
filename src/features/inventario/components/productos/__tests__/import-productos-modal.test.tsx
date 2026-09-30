// `import-productos-modal.tsx` importa `db`/`kysely` (via
// `@/core/db/kysely/kysely`, que a su vez re-exporta `db` desde
// `@/core/db/powersync/db`) y `registrarMovimiento` (`use-kardex.ts`, mismo
// origen). Sin este mock, importar el modulo construye una PowerSyncDatabase
// real a nivel de modulo y revienta con "Worker is not defined" en el
// entorno de test — mismo patron que producto-list-deposito-col.test.tsx.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))

// `validateRow` (regla SC11: "codigo ya existe") es una funcion interna del
// componente, no exportada — no hay seam puro para testearla en aislamiento
// sin tocar codigo de produccion. Se testea a traves del componente
// completo (mismo patron que deposito-form.test.tsx / plantilla-form.test.tsx
// para modales `<dialog>`), mockeando `useCurrentUser` porque el componente
// lo invoca aunque no se llegue a `handleImportar` en este test.
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import * as XLSX from 'xlsx'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Unidad } from '@/features/inventario/hooks/use-unidades'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { buildPlantillaWorkbook, ImportProductosModal } from '../import-productos-modal'

const mockedUseCurrentUser = vi.mocked(useCurrentUser)

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

function producto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    codigo: 'EXIST-1',
    tipo: 'P',
    nombre: 'PRODUCTO EXISTENTE',
    departamento_id: 'dep-1',
    marca_id: null,
    unidad_base_id: null,
    costo_usd: '10.00',
    precio_venta_usd: '15.00',
    precio_mayor_usd: null,
    precio_especial_usd: null,
    costo_promedio: '10.00',
    costo_ultimo: '10.00',
    stock: '0.000',
    stock_minimo: '1.000',
    tipo_impuesto: 'Exento',
    impuesto_iva_id: null,
    maneja_lotes: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ubicacion: null,
    presentacion: null,
    codigo_barras: null,
    duracion_min: null,
    deposito_id: null,
    costo_factura_usd: null,
    tasa_paralela_ref: null,
    ...overrides,
  }
}

/** Construye un `File` .xlsx con hoja "Inventario" a partir de filas planas,
 * mismo shape que produce `handleDescargarPlantilla`/`buildPlantillaWorkbook`
 * y que `handleFileChange` parsea con `XLSX.utils.sheet_to_json({defval:''})`. */
function buildInventarioFile(rows: Record<string, string>[]): File {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new File([buffer], 'inventario.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
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

describe('ImportProductosModal — validateRow, regla "codigo ya existe" (SC11, sin cambios de comportamiento en PR1)', () => {
  beforeEach(() => {
    mockedUseCurrentUser.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'a@a.com',
        nombre: 'Test',
        level: 1,
        rol_id: null,
        rol_nombre: null,
        empresa_id: 'emp-1',
      },
      loading: false,
    })
  })

  it('marca invalida (con error "codigo ya existe") la fila cuyo codigo ya esta en productos, y valida la fila con codigo nuevo', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'EXIST-1',
        tipo: 'P',
        nombre: 'PRODUCTO EXISTENTE',
        departamento: 'DEPARTAMENTO EJEMPLO',
        costo_usd: '10',
        precio_venta_usd: '15',
        precio_mayor_usd: '',
        stock_minimo: '1',
        stock_inicial: '',
        unidad: '',
        tipo_impuesto: 'Exento',
      },
      {
        codigo: 'NEW-1',
        tipo: 'P',
        nombre: 'PRODUCTO NUEVO',
        departamento: 'DEPARTAMENTO EJEMPLO',
        costo_usd: '10',
        precio_venta_usd: '15',
        precio_mayor_usd: '',
        stock_minimo: '1',
        stock_inicial: '',
        unidad: '',
        tipo_impuesto: 'Exento',
      },
    ])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[producto({ codigo: 'EXIST-1' })]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('EXIST-1')).toBeInTheDocument()
    })

    const filaExistente = screen.getByText('EXIST-1').closest('tr')!
    expect(within(filaExistente).getByText(/codigo ya existe/)).toBeInTheDocument()

    const filaNueva = screen.getByText('NEW-1').closest('tr')!
    expect(within(filaNueva).queryByText(/codigo ya existe/)).not.toBeInTheDocument()

    // "Errores" es la ultima celda de la fila: sin errores, queda vacia.
    const celdasFilaNueva = within(filaNueva).getAllByRole('cell')
    expect(celdasFilaNueva[celdasFilaNueva.length - 1]).toHaveTextContent('')
  })
})
