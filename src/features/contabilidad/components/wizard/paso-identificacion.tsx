import { useEffect, useState } from 'react'
import { UserPlus, Warning, Info } from '@phosphor-icons/react'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { ProveedorForm } from '@/features/proveedores/components/proveedor-form'
import { SelectSheet } from '@/components/shared/select-sheet'
import { Button } from '@/components/ui/button'
import { db } from '@/core/db/powersync/db'
import { todayStr } from '@/lib/dates'

const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/**
 * Busca la tasa interna por fecha exacta en `tasas_cambio`.
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
 * Paso 1 del wizard de gasto (mobile fullscreen) — Identificacion.
 *
 * Orden de campos:
 *   1. Selector de proveedor + boton crear proveedor (misma linea)
 *   2. Nro Factura | Nro Control (grid 2 col)
 *   3. Fecha | Tasa Interna (grid 2 col)
 *   4. Checkbox tasa paralela + input condicional
 *
 * La cuenta contable se movio al Paso 2. Descripcion y Observaciones
 * tambien viven en el Paso 2.
 */
export function PasoIdentificacion() {
  const { user } = useCurrentUser()
  const {
    nroFactura,
    nroControl,
    proveedorId,
    fecha,
    usaTasaParalela,
    tasaInterna,
    tasaInternaManual,
    tasaProveedor,
    setIdentificacion,
    setMonto,
  } = useGastoWizardStore()

  const { proveedores, isLoading: loadingProveedores } = useProveedores()
  const [crearProveedorOpen, setCrearProveedorOpen] = useState(false)

  // Inicializar fecha a hoy la primera vez que se monta el paso
  useEffect(() => {
    if (!fecha) setIdentificacion({ fecha: todayStr() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-lookup tasa interna por fecha
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
    <div className="space-y-4 pt-2">
      {/* ── Proveedor (SelectSheet con searchbar) + crear proveedor ── */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Proveedor <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <SelectSheet
          value={proveedorId}
          onChange={(val) => setIdentificacion({ proveedorId: val })}
          disabled={loadingProveedores}
          title="Seleccionar proveedor"
          placeholder={loadingProveedores ? 'Cargando...' : 'Sin proveedor'}
          searchPlaceholder="Buscar por RIF o razón social..."
          emptyMessage="No se encontraron proveedores"
          options={proveedores.map((p) => ({
            value: p.id,
            label: p.razon_social,
            sublabel: p.rif,
            keywords: `${p.rif} ${p.razon_social}`,
          }))}
          footerAction={(close) => (
            <Button
              type="button"
              variant="secondary"
              className="w-full h-11 rounded-xl gap-2"
              onClick={() => {
                close()
                setCrearProveedorOpen(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Crear nuevo proveedor
            </Button>
          )}
        />
      </div>

      {/* ── Nro Factura | Nro Control ── */}
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

      {/* ── Fecha | Tasa Interna ── */}
      <div className="grid grid-cols-2 gap-3">
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
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              ⚠ Fecha posterior a hoy
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              Tasa (Bs/USD) <span className="text-destructive">*</span>
            </label>
            {tasaInternaManual ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Warning className="h-3 w-3" />
                Manual
              </span>
            ) : (
              tasaInterna && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                  <Info className="h-3 w-3" />
                  Auto
                </span>
              )
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={tasaInterna}
            onChange={(e) => setMonto({ tasaInterna: e.target.value, tasaInternaManual: true })}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="0.0000"
            className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
          />
        </div>
      </div>

      {/* ── Checkbox tasa paralela + input condicional ── */}
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={usaTasaParalela}
            onChange={(e) =>
              setMonto({
                usaTasaParalela: e.target.checked,
                tasaProveedor: e.target.checked ? tasaProveedor : '',
              })
            }
            className="h-4 w-4 accent-primary rounded"
          />
          <span className="text-sm text-foreground">La factura usa tasa paralela</span>
        </label>

        {usaTasaParalela && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tasa del Proveedor (Bs/USD) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasaProveedor}
              onChange={(e) => setMonto({ tasaProveedor: e.target.value })}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              placeholder="0.0000"
              className={`w-full rounded-xl border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${noSpinner}`}
            />
          </div>
        )}
      </div>

      <ProveedorForm
        isOpen={crearProveedorOpen}
        onClose={() => setCrearProveedorOpen(false)}
        presentation="sheet"
      />
    </div>
  )
}
