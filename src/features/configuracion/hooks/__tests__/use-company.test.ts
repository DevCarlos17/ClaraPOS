// `use-company.ts` importa `@/core/db/kysely/kysely`, que instancia `PowerSyncDatabase`
// al cargar el modulo (efecto lateral top-level). En Node/happy-dom eso intenta abrir
// un Worker real y lanza `Worker is not defined`. Mockeamos el constructor para poder
// testear `parseEmpresaConfig` (funcion pura) sin necesitar un PowerSync real.
vi.mock('@powersync/web', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, PowerSyncDatabase: vi.fn().mockImplementation(() => ({})) }
})

import { parseEmpresaConfig } from '../use-company'

describe('parseEmpresaConfig — moneda_presentacion_documentos', () => {
  it("config ausente (null): default 'USD'", () => {
    expect(parseEmpresaConfig(null).moneda_presentacion_documentos).toBe('USD')
  })

  it("config presente sin el campo: default 'USD'", () => {
    expect(parseEmpresaConfig('{"moneda_contable":"BS"}').moneda_presentacion_documentos).toBe('USD')
  })

  it("config con moneda_presentacion_documentos = 'BS': retorna 'BS'", () => {
    expect(parseEmpresaConfig('{"moneda_presentacion_documentos":"BS"}').moneda_presentacion_documentos).toBe('BS')
  })

  it("config con valor invalido (ej. 'EUR'): default 'USD'", () => {
    expect(parseEmpresaConfig('{"moneda_presentacion_documentos":"EUR"}').moneda_presentacion_documentos).toBe(
      'USD'
    )
  })
})
