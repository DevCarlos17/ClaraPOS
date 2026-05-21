import { create } from 'zustand'

export interface ServicioWizardEnhanced {
  productoId: string
  nombre: string
  precioUsd: number
  duracionMin: number
}

export interface AsignacionPersonal {
  servicioIdx: number
  trabajadorId: string
  trabajadorNombre: string
}

export interface PagoWizard {
  metodoCobro: string
  metodoCobroId: string
  monto: number
  referencia?: string
}

export type CheckoutTipo = 'RESERVA' | 'POS' | 'CREDITO'
export type PrioridadFiltro = 'EMPLEADO' | 'HORA'

// Compatibilidad: alias para código existente que use ServicioWizard
export type ServicioWizard = ServicioWizardEnhanced

const STORAGE_KEY = 'cita_wizard_draft'

interface CitaWizardState {
  step: 1 | 2 | 3 | 4
  // Paso 1: Servicios + Cliente
  clienteId: string
  clienteNombre: string
  servicios: ServicioWizardEnhanced[]
  ejecucionParalela: boolean
  // Paso 2: Prioridad
  prioridadFiltro: PrioridadFiltro | null
  profesionalFavorito: { id: string; nombre: string } | null
  // Paso 3: Fecha + Staff
  fecha: string
  horaInicio: string
  horaFin: string
  asignacionPersonal: AsignacionPersonal[]
  // Paso 4: Checkout
  checkoutTipo: CheckoutTipo
  pago: PagoWizard | null
  observaciones: string
  // Acciones
  setStep: (step: 1 | 2 | 3 | 4) => void
  setCliente: (id: string, nombre: string) => void
  agregarServicio: (servicio: ServicioWizardEnhanced) => void
  quitarServicio: (productoId: string) => void
  actualizarDuracionServicio: (productoId: string, duracionMin: number) => void
  toggleParalela: () => void
  setPrioridad: (filtro: PrioridadFiltro) => void
  setProfesionalFavorito: (prof: { id: string; nombre: string } | null) => void
  setFechaHora: (fecha: string, horaInicio: string, horaFin: string) => void
  setAsignacion: (asignaciones: AsignacionPersonal[]) => void
  setCheckoutTipo: (tipo: CheckoutTipo) => void
  setPago: (pago: PagoWizard | null) => void
  setObservaciones: (obs: string) => void
  // Computed
  totalUsd: () => number
  duracionTotalMin: () => number
  // Principal profesional (para compatibilidad con crearCita)
  profesionalId: () => string
  profesionalNombre: () => string
  // Sheet lateral
  sheetOpen: boolean
  openSheet: (prefillFecha?: string, prefillHoraInicio?: string, prefillHoraFin?: string) => void
  closeSheet: () => void
  // Persistencia
  guardarDraft: () => void
  restaurarDraft: () => boolean
  reset: () => void
}

const initialState = {
  step: 1 as const,
  clienteId: '',
  clienteNombre: '',
  servicios: [] as ServicioWizardEnhanced[],
  ejecucionParalela: false,
  prioridadFiltro: null as PrioridadFiltro | null,
  profesionalFavorito: null as { id: string; nombre: string } | null,
  fecha: '',
  horaInicio: '',
  horaFin: '',
  asignacionPersonal: [] as AsignacionPersonal[],
  checkoutTipo: 'RESERVA' as CheckoutTipo,
  pago: null as PagoWizard | null,
  observaciones: '',
}

