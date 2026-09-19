import { useState, type ReactNode } from 'react'
import Decimal from 'decimal.js'
import { Plus, Trash } from '@phosphor-icons/react'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs, usdToBs, type DecimalInput } from '@/lib/currency'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'
import { useSesionesActivas } from '@/features/caja/hooks/use-sesiones-caja'
import { formatSesionId } from '@/lib/format'
import { nativoAUsd, calcularRemanenteRefund } from '@/features/ventas/utils/notas-credito-refund'
import type { EgresoTesoreriaLinea } from '../hooks/use-notas-credito'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * Sub-formulario AISLADO de "Devolver dinero -> Tesorería" (nc-refund-
 * tesoreria, Design §File Changes, Spec `notas-credito-admin` Requirement
 * "Saldo disponible visible..."). Cero DB directa: lee cuentas via
 * `useCuentasTesoreria()`, hace el calculo en vivo con las funciones puras
 * de `notas-credito-refund.ts`, y entrega el resultado al llamador via
 * `onConfirm(lineas: EgresoTesoreriaLinea[])` — la escritura real vive
 * exclusivamente en `crearNotaCredito` (motor, Slice 4).
 *
 * UI restructurada a dos selects DEPENDIENTES por linea (Origen -> Cuenta):
 * "Origen" ofrece "Tesoreria" (unica opcion habilitada) y una opcion
 * deshabilitada ("Proximamente") por cada sesion de caja ACTIVA de la
 * empresa (`useSesionesActivas()`, solo-lectura — CERO logica nueva de
 * sesiones, ver Regla de Oro). "Cuenta" depende del Origen elegido: con
 * Tesoreria lista bancos + cajas fuertes combinados (misma fuente
 * `useCuentasTesoreria()` de siempre, ya no se filtra por tipo de antemano
 * — el `destino` del egreso ahora se DERIVA del `tipo` de la cuenta
 * elegida). El branch de Sesion nunca se alcanza hoy (deshabilitada), pero
 * queda el seam para wirearlo despues sin reestructurar de nuevo.
 */

type OrigenEgreso = 'TESORERIA'

interface LineaFormState {
  key: string
  origen: OrigenEgreso
  cuentaId: string
  montoNativo: string
  /** Nota LIBRE y OPCIONAL de esta linea (nro. de transferencia, serial de billete, etc.) — NUNCA bloquea `puedeConfirmar` (UX rework, nc-refund-tesoreria). */
  referencia: string
}

export interface RefundTesoreriaFormProps {
  /** Monto maximo reembolsable (remanente de la NC en USD, ya neto de Step A) — resuelto por el llamador (Slice 6). */
  montoDisponibleUsd: number
  /** `notas_credito.tasa_historica` — usada para convertir cuentas en Bs a USD (Spec "Conversion a tasa historica"). */
  tasaHistorica: number
  onConfirm: (lineas: EgresoTesoreriaLinea[]) => void
  loading?: boolean
  /**
   * Slot de composicion (UX rework, nc-refund-tesoreria): renderizado entre
   * "+ Agregar cuenta" y el resumen "Pendiente por reembolsar" — el modal
   * llamador lo usa para intercalar el campo "Motivo" en esa posicion
   * exacta SIN que este componente conozca nada de notas de credito
   * (sigue aislado, cero acoplamiento con el motor).
   */
  motivoSlot?: ReactNode
  /**
   * Contenedor del portal del `AlertDialog` de confirmacion de saldo a favor
   * (UX rework, nc-refund-tesoreria) — mismo patron que `portalContainer` en
   * `consulta-factura-modal.tsx`/`nota-credito-pos-modal.tsx`: el llamador
   * (`crear-ncr-modal.tsx`) pasa su `dialogRef.current` (el `<dialog>` nativo
   * que ya tiene abierto via `showModal()`) para que el portal de Radix
   * renderice DENTRO de la top layer del navegador — si portalizara al
   * `document.body` por default quedaria tapado por el `<dialog>` nativo.
   */
  portalContainer?: HTMLElement | null
}

/** Mismo patron que `noSpinner` en `gasto-form.tsx`/`producto-form.tsx`/`nivel-precio-form.tsx` (Tailwind arbitrary variants, sin CSS global) — oculta las flechas nativas del input `type="number"` en Chrome/Safari/Firefox. */
const noSpinner =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

/** Tolerancia de redondeo (mismo criterio que `TOLERANCIA` en `notas-credito-refund.ts`/el motor `use-notas-credito.ts`): un remanente por debajo de este umbral no dispara el gate de confirmacion extra porque el motor tampoco escribiria un SAFC real para ese monto. */
const TOLERANCIA_SAFC = '0.01'

let contadorLinea = 0
function nuevaLineaKey(): string {
  contadorLinea += 1
  return `linea-${contadorLinea}`
}

function formatEnMonedaCuenta(monto: DecimalInput, monedaCodigo: string): string {
  return monedaCodigo === 'VES' ? formatBs(monto) : formatUsd(monto)
}

