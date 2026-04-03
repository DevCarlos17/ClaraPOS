import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { CuadreKpiCards } from './cuadre-kpi-cards'
import { VentasDeptChart } from './ventas-dept-chart'
import { PagosResumen } from './pagos-resumen'
import { TopProductos } from './top-productos'
import { AuditModal } from './audit-modal'
import { CxcModal } from './cxc-modal'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CuadrePage() {
  const [fecha, setFecha] = useState(todayStr)
  const [auditOpen, setAuditOpen] = useState(false)
  const [cxcOpen, setCxcOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader titulo="Cuadre de Caja" descripcion="Resumen de operaciones del dia">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </PageHeader>

      {/* KPI Cards */}
      <CuadreKpiCards
        fecha={fecha}
        onClickVentas={() => setAuditOpen(true)}
        onClickCxc={() => setCxcOpen(true)}
      />

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VentasDeptChart fecha={fecha} />
        <PagosResumen fecha={fecha} />
      </div>

      {/* Top productos */}
      <TopProductos fecha={fecha} />

      {/* Modals */}
      <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} fecha={fecha} />
      <CxcModal isOpen={cxcOpen} onClose={() => setCxcOpen(false)} fecha={fecha} />
    </div>
  )
}
