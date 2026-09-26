import { formatUsd } from '@/lib/currency'
import type { OrigenReverso, VistaReversoNc } from '../utils/notas-credito-ui'

interface OrigenReversoSelectorProps {
  value: OrigenReverso | null
  onChange: (value: OrigenReverso) => void
  vista: VistaReversoNc
}

/**
 * Componente de PRESENTACION puro (Design §D1, Slice 3 de
 * `unificacion-modal-nc`; hecho condicional en `nc-factura-credito-ux`,
 * Design §Interfaces/§Decision 6): extraccion verbatim del bloque "Origen
 * del reverso" (Devolver dinero/Credito a favor), identico a
 * `crear-ncr-modal.tsx:341-365` antes de esa extraccion. Sin `entryPoint`,
 * sin fetch, sin logica de negocio propia — recibe `vista` ya calculada por
 * `resolverVistaReversoNc` y decide UNICAMENTE que renderizar: cuando
 * `vista.soloCancelaDeuda` es `true` (remanente <= 0.01, mismo umbral que
 * el motor) no tiene sentido ofrecer "Devolver dinero"/"Credito a favor" —
 * se muestra solo el copy de cancelacion de deuda. Cuando es `false` se
 * mantiene el desglose + los 2 botones existentes (markup sin cambios).
 * Consumidores: `crear-ncr-modal.tsx` y `nota-credito-pos-modal.tsx`.
 */
export function OrigenReversoSelector({ value, onChange, vista }: OrigenReversoSelectorProps) {
  if (vista.soloCancelaDeuda) {
    return (
      <div className="rounded-lg border p-3">
        <p className="text-sm">
          Esta nota de crédito cancela {formatUsd(vista.montoAplicadoADeuda)} de la deuda pendiente de la
          factura.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold text-muted-foreground mb-2">Origen del reverso</p>
      <p className="text-sm mb-2">
        De {formatUsd(vista.totalUsdNc)}: {formatUsd(vista.montoAplicadoADeuda)} cancela deuda pendiente,{' '}
        {formatUsd(vista.montoDisponible)} disponible
      </p>
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