export function RefundTesoreriaForm({
  montoDisponibleUsd,
  tasaHistorica,
  onConfirm,
  loading = false,
  motivoSlot,
  portalContainer,
}: RefundTesoreriaFormProps) {
  const { cuentas } = useCuentasTesoreria()
  const { sesiones: sesionesActivas } = useSesionesActivas()
  const [lineas, setLineas] = useState<LineaFormState[]>([
    { key: nuevaLineaKey(), origen: 'TESORERIA', cuentaId: '', montoNativo: '', referencia: '' },
  ])
  /** Gate de confirmacion extra (UX rework, nc-refund-tesoreria): se abre SOLO cuando confirmar dejaria un remanente > `TOLERANCIA_SAFC` como saldo a favor — un reembolso completo (remanente 0) nunca lo muestra. */
  const [mostrarConfirmSafc, setMostrarConfirmSafc] = useState(false)

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { key: nuevaLineaKey(), origen: 'TESORERIA', cuentaId: '', montoNativo: '', referencia: '' },
    ])
  }

  function quitarLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key))
  }

  function actualizarLinea(key: string, patch: Partial<LineaFormState>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function cuentaPorId(cuentaId: string) {
    return cuentas.find((c) => c.id === cuentaId)
  }

  const lineasUsd: Decimal[] = lineas.map((l) => {
    const cuenta = cuentaPorId(l.cuentaId)
    if (!cuenta || !l.montoNativo) return new Decimal(0)
    const esCuentaBs = cuenta.moneda_codigo === 'VES'
    return nativoAUsd(l.montoNativo, esCuentaBs, tasaHistorica)
  })

  const { sumaUsd, remanenteSafc, excedeTope } = calcularRemanenteRefund(montoDisponibleUsd, lineasUsd)
  /** Equivalente en Bs del pendiente, SIEMPRE a `tasaHistorica` (`notas_credito.tasa_historica`) — nunca a la tasa vigente del sistema (Spec "Conversion a tasa historica"). */
  const remanenteSafcBs = usdToBs(remanenteSafc, tasaHistorica)
  /** true cuando confirmar dejaria un remanente real (por encima de la tolerancia de redondeo) como SAFC — dispara el gate de confirmacion extra (UX rework, nc-refund-tesoreria). Espeja el mismo umbral que usa el motor (`use-notas-credito.ts`) para decidir si escribe el movimiento SAFC. */
  const hayRemanenteSafc = remanenteSafc.gt(TOLERANCIA_SAFC)

  const lineasCompletas = lineas.every((l) => l.cuentaId && l.montoNativo && parseFloat(l.montoNativo) > 0)
  const puedeConfirmar = !loading && lineasCompletas && !excedeTope && sumaUsd.gt(0)

  function handleConfirm() {
    if (!puedeConfirmar) return
    const egresoParams: EgresoTesoreriaLinea[] = lineas.map((l) => ({
      // `destino` se deriva de la cuenta elegida (Select 2), no de un select
      // separado — la cuenta YA sabe si es BANCO o CAJA_FUERTE.
      destino: cuentaPorId(l.cuentaId)?.tipo ?? 'BANCO',
      cuentaId: l.cuentaId,
      montoEnMonedaCuenta: l.montoNativo,
      // Referencia libre por linea (UX rework) — NUNCA bloquea `puedeConfirmar`
      // (ver arriba), se omite del payload cuando el usuario la deja vacia.
      referencia: l.referencia.trim() || undefined,
    }))
    onConfirm(egresoParams)
  }

  /** Handler del boton principal (UX rework, nc-refund-tesoreria): con remanente real, ABRE el gate de confirmacion extra en vez de confirmar directo — un reembolso completo (`hayRemanenteSafc === false`) sigue confirmando de una sola vez, sin dialogo adicional. */
  function handleConfirmClick() {
    if (!puedeConfirmar) return
    if (hayRemanenteSafc) {
      setMostrarConfirmSafc(true)
      return
    }
    handleConfirm()
  }

  /** Confirmacion desde el AlertDialog de saldo a favor — ejecuta la MISMA `handleConfirm()` del boton principal (cero logica de escritura duplicada) y cierra el gate. */
  function handleConfirmarConSafc() {
    handleConfirm()
    setMostrarConfirmSafc(false)
  }

  return (
    <div className="space-y-3">
      {lineas.map((linea) => {
        // Grupo visualmente delimitado (borde + fondo) por linea — en
        // desktop (`sm:`) los 4 controles + el boton de quitar comparten UNA
        // fila via grid-template-columns explicito; en mobile el grid cae a
        // `grid-cols-1` y cada control se apila con su propia etiqueta
        // asociada (`htmlFor`/`id`), sin ambiguedad de a que cuenta
        // pertenece cada Monto/Referencia (Design "responsive per-line
        // grouping", consistente con el patron ya usado en
        // `compra-form.tsx` — `grid-cols-1 sm:grid-cols-[...]`, sin
        // container queries: el ancho del formulario ya sigue el viewport
        // via el `max-w-2xl` del dialog padre).
        return (
          <div
            key={linea.key}
            className="rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_110px_1fr_auto] gap-2 sm:items-end">
              <div>
                <label htmlFor={`origen-${linea.key}`} className="block text-xs font-medium text-muted-foreground mb-1">
                  Origen
                </label>
                <NativeSelect
                  id={`origen-${linea.key}`}
                  aria-label="Origen del reembolso"
                  value={linea.origen}
                  onChange={(e) =>
                    actualizarLinea(linea.key, {
                      origen: e.target.value as OrigenEgreso,
                      cuentaId: '',
                    })
                  }
                >
                  <option value="TESORERIA">Tesoreria</option>
                  {sesionesActivas.map((s) => (
                    <option key={s.id} value={`SESION:${s.id}`} disabled>
                      {s.caja_nombre ? `Sesion ${s.caja_nombre}` : formatSesionId(s.id)} (Proximamente)
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <label htmlFor={`cuenta-${linea.key}`} className="block text-xs font-medium text-muted-foreground mb-1">
                  Cuenta de tesoreria
                </label>
                <NativeSelect
                  id={`cuenta-${linea.key}`}
                  aria-label="Cuenta de tesoreria"
                  value={linea.cuentaId}
                  onChange={(e) => actualizarLinea(linea.key, { cuentaId: e.target.value })}
                >
                  <option value="">Seleccionar cuenta...</option>
                  {linea.origen === 'TESORERIA' &&
                    cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} — {formatEnMonedaCuenta(c.saldo_actual, c.moneda_codigo)} disponible
                      </option>
                    ))}
                  {/* TODO(nc-refund-tesoreria): cuando la Sesion de caja deje de
                      estar deshabilitada en Select 1, agregar aqui el branch que
                      liste las cuentas propias de esa sesion. */}
                </NativeSelect>
              </div>

              <div>
                <label htmlFor={`monto-${linea.key}`} className="block text-xs font-medium text-muted-foreground mb-1">
                  Monto
                </label>
                <input
                  id={`monto-${linea.key}`}
                  type="number"
                  inputMode="decimal"
                  aria-label="Monto"
                  placeholder="0.00"
                  value={linea.montoNativo}
                  onChange={(e) => actualizarLinea(linea.key, { montoNativo: e.target.value })}
                  className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${noSpinner}`}
                />
              </div>

              <div>
                <label htmlFor={`referencia-${linea.key}`} className="block text-xs font-medium text-muted-foreground mb-1">
                  Referencia <span className="font-normal">(opcional)</span>
                </label>
                <input
                  id={`referencia-${linea.key}`}
                  type="text"
                  aria-label="Referencia"
                  placeholder="N° de transferencia, serial..."
                  value={linea.referencia}
                  onChange={(e) => actualizarLinea(linea.key, { referencia: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              {lineas.length > 1 && (
                <button
                  type="button"
                  aria-label="Quitar cuenta"
                  onClick={() => quitarLinea(linea.key)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground justify-self-start sm:justify-self-center"
                >
                  <Trash size={14} />
                </button>
              )}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={agregarLinea}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md border border-dashed hover:bg-muted transition-colors"
      >
        <Plus size={12} /> Agregar cuenta
      </button>

      {motivoSlot}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-sm">
        <span className="text-muted-foreground">Pendiente por reembolsar:</span>
        {/* Bs SIEMPRE a `tasaHistorica` (UX rework, nc-refund-tesoreria) — nunca a la tasa vigente. */}
        <span className="font-semibold">
          {formatUsd(remanenteSafc)} / {formatBs(remanenteSafcBs)}
        </span>
      </div>

      {excedeTope && (
        <p className="text-xs text-destructive">
          El monto ingresado excede el saldo disponible de la nota de credito.
        </p>
      )}

      <button
        type="button"
        disabled={!puedeConfirmar}
        onClick={handleConfirmClick}
        className="w-full px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? 'Procesando...'
          : hayRemanenteSafc
            ? `Confirmar reembolso (queda ${formatUsd(remanenteSafc)} como saldo a favor)`
            : 'Confirmar reembolso'}
      </button>

      {/* Gate de confirmacion extra (UX rework, nc-refund-tesoreria, opcion
          A): SOLO se monta cuando queda un remanente real — un reembolso
          completo confirma directo desde el boton principal, sin este
          dialogo. `container` apunta al `<dialog>` nativo del modal padre
          (mismo patron que `AlertDialogContent container={dialogRef.current}`
          en `producto-form.tsx`) para que el portal de Radix no quede tapado
          por la top layer del `<dialog>`. La escritura real NO cambia: este
          dialogo solo decide CUANDO se llama a `handleConfirm()` (que emite
          el mismo `EgresoTesoreriaLinea[]` de siempre) — el reparto
          egreso/SAFC lo sigue calculando exclusivamente el motor. */}
      <AlertDialog open={mostrarConfirmSafc}>
        <AlertDialogContent container={portalContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>Quedará saldo a favor del cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Quedará {formatUsd(remanenteSafc)} ({formatBs(remanenteSafcBs)} a tasa histórica) como saldo a
              favor del cliente. Esta parte de la nota de crédito NO se reembolsa por tesorería.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMostrarConfirmSafc(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarConSafc}>Confirmar de todas formas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
