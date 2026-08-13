import Decimal from 'decimal.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { applyImpuesto, formatBs, formatUsd, usdToBs, type DecimalInput } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'

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
  }
}

// =============================================
// buildReciboTextoPlano — texto monoespaciado
// =============================================

const SEPARADOR = '-'.repeat(40)

export function buildReciboTextoPlano(recibo: ReciboData): string {
  const lines: string[] = []

  lines.push('RECIBO')
  lines.push(`Nro: ${recibo.nroFactura}`)
  lines.push(`Fecha: ${formatDateTime(recibo.fecha)}`)
  lines.push('')
  lines.push(recibo.emisor.nombre)
  if (recibo.emisor.rif) lines.push(`RIF: ${recibo.emisor.rif}`)
  if (recibo.emisor.direccion) lines.push(recibo.emisor.direccion)
  lines.push('')
  lines.push(`Cliente: ${recibo.cliente.nombre}`)
  lines.push(`Identificacion: ${recibo.cliente.identificacion}`)
  if (recibo.cliente.direccion) lines.push(`Direccion: ${recibo.cliente.direccion}`)
  lines.push('')
  lines.push('Articulos')
  lines.push(SEPARADOR)
  for (const linea of recibo.lineas) {
    const marca = linea.esExento ? ' (E)' : ''
    lines.push(`${linea.codigo} ${linea.nombre}${marca}`)
    lines.push(
      `  ${linea.cantidad} x ${formatUsd(linea.precioUnitarioUsd)} = ${formatUsd(linea.totalUsd)}`
    )
  }
  lines.push(SEPARADOR)

  if (recibo.totales.montoExentoUsd > 0) {
    lines.push(`Monto Exento: ${formatUsd(recibo.totales.montoExentoUsd)}`)
  }
  if (recibo.totales.baseImponibleUsd > 0) {
    lines.push(`Base Imponible: ${formatUsd(recibo.totales.baseImponibleUsd)}`)
  }
  for (const alicuota of recibo.totales.alicuotas) {
    lines.push(`IVA ${alicuota.pct}%: ${formatUsd(alicuota.ivaUsd)}`)
  }
  if (recibo.totales.igtfUsd !== null) {
    lines.push(`IGTF: ${formatUsd(recibo.totales.igtfUsd)}`)
  }
  lines.push(
    `TOTAL GENERAL: ${formatUsd(recibo.totales.totalGeneralUsd)} / ${formatBs(recibo.totales.totalGeneralBs)}`
  )

  return lines.join('\n')
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
// shareOrDownloadRecibo — feature-detection
// =============================================

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError'
  if (err instanceof Error) return err.name === 'AbortError'
  return false
}

function descargarPdf(recibo: ReciboData): void {
  const blob = buildReciboPdfBlob(recibo)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `recibo-${recibo.nroFactura}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export async function shareOrDownloadRecibo(recibo: ReciboData): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `RECIBO ${recibo.nroFactura}`,
        text: buildReciboTextoPlano(recibo),
      })
    } catch (err) {
      if (isAbortError(err)) return
      throw err
    }
    return
  }

  descargarPdf(recibo)
}
