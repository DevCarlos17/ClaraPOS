import { useEffect, useState } from 'react'
import { UserPlus, Warning, Info } from '@phosphor-icons/react'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'
import { db } from '@/core/db/powersync/db'
import { todayStr } from '@/lib/dates'

/**
 * Busca la tasa interna por fecha exacta en `tasas_cambio` — duplicado
 * intencional de `gasto-form.tsx::buscarTasaPorFecha` (helper no exportado,
 * ~20 lineas, no vale la pena una extraccion compartida solo para esto).
 */
async function buscarTasaPorFecha(fecha: string, empresaId: string): Promise<number | null> {
  if (!fecha || !empresaId) return null
  try {
    const rows = await db.getAll<{ valor: string }>(
      `SELECT valor FROM tasas_cambio
       WHERE empresa_id = ?
         AND DATE(fecha) = DATE(?)
       ORDER BY created_at DESC LIMIT 1`,
      [empresaId, fecha]
    )
    if (rows.length === 0) return null
    return parseFloat(rows[0].valor)
  } catch {
    return null
  }
}

/**
 * Paso 1 del wizard de gasto — Identificacion. Sin props: lee/escribe
 * `useGastoWizardStore()` directamente (mismo patron que `step-servicios.tsx`
 * de citas). El side-effect de auto-fill de tasa por fecha vive ACA (no en
 * el store — design.md Open Questions: "el store se mantiene sin I/O a
 * PowerSync").
 */
export function PasoIdentificacion() {
  const { user } = useCurrentUser()
  const {
    nroFactura,
    nroControl,
    cuentaId,
    proveedorId,
    descripcion,
    fecha,
    observaciones,
    tasaInternaManual,
    setIdentificacion,
    setMonto,
  } = useGastoWizardStore()

  const { cuentas, isLoading: loadingCuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const [crearProveedorOpen, setCrearProveedorOpen] = useState(false)

  // Inicializar fecha a hoy la primera vez que se monta el paso, si aun no hay una
  useEffect(() => {
    if (!fecha) setIdentificacion({ fecha: todayStr() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-lookup tasa interna por fecha — mismo comportamiento que gasto-form.tsx
  useEffect(() => {
    if (!fecha || !user?.empresa_id) return
    buscarTasaPorFecha(fecha, user.empresa_id).then((val) => {
      if (val !== null) {
        setMonto({ tasaInterna: val.toFixed(4), tasaInternaManual: false })
      } else {
        setMonto({ tasaInternaManual: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, user?.empresa_id])

  const hoy = todayStr()
  const fechaEsFutura = Boolean(fecha && fecha > hoy)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Nro Factura <span className="font-normal opacity-60">(opcional)</span>
          </label>
          <input
            type="text"
            value={nroFactura}
            onChange={(e) => setIdentificacion({ nroFactura: e.target.value.toUpperCase() })}
            placeholder="00001234"
            className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Nro Control <span className="font-normal opacity-60">(opcional)</span>
          </label>
          <input
            type="text"
            value={nroControl}
            onChange={(e) => setIdentificacion({ nroControl: e.target.value.toUpperCase() })}
            placeholder="00-0000001"
            className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Cuenta Contable <span className="text-destructive">*</span>
        </label>
        <select
          value={cuentaId}
          onChange={(e) => setIdentificacion({ cuentaId: e.target.value })}
          disabled={loadingCuentas}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{loadingCuentas ? 'Cargando...' : 'Seleccionar cuenta'}</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} - {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Proveedor <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <div className="flex gap-2">
          <select
            value={proveedorId}
            onChange={(e) => setIdentificacion({ proveedorId: e.target.value })}
            disabled={loadingProveedores}
            className="flex-1 rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{loadingProveedores ? 'Cargando...' : 'Sin proveedor'}</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rif} - {p.razon_social}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCrearProveedorOpen(true)}
            title="Crear nuevo proveedor"
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-foreground bg-muted border border-border rounded-xl hover:bg-muted/80 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Descripcion <span className="text-destructive">*</span>
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setIdentificacion({ descripcion: e.target.value })}
          placeholder="Descripcion del gasto..."
          rows={2}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Fecha <span className="text-destructive">*</span>
        </label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setIdentificacion({ fecha: e.target.value })}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {fechaEsFutura && (
          <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
            ⚠ La fecha es posterior a hoy. Verifique que sea correcta.
          </div>
        )}
        {tasaInternaManual ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <Warning className="h-3 w-3" />
            Sin tasa registrada para esta fecha — se ingresara manualmente en el paso siguiente
          </p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Info className="h-3 w-3" />
            La tasa interna se detecta automaticamente por esta fecha
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Observaciones <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setIdentificacion({ observaciones: e.target.value })}
          placeholder="Notas adicionales..."
          rows={2}
          className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <ProveedorForm isOpen={crearProveedorOpen} onClose={() => setCrearProveedorOpen(false)} />
    </div>
  )
}
