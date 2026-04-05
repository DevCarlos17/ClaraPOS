import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, level, activo, nombre } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (level !== undefined && ![2, 3].includes(level)) {
      return new Response(
        JSON.stringify({
          error: "El nivel debe ser 2 (Supervisor) o 3 (Cajero)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (nombre !== undefined && nombre.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "El nombre debe tener al menos 2 caracteres" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Crear cliente admin
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verificar identidad del caller via JWT
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Token invalido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener datos del caller
    const { data: callerUser, error: callerError } = await supabaseAdmin
      .from("usuarios")
      .select("level, empresa_id")
      .eq("id", caller.id)
      .single();

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "No se pudo verificar el usuario" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (callerUser.level !== 1) {
      return new Response(
        JSON.stringify({
          error: "Solo el propietario puede modificar empleados",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // No permitir modificar su propio registro
    if (userId === caller.id) {
      return new Response(
        JSON.stringify({
          error: "No puedes modificar tu propio perfil desde aqui",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verificar que el target pertenece a la misma empresa
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("usuarios")
      .select("empresa_id")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return new Response(JSON.stringify({ error: "Empleado no encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetUser.empresa_id !== callerUser.empresa_id) {
      return new Response(
        JSON.stringify({ error: "El empleado no pertenece a tu empresa" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Construir campos a actualizar
    const updates: Record<string, unknown> = {};
    if (level !== undefined) updates.level = level;
    if (activo !== undefined) updates.activo = activo;
    if (nombre !== undefined) updates.nombre = nombre.trim();

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: "No se especificaron campos a actualizar" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Actualizar usuarios
    const { error: updateError } = await supabaseAdmin
      .from("usuarios")
      .update(updates)
      .eq("id", userId);

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: `Error al actualizar: ${updateError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Si se desactiva, banear en Supabase Auth para bloquear login
    if (activo === false) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      // ban_duration: 'none' means permanent ban
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        // @ts-ignore -- Supabase admin API
        banned: true,
      });
    }

    // Si se reactiva, desbanear
    if (activo === true) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        // @ts-ignore -- Supabase admin API
        banned: false,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message ?? "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
