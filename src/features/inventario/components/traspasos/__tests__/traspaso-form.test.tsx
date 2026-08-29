import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { TraspasoForm } from '../traspaso-form'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { crearTraspaso } from '@/features/inventario/hooks/use-traspasos'
import { useStockPorDeposito } from '@/features/inventario/hooks/use-inventario-stock'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePlantillasTraspaso, usePlantillaProductos } from '@/features/inventario/hooks/use-plantillas-traspaso'

// Mockeado para poder aserter sobre el toast de error en el test de REQ4
// (modal no se cierra ante errores de validacion) sin depender del store
// interno real de sonner.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Mismo patron que movimiento-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente (via
// `useCurrentUser` -> `auth-provider`) construyen una PowerSyncDatabase real
// (efecto de modulo top-level) y revientan con "Worker is not defined" en el
// entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-productos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-productos')>()
  return { ...actual, useProductos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosActivos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-traspasos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-traspasos')>()
  return { ...actual, crearTraspaso: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-inventario-stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-inventario-stock')>()
  return { ...actual, useStockPorDeposito: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/inventario/hooks/use-plantillas-traspaso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-plantillas-traspaso')>()
  return { ...actual, usePlantillasTraspaso: vi.fn(), usePlantillaProductos: vi.fn() }
})

const mockedUseProductos = vi.mocked(useProductos)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedCrearTraspaso = vi.mocked(crearTraspaso)
const mockedUseStockPorDeposito = vi.mocked(useStockPorDeposito)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePlantillasTraspaso = vi.mocked(usePlantillasTraspaso)
const mockedUsePlantillaProductos = vi.mocked(usePlantillaProductos)
const mockedToastError = vi.mocked(toast.error)

const PRODUCTOS = [
  { id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', tipo: 'P', is_active: 1 },
  { id: 'prod-2', codigo: 'P-002', nombre: 'Producto Dos', tipo: 'P', is_active: 1 },
]

const DEPOSITOS = [
  { id: 'dep-A', nombre: 'Deposito A', es_principal: 1 },
  { id: 'dep-B', nombre: 'Deposito B', es_principal: 0 },
]

// Stock por defecto en el deposito origen: ambos productos con existencia
// holgada, de modo que el buscador (que ahora solo ofrece productos con stock
// en origen) los siga sugiriendo en los tests de payload.
const STOCK_ORIGEN_DEFAULT = [
  { producto_id: 'prod-1', cantidad_actual: '10.000' },
  { producto_id: 'prod-2', cantidad_actual: '10.000' },
]

// Plantillas de traslado: 'plant-1' = 1 producto activo (caso "reemplazo
// simple"/"crearTraspaso tras cargar"); 'plant-2' = 1 activo + 1 inactivo
// (caso "filtrado de productos inactivos al cargar").
// Plantillas de traslado: 'plant-1' = 1 producto activo (caso "reemplazo
// simple"/"crearTraspaso tras cargar"); 'plant-2' = 1 activo + 1 inactivo
// (caso "filtrado de productos inactivos al cargar"); 'plant-3' = todos
// inactivos (caso "fallback a una linea vacia").
// 'plant-4' = referencia un producto_id ('prod-999') que NO existe en el
// catalogo `PRODUCTOS` de este archivo (simula una plantilla desactualizada
// tras borrar/desactivar el producto en Inventario) — caso de "linea con
// producto ausente en la BD" del REQ Habilitacion Condicional del Boton.
const PLANTILLAS = [
  { id: 'plant-1', empresa_id: 'emp-1', nombre: 'Plantilla Semanal', descripcion: null, is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null, items_count: 1 },
  { id: 'plant-2', empresa_id: 'emp-1', nombre: 'Plantilla Con Inactivo', descripcion: null, is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null, items_count: 2 },
  { id: 'plant-3', empresa_id: 'emp-1', nombre: 'Plantilla Todo Inactivo', descripcion: null, is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null, items_count: 2 },
  { id: 'plant-4', empresa_id: 'emp-1', nombre: 'Plantilla Desactualizada', descripcion: null, is_active: 1, created_at: '', updated_at: '', created_by: null, updated_by: null, items_count: 1 },
]

const PLANTILLA_PRODUCTOS: Record<string, Array<{ id: string; producto_id: string; producto_nombre: string; producto_codigo: string; producto_is_active: number }>> = {
  'plant-1': [
    { id: 'det-1', producto_id: 'prod-1', producto_nombre: 'Producto Uno', producto_codigo: 'P-001', producto_is_active: 1 },
  ],
  'plant-2': [
    { id: 'det-2', producto_id: 'prod-1', producto_nombre: 'Producto Uno', producto_codigo: 'P-001', producto_is_active: 1 },
    { id: 'det-3', producto_id: 'prod-2', producto_nombre: 'Producto Dos', producto_codigo: 'P-002', producto_is_active: 0 },
  ],
  'plant-3': [
    { id: 'det-4', producto_id: 'prod-1', producto_nombre: 'Producto Uno', producto_codigo: 'P-001', producto_is_active: 0 },
    { id: 'det-5', producto_id: 'prod-2', producto_nombre: 'Producto Dos', producto_codigo: 'P-002', producto_is_active: 0 },
  ],
  // producto_is_active viene en 1 desde la vista de la plantilla (el producto
  // estaba activo cuando se guardo la plantilla), pero 'prod-999' ya no
  // existe en el catalogo `PRODUCTOS` -> productosValidosIds no lo contiene.
  'plant-4': [
    { id: 'det-6', producto_id: 'prod-999', producto_nombre: 'Producto Fantasma', producto_codigo: 'P-999', producto_is_active: 1 },
  ],
}

function setupMocks(stockOrigen: Array<{ producto_id: string; cantidad_actual: string }> = STOCK_ORIGEN_DEFAULT) {
  mockedUseProductos.mockReturnValue({ productos: PRODUCTOS as never, isLoading: false })
  mockedUseDepositosActivos.mockReturnValue({ depositos: DEPOSITOS as never, isLoading: false })
  mockedUseStockPorDeposito.mockReturnValue({ stock: stockOrigen as never, isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: PLANTILLAS as never, isLoading: false })
  mockedUsePlantillaProductos.mockImplementation((plantillaId: string) => ({
    productos: (PLANTILLA_PRODUCTOS[plantillaId] ?? []) as never,
    isLoading: false,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCrearTraspaso.mockResolvedValue({ traspasoId: 'traspaso-1', correlativo: 1 })
})

async function seleccionarProducto(user: ReturnType<typeof userEvent.setup>, index: number, query: string, nombreCompleto: string) {
  const buscadores = screen.getAllByPlaceholderText(/buscar/i)
  await user.type(buscadores[index]!, query)
  await user.click(await screen.findByText(new RegExp(nombreCompleto, 'i')))
}

describe('TraspasoForm — deposito origen/destino (TRI/Traspaso Atomico Individual)', () => {
  it('la exclusion mutua entre origen y destino impide elegir el mismo deposito en ambos selects (REQ Exclusión Mutua)', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    const selectOrigen = selects[0] as HTMLSelectElement
    const selectDestino = selects[1] as HTMLSelectElement

    await user.selectOptions(selectOrigen, 'dep-A')
    // Elegir A como origen lo excluye de las opciones de destino.
    expect(within(selectDestino).queryByText('Deposito A')).not.toBeInTheDocument()

    await user.selectOptions(selectDestino, 'dep-B')
    // Elegir B como destino lo excluye, simetricamente, de las opciones de origen.
    expect(within(selectOrigen).queryByText('Deposito B')).not.toBeInTheDocument()

    expect(screen.queryByText(/deben ser diferentes/i)).not.toBeInTheDocument()
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('boton "Registrar Traspaso" deshabilitado sin lineas validas cargadas', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    // Origen y destino validos, pero sin ningun producto cargado en las lineas.
    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('traspaso individual (1 linea) llama a crearTraspaso con el payload correcto', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInputs = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs[0]!, '4')

    fireEvent.submit(screen.getByRole('button', { name: /registrar traspaso/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })
  })

  it('traspaso por lote (N lineas): agrega una segunda linea con "Agregar producto" y envia ambas', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    const cantidadInputs1 = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs1[0]!, '2')

    await user.click(screen.getByRole('button', { name: /agregar producto/i }))
    // Linea 1 ya tiene producto seleccionado (deja de ser un buscador de
    // texto y pasa a mostrar codigo+nombre), asi que el unico buscador de
    // texto restante en pantalla es el de la linea 2 recien agregada.
    await seleccionarProducto(user, 0, 'Producto Dos', 'Producto Dos')
    const cantidadInputs2 = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs2[1]!, '3')

    fireEvent.submit(screen.getByRole('button', { name: /registrar traspaso/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      lineas: [
        { producto_id: 'prod-1', cantidad: 2 },
        { producto_id: 'prod-2', cantidad: 3 },
      ],
    })
  })

  it('permite quitar una linea con el boton de remover', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    // Con origen elegido el buscador se habilita (placeholder "Buscar producto...").
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')

    await user.click(screen.getByRole('button', { name: /agregar producto/i }))
    expect(screen.getAllByPlaceholderText(/buscar producto/i)).toHaveLength(2)

    const removeButtons = screen.getAllByRole('button', { name: /quitar linea/i })
    await user.click(removeButtons[0]!)

    expect(screen.getAllByPlaceholderText(/buscar producto/i)).toHaveLength(1)
  })
})

describe('TraspasoForm — buscador filtrado por stock en origen (Mejora 1)', () => {
  it('sin deposito origen seleccionado, el buscador esta deshabilitado y no ofrece productos', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    // No se elige deposito origen: el input de busqueda queda deshabilitado.
    const buscador = screen.getByPlaceholderText(/elegi un deposito origen primero/i)
    expect(buscador).toBeDisabled()

    // Aun forzando texto, no aparece ninguna sugerencia de producto.
    await user.type(buscador, 'Producto').catch(() => {})
    expect(screen.queryByText('Producto Uno')).not.toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
  })

  it('con origen elegido, solo sugiere productos con stock > 0 en el deposito origen', async () => {
    const user = userEvent.setup()
    // Solo prod-1 tiene stock en origen; prod-2 tiene 0 -> no debe aparecer.
    setupMocks([
      { producto_id: 'prod-1', cantidad_actual: '5.000' },
      { producto_id: 'prod-2', cantidad_actual: '0.000' },
    ])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')

    const buscador = screen.getByPlaceholderText(/buscar producto/i)
    await user.type(buscador, '*')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
  })

  it('un producto sin fila de stock en origen tampoco aparece', async () => {
    const user = userEvent.setup()
    // prod-1 con stock; prod-2 sin fila alguna en el stock del origen.
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '3.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')

    const buscador = screen.getByPlaceholderText(/buscar producto/i)
    await user.type(buscador, '*')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
  })
})

