// `guardarAgendaConfig`/`parseAgendaConfig` deben pasar por el mismo camino
// corruption-proof que `use-company.ts` usa para `empresas.config` (ver
// `use-company.test.ts`). Antes de este fix, `use-agenda-config.ts` tenia su
// propio parser debil que, sobre un config ya corrupto (char-indexed), no
// encontraba el namespace `agenda` dentro del blob y caia silenciosamente a
// `{}`, perdiendo la configuracion de agenda existente y sin sanear las
// claves numericas de corrupcion (la fila seguia creciendo en cada guardado).
//
// Mockeamos `@/core/db/powersync/db` directamente (no `@powersync/web`) porque
// `guardarAgendaConfig` es una funcion standalone que solo usa `db.getAll` y
// `db.writeTransaction` — no requiere una instancia real de PowerSyncDatabase.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/web'
import { db } from '@/core/db/powersync/db'
import { guardarAgendaConfig, parseAgendaConfig } from '../use-agenda-config'

const mockedDb = vi.mocked(db, true)

// Reproduce la corrupcion real observada en produccion: un string JSON original
// "spreadeado" caracter por caracter ({ ...unString }), generando un objeto
// indexado numericamente ("0", "1", "2", ...) que luego se re-stringifica.
function buildCharIndexedCorruptString(originalJson: string): string {
  const charIndexed = Object.fromEntries([...originalJson].map((ch, i) => [String(i), ch]))
  return JSON.stringify(charIndexed)
}

/** Simula `db.getAll` retornando una unica fila `empresas.config` y captura el `UPDATE` escrito. */
function mockDbRoundTrip(existingConfig: string | null) {
  mockedDb.getAll.mockResolvedValue(existingConfig === null ? [] : [{ config: existingConfig }])

  let writtenConfig = ''
  mockedDb.writeTransaction.mockImplementation(async (callback: (tx: Transaction) => Promise<unknown>) => {
    return callback({
      execute: vi.fn((_sql: string, params: unknown[]) => {
        writtenConfig = params[0] as string
      }),
    } as unknown as Transaction)
  })

  return () => writtenConfig
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseAgendaConfig — recupera el namespace "agenda" incluso sobre config corrupto', () => {
  it('config char-indexed corrupto que codifica settings reales de agenda: los recupera en vez de caer a defaults', () => {
    const originalCleanJson = JSON.stringify({
      agenda: { mostrar_agenda: false, limite_futuro_dias: 7, tolerancia_noshow_min: 45 },
      moneda_presentacion_documentos: 'BS',
    })
    const corrupt = buildCharIndexedCorruptString(originalCleanJson)

    const result = parseAgendaConfig(corrupt)

    expect(result.mostrar_agenda).toBe(false)
    expect(result.limite_futuro_dias).toBe(7)
    expect(result.tolerancia_noshow_min).toBe(45)
  })
})

describe('guardarAgendaConfig — CRITICAL: preserva agenda y otros namespaces sobre config ya corrupto', () => {
  it('guardar un update de agenda sobre config corrupto (char-indexed) preserva settings de agenda preexistentes Y moneda_presentacion_documentos, sin claves numericas, y converge (no crece)', async () => {
    const originalCleanJson = JSON.stringify({
      agenda: { mostrar_agenda: false, limite_futuro_dias: 7, tolerancia_noshow_min: 45 },
      moneda_presentacion_documentos: 'BS',
    })
    const corrupt = buildCharIndexedCorruptString(originalCleanJson)
    const getWritten = mockDbRoundTrip(corrupt)

    await guardarAgendaConfig('empresa-1', { duracion_slot_default: 45 })

    const parsed = JSON.parse(getWritten()) as Record<string, unknown>

    // No debe perder la config de agenda preexistente (el bug la dropeaba a {}).
    expect(parsed.agenda).toEqual({
      mostrar_agenda: false,
      limite_futuro_dias: 7,
      tolerancia_noshow_min: 45,
      duracion_slot_default: 45,
    })
    // No debe perder el namespace de otra feature en la misma columna.
    expect(parsed.moneda_presentacion_documentos).toBe('BS')
    // Debe sanear las claves numericas del patron de corrupcion.
    expect(Object.keys(parsed).every((key) => Number.isNaN(Number(key)))).toBe(true)
    // Debe converger: la fila nunca puede seguir creciendo por este bug.
    expect(getWritten().length).toBeLessThan(corrupt.length)
  })

  it('cross-namespace: guardar agenda sobre config limpio preserva moneda_presentacion_documentos', async () => {
    const clean = JSON.stringify({ moneda_presentacion_documentos: 'BS', moneda_contable: 'USD' })
    const getWritten = mockDbRoundTrip(clean)

    await guardarAgendaConfig('empresa-1', { mostrar_agenda: false })

    const parsed = JSON.parse(getWritten()) as Record<string, unknown>
    expect(parsed.moneda_presentacion_documentos).toBe('BS')
    expect(parsed.moneda_contable).toBe('USD')
    expect(parsed.agenda).toEqual({ mostrar_agenda: false })
  })

  it('sin config previo (fila nueva/vacia): crea el namespace agenda sin romper', async () => {
    const getWritten = mockDbRoundTrip(null)

    await guardarAgendaConfig('empresa-1', { duracion_slot_default: 60 })

    const parsed = JSON.parse(getWritten()) as Record<string, unknown>
    expect(parsed.agenda).toEqual({ duracion_slot_default: 60 })
  })

  it('fixed point: guardados repetidos de agenda convergen y nunca crecen', async () => {
    let current = JSON.stringify({ agenda: { mostrar_agenda: true }, moneda_presentacion_documentos: 'USD' })

    const lengths: number[] = []
    for (let i = 0; i < 5; i++) {
      const getWritten = mockDbRoundTrip(current)
      await guardarAgendaConfig('empresa-1', {})
      current = getWritten()
      lengths.push(current.length)
    }

    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1])
    }
  })
})
