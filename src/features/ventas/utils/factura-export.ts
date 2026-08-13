import Decimal from 'decimal.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { applyImpuesto, formatBs, formatUsd, usdToBs, type DecimalInput } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import {
  agruparPagosPorMetodo,
  construirCierreRecibo,
  type ReciboPagoInput,
  type ReciboPagoLinea,
  type ReciboCierre,
  type ReciboDiscrepancyInput,
} from './recibo-pagos'

// =============================================
// TYPES
// =============================================

export type TipoImpuestoLinea = 'Gravable' | 'Exento' | 'Exonerado'

export interface ReciboLinea {
  codigo: string
  nombre: string
  esExento: boolean
  cantidad: number
  precioUnitarioUsd: number
  totalUsd: number
}

export interface ReciboAlicuota {
  pct: number
  baseUsd: number
  ivaUsd: number
}

export interface ReciboTotales {
  montoExentoUsd: number
  baseImponibleUsd: number
  alicuotas: ReciboAlicuota[]
  igtfUsd: number | null
  totalGeneralUsd: number
  totalGeneralBs: number
}

export interface ReciboParte {
  nombre: string
  rif: string | null
  direccion: string | null
}

export interface ReciboCliente {
  nombre: string
  identificacion: string
  direccion: string | null
}

export interface ReciboData {
  nroFactura: string
  fecha: string
  emisor: ReciboParte
  cliente: ReciboCliente
  lineas: ReciboLinea[]
  totales: ReciboTotales
  pagos: ReciboPagoLinea[]
  cierre: ReciboCierre | null
}

export interface ReciboLineaInput {
  codigo: string
  nombre: string
  cantidad: DecimalInput
  precioUnitarioUsd: DecimalInput
  tipoImpuesto: TipoImpuestoLinea
  impuestoPct: DecimalInput
}

export interface BuildReciboDataInput {
  nroFactura: string
  fecha: string
  emisor: ReciboParte
  cliente: ReciboCliente
  lineas: ReciboLineaInput[]
  tasa: DecimalInput
  igtfUsd: number | null
  pagos: ReciboPagoInput[]
  discrepancy: ReciboDiscrepancyInput | null
  saldoPendUsd: number
}

// =============================================
// INTERNAL HELPER
// =============================================

/** Safe converter — never throws. Returns Decimal(0) on empty/invalid input. */
function toD(val: DecimalInput): Decimal {
  if (val instanceof Decimal) return val
  if (typeof val === 'string' && val.trim() === '') return new Decimal(0)
  try {
    return new Decimal(val)
  } catch {
    return new Decimal(0)
  }
}

function esExentoTipo(tipo: TipoImpuestoLinea): boolean {
  return tipo === 'Exento' || tipo === 'Exonerado'
}

