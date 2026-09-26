import { useState, useCallback, useEffect, type ReactNode } from 'react'
import Decimal from 'decimal.js'
import { Plus, Trash } from '@phosphor-icons/react'
import { NativeSelect } from '@/components/ui/native-select'
import { formatUsd, formatBs, usdToBs, type DecimalInput } from '@/lib/currency'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'
import { useSesionesActivas, useSaldoSesionCaja } from '@/features/caja/hooks/use-sesiones-caja'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatSesionId } from '@/lib/format'
import {
  nativoAUsd,
  calcularRemanenteRefund,
  excedeSaldoDisponible,
  pendienteRestanteLineaUsd,
  usdACapNativo,
} from '@/features/ventas/utils/notas-credito-refund'
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
 * "Origen" ofrece "Tesoreria" y una opcion por cada sesion de caja ACTIVA de
 * la empresa (`useSesionesActivas()`, solo-lectura — CERO logica nueva de
 * sesiones, ver Regla de Oro), AMBAS habilitadas (Slice 3,
 * nc-cuadre-sesion-fase2 — la opcion de sesion ya no es "Proximamente").
 * "Cuenta" depende del Origen elegido: con Tesoreria lista bancos + cajas
 * fuertes combinados (misma fuente `useCuentasTesoreria()` de siempre, el
 * `destino` del egreso se DERIVA del `tipo` de la cuenta elegida); con una
 * Sesion elegida, lista "Efectivo USD"/"Efectivo Bs" desde
 * `useMetodosPagoActivos()` filtrado `tipo==='EFECTIVO'` (Design §1) — el
 * `value` de cada opcion ES el `metodo_cobro_id` resuelto, cero selector
 * adicional. La moneda de esa linea se guarda explicitamente en
 * `LineaFormState.moneda` a partir de la opcion elegida (no se puede derivar
 * de `cuentaPorId`, que solo conoce cuentas de tesoreria).
 */

type OrigenEgreso = 'TESORERIA' | `SESION:${string}`

function esOrigenSesion(origen: OrigenEgreso): origen is `SESION:${string}` {
  return origen.startsWith('SESION:')
}

function sesionIdDeOrigen(origen: `SESION:${string}`): string {
  return origen.slice('SESION:'.length)
}

/** Origen por defecto de una linea nueva (Slice 4, Design §D5) — `TESORERIA` en modo admin (sin restriccion), `SESION:${id}` cuando el llamador restringe a una sola sesion (POS). */
function origenInicial(restringirOrigenASesionId?: string): OrigenEgreso {
  return restringirOrigenASesionId ? `SESION:${restringirOrigenASesionId}` : 'TESORERIA'
}

