import { useQuery } from "@powersync/react";
import { db } from "@/core/db/powersync/db";
import { useCurrentUser } from "@/core/hooks/use-current-user";
import { v4 as uuidv4 } from "uuid";
import {
  generarAsientos,
  reversarAsientos,
} from "@/features/contabilidad/lib/generar-asientos";
import type { LineaAsiento } from "@/features/contabilidad/lib/generar-asientos";

// ─── Interfaces ─────────────────────────────────────────────
// --- lineas
export interface AsientoContable {
  id: string;
  empresa_id: string;
  nro_asiento: string;
  fecha_registro: string;
  modulo_origen: string;
  doc_origen_id: string | null;
  doc_origen_ref: string | null;
  cuenta_contable_id: string;
  banco_empresa_id: string | null;
  monto: string;
  detalle: string;
  estado: string;
  parent_id: string | null;
  usuario_id: string;
  created_at: string;
  // JOINs
  cuenta_codigo?: string;
  cuenta_nombre?: string;
  banco_nombre?: string;
}

export interface FiltrosLibro {
  fechaDesde?: string;
  fechaHasta?: string;
  modulo?: string;
  estado?: string;
  cuentaId?: string;
  bancoId?: string;
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Lista de asientos contables con JOIN a plan_cuentas y bancos_empresa.
 * Ordenados por fecha_registro descendente.
 */
export function useLibroContable(filtros: FiltrosLibro = {}) {
  const { user } = useCurrentUser();
  const empresaId = user?.empresa_id ?? "";

  const conditions: string[] = ["lc.empresa_id = ?"];
  const params: unknown[] = [empresaId];

  if (filtros.fechaDesde) {
    conditions.push("lc.fecha_registro >= ?");
    params.push(`${filtros.fechaDesde}T00:00:00.000Z`);
  }
  if (filtros.fechaHasta) {
    conditions.push("lc.fecha_registro <= ?");
    params.push(`${filtros.fechaHasta}T23:59:59.999Z`);
  }
  if (filtros.modulo) {
    conditions.push("lc.modulo_origen = ?");
    params.push(filtros.modulo);
  }
  if (filtros.estado) {
    conditions.push("lc.estado = ?");
    params.push(filtros.estado);
  }
  if (filtros.cuentaId) {
    conditions.push("lc.cuenta_contable_id = ?");
    params.push(filtros.cuentaId);
  }
  if (filtros.bancoId) {
    conditions.push("lc.banco_empresa_id = ?");
    params.push(filtros.bancoId);
  }

  const where = conditions.join(" AND ");

  const { data, isLoading } = useQuery(
    `SELECT lc.*,
       pc.codigo as cuenta_codigo,
       pc.nombre as cuenta_nombre,
       be.nombre_banco as banco_nombre
     FROM libro_contable lc
     JOIN plan_cuentas pc ON lc.cuenta_contable_id = pc.id
     LEFT JOIN bancos_empresa be ON lc.banco_empresa_id = be.id
     WHERE ${where}
     ORDER BY lc.fecha_registro DESC, lc.nro_asiento DESC`,
    params,
  );

  return { asientos: (data ?? []) as AsientoContable[], isLoading };
}

// ─── Funciones de escritura ──────────────────────────────────

/**
 * Crea un movimiento manual que respeta partida doble.
 */
export async function crearAsientoManual(data: {
  lineas: LineaAsiento[];
  doc_origen_ref?: string;
  empresa_id: string;
  usuario_id: string;
}): Promise<string[]> {
  let ids: string[] = [];

  await db.writeTransaction(async (tx) => {
    ids = await generarAsientos(tx, {
      empresaId: data.empresa_id,
      modulo: "MANUAL",
      docOrigenRef: data.doc_origen_ref ?? null,
      lineas: data.lineas,
      usuarioId: data.usuario_id,
    });
  });

  return ids;
}

/**
 * Concilia un asiento (PENDIENTE -> CONCILIADO).
 */
export async function conciliarAsiento(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      "SELECT estado FROM libro_contable WHERE id = ?",
      [id],
    );
    if (!result.rows || result.rows.length === 0) {
      throw new Error("Asiento no encontrado");
    }
    const asiento = result.rows.item(0) as { estado: string };
    if (asiento.estado !== "PENDIENTE") {
      throw new Error(
        `El asiento no esta en estado PENDIENTE (estado actual: ${asiento.estado})`,
      );
    }

    await tx.execute(
      "UPDATE libro_contable SET estado = 'CONCILIADO' WHERE id = ?",
      [id],
    );
  });
}

/**
 * Reversa uno o varios asientos (crea contra-asientos y marca originales como ANULADO).
 */
export async function reversarAsientoManual(
  asientoId: string,
  empresaId: string,
  usuarioId: string,
): Promise<string[]> {
  let ids: string[] = [];

  await db.writeTransaction(async (tx) => {
    // Verificar estado
    const result = await tx.execute(
      "SELECT estado FROM libro_contable WHERE id = ? AND empresa_id = ?",
      [asientoId, empresaId],
    );
    if (!result.rows || result.rows.length === 0) {
      throw new Error("Asiento no encontrado");
    }
    const asiento = result.rows.item(0) as { estado: string };
    if (asiento.estado !== "PENDIENTE") {
      throw new Error(
        `Solo se pueden reversar asientos PENDIENTES (estado actual: ${asiento.estado})`,
      );
    }

    ids = await reversarAsientos(tx, {
      empresaId,
      asientosIds: [asientoId],
      usuarioId,
    });
  });

  return ids;
}

/**
 * Genera numero de asiento sin insertarlo (para preview).
 */
export async function generarNroAsiento(empresaId: string): Promise<string> {
  return `LC-${uuidv4().slice(0, 6).toUpperCase()}`;
}
