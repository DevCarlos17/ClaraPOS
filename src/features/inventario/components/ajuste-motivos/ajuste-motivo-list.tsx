import { useAjusteMotivos } from '@/features/inventario/hooks/use-ajuste-motivos'

const CLAVES_SISTEMA = ['MERMA_INVENTARIO', 'EXTRAVIO_INVENTARIO', 'CONSUMO_INTERNO'] as const

const LABELS: Record<string, { nombre: string; descripcion: string }> = {
  MERMA_INVENTARIO:  { nombre: 'Merma',           descripcion: 'Avería o deterioro de mercancía' },
  EXTRAVIO_INVENTARIO: { nombre: 'Extravío',       descripcion: 'Pérdida o hurto de mercancía' },
  CONSUMO_INTERNO:   { nombre: 'Consumo Interno',  descripcion: 'Uso interno por parte del negocio' },
}

export function AjusteMotivoList() {
  const { motivos, isLoading } = useAjusteMotivos()

  const motivosSistema = motivos.filter(
    (m) => CLAVES_SISTEMA.includes(m.cuentas_config_clave as typeof CLAVES_SISTEMA[number])
  )

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Causas de Salida de Inventario</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estas causas se usan en ajustes manuales y masivos. Generan un gasto contable automático al aplicarse.
        </p>
      </div>

      <div className="grid gap-3">
        {motivosSistema.map((m) => {
          const meta = LABELS[m.cuentas_config_clave ?? '']
          return (
            <div
              key={m.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
            >
              <div>
                <p className="font-medium text-sm">{meta?.nombre ?? m.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{meta?.descripcion ?? ''}</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                RESTA
              </span>
            </div>
          )
        })}

        {/* Facturación — automático desde el POS */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30 opacity-70">
          <div>
            <p className="font-medium text-sm">Facturación</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salida automática generada al procesar una venta en el POS
            </p>
          </div>
          <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/20 ring-inset">
            Automático
          </span>
        </div>
      </div>
    </div>
  )
}
