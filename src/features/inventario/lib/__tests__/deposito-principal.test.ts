// Invariante "single es_principal deposito per empresa": al guardar un
// deposito con es_principal=true, hay que desmarcar (en la MISMA transaccion)
// cualquier OTRO deposito de la misma empresa que ya tuviera es_principal=1,
// para que a lo sumo uno quede marcado. Sin esto, resolveDepositoIngreso /
// resolveDepositoEgresoVenta (`SELECT ... WHERE es_principal=1 LIMIT 1` sin
// ORDER BY) resuelven de forma no-determinista cuando hay 2+ principales.
//
// `buildUnsetOtrosPrincipalesQuery` es la parte pura: dado empresaId + now (y
// opcionalmente el id del propio deposito a excluir, para el caso UPDATE),
// construye el UPDATE que desmarca a los demas. Se testea sin mocks porque no
// toca la DB — el caller (`crearDeposito`/`actualizarDeposito`) es quien la
// ejecuta dentro de `db.writeTransaction`.
import {
  buildUnsetOtrosPrincipalesQuery,
  debeBloquearQuitarUltimoPrincipal,
  debeForzarPrincipalUnico,
} from '../deposito-principal'

describe('buildUnsetOtrosPrincipalesQuery', () => {
  it('CREATE (sin excludeId): desmarca todos los principales existentes de la empresa', () => {
    const result = buildUnsetOtrosPrincipalesQuery('empresa-1', '2026-08-20T10:00:00.000Z')

    expect(result.sql).toContain('UPDATE depositos')
    expect(result.sql).toContain('SET es_principal = 0')
    expect(result.sql).toContain('WHERE empresa_id = ?')
    expect(result.sql).toContain('AND es_principal = 1')
    expect(result.sql).not.toContain('id !=')
    expect(result.params).toEqual(['2026-08-20T10:00:00.000Z', 'empresa-1'])
  })

  it('UPDATE (con excludeId): desmarca los principales de la empresa EXCLUYENDO el propio deposito', () => {
    const result = buildUnsetOtrosPrincipalesQuery(
      'empresa-2',
      '2026-08-20T11:30:00.000Z',
      'deposito-actual'
    )

    expect(result.sql).toContain('AND id != ?')
    expect(result.params).toEqual([
      '2026-08-20T11:30:00.000Z',
      'empresa-2',
      'deposito-actual',
    ])
  })
})

// Invariante "al menos un deposito principal por empresa" (at-least-one,
// cierra la decision de producto abierta en Lote B): la empresa nunca puede
// quedar con CERO depositos activos con es_principal=1. Se bloquea SOLO la
// transicion que quitaria al ULTIMO principal activo — marcar OTRO deposito
// como principal sigue permitido siempre (el camino at-most-one garantiza que
// ese otro deposito ya cubre el rol antes de desmarcar este).
describe('debeBloquearQuitarUltimoPrincipal', () => {
  it('es el unico principal activo Y la operacion lo esta quitando Y no hay otro principal activo: BLOQUEA', () => {
    const bloqueado = debeBloquearQuitarUltimoPrincipal({
      esPrincipalActivoActual: true,
      seEstaQuitando: true,
      existeOtroPrincipalActivo: false,
    })

    expect(bloqueado).toBe(true)
  })

  it('es principal activo y se esta quitando, PERO otro deposito de la empresa ya es principal activo: PERMITE', () => {
    const bloqueado = debeBloquearQuitarUltimoPrincipal({
      esPrincipalActivoActual: true,
      seEstaQuitando: true,
      existeOtroPrincipalActivo: true,
    })

    expect(bloqueado).toBe(false)
  })

  it('el deposito NO es actualmente el principal activo (ej: es secundario): PERMITE, sin importar el resto', () => {
    const bloqueado = debeBloquearQuitarUltimoPrincipal({
      esPrincipalActivoActual: false,
      seEstaQuitando: true,
      existeOtroPrincipalActivo: false,
    })

    expect(bloqueado).toBe(false)
  })

  it('es el principal activo pero la operacion NO lo esta quitando (ej: solo renombrar): PERMITE', () => {
    const bloqueado = debeBloquearQuitarUltimoPrincipal({
      esPrincipalActivoActual: true,
      seEstaQuitando: false,
      existeOtroPrincipalActivo: false,
    })

    expect(bloqueado).toBe(false)
  })
})

// Invariante "deposito activo unico debe ser principal": si tras la operacion
// la empresa queda con exactamente 1 deposito activo (otrosActivosCount=0 +
// quedaraActivo), ese deposito DEBE ser es_principal=1. `debeForzarPrincipalUnico`
// determina si la operacion debe BLOQUEARSE porque dejaria a ese unico
// deposito activo con es_principal=0, lo que rompe el fallback de
// `resolveDepositoIngreso`/`resolveDepositoEgresoVenta`
// (`... WHERE es_principal=1 AND is_active=1 LIMIT 1`).
describe('debeForzarPrincipalUnico', () => {
  it('no quedan otros activos Y este quedara activo Y quedara es_principal=false: BLOQUEA', () => {
    const bloqueado = debeForzarPrincipalUnico({
      otrosActivosCount: 0,
      quedaraActivo: true,
      esPrincipalFalse: true,
    })

    expect(bloqueado).toBe(true)
  })

  it('existe al menos otro deposito activo (otrosActivosCount > 0): PERMITE, sin importar el resto', () => {
    const bloqueado = debeForzarPrincipalUnico({
      otrosActivosCount: 1,
      quedaraActivo: true,
      esPrincipalFalse: true,
    })

    expect(bloqueado).toBe(false)
  })

  it('el propio deposito NO quedara activo (se esta desactivando): PERMITE', () => {
    const bloqueado = debeForzarPrincipalUnico({
      otrosActivosCount: 0,
      quedaraActivo: false,
      esPrincipalFalse: true,
    })

    expect(bloqueado).toBe(false)
  })

  it('el propio deposito quedara es_principal=true: PERMITE', () => {
    const bloqueado = debeForzarPrincipalUnico({
      otrosActivosCount: 0,
      quedaraActivo: true,
      esPrincipalFalse: false,
    })

    expect(bloqueado).toBe(false)
  })
})
