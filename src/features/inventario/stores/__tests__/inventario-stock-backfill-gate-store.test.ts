import { createInventarioStockBackfillGateStore } from '../inventario-stock-backfill-gate-store'

describe('createInventarioStockBackfillGateStore — arranques POSTERIORES al primero (flag ya marcado)', () => {
  it('estado inicial es "listo" de inmediato — sin gate, sin esperar ninguna operacion', () => {
    const store = createInventarioStockBackfillGateStore(true)
    expect(store.getState().estado).toBe('listo')
  })

  it('marcarTerminado() no cambia nada — ya estaba listo (idempotente)', () => {
    const store = createInventarioStockBackfillGateStore(true)
    store.getState().marcarTerminado()
    expect(store.getState().estado).toBe('listo')
  })
})

describe('createInventarioStockBackfillGateStore — PRIMER arranque (flag ausente)', () => {
  it('estado inicial es "verificando" — el POS debe gatear mientras el backfill corre', () => {
    const store = createInventarioStockBackfillGateStore(false)
    expect(store.getState().estado).toBe('verificando')
  })

  it('marcarTerminado() (llamado tras EXITO del backfill) transiciona a "listo"', () => {
    const store = createInventarioStockBackfillGateStore(false)
    store.getState().marcarTerminado()
    expect(store.getState().estado).toBe('listo')
  })

  it('marcarTerminado() (llamado tras FALLO del backfill — el orquestador nunca lanza, solo resuelve) TAMBIEN transiciona a "listo": nunca bloquea el POS permanentemente', () => {
    const store = createInventarioStockBackfillGateStore(false)
    // El orquestador (`ejecutarInventarioStockBackfillSiNecesario`) resuelve
    // igual en exito y en fallo (el error se atrapa internamente) — desde
    // la perspectiva del store no hay forma de distinguir el caso, y no
    // deberia: ambos des-gatean por igual.
    store.getState().marcarTerminado()
    expect(store.getState().estado).toBe('listo')
  })
})
