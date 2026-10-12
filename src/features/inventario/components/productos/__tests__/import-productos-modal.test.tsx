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
import type { Impuesto } from '@/features/configuracion/hooks/use-impuestos'
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

function impuesto(overrides: Partial<Impuesto> = {}): Impuesto {
  return {
    id: 'imp-1',
    empresa_id: 'emp-1',
    nombre: 'IVA GENERAL',
    tipo_tributo: 'IVA',
    porcentaje: '16.00',
    codigo_seniat: null,
    descripcion: null,
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
    codigo_status: 'asignado',
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

describe('buildPlantillaWorkbook — campos nuevos (Fase A commit 2)', () => {
  it('header de "Inventario" incluye todas las columnas nuevas en el orden acordado', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws = wb.Sheets['Inventario']!
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    const header = filas[0] as string[]

    expect(header).toEqual([
      'codigo', 'tipo', 'nombre', 'departamento', 'costo_usd', 'precio_venta_usd',
      'precio_mayor_usd', 'precio_especial_usd', 'stock_minimo', 'stock_inicial',
      'unidad', 'tipo_impuesto', 'codigo_barras', 'presentacion', 'ubicacion',
      'maneja_lotes', 'deposito',
    ])
  })

  it('fila de ejemplo PROD-001 (tipo P) trae codigo_barras, presentacion, ubicacion y maneja_lotes="NO"', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws = wb.Sheets['Inventario']!
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    const prod = parsed.find((r) => r.codigo === 'PROD-001')!

    expect(prod.codigo_barras).toBe('7591234567890')
    expect(prod.presentacion).toBe('CAJA x 12')
    expect(prod.ubicacion).toBe('A-01-1')
    expect(prod.maneja_lotes).toBe('NO')
    expect(prod.precio_especial_usd).toBe('')
  })

  it('filas de ejemplo SERV-001 (S) y COMBO-001 (C) dejan vacios codigo_barras/presentacion/ubicacion/maneja_lotes/deposito', () => {
    const wb = buildPlantillaWorkbook([departamento()], [unidad()])
    const ws = wb.Sheets['Inventario']!
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    for (const codigo of ['SERV-001', 'COMBO-001']) {
      const row = parsed.find((r) => r.codigo === codigo)!
      expect(row.codigo_barras).toBe('')
      expect(row.presentacion).toBe('')
      expect(row.ubicacion).toBe('')
      expect(row.maneja_lotes).toBe('')
      expect(row.deposito).toBe('')
    }
  })
})

describe('ImportProductosModal — clasificacion de accion en modo "crear" por defecto (spec-pr3 R1/R2/R4)', () => {
  // NOTA: este describe reemplaza el test original de PR1 (SC11, "codigo ya
  // existe" como ERROR de fila). PR3 (spec-pr3.md R2) cambia deliberadamente
  // esa clasificacion: en modo "crear" (default), un codigo existente ahora
  // se clasifica OMITIR (no se valida ni se muestra como error de fila — R4),
  // no CREAR con error. El resultado practico es el mismo (esa fila no se
  // importa), pero la UI ya no muestra "codigo ya existe" como texto de error.
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

  it('clasifica OMITIR (sin errores de validacion) la fila cuyo codigo ya existe, y CREAR la fila con codigo nuevo', async () => {
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
    expect(within(filaExistente).getByText('OMITIR')).toBeInTheDocument()
    expect(within(filaExistente).queryByText(/codigo ya existe/)).not.toBeInTheDocument()

    const filaNueva = screen.getByText('NEW-1').closest('tr')!
    expect(within(filaNueva).getByText('CREAR')).toBeInTheDocument()

    // "Errores" es la ultima celda de la fila: sin errores, queda vacia.
    const celdasFilaNueva = within(filaNueva).getAllByRole('cell')
    expect(celdasFilaNueva[celdasFilaNueva.length - 1]).toHaveTextContent('')
  })
})

describe('ImportProductosModal — B1.1/B1.2: servicios ignoran inventario + sin limitante mayor>venta', () => {
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

  it('B1.1: fila CREAR con precio_mayor_usd > precio_venta_usd ya no genera error', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'NEW-MAYOR',
        tipo: 'P',
        nombre: 'PRODUCTO MAYOR ALTO',
        departamento: 'DEPARTAMENTO EJEMPLO',
        costo_usd: '5',
        precio_venta_usd: '15',
        precio_mayor_usd: '20',
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
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-MAYOR')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-MAYOR').closest('tr')!
    expect(within(fila).queryByText(/precio_mayor_usd/)).not.toBeInTheDocument()
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('B1.2: fila CREAR tipo=S con stock_inicial > 0 no genera error (se ignora silenciosamente)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'SERV-STOCK',
        tipo: 'S',
        nombre: 'SERVICIO CON STOCK',
        departamento: 'DEPARTAMENTO EJEMPLO',
        costo_usd: '5',
        precio_venta_usd: '20',
        precio_mayor_usd: '',
        stock_minimo: '',
        stock_inicial: '50',
        unidad: '',
        tipo_impuesto: 'Exento',
      },
    ])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('SERV-STOCK')).toBeInTheDocument()
    })

    const fila = screen.getByText('SERV-STOCK').closest('tr')!
    expect(within(fila).queryByText(/stock_inicial/)).not.toBeInTheDocument()
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('B1.2: fila ACTUALIZAR contra producto existente tipo=S no exige unidad ni stock_minimo', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'SERV-EXIST',
        tipo: 'S',
        nombre: 'SERVICIO EXISTENTE ACTUALIZADO',
        departamento: 'DEPARTAMENTO EJEMPLO',
        costo_usd: '',
        precio_venta_usd: '',
        precio_mayor_usd: '',
        stock_minimo: '5',
        stock_inicial: '',
        unidad: 'UND',
        tipo_impuesto: '',
      },
    ])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[producto({ codigo: 'SERV-EXIST', tipo: 'S' })]}
        departamentos={[departamento()]}
      />
    )

    await user.click(screen.getByLabelText('Solo actualizar'))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('SERV-EXIST')).toBeInTheDocument()
    })

    const fila = screen.getByText('SERV-EXIST').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })
})

