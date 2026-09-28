import { create } from 'zustand'
import type { DecisionPvp } from '@/features/inventario/lib/compra-precio-gating'
import type { ConceptoCargo } from '@/features/inventario/lib/compra-lineas-cargo'

export type MonedaCompraWizard = 'USD' | 'BS'
export type TipoImpuestoLineaWizard = 'Gravable' | 'Exento' | 'Exonerado'

const STORAGE_KEY = 'compra_wizard_draft'

/**
 * TEMPORAL: mismo shape que la interfaz privada `PvpNivelUI` de
 * `compra-form.tsx`. Segun design.md, este tipo se "mueve" a
 * `compra-pvp-decision.ts` en W4a (aun no existe — ver tasks.md 3a.5: "PVP
 * actions stubbed as no-ops en este PR, do NOT wire to compra-pvp-decision.ts
 * yet"). Cuando W4a cree ese modulo, reemplazar este `export interface` por
 * un `import type` desde alli, sin tocar los campos ya consumidos aqui.
 */
export interface PvpNivelUI {
  orden: number
  nombre: string
  campo: 'precio_venta_usd' | 'precio_mayor_usd' | 'precio_especial_usd'
  pvp_actual_usd: number
  pvp_input: string
  margen_input: string
  violado: boolean
  decision: DecisionPvp
  margen_si_mantiene_pvp: string
}

/** Subconjunto de `LineaUI` (compra-form.tsx) relevante para el wizard mobile. */
export interface LineaWizardCompra {
  producto_id: string
  codigo: string
  nombre: string
  unidad_seleccionada_id: string | null
  factor: number
  cantidad_input: number
  costo_actual: number
  nuevo_costo_raw: string
  costo_input: number
  tipo_impuesto: TipoImpuestoLineaWizard
  impuesto_pct: number
  maneja_lotes: number
  lote_nro: string
  lote_fecha_fab: string
  lote_fecha_venc: string
  costo_usd_actual: string
  precio_venta_usd: string
  precio_mayor_usd: string
  precio_especial_usd: string
  pvp_niveles: PvpNivelUI[]
}

export interface CargoWizard {
  id: string
  concepto: ConceptoCargo
  monto_input: string
  porcentaje_iva: 0 | 16
}

/** Mismo shape que `PagoUI` (compra-form.tsx) — sin `id`, se opera por indice (igual que design.md). */
export interface PagoWizardCompra {
  metodo_cobro_id: string
  metodo_nombre: string
  moneda: MonedaCompraWizard
  monto: number
  banco_empresa_id: string | null
  referencia?: string
}

function nuevoCargoWizard(concepto: ConceptoCargo): CargoWizard {
  return { id: crypto.randomUUID(), concepto, monto_input: '', porcentaje_iva: 0 }
}

function nuevoPagoWizard(): PagoWizardCompra {
  return { metodo_cobro_id: '', metodo_nombre: '', moneda: 'USD', monto: 0, banco_empresa_id: null }
}

interface CompraWizardState {
  step: 1 | 2 | 3

  // Paso 1 — Cabecera
  fechaFactura: string
  nroFactura: string
  nroControl: string
  proveedorId: string
  moneda: MonedaCompraWizard
  usaTasaParalela: boolean
  tasaInterna: number
  /**
   * true = el usuario sobreescribio manualmente la tasa interna (o no hay
   * tasa registrada para la fecha elegida). Mismo campo que
   * `GastoWizardState.tasaInternaManual` — se agrega desde el inicio (a
   * diferencia de gasto-wizard-store.ts, que lo sumo recien en W2b) para
   * evitar repetir el WARNING detectado en esa revision (guardarDraft
   * pisando una tasa manual con `false` hardcodeado).
   */
  tasaInternaManual: boolean
  tasaProveedor: number

  // Paso 2 — Productos
  lineas: LineaWizardCompra[]
  pvpPendienteLineaIdx: number | null

  // Paso 3 — Cargos + Pagos
  lineasCargo: CargoWizard[]
  pagos: PagoWizardCompra[]
  destinoCobro: 'CAJA' | 'TESORERIA'
  sesionActivaId: string | null

  // Sheet + navegacion
  sheetOpen: boolean
  openSheet: () => void
  closeSheet: () => void
  setStep: (step: 1 | 2 | 3) => void

  setCabecera: (
    patch: Partial<
      Pick<
        CompraWizardState,
        | 'fechaFactura'
        | 'nroFactura'
        | 'nroControl'
        | 'proveedorId'
        | 'moneda'
        | 'usaTasaParalela'
        | 'tasaInterna'
        | 'tasaInternaManual'
        | 'tasaProveedor'
      >
    >
  ) => void

  agregarLinea: (linea: LineaWizardCompra) => void
  actualizarLinea: (idx: number, patch: Partial<LineaWizardCompra>) => void
  quitarLinea: (idx: number) => void

  /**
   * PVP gating — STUBBED en este PR (tasks.md 3a.5): `abrirPvpDecision` solo
   * setea el indice pendiente (necesario para que W3b/W4b-i puedan construir
   * la UI de apertura); `confirmarPvpDecision`/`cancelarPvpDecision` solo
   * limpian el indice pendiente SIN escribir `pvp_niveles` — esa escritura
   * real requiere las funciones puras de `compra-pvp-decision.ts`, que W4a
   * todavia no crea.
   */
  abrirPvpDecision: (idx: number) => void
  confirmarPvpDecision: (idx: number, niveles: PvpNivelUI[]) => void
  cancelarPvpDecision: (idx: number) => void

  agregarCargo: (concepto: ConceptoCargo) => void
  actualizarCargo: (id: string, patch: Partial<Omit<CargoWizard, 'id'>>) => void
  quitarCargo: (id: string) => void

