import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReasignarCajaDialog } from '../reasignar-caja-dialog'
import { actualizarCaja } from '@/features/configuracion/hooks/use-cajas'
import { useDepositosVentaActivos, actualizarDeposito } from '@/features/inventario/hooks/use-depositos'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'

// Mismo patron que caja-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente construyen una
// PowerSyncDatabase real (efecto de modulo top-level) y revientan con
// "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/configuracion/hooks/use-cajas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-cajas')>()
  return { ...actual, actualizarCaja: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosVentaActivos: vi.fn(), actualizarDeposito: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedActualizarCaja = vi.mocked(actualizarCaja)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedActualizarDeposito = vi.mocked(actualizarDeposito)

const DEPOSITO_A_DESACTIVAR: Deposito = {
  id: 'dep-origen',
  empresa_id: 'emp-1',
  nombre: 'DEPOSITO A DESACTIVAR',
  direccion: null,
  es_principal: 0,
  permite_venta: 1,
  is_active: 1,
  created_at: '',
  updated_at: '',
  created_by: null,
  updated_by: null,
}

const DEPOSITOS_DESTINO = [
  { id: 'dep-origen', nombre: 'DEPOSITO A DESACTIVAR', permite_venta: 1 },
  { id: 'dep-destino-1', nombre: 'DEPOSITO DESTINO UNO', permite_venta: 1 },
  { id: 'dep-destino-2', nombre: 'DEPOSITO DESTINO DOS', permite_venta: 1 },
]

const CAJAS_AFECTADAS = [
  { cajaId: 'caja-1', cajaNombre: 'CAJA UNO', tieneSesionAbierta: false },
  { cajaId: 'caja-2', cajaNombre: 'CAJA DOS', tieneSesionAbierta: false },
]

function setupMocks() {
  mockedUseDepositosVentaActivos.mockReturnValue({ depositos: DEPOSITOS_DESTINO as never, isLoading: false })
  mockedActualizarCaja.mockResolvedValue(undefined)
  mockedActualizarDeposito.mockResolvedValue(undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

describe('ReasignarCajaDialog — selector de deposito destino por caja', () => {
  it('lista cada caja afectada con un selector de deposito destino, excluyendo el deposito que se desactiva', () => {
    render(
      <ReasignarCajaDialog
        isOpen
        deposito={DEPOSITO_A_DESACTIVAR}
        cajas={CAJAS_AFECTADAS}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('CAJA UNO')).toBeInTheDocument()
    expect(screen.getByText('CAJA DOS')).toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    for (const select of selects) {
      expect(within(select).queryByRole('option', { name: 'DEPOSITO A DESACTIVAR' })).not.toBeInTheDocument()
      expect(within(select).getByRole('option', { name: 'DEPOSITO DESTINO UNO' })).toBeInTheDocument()
      expect(within(select).getByRole('option', { name: 'DEPOSITO DESTINO DOS' })).toBeInTheDocument()
    }
  })
})

describe('ReasignarCajaDialog — confirmar reasignacion (Decision de producto #1)', () => {
  it('bloquea la confirmacion hasta que TODAS las cajas tengan un deposito destino seleccionado', async () => {
    const user = userEvent.setup()
    render(
      <ReasignarCajaDialog
        isOpen
        deposito={DEPOSITO_A_DESACTIVAR}
        cajas={CAJAS_AFECTADAS}
        onClose={() => {}}
      />
    )

    const confirmar = screen.getByRole('button', { name: /confirmar/i })
    await user.click(confirmar)

    expect(mockedActualizarCaja).not.toHaveBeenCalled()
    expect(mockedActualizarDeposito).not.toHaveBeenCalled()
  })

  it('con destino seleccionado para cada caja: reasigna cada caja y LUEGO desactiva el deposito', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ReasignarCajaDialog
        isOpen
        deposito={DEPOSITO_A_DESACTIVAR}
        cajas={CAJAS_AFECTADAS}
        onClose={onClose}
      />
    )

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-destino-1')
    await user.selectOptions(selects[1]!, 'dep-destino-2')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(mockedActualizarDeposito).toHaveBeenCalledWith('dep-origen', { is_active: false })
    })
    expect(mockedActualizarCaja).toHaveBeenCalledWith('caja-1', { deposito_id: 'dep-destino-1' })
    expect(mockedActualizarCaja).toHaveBeenCalledWith('caja-2', { deposito_id: 'dep-destino-2' })
    expect(onClose).toHaveBeenCalled()

    const ordenLlamadas = [
      ...mockedActualizarCaja.mock.invocationCallOrder,
      ...mockedActualizarDeposito.mock.invocationCallOrder,
    ]
    const ultimaCajaCallOrder = Math.max(...mockedActualizarCaja.mock.invocationCallOrder)
    const depositoCallOrder = mockedActualizarDeposito.mock.invocationCallOrder[0]!
    expect(depositoCallOrder).toBeGreaterThan(ultimaCajaCallOrder)
    expect(ordenLlamadas.length).toBe(3)
  })

  it('cancelar cierra el dialogo sin llamar a actualizarCaja ni actualizarDeposito', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ReasignarCajaDialog
        isOpen
        deposito={DEPOSITO_A_DESACTIVAR}
        cajas={CAJAS_AFECTADAS}
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onClose).toHaveBeenCalled()
    expect(mockedActualizarCaja).not.toHaveBeenCalled()
    expect(mockedActualizarDeposito).not.toHaveBeenCalled()
  })
})
