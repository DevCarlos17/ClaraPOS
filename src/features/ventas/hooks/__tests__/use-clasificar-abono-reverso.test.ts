// `clasificarAbonoParaReverso` (Unit 1 de `consulta-factura-reverso-abono-
// directo`, Slice 1) es PURA LECTURA — usa `db.getAll` directo (sin
// `db.writeTransaction`), mismo patron que `detectarLoteSafDePago`/
// `previewFacturasAfectadas`. Mockeamos `db.getAll` (discriminado por texto
// SQL, mismo enfoque que `use-deposito-activo.test.ts`) y
// `detectarLoteSafDePago` para controlar el bloqueo SAF sin una
// PowerSyncDatabase real.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
  },
}))
vi.mock('@/features/cxc/hooks/reversa-pago-saf', () => ({
  detectarLoteSafDePago: vi.fn(),
}))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook, waitFor } from '@testing-library/react'
import { db } from '@/core/db/powersync/db'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  clasificarAbonoParaReverso,
  resolverIngresoIdParaPago,
  useClasificarAbonoParaReverso,
  REASON_BATCH_NO_DISPONIBLE,
  REASON_SAF_BLOQUEADO,
  REASON_LEGACY_SIN_TRAZABILIDAD,
} from '../use-clasificar-abono-reverso'

const mockedGetAll = vi.mocked(db.getAll)
const mockedDetectarLoteSafDePago = vi.mocked(detectarLoteSafDePago)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

beforeEach(() => {
  vi.clearAllMocks()
})

interface PagoFixture {
  metodo_cobro_id: string
  sesion_caja_id: string | null
}

/**
 * Dispatcher de `db.getAll` discriminado por texto SQL (mismo enfoque que
 * `use-deposito-activo.test.ts`). `fanIn` son los `pago_id` devueltos por la
 * query de fan-in (`ingreso_id -> pago_id`) cuando aplica.
 */
function mockDb(opts: {
  pago: PagoFixture | null
  sesionStatus?: string | null
  ingresoId?: string | null
  fanIn?: string[]
  depositoDirecto?: number | null
}) {
  mockedGetAll.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
    const sqlStr = String(sql)
    if (sqlStr.includes('FROM pagos WHERE id')) {
      return (opts.pago ? [opts.pago] : []) as never
    }
    if (sqlStr.includes('FROM sesiones_caja')) {
      return (opts.sesionStatus !== undefined && opts.sesionStatus !== null
        ? [{ status: opts.sesionStatus }]
        : []) as never
    }
    if (sqlStr.includes('FROM movimientos_bancarios_pagos WHERE pago_id')) {
      return (opts.ingresoId ? [{ ingreso_id: opts.ingresoId }] : []) as never
    }
    if (sqlStr.includes('FROM movimientos_bancarios_pagos WHERE ingreso_id')) {
      return ((opts.fanIn ?? []).map((pago_id) => ({ pago_id }))) as never
    }
    if (sqlStr.includes('FROM metodos_cobro')) {
      return (opts.depositoDirecto !== undefined && opts.depositoDirecto !== null
        ? [{ deposito_directo: opts.depositoDirecto }]
        : []) as never
    }
    void params
    return [] as never
  })
}

describe('resolverIngresoIdParaPago — reverse-lookup pago_id -> ingreso_id', () => {
  it('fila encontrada: retorna el ingreso_id', async () => {
    mockedGetAll.mockResolvedValueOnce([{ ingreso_id: 'ingreso-1' }])

    const resultado = await resolverIngresoIdParaPago('emp-1', 'pago-1')

    expect(resultado).toBe('ingreso-1')
    const [sql, params] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('FROM movimientos_bancarios_pagos')
    expect(sql).toContain('pago_id = ?')
    expect(params).toEqual(['pago-1', 'emp-1'])
  })

  it('sin fila: retorna null (BATCH o LEGACY, indistinguible en este punto)', async () => {
    mockedGetAll.mockResolvedValueOnce([])

    const resultado = await resolverIngresoIdParaPago('emp-1', 'pago-sin-puente')

    expect(resultado).toBeNull()
  })
})

