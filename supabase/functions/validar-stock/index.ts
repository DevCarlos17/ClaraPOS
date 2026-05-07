import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface LineaValidar {
  producto_id: string;
  cantidad: number;
  nombre: string;
  tipo: string; // 'P' | 'S' | 'C'
}

interface StockFaltante {
  nombre: string;
  disponible: number;
  solicitado: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({}, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo no permitido" }, 405);
  }

  try {
    // Autenticacion
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const body = await req.json() as {
      lineas: LineaValidar[];
      empresa_id: string;
    };

    const { lineas, empresa_id } = body;

    if (!empresa_id) {
      return jsonResponse({ error: "empresa_id requerido" }, 400);
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return jsonResponse({ ok: true }, 200);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verificar JWT del cajero
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return jsonResponse({ error: "Token invalido" }, 401);
    }

    // Verificar que el usuario pertenece a la empresa solicitada
    const { data: callerUser, error: userError } = await supabaseAdmin
      .from("usuarios")
      .select("empresa_id")
      .eq("id", caller.id)
      .single();

    if (userError || !callerUser || callerUser.empresa_id !== empresa_id) {
      return jsonResponse({ error: "No autorizado para esta empresa" }, 403);
    }

    // Solo productos tipo 'P' consumen stock directamente.
    // Los servicios consumen ingredientes via receta, pero esa validacion
    // ya ocurre dentro de crearVenta. Aqui solo bloqueamos productos fisicos.
    const productosP = lineas.filter(
      (l) => l.tipo === "P" && l.cantidad > 0,
    );

    if (productosP.length === 0) {
      return jsonResponse({ ok: true }, 200);
    }

    const productIds = productosP.map((l) => l.producto_id);

    // Leer stock actual desde PostgreSQL (fuente de verdad del servidor)
    const { data: stocks, error: stockError } = await supabaseAdmin
      .from("productos")
      .select("id, nombre, stock")
      .in("id", productIds)
      .eq("empresa_id", empresa_id);

    if (stockError || !stocks) {
      return jsonResponse({ error: "Error al consultar stock en servidor" }, 500);
    }

    const faltantes: StockFaltante[] = [];

    for (const linea of productosP) {
      const producto = stocks.find((p) => p.id === linea.producto_id);

      if (!producto) {
        faltantes.push({
          nombre: linea.nombre,
          disponible: 0,
          solicitado: linea.cantidad,
        });
        continue;
      }

      const stockActual = parseFloat(producto.stock as string) || 0;

      if (stockActual < linea.cantidad - 0.001) {
        faltantes.push({
          nombre: producto.nombre as string,
          disponible: stockActual,
          solicitado: linea.cantidad,
        });
      }
    }

    if (faltantes.length > 0) {
      const detalle = faltantes
        .map(
          (f) =>
            `${f.nombre} (disponible: ${f.disponible.toFixed(3)}, solicitado: ${f.solicitado})`,
        )
        .join("; ");

      return jsonResponse(
        {
          ok: false,
          error: `Stock insuficiente en servidor: ${detalle}`,
          faltantes,
        },
        409,
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error("validar-stock error:", err);
    return jsonResponse({ error: "Error interno del servidor" }, 500);
  }
});