describe('TraspasoForm — feedback de cantidad > disponible (Mejora 2)', () => {
  it('marca el input de cantidad como invalido cuando supera el stock disponible en origen', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '5.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInput = screen.getByPlaceholderText('0.000') as HTMLInputElement
    // Disponible = 5, pedimos 8 -> excedido.
    await user.type(cantidadInput, '8')

    expect(cantidadInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('no marca el input cuando la cantidad esta dentro del stock disponible', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '5.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInput = screen.getByPlaceholderText('0.000') as HTMLInputElement
    await user.type(cantidadInput, '3')

    expect(cantidadInput).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('TraspasoForm — Cargar plantilla (Slice C)', () => {
  it('cargar una plantilla reemplaza las lineas vacias con sus productos, cantidad vacia', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('0.000')).toHaveLength(1)
    expect((screen.getByPlaceholderText('0.000') as HTMLInputElement).value).toBe('')
  })

  it('pide confirmacion si las lineas tienen datos; cancelar deja las lineas sin cambios', async () => {
    const user = userEvent.setup()
    setupMocks()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await seleccionarProducto(user, 0, 'Producto Dos', 'Producto Dos')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByText('Producto Dos')).toBeInTheDocument()
    expect(screen.queryByText('Producto Uno')).not.toBeInTheDocument()
  })

  it('pide confirmacion si las lineas tienen datos; confirmar reemplaza las lineas', async () => {
    const user = userEvent.setup()
    setupMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await seleccionarProducto(user, 0, 'Producto Dos', 'Producto Dos')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
  })

  it('un producto de la plantilla sin stock en origen igual se carga (no se filtra) y usa el feedback existente', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '0.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.getByText('0.000')).toBeInTheDocument()

    const cantidadInput = screen.getByPlaceholderText('0.000') as HTMLInputElement
    await user.type(cantidadInput, '2')

    expect(cantidadInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('filtra productos inactivos de la plantilla: solo cargan los activos', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-2')

    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('0.000')).toHaveLength(1)
  })

  it('plantilla con TODOS los productos inactivos: la grilla vuelve a una linea vacia (sin error)', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-3')

    // Ningun producto de la plantilla se carga (todos inactivos), pero la
    // grilla no queda en blanco: muestra una unica linea vacia.
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('0.000')).toHaveLength(1)
    })
    expect(screen.queryByText('Producto Uno')).not.toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
    expect((screen.getByPlaceholderText('0.000') as HTMLInputElement).value).toBe('')
  })

  it('crearTraspaso sigue funcionando correctamente tras cargar una plantilla', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    const cantidadInput = await screen.findByPlaceholderText('0.000')
    await user.type(cantidadInput, '4')

    fireEvent.submit(screen.getByRole('button', { name: /registrar traspaso/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      empresa_id: 'emp-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })
  })

  it('carga los productos aunque usePlantillaProductos resuelva ASINCRONO (query vacia en el 1er render, datos despues)', async () => {
    const user = userEvent.setup()
    setupMocks()
    // Simula el comportamiento real de useQuery de PowerSync: la data NO llega
    // en el mismo render de la seleccion — primero vacio, luego poblado. Si el
    // effect solo dependiera de plantillaSeleccionadaId, correria con la lista
    // vacia y nunca recargaria al llegar los datos (el bug que rompe la feature
    // en produccion). El effect debe depender tambien de productosPlantilla.
    let entregarDatos = false
    mockedUsePlantillaProductos.mockImplementation((plantillaId: string) => ({
      productos: (entregarDatos ? (PLANTILLA_PRODUCTOS[plantillaId] ?? []) : []) as never,
      isLoading: !entregarDatos,
    }))

    const { rerender } = render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    // En el render de la seleccion la query aun esta vacia: no debe haber
    // cargado el producto todavia.
    expect(screen.queryByText('Producto Uno')).not.toBeInTheDocument()

    // Llegan los datos (PowerSync resolvio la query) y el componente re-renderiza.
    entregarDatos = true
    rerender(<TraspasoForm isOpen onClose={() => {}} />)

    // Ahora el effect debe re-dispararse y cargar el producto.
    expect(await screen.findByText('Producto Uno')).toBeInTheDocument()
  })
})

