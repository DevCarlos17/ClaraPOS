import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { useGastoBorradorStore } from '@/features/contabilidad/stores/gasto-borrador-store'
import {
  calcIvaFactura,
  calcMontoProveedorUsd,
  calcTotalFactura,
  type MonedaFacturaGasto,
  type TipoImpuestoGasto,
} from '@/features/contabilidad/lib/gasto-totales'
import { localNow } from '@/lib/dates'

export interface PagoWizardGasto {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string
  moneda: 'USD' | 'BS'
  monto: string
  referencia: string
}

function nuevoPagoWizard(): PagoWizardGasto {
  return {
    id: uuidv4(),
    metodo_cobro_id: '',
    banco_empresa_id: '',
    moneda: 'USD',
    monto: '',
    referencia: '',
  }
}

/**
 * Perspectiva proveedor de un abono: BS convertido a tasa proveedor (si
 * aplica tasa paralela) o tasa interna, USD tal cual. Mismo criterio que
 * `gasto-form.tsx::abonoPagoProveedorUsd` — se mantiene local a este store
 * (en vez de gasto-totales.ts) porque solo lo consume la validez del paso 3
 * del wizard; W2a extrajo a gasto-totales.ts unicamente lo necesario para
 * el refactor de gasto-form.tsx (ver tasks.md 2a.1-2a.4).
 */
function abonoPagoProveedorUsd(
  pago: PagoWizardGasto,
  ctx: { usaTasaParalela: boolean; tasaInternaNum: number; tasaProveedorNum: number }
): number {
  const val = parseFloat(pago.monto) || 0
  if (pago.moneda === 'USD') return val
  const tasaRef = ctx.usaTasaParalela && ctx.tasaProveedorNum > 0 ? ctx.tasaProveedorNum : ctx.tasaInternaNum
  return tasaRef > 0 ? val / tasaRef : 0
}

interface GastoWizardState {
  step: 1 | 2 | 3

  // Paso 1 — Identificación
  nroFactura: string
  nroControl: string
  cuentaId: string
  proveedorId: string
  descripcion: string
  fecha: string
  observaciones: string

  // Paso 2 — Monto
  monedaFactura: MonedaFacturaGasto
  usaTasaParalela: boolean
  tasaInterna: string
  /**
   * true = el usuario sobreescribio manualmente la tasa interna (o no hay
   * tasa registrada para la fecha elegida); false = valor auto-detectado por
   * fecha. Mismo campo que `gasto-form.tsx`/`GastoBorradorData.tasaInternaManual`
   * — evita que `guardarDraft` pise una tasa manual al persistir el borrador
   * (WARNING detectado en revision de W2a: antes se hardcodeaba `false`).
   */
  tasaInternaManual: boolean
  tasaProveedor: string
  tipoImpuesto: TipoImpuestoGasto
  montoFactura: string
  porcentajeIva: string

  // Paso 3 — Pagos
  pagos: PagoWizardGasto[]
  /**
   * Destino del abono (CAJA si hay sesion abierta, TESORERIA si no). Estado
   * puro en el store; el I/O que lo detecta (query a `sesiones_caja`) vive en
   * `paso-pagos.tsx` (design.md Open Questions: "el store se mantiene sin I/O
   * a PowerSync"), que llama `setDestinoCobro` con el resultado.
   */
  destinoCobro: 'CAJA' | 'TESORERIA'
  sesionActivaId: string | null

  // Sheet + navegación
  sheetOpen: boolean
  openSheet: () => void
  closeSheet: () => void
  setStep: (step: 1 | 2 | 3) => void

  setIdentificacion: (
    patch: Partial<
      Pick<
        GastoWizardState,
        'nroFactura' | 'nroControl' | 'cuentaId' | 'proveedorId' | 'descripcion' | 'fecha' | 'observaciones'
      >
    >
  ) => void
  setMonto: (
    patch: Partial<
      Pick<
        GastoWizardState,
        | 'monedaFactura'
        | 'usaTasaParalela'
        | 'tasaInterna'
        | 'tasaInternaManual'
        | 'tasaProveedor'
        | 'montoFactura'
        | 'tipoImpuesto'
        | 'porcentajeIva'
      >
    >
  ) => void

  agregarPago: () => void
  actualizarPago: (id: string, campo: keyof Omit<PagoWizardGasto, 'id'>, valor: string) => void
  eliminarPago: (id: string) => void
  setDestinoCobro: (patch: { destinoCobro: 'CAJA' | 'TESORERIA'; sesionActivaId: string | null }) => void

  // Validez por paso — usados por el indicador y por canGoNext
  isStep1Valid: () => boolean
  isStep2Valid: () => boolean
  isStep3Valid: () => boolean

  // Draft — delega en useGastoBorradorStore (misma clave que desktop,
  // 'clarapos-gasto-borrador'); este store NO abre su propia clave de
  // localStorage, evitando dos borradores en paralelo (ver design.md
  // decisión #2: un borrador iniciado en mobile es resumible en desktop).
  hidratarDesdeBorrador: () => boolean
  guardarDraft: (empresaId: string) => void
  reset: () => void
}

const initialState = {
  step: 1 as const,
  nroFactura: '',
  nroControl: '',
  cuentaId: '',
  proveedorId: '',
  descripcion: '',
  fecha: '',
  observaciones: '',
  monedaFactura: 'USD' as MonedaFacturaGasto,
  usaTasaParalela: false,
  tasaInterna: '',
  tasaInternaManual: false,
  tasaProveedor: '',
  tipoImpuesto: 'Exento' as TipoImpuestoGasto,
  montoFactura: '',
  porcentajeIva: '',
  pagos: [] as PagoWizardGasto[],
  destinoCobro: 'TESORERIA' as 'CAJA' | 'TESORERIA',
  sesionActivaId: null as string | null,
}

