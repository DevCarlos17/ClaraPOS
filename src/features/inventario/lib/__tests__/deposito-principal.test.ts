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
import { buildUnsetOtrosPrincipalesQuery } from '../deposito-principal'

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