describe('TraspasoForm — matriz de habilitacion del boton via click real (REQ Limite de Cantidad Disponible)', () => {
  // Nota de cobertura: la condicion "origen === destino" de la matriz NO
  // tiene aqui un test dedicado porque, una vez cableada la exclusion mutua
  // (REQ Exclusion Mutua, ver describe de mas arriba), es estructuralmente
  // INALCANZABLE via la UI real — los dos <select> nunca pueden compartir el
  // mismo valor porque cada uno excluye la opcion ya elegida del otro lado
  // (`filtrarDepositosDisponibles`). La regla en si sigue 100% cubierta por
  // `puedeProcesarTraspaso` (unit, matriz completa en lib/__tests__/traspasos.test.ts)
  // y por el guard real en schema/hook/trigger DB. Fabricar aqui un test que
  // fuerce ese estado saltandose la UI seria vacuo (no probaria el cableado
  // real del componente).

  it('boton deshabilitado si falta el deposito destino, aunque haya lineas validas cargadas', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectOrigen = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    await user.selectOptions(selectOrigen, 'dep-A')
    // Destino NUNCA se selecciona.
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    await user.type(screen.getByPlaceholderText('0.000'), '4')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()

    await user.click(submitBtn)
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('boton deshabilitado si falta el deposito origen (destino solo, sin lineas cargables)', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectDestino = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    await user.selectOptions(selectDestino, 'dep-B')
    // Sin origen, el buscador de productos permanece deshabilitado (ya
    // cubierto por otro describe) por lo que no hay lineas validas posibles:
    // el boton debe seguir deshabilitado por la falta de origen.
    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()

    await user.click(submitBtn)
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('boton deshabilitado si la cantidad de una linea supera el stock disponible en origen', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '5.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInput = screen.getByPlaceholderText('0.000')
    // Disponible = 5, pedimos 8 -> excede el stock del origen.
    await user.type(cantidadInput, '8')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()

    await user.click(submitBtn)
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('boton deshabilitado si una linea referencia un producto sin fila de stock en el deposito origen', async () => {
    const user = userEvent.setup()
    // El stock del origen solo trae fila para prod-2; prod-1 (el que carga
    // la plantilla) no tiene fila alguna en `stockDisponiblePorProducto`.
    setupMocks([{ producto_id: 'prod-2', cantidad_actual: '10.000' }])
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    await screen.findByText('Producto Uno')
    await user.type(screen.getByPlaceholderText('0.000'), '1')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()

    await user.click(submitBtn)
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('boton deshabilitado si una plantilla desactualizada referencia un producto que ya no existe en el catalogo activo', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-4')

    // 'prod-999' no existe en PRODUCTOS -> no esta en productosValidosIds.
    await screen.findByText('Producto Fantasma')
    await user.type(screen.getByPlaceholderText('0.000'), '1')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()

    await user.click(submitBtn)
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('con datos totalmente validos el boton se HABILITA (atributo disabled real) y el submit SI dispara crearTraspaso', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    await user.type(screen.getByPlaceholderText('0.000'), '4')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    // Prueba real y no-vacua del atributo `disabled` nativo: si el cableado
    // `disabled={submitting || !resultado.habilitado}` estuviera roto (p.ej.
    // siempre `true`), esta assertion fallaria aqui.
    expect(submitBtn).toBeEnabled()

    // NOTA (hallazgo de infraestructura de test, no del componente): NO se usa
    // `user.click(submitBtn)` para disparar el submit aqui porque happy-dom
    // tiene un bug real en su calculo de `stepMismatch` para <input type=number
    // step="0.001">: `(value - min) % step` se computa con floating-point CRUDO
    // sin la tolerancia que exige la spec HTML (ver `(4-0.001) % 0.001 =
    // 2.68e-17 !== 0`), por lo que happy-dom marca como invalido un valor
    // perfectamente valido (ej. "4") y bloquea la sub-mision NATIVA disparada
    // por el click en un boton type="submit" — el 'submit' event nunca llega a
    // dispararse (confirmado: ni `crearTraspaso` ni `toast.error` se invocan).
    // Esto es EXACTAMENTE por lo que los tests "happy path" preexistentes de
    // este archivo usan `fireEvent.submit(form)`: no es un antipatron, es un
    // workaround deliberado a esta limitacion del entorno. La parte que SI
    // prueba el cableado real es la assertion `toBeEnabled()` de arriba (via
    // el atributo `disabled` autentico) — `fireEvent.submit` solo dispara el
    // evento nativo de submit sin pasar por la validacion HTML5 rota de
    // happy-dom, igual que el resto de la suite.
    fireEvent.submit(submitBtn.closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })
  })
})

describe('TraspasoForm — bloqueo del select de deposito origen (REQ Busqueda de Productos Limitada al Origen y Bloqueo de Seleccion)', () => {
  it('agregar el primer articulo bloquea el select de deposito origen', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectOrigen = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    await user.selectOptions(selectOrigen, 'dep-A')
    expect(selectOrigen).toBeEnabled()

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    expect(selectOrigen).toBeDisabled()
  })

  it('cargar una plantilla bloquea el select de deposito origen', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectOrigen = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(selectOrigen).toBeEnabled()

    const selectPlantilla = screen.getByLabelText(/cargar plantilla/i)
    await user.selectOptions(selectPlantilla, 'plant-1')

    await screen.findByText('Producto Uno')
    expect(selectOrigen).toBeDisabled()
  })

  it('vaciar la unica linea cargada (quitar el producto) vuelve a habilitar el select de deposito origen', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selectOrigen = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    await user.selectOptions(selectOrigen, 'dep-A')
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    expect(selectOrigen).toBeDisabled()

    // Con una sola linea, "Quitar linea" esta deshabilitado (min. 1 linea);
    // la unica forma de vaciar la tabla es limpiar el producto de esa linea
    // con el boton "X" junto al valor seleccionado.
    await user.click(screen.getByRole('button', { name: /quitar producto de la linea/i }))

    expect(selectOrigen).toBeEnabled()
  })
})

describe('TraspasoForm — caida de stock concurrente re-renderiza el estado invalido (REQ Limite de Cantidad Disponible)', () => {
  it('una venta concurrente que reduce el stock disponible por debajo de la cantidad ya cargada invalida el input y deshabilita el boton', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1', cantidad_actual: '10.000' }])
    const { rerender } = render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInput = screen.getByPlaceholderText('0.000') as HTMLInputElement
    await user.type(cantidadInput, '8')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    // Estado inicial: 8 <= 10 disponibles -> valido.
    expect(cantidadInput).toHaveAttribute('aria-invalid', 'false')
    expect(submitBtn).toBeEnabled()

    // Una venta concurrente sincroniza y el query reactivo de PowerSync
    // (`useStockPorDeposito`) refleja el nuevo stock mas bajo; simulamos ese
    // update cambiando el valor devuelto por el mock y re-renderizando el
    // MISMO componente (no un remount) — el estado local (lineas, cantidad
    // tipeada) se preserva, solo cambia la prop reactiva de stock.
    mockedUseStockPorDeposito.mockReturnValue({
      stock: [{ producto_id: 'prod-1', cantidad_actual: '5.000' }] as never,
      isLoading: false,
    })
    rerender(<TraspasoForm isOpen onClose={() => {}} />)

    expect(cantidadInput).toHaveAttribute('aria-invalid', 'true')
    expect(submitBtn).toBeDisabled()
  })
})