// Caracteres invalidos en nombres de archivo (Windows + POSIX): / \ : * ? " < > |
const CARACTERES_INVALIDOS_ARCHIVO_RE = /[/\\:*?"<>|]/g
const GUIONES_REPETIDOS_RE = /-+/g
const DIACRITICOS_RE = /[\u0300-\u036f]/g

function sanitizarNombreCliente(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(DIACRITICOS_RE, '')
    .toUpperCase()
    .replace(CARACTERES_INVALIDOS_ARCHIVO_RE, '')
    .replace(/\s+/g, '-')
    .replace(GUIONES_REPETIDOS_RE, '-')
    .replace(/^-+|-+$/g, '')
}

/** Nombre de archivo dinamico y sanitizado: RECIBO_{nro}_{CLIENTE-SANITIZADO}.{ext} */
export function nombreArchivoRecibo(recibo: ReciboData, ext: 'pdf' | 'png'): string {
  const clienteSanitizado = sanitizarNombreCliente(recibo.cliente.nombre)
  const base = clienteSanitizado
    ? `RECIBO_${recibo.nroFactura}_${clienteSanitizado}`
    : `RECIBO_${recibo.nroFactura}`
  return `${base}.${ext}`
}

// =============================================
// buildReciboData — Totals-by-Alicuota Algorithm
// =============================================

export function buildReciboData(input: BuildReciboDataInput): ReciboData {
  let montoExentoUsd = new Decimal(0)
  let baseImponibleUsd = new Decimal(0)
  const alicuotaMap = new Map<number, { base: Decimal; iva: Decimal }>()
  const lineas: ReciboLinea[] = []

  for (const linea of input.lineas) {
    const cantidad = toD(linea.cantidad)
    const precioUnitarioUsd = toD(linea.precioUnitarioUsd)
    const totalUsd = cantidad.times(precioUnitarioUsd)
    const esExento = esExentoTipo(linea.tipoImpuesto)

    if (esExento) {
      montoExentoUsd = montoExentoUsd.plus(totalUsd)
    } else {
      baseImponibleUsd = baseImponibleUsd.plus(totalUsd)
      const pct = toD(linea.impuestoPct).toNumber()
      const ivaLinea = applyImpuesto(totalUsd, pct)
      const bucket = alicuotaMap.get(pct) ?? { base: new Decimal(0), iva: new Decimal(0) }
      alicuotaMap.set(pct, {
        base: bucket.base.plus(totalUsd),
        iva: bucket.iva.plus(ivaLinea),
      })
    }

    lineas.push({
      codigo: linea.codigo,
      nombre: linea.nombre,
      esExento,
      cantidad: cantidad.toNumber(),
      precioUnitarioUsd: precioUnitarioUsd.toNumber(),
      totalUsd: totalUsd.toNumber(),
    })
  }

  const alicuotas: ReciboAlicuota[] = Array.from(alicuotaMap.entries())
    .sort(([pctA], [pctB]) => pctA - pctB)
    .map(([pct, bucket]) => ({
      pct,
      baseUsd: bucket.base.toNumber(),
      ivaUsd: bucket.iva.toNumber(),
    }))

  const ivaTotal = alicuotas.reduce((sum, a) => sum.plus(a.ivaUsd), new Decimal(0))
  const igtf = input.igtfUsd ?? 0
  const totalGeneralUsd = montoExentoUsd.plus(baseImponibleUsd).plus(ivaTotal).plus(igtf)
  const totalGeneralBs = usdToBs(totalGeneralUsd, input.tasa)

  const pagos = agruparPagosPorMetodo(input.pagos, input.tasa)
  const cierre = construirCierreRecibo(input.discrepancy, input.saldoPendUsd, input.tasa)

  return {
    nroFactura: input.nroFactura,
    fecha: input.fecha,
    emisor: input.emisor,
    cliente: input.cliente,
    lineas,
    totales: {
      montoExentoUsd: montoExentoUsd.toNumber(),
      baseImponibleUsd: baseImponibleUsd.toNumber(),
      alicuotas,
      igtfUsd: input.igtfUsd,
      totalGeneralUsd: totalGeneralUsd.toNumber(),
      totalGeneralBs: totalGeneralBs.toNumber(),
    },
    pagos,
    cierre,
  }
}

// =============================================
// construirLineasRecibo — modelo de lineas compartido por
// buildReciboTextoPlano (texto) y buildReciboImagenBlob (canvas)
// =============================================

interface LineaRecibo {
  text: string
  bold?: boolean
}

const SEPARADOR = '-'.repeat(40)

function construirLineasRecibo(recibo: ReciboData): LineaRecibo[] {
  const lines: LineaRecibo[] = []

  lines.push({ text: 'RECIBO', bold: true })
  lines.push({ text: `Nro: ${recibo.nroFactura}` })
  lines.push({ text: `Fecha: ${formatDateTime(recibo.fecha)}` })
  lines.push({ text: '' })
  lines.push({ text: recibo.emisor.nombre, bold: true })
  if (recibo.emisor.rif) lines.push({ text: `RIF: ${recibo.emisor.rif}` })
  if (recibo.emisor.direccion) lines.push({ text: recibo.emisor.direccion })
  lines.push({ text: '' })
  lines.push({ text: `Cliente: ${recibo.cliente.nombre}` })
  lines.push({ text: `Identificacion: ${recibo.cliente.identificacion}` })
  if (recibo.cliente.direccion) lines.push({ text: `Direccion: ${recibo.cliente.direccion}` })
  lines.push({ text: '' })
  lines.push({ text: 'Articulos', bold: true })
  lines.push({ text: SEPARADOR })
  for (const linea of recibo.lineas) {
    const marca = linea.esExento ? ' (E)' : ''
    lines.push({ text: `${linea.codigo} ${linea.nombre}${marca}` })
    lines.push({
      text: `  ${linea.cantidad} x ${formatUsd(linea.precioUnitarioUsd)} = ${formatUsd(linea.totalUsd)}`,
    })
  }
  lines.push({ text: SEPARADOR })

  if (recibo.totales.montoExentoUsd > 0) {
    lines.push({ text: `Monto Exento: ${formatUsd(recibo.totales.montoExentoUsd)}` })
  }
  if (recibo.totales.baseImponibleUsd > 0) {
    lines.push({ text: `Base Imponible: ${formatUsd(recibo.totales.baseImponibleUsd)}` })
  }
  for (const alicuota of recibo.totales.alicuotas) {
    lines.push({ text: `IVA ${alicuota.pct}%: ${formatUsd(alicuota.ivaUsd)}` })
  }
  if (recibo.totales.igtfUsd !== null) {
    lines.push({ text: `IGTF: ${formatUsd(recibo.totales.igtfUsd)}` })
  }
  lines.push({
    text: `TOTAL GENERAL: ${formatUsd(recibo.totales.totalGeneralUsd)} / ${formatBs(recibo.totales.totalGeneralBs)}`,
    bold: true,
  })

  return lines
}

// =============================================
// buildReciboTextoPlano — texto monoespaciado
// =============================================

export function buildReciboTextoPlano(recibo: ReciboData): string {
  return construirLineasRecibo(recibo)
    .map((linea) => linea.text)
    .join('\n')
}

// =============================================
// buildReciboPdfBlob — jsPDF + autoTable
// =============================================

interface AutoTableDoc extends jsPDF {
  lastAutoTable: { finalY: number }
}

export function buildReciboPdfBlob(recibo: ReciboData): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(recibo.emisor.nombre, pageWidth / 2, y, { align: 'center' })
  y += 5
  if (recibo.emisor.rif) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`RIF: ${recibo.emisor.rif}`, pageWidth / 2, y, { align: 'center' })
    y += 4
  }
  if (recibo.emisor.direccion) {
    doc.setFontSize(8)
    doc.text(recibo.emisor.direccion, pageWidth / 2, y, { align: 'center' })
    y += 4
  }

  y += 3
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.5)
  doc.line(15, y, pageWidth - 15, y)
  y += 7

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`RECIBO Nro: ${recibo.nroFactura}`, pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const infoLeft = [
    `Cliente: ${recibo.cliente.nombre}`,
    `Identificacion: ${recibo.cliente.identificacion}`,
  ]
  const infoRight = [`Fecha: ${formatDateTime(recibo.fecha)}`]
  infoLeft.forEach((txt) => {
    doc.text(txt, 15, y)
    y += 5
  })
  y -= infoLeft.length * 5
  infoRight.forEach((txt) => {
    doc.text(txt, pageWidth / 2 + 10, y)
    y += 5
  })
  y += 5

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Articulos', 15, y)
  y += 4

  const artBody = recibo.lineas.map((linea) => [
    linea.codigo,
    `${linea.nombre}${linea.esExento ? ' (E)' : ''}`,
    String(linea.cantidad),
    formatUsd(linea.precioUnitarioUsd),
    formatUsd(linea.totalUsd),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Codigo', 'Producto', 'Cant.', 'P.Unit', 'Subtotal']],
    body: artBody,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  })

  y = (doc as AutoTableDoc).lastAutoTable.finalY + 6

  const totalesBody: string[][] = []
  if (recibo.totales.montoExentoUsd > 0) {
    totalesBody.push(['Monto Exento', formatUsd(recibo.totales.montoExentoUsd)])
  }
  if (recibo.totales.baseImponibleUsd > 0) {
    totalesBody.push(['Base Imponible', formatUsd(recibo.totales.baseImponibleUsd)])
  }
  for (const alicuota of recibo.totales.alicuotas) {
    totalesBody.push([`IVA ${alicuota.pct}%`, formatUsd(alicuota.ivaUsd)])
  }
  if (recibo.totales.igtfUsd !== null) {
    totalesBody.push(['IGTF', formatUsd(recibo.totales.igtfUsd)])
  }
  totalesBody.push([
    'Total General',
    `${formatUsd(recibo.totales.totalGeneralUsd)} / ${formatBs(recibo.totales.totalGeneralBs)}`,
  ])

  autoTable(doc, {
    startY: y,
    head: [['', '']],
    body: totalesBody,
    theme: 'plain',
    headStyles: { fillColor: [255, 255, 255], textColor: [255, 255, 255], fontSize: 1 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { halign: 'right' } },
    margin: { left: pageWidth - 80, right: 15 },
    tableWidth: 65,
  })

  return doc.output('blob')
}