describe('ImportProductosModal — Fase A commit 3: tipo_impuesto Gravable con porcentaje, maneja_lotes, precio_especial_usd', () => {
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

  function filaBase(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      codigo: 'NEW-IMP',
      tipo: 'P',
      nombre: 'PRODUCTO IMPUESTO',
      departamento: 'DEPARTAMENTO EJEMPLO',
      costo_usd: '5',
      precio_venta_usd: '15',
      precio_mayor_usd: '',
      precio_especial_usd: '',
      stock_minimo: '1',
      stock_inicial: '',
      unidad: '',
      tipo_impuesto: 'Exento',
      codigo_barras: '',
      presentacion: '',
      ubicacion: '',
      maneja_lotes: '',
      ...overrides,
    }
  }

  it('"Gravable 16" con una tasa IVA activa al 16% => sin error', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo_impuesto: 'Gravable 16' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
        impuestos={[impuesto({ porcentaje: '16.00' })]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('"Gravable 16" sin ninguna tasa IVA activa al 16% => error de fila', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo_impuesto: 'Gravable 16' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
        impuestos={[impuesto({ porcentaje: '8.00' })]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    expect(within(fila).getByText(/no existe tasa IVA activa/)).toBeInTheDocument()
  })

  it('tipo_impuesto="invalid" => error de celda no reconocida', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo_impuesto: 'invalid' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    expect(within(fila).getByText(/tipo_impuesto debe ser/)).toBeInTheDocument()
  })

  it('maneja_lotes="SI" en tipo P => sin error (se normaliza a 1)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ maneja_lotes: 'SI' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('maneja_lotes="TALVEZ" (valor no reconocido) => error "maneja_lotes debe ser SI o NO"', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ maneja_lotes: 'TALVEZ' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    expect(within(fila).getByText('maneja_lotes debe ser SI o NO')).toBeInTheDocument()
  })

  it('maneja_lotes invalido en tipo S => se ignora silenciosamente (sin error)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo: 'S', maneja_lotes: 'TALVEZ', stock_minimo: '' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('precio_especial_usd < costo_usd => error', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ costo_usd: '10', precio_especial_usd: '5' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    expect(within(fila).getByText('precio_especial_usd < costo_usd')).toBeInTheDocument()
  })

  it('precio_especial_usd > precio_venta_usd => sin error (B1.1, nunca se valida vs venta)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ costo_usd: '5', precio_venta_usd: '15', precio_especial_usd: '20' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('precio_especial_usd < costo en tipo S => se ignora silenciosamente (B1.2)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo: 'S', costo_usd: '10', precio_especial_usd: '5', stock_minimo: '' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })

  it('ubicacion y presentacion presentes en fila tipo S => no generan error (se ignoran)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([filaBase({ tipo: 'S', stock_minimo: '', ubicacion: 'A-01', presentacion: 'CAJA' })])

    render(
      <ImportProductosModal
        isOpen
        onClose={() => {}}
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('NEW-IMP')).toBeInTheDocument()
    })

    const fila = screen.getByText('NEW-IMP').closest('tr')!
    const celdas = within(fila).getAllByRole('cell')
    expect(celdas[celdas.length - 1]).toHaveTextContent('')
  })
})

describe('ImportProductosModal — preview expandible + estimado de peso de sync (Fase A commit 3)', () => {
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

  it('la tabla principal NO muestra columnas de detalle (departamento no es visible hasta expandir)', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'EXP-1',
        tipo: 'P',
        nombre: 'PRODUCTO EXPANDIBLE',
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
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('EXP-1')).toBeInTheDocument()
    })

    expect(screen.queryByText('DEPARTAMENTO EJEMPLO')).not.toBeInTheDocument()
  })

  it('click en la fila expande un panel de detalle con los campos presentes en el archivo', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'EXP-1',
        tipo: 'P',
        nombre: 'PRODUCTO EXPANDIBLE',
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
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('EXP-1')).toBeInTheDocument()
    })

    const fila = screen.getByText('EXP-1').closest('tr')!
    await user.click(fila)

    expect(screen.getByText('DEPARTAMENTO EJEMPLO')).toBeInTheDocument()
    expect(screen.getByText(/Departamento/)).toBeInTheDocument()
  })

  it('click de nuevo en la fila colapsa el panel de detalle', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'EXP-1',
        tipo: 'P',
        nombre: 'PRODUCTO EXPANDIBLE',
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
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('EXP-1')).toBeInTheDocument()
    })

    const fila = screen.getByText('EXP-1').closest('tr')!
    await user.click(fila)
    expect(screen.getByText('DEPARTAMENTO EJEMPLO')).toBeInTheDocument()

    await user.click(fila)
    expect(screen.queryByText('DEPARTAMENTO EJEMPLO')).not.toBeInTheDocument()
  })

  it('muestra el badge de estimado de peso de sync (📦 ~X KB) en el preview', async () => {
    const user = userEvent.setup()
    const file = buildInventarioFile([
      {
        codigo: 'EXP-1',
        tipo: 'P',
        nombre: 'PRODUCTO EXPANDIBLE',
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
        productos={[]}
        departamentos={[departamento()]}
      />
    )

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText('EXP-1')).toBeInTheDocument()
    })

    expect(screen.getByText(/~.*KB/)).toBeInTheDocument()
  })
})