  agregarPago: () => void
  actualizarPago: (idx: number, patch: Partial<PagoWizardCompra>) => void
  quitarPago: (idx: number) => void
  setDestinoCobro: (patch: { destinoCobro: 'CAJA' | 'TESORERIA'; sesionActivaId: string | null }) => void

  // Validez por paso
  isStep1Valid: () => boolean
  isStep2Valid: () => boolean
  isStep3Valid: () => boolean

  // Draft — clave PROPIA 'compra_wizard_draft' (compra-form.tsx no tiene
  // store de borrador hoy — greenfield, ver design.md decision #1), 24h de
  // expiracion, mismo patron que `cita-wizard-store.ts`.
  guardarDraft: () => void
  restaurarDraft: () => boolean
  reset: () => void
}

const initialState = {
  step: 1 as const,
  fechaFactura: '',
  nroFactura: '',
  nroControl: '',
  proveedorId: '',
  moneda: 'USD' as MonedaCompraWizard,
  usaTasaParalela: false,
  tasaInterna: 0,
  tasaInternaManual: false,
  tasaProveedor: 0,
  lineas: [] as LineaWizardCompra[],
  pvpPendienteLineaIdx: null as number | null,
  lineasCargo: [] as CargoWizard[],
  pagos: [] as PagoWizardCompra[],
  destinoCobro: 'TESORERIA' as 'CAJA' | 'TESORERIA',
  sesionActivaId: null as string | null,
}

export const useCompraWizardStore = create<CompraWizardState>()((set, get) => ({
  ...initialState,
  sheetOpen: false,

  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  setStep: (step) => set({ step }),

  setCabecera: (patch) => set(patch),

  agregarLinea: (linea) => set((state) => ({ lineas: [...state.lineas, linea] })),

  actualizarLinea: (idx, patch) =>
    set((state) => ({
      lineas: state.lineas.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    })),

  quitarLinea: (idx) =>
    set((state) => ({ lineas: state.lineas.filter((_, i) => i !== idx) })),

  abrirPvpDecision: (idx) => set({ pvpPendienteLineaIdx: idx }),

  confirmarPvpDecision: () => set({ pvpPendienteLineaIdx: null }),

  cancelarPvpDecision: () => set({ pvpPendienteLineaIdx: null }),

  agregarCargo: (concepto) =>
    set((state) => ({ lineasCargo: [...state.lineasCargo, nuevoCargoWizard(concepto)] })),

  actualizarCargo: (id, patch) =>
    set((state) => ({
      lineasCargo: state.lineasCargo.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  quitarCargo: (id) =>
    set((state) => ({ lineasCargo: state.lineasCargo.filter((c) => c.id !== id) })),

  agregarPago: () => set((state) => ({ pagos: [...state.pagos, nuevoPagoWizard()] })),

  actualizarPago: (idx, patch) =>
    set((state) => ({
      pagos: state.pagos.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    })),

  quitarPago: (idx) => set((state) => ({ pagos: state.pagos.filter((_, i) => i !== idx) })),

  setDestinoCobro: (patch) => set(patch),

  isStep1Valid: () => {
    const { fechaFactura, nroFactura, proveedorId, tasaInterna } = get()
    return Boolean(fechaFactura) && nroFactura.trim() !== '' && Boolean(proveedorId) && tasaInterna > 0
  },

  // TODO(W4b-i): tighten to la gating real una vez exista `paso-productos.tsx`
  // — `lineas.length > 0 && !lineas.some(l => lineaTieneDecisionBloqueante(...))`
  // (ver tasks.md 4b-i.3, que remueve explicitamente esta concesion temporal).
  // Hasta entonces el Paso 2 del wizard es un placeholder ("Agregar productos →"),
  // asi que 0 lineas debe considerarse valido para poder avanzar al Paso 3.
  isStep2Valid: () => true,

  // design.md: "siempre true — CREDITO es valido" (los pagos son opcionales,
  // el saldo no cubierto va a CxP, igual que en el formulario de escritorio).
  isStep3Valid: () => true,

  guardarDraft: () => {
    const state = get()
    try {
      const draft = {
        step: state.step,
        fechaFactura: state.fechaFactura,
        nroFactura: state.nroFactura,
        nroControl: state.nroControl,
        proveedorId: state.proveedorId,
        moneda: state.moneda,
        usaTasaParalela: state.usaTasaParalela,
        tasaInterna: state.tasaInterna,
        tasaInternaManual: state.tasaInternaManual,
        tasaProveedor: state.tasaProveedor,
        lineas: state.lineas,
        lineasCargo: state.lineasCargo,
        pagos: state.pagos,
        savedAt: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Ignorar errores de localStorage
    }
  },

  restaurarDraft: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw)
      // Descartar borradores mas viejos de 24 horas
      if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY)
        return false
      }
      if (draft.lineas?.length > 0 || draft.proveedorId || draft.nroFactura) {
        set({
          step: draft.step ?? 1,
          fechaFactura: draft.fechaFactura ?? '',
          nroFactura: draft.nroFactura ?? '',
          nroControl: draft.nroControl ?? '',
          proveedorId: draft.proveedorId ?? '',
          moneda: draft.moneda ?? 'USD',
          usaTasaParalela: draft.usaTasaParalela ?? false,
          tasaInterna: draft.tasaInterna ?? 0,
          tasaInternaManual: draft.tasaInternaManual ?? false,
          tasaProveedor: draft.tasaProveedor ?? 0,
          lineas: draft.lineas ?? [],
          lineasCargo: draft.lineasCargo ?? [],
          pagos: draft.pagos ?? [],
        })
        return true
      }
    } catch {
      // Ignorar
    }
    return false
  },

  reset: () => {
    set({ ...initialState, sheetOpen: false })
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignorar
    }
  },
}))
