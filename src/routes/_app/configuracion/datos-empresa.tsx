import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Buildings, FileText, CalendarDots } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CompanyDataForm } from '@/features/configuracion/components/company-data-form'
import { EmpresaFiscalForm } from '@/features/configuracion/components/empresa-fiscal-form'
import { ConfigAgenda } from '@/features/citas/components/config/config-agenda'

export const Route = createFileRoute('/_app/configuracion/datos-empresa')({
  component: DatosEmpresaPage,
})

type Section = 'general' | 'fiscal' | 'agenda'

const NAV_ITEMS: {
  id: Section
  label: string
  shortLabel: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'general', label: 'Datos Generales', shortLabel: 'General', description: 'Razon social, RIF y contacto', icon: Buildings },
  { id: 'fiscal', label: 'Datos Fiscales', shortLabel: 'Fiscal', description: 'Contribuyente, retenciones y SENIAT', icon: FileText },
  { id: 'agenda', label: 'Configuracion de Agenda', shortLabel: 'Agenda', description: 'Visibilidad y opciones del modulo de citas', icon: CalendarDots },
]

function DatosEmpresaPage() {
  const [section, setSection] = useState<Section>('general')

  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Datos de la Empresa" descripcion="Configuracion general y fiscal de la empresa" />

        <motion.div layout className="rounded-2xl bg-card shadow-lg overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:min-h-[420px]">

            {/* ── Mobile: segmented pill tabs ── */}
            <div className="sm:hidden px-3 pt-3 pb-0">
              <div className="relative flex bg-muted rounded-xl p-1 gap-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon
                  const active = section === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSection(item.id)}
                      className="relative flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg cursor-pointer z-10"
                    >
                      {active && (
                        <motion.div
                          layoutId="tab-pill"
                          className="absolute inset-0 bg-background rounded-lg shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        />
                      )}
                      <Icon
                        className={`relative z-10 h-3.5 w-3.5 shrink-0 transition-colors duration-200 ${
                          active ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                      <span
                        className={`relative z-10 text-xs font-medium transition-colors duration-200 ${
                          active ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {item.shortLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Desktop: sidebar nav ── */}
            <div className="hidden sm:flex sm:flex-col shrink-0 w-56 border-r border-border bg-muted/30 p-3 gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id)}
                    className={[
                      'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer transition-all duration-150',
                      active
                        ? 'bg-background shadow-sm border border-border'
                        : 'hover:bg-muted/70',
                    ].join(' ')}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 transition-colors duration-150 ${
                        active ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                    <div>
                      <p
                        className={`text-sm font-medium leading-tight transition-colors duration-150 ${
                          active ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{item.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-w-0 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-foreground mb-5">
                {NAV_ITEMS.find((i) => i.id === section)?.label}
              </h2>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={section}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  {section === 'general' ? (
                    <CompanyDataForm />
                  ) : section === 'fiscal' ? (
                    <EmpresaFiscalForm />
                  ) : (
                    <ConfigAgenda />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </motion.div>
      </div>
    </RequirePermission>
  )
}
