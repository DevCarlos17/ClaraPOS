import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ConsultaFacturaModal } from '../consulta-factura-modal'
import { useReciboDesdeFactura } from '../../utils/recibo-desde-factura'
import {
  buildReciboData,
  descargarReciboPdf,
  compartirReciboImagen,
  type BuildReciboDataInput,
  type ReciboData,
} from '../../utils/factura-export'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useGastoAbsorcionFactura } from '@/features/contabilidad/hooks/use-gastos'

// PR3b (reimpresion-factura-fiscal): la logica de reconstruccion de recibo
// (useReciboDesdeFactura) ya tiene su propia suite (recibo-desde-factura.test.ts).
// Este modal solo compone: hook -> FacturaDetallePanel + Descargar/Compartir.
vi.mock('../../utils/recibo-desde-factura', () => ({ useReciboDesdeFactura: vi.fn() }))

vi.mock('../../utils/factura-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/factura-export')>()
  return { ...actual, descargarReciboPdf: vi.fn(), compartirReciboImagen: vi.fn() }
})

// `FacturaDetallePanel` tiene su propia suite; aqui se mockea SHALLOW para
// probar solo que el modal le pasa el `recibo` correcto (Design §Data Flow).
// nc-reembolso-real-reverso-gasto (Slice B): expone `gastoAbsorbido` como
// data-attribute para probar el wiring de este modal sin re-mockear
// `FacturaDetallePanel` por completo (mismo criterio que los otros mocks
// de esta suite).
vi.mock('../factura-detalle-panel', () => ({
  FacturaDetallePanel: ({
    recibo,
    gastoAbsorbido,
  }: {
    recibo: ReciboData | null
    gastoAbsorbido?: { montoUsd: string; tipo: string } | null
  }) => (
    <div
      data-testid="factura-detalle-panel"
      data-nro-factura={recibo?.nroFactura ?? ''}
      data-gasto-absorbido-monto={gastoAbsorbido?.montoUsd ?? ''}
    />
  ),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/contabilidad/hooks/use-gastos', () => ({ useGastoAbsorcionFactura: vi.fn() }))

const mockedUseReciboDesdeFactura = vi.mocked(useReciboDesdeFactura)
const mockedDescargarReciboPdf = vi.mocked(descargarReciboPdf)
const mockedCompartirReciboImagen = vi.mocked(compartirReciboImagen)
const mockedToastError = vi.mocked(toast.error)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseGastoAbsorcionFactura = vi.mocked(useGastoAbsorcionFactura)

function baseInput(overrides: Partial<BuildReciboDataInput> = {}): BuildReciboDataInput {
  return {
    nroFactura: 'C01-000001',
    fecha: '2026-05-10T10:00:00-04:00',
    emisor: { nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: null },
    cliente: { nombre: 'MARIA PEREZ', identificacion: 'V-12345678', direccion: null },
    lineas: [
      {
        codigo: 'PROD-001',
        nombre: 'Crema Facial',
        cantidad: '1',
        precioUnitarioUsd: '10.00',
        tipoImpuesto: 'Gravable',
        impuestoPct: '16',
      },
    ],
    tasa: '36.50',
    igtfUsd: null,
    pagos: [],
    discrepancy: null,
    saldoPendUsd: 0,
    esReimpresion: true,
    ...overrides,
  }
}

function reciboFixture(overrides: Partial<BuildReciboDataInput> = {}): ReciboData {
  return buildReciboData(baseInput(overrides))
}

const VENTA: FacturaParaAnular = {
  id: 'venta-1',
  nro_factura: 'C01-000001',
  cliente_id: 'cli-1',
  cliente_nombre: 'MARIA PEREZ',
  cliente_identificacion: 'V-12345678',
  tasa: '36.50',
  total_usd: '100.00',
  total_bs: '3650.00',
  saldo_pend_usd: '0.00',
  tipo: 'CONTADO',
  fecha: '2026-05-10T10:00:00-04:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Admin', level: 1, rol_id: 'rol-1', rol_nombre: 'Propietario', empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUseGastoAbsorcionFactura.mockReturnValue({ gasto: null, isLoading: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ConsultaFacturaModal — apertura y estado de carga', () => {
  it('isOpen=false no renderiza el panel de detalle ni los botones de accion', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: false })

    render(<ConsultaFacturaModal venta={null} isOpen={false} onClose={vi.fn()} />)

    expect(screen.queryByTestId('factura-detalle-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument()
  })

  it('isOpen=true mientras isLoading, muestra estado de carga sin panel ni botones', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: true })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByText(/cargando/i)).toBeInTheDocument()
    expect(screen.queryByTestId('factura-detalle-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument()
  })

  it('llama a useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: true })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(mockedUseReciboDesdeFactura).toHaveBeenCalledWith(VENTA, {
      esReimpresion: true,
      derivarMonedaPresentacion: true,
    })
  })
})

