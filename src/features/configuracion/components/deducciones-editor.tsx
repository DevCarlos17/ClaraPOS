import { useState } from 'react'
import { toast } from 'sonner'
import { NativeSelect } from '@/components/ui/native-select'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useCuentasDetallePorTipo,
  useGruposGasto,
  useGrupoComisionesPasarela,
  useSiguienteCodigoDeGrupo,
  agregarSubcuentaAGrupo,
  type CuentaContable,
} from '@/features/contabilidad/hooks/use-plan-cuentas'
import type { TipoDeduccion } from '@/features/configuracion/hooks/use-metodo-cobro-deducciones'

// PR-3c.1 (consolidacion N-deducciones, obs Engram #792): componente
// compartido, extraido del bloque de UI inline que hoy vive en
// `payment-method-form.tsx`. Consumido tanto por `MetodoDraftRow`
// (banco-form.tsx, superficie primaria desde 3c.2) como por
// `PaymentMethodForm` (refactor, 3c.2).
//
// Presentacional puro: NUNCA llama `createDeduccion`/`updateDeduccion`
// directamente. Todo cambio sale por `onChange` — la persistencia real
// (create/update/soft-deactivate transaccional) es responsabilidad
// exclusiva del formulario padre via `persistDeduccionesDeMetodo`
// (`use-metodo-cobro-deducciones.ts`).
export interface DeduccionRow {
  /** undefined = fila nueva, aun no persistida */
  id?: string
  concepto: string
  tipo: TipoDeduccion
  porcentaje: string
  /** '' = sentinel "usar la cuenta base de pasarela del banco" — el padre lo resuelve al guardar */
  cuenta_gasto_id: string
  is_active: boolean
}

interface DeduccionesEditorProps {
  rows: DeduccionRow[]
  onChange: (rows: DeduccionRow[]) => void
  /** bancos_empresa.cuenta_gasto_pasarela_id — solo informativo, indica que cuenta resuelve el sentinel '' */
  cuentaBasePasarelaId: string | undefined
  /**
   * Errores de Zod por fila, keyed como `deducciones.{index}.{campo}`
   * (mismo formato que `issue.path.join('.')` de metodoCobroDeduccionSchema
   * dentro de paymentMethodSchema). Opcional: el padre solo lo pasa si
   * valida las filas via Zod (ej. `payment-method-form.tsx`) — hallazgo
   * WARNING de review 3c.2, la extraccion de este componente elimino el
   * display inline de estos errores que existia antes (obs Engram #642).
   */
  errors?: Record<string, string>
}

const TIPOS_DEDUCCION: { value: TipoDeduccion; label: string }[] = [
  { value: 'COMISION', label: 'Comision' },
  { value: 'ISLR', label: 'Retencion ISLR' },
  { value: 'OTRO', label: 'Otro' },
]

