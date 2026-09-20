interface TipoNcSelectorProps {
  tipoNc: 'TOTAL' | 'PARCIAL' | null
  onChange: (tipo: 'TOTAL' | 'PARCIAL') => void
  puedeTotal: boolean
}

/**
 * Componente de PRESENTACION puro (Design §D1, Slice 1 de
 * `unificacion-modal-nc`): extraccion verbatim del bloque "Tipo de NC"
 * (Total/Parcial), identico byte-a-byte en `crear-ncr-modal.tsx:303-334` y
 * `nota-credito-pos-modal.tsx:563-596` antes de esta extraccion. Sin
 * `entryPoint`, sin fetch, sin logica de negocio — solo recibe/emite el
 * valor.
 */
export function TipoNcSelector({ tipoNc, onChange, puedeTotal }: TipoNcSelectorProps) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-2">Tipo de nota de credito</p>
      <div className="flex gap-2">
        {puedeTotal && (
          <button
            type="button"
            onClick={() => onChange('TOTAL')}
            aria-pressed={tipoNc === 'TOTAL'}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
              tipoNc === 'TOTAL' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
            }`}
          >
            Total
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange('PARCIAL')}
          aria-pressed={tipoNc === 'PARCIAL'}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            tipoNc === 'PARCIAL' ? 'border-primary bg-muted font-medium' : 'hover:bg-muted'
          }`}
        >
          Parcial
        </button>
      </div>
      {!puedeTotal && (
        <p className="text-xs text-orange-600 mt-1.5">
          Esta factura ya tiene una NC parcial aplicada — solo se puede reversar el remanente por linea.
        </p>
      )}
    </div>
  )
}
