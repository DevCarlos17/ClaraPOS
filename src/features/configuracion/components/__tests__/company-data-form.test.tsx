import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyDataForm } from '../company-data-form'
import { useCompany, updateCompany, type Company } from '../../hooks/use-company'

// `use-company.ts` importa `@/core/db/kysely/kysely`, que instancia `PowerSyncDatabase`
// al cargar el modulo (efecto lateral top-level). Mockeamos el constructor para poder
// usar `importOriginal` y conservar el `parseEmpresaConfig` real sin romper el import.
vi.mock('@powersync/web', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, PowerSyncDatabase: vi.fn().mockImplementation(() => ({})) }
})

vi.mock('../../hooks/use-company', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/use-company')>()
  return { ...actual, useCompany: vi.fn(), updateCompany: vi.fn() }
})

// Radix Select usa Pointer Events (hasPointerCapture/releasePointerCapture) que
// happy-dom no implementa. Sin este polyfill, abrir el listbox lanza un TypeError.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
})

const mockedUseCompany = vi.mocked(useCompany)
const mockedUpdateCompany = vi.mocked(updateCompany)

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

describe('CompanyDataForm — selector de moneda de presentacion de documentos', () => {
  beforeEach(() => {
    mockedUpdateCompany.mockReset().mockResolvedValue(undefined)
  })

  it("sin moneda_presentacion_documentos en config, la opcion USD queda seleccionada por defecto", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    render(<CompanyDataForm />)
    await user.click(screen.getByRole('combobox', { name: /moneda de presentacion/i }))

    expect(await screen.findByRole('option', { name: /Dolares/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Bol.*var/i })).toHaveAttribute('aria-selected', 'false')
  })

  it("config con moneda_presentacion_documentos = 'BS' preexistente, esa opcion queda seleccionada", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: '{"moneda_presentacion_documentos":"BS"}' }),
      isLoading: false,
    })

    render(<CompanyDataForm />)
    await user.click(screen.getByRole('combobox', { name: /moneda de presentacion/i }))

    expect(await screen.findByRole('option', { name: /Bol.*var/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Dolares/i })).toHaveAttribute('aria-selected', 'false')
  })

  it("transicion real isLoading:true -> false (company llega despues del mount): el Select refleja 'BS' persistido, no el fallback 'USD'", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({ company: null, isLoading: true })

    const { rerender } = render(<CompanyDataForm />)

    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: '{"moneda_presentacion_documentos":"BS"}' }),
      isLoading: false,
    })
    rerender(<CompanyDataForm />)

    await user.click(screen.getByRole('combobox', { name: /moneda de presentacion/i }))

    expect(await screen.findByRole('option', { name: /Bol.*var/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Dolares/i })).toHaveAttribute('aria-selected', 'false')
  })

  it("seleccionar Bolivares y enviar llama a updateCompany con moneda_presentacion_documentos: 'BS', preservando otras claves de config", async () => {
    const user = userEvent.setup()
    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: '{"moneda_contable":"USD"}' }),
      isLoading: false,
    })

    render(<CompanyDataForm />)

    await user.click(screen.getByRole('combobox', { name: /moneda de presentacion/i }))
    await user.click(await screen.findByRole('option', { name: /Bol.*var/i }))
    await user.click(screen.getByRole('button', { name: /Guardar Cambios/i }))

    expect(mockedUpdateCompany).toHaveBeenCalledTimes(1)
    const [, payload] = mockedUpdateCompany.mock.calls[0]
    expect(JSON.parse(payload.config as string)).toEqual({
      moneda_contable: 'USD',
      moneda_presentacion_documentos: 'BS',
    })
  })
})
