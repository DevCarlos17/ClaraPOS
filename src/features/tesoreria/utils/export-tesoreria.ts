import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { db } from '@/core/db/powersync/db'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { todayStr, localNow } from '@/lib/dates'
import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'
import type { MovimientoTableRow } from '../components/movimientos-table'
import { formatFechaHoraMovimiento } from './format-movimiento-fecha'

// ─── Helpers internos ─────────────────────────────────────────

function fmtAmount(val: number, monedaCodigo: string): string {
  return monedaCodigo === 'USD' ? formatUsd(val) : formatBs(val)
}

// ─── Tipo interno para movimientos raw ────────────────────────

interface MovRaw {
  tipo: string
  monto: string
  fecha: string
  created_at: string
  origen: string
  referencia: string | null
  descripcion: string | null
}

// ─── Exportar Histórico PDF ───────────────────────────────────

export function exportHistoricoPdf(params: {
  movimientos: MovimientoTableRow[]
  cuenta: CuentaTesoreria
  desde: string
  hasta: string
  empresaNombre: string
}): void {
  const { movimientos, cuenta, desde, hasta, empresaNombre } = params
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(empresaNombre.toUpperCase(), 14, 15)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Estado de Cuenta — ${cuenta.nombre}`, 14, 22)
  doc.text(`Moneda: ${cuenta.moneda_codigo}`, 14, 28)
  doc.text(`Período: ${desde} al ${hasta}`, 14, 34)
  doc.text(`Generado: ${formatDate(localNow())}`, 14, 40)

  const rows = movimientos.map((m) => {
    const monto = parseFloat(m.monto)
    const saldo = parseFloat(m.saldo_nuevo)
    const estado = m.reversado === 1 ? 'Reversado' : m.validado === 1 ? 'Conciliado' : 'Pendiente'
    return [
      formatFechaHoraMovimiento(m.fecha, m.created_at),
      m.referencia ?? '-',
      m.origen,
      m.tipo === 'INGRESO' ? fmtAmount(monto, cuenta.moneda_codigo) : '',
      m.tipo === 'EGRESO' ? fmtAmount(monto, cuenta.moneda_codigo) : '',
      fmtAmount(saldo, cuenta.moneda_codigo),
      estado,
    ]
  })

  autoTable(doc, {
    startY: 46,
    head: [['Fecha/Hora', 'Referencia', 'Módulo', 'Ingreso', 'Egreso', 'Saldo', 'Estado']],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  })

  const totalIngreso = movimientos
    .filter((m) => m.tipo === 'INGRESO' && m.reversado === 0)
    .reduce((s, m) => s + parseFloat(m.monto), 0)
  const totalEgreso = movimientos
    .filter((m) => m.tipo === 'EGRESO' && m.reversado === 0)
    .reduce((s, m) => s + parseFloat(m.monto), 0)
  const saldoFinal =
    movimientos.length > 0 ? parseFloat(movimientos[movimientos.length - 1].saldo_nuevo) : 0

  const finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  doc.setFontSize(9)
  doc.text(`Total ingresos: ${fmtAmount(totalIngreso, cuenta.moneda_codigo)}`, 14, finalY)
  doc.text(`Total egresos: ${fmtAmount(totalEgreso, cuenta.moneda_codigo)}`, 14, finalY + 5)
  doc.setFont('helvetica', 'bold')
  doc.text(`Saldo final: ${fmtAmount(saldoFinal, cuenta.moneda_codigo)}`, 14, finalY + 10)

  const filename = `estado_cuenta_${cuenta.nombre.replace(/\s+/g, '_')}_${desde}_${hasta}.pdf`
  doc.save(filename)
}

// ─── Exportar Histórico Excel ─────────────────────────────────

export function exportHistoricoExcel(params: {
  movimientos: MovimientoTableRow[]
  cuenta: CuentaTesoreria
  desde: string
  hasta: string
  empresaNombre: string
}): void {
  const { movimientos, cuenta, desde, hasta, empresaNombre } = params

  const header: (string | number | undefined)[][] = [
    ['Empresa:', empresaNombre],
    ['Cuenta:', cuenta.nombre],
    ['Moneda:', cuenta.moneda_codigo],
    ['Período:', `${desde} al ${hasta}`],
    [],
  ]
  const cols = [['Fecha/Hora', 'Referencia', 'Módulo', 'Tipo', 'Ingreso', 'Egreso', 'Saldo', 'Estado']]
  const rows = movimientos.map((m) => {
    const monto = parseFloat(m.monto)
    const saldo = parseFloat(m.saldo_nuevo)
    const estado = m.reversado === 1 ? 'Reversado' : m.validado === 1 ? 'Conciliado' : 'Pendiente'
    return [
      formatFechaHoraMovimiento(m.fecha, m.created_at),
      m.referencia ?? '',
      m.origen,
      m.tipo,
      m.tipo === 'INGRESO' ? monto : '',
      m.tipo === 'EGRESO' ? monto : '',
      saldo,
      estado,
    ]
  })

  const data = [...header, ...cols, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta')
  XLSX.writeFile(wb, `estado_cuenta_${cuenta.nombre.replace(/\s+/g, '_')}_${desde}_${hasta}.xlsx`)
}

// ─── Exportar Pendientes PDF ──────────────────────────────────

export function exportPendientesPdf(params: {
  movimientos: MovimientoTableRow[]
  cuenta: CuentaTesoreria
  empresaNombre: string
}): void {
  const { movimientos, cuenta, empresaNombre } = params
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(empresaNombre.toUpperCase(), 14, 15)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Movimientos Pendientes — ${cuenta.nombre}`, 14, 22)
  doc.text(`Generado: ${formatDate(localNow())}`, 14, 28)

  const rows = movimientos.map((m) => {
    const monto = parseFloat(m.monto)
    return [
      formatFechaHoraMovimiento(m.fecha, m.created_at),
      m.origen,
      m.referencia ?? '-',
      m.descripcion ?? '-',
      fmtAmount(monto, cuenta.moneda_codigo),
      m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso',
    ]
  })

  autoTable(doc, {
    startY: 34,
    head: [['Fecha/Hora', 'Módulo', 'Referencia', 'Descripción', 'Monto', 'Tipo']],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: { 4: { halign: 'right' } },
  })

  const totalNeto = movimientos.reduce((s, m) => {
    const v = parseFloat(m.monto)
    return m.tipo === 'INGRESO' ? s + v : s - v
  }, 0)

  const finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(`Por conciliar: ${fmtAmount(Math.abs(totalNeto), cuenta.moneda_codigo)}`, 14, finalY)

  doc.save(
    `pendientes_${cuenta.nombre.replace(/\s+/g, '_')}_${todayStr()}.pdf`
  )
}