// =============================================
// buildReciboImagenBlob — dibujo manual en Canvas 2D
// =============================================

const PNG_ANCHO = 480
const PNG_PADDING = 24
const PNG_LINE_HEIGHT = 20
// devicePixelRatio-style scaling fijo para que el PNG se vea nitido al compartirse
// (no dependemos de window.devicePixelRatio porque el canvas es offscreen/oculto).
const PNG_ESCALA = 2

/**
 * Dibuja el recibo completo (mismo contenido fiscal que buildReciboTextoPlano)
 * sobre un canvas 2D y lo exporta como PNG. 100% local, sin dependencias nuevas.
 */
export function buildReciboImagenBlob(recibo: ReciboData): Promise<Blob> {
  const lineas = construirLineasRecibo(recibo)
  const alto = PNG_PADDING * 2 + lineas.length * PNG_LINE_HEIGHT

  const canvas = document.createElement('canvas')
  canvas.width = PNG_ANCHO * PNG_ESCALA
  canvas.height = alto * PNG_ESCALA

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return Promise.reject(new Error('No se pudo obtener el contexto 2D del canvas'))
  }

  ctx.scale(PNG_ESCALA, PNG_ESCALA)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PNG_ANCHO, alto)
  ctx.fillStyle = '#111111'
  ctx.textBaseline = 'top'

  let y = PNG_PADDING
  for (const linea of lineas) {
    ctx.font = linea.bold ? 'bold 13px monospace' : '13px monospace'
    ctx.fillText(linea.text, PNG_PADDING, y)
    y += PNG_LINE_HEIGHT
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen del recibo'))
    }, 'image/png')
  })
}