describe('TraspasoForm — el modal no se cierra ante errores de validacion en el submit (REQ Modal No Se Cierra ante Errores de Validacion)', () => {
  it('si crearTraspaso rechaza, el modal permanece abierto (onClose NO se llama) y los datos del formulario se preservan', async () => {
    const user = userEvent.setup()
    setupMocks()
    mockedCrearTraspaso.mockRejectedValueOnce(new Error('Stock insuficiente en el deposito de origen'))
    const onClose = vi.fn()
    render(<TraspasoForm isOpen onClose={onClose} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')
    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    await user.type(screen.getByPlaceholderText('0.000'), '4')

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    // Prueba real via el atributo `disabled` nativo (ver nota extendida en el
    // describe "matriz de habilitacion del boton via click real" mas arriba):
    // se dispara el submit con `fireEvent.submit` porque happy-dom tiene un
    // bug de floating-point en `stepMismatch` para <input step="0.001"> que
    // bloquea la submision nativa disparada por click en botones type=submit
    // — mismo workaround que el resto de la suite.
    expect(submitBtn).toBeEnabled()
    fireEvent.submit(submitBtn.closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalledWith('Stock insuficiente en el deposito de origen')
    })

    // Si el catch de handleSubmit llamara onClose() (bug), esta assertion
    // fallaria: prueba en runtime que el modal NO se cierra ante el error.
    expect(onClose).not.toHaveBeenCalled()
    // El formulario sigue montado con los datos que el usuario cargo.
    expect(screen.getByRole('button', { name: /registrar traspaso/i })).toBeInTheDocument()
    expect(screen.getByText('Producto Uno')).toBeInTheDocument()
    expect((selects[0] as HTMLSelectElement).value).toBe('dep-A')
  })
})