describe('clasificarAbonoParaReverso — clasificacion en 4 estados mutuamente excluyentes', () => {
  it('DIRECT: fila en el puente, sin lote SAF consumido en el fan-in', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: 'sesion-abierta' },
      sesionStatus: 'ABIERTA',
      ingresoId: 'ingreso-1',
      fanIn: ['pago-1'],
    })
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-1')

    expect(resultado).toEqual({
      pagoId: 'pago-1',
      estado: 'DIRECT',
      ingresoId: 'ingreso-1',
      sesionCerrada: false,
    })
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-1')
  })

  it('DIRECT con fan-in global (N pagos ligados al mismo ingreso): clasifica DIRECT si ninguno bloquea por SAF', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: null },
      ingresoId: 'ingreso-global',
      fanIn: ['pago-A', 'pago-B'],
    })
    mockedDetectarLoteSafDePago.mockResolvedValue({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-A')

    expect(resultado.estado).toBe('DIRECT')
    expect(resultado.ingresoId).toBe('ingreso-global')
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledTimes(2)
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-A')
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-B')
  })

  it('BATCH: sin fila en el puente y metodos_cobro.deposito_directo=0', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-efectivo', sesion_caja_id: null },
      ingresoId: null,
      depositoDirecto: 0,
    })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-batch')

    expect(resultado).toEqual({
      pagoId: 'pago-batch',
      estado: 'BATCH',
      sesionCerrada: false,
      reasonCode: REASON_BATCH_NO_DISPONIBLE,
    })
    // BATCH nunca dispara deteccion SAF — no hay puente que resolver fan-in.
    expect(mockedDetectarLoteSafDePago).not.toHaveBeenCalled()
  })

  it('LEGACY: sin fila en el puente pero metodos_cobro.deposito_directo=1 (deberia tener trazabilidad y no la tiene)', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-transferencia', sesion_caja_id: null },
      ingresoId: null,
      depositoDirecto: 1,
    })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-legacy')

    expect(resultado).toEqual({
      pagoId: 'pago-legacy',
      estado: 'LEGACY',
      sesionCerrada: false,
      reasonCode: REASON_LEGACY_SIN_TRAZABILIDAD,
    })
    expect(mockedDetectarLoteSafDePago).not.toHaveBeenCalled()
  })

  it('SAF: DIRECT pero el fan-in incluye un pago cuyo lote SAF ya fue consumido en otra factura -> bloqueado', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: null },
      ingresoId: 'ingreso-saf',
      fanIn: ['pago-cobro', 'pago-anticipo'],
    })
    mockedDetectarLoteSafDePago.mockImplementation(async (_empresaId, pagoId) => {
      if (pagoId === 'pago-anticipo') {
        return {
          generatedLote: true,
          loteId: 'lote-1',
          montoOriginalUsd: 30,
          saldoDisponibleUsd: 0,
          montoConsumidoUsd: 30,
          facturasAfectadas: [{ ventaId: 'venta-D', nroFactura: 'F-D', montoAplicadoUsd: 30 }],
        }
      }
      return { generatedLote: false, facturasAfectadas: [] }
    })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-cobro')

    expect(resultado).toEqual({
      pagoId: 'pago-cobro',
      estado: 'SAF',
      ingresoId: 'ingreso-saf',
      sesionCerrada: false,
      reasonCode: REASON_SAF_BLOQUEADO,
    })
  })

  it('DIRECT NO se bloquea por SAF cuando el lote fue generado pero esta INTACTO (facturasAfectadas=[]): reversarPagoSafEnTx lo compensa limpio, misma condicion que reversarAbonoDirectoDesdeTesoreria PRE-TX 3', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: null },
      ingresoId: 'ingreso-intacto',
      fanIn: ['pago-anticipo-intacto'],
    })
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({
      generatedLote: true,
      loteId: 'lote-intacto',
      montoOriginalUsd: 50,
      saldoDisponibleUsd: 50,
      montoConsumidoUsd: 0,
      facturasAfectadas: [],
    })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-anticipo-intacto')

    expect(resultado.estado).toBe('DIRECT')
    expect(resultado.ingresoId).toBe('ingreso-intacto')
  })

  it('sesionCerrada=true: la sesion de caja del pago tiene status CERRADA (warn-and-allow, no bloquea la clasificacion)', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: 'sesion-cerrada' },
      sesionStatus: 'CERRADA',
      ingresoId: 'ingreso-1',
      fanIn: ['pago-viejo'],
    })
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-viejo')

    expect(resultado.estado).toBe('DIRECT')
    expect(resultado.sesionCerrada).toBe(true)
  })

  it('sesionCerrada=false cuando el pago no tiene sesion_caja_id (abono standalone de CxC)', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: null },
      ingresoId: null,
      depositoDirecto: 0,
    })

    const resultado = await clasificarAbonoParaReverso('emp-1', 'pago-standalone')

    expect(resultado.sesionCerrada).toBe(false)
    // Sin sesion_caja_id, la query de sesiones_caja nunca debe dispararse.
    const sesionCalls = mockedGetAll.mock.calls.filter(([sql]) => String(sql).includes('FROM sesiones_caja'))
    expect(sesionCalls).toHaveLength(0)
  })

  it('pago no encontrado: lanza error explicito', async () => {
    mockDb({ pago: null })

    await expect(clasificarAbonoParaReverso('emp-1', 'pago-inexistente')).rejects.toThrow('Pago no encontrado')
  })

  it('aislamiento multi-tenant: todas las queries (pagos, sesiones_caja, puente, metodos_cobro) filtran por empresa_id', async () => {
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: 'sesion-1' },
      sesionStatus: 'ABIERTA',
      ingresoId: null,
      depositoDirecto: 0,
    })

    await clasificarAbonoParaReverso('emp-a', 'pago-1')

    for (const [sql, params] of mockedGetAll.mock.calls) {
      expect(String(sql)).toContain('empresa_id = ?')
      expect(params as unknown[]).toContain('emp-a')
    }
  })

  it('aislamiento multi-tenant: un pago_id de empresa A no resuelve el puente de empresa B (la query de fan-in tambien filtra empresa_id)', async () => {
    mockedGetAll.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const sqlStr = String(sql)
      if (sqlStr.includes('FROM pagos WHERE id')) {
        return [{ metodo_cobro_id: 'metodo-1', sesion_caja_id: null }] as never
      }
      if (sqlStr.includes('FROM movimientos_bancarios_pagos WHERE pago_id')) {
        const [pagoId, empresaId] = params as [string, string]
        if (pagoId === 'pago-empresa-a' && empresaId === 'emp-a') {
          return [{ ingreso_id: 'ingreso-a' }] as never
        }
        return [] as never
      }
      if (sqlStr.includes('FROM movimientos_bancarios_pagos WHERE ingreso_id')) {
        return [{ pago_id: 'pago-empresa-a' }] as never
      }
      return [] as never
    })
    mockedDetectarLoteSafDePago.mockResolvedValue({ generatedLote: false, facturasAfectadas: [] })

    const resultadoCorrecto = await clasificarAbonoParaReverso('emp-a', 'pago-empresa-a')
    expect(resultadoCorrecto.estado).toBe('DIRECT')
    expect(resultadoCorrecto.ingresoId).toBe('ingreso-a')

    mockedGetAll.mockImplementation(async (sql: unknown) => {
      const sqlStr = String(sql)
      if (sqlStr.includes('FROM pagos WHERE id')) {
        return [{ metodo_cobro_id: 'metodo-1', sesion_caja_id: null }] as never
      }
      if (sqlStr.includes('FROM metodos_cobro')) {
        return [{ deposito_directo: 0 }] as never
      }
      return [] as never
    })

    const resultadoCruzado = await clasificarAbonoParaReverso('emp-b', 'pago-empresa-a')
    // Mismo pago_id, otra empresa: el puente NUNCA resuelve (aislamiento) -> cae a BATCH/LEGACY, nunca DIRECT.
    expect(resultadoCruzado.estado).not.toBe('DIRECT')
  })
})

