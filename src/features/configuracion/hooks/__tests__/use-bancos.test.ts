import { bancoTieneActividadEnSesionAbierta, type EjecutorSql } from '../banco-actividad-sesion'

function mockEjecutor(cnt: number, rowsUndefined = false): EjecutorSql {
  return {
    execute: vi.fn().mockResolvedValue(
      rowsUndefined
        ? { rows: undefined }
        : { rows: { item: () => ({ cnt }), length: 1 } }
    ),
  }
}

describe('bancoTieneActividadEnSesionAbierta', () => {
  it('banco con pagos en sesion abierta — bloqueado', async () => {
    const ejecutor = mockEjecutor(1)

    const resultado = await bancoTieneActividadEnSesionAbierta(ejecutor, 'banco-1', 'empresa-1')

    expect(resultado).toBe(true)
    const [sql] = (ejecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("status = 'ABIERTA'")
    expect(sql).toContain('is_reversed')
  })

  it('sin actividad abierta — permitido', async () => {
    const ejecutor = mockEjecutor(0)

    const resultado = await bancoTieneActividadEnSesionAbierta(ejecutor, 'banco-1', 'empresa-1')

    expect(resultado).toBe(false)
  })

  it('aislamiento multi-tenant: empresaId se filtra dos veces (sesion + pago) y bancoId una vez', async () => {
    const ejecutor = mockEjecutor(1)

    await bancoTieneActividadEnSesionAbierta(ejecutor, 'banco-1', 'empresa-1')

    const [, params] = (ejecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['empresa-1', 'empresa-1', 'banco-1'])
  })

  it('row ausente no rompe — retorna false', async () => {
    const ejecutor = mockEjecutor(0, true)

    const resultado = await bancoTieneActividadEnSesionAbierta(ejecutor, 'banco-1', 'empresa-1')

    expect(resultado).toBe(false)
  })
})