interface LineaFormState {
  key: string
  origen: OrigenEgreso
  /** Con Origen=Tesoreria: id de la cuenta de tesoreria. Con Origen=Sesion: id del metodo EFECTIVO elegido (`metodo_cobro_id`). */
  cuentaId: string
  /** Moneda NATIVA elegida para lineas de Sesion (Design §1) — se fija desde la opcion de "Cuenta" elegida, nunca desde `cuentaPorId`. `undefined` para lineas de Tesoreria (la moneda la determina la cuenta). */
  moneda?: 'USD' | 'BS'
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
  /**
   * Restringe el select "Origen" a UNA sola sesion de caja (Slice 4,
   * unificacion-modal-nc, Design §D5) — pensado para POS: el cajero solo
   * puede reembolsar directo desde SU PROPIA sesion activa, nunca desde
   * cualquier otra sesion abierta de la empresa. `undefined` (default,
   * modo admin) preserva el comportamiento actual: TODAS las sesiones
   * activas + Tesoreria, sin restriccion. Cuando esta presente, tambien
   * cambia el origen por defecto de una linea nueva de `'TESORERIA'` a
   * `SESION:${restringirOrigenASesionId}`.
   */
  restringirOrigenASesionId?: string
  /**
   * Oculta la opcion "Tesoreria" del select Origen cuando es `false` (Slice
   * 4, Design §D5) — en POS arranca en `false` hasta que un supervisor
   * autorice via PIN C (`tesoreriaAutorizada`), habilitandola. Default
   * `true`: preserva el comportamiento admin actual (Tesoreria siempre
   * disponible, sin gate).
   */
  mostrarOrigenTesoreria?: boolean
  /**
   * Deshabilita "Confirmar" desde AFUERA (nc-parcial-devolver-dinero, PR1),
   * ANDed junto al resto de `puedeConfirmar` — nunca lo reemplaza. Pensado
   * para PARCIAL: el llamador (modal) usa esto para bloquear el reembolso
   * mientras `SeleccionLineasNc` todavia no tiene lineas validas
   * seleccionadas (mismo espiritu que `origenPendiente` en
   * `SeleccionLineasNc`, pero desde el lado de `RefundTesoreriaForm`).
   * Default `false`: preserva el comportamiento actual (TOTAL, sin cambios).
   */
  disabledExterno?: boolean
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

/**
 * Label de la opcion de sesion en el select "Origen" (Ajuste UX post-QA #1,
 * nc-admin-saldo-disponible-sesion): incluye el nombre del usuario que abrio
 * la sesion (`usuario_apertura_nombre`, ya resuelto por `useSesionesActivas`
 * via JOIN a usuarios — cero query nueva) para desambiguar entre varias
 * sesiones de la MISMA caja. `null` (usuario eliminado o sin resolver) cae
 * al label previo sin guion colgante.
 */
function formatSesionOrigenLabel(s: ReturnType<typeof useSesionesActivas>['sesiones'][number]): string {
  const base = s.caja_nombre ? `Sesion ${s.caja_nombre}` : formatSesionId(s.id)
  return s.usuario_apertura_nombre ? `${base} — ${s.usuario_apertura_nombre}` : base
}

export function RefundTesoreriaForm({
  montoDisponibleUsd,
  tasaHistorica,
  onConfirm,
  loading = false,
  motivoSlot,
  portalContainer,
  restringirOrigenASesionId,
  mostrarOrigenTesoreria = true,
  disabledExterno = false,
}: RefundTesoreriaFormProps) {
  const { cuentas } = useCuentasTesoreria()
  const { sesiones: sesionesActivas } = useSesionesActivas()
  const { metodos: metodosPago } = useMetodosPagoActivos()
  const [lineas, setLineas] = useState<LineaFormState[]>([
    { key: nuevaLineaKey(), origen: origenInicial(restringirOrigenASesionId), cuentaId: '', montoNativo: '', referencia: '' },
  ])
  /** Opciones de sesion ofrecidas en el select Origen (Slice 4, Design §D5) — filtradas a UNA sola sesion cuando el llamador restringe (POS); sin restriccion, TODAS las sesiones activas (modo admin, sin cambios). El guard `haySesionYaNoActiva` de mas abajo sigue usando `sesionesActivas` SIN filtrar — una sesion restringida que sigue activa nunca debe dispararlo. */
  const sesionesParaSelector = restringirOrigenASesionId
    ? sesionesActivas.filter((s) => s.id === restringirOrigenASesionId)
    : sesionesActivas
  /** Gate de confirmacion extra (UX rework, nc-refund-tesoreria): se abre SOLO cuando confirmar dejaria un remanente > `TOLERANCIA_SAFC` como saldo a favor — un reembolso completo (remanente 0) nunca lo muestra. */
  const [mostrarConfirmSafc, setMostrarConfirmSafc] = useState(false)
  /**
   * Reportado por cada `LineaEgresoRefund` via `onExcedeTopeChange`
   * (nc-admin-saldo-disponible-sesion, Design "Lift-state del guard vía
   * callback + useEffect en el hijo"; ampliado en Ajuste UX post-QA #3 para
   * cubrir TAMBIEN el tope de saldo de cuenta de Tesoreria y el tope de
   * pendiente de la NC POR LINEA, no solo el saldo de sesion) — el padre no
   * puede calcular el saldo de sesion inline porque vive en un hook que solo
   * el hijo puede invocar (Rules of Hooks).
   */
  const [excedeTopePorLinea, setExcedeTopePorLinea] = useState<Record<string, boolean>>({})

  /** Metodos EFECTIVO activos por moneda (Design §1) — el `value` de cada opcion "Efectivo USD"/"Efectivo Bs" ES este `id`. Si no existe un metodo EFECTIVO activo para una moneda, esa opcion simplemente no se renderiza (mismo patron defensivo que INGRESO_MANUAL/EGRESO_MANUAL/AVANCE/PRESTAMO). */
  const efectivoUsd = metodosPago.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'USD')
  const efectivoBs = metodosPago.find((m) => m.tipo === 'EFECTIVO' && m.moneda === 'BS')

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { key: nuevaLineaKey(), origen: origenInicial(restringirOrigenASesionId), cuentaId: '', montoNativo: '', referencia: '' },
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