describe('useClasificarAbonoParaReverso — hook wrapper filtrado por empresa_id del usuario actual', () => {
  function setupUser(empresaId: string | null) {
    mockedUseCurrentUser.mockReturnValue({
      user: empresaId
        ? {
            id: 'user-1',
            empresa_id: empresaId,
            email: '',
            nombre: '',
            level: 1,
            rol_id: null,
            rol_nombre: null,
          }
        : null,
      loading: false,
    })
  }

  it('resuelve la clasificacion usando el empresa_id del usuario actual (useCurrentUser), no un parametro explicito', async () => {
    setupUser('emp-del-usuario')
    mockDb({
      pago: { metodo_cobro_id: 'metodo-1', sesion_caja_id: null },
      ingresoId: null,
      depositoDirecto: 0,
    })

    const { result } = renderHook(() => useClasificarAbonoParaReverso('pago-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.clasificacion).toEqual({
      pagoId: 'pago-1',
      estado: 'BATCH',
      sesionCerrada: false,
      reasonCode: REASON_BATCH_NO_DISPONIBLE,
    })
    const pagoCall = mockedGetAll.mock.calls.find(([sql]) => String(sql).includes('FROM pagos WHERE id'))
    expect(pagoCall?.[1]).toEqual(['pago-1', 'emp-del-usuario'])
  })

  it('pagoId=null: no dispara ninguna query, clasificacion queda null', () => {
    setupUser('emp-1')

    const { result } = renderHook(() => useClasificarAbonoParaReverso(null))

    expect(result.current.loading).toBe(false)
    expect(result.current.clasificacion).toBeNull()
    expect(mockedGetAll).not.toHaveBeenCalled()
  })

  it('sin usuario autenticado (empresa_id vacio): no dispara ninguna query', () => {
    setupUser(null)

    const { result } = renderHook(() => useClasificarAbonoParaReverso('pago-1'))

    expect(result.current.clasificacion).toBeNull()
    expect(mockedGetAll).not.toHaveBeenCalled()
  })
})