export function DeduccionesEditor({ rows, onChange, cuentaBasePasarelaId, errors }: DeduccionesEditorProps) {
  const { user } = useCurrentUser()
  const { cuentas: cuentasGasto } = useCuentasDetallePorTipo('GASTO')

  // Resuelve el nombre legible de la cuenta base de pasarela para mostrarla
  // bajo el select cuando una fila usa el sentinel '' — sin query nueva,
  // `cuentasGasto` ya incluye codigo+nombre (obs Engram sdd/explore/deducciones-editor-base-row).
  const cuentaBaseLabel = cuentaBasePasarelaId
    ? (() => {
        const cuentaBase = cuentasGasto.find((cuenta) => cuenta.id === cuentaBasePasarelaId)
        return cuentaBase ? `${cuentaBase.codigo} - ${cuentaBase.nombre}` : undefined
      })()
    : undefined

  // Solo una fila puede tener el panel "+ Crear cuenta" abierto a la vez.
  const [crearCuentaEnIndex, setCrearCuentaEnIndex] = useState<number | null>(null)

  function updateRow(index: number, patch: Partial<DeduccionRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function handleAdd() {
    onChange([
      ...rows,
      {
        concepto: '',
        tipo: 'COMISION',
        porcentaje: '0',
        cuenta_gasto_id: '',
        is_active: true,
      },
    ])
  }

  // SC-11: soft-deactivate, nunca DELETE fisico. Una fila aun no persistida
  // (sin `id`) simplemente se quita del array local — sin llamada a DB en
  // ningun caso, la persistencia queda 100% a cargo del padre al guardar.
  function handleRemoveOrDeactivate(index: number) {
    const row = rows[index]
    if (!row.id) {
      onChange(rows.filter((_, i) => i !== index))
      return
    }
    updateRow(index, { is_active: false })
  }

  // Simetrico a `handleRemoveOrDeactivate`: metodo_cobro_deducciones es
  // config editable (no ledger inmutable), reactivar es un cambio de config
  // tan valido como desactivar. Conserva concepto/porcentaje/cuenta_gasto_id
  // (solo cambia `is_active`) — el padre persiste la fila reactivada como
  // activa via `persistDeduccionesDeMetodo` al guardar.
  function handleReactivar(index: number) {
    updateRow(index, { is_active: true })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Deducciones (comisiones)</span>
        <button
          type="button"
          onClick={handleAdd}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          + Agregar deduccion
        </button>
      </div>

      {rows.length === 0 && <p className="text-xs text-gray-400">Sin deducciones configuradas.</p>}

      <div className="space-y-3">
        {rows.map((row, i) => (
          <DeduccionRowEditor
            key={row.id ?? `nueva-${i}`}
            row={row}
            cuentasGasto={cuentasGasto}
            cuentaBaseLabel={cuentaBaseLabel}
            onUpdate={(patch) => updateRow(i, patch)}
            onRemoveOrDeactivate={() => handleRemoveOrDeactivate(i)}
            onReactivar={() => handleReactivar(i)}
            creandoCuenta={crearCuentaEnIndex === i}
            onToggleCrearCuenta={() => setCrearCuentaEnIndex(crearCuentaEnIndex === i ? null : i)}
            onCuentaCreada={(subId) => {
              updateRow(i, { cuenta_gasto_id: subId })
              setCrearCuentaEnIndex(null)
            }}
            userId={user?.id}
            empresaId={user?.empresa_id ?? undefined}
            errorConcepto={errors?.[`deducciones.${i}.concepto`]}
            errorPorcentaje={errors?.[`deducciones.${i}.porcentaje`]}
            errorCuentaGastoId={errors?.[`deducciones.${i}.cuenta_gasto_id`]}
          />
        ))}
      </div>

      <p className="text-xs text-gray-500">
        {cuentaBasePasarelaId
          ? 'Dejar "automatico" usa la cuenta base de pasarela del banco. Puedes re-apuntar la cuenta o agregar mas conceptos (ej. retencion ISLR).'
          : 'El banco aun no tiene una cuenta base de pasarela — selecciona o crea una cuenta para cada deduccion.'}
      </p>
    </div>
  )
}

interface DeduccionRowEditorProps {
  row: DeduccionRow
  cuentasGasto: CuentaContable[]
  /** Nombre legible de la cuenta base de pasarela — solo se muestra cuando la fila usa el sentinel '' */
  cuentaBaseLabel?: string
  onUpdate: (patch: Partial<DeduccionRow>) => void
  onRemoveOrDeactivate: () => void
  onReactivar: () => void
  creandoCuenta: boolean
  onToggleCrearCuenta: () => void
  onCuentaCreada: (subId: string) => void
  userId: string | undefined
  empresaId: string | undefined
  errorConcepto?: string
  errorPorcentaje?: string
  errorCuentaGastoId?: string
}

function DeduccionRowEditor({
  row,
  cuentasGasto,
  cuentaBaseLabel,
  onUpdate,
  onRemoveOrDeactivate,
  onReactivar,
  creandoCuenta,
  onToggleCrearCuenta,
  onCuentaCreada,
  userId,
  empresaId,
  errorConcepto,
  errorPorcentaje,
  errorCuentaGastoId,
}: DeduccionRowEditorProps) {
  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        row.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'
      }`}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Concepto</label>
          <input
            type="text"
            value={row.concepto}
            onChange={(e) => onUpdate({ concepto: e.target.value })}
            disabled={!row.is_active}
            className={`w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errorConcepto ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errorConcepto && <p className="text-red-500 text-xs mt-1">{errorConcepto}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tipo</label>
          <NativeSelect
            value={row.tipo}
            onChange={(e) => onUpdate({ tipo: e.target.value as TipoDeduccion })}
            disabled={!row.is_active}
          >
            {TIPOS_DEDUCCION.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Porcentaje %</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={row.porcentaje}
            onChange={(e) => onUpdate({ porcentaje: e.target.value })}
            disabled={!row.is_active}
            className={`w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errorPorcentaje ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errorPorcentaje && <p className="text-red-500 text-xs mt-1">{errorPorcentaje}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Cuenta de gasto</label>
          <div className="flex items-start gap-1">
            <NativeSelect
              value={row.cuenta_gasto_id}
              onChange={(e) => onUpdate({ cuenta_gasto_id: e.target.value })}
              disabled={!row.is_active}
              wrapperClassName="flex-1"
            >
              <option value="">-- Cuenta base de pasarela del banco (automatico) --</option>
              {cuentasGasto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.nombre}
                </option>
              ))}
            </NativeSelect>
            <button
              type="button"
              onClick={onToggleCrearCuenta}
              disabled={!row.is_active}
              className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 py-2"
            >
              + Crear cuenta
            </button>
          </div>
          {errorCuentaGastoId && <p className="text-red-500 text-xs mt-1">{errorCuentaGastoId}</p>}
          {!errorCuentaGastoId && row.cuenta_gasto_id === '' && cuentaBaseLabel && (
            <p className="text-gray-400 text-xs mt-1">Se registrara en: {cuentaBaseLabel}</p>
          )}
        </div>
      </div>

      {creandoCuenta && (
        <CrearCuentaInline empresaId={empresaId} userId={userId} onCreada={onCuentaCreada} onCancel={onToggleCrearCuenta} />
      )}

      <div className="flex justify-end">
        {row.is_active ? (
          <button
            type="button"
            onClick={onRemoveOrDeactivate}
            className="text-xs text-red-600 hover:text-red-800"
          >
            {row.id ? 'Desactivar' : 'Quitar'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Desactivada</span>
            <button
              type="button"
              onClick={onReactivar}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Reactivar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface CrearCuentaInlineProps {
  empresaId: string | undefined
  userId: string | undefined
  onCreada: (subId: string) => void
  onCancel: () => void
}

// Panel inline "+ Crear cuenta" por fila de deduccion — mismo patron que
// `cuenta-gasto-modal.tsx` (fila que se expande bajo su trigger). NUNCA un
// `<dialog>` anidado dentro del dialog padre (banco-form.tsx/payment-method-form.tsx).
function CrearCuentaInline({ empresaId, userId, onCreada, onCancel }: CrearCuentaInlineProps) {
  const { grupos } = useGruposGasto()
  const grupoComisionesPasarela = useGrupoComisionesPasarela()
  const [grupoId, setGrupoId] = useState<string>('')
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)

  const grupoSeleccionadoId = grupoId || grupoComisionesPasarela?.id || ''
  const grupoSeleccionado = grupos.find((g) => g.id === grupoSeleccionadoId)
  const codigoSugerido = useSiguienteCodigoDeGrupo(grupoSeleccionado?.id)

  async function handleCrear() {
    if (!grupoSeleccionado || !nombre.trim() || !empresaId || !userId) return
    setCreando(true)
    try {
      const subId = await agregarSubcuentaAGrupo({
        grupoId: grupoSeleccionado.id,
        grupoCodigo: grupoSeleccionado.codigo,
        grupoNivel: grupoSeleccionado.nivel,
        nombreSubcuenta: nombre,
        empresaId,
        userId,
      })
      toast.success('Cuenta de gasto creada')
      onCreada(subId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear la cuenta')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Grupo padre</label>
          <NativeSelect value={grupoSeleccionadoId} onChange={(e) => setGrupoId(e.target.value)}>
            {grupos.length === 0 && <option value="">-- Sin grupos disponibles --</option>}
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.codigo} - {g.nombre}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Codigo sugerido</label>
          <input
            type="text"
            value={codigoSugerido ?? ''}
            disabled
            className="w-full rounded-md border border-gray-300 bg-gray-100 px-2 py-1 text-sm text-gray-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Nombre de la cuenta</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value.toUpperCase())}
          placeholder="Ej: COMISION BANCARIA X"
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-gray-600 hover:text-gray-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCrear}
          disabled={creando || !nombre.trim() || !grupoSeleccionado}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
        >
          {creando ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </div>
  )
}
