import { Fragment, useRef, useEffect, useState } from 'react'
import { X, Upload, FileText, WarningCircle, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import Decimal from 'decimal.js'
import { kysely, db } from '@/core/db/kysely/kysely'
import { connector } from '@/core/db/powersync/connector'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'
import type { Impuesto } from '@/features/configuracion/hooks/use-impuestos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ejecutarStockInicialImport, resolverDepositoPrincipalActivo } from '@/features/inventario/lib/stock-deposito'
import { useUnidadesActivas, type Unidad } from '@/features/inventario/hooks/use-unidades'
import {
  clasificarAccionFila,
  debeIgnorarStockInicial,
  detectarColumnasPresentes,
  estimarPesoSync,
  extraerCamposAnteriores,
  extraerValoresNuevos,
  mergearProductoParaUpdate,
  parseTipoImpuesto,
  resolverDepositoFila,
  validarFormatoPreciosTocados,
  validarPreciosMergeados,
  type AccionFila,
  type ColumnasPresentes,
  type MergedPrecios,
  type ModoImportacion,
} from '@/features/inventario/lib/import-productos-logic'

interface ImportProductosModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  departamentos: Departamento[]
  /** Depositos ACTIVOS de la empresa (spec-pr3 R17, PR3b) — usados para resolver
   * la columna opcional `deposito` del archivo. `useDepositosActivos()` en
   * `producto-list.tsx`. Default `[]` para no romper llamadores existentes
   * (la columna simplemente no se resuelve sin esta prop). */
  depositos?: Deposito[]
  /** Tasas de impuesto de la empresa (Fase A commit 3) — usadas para resolver
   * `impuesto_iva_id` a partir de la celda `tipo_impuesto` ("Gravable 16").
   * `useImpuestosActivos()` en `producto-list.tsx`. Default `[]`. */
  impuestos?: Impuesto[]
}

/** SI/S/1/TRUE/VERDADERO -> 1; NO/N/0/FALSE/FALSO -> 0; vacio -> 0 (default). */
function normalizarManejaLotes(raw: string): { valor: number; invalido: boolean } {
  const v = raw.trim().toUpperCase()
  if (v === '') return { valor: 0, invalido: false }
  if (['SI', 'S', '1', 'TRUE', 'VERDADERO'].includes(v)) return { valor: 1, invalido: false }
  if (['NO', 'N', '0', 'FALSE', 'FALSO'].includes(v)) return { valor: 0, invalido: false }
  return { valor: 0, invalido: true }
}

interface ParsedRow {
  rowNum: number
  codigo: string
  tipo: string
  nombre: string
  departamento: string
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string
  /** Precio especial (Fase A commit 3) — solo se valida especial < costo, nunca vs venta (B1.1). */
  precio_especial_usd: string
  stock_minimo: string
  stock_inicial: string
  unidad: string
  tipo_impuesto: string
  /** Celda `deposito`, ya `.trim().toUpperCase()` (spec-pr3 R9, PR3b). */
  deposito: string
  /** Codigo de barras (Fase A commit 3) — texto libre, sin transformacion de mayusculas. */
  codigo_barras: string
  /** Presentacion fisica (Fase A commit 3) — solo aplica a tipo P. */
  presentacion: string
  /** Ubicacion fisica en deposito (Fase A commit 3) — solo aplica a tipo P. */
  ubicacion: string
  /** Celda cruda `maneja_lotes` (Fase A commit 3) — ver `maneja_lotes_parsed` para el valor resuelto. */
  maneja_lotes: string
  /** Valor normalizado 0/1 de `maneja_lotes`, solo valido cuando `!manejaLotesInvalido`. */
  maneja_lotes_parsed: number
  /** `true` cuando la celda `maneja_lotes` no es un valor SI/NO reconocido. */
  manejaLotesInvalido: boolean
  /** Celda cruda `tipo_impuesto` antes de `parseTipoImpuesto` (Fase A commit 3), para mostrar en el preview. */
  tipo_impuesto_raw: string
  /** Porcentaje de IVA parseado de la celda (ej: "Gravable 16" -> 16), null si no aplica o no vino. */
  tipo_impuesto_porcentaje: number | null
  /** `true` cuando `tipo_impuesto` no coincide con ningun formato reconocido por `parseTipoImpuesto`. */
  tipoImpuestoInvalido: boolean
  /** FK resuelta contra `impuestos` (tipo_tributo=IVA, activo) por porcentaje — null = sin resolver. */
  impuesto_iva_id: string | null
  /** Clasificacion base segun modo activo (spec-pr3 R2). `errors.length>0` tiene prioridad visual (R16). */
  accion: AccionFila
  /** Precios fusionados contra el producto existente — solo presente para filas `ACTUALIZAR` (spec-pr3 R7). */
  merged?: MergedPrecios
  /**
   * Deposito RESUELTO para esta fila (spec-pr3 R10/R11, PR3b): en `CREAR`
   * siempre que haya deposito principal o columna valida (usado para el
   * maestro `productos.deposito_id` Y para el batch de `stock_inicial`); en
   * `ACTUALIZAR` SOLO si la celda vino tocada con un nombre valido (cambia el
   * deposito default, nunca mueve stock). `undefined` = no tocar.
   */
  depositoId?: string
  /** Advertencia NO bloqueante (spec-pr3 R12): fila `ACTUALIZAR` con `stock_inicial>0` — la celda se ignora, nunca genera kardex. */
  stockInicialIgnorado: boolean
  errors: string[]
  isValid: boolean
}

const MODO_LABELS: Record<ModoImportacion, string> = {
  crear: 'Solo agregar',
  actualizar: 'Solo actualizar',
  upsert: 'Agregar y actualizar',
}

const MODO_DESCRIPCIONES: Record<ModoImportacion, string> = {
  crear: 'Crea productos nuevos. Las filas cuyo codigo ya existe se omiten (no se modifican).',
  actualizar: 'Actualiza productos existentes. Las filas con codigo nuevo se omiten. Deja una columna vacia o quitala del archivo para no tocar ese campo.',
  upsert: 'Crea los productos nuevos y actualiza los existentes en la misma importacion.',
}

interface ParsedComponente {
  rowNum: number
  combo_codigo: string
  componente_codigo: string
  cantidad: string
  errors: string[]
  isValid: boolean
}

type Step = 'instrucciones' | 'preview' | 'procesando'

/**
 * Construye el `XLSX.WorkBook` de la plantilla de importacion (hojas
 * "Inventario" + "Componentes Combos"), sin ningun texto informativo
 * inyectado en las celdas de datos — extraida como funcion pura y testeable
 * (spec-pr1 R8). Antes de este cambio, `handleDescargarPlantilla` escribia
 * una nota "Unidades activas: ..." en la celda A6 via `sheet_add_aoa`, que
 * se convertia en una fila fantasma con `codigo` invalido si el usuario
 * reimportaba la plantilla sin llenarla (bug documentado en
 * `exploration.md`). El texto de unidades activas vive ahora en el bloque
 * de instrucciones del modal (`step === 'instrucciones'`).
 */