// =============================================
// descargarReciboPdf / compartirReciboImagen — feature-detection
// =============================================

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err instanceof Error) return err.name === 'AbortError'
  return false
}

function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/** Boton "Descargar": genera el PDF y dispara la descarga con el nombre sanitizado. */
export function descargarReciboPdf(recibo: ReciboData): void {
  const blob = buildReciboPdfBlob(recibo)
  descargarBlob(blob, nombreArchivoRecibo(recibo, 'pdf'))
}

/**
 * Boton "Compartir": comparte una IMAGEN PNG del recibo via Web Share API Level 2.
 * Cadena de fallback:
 *   1. navigator.canShare({ files }) true  -> navigator.share({ files })
 *   2. imagen no se pudo generar/compartir -> navigator.share({ text }) (texto plano)
 *   3. navigator.share no existe en absoluto -> rechaza (el boton debe estar OCULTO
 *      en la UI en ese caso — decision de UX: no tiene sentido mostrar "Compartir"
 *      si el dispositivo no soporta Web Share API; ver venta-exitosa-modal.tsx).
 * AbortError (usuario cancelo el share sheet) se traga en silencio.
 *
 * `construirImagen` es inyectable (default: buildReciboImagenBlob) para permitir
 * testear la cadena de fallback sin depender de renderizado real de Canvas 2D.
 */
export async function compartirReciboImagen(
  recibo: ReciboData,
  construirImagen: (recibo: ReciboData) => Promise<Blob> = buildReciboImagenBlob
): Promise<void> {
  if (typeof navigator.share !== 'function') {
    throw new Error('Compartir no esta disponible en este dispositivo')
  }

  const archivo = await construirImagen(recibo)
    .then((blob) => new File([blob], nombreArchivoRecibo(recibo, 'png'), { type: 'image/png' }))
    .catch(() => null)

  const titulo = `RECIBO ${recibo.nroFactura}`

  if (archivo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo })
    } catch (err) {
      if (isAbortError(err)) return
      throw err
    }
    return
  }

  try {
    await navigator.share({ title: titulo, text: buildReciboTextoPlano(recibo) })
  } catch (err) {
    if (isAbortError(err)) return
    throw err
  }
}
