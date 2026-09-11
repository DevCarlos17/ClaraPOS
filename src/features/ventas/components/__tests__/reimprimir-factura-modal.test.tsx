import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ReimprimirFacturaModal } from '../reimprimir-factura-modal'
import { useReciboDesdeFactura } from '../../utils/recibo-desde-factura'
import {
  buildReciboData,
  descargarReciboPdf,
  compartirReciboImagen,
  type BuildReciboDataInput,
  type ReciboData,
} from '../../utils/factura-export'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'

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
vi.mock('../factura-detalle-panel', () => ({
  FacturaDetallePanel: ({ recibo }: { recibo: ReciboData | null }) => (
    <div data-testid="factura-detalle-panel" data-nro-factura={recibo?.nroFactura ?? ''} />
  ),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseReciboDesdeFactura = vi.mocked(useReciboDesdeFactura)
const mockedDescargarReciboPdf = vi.mocked(descargarReciboPdf)
const mockedCompartirReciboImagen = vi.mocked(compartirReciboImagen)
const mockedToastError = vi.mocked(toast.error)

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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReimprimirFacturaModal — apertura y estado de carga', () => {
  it('isOpen=false no renderiza el panel de detalle ni los botones de accion', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: false })

    render(<ReimprimirFacturaModal venta={null} isOpen={false} onClose={vi.fn()} />)

    expect(screen.queryByTestId('factura-detalle-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument()
  })

  it('isOpen=true mientras isLoading, muestra estado de carga sin panel ni botones', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: true })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByText(/cargando/i)).toBeInTheDocument()
    expect(screen.queryByTestId('factura-detalle-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument()
  })

  it('llama a useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })', () => {
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo: null, isLoading: true })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(mockedUseReciboDesdeFactura).toHaveBeenCalledWith(VENTA, {
      esReimpresion: true,
      derivarMonedaPresentacion: true,
    })
  })
})

describe('ReimprimirFacturaModal — recibo listo (navigator.share disponible)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn() })
  })

  it('renderiza FacturaDetallePanel con el recibo y ambos botones', () => {
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByTestId('factura-detalle-panel')).toHaveAttribute('data-nro-factura', 'C01-000001')
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compartir/i })).toBeInTheDocument()
  })

  it('click en "Descargar PDF" llama a descargarReciboPdf con el recibo (esReimpresion true)', async () => {
    const user = userEvent.setup()
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
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

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir/i }))

    expect(mockedCompartirReciboImagen).toHaveBeenCalledTimes(1)
    expect(mockedCompartirReciboImagen).toHaveBeenCalledWith(recibo)
  })

  it('cuando compartirReciboImagen rechaza con AbortError, no dispara toast.error', async () => {
    const user = userEvent.setup()
    mockedCompartirReciboImagen.mockRejectedValue(new DOMException('AbortError', 'AbortError'))
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /compartir/i }))

    expect(mockedCompartirReciboImagen).toHaveBeenCalledTimes(1)
    expect(mockedToastError).not.toHaveBeenCalled()
  })
})

describe('ReimprimirFacturaModal — sin navigator.share', () => {
  it('el boton "Compartir" no se renderiza, "Descargar PDF" si', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    const recibo = reciboFixture()
    mockedUseReciboDesdeFactura.mockReturnValue({ recibo, isLoading: false })

    render(<ReimprimirFacturaModal venta={VENTA} isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /compartir/i })).not.toBeInTheDocument()
  })
})
