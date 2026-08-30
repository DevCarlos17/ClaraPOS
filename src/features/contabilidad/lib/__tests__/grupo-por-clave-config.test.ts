import { resolverGrupoPorClaveConfig, type EjecutorSql } from '../grupo-por-clave-config'

function mockEjecutor(row: { id: string; codigo: string; nivel: number } | undefined): EjecutorSql {
  return {
    execute: vi.fn().mockResolvedValue(
      row
        ? { rows: { item: () => row, length: 1 } }
        : { rows: { item: () => undefined, length: 0 } }
    ),
  }
}

describe('resolverGrupoPorClaveConfig', () => {
  it('clave resuelta en cuentas_config -> retorna el GrupoCuenta', async () => {
    const grupo = { id: 'grupo-1', codigo: '6.2.06', nivel: 3 }
    const ejecutor = mockEjecutor(grupo)

    const resultado = await resolverGrupoPorClaveConfig(ejecutor, 'GRUPO_COMISIONES_BANCARIAS', 'empresa-1')

    expect(resultado).toEqual(grupo)
  })

  it('clave sin fila en cuentas_config -> retorna null', async () => {
    const ejecutor = mockEjecutor(undefined)

    const resultado = await resolverGrupoPorClaveConfig(ejecutor, 'GRUPO_COMISIONES_PASARELA', 'empresa-1')

    expect(resultado).toBeNull()
  })

  it('aislamiento multi-tenant: empresaId y clave se pasan como params, nunca embebidos en el SQL', async () => {
    const ejecutor = mockEjecutor({ id: 'grupo-1', codigo: '6.2.06', nivel: 3 })

    await resolverGrupoPorClaveConfig(ejecutor, 'GRUPO_COMISIONES_BANCARIAS', 'empresa-A')

    const [sql, params] = (ejecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('cc.empresa_id = ?')
    expect(sql).toContain('cc.clave = ?')
    expect(params).toEqual(['empresa-A', 'GRUPO_COMISIONES_BANCARIAS'])
  })

  it('row ausente (rows undefined) no rompe — retorna null', async () => {
    const ejecutor: EjecutorSql = { execute: vi.fn().mockResolvedValue({ rows: undefined }) }

    const resultado = await resolverGrupoPorClaveConfig(ejecutor, 'GRUPO_COMISIONES_BANCARIAS', 'empresa-1')

    expect(resultado).toBeNull()
  })
})