describe('ConsultaFacturaModal — recibo listo (navigator.share disponible)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn() })
  })

  it('renderiza el titulo "Consulta de Factura", FacturaDetallePanel con el recibo y ambos botones', () => {
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Consulta de Factura' })).toBeInTheDocument()
    expect(screen.getByTestId('factura-detalle-panel')).toHaveAttribute('data-nro-factura', 'C01-000001')
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compartir/i })).toBeInTheDocument()
  })

  it('click en "Descargar PDF" llama a descargarReciboPdf con el recibo (esReimpresion true)', async () => {
    const user = userEvent.setup()
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /descargar pdf/i }))

    expect(mockedDescargarReciboPdf).toHaveBeenCalledTimes(1)
    expect(mockedDescargarReciboPdf).toHaveBeenCalledWith(recibo)
    expect(recibo.esReimpresion).toBe(true)
  })

  it('click en "Compartir" llama a compartirReciboImagen con el recibo', async () => {
    const user = userEvent.setup()
    mockedCompartirReciboImagen.mockResolvedValue(undefined)
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir/i }))

    expect(mockedCompartirReciboImagen).toHaveBeenCalledTimes(1)
    expect(mockedCompartirReciboImagen).toHaveBeenCalledWith(recibo)
  })

  it('cuando compartirReciboImagen rechaza con AbortError, no dispara toast.error', async () => {
    const user = userEvent.setup()
    mockedCompartirReciboImagen.mockRejectedValue(new DOMException('AbortError', 'AbortError'))
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir/i }))

    expect(mockedCompartirReciboImagen).toHaveBeenCalledTimes(1)
    expect(mockedToastError).not.toHaveBeenCalled()
  })
})

describe('ConsultaFacturaModal — sin navigator.share', () => {
  it('el boton "Compartir" no se renderiza, "Descargar PDF" si', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /compartir/i })).not.toBeInTheDocument()
  })
})

// ─── nc-reembolso-real-reverso-gasto (Slice B): este modal es SOLO
// consulta/reimpresion (sin emision de NC) — unicamente consulta el gasto
// de absorcion y lo pasa a `FacturaDetallePanel` para el desglose, SIN
// ningun wiring de tope/reembolso (eso vive en los 2 modales de NC). ────

describe('ConsultaFacturaModal — nc-reembolso-real-reverso-gasto (Slice B: pasa gastoAbsorbido al panel, solo lectura)', () => {
  it('con gasto de absorcion encontrado (useGastoAbsorcionFactura): pasa gastoAbsorbido a FacturaDetallePanel', () => {
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })
    mockedUseGastoAbsorcionFactura.mockReturnValue({
      gasto: { id: 'gasto-1', monto_usd: '10.00', descripcion: 'ABSORCION_DIFERENCIAL_POS', status: 'REGISTRADO' },
      isLoading: false,
    })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByTestId('factura-detalle-panel')).toHaveAttribute('data-gasto-absorbido-monto', '10.00')
  })

  it('sin gasto de absorcion (default null): NO pasa gastoAbsorbido (regresion, comportamiento actual)', () => {
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByTestId('factura-detalle-panel')).toHaveAttribute('data-gasto-absorbido-monto', '')
  })

  it('consulta el gasto por nro_factura + empresa_id del usuario actual', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: true })

    render(<ConsultaFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(mockedUseGastoAbsorcionFactura).toHaveBeenCalledWith(VENTA.nro_factura, 'emp-1')
  })
})