  /** Guard de no-op (mismo patron que `rerender-functional-setstate`) — evita que el `useEffect` del hijo dispare un loop de renders cuando el valor reportado no cambio. */
  const handleExcedeTopeChange = useCallback((key: string, excede: boolean) => {
    setExcedeTopePorLinea((prev) => (prev[key] === excede ? prev : { ...prev, [key]: excede }))
  }, [])

  const lineasUsd: Decimal[] = lineas.map((l) => {
    if (esOrigenSesion(l.origen)) {
      // Moneda desde la SELECCION del usuario (LineaFormState.moneda), NUNCA
      // desde `cuentaPorId` — esa funcion solo conoce cuentas de tesoreria,
      // no metodos de cobro (Design §1).
      if (!l.cuentaId || !l.montoNativo || !l.moneda) return new Decimal(0)
      return nativoAUsd(l.montoNativo, l.moneda === 'BS', tasaHistorica)
    }
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

  /** Guard client-side de Spec Scenario "Sesion pasa a cerrada entre seleccion y confirmacion" (notas-credito-admin): `sesionesActivas` es una query reactiva — si la sesion elegida deja de estar ABIERTA, desaparece de este array en el siguiente render SIN que el usuario haya tocado nada. Se rechaza aqui, antes de que `handleConfirm` pueda emitir la linea (que a su vez dispararia el guard duplicado del motor, `escribirEgresoSesionCajaEnTx` — esta es la capa de UI, ver Design §3). */
  const haySesionYaNoActiva = lineas.some((l) => {
    if (!esOrigenSesion(l.origen)) return false
    const sesionId = sesionIdDeOrigen(l.origen)
    return !sesionesActivas.some((s) => s.id === sesionId)
  })

  const lineasCompletas = lineas.every((l) => l.cuentaId && l.montoNativo && parseFloat(l.montoNativo) > 0)
  /**
   * true si CUALQUIER linea excede su tope efectivo — pendiente de la NC
   * POR LINEA o saldo disponible del origen elegido (sesion o cuenta de
   * Tesoreria) — reportado por cada `LineaEgresoRefund` via
   * `onExcedeTopeChange` (Ajuste UX post-QA #3, revertido a input LIBRE: el
   * campo Monto acepta cualquier valor, este flag es el UNICO gate real que
   * deshabilita `puedeConfirmar` cuando algun monto queda por encima de su
   * tope — el mensaje rojo pegado al input de cada linea explica el motivo,
   * ver `LineaEgresoRefund` mas abajo).
   */
  const excedeAlgunTopePorLinea = lineas.some((l) => excedeTopePorLinea[l.key])
  const puedeConfirmar =
    !loading &&
    !disabledExterno &&
    lineasCompletas &&
    !excedeTope &&
    sumaUsd.gt(0) &&
    !haySesionYaNoActiva &&
    !excedeAlgunTopePorLinea

  function handleConfirm() {
    if (!puedeConfirmar) return
    const egresoParams: EgresoTesoreriaLinea[] = lineas.map((l) => {
      const referencia = l.referencia.trim() || undefined
      if (esOrigenSesion(l.origen)) {
        return {
          destino: 'SESION_CAJA',
          sesionCajaId: sesionIdDeOrigen(l.origen),
          // El `value` de la opcion de Cuenta YA ES el metodo_cobro_id
          // resuelto (Design §1) — cero selector adicional.
          metodoCobroId: l.cuentaId,
          moneda: l.moneda ?? 'USD',
          montoEnMonedaCuenta: l.montoNativo,
          referencia,
        }
      }
      return {
        // `destino` se deriva de la cuenta elegida (Select 2), no de un select
        // separado — la cuenta YA sabe si es BANCO o CAJA_FUERTE.
        destino: cuentaPorId(l.cuentaId)?.tipo ?? 'BANCO',
        cuentaId: l.cuentaId,
        montoEnMonedaCuenta: l.montoNativo,
        // Referencia libre por linea (UX rework) — NUNCA bloquea `puedeConfirmar`
        // (ver arriba), se omite del payload cuando el usuario la deja vacia.
        referencia,
      }
    })
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
      {lineas.map((linea, idx) => {
        // Ajuste UX post-QA #3 (Opcion A): pendiente restante de la NC para
        // ESTA linea especifica = tope total menos lo que YA consumen las
        // OTRAS lineas (nunca la suma total, que descontaria tambien el
        // aporte propio de esta linea). Se recalcula en cada render —
        // agregar/editar cualquier otra linea desplaza este tope en vivo.
        const propiaUsd = lineasUsd[idx] ?? new Decimal(0)
        const pendienteRestanteUsd = pendienteRestanteLineaUsd(montoDisponibleUsd, sumaUsd.minus(propiaUsd))
        return (
          <LineaEgresoRefund
            key={linea.key}
            linea={linea}
            cuentas={cuentas}
            sesionesActivas={sesionesParaSelector}
            mostrarTesoreria={mostrarOrigenTesoreria}
            efectivoUsd={efectivoUsd}
            efectivoBs={efectivoBs}
            puedeQuitar={lineas.length > 1}
            tasaHistorica={tasaHistorica}
            pendienteRestanteUsd={pendienteRestanteUsd}
            onActualizar={(patch) => actualizarLinea(linea.key, patch)}
            onQuitar={() => quitarLinea(linea.key)}
            onExcedeTopeChange={handleExcedeTopeChange}
          />
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

      {/* Ajuste UX post-QA #2: los mensajes de "excede pendiente"/"excede
          saldo disponible del origen" se movieron a CADA linea, pegados al
          input Monto que corresponde (ver `LineaEgresoRefund` mas abajo) —
          `excedeTope` (NC-level, agregado) y `excedeAlgunTopePorLinea`
          (por-linea) siguen gateando `puedeConfirmar` arriba, solo cambio
          DONDE se muestra el texto explicativo. */}

      {haySesionYaNoActiva && (
        <p className="text-xs text-destructive">
          La sesion de caja elegida ya no esta activa. Selecciona otra sesion para continuar.
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
            <AlertDialogAction disabled={loading} onClick={handleConfirmarConSafc}>Confirmar de todas formas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface LineaEgresoRefundProps {
  linea: LineaFormState
  cuentas: ReturnType<typeof useCuentasTesoreria>['cuentas']
  sesionesActivas: ReturnType<typeof useSesionesActivas>['sesiones']
  /** `false` oculta la opcion "Tesoreria" del select Origen (Slice 4, Design §D5) — ver `RefundTesoreriaFormProps.mostrarOrigenTesoreria`. */
  mostrarTesoreria: boolean
  efectivoUsd: ReturnType<typeof useMetodosPagoActivos>['metodos'][number] | undefined
  efectivoBs: ReturnType<typeof useMetodosPagoActivos>['metodos'][number] | undefined
  puedeQuitar: boolean
  /** `notas_credito.tasa_historica` (Ajuste UX post-QA #3) — necesaria para convertir `pendienteRestanteUsd` (USD) a la moneda NATIVA de esta linea. */
  tasaHistorica: number
  /** Pendiente restante de la NC (USD) disponible para ESTA linea especifica, ya neto de lo que consumen las OTRAS lineas (Ajuste UX post-QA #3) — computado por el padre via `pendienteRestanteLineaUsd`. */
  pendienteRestanteUsd: Decimal
  onActualizar: (patch: Partial<LineaFormState>) => void
  onQuitar: () => void
  /** Reporta si ESTA linea excede su tope efectivo (pendiente de la NC o saldo disponible del origen) — Ajuste UX post-QA #3, ampliado desde `onExcedeSaldoSesionChange` para cubrir tambien cuentas de Tesoreria. */
  onExcedeTopeChange: (key: string, excede: boolean) => void
}

/**
 * Extraida de `lineas.map(...)` inline (nc-admin-saldo-disponible-sesion,
 * Design "Bloqueo arquitectonico") — vivir INLINE dentro del `.map` del
 * padre impedia llamar `useSaldoSesionCaja(sesionCajaId)` ahi (Rules of
 * Hooks: un `sesionCajaId` que varia por iteracion). Componente de nivel de
 * modulo (no exportado fuera del archivo), definido fuera del render del
 * padre (`rerender-no-inline-components`, vercel-react-best-practices). El
 * padre sigue dueño de `lineas` (state) y de toda la logica de agregacion
 * (`calcularRemanenteRefund`, `handleConfirm*`, `puedeConfirmar`) — este
 * componente NO conoce `onConfirm`, `montoDisponibleUsd`, `tasaHistorica` ni
 * el resto de las lineas (Design "extraccion quirurgica").
 */
function LineaEgresoRefund({
  linea,
  cuentas,
  sesionesActivas,
  mostrarTesoreria,
  efectivoUsd,
  efectivoBs,
  puedeQuitar,
  tasaHistorica,
  pendienteRestanteUsd,
  onActualizar,
  onQuitar,
  onExcedeTopeChange,
}: LineaEgresoRefundProps) {
  // Argumento condicional a un hook llamado incondicionalmente — valido
  // para Rules of Hooks (Design "Bloqueo arquitectonico"). Con
  // Origen=Tesoreria, `sesionCajaId` es `undefined` y el hook devuelve
  // saldo 0 sin disparar queries (`useSaldoSesionCaja`, id vacio).
  const { saldoUsd, saldoBs, isLoading: isLoadingSaldo } = useSaldoSesionCaja(
    esOrigenSesion(linea.origen) ? sesionIdDeOrigen(linea.origen) : undefined
  )

  const esSesion = esOrigenSesion(linea.origen)
  const cuenta = !esSesion ? cuentas.find((c) => c.id === linea.cuentaId) : undefined

  // Moneda NATIVA de esta linea, para convertir el tope de USD (pendiente
  // de la NC) a esa moneda (Ajuste UX post-QA #3) — mismo criterio que el
  // resto del archivo: Sesion usa `linea.moneda` (eleccion explicita del
  // usuario), Tesoreria usa `cuenta.moneda_codigo`.
  const esNativaBs = esSesion ? linea.moneda === 'BS' : cuenta?.moneda_codigo === 'VES'

  // Saldo disponible del origen elegido, en la moneda NATIVA de la linea.
  // `null` = origen todavia sin resolver un saldo conocido (Tesoreria sin
  // Cuenta elegida, o saldo de sesion aun en `isLoading`) — en ese caso
  // el guard de abajo no compara contra un origen que ni siquiera se
  // eligio.
  // Tesoreria: SOLO el efectivo (CAJA_FUERTE) tiene tope — no puede quedar
  // negativo (es fisico). Los BANCOS se permiten sobregirar, asi que NO se
  // capan (disponibleNativo = null). Regla de negocio: "los bancos se podran
  // sobregirar y el efectivo no".
  const disponibleNativo: Decimal | null = esSesion
    ? isLoadingSaldo
      ? null
      : new Decimal(linea.moneda === 'BS' ? saldoBs : saldoUsd)
    : cuenta && cuenta.tipo === 'CAJA_FUERTE'
      ? new Decimal(cuenta.saldo_actual)
      : null

  const pendienteNativo = usdACapNativo(pendienteRestanteUsd, esNativaBs, tasaHistorica)

  // VALIDATE gatea sobre `isLoading` (Design "Guard de validacion NO gatea
  // por isLoading, salvo la comparacion en si") — evita un falso positivo
  // de "excede" mientras `saldoUsd`/`saldoBs` transitan por 0 al montar el
  // hook. El DISPLAY del label (abajo) NO gatea, es cosmetico.
  const excedePendiente = !!linea.montoNativo && excedeSaldoDisponible(linea.montoNativo, pendienteNativo)
  const excedeDisponibleOrigen =
    !!linea.montoNativo && disponibleNativo !== null && excedeSaldoDisponible(linea.montoNativo, disponibleNativo)
  const excedeAlgunTope = excedePendiente || excedeDisponibleOrigen

  useEffect(() => {
    onExcedeTopeChange(linea.key, excedeAlgunTope)
  }, [linea.key, excedeAlgunTope, onExcedeTopeChange])

  return (
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
    <div className="rounded-lg border border-border bg-muted/20 p-3">
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
              onActualizar({
                origen: e.target.value as OrigenEgreso,
                // Cambiar de Origen invalida la Cuenta elegida (un
                // metodo_cobro_id de Sesion no es una cuentaId de
                // Tesoreria, y viceversa) — nunca arrastrar un valor
                // incompatible con el nuevo Origen.
                cuentaId: '',
                moneda: undefined,
              })
            }
          >
            {mostrarTesoreria && <option value="TESORERIA">Tesoreria</option>}
            {sesionesActivas.map((s) => (
              <option key={s.id} value={`SESION:${s.id}`}>
                {formatSesionOrigenLabel(s)}
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
            onChange={(e) => {
              const cuentaId = e.target.value
              if (esOrigenSesion(linea.origen)) {
                // La moneda se fija desde CUAL opcion se eligio (id de
                // `efectivoUsd`/`efectivoBs`), no desde `cuentaPorId`
                // (Design §1) — ese id nunca existe en `cuentas`.
                const moneda = cuentaId === efectivoBs?.id ? 'BS' : 'USD'
                onActualizar({ cuentaId, moneda })
              } else {
                onActualizar({ cuentaId })
              }
            }}
          >
            <option value="">Seleccionar cuenta...</option>
            {linea.origen === 'TESORERIA' &&
              cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {formatEnMonedaCuenta(c.saldo_actual, c.moneda_codigo)} disponible
                </option>
              ))}
            {esOrigenSesion(linea.origen) && (
              <>
                {efectivoUsd && (
                  <option value={efectivoUsd.id}>Efectivo USD — {formatUsd(saldoUsd)} disponible</option>
                )}
                {efectivoBs && (
                  <option value={efectivoBs.id}>Efectivo Bs — {formatBs(saldoBs)} disponible</option>
                )}
              </>
            )}
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
            aria-invalid={excedeAlgunTope}
            placeholder="0.00"
            value={linea.montoNativo}
            onChange={(e) => onActualizar({ montoNativo: e.target.value })}
            className={`w-full rounded-md border ${excedeAlgunTope ? 'border-destructive' : 'border-input'} bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${noSpinner}`}
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
            onChange={(e) => onActualizar({ referencia: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {puedeQuitar && (
          <button
            type="button"
            aria-label="Quitar cuenta"
            onClick={onQuitar}
            className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground justify-self-start sm:justify-self-center"
          >
            <Trash size={14} />
          </button>
        )}
      </div>

      {/* Ajuste UX (post-QA screenshot, nc-admin-saldo-disponible-sesion):
          el mensaje vive FUERA del grid de campos, como fila propia de
          ancho completo debajo de Origen/Cuenta/Monto/Referencia de ESTA
          linea — evitaba quedar apretado dentro de la columna angosta de
          Monto (110px). Al ser un sibling de bloque fuera del `grid`, ocupa
          naturalmente el 100% del ancho del contenedor de la linea sin
          necesitar `col-span` (no hay necesidad de que el mensaje participe
          del grid-template-columns). El campo Monto acepta CUALQUIER valor
          tecleado, nunca rechaza el keystroke ni clampea en silencio — este
          mensaje es el UNICO mecanismo que comunica el estado invalido
          cuando el monto excede su tope; junto con `aria-invalid` y
          `puedeConfirmar` (arriba) forman el contrato completo: input libre
          + mensaje rojo + boton deshabilitado, sin bloquear el tipeo.
          Prioriza el motivo "pendiente" sobre "disponible del origen" si
          ambos aplican a la vez (evita mostrar 2 mensajes apilados por la
          misma linea). */}
      {excedePendiente && (
        <p className="mt-2 text-xs text-destructive">El monto ingresado excede el pendiente por reembolsar.</p>
      )}
      {!excedePendiente && excedeDisponibleOrigen && (
        <p className="mt-2 text-xs text-destructive">
          {esSesion
            ? 'El monto ingresado excede el saldo disponible de la sesion de caja elegida.'
            : 'El monto ingresado excede el saldo disponible de la cuenta de tesoreria elegida.'}
        </p>
      )}
    </div>
  )
}
