import type { OrigenReverso } from '../utils/notas-credito-ui'

interface OrigenReversoSelectorProps {
  value: OrigenReverso | null
  onChange: (value: OrigenReverso) => void
}

/**
 * Componente de PRESENTACION puro (Design §D1, Slice 3 de
 * `unificacion-modal-nc`): extraccion verbatim del bloque "Origen del
 * reverso" (Devolver dinero/Credito a favor), identico a
 * `crear-ncr-modal.tsx:341-365` antes de esta extraccion. Sin
 * `entryPoint`, sin fetch, sin logica de negocio — solo recibe/emite el
 * valor. Nuevo consumidor: `nota-credito-pos-modal.tsx`.
 */
export function OrigenReversoSelector({ value, onChange }: OrigenReversoSelectorProps) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-2">Origen del reverso</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange('DEVOLVER_DINERO')}
          aria-pressed={value === 'DEVOLVER_DINERO'}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            value === 'DEVOLVER_DINERO' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
          }`}
        >
          Devolver dinero
        </button>
        <button
          type="button"
          onClick={() => onChange('CREDITO_A_FAVOR')}
          aria-pressed={value === 'CREDITO_A_FAVOR'}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            value === 'CREDITO_A_FAVOR' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
          }`}
        >
          Credito a favor
        </button>
      </div>
    </div>
  )
}