export function buildPlantillaWorkbook(
  departamentos: Departamento[],
  unidades: Unidad[],
  depositos: Deposito[] = []
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const deptoNombre = departamentos[0]?.nombre ?? 'DEPARTAMENTO EJEMPLO'
  const depositoNombre = depositos[0]?.nombre ?? ''

  // Hoja 1: Inventario (misma estructura que la exportacion + stock_inicial, solo-import)
  const headers = [[
    'codigo', 'tipo', 'nombre', 'departamento', 'costo_usd', 'precio_venta_usd',
    'precio_mayor_usd', 'precio_especial_usd', 'stock_minimo', 'stock_inicial',
    'unidad', 'tipo_impuesto', 'codigo_barras', 'presentacion', 'ubicacion',
    'maneja_lotes', 'deposito',
  ]]
  const ejemplos = [
    ['PROD-001', 'P', 'PRODUCTO FISICO EJEMPLO', deptoNombre, '10.00', '15.00', '13.00', '', '5', '100', unidades[0]?.abreviatura ?? 'UND', 'Exento', '7591234567890', 'CAJA x 12', 'A-01-1', 'NO', depositoNombre],
    ['SERV-001', 'S', 'SERVICIO EJEMPLO', deptoNombre, '5.00', '20.00', '', '', '0', '', '', 'Exento', '', '', '', '', ''],
    ['COMBO-001', 'C', 'COMBO EJEMPLO', deptoNombre, '0.00', '35.00', '', '', '0', '', '', 'Exento', '', '', '', '', ''],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet([...headers, ...ejemplos])
  ws1['!cols'] = [
    { wch: 14 }, // codigo
    { wch: 6 },  // tipo
    { wch: 28 }, // nombre
    { wch: 14 }, // departamento
    { wch: 10 }, // costo_usd
    { wch: 14 }, // precio_venta_usd
    { wch: 14 }, // precio_mayor_usd
    { wch: 14 }, // precio_especial_usd
    { wch: 12 }, // stock_minimo
    { wch: 13 }, // stock_inicial
    { wch: 10 }, // unidad
    { wch: 12 }, // tipo_impuesto
    { wch: 16 }, // codigo_barras
    { wch: 18 }, // presentacion
    { wch: 14 }, // ubicacion
    { wch: 12 }, // maneja_lotes
    { wch: 16 }, // deposito
  ]
  XLSX.utils.book_append_sheet(wb, ws1, 'Inventario')

  // Hoja 2: Componentes Combos (misma estructura que la exportacion)
  const headers2 = [['combo_codigo', 'combo_nombre', 'componente_codigo', 'componente_nombre', 'cantidad']]
  const ejemplos2 = [
    ['COMBO-001', 'COMBO EJEMPLO', 'PROD-001', 'PRODUCTO FISICO EJEMPLO', '2'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet([...headers2, ...ejemplos2])
  ws2['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Componentes Combos')

  return wb
}

export function ImportProductosModal({
  isOpen,
  onClose,
  productos,
  departamentos,
  depositos = [],
  impuestos = [],
}: ImportProductosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useCurrentUser()
  const { unidades } = useUnidadesActivas()

  const [step, setStep] = useState<Step>('instrucciones')
  const [modo, setModo] = useState<ModoImportacion>('crear')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [componentes, setComponentes] = useState<ParsedComponente[]>([])
  const [fileName, setFileName] = useState('')
  const [columnasPresentes, setColumnasPresentes] = useState<ColumnasPresentes>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [progreso, setProgreso] = useState<{ fase: string; pct: number }>({ fase: '', pct: 0 })

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setStep('instrucciones')
      setModo('crear')
      setRows([])
      setComponentes([])
      setFileName('')
      setColumnasPresentes(new Set())
      setExpandedRows(new Set())
      setProgreso({ fase: '', pct: 0 })
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function toggleExpandRow(rowNum: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowNum)) next.delete(rowNum)
      else next.add(rowNum)
      return next
    })
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  /** Fila `CREAR`: se valida igual que antes de PR3 (el producto no existe, sin fusion). */
  function validateRowCrear(row: ParsedRow): string[] {
    const errors: string[] = []

    if (!row.codigo) {
      errors.push('codigo vacio')
    } else if (!/^[A-Z0-9-]+$/.test(row.codigo)) {
      errors.push('codigo invalido (solo mayusculas, numeros y guiones)')
    }

    if (!['P', 'S', 'C'].includes(row.tipo)) {
      errors.push('tipo debe ser P, S o C')
    }

    if (!row.nombre || row.nombre.length < 3) {
      errors.push('nombre minimo 3 caracteres')
    }

    if (!row.departamento) {
      errors.push('departamento vacio')
    } else {
      const dep = departamentos.find((d) => d.nombre === row.departamento)
      if (!dep) errors.push('departamento no encontrado')
      else if (dep.is_active !== 1) errors.push('departamento inactivo')
    }

    const costo = parseFloat(row.costo_usd)
    if (isNaN(costo) || costo < 0) {
      errors.push('costo_usd invalido')
    }

    const venta = parseFloat(row.precio_venta_usd)
    if (isNaN(venta) || venta < 0) {
      errors.push('precio_venta_usd invalido')
    } else if (!isNaN(costo) && venta < costo) {
      errors.push('precio_venta_usd < costo_usd')
    }

    if (row.precio_mayor_usd.trim() !== '') {
      const mayor = parseFloat(row.precio_mayor_usd)
      if (isNaN(mayor) || mayor < 0) {
        errors.push('precio_mayor_usd invalido')
      }
      // B1.1: ya no se valida mayor > venta — nunca sabemos que tiene en
      // mente el usuario para su precio mayorista.
    }

    // B1.2: tipo S ignora precio_especial_usd silenciosamente (decision
    // explicita de la sesion de diseño de Fase A commit 3).
    if (row.precio_especial_usd.trim() !== '' && row.tipo !== 'S') {
      const especial = parseFloat(row.precio_especial_usd)
      if (isNaN(especial) || especial < 0) {
        errors.push('precio_especial_usd invalido')
      } else if (!isNaN(costo) && especial < costo) {
        errors.push('precio_especial_usd < costo_usd')
      }
      // B1.1: nunca se valida especial vs venta.
    }

    if (row.tipo === 'P') {
      const stockMin = parseFloat(row.stock_minimo)
      if (isNaN(stockMin) || stockMin < 0) {
        errors.push('stock_minimo invalido')
      }
      if (row.stock_inicial.trim() !== '') {
        const stockIni = parseFloat(row.stock_inicial)
        if (isNaN(stockIni) || stockIni < 0) {
          errors.push('stock_inicial invalido (debe ser numero >= 0)')
        }
      }
    }
    // B1.2: tipo S/C ignora stock_inicial silenciosamente (no se usa en el
    // INSERT, ver `productosConStockInicial` en handleImportar) — no es un
    // error del usuario, es un campo que no aplica a ese tipo.

    if (row.unidad.trim() !== '') {
      if (row.tipo !== 'P') {
        errors.push('unidad solo aplica a productos tipo P')
      } else if (!unidades.some((u) => u.abreviatura === row.unidad)) {
        errors.push(`unidad "${row.unidad}" no existe o no esta activa`)
      }
    }

    // Fase A commit 3: tipo_impuesto ahora admite "Gravable <porcentaje>".
    if (row.tipoImpuestoInvalido) {
      errors.push('tipo_impuesto debe ser Gravable, Exento o Exonerado (ej: "Gravable 16")')
    } else if (row.tipo_impuesto === 'Gravable' && !row.impuesto_iva_id) {
      errors.push("tipo_impuesto Gravable requiere porcentaje válido (ej: 'Gravable 16') — no existe tasa IVA activa con ese porcentaje")
    }

    // maneja_lotes solo aplica a tipo P — S/C lo ignoran silenciosamente (B1.2).
    if (row.tipo === 'P' && row.manejaLotesInvalido) {
      errors.push('maneja_lotes debe ser SI o NO')
    }

    // ubicacion y presentacion: sin validacion propia (solo tipo P las usa,
    // se ignoran silenciosamente para S/C al construir el INSERT).

    return errors
  }

  /**
   * Fila `ACTUALIZAR`: valida solo los campos updatable (spec-pr3 R6) que
   * llegaron tocados (columna presente + celda no vacia) contra el producto
   * EXISTENTE completo — nunca contra valores vacios. `codigo` es solo
   * lookup (regla #5, inmutable) y nunca se re-valida aqui. Los precios se
   * fusionan primero (`mergearProductoParaUpdate`) y se validan sobre el
   * estado YA FUSIONADO (`validarPreciosMergeados`, R7/R8 LOCKED).
   */
  function validateRowActualizar(
    row: ParsedRow,
    existente: Producto,
    columnasPresentes: ColumnasPresentes
  ): { errors: string[]; merged: MergedPrecios } {
    const errors: string[] = []

    if (columnasPresentes.has('nombre') && row.nombre.trim() !== '' && row.nombre.length < 3) {
      errors.push('nombre minimo 3 caracteres')
    }

    if (columnasPresentes.has('departamento') && row.departamento.trim() !== '') {
      const dep = departamentos.find((d) => d.nombre === row.departamento)
      if (!dep) errors.push('departamento no encontrado')
      else if (dep.is_active !== 1) errors.push('departamento inactivo')
    }

    // Formato numerico de las celdas tocadas ANTES de fusionar — sin este guard,
    // un NaN (celda no numerica) haria que las comparaciones de validarPreciosMergeados
    // sean siempre `false` y la fila pasaria invalidamente (simetria con validateRowCrear).
    // Extraido a funcion pura y testeada: import-productos-logic.ts.
    errors.push(...validarFormatoPreciosTocados(
      {
        costo_usd: row.costo_usd,
        precio_venta_usd: row.precio_venta_usd,
        precio_mayor_usd: row.precio_mayor_usd,
        precio_especial_usd: row.precio_especial_usd,
      },
      columnasPresentes
    ))

    const merged = mergearProductoParaUpdate(
      {
        costo_usd: row.costo_usd,
        precio_venta_usd: row.precio_venta_usd,
        precio_mayor_usd: row.precio_mayor_usd,
        precio_especial_usd: row.precio_especial_usd,
      },
      columnasPresentes,
      {
        costo_usd: existente.costo_usd,
        precio_venta_usd: existente.precio_venta_usd,
        precio_mayor_usd: existente.precio_mayor_usd,
        precio_especial_usd: existente.precio_especial_usd,
      }
    )
    errors.push(...validarPreciosMergeados(merged, columnasPresentes))

    if (columnasPresentes.has('stock_minimo') && row.stock_minimo.trim() !== '' && existente.tipo === 'P') {
      const stockMin = parseFloat(row.stock_minimo)
      if (isNaN(stockMin) || stockMin < 0) errors.push('stock_minimo invalido')
    }

    // B1.2: producto existente tipo S/C ignora la columna unidad
    // silenciosamente (no aplica, no es error del usuario).
    if (columnasPresentes.has('unidad') && row.unidad.trim() !== '' && existente.tipo === 'P') {
      if (!unidades.some((u) => u.abreviatura === row.unidad)) {
        errors.push(`unidad "${row.unidad}" no existe o no esta activa`)
      }
    }

    if (columnasPresentes.has('tipo_impuesto') && row.tipo_impuesto_raw.trim() !== '') {
      if (row.tipoImpuestoInvalido) {
        errors.push('tipo_impuesto debe ser Gravable, Exento o Exonerado (ej: "Gravable 16")')
      } else if (row.tipo_impuesto === 'Gravable' && !row.impuesto_iva_id) {
        errors.push("tipo_impuesto Gravable requiere porcentaje válido (ej: 'Gravable 16') — no existe tasa IVA activa con ese porcentaje")
      }
    }

    // maneja_lotes: solo aplica a tipo P — S/C lo ignoran silenciosamente (B1.2).
    if (columnasPresentes.has('maneja_lotes') && row.maneja_lotes.trim() !== '' && existente.tipo === 'P') {
      if (row.manejaLotesInvalido) errors.push('maneja_lotes debe ser SI o NO')
    }

    return { errors, merged }
  }

  /**
   * Dispatcher segun accion (spec-pr3 R4): `OMITIR` no pasa por ninguna
   * validacion de campos (solo cuenta en el resumen del preview).
   */
  function validateRow(
    row: ParsedRow,
    accion: AccionFila,
    existente: Producto | undefined,
    columnasPresentes: ColumnasPresentes
  ): { errors: string[]; merged?: MergedPrecios } {
    if (accion === 'OMITIR') return { errors: [] }
    if (accion === 'CREAR') return { errors: validateRowCrear(row) }
    return validateRowActualizar(row, existente!, columnasPresentes)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      // Hoja 1: Inventario (P, S, C)
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []
      const columnasPresentes = detectarColumnasPresentes(headerRow)
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      if (rawRows.length === 0) {
        toast.error('El archivo esta vacio')
        return
      }

      const productoPorCodigo = new Map(productos.map((p) => [p.codigo, p]))

      // Deposito principal resuelto UNA sola vez para todo el archivo (spec-pr3
      // R10/R15, PR3b) — nunca por fila. Usado como fallback SOLO para filas
      // CREAR cuya celda `deposito` vino vacia/ausente.
      const principalId = user?.empresa_id
        ? await resolverDepositoPrincipalActivo(user.empresa_id)
        : null

      const parsed: ParsedRow[] = rawRows.map((r, i) => {
        const tipoImpuestoRawCell = String(r.tipo_impuesto ?? '').trim()
        const parsedImpuesto = parseTipoImpuesto(tipoImpuestoRawCell === '' ? 'Exento' : tipoImpuestoRawCell)

        // Fase A commit 3: resuelve impuesto_iva_id contra las tasas IVA
        // activas de la empresa por porcentaje (tolerancia ±0.01 para floats).
        // Si la celda no trae porcentaje ("Gravable" a secas) y existe
        // exactamente una tasa IVA activa, se usa esa como default.
        let impuestoIvaId: string | null = null
        if (parsedImpuesto.tipo === 'Gravable' && !parsedImpuesto.invalid) {
          const ivasActivas = impuestos.filter((imp) => imp.tipo_tributo === 'IVA' && imp.is_active === 1)
          if (parsedImpuesto.porcentaje !== null) {
            const match = ivasActivas.find((imp) => Math.abs(parseFloat(imp.porcentaje) - parsedImpuesto.porcentaje!) <= 0.01)
            impuestoIvaId = match?.id ?? null
          } else if (ivasActivas.length === 1) {
            impuestoIvaId = ivasActivas[0]!.id
          }
        }

        const manejaLotesRawCell = String(r.maneja_lotes ?? '').trim()
        const manejaLotesNorm = normalizarManejaLotes(manejaLotesRawCell)

        const row: ParsedRow = {
          rowNum: i + 2,
          codigo: String(r.codigo ?? '').trim().toUpperCase(),
          tipo: String(r.tipo ?? '').trim().toUpperCase(),
          nombre: String(r.nombre ?? '').trim().toUpperCase(),
          departamento: String(r.departamento ?? '').trim().toUpperCase(),
          costo_usd: String(r.costo_usd ?? '').trim(),
          precio_venta_usd: String(r.precio_venta_usd ?? '').trim(),
          precio_mayor_usd: String(r.precio_mayor_usd ?? '').trim(),
          precio_especial_usd: String(r.precio_especial_usd ?? '').trim(),
          stock_minimo: String(r.stock_minimo ?? '').trim(),
          stock_inicial: String(r.stock_inicial ?? '').trim(),
          unidad: String(r.unidad ?? '').trim().toUpperCase(),
          tipo_impuesto: parsedImpuesto.tipo,
          deposito: String(r.deposito ?? '').trim().toUpperCase(),
          codigo_barras: String(r.codigo_barras ?? '').trim(),
          presentacion: String(r.presentacion ?? '').trim(),
          ubicacion: String(r.ubicacion ?? '').trim(),
          maneja_lotes: manejaLotesRawCell,
          maneja_lotes_parsed: manejaLotesNorm.valor,
          manejaLotesInvalido: manejaLotesNorm.invalido,
          tipo_impuesto_raw: tipoImpuestoRawCell,
          tipo_impuesto_porcentaje: parsedImpuesto.porcentaje,
          tipoImpuestoInvalido: parsedImpuesto.invalid ?? false,
          impuesto_iva_id: impuestoIvaId,
          accion: 'CREAR',
          merged: undefined,
          depositoId: undefined,
          stockInicialIgnorado: false,
          errors: [],
          isValid: false,
        }
        const existente = productoPorCodigo.get(row.codigo)
        row.accion = clasificarAccionFila(!!existente, modo)
        const resultado = validateRow(row, row.accion, existente, columnasPresentes)
        row.errors = resultado.errors
        row.merged = resultado.merged

        if (row.accion !== 'OMITIR') {
          const depResult = resolverDepositoFila(row.deposito, row.accion, columnasPresentes, depositos, principalId)
          if (depResult.error) row.errors.push(depResult.error)
          else row.depositoId = depResult.deposito_id

          if (row.accion === 'ACTUALIZAR') {
            row.stockInicialIgnorado = debeIgnorarStockInicial(row.accion, row.stock_inicial)
          }
        }

        row.isValid = row.errors.length === 0
        return row
      })

      // Detectar duplicados dentro del mismo archivo
      const codigos = new Map<string, number[]>()
      parsed.forEach((r, i) => {
        if (r.codigo) {
          const arr = codigos.get(r.codigo) ?? []
          arr.push(i)
          codigos.set(r.codigo, arr)
        }
      })
      for (const [, indices] of codigos) {
        if (indices.length > 1) {
          for (const i of indices) {
            parsed[i].errors.push('codigo duplicado en archivo')
            parsed[i].isValid = false
          }
        }
      }

      // Hoja 2: Componentes Combos (opcional)
      const parsedComponentes: ParsedComponente[] = []
      if (workbook.SheetNames.length > 1) {
        const sheet2Name = workbook.SheetNames[1]
        const sheet2 = workbook.Sheets[sheet2Name]
        const rawComp = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet2, { defval: '' })

        rawComp.forEach((r, i) => {
          const comboCod = String(r.combo_codigo ?? '').trim().toUpperCase()
          const compCod = String(r.componente_codigo ?? '').trim().toUpperCase()
          const cantStr = String(r.cantidad ?? '').trim()
          const cant = parseFloat(cantStr)

          const errors: string[] = []
          if (!comboCod) errors.push('combo_codigo vacio')
          if (!compCod) errors.push('componente_codigo vacio')
          if (isNaN(cant) || cant <= 0) errors.push('cantidad invalida')

          parsedComponentes.push({
            rowNum: i + 2,
            combo_codigo: comboCod,
            componente_codigo: compCod,
            cantidad: cantStr,
            errors,
            isValid: errors.length === 0,
          })
        })
      }

      setRows(parsed)
      setComponentes(parsedComponentes)
      setColumnasPresentes(columnasPresentes)
      setExpandedRows(new Set())
      setStep('preview')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error leyendo archivo'
      toast.error(`Error al leer archivo: ${msg}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleImportar() {
    if (!user?.empresa_id) {
      toast.error('No se pudo identificar la empresa')
      return
    }
    const filasCrear = rows.filter((r) => r.accion === 'CREAR' && r.errors.length === 0)
    const filasActualizar = rows.filter((r) => r.accion === 'ACTUALIZAR' && r.errors.length === 0)
    if (filasCrear.length === 0 && filasActualizar.length === 0) {
      toast.error('No hay filas validas para importar')
      return
    }

    setStep('procesando')
    const now = localNow()
    const productoPorCodigo = new Map(productos.map((p) => [p.codigo, p]))

    // Pre-calcular todos los datos antes de abrir transacciones
    const productoInserts = filasCrear.map((row) => {
      const isServicioOCombo = row.tipo === 'S' || row.tipo === 'C'
      const dep = departamentos.find((d) => d.nombre === row.departamento)!
      const costo = parseFloat(row.costo_usd)
      const venta = parseFloat(row.precio_venta_usd)
      const mayor = row.precio_mayor_usd.trim() !== '' ? parseFloat(row.precio_mayor_usd) : null
      // B1.2: tipo S ignora precio_especial_usd (ver validateRowCrear) — si
      // igualmente vino en el archivo para un S, no se persiste (misma
      // logica de "no aplica" que el resto de campos ignorados por tipo).
      const especial = row.tipo !== 'S' && row.precio_especial_usd.trim() !== ''
        ? parseFloat(row.precio_especial_usd)
        : null
      return {
        id: uuidv4(),
        codigo: row.codigo,
        tipo: row.tipo,
        nombre: row.nombre,
        departamento_id: dep.id,
        costo_usd: row.tipo === 'C' ? '0.00000000' : new Decimal(costo).toFixed(8),
        precio_venta_usd: new Decimal(venta).toFixed(8),
        precio_mayor_usd: mayor !== null ? new Decimal(mayor).toFixed(8) : null,
        precio_especial_usd: especial !== null ? new Decimal(especial).toFixed(8) : null,
        stock: '0.000',
        stock_minimo: isServicioOCombo ? '0.000' : parseFloat(row.stock_minimo).toFixed(3),
        costo_promedio: '0.00',
        costo_ultimo: row.tipo === 'C' ? '0.00000000' : new Decimal(costo).toFixed(8),
        tipo_impuesto: row.tipo_impuesto,
        impuesto_iva_id: row.impuesto_iva_id ?? null,
        maneja_lotes: row.tipo === 'P' ? row.maneja_lotes_parsed : 0,
        is_active: 1,
        empresa_id: user.empresa_id,
        created_at: now,
        updated_at: now,
        ubicacion: row.tipo === 'P' && row.ubicacion.trim() !== '' ? row.ubicacion : null,
        unidad_base_id: (row.tipo === 'P' && row.unidad.trim() !== '')
          ? (unidades.find((u) => u.abreviatura === row.unidad)?.id ?? null)
          : null,
        presentacion: !isServicioOCombo && row.presentacion.trim() !== '' ? row.presentacion : null,
        codigo_barras: row.codigo_barras.trim() !== '' ? row.codigo_barras : null,
        deposito_id: row.depositoId ?? null,
      }
    })

    // Update parcial: solo los campos tocados por el archivo (columna presente + celda no vacia).
    // `codigo` NUNCA aparece aqui (regla #5, inmutable — solo se uso como lookup).
    const productoUpdates = filasActualizar.map((row) => {
      const existente = productoPorCodigo.get(row.codigo)!
      const merged = row.merged!
      const fields: Record<string, string | number | null> = { updated_at: now }

      if (row.nombre.trim() !== '') fields.nombre = row.nombre
      if (row.departamento.trim() !== '') {
        const dep = departamentos.find((d) => d.nombre === row.departamento)
        if (dep) fields.departamento_id = dep.id
      }
      if (row.costo_usd.trim() !== '') fields.costo_usd = new Decimal(merged.costo).toFixed(8)
      if (row.precio_venta_usd.trim() !== '') fields.precio_venta_usd = new Decimal(merged.venta).toFixed(8)
      if (row.precio_mayor_usd.trim() !== '') {
        fields.precio_mayor_usd = merged.mayor !== null ? new Decimal(merged.mayor).toFixed(8) : null
      }
      if (row.precio_especial_usd.trim() !== '') {
        fields.precio_especial_usd = merged.especial != null ? new Decimal(merged.especial).toFixed(8) : null
      }
      if (row.stock_minimo.trim() !== '' && existente.tipo === 'P') {
        fields.stock_minimo = parseFloat(row.stock_minimo).toFixed(3)
      }
      if (row.tipo_impuesto_raw.trim() !== '') {
        fields.tipo_impuesto = row.tipo_impuesto
        fields.impuesto_iva_id = row.tipo_impuesto === 'Gravable' ? (row.impuesto_iva_id ?? null) : null
      }
      if (row.unidad.trim() !== '' && existente.tipo === 'P') {
        const und = unidades.find((u) => u.abreviatura === row.unidad)
        if (und) fields.unidad_base_id = und.id
      }
      if (row.codigo_barras.trim() !== '') fields.codigo_barras = row.codigo_barras
      if (row.presentacion.trim() !== '' && existente.tipo === 'P') fields.presentacion = row.presentacion
      if (row.ubicacion.trim() !== '' && existente.tipo === 'P') fields.ubicacion = row.ubicacion
      if (row.maneja_lotes.trim() !== '' && existente.tipo === 'P' && !row.manejaLotesInvalido) {
        fields.maneja_lotes = row.maneja_lotes_parsed
      }
      // Deposito (spec-pr3 R11): SOLO se agrega al UPDATE si la celda vino
      // tocada con un nombre valido (row.depositoId resuelto) — celda
      // vacia/ausente NUNCA toca producto.deposito_id existente.
      if (row.depositoId) fields.deposito_id = row.depositoId

      return { id: existente.id, fields }
    })

    // Mapa codigo → id para componentes de combos
    const codigoToId = new Map<string, string>()
    for (const p of productoInserts) codigoToId.set(p.codigo, p.id)

    // Paso 1: UN solo writeTransaction con INSERT (CREAR) y UPDATE (ACTUALIZAR) mezclados —
    // todo-o-nada (spec-pr3 R14): si cualquier sentencia lanza, ninguna de la fase persiste.
    // Se mantiene en PowerSync (NO bypass a Supabase directo) porque Paso 2 (stock
    // inicial via kardex) y Paso 3 (combos) leen `productos` desde SQLite local — si
    // los productos se insertaran directo a Supabase, no existirian localmente hasta
    // que PowerSync los sincronice de vuelta, y el kardex/combos fallarian al no
    // encontrarlos. Solo el log de auditoria (Paso 4) hace bypass a Supabase.
    setProgreso({ fase: 'Guardando productos...', pct: 10 })
    try {
      await db.writeTransaction(async (tx) => {
        for (const p of productoInserts) {
          await tx.execute(
            `INSERT INTO productos (id, codigo, tipo, nombre, departamento_id, costo_usd, precio_venta_usd, precio_mayor_usd, precio_especial_usd, stock, stock_minimo, costo_promedio, costo_ultimo, tipo_impuesto, impuesto_iva_id, maneja_lotes, is_active, empresa_id, created_at, updated_at, ubicacion, unidad_base_id, presentacion, codigo_barras, deposito_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [p.id, p.codigo, p.tipo, p.nombre, p.departamento_id, p.costo_usd, p.precio_venta_usd, p.precio_mayor_usd, p.precio_especial_usd, p.stock, p.stock_minimo, p.costo_promedio, p.costo_ultimo, p.tipo_impuesto, p.impuesto_iva_id, p.maneja_lotes, p.is_active, p.empresa_id, p.created_at, p.updated_at, p.ubicacion, p.unidad_base_id, p.presentacion, p.codigo_barras, p.deposito_id]
          )
        }
        for (const u of productoUpdates) {
          const cols = Object.keys(u.fields)
          const setClause = cols.map((c) => `${c} = ?`).join(', ')
          await tx.execute(
            `UPDATE productos SET ${setClause} WHERE id = ?`,
            [...cols.map((c) => u.fields[c]), u.id]
          )
        }
      })
      const totalEscritos = productoInserts.length + productoUpdates.length
      toast.success(
        `${totalEscritos} producto(s) importado(s) correctamente` +
        (productoUpdates.length > 0 ? ` (${productoInserts.length} nuevo(s), ${productoUpdates.length} actualizado(s))` : '')
      )
    } catch {
      toast.error('Error al importar productos')
      onClose()
      return
    }
    setProgreso({ fase: 'Registrando stock inicial...', pct: 60 })

    // Paso 2: inventario inicial via kardex para productos tipo P con stock_inicial > 0
    // (solo filas CREAR — ACTUALIZAR nunca alimenta este batch, R11/R12)
    const productosConStockInicial = productoInserts
      .map((p, i) => ({ p, row: filasCrear[i] }))
      .filter(({ row }) => row.tipo === 'P' && parseFloat(row.stock_inicial) > 0)

    if (productosConStockInicial.length > 0) {
      const totalEntradas = productosConStockInicial.length
      try {
        const { exitosos, sinDeposito } = await ejecutarStockInicialImport({
          entradas: productosConStockInicial.map(({ p, row }) => ({
            producto_id: p.id,
            cantidad: parseFloat(row.stock_inicial),
            deposito_id: row.depositoId,
          })),
          empresa_id: user.empresa_id,
          usuario_id: user.id,
        })
        if (exitosos > 0) toast.success(`${exitosos} entrada(s) de inventario inicial registradas en Kardex`)
        if (sinDeposito) toast.error(`${totalEntradas} entrada(s) de inventario inicial fallaron (sin deposito?)`)
      } catch {
        toast.error(`${totalEntradas} entrada(s) de inventario inicial fallaron`)
      }
    }

    setProgreso({ fase: 'Importando combos...', pct: 80 })

    // Paso 3: componentes de combos (hoja 2), tambien en una sola transaccion
    const validComponentes = componentes.filter((c) => c.isValid)
    if (validComponentes.length > 0) {
      const allProductos = await kysely
        .selectFrom('productos')
        .select(['id', 'codigo'])
        .where('empresa_id', '=', user.empresa_id)
        .execute()

      const productoByCode = new Map<string, string>()
      for (const p of allProductos) productoByCode.set(p.codigo, p.id)

      const componenteInserts = validComponentes.flatMap((comp) => {
        const comboId = codigoToId.get(comp.combo_codigo) ?? productoByCode.get(comp.combo_codigo)
        const componenteId = productoByCode.get(comp.componente_codigo)
        if (!comboId || !componenteId) return []
        return [{
          id: uuidv4(),
          servicio_id: comboId,
          producto_id: componenteId,
          cantidad: parseFloat(comp.cantidad).toFixed(3),
          empresa_id: user.empresa_id,
          created_at: now,
        }]
      })

      const compFallidos = validComponentes.length - componenteInserts.length
      if (componenteInserts.length > 0) {
        try {
          await db.writeTransaction(async (tx) => {
            for (const c of componenteInserts) {
              await tx.execute(
                `INSERT INTO recetas (id, servicio_id, producto_id, cantidad, empresa_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [c.id, c.servicio_id, c.producto_id, c.cantidad, c.empresa_id, c.created_at]
              )
            }
          })
          toast.success(`${componenteInserts.length} componente(s) de combos importados`)
        } catch {
          toast.error('Error al importar componentes de combos')
        }
      }
      if (compFallidos > 0) toast.error(`${compFallidos} componente(s) no pudieron importarse`)
    }

    setProgreso({ fase: 'Registrando auditoría...', pct: 90 })

    // Paso 4: log de auditoria — escritura DIRECTA a Supabase (bypass
    // PowerSync, ver IMMUTABLE_TABLES en connector.ts). Se escribe SIEMPRE al
    // final, incluyendo filas OMITIR y ERROR, para dar visibilidad completa
    // de lo que ocurrio en el import. Los campos JSONB (valores_anteriores,
    // valores_nuevos, errores) se pasan como objetos/arrays crudos — supabase-js
    // serializa JSONB automaticamente, NO se debe JSON.stringify aqui.
    try {
      const logId = uuidv4()
      const productoPorCodigoLog = new Map(productos.map((p) => [p.codigo, p]))

      const { error: cabeceraError } = await connector.client.from('import_log').insert({
        id: logId,
        empresa_id: user.empresa_id,
        usuario_id: user.id,
        fecha: now,
        modo,
        archivo_nombre: fileName || null,
        total_filas: rows.length,
        filas_creadas: filasCrear.length,
        filas_actualizadas: filasActualizar.length,
        filas_omitidas: rows.filter((r) => r.accion === 'OMITIR').length,
        filas_error: rows.filter((r) => r.errors.length > 0).length,
        created_at: now,
      })
      if (cabeceraError) throw cabeceraError

      const detalles = rows.map((row) => {
        const accionLog = row.errors.length > 0 ? 'ERROR' : row.accion
        const productoExistente = productoPorCodigoLog.get(row.codigo)

        const valoresAnteriores = accionLog === 'ACTUALIZAR' && productoExistente
          ? extraerCamposAnteriores(productoExistente as unknown as Record<string, unknown>, columnasPresentes)
          : null

        const valoresNuevos = accionLog === 'CREAR' || accionLog === 'ACTUALIZAR'
          ? extraerValoresNuevos(row, columnasPresentes)
          : null

        const erroresLog = row.errors.length > 0 ? row.errors : null

        return {
          id: uuidv4(),
          import_log_id: logId,
          empresa_id: user.empresa_id,
          fila_num: row.rowNum,
          codigo: row.codigo || null,
          nombre: row.nombre || null,
          tipo: row.tipo || null,
          accion: accionLog,
          valores_anteriores: valoresAnteriores,
          valores_nuevos: valoresNuevos,
          errores: erroresLog,
          created_at: now,
        }
      })

      const { error: detalleError } = await connector.client.from('import_log_det').insert(detalles)
      if (detalleError) throw detalleError
      setProgreso({ fase: 'Completado', pct: 100 })
    } catch (err) {
      // El log es auditoria — un fallo aqui NO debe impedir cerrar el modal ni
      // mostrar error al usuario (el import ya se completo exitosamente).
      console.warn('import_log: fallo al registrar auditoria', err)
    }

    onClose()
  }

  function handleDescargarPlantilla() {
    const wb = buildPlantillaWorkbook(departamentos, unidades, depositos)
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla_inventario.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const countCrear = rows.filter((r) => r.accion === 'CREAR' && r.errors.length === 0).length
  const countActualizar = rows.filter((r) => r.accion === 'ACTUALIZAR' && r.errors.length === 0).length
  const countOmitir = rows.filter((r) => r.accion === 'OMITIR' && r.errors.length === 0).length
  const countError = rows.filter((r) => r.errors.length > 0).length
  const totalEscribible = countCrear + countActualizar
  const validCompCount = componentes.filter((c) => c.isValid).length
  const depositoNombrePorId = new Map(depositos.map((d) => [d.id, d.nombre]))

  // Estimado de peso de sync (Fase A commit 3) — solo informativo, nunca
  // bloqueante. Las filas con error se tratan como OMITIR (no se van a
  // escribir, no suman al estimado) — mismo criterio visual que `accionMostrada`.
  const pesoSyncBytes = estimarPesoSync(
    rows.map((r) => ({
      accion: r.errors.length > 0 ? 'OMITIR' : r.accion,
      valores: {
        codigo: r.codigo,
        tipo: r.tipo,
        nombre: r.nombre,
        departamento: r.departamento,
        costo_usd: r.costo_usd,
        precio_venta_usd: r.precio_venta_usd,
        precio_mayor_usd: r.precio_mayor_usd,
        precio_especial_usd: r.precio_especial_usd,
        stock_minimo: r.stock_minimo,
        stock_inicial: r.stock_inicial,
        unidad: r.unidad,
        tipo_impuesto: r.tipo_impuesto_raw,
        codigo_barras: r.codigo_barras,
        presentacion: r.presentacion,
        ubicacion: r.ubicacion,
        maneja_lotes: r.maneja_lotes,
        deposito: r.deposito,
      },
    })),
    columnasPresentes
  )
  const pesoSyncKb = pesoSyncBytes / 1024
  const pesoSyncColor =
    pesoSyncKb < 100 ? 'text-green-700' : pesoSyncKb < 500 ? 'text-amber-700' : 'text-red-700'

  /** Campos de detalle (nivel 2, expandible) de una fila — solo los
   * presentes en el archivo (`columnasPresentes`), Fase A commit 3. */
  function buildDetalleCampos(row: ParsedRow): { label: string; value: string }[] {
    const campos: { label: string; value: string }[] = []
    if (columnasPresentes.has('departamento')) campos.push({ label: 'Departamento', value: row.departamento || '-' })
    if (columnasPresentes.has('costo_usd')) campos.push({ label: 'Costo USD', value: row.costo_usd || '-' })
    if (columnasPresentes.has('precio_venta_usd')) campos.push({ label: 'Precio Venta', value: row.precio_venta_usd || '-' })
    if (columnasPresentes.has('precio_mayor_usd')) campos.push({ label: 'Precio Mayor', value: row.precio_mayor_usd || '-' })
    if (columnasPresentes.has('precio_especial_usd')) campos.push({ label: 'Precio Especial', value: row.precio_especial_usd || '-' })
    if (columnasPresentes.has('stock_minimo')) campos.push({ label: 'Stock Min', value: row.stock_minimo || '-' })
    if (columnasPresentes.has('stock_inicial')) {
      campos.push({
        label: 'Stock Inicial',
        value: row.stockInicialIgnorado ? `${row.stock_inicial} (ignorado)` : (row.stock_inicial || '-'),
      })
    }
    if (columnasPresentes.has('unidad')) campos.push({ label: 'Unidad', value: row.unidad || '-' })
    if (columnasPresentes.has('tipo_impuesto')) {
      campos.push({
        label: 'Tipo Impuesto',
        value: row.tipo_impuesto === 'Gravable' && row.tipo_impuesto_porcentaje !== null
          ? `Gravable ${row.tipo_impuesto_porcentaje}%`
          : row.tipo_impuesto,
      })
    }
    if (columnasPresentes.has('codigo_barras')) campos.push({ label: 'Codigo Barras', value: row.codigo_barras || '-' })
    if (columnasPresentes.has('presentacion')) campos.push({ label: 'Presentacion', value: row.presentacion || '-' })
    if (columnasPresentes.has('ubicacion')) campos.push({ label: 'Ubicacion', value: row.ubicacion || '-' })
    if (columnasPresentes.has('maneja_lotes')) campos.push({ label: 'Maneja Lotes', value: row.maneja_lotes || '-' })
    if (columnasPresentes.has('deposito')) {
      campos.push({ label: 'Deposito', value: row.depositoId ? depositoNombrePorId.get(row.depositoId) ?? '-' : '-' })
    }
    return campos
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl max-h-[90vh]"
    >
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">
              Importar Inventario
              {step === 'preview' && (
                <span className="text-sm font-normal text-muted-foreground ml-2">- Vista previa</span>
              )}
            </h2>
            {fileName && <p className="text-xs text-muted-foreground mt-0.5">{fileName}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'instrucciones' && (
            <div className="space-y-5">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Modo de importacion</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  {(Object.keys(MODO_LABELS) as ModoImportacion[]).map((m) => (
                    <label key={m} className="flex items-center gap-2 text-xs text-gray-800">
                      <input
                        type="radio"
                        name="modo-importacion"
                        value={m}
                        checked={modo === m}
                        onChange={() => setModo(m)}
                      />
                      {MODO_LABELS[m]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">{MODO_DESCRIPCIONES[modo]}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">Formato requerido</h3>
                <p className="text-xs text-blue-700 mb-3">
                  El archivo Excel debe tener dos hojas con la misma estructura que genera el modulo de exportacion:
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-900 mb-1">Hoja 1: "Inventario" (Productos, Servicios y Combos)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs bg-white border border-blue-200 rounded">
                        <thead>
                          <tr className="bg-blue-100 border-b border-blue-200">
                            <th className="text-left px-2 py-1.5 font-semibold">Columna</th>
                            <th className="text-left px-2 py-1.5 font-semibold">Requerida</th>
                            <th className="text-left px-2 py-1.5 font-semibold">Formato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['codigo', 'Si', 'Mayusculas, numeros y guiones'],
                            ['tipo', 'Si', 'P (producto), S (servicio) o C (combo)'],
                            ['nombre', 'Si', 'Minimo 3 caracteres'],
                            ['departamento', 'Si', 'Nombre de departamento activo'],
                            ['costo_usd', 'Si', 'Numero decimal (ej: 10.50)'],
                            ['precio_venta_usd', 'Si', 'Mayor o igual al costo'],
                            ['precio_mayor_usd', 'No', 'Menor o igual al precio de venta'],
                            ['stock_minimo', 'Solo tipo P', 'Numero (ej: 5)'],
                            ['stock_inicial', 'No', 'Solo tipo P. Crea entrada en Kardex con concepto "Inventario Inicial" (solo productos nuevos — ver nota abajo)'],
                            ['unidad', 'No', 'Solo tipo P. Abreviatura de la unidad de medida (ej: UND, KG, LT)'],
                            ['tipo_impuesto', 'No', 'Gravable, Exento o Exonerado'],
                            ['deposito', 'No', 'Nombre de deposito activo. Vacio = deposito principal (productos nuevos) o no se modifica (productos existentes)'],
                          ].map(([col, req, fmt]) => (
                            <tr key={col} className="border-b border-blue-100">
                              <td className="px-2 py-1.5 font-mono">{col}</td>
                              <td className="px-2 py-1.5">{req}</td>
                              <td className="px-2 py-1.5">{fmt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-blue-900 mb-1">Hoja 2: "Componentes Combos" (opcional)</p>
                    <p className="text-xs text-blue-700">
                      Si existe, define los ingredientes de los combos: <code className="bg-blue-100 px-1 rounded">combo_codigo, combo_nombre, componente_codigo, componente_nombre, cantidad</code>.
                      Los productos referenciados deben existir en la hoja 1 o ya estar creados.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Notas:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Usa <strong>stock_inicial</strong> (solo tipo P) para registrar el stock de apertura de un producto NUEVO. Se creara una entrada en el Kardex con concepto "Inventario Inicial".</li>
                  <li>Si dejas stock_inicial vacio, el producto se crea con stock 0. Podras agregar stock luego desde el Kardex.</li>
                  <li>En modo <strong>Solo actualizar</strong>/<strong>Agregar y actualizar</strong>, stock_inicial se IGNORA para productos que ya existen (nunca mueve su stock actual) — usa el modulo Ajustes para corregir stock de productos existentes.</li>
                  <li>En modo actualizar, deja una celda vacia o quita la columna del archivo para NO tocar ese campo del producto existente (incluyendo <strong>deposito</strong>).</li>
                  <li>Puedes exportar el inventario actual y re-importarlo: la estructura es identica.</li>
                  <li>El sistema detecta duplicados dentro del archivo y contra productos existentes.</li>
                  <li>Unidades activas: {unidades.map((u) => u.abreviatura).join(', ') || 'UND, KG, LT...'}</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDescargarPlantilla}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Descargar plantilla Excel
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex-1"
                >
                  <Upload className="h-4 w-4" />
                  Seleccionar archivo (.csv, .xlsx)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Resumen hoja 1 — conteos por accion (spec-pr3 R16), coherentes con el modo activo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border rounded-lg p-3 border-blue-200 bg-blue-50">
                  <p className="text-xs text-blue-700">Crear</p>
                  <p className="text-xl font-bold text-blue-700">{countCrear}</p>
                </div>
                <div className="border rounded-lg p-3 border-teal-200 bg-teal-50">
                  <p className="text-xs text-teal-700">Actualizar</p>
                  <p className="text-xl font-bold text-teal-700">{countActualizar}</p>
                </div>
                <div className="border rounded-lg p-3 border-gray-200 bg-gray-50">
                  <p className="text-xs text-gray-600">Omitir</p>
                  <p className="text-xl font-bold text-gray-600">{countOmitir}</p>
                </div>
                <div className="border rounded-lg p-3 border-red-200 bg-red-50">
                  <p className="text-xs text-red-700 flex items-center gap-1">
                    <WarningCircle className="h-3.5 w-3.5" /> Error
                  </p>
                  <p className="text-xl font-bold text-red-700">{countError}</p>
                </div>
              </div>

              {/* Estimado de peso de la subida a PowerSync/Supabase (Fase A
                  commit 3) — informativo, nunca bloqueante. */}
              <p className={`text-xs ${pesoSyncColor}`}>
                📦 Subida estimada: ~{pesoSyncKb < 1 ? pesoSyncKb.toFixed(2) : pesoSyncKb.toFixed(1)} KB
              </p>

              {validCompCount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                  <CheckCircle className="h-3.5 w-3.5 inline mr-1" />
                  Hoja 2 detectada: <strong>{validCompCount}</strong> componente(s) de combos validos para importar.
                </div>
              )}

              {countError > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  Solo se importaran las filas sin errores. Corrige los errores en tu archivo y vuelve a cargarlo.
                </div>
              )}

              {/* Tabla de preview — 2 niveles (Fase A commit 3): nivel 1
                  siempre visible, nivel 2 (detalle) se expande al hacer
                  click en la fila (OMITIR no es expandible). */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-2 py-2 font-medium">#</th>
                        <th className="text-left px-2 py-2 font-medium">Estado</th>
                        <th className="text-left px-2 py-2 font-medium">Accion</th>
                        <th className="text-left px-2 py-2 font-medium">Codigo</th>
                        <th className="text-left px-2 py-2 font-medium">Tipo</th>
                        <th className="text-left px-2 py-2 font-medium">Nombre</th>
                        <th className="text-left px-2 py-2 font-medium">Errores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const accionMostrada = row.errors.length > 0 ? 'ERROR' : row.accion
                        const expandible = row.accion !== 'OMITIR'
                        const expandido = expandible && expandedRows.has(row.rowNum)
                        return (
                        <Fragment key={row.rowNum}>
                          <tr
                            onClick={expandible ? () => toggleExpandRow(row.rowNum) : undefined}
                            className={`border-b border-gray-100 ${row.isValid ? '' : 'bg-red-50'} ${expandible ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                          >
                            <td className="px-2 py-1.5 text-gray-500">{row.rowNum}</td>
                            <td className="px-2 py-1.5">
                              {row.isValid
                                ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                : <WarningCircle className="h-3.5 w-3.5 text-red-600" />}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={
                                accionMostrada === 'CREAR' ? 'text-blue-700 font-medium'
                                : accionMostrada === 'ACTUALIZAR' ? 'text-teal-700 font-medium'
                                : accionMostrada === 'ERROR' ? 'text-red-700 font-medium'
                                : 'text-gray-500'
                              }>
                                {accionMostrada}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 font-mono">{row.codigo}</td>
                            <td className="px-2 py-1.5">{row.tipo}</td>
                            <td className="px-2 py-1.5 truncate max-w-[200px]">{row.nombre}</td>
                            <td className="px-2 py-1.5 text-red-600">{row.errors.join('; ')}</td>
                          </tr>
                          {expandido && (
                            <tr className="border-b border-gray-100 bg-gray-50/60">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                  {buildDetalleCampos(row).map((campo) => (
                                    <div key={campo.label} className="flex justify-between gap-2 text-xs">
                                      <span className="text-gray-500">{campo.label}</span>
                                      <span className="font-medium text-gray-800">{campo.value}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'procesando' && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-700 mb-4">{progreso.fase || 'Importando productos...'}</p>
              <div className="max-w-xs mx-auto">
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${progreso.pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{progreso.pct}%</p>
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="flex justify-end gap-3 p-4 border-t shrink-0">
            <button
              onClick={() => setStep('instrucciones')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cargar otro archivo
            </button>
            <button
              onClick={handleImportar}
              disabled={totalEscribible === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Importar {totalEscribible} producto(s)
              {validCompCount > 0 ? ` + ${validCompCount} componente(s)` : ''}
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
