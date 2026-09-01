// `use-company.ts` importa `@/core/db/kysely/kysely`, que instancia `PowerSyncDatabase`
// al cargar el modulo (efecto lateral top-level). En Node/happy-dom eso intenta abrir
// un Worker real y lanza `Worker is not defined`. Mockeamos el constructor para poder
// testear `parseEmpresaConfig` (funcion pura) sin necesitar un PowerSync real.
vi.mock('@powersync/web', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, PowerSyncDatabase: vi.fn().mockImplementation(() => ({})) }
})

import { parseEmpresaConfig, serializeEmpresaConfig, readConfigNamespace, serializeConfigNamespace } from '../use-company'

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

// Helper: simula la corrupcion real observada en produccion — un string JSON
// original se "spreadea" caracter por caracter (`{ ...unString }`) generando un
// objeto indexado numericamente ("0", "1", "2", ...), que luego se re-stringifica.
function buildCharIndexedCorruptString(originalJson: string): string {
  const charIndexed = Object.fromEntries([...originalJson].map((ch, i) => [String(i), ch]))
  return JSON.stringify(charIndexed)
}

describe('parseEmpresaConfig — saneamiento de corrupcion (bug de spread caracter por caracter)', () => {
  it('dado el string corrupto observado en produccion (JSON de un objeto indexado por caracter), retorna un EmpresaConfig limpio sin claves numericas', () => {
    const originalCleanJson = '{"moneda_presentacion_documentos":"BS"}'
    const corruptString = buildCharIndexedCorruptString(originalCleanJson)

    const result = parseEmpresaConfig(corruptString)

    expect(result).toEqual({ moneda_presentacion_documentos: 'BS' })
    expect(Object.keys(result)).not.toContain('0')
    expect(Object.keys(result)).not.toContain('1')
  })

  it('dado un config doblemente codificado (JSON string de un string JSON), no lo spreadea caracter por caracter y retorna un objeto limpio', () => {
    const doubleEncoded = JSON.stringify('{"moneda_presentacion_documentos":"BS"}')

    const result = parseEmpresaConfig(doubleEncoded)

    expect(result.moneda_presentacion_documentos).toBe('BS')
    expect(Object.keys(result).every((key) => Number.isNaN(Number(key)))).toBe(true)
  })

  it('config invalido/irrecuperable: cae al default limpio sin claves numericas', () => {
    const result = parseEmpresaConfig('"not an object at all, just a plain string"')

    expect(result).toEqual({ moneda_presentacion_documentos: 'USD' })
  })
})

describe('serializeEmpresaConfig — aplica updates sobre claves conocidas, descarta corrupcion', () => {
  it('aplica moneda_contable/moneda_presentacion_documentos sobre un config vacio', () => {
    const serialized = serializeEmpresaConfig(null, { moneda_contable: 'BS', moneda_presentacion_documentos: 'USD' })

    expect(JSON.parse(serialized)).toEqual({
      moneda_contable: 'BS',
      moneda_presentacion_documentos: 'USD',
    })
  })

  it('sin updates de moneda_contable: preserva el valor existente en el config original', () => {
    const serialized = serializeEmpresaConfig('{"moneda_contable":"BS"}', {
      moneda_presentacion_documentos: 'BS',
    })

    expect(JSON.parse(serialized)).toEqual({ moneda_contable: 'BS', moneda_presentacion_documentos: 'BS' })
  })

  it('descarta claves puramente numericas (residuo de corrupcion) aunque no formen un objeto char-indexed completo', () => {
    const serialized = serializeEmpresaConfig('{"0":"x","moneda_presentacion_documentos":"BS"}', {})

    expect(JSON.parse(serialized)).toEqual({ moneda_presentacion_documentos: 'BS' })
  })

  it('preserva namespaces ajenos en el config (ej. "agenda" de use-agenda-config.ts) al actualizar solo moneda_presentacion_documentos — NO debe perder configuracion de otra feature', () => {
    const configConAgenda = JSON.stringify({
      agenda: { mostrar_agenda: true, limite_futuro_dias: 30 },
      moneda_presentacion_documentos: 'USD',
    })

    const serialized = serializeEmpresaConfig(configConAgenda, { moneda_presentacion_documentos: 'BS' })

    expect(JSON.parse(serialized)).toEqual({
      agenda: { mostrar_agenda: true, limite_futuro_dias: 30 },
      moneda_presentacion_documentos: 'BS',
    })
  })
})

