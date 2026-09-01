import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VentaExitosaModal, type VentaExitosaData } from '../venta-exitosa-modal'
import { useDetalleFactura, useVentaFecha } from '@/features/cxc/hooks/use-cxc'
import { useCompany, type Company } from '@/features/configuracion/hooks/use-company'
import { buildReciboData } from '../../utils/factura-export'

// `use-company.ts` importa `@/core/db/kysely/kysely`, que instancia `PowerSyncDatabase`
// al cargar el modulo (efecto lateral top-level). Mockeamos el constructor para poder
// usar `importOriginal` y conservar `parseEmpresaConfig` real sin romper el import.
vi.mock('@powersync/web', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, PowerSyncDatabase: vi.fn().mockImplementation(() => ({})) }
})

vi.mock('@/features/configuracion/hooks/use-company', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-company')>()
  return { ...actual, useCompany: vi.fn() }
})

vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useDetalleFactura: vi.fn(),
  useVentaFecha: vi.fn(),
}))

vi.mock('../../utils/factura-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/factura-export')>()
  return {
    ...actual,
    buildReciboData: vi.fn(actual.buildReciboData),
    descargarReciboPdf: vi.fn(),
  }
})

const mockedUseCompany = vi.mocked(useCompany)
const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUseVentaFecha = vi.mocked(useVentaFecha)
const mockedBuildReciboData = vi.mocked(buildReciboData)

function baseCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'emp-1',
    tenant_id: 'tenant-1',
    nombre: 'ClaraPOS Estetica C.A.',
    rif: 'J-12345678-9',
    direccion: 'Av. Principal, Caracas',
    telefono: '0412-1234567',
    email: 'empresa@email.com',
    logo_url: null,
    timezone: 'America/Caracas',
    moneda_base: 'USD',
    config: '{}',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function baseData(overrides: Partial<VentaExitosaData> = {}): VentaExitosaData {
  return {
    ventaId: 'venta-1',
    nroFactura: 'FAC-000123',
    clienteNombre: 'Maria Perez',
    clienteIdentificacion: 'V-12345678',
    clienteDireccion: null,
    totalUsd: 10,
    totalBs: 5000,
    tipo: 'CONTADO',
    pagos: [],
    tasa: 500,
    discrepancy: null,
    ...overrides,
  }
}

describe('VentaExitosaModal — moneda de presentacion del recibo (WU2)', () => {
  beforeEach(() => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUseVentaFecha.mockReturnValue({ fecha: '2026-08-13T10:30:00.000-04:00', isLoading: false })
    mockedBuildReciboData.mockClear()
  })

  it("sin moneda_presentacion_documentos en config (default), pasa monedaPresentacion: 'USD' a buildReciboData", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    render(<VentaExitosaModal isOpen data={baseData()} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Descargar/i }))

    expect(mockedBuildReciboData).toHaveBeenCalledTimes(1)
    expect(mockedBuildReciboData.mock.calls[0][0]).toMatchObject({ monedaPresentacion: 'USD' })
  })

  it("con moneda_presentacion_documentos = 'BS' en config, pasa monedaPresentacion: 'BS' a buildReciboData", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: '{"moneda_presentacion_documentos":"BS"}' }),
      isLoading: false,
    })

    render(<VentaExitosaModal isOpen data={baseData()} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Descargar/i }))

    expect(mockedBuildReciboData).toHaveBeenCalledTimes(1)
    expect(mockedBuildReciboData.mock.calls[0][0]).toMatchObject({ monedaPresentacion: 'BS' })
  })
})