export const useGastoWizardStore = create<GastoWizardState>()((set, get) => ({
  ...initialState,
  sheetOpen: false,

  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  setStep: (step) => set({ step }),

  setIdentificacion: (patch) => set(patch),
  setMonto: (patch) => set(patch),

  agregarPago: () => set((state) => ({ pagos: [...state.pagos, nuevoPagoWizard()] })),

  eliminarPago: (id) => set((state) => ({ pagos: state.pagos.filter((p) => p.id !== id) })),

  actualizarPago: (id, campo, valor) =>
    set((state) => ({
      pagos: state.pagos.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)),
    })),

  setDestinoCobro: (patch) => set(patch),

  isStep1Valid: () => {
    // Paso 1 (Identificacion): fecha obligatoria + tasa interna obligatoria
    // + tasa proveedor si usa tasa paralela. Proveedor/nroFactura/nroControl
    // son opcionales. Cuenta contable se movio al Paso 2.
    const { fecha, tasaInterna, usaTasaParalela, tasaProveedor } = get()
    const tasaInternaNum = parseFloat(tasaInterna) || 0
    const tasaProveedorNum = parseFloat(tasaProveedor) || 0
    if (!fecha || tasaInternaNum <= 0) return false
    if (usaTasaParalela && tasaProveedorNum <= 0) return false
    return true
  },

  isStep2Valid: () => {
    // Paso 2 (Monto): cuenta contable + monto + tasa interna ya validada en
    // paso 1 pero se re-chequea por si el usuario llega sin pasar por paso 1.
    const { cuentaId, montoFactura, tasaInterna, usaTasaParalela, tasaProveedor, tipoImpuesto, porcentajeIva } = get()
    const montoFacturaNum = parseFloat(montoFactura) || 0
    const tasaInternaNum = parseFloat(tasaInterna) || 0
    const tasaProveedorNum = parseFloat(tasaProveedor) || 0
    const porcentajeIvaNum = parseFloat(porcentajeIva) || 0

    if (!cuentaId) return false
    if (montoFacturaNum <= 0 || tasaInternaNum <= 0) return false
    if (usaTasaParalela && tasaProveedorNum <= 0) return false
    if (tipoImpuesto === 'Gravable' && porcentajeIvaNum <= 0) return false
    return true
  },

  isStep3Valid: () => {
    // Los pagos son opcionales — el saldo no cubierto va a CxP (mismo
    // criterio que gasto-form.tsx). Pero, igual que
    // gasto-form.tsx::pagosSuperanTotal, los abonos NUNCA pueden superar el
    // total de la factura.
    const {
      montoFactura,
      porcentajeIva,
      tipoImpuesto,
      monedaFactura,
      usaTasaParalela,
      tasaInterna,
      tasaProveedor,
      pagos,
    } = get()
    const montoFacturaNum = parseFloat(montoFactura) || 0
    const porcentajeIvaNum = parseFloat(porcentajeIva) || 0
    const tasaInternaNum = parseFloat(tasaInterna) || 0
    const tasaProveedorNum = parseFloat(tasaProveedor) || 0

    const ivaFactura = calcIvaFactura(montoFacturaNum, porcentajeIvaNum, tipoImpuesto)
    const totalFacturaNum = calcTotalFactura(montoFacturaNum, ivaFactura)
    const montoProveedorUsd = calcMontoProveedorUsd({
      totalFacturaNum,
      monedaFactura,
      usaTasaParalela,
      tasaInternaNum,
      tasaProveedorNum,
    })

    if (montoProveedorUsd === null || montoProveedorUsd <= 0) return true

    const totalAbonadoProveedorUsd = pagos.reduce(
      (s, p) => s + abonoPagoProveedorUsd(p, { usaTasaParalela, tasaInternaNum, tasaProveedorNum }),
      0
    )
    return totalAbonadoProveedorUsd <= montoProveedorUsd + 0.01
  },

  hidratarDesdeBorrador: () => {
    const { borrador } = useGastoBorradorStore.getState()
    if (!borrador) return false
    set({
      nroFactura: borrador.nroFactura,
      nroControl: borrador.nroControl,
      cuentaId: borrador.cuentaId,
      proveedorId: borrador.proveedorId,
      descripcion: borrador.descripcion,
      fecha: borrador.fecha,
      monedaFactura: borrador.monedaFactura,
      usaTasaParalela: borrador.usaTasaParalela,
      tasaInterna: borrador.tasaInterna,
      tasaInternaManual: borrador.tasaInternaManual,
      tasaProveedor: borrador.tasaProveedor,
      montoFactura: borrador.montoFactura,
      pagos: borrador.pagos.map((p) => ({ ...p })),
      observaciones: borrador.observaciones,
    })
    return true
  },

  guardarDraft: (empresaId) => {
    const state = get()
    useGastoBorradorStore.getState().guardar({
      nroFactura: state.nroFactura,
      nroControl: state.nroControl,
      cuentaId: state.cuentaId,
      proveedorId: state.proveedorId,
      descripcion: state.descripcion,
      fecha: state.fecha,
      monedaFactura: state.monedaFactura,
      usaTasaParalela: state.usaTasaParalela,
      tasaInterna: state.tasaInterna,
      tasaInternaManual: state.tasaInternaManual,
      tasaProveedor: state.tasaProveedor,
      montoFactura: state.montoFactura,
      pagos: state.pagos.map((p) => ({ ...p })),
      observaciones: state.observaciones,
      empresaId,
      ultimaActualizacion: localNow(),
    })
  },

  reset: () => set({ ...initialState, sheetOpen: false }),
}))
