// Cierra el gap "is_active en depositos es decorativo" (QA post-merge PR#57):
// un deposito referenciado por una caja (cajas.deposito_id) NO puede
// desactivarse sin antes cerrar la sesion abierta (si existe) o reasignar la
// caja a otro deposito. `resolveBloqueoDesactivacion` es la parte pura: dado
// el set de cajas que referencian el deposito (ya resuelto por 1 query
// agrupada, ver `agruparCajasPorDeposito`), decide si la desactivacion debe
// bloquearse y por que motivo. Se testea sin mocks porque no toca la DB — el
// caller (`actualizarDeposito` en use-depositos.ts) es quien ejecuta la query
// y le pasa el resultado ya mapeado.
import {
  agruparCajasPorDeposito,
  resolveBloqueoDesactivacion,
  resolveDepositoReingresoNcr,
} from '../deposito-inactivo'

describe('agruparCajasPorDeposito', () => {
  it('agrupa filas planas de 1 query en un Map<deposito_id, CajaReferenciaDeposito[]>', () => {
    const rows = [
      { deposito_id: 'dep-1', caja_id: 'caja-1', caja_nombre: 'CAJA UNO', tiene_sesion_abierta: 0 },
      { deposito_id: 'dep-1', caja_id: 'caja-2', caja_nombre: 'CAJA DOS', tiene_sesion_abierta: 1 },
      { deposito_id: 'dep-2', caja_id: 'caja-3', caja_nombre: 'CAJA TRES', tiene_sesion_abierta: 0 },
    ]

    const map = agruparCajasPorDeposito(rows)

    expect(map.size).toBe(2)
    expect(map.get('dep-1')).toEqual([
      { cajaId: 'caja-1', cajaNombre: 'CAJA UNO', tieneSesionAbierta: false },
      { cajaId: 'caja-2', cajaNombre: 'CAJA DOS', tieneSesionAbierta: true },
    ])
    expect(map.get('dep-2')).toEqual([
      { cajaId: 'caja-3', cajaNombre: 'CAJA TRES', tieneSesionAbierta: false },
    ])
  })

  it('filas vacias (ningun deposito referenciado por cajas): retorna un Map vacio', () => {
    const map = agruparCajasPorDeposito([])

    expect(map.size).toBe(0)
  })

  it('convierte tiene_sesion_abierta (0/1 SQLite) a boolean real', () => {
    const rows = [
      { deposito_id: 'dep-1', caja_id: 'caja-1', caja_nombre: 'CAJA UNO', tiene_sesion_abierta: 1 },
    ]

    const map = agruparCajasPorDeposito(rows)

    expect(map.get('dep-1')![0]!.tieneSesionAbierta).toBe(true)
  })
})

describe('resolveBloqueoDesactivacion', () => {
  it('Scenario: Bloqueada por sesion abierta — al menos una caja tiene sesion ABIERTA: bloquea con motivo SESION_ABIERTA', () => {
    const cajas = [
      { cajaId: 'caja-1', cajaNombre: 'CAJA UNO', tieneSesionAbierta: false },
      { cajaId: 'caja-2', cajaNombre: 'CAJA DOS', tieneSesionAbierta: true },
    ]

    const bloqueo = resolveBloqueoDesactivacion(cajas)

    expect(bloqueo).toEqual({ bloqueado: true, motivo: 'SESION_ABIERTA', cajas })
  })

  it('Scenario: Bloqueada por caja sin sesion abierta — cajas referencian el deposito pero ninguna tiene sesion abierta: bloquea con motivo CAJA_SIN_SESION', () => {
    const cajas = [
      { cajaId: 'caja-1', cajaNombre: 'CAJA UNO', tieneSesionAbierta: false },
    ]

    const bloqueo = resolveBloqueoDesactivacion(cajas)

    expect(bloqueo).toEqual({ bloqueado: true, motivo: 'CAJA_SIN_SESION', cajas })
  })

  it('Scenario: Permitida sin cajas referenciandolo — ninguna caja apunta al deposito: permite (bloqueado=false, sin motivo)', () => {
    const bloqueo = resolveBloqueoDesactivacion([])

    expect(bloqueo).toEqual({ bloqueado: false, cajas: [] })
  })
})

// Slice B (change `guarda-deposito-inactivo`): reingreso automatico en NCR
// POS-express (decision de producto #3, obs #2228). `resolveDepositoReingresoNcr`
// es la parte pura: dado el deposito de ORIGEN de la venta y si sigue activo,
// mas el deposito principal actual de la empresa, decide a donde reingresa el
// stock — nunca pregunta al cajero. El caller (`crearNotaCredito` en
// use-notas-credito.ts) resuelve `origenIsActive`/`principalDepositoId` con 1
// query cada uno ANTES de construir el INSERT de `movimientos_inventario`.
describe('resolveDepositoReingresoNcr', () => {
  it('Scenario: Reingreso al deposito de origen — origen sigue activo: retorna el ID de origen, ignora el principal', () => {
    expect(resolveDepositoReingresoNcr('dep-origen', true, 'dep-principal')).toBe('dep-origen')
  })

  it('Scenario: Fallback automatico al principal — origen esta inactivo: retorna el ID del deposito principal', () => {
    expect(resolveDepositoReingresoNcr('dep-origen', false, 'dep-principal')).toBe('dep-principal')
  })

  it('origen inactivo y sin principal configurado (caso borde): retorna null — el caller decide como manejarlo', () => {
    expect(resolveDepositoReingresoNcr('dep-origen', false, null)).toBeNull()
  })
})