// ─── Exportar Pendientes Excel ────────────────────────────────

export function exportPendientesExcel(params: {
  movimientos: MovimientoTableRow[]
  cuenta: CuentaTesoreria
  empresaNombre: string
}): void {
  const { movimientos, cuenta, empresaNombre } = params
  const header: (string | number | undefined)[][] = [
    ['Empresa:', empresaNombre],
    ['Cuenta:', cuenta.nombre],
    ['Generado:', formatDate(localNow())],
    [],
  ]
  const cols = [['Fecha/Hora', 'Módulo', 'Referencia', 'Descripción', 'Monto', 'Tipo']]
  const rows = movimientos.map((m) => [
    formatFechaHoraMovimiento(m.fecha, m.created_at),
    m.origen,
    m.referencia ?? '',
    m.descripcion ?? '',
    parseFloat(m.monto),
    m.tipo,
  ])
  const data = [...header, ...cols, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pendientes')
  XLSX.writeFile(
    wb,
    `pendientes_${cuenta.nombre.replace(/\s+/g, '_')}_${todayStr()}.xlsx`
  )
}

// ─── Exportar Consolidado Pendientes PDF ──────────────────────

export async function exportConsolidadoPendientesPdf(params: {
  empresaId: string
  empresaNombre: string
  cuentas: CuentaTesoreria[]
}): Promise<void> {
  const { empresaId, empresaNombre, cuentas } = params
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(empresaNombre.toUpperCase(), 14, 15)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Reporte Consolidado de Pendientes por Conciliar', 14, 22)
  doc.text(`Generado: ${formatDate(localNow())}`, 14, 28)

  let currentY = 34
  let grandTotalUsd = 0
  let grandTotalBs = 0

  for (const cuenta of cuentas) {
    let movs: MovRaw[] = []

    if (cuenta.tipo === 'BANCO') {
      const { rows } = await db.execute(
        `SELECT tipo, monto, fecha, created_at, origen, referencia, descripcion
         FROM movimientos_bancarios
         WHERE empresa_id = ? AND banco_empresa_id = ? AND validado = 0 AND reversado = 0
         ORDER BY fecha ASC, created_at ASC`,
        [empresaId, cuenta.id]
      )
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          movs.push(rows.item(i) as MovRaw)
        }
      }
    } else {
      const { rows } = await db.execute(
        `SELECT tipo, monto, fecha, created_at, origen, referencia, descripcion
         FROM mov_caja_fuerte
         WHERE empresa_id = ? AND caja_fuerte_id = ? AND validado = 0 AND reversado = 0
         ORDER BY fecha ASC, created_at ASC`,
        [empresaId, cuenta.id]
      )
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          movs.push(rows.item(i) as MovRaw)
        }
      }
    }

    if (movs.length === 0) continue

    if (currentY > 170) {
      doc.addPage()
      currentY = 14
    }
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${cuenta.nombre} (${cuenta.moneda_codigo})`, 14, currentY)
    currentY += 2

    const rows = movs.map((m) => [
      formatFechaHoraMovimiento(m.fecha, m.created_at),
      m.origen,
      m.referencia ?? '-',
      m.descripcion ?? '-',
      fmtAmount(parseFloat(m.monto), cuenta.moneda_codigo),
      m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso',
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Fecha/Hora', 'Módulo', 'Referencia', 'Descripción', 'Monto', 'Tipo']],
      body: rows,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [71, 85, 105] },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })

    const neto = movs.reduce((s, m) => {
      const v = parseFloat(m.monto)
      return m.tipo === 'INGRESO' ? s + v : s - v
    }, 0)

    currentY =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(
      `Subtotal ${cuenta.nombre}: ${fmtAmount(Math.abs(neto), cuenta.moneda_codigo)}`,
      14,
      currentY
    )
    currentY += 8

    if (cuenta.moneda_codigo === 'USD') grandTotalUsd += neto
    else grandTotalBs += neto
  }

  if (currentY > 175) {
    doc.addPage()
    currentY = 14
  }
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  if (grandTotalUsd !== 0) {
    doc.text(`Total USD: ${formatUsd(Math.abs(grandTotalUsd))}`, 14, currentY)
  }
  if (grandTotalBs !== 0) {
    doc.text(
      `Total BS: ${formatBs(Math.abs(grandTotalBs))}`,
      14,
      currentY + (grandTotalUsd !== 0 ? 6 : 0)
    )
  }

  doc.save(`consolidado_pendientes_${todayStr()}.pdf`)
}

// ─── Exportar Consolidado Pendientes Excel ────────────────────

export async function exportConsolidadoPendientesExcel(params: {
  empresaId: string
  empresaNombre: string
  cuentas: CuentaTesoreria[]
}): Promise<void> {
  const { empresaId, empresaNombre, cuentas } = params
  const wb = XLSX.utils.book_new()

  for (const cuenta of cuentas) {
    let movs: MovRaw[] = []

    if (cuenta.tipo === 'BANCO') {
      const { rows } = await db.execute(
        `SELECT tipo, monto, fecha, created_at, origen, referencia, descripcion
         FROM movimientos_bancarios
         WHERE empresa_id = ? AND banco_empresa_id = ? AND validado = 0 AND reversado = 0
         ORDER BY fecha ASC`,
        [empresaId, cuenta.id]
      )
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          movs.push(rows.item(i) as MovRaw)
        }
      }
    } else {
      const { rows } = await db.execute(
        `SELECT tipo, monto, fecha, created_at, origen, referencia, descripcion
         FROM mov_caja_fuerte
         WHERE empresa_id = ? AND caja_fuerte_id = ? AND validado = 0 AND reversado = 0
         ORDER BY fecha ASC`,
        [empresaId, cuenta.id]
      )
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          movs.push(rows.item(i) as MovRaw)
        }
      }
    }

    if (movs.length === 0) continue

    const header: (string | number | undefined)[][] = [
      ['Empresa:', empresaNombre],
      ['Cuenta:', cuenta.nombre],
      ['Moneda:', cuenta.moneda_codigo],
      [],
    ]
    const cols = [['Fecha/Hora', 'Módulo', 'Referencia', 'Descripción', 'Monto', 'Tipo']]
    const rows = movs.map((m) => [
      formatFechaHoraMovimiento(m.fecha, m.created_at),
      m.origen,
      m.referencia ?? '',
      m.descripcion ?? '',
      parseFloat(m.monto),
      m.tipo,
    ])
    const data = [...header, ...cols, ...rows]
    const sheetName = cuenta.nombre.slice(0, 31).replace(/[\\/:*?[\]]/g, '_')
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  XLSX.writeFile(wb, `consolidado_pendientes_${todayStr()}.xlsx`)
}