export const useCitaWizardStore = create<CitaWizardState>()((set, get) => ({
  ...initialState,
  sheetOpen: false,

  openSheet: (prefillFecha?: string, prefillHoraInicio?: string, prefillHoraFin?: string) => {
    // Siempre resetear fecha/hora al abrir desde el calendario — el prefill nuevo tiene prioridad
    if (prefillFecha) {
      set({
        sheetOpen: true,
        fecha: prefillFecha,
        horaInicio: prefillHoraInicio ?? '',
        horaFin: prefillHoraFin ?? '',
      })
    } else {
      set({ sheetOpen: true })
    }
  },

  closeSheet: () => {
    set({ sheetOpen: false })
    // Limpiar fecha/hora para que el próximo openSheet desde calendario
    // siempre pre-cargue la nueva selección sin interferencia del draft anterior
    set({ fecha: '', horaInicio: '', horaFin: '' })
  },

  setStep: (step) => {
    set({ step })
    get().guardarDraft()
  },

  setCliente: (clienteId, clienteNombre) => {
    set({ clienteId, clienteNombre })
    get().guardarDraft()
  },

  agregarServicio: (servicio) =>
    set((state) => {
      const existe = state.servicios.find((s) => s.productoId === servicio.productoId)
      if (existe) return state
      return { servicios: [...state.servicios, servicio] }
    }),

  quitarServicio: (productoId) =>
    set((state) => ({
      servicios: state.servicios.filter((s) => s.productoId !== productoId),
      asignacionPersonal: state.asignacionPersonal.filter(
        (_, i) => state.servicios.findIndex((s) => s.productoId === productoId) !== i
      ),
    })),

  actualizarDuracionServicio: (productoId, duracionMin) =>
    set((state) => ({
      servicios: state.servicios.map((s) =>
        s.productoId === productoId ? { ...s, duracionMin } : s
      ),
    })),

  toggleParalela: () =>
    set((state) => ({ ejecucionParalela: !state.ejecucionParalela })),

  setPrioridad: (filtro) => {
    set({ prioridadFiltro: filtro, profesionalFavorito: null })
    get().guardarDraft()
  },

  setProfesionalFavorito: (prof) => {
    set({ profesionalFavorito: prof })
    get().guardarDraft()
  },

  setFechaHora: (fecha, horaInicio, horaFin) => {
    set({ fecha, horaInicio, horaFin })
    get().guardarDraft()
  },

  setAsignacion: (asignaciones) => set({ asignacionPersonal: asignaciones }),

  setCheckoutTipo: (checkoutTipo) => set({ checkoutTipo }),

  setPago: (pago) => set({ pago }),

  setObservaciones: (observaciones) => set({ observaciones }),

  totalUsd: () => {
    const { servicios } = get()
    return servicios.reduce((sum, s) => sum + s.precioUsd, 0)
  },

  duracionTotalMin: () => {
    const { servicios, ejecucionParalela } = get()
    if (servicios.length === 0) return 60
    if (ejecucionParalela) {
      return Math.max(...servicios.map((s) => s.duracionMin))
    }
    return servicios.reduce((sum, s) => sum + s.duracionMin, 0)
  },

  profesionalId: () => {
    const { profesionalFavorito, asignacionPersonal } = get()
    if (profesionalFavorito) return profesionalFavorito.id
    if (asignacionPersonal.length > 0) return asignacionPersonal[0].trabajadorId
    return ''
  },

  profesionalNombre: () => {
    const { profesionalFavorito, asignacionPersonal } = get()
    if (profesionalFavorito) return profesionalFavorito.nombre
    if (asignacionPersonal.length > 0) return asignacionPersonal[0].trabajadorNombre
    return ''
  },

  guardarDraft: () => {
    const state = get()
    try {
      const draft = {
        step: state.step,
        clienteId: state.clienteId,
        clienteNombre: state.clienteNombre,
        servicios: state.servicios,
        ejecucionParalela: state.ejecucionParalela,
        prioridadFiltro: state.prioridadFiltro,
        profesionalFavorito: state.profesionalFavorito,
        fecha: state.fecha,
        horaInicio: state.horaInicio,
        horaFin: state.horaFin,
        asignacionPersonal: state.asignacionPersonal,
        checkoutTipo: state.checkoutTipo,
        observaciones: state.observaciones,
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
      if (draft.servicios?.length > 0 || draft.clienteId) {
        set({
          step: draft.step ?? 1,
          clienteId: draft.clienteId ?? '',
          clienteNombre: draft.clienteNombre ?? '',
          servicios: draft.servicios ?? [],
          ejecucionParalela: draft.ejecucionParalela ?? false,
          prioridadFiltro: draft.prioridadFiltro ?? null,
          profesionalFavorito: draft.profesionalFavorito ?? null,
          fecha: draft.fecha ?? '',
          horaInicio: draft.horaInicio ?? '',
          horaFin: draft.horaFin ?? '',
          asignacionPersonal: draft.asignacionPersonal ?? [],
          checkoutTipo: draft.checkoutTipo ?? 'RESERVA',
          observaciones: draft.observaciones ?? '',
        })
        return true
      }
    } catch {
      // Ignorar
    }
    return false
  },

  reset: () => {
    set(initialState)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignorar
    }
  },
}))