describe('round-trip parse + serialize — converge a un punto fijo, nunca crece', () => {
  it('serializar+parsear repetidamente un config corrupto converge y la longitud del string nunca aumenta', () => {
    const originalCleanJson = '{"moneda_presentacion_documentos":"BS","moneda_contable":"USD"}'
    let current = buildCharIndexedCorruptString(originalCleanJson)

    const lengths: number[] = []
    for (let i = 0; i < 5; i++) {
      current = serializeEmpresaConfig(current, {})
      lengths.push(current.length)
    }

    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1])
    }

    const finalParsed = JSON.parse(current) as Record<string, unknown>
    expect(Object.keys(finalParsed)).not.toContain('0')
    expect(finalParsed).toEqual({ moneda_presentacion_documentos: 'BS', moneda_contable: 'USD' })
  })

  it('serializar+parsear repetidamente un config ya limpio permanece estable (fixed point inmediato)', () => {
    const clean = '{"moneda_presentacion_documentos":"BS"}'
    const first = serializeEmpresaConfig(clean, {})
    const second = serializeEmpresaConfig(first, {})

    expect(second).toBe(first)
  })
})

// `readConfigNamespace`/`serializeConfigNamespace` son el helper generico que reutiliza
// `use-agenda-config.ts` (namespace "agenda") para no duplicar la logica de saneamiento
// que ya usa `parseEmpresaConfig`/`serializeEmpresaConfig` para las claves tipadas de
// EmpresaConfig. Ambos pares DEBEN compartir el mismo `sanitizeConfigRecord` interno.
describe('readConfigNamespace — lee un namespace arbitrario ya saneado', () => {
  it('config ausente: retorna los defaults', () => {
    expect(readConfigNamespace(null, 'agenda', { mostrar_agenda: true })).toEqual({ mostrar_agenda: true })
  })

  it('config presente sin el namespace: retorna los defaults', () => {
    expect(
      readConfigNamespace('{"moneda_presentacion_documentos":"BS"}', 'agenda', { mostrar_agenda: true })
    ).toEqual({ mostrar_agenda: true })
  })

  it('config con el namespace presente: mergea sobre los defaults', () => {
    const configJson = JSON.stringify({ agenda: { mostrar_agenda: false, limite_futuro_dias: 7 } })
    expect(readConfigNamespace(configJson, 'agenda', { mostrar_agenda: true, limite_futuro_dias: 30 })).toEqual({
      mostrar_agenda: false,
      limite_futuro_dias: 7,
    })
  })

  it('config char-indexed corrupto (bug de spread caracter por caracter): recupera el namespace en vez de caer a defaults', () => {
    const originalCleanJson = JSON.stringify({ agenda: { mostrar_agenda: false, limite_futuro_dias: 7 } })
    const corrupt = buildCharIndexedCorruptString(originalCleanJson)

    expect(readConfigNamespace(corrupt, 'agenda', { mostrar_agenda: true, limite_futuro_dias: 30 })).toEqual({
      mostrar_agenda: false,
      limite_futuro_dias: 7,
    })
  })
})

describe('serializeConfigNamespace — escribe un namespace arbitrario sin perder otros namespaces ni EmpresaConfig', () => {
  it('mergea updates sobre el namespace existente y preserva otros namespaces/campos conocidos', () => {
    const configJson = JSON.stringify({
      agenda: { mostrar_agenda: false, limite_futuro_dias: 7 },
      moneda_presentacion_documentos: 'BS',
    })

    const serialized = serializeConfigNamespace(configJson, 'agenda', { duracion_slot_default: 45 })

    expect(JSON.parse(serialized)).toEqual({
      agenda: { mostrar_agenda: false, limite_futuro_dias: 7, duracion_slot_default: 45 },
      moneda_presentacion_documentos: 'BS',
    })
  })

  it('sobre config corrupto char-indexed: recupera el namespace y moneda existentes, sin claves numericas, y converge (no crece)', () => {
    const originalCleanJson = JSON.stringify({
      agenda: { mostrar_agenda: false, limite_futuro_dias: 7, tolerancia_noshow_min: 45 },
      moneda_presentacion_documentos: 'BS',
    })
    const corrupt = buildCharIndexedCorruptString(originalCleanJson)

    const serialized = serializeConfigNamespace(corrupt, 'agenda', { duracion_slot_default: 45 })
    const parsed = JSON.parse(serialized) as Record<string, unknown>

    expect(parsed).toEqual({
      agenda: {
        mostrar_agenda: false,
        limite_futuro_dias: 7,
        tolerancia_noshow_min: 45,
        duracion_slot_default: 45,
      },
      moneda_presentacion_documentos: 'BS',
    })
    expect(Object.keys(parsed).every((key) => Number.isNaN(Number(key)))).toBe(true)
    expect(serialized.length).toBeLessThan(corrupt.length)
  })

  it('repetir serializeConfigNamespace converge a un punto fijo (no crece nunca)', () => {
    const configJson = JSON.stringify({ agenda: { mostrar_agenda: true } })
    let current = configJson
    const lengths: number[] = []
    for (let i = 0; i < 5; i++) {
      current = serializeConfigNamespace(current, 'agenda', {})
      lengths.push(current.length)
    }
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1])
    }
  })
})
