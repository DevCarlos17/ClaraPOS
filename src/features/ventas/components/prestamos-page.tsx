import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@powersync/react";
import { Warning, Clock, CheckCircle, Plus } from "@phosphor-icons/react";
import { useCurrentUser } from "@/core/hooks/use-current-user";
import { formatUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { SegmentedTabs, tabContentVariants } from "@/components/shared/segmented-tabs";
import { type VencimientoPrestamo } from "@/features/cxc/hooks/use-cxc";
import { PrestamoDetalleModal } from "./prestamo-detalle-modal";
import { PrestamoStandaloneModal } from "./prestamo-standalone-modal";

// Alias local para compatibilidad con el resto del archivo
type VencimientoCobrar = VencimientoPrestamo;

type TabKey = "TODOS" | "VENCIDO" | "PROXIMO" | "PENDIENTE";

const TAB_ORDER: TabKey[] = ["TODOS", "VENCIDO", "PROXIMO", "PENDIENTE"];

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha + "T00:00:00").toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

function getDiasRestantes(fechaVenc: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc + "T00:00:00");
  return Math.floor((venc.getTime() - today.getTime()) / 86400000);
}

interface TablaVencimientosProps {
  items: (VencimientoCobrar & { diasRestantes: number })[];
  emptyMessage: string;
  onSelect: (item: VencimientoCobrar) => void;
}

function TablaVencimientos({ items, emptyMessage, onSelect }: TablaVencimientosProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-b-xl rounded-tr-xl border bg-card py-16 text-center">
        <CheckCircle
          size={32}
          className="mx-auto mb-3 text-muted-foreground/40"
        />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-b-xl rounded-tr-xl border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Estado
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cliente
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Factura
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Vencimiento
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Original
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pagado
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pendiente
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.map((v) => {
              const isVencido = v.diasRestantes < 0 && v.status === "PENDIENTE";
              const isProximo =
                v.diasRestantes >= 0 &&
                v.diasRestantes <= 7 &&
                v.status === "PENDIENTE";
              const isPagado = v.status === "PAGADO";
              const diasAbs = Math.abs(v.diasRestantes);

              return (
                <tr
                  key={v.id}
                  onClick={() => onSelect(v)}
                  className="hover:bg-muted/30 transition-colors duration-150 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    {isPagado ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">
                        <CheckCircle size={11} weight="fill" />
                        Pagado
                      </span>
                    ) : isVencido ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400">
                          <Warning size={11} weight="fill" />
                          Vencido
                        </span>
                        <p className="text-xs text-red-500/80 pl-1">
                          hace {diasAbs} dia{diasAbs !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ) : isProximo ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                          <Clock size={11} weight="fill" />
                          Proximo
                        </span>
                        <p className="text-xs text-amber-500/80 pl-1">
                          en {diasAbs} dia{diasAbs !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {v.cliente_nombre}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {v.nro_factura
                      ? `#${v.nro_factura}`
                      : <span className="italic text-muted-foreground/50">Sin factura</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
                    {formatFecha(v.fecha_vencimiento)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsd(parseFloat(v.monto_original_usd))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400">
                    {formatUsd(parseFloat(v.monto_pagado_usd))}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums font-semibold",
                      parseFloat(v.saldo_pendiente_usd) > 0.01
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-green-600 dark:text-green-400",
                    )}
                  >
                    {formatUsd(parseFloat(v.saldo_pendiente_usd))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PrestamosPage() {
  const { user } = useCurrentUser();
  const empresaId = user?.empresa_id ?? "";
  const [activeTab, setActiveTab] = useState<TabKey>("TODOS");
  const [prevTab, setPrevTab] = useState<TabKey>("TODOS");
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<VencimientoCobrar | null>(null);
  const [showNuevoPrestamo, setShowNuevoPrestamo] = useState(false);

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT vc.id, vc.venta_id, vc.nro_cuota, vc.fecha_vencimiento,
               vc.monto_original_usd, vc.monto_pagado_usd, vc.saldo_pendiente_usd, vc.status,
               vc.origen_fondos_tipo,
               v.nro_factura,
               c.nombre as cliente_nombre
         FROM vencimientos_cobrar vc
         LEFT JOIN ventas v ON vc.venta_id = v.id
         JOIN clientes c ON vc.cliente_id = c.id
         WHERE vc.empresa_id = ?
         ORDER BY vc.fecha_vencimiento ASC`
      : "",
    empresaId ? [empresaId] : [],
  );

  const todos = (data ?? []) as VencimientoCobrar[];

  const conDias = todos.map((v) => ({
    ...v,
    diasRestantes: getDiasRestantes(v.fecha_vencimiento),
  }));

  const vencidos = conDias.filter(
    (v) => v.diasRestantes < 0 && v.status === "PENDIENTE",
  );
  const proximos = conDias.filter(
    (v) =>
      v.diasRestantes >= 0 && v.diasRestantes <= 7 && v.status === "PENDIENTE",
  );
  const pendientes = conDias.filter((v) => v.status === "PENDIENTE");

  const filteredMap: Record<TabKey, typeof conDias> = {
    TODOS: conDias,
    VENCIDO: vencidos,
    PROXIMO: proximos,
    PENDIENTE: pendientes,
  };

  const tabEmptyMessages: Record<TabKey, string> = {
    TODOS: "No hay prestamos registrados",
    VENCIDO: "Sin prestamos vencidos",
    PROXIMO: "Sin prestamos proximos a vencer",
    PENDIENTE: "Sin prestamos pendientes",
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "TODOS", label: "Todos", count: todos.length },
    { key: "VENCIDO", label: "Vencidos", count: vencidos.length },
    { key: "PROXIMO", label: "Proximos", count: proximos.length },
    { key: "PENDIENTE", label: "Pendientes", count: pendientes.length },
  ];

  function handleTabChange(key: TabKey) {
    setPrevTab(activeTab);
    setActiveTab(key);
  }

  const direction =
    TAB_ORDER.indexOf(activeTab) > TAB_ORDER.indexOf(prevTab) ? 1 : -1;

  if (isLoading) {
    return (
      <div className="space-y-0">
        <div className="flex gap-0">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 w-28 rounded-t-md bg-muted animate-pulse mr-0.5"
            />
          ))}
        </div>
        <div className="rounded-b-xl rounded-tr-xl border bg-card p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Prestamos activos
          </h2>
          <button
            type="button"
            onClick={() => setShowNuevoPrestamo(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            <Plus size={13} weight="bold" />
            Nuevo Prestamo
          </button>
        </div>

        {/* Compact tab bar */}
        <SegmentedTabs
          tabs={tabs}
          active={activeTab}
          onChange={handleTabChange}
        />

        {/* Animated content */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeTab}
              custom={direction}
              variants={tabContentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <TablaVencimientos
                items={filteredMap[activeTab]}
                emptyMessage={tabEmptyMessages[activeTab]}
                onSelect={setPrestamoSeleccionado}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <PrestamoDetalleModal
        isOpen={prestamoSeleccionado !== null}
        onClose={() => setPrestamoSeleccionado(null)}
        prestamo={prestamoSeleccionado}
      />

      <PrestamoStandaloneModal
        isOpen={showNuevoPrestamo}
        onClose={() => setShowNuevoPrestamo(false)}
        onCreado={() => setShowNuevoPrestamo(false)}
      />
    </>
  );
}
