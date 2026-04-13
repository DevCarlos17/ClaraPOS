import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({}, 200);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }

    const { userId, rol_id, is_active, nombre, telefono, password } = await req.json();

    if (!userId) {
      return jsonResponse({ error: "userId es requerido" }, 400);
    }

    if (nombre !== undefined && nombre.trim().length < 2) {
      return jsonResponse(
        { error: "El nombre debe tener al menos 2 caracteres" },
        400,
      );
    }

    if (password !== undefined && password.length < 6) {
      return jsonResponse(
        { error: "La contrasena debe tener al menos 6 caracteres" },
        400,
      );
    }

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
      return jsonResponse({ error: "Token invalido" }, 401);
    }

    // Obtener datos del caller
    const { data: callerUser, error: callerError } = await supabaseAdmin
      .from("usuarios")
      .select("empresa_id, rol_id")
      .eq("id", caller.id)
      .single();

    if (callerError || !callerUser) {
      return jsonResponse(
        { error: "No se pudo verificar el usuario" },
        403,
      );
    }

    // Verificar que el caller es Administrador (is_system=true)
    if (callerUser.rol_id) {
      const { data: callerRole } = await supabaseAdmin
        .from("roles")
        .select("is_system")
        .eq("id", callerUser.rol_id)
        .single();

      if (!callerRole?.is_system) {
        return jsonResponse(
          { error: "Solo el administrador puede modificar empleados" },
          403,
        );
      }
    } else {
      return jsonResponse(
        { error: "Solo el administrador puede modificar empleados" },
        403,
      );
    }

    // No permitir modificar su propio registro
    if (userId === caller.id) {
      return jsonResponse(
        { error: "No puedes modificar tu propio perfil desde aqui" },
        400,
      );
    }

    // Verificar que el target pertenece a la misma empresa
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("usuarios")
      .select("empresa_id")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return jsonResponse({ error: "Empleado no encontrado" }, 404);
    }

    if (targetUser.empresa_id !== callerUser.empresa_id) {
      return jsonResponse(
        { error: "El empleado no pertenece a tu empresa" },
        403,
      );
    }

    // Si se cambia el rol, verificar que pertenece a la misma empresa
    if (rol_id !== undefined) {
      const { data: targetRole, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("id, empresa_id, is_system")
        .eq("id", rol_id)
        .single();

      if (roleError || !targetRole) {
        return jsonResponse({ error: "El rol especificado no existe" }, 400);
      }

      if (targetRole.empresa_id !== callerUser.empresa_id) {
        return jsonResponse(
          { error: "El rol no pertenece a tu empresa" },
          403,
        );
      }

      if (targetRole.is_system) {
        return jsonResponse(
          { error: "No puedes asignar el rol de sistema a otro usuario" },
          400,
        );
      }
    }

    // Construir campos a actualizar
    const updates: Record<string, unknown> = {};
    if (rol_id !== undefined) updates.rol_id = rol_id;
    if (is_active !== undefined) updates.is_active = is_active;
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (telefono !== undefined) updates.telefono = telefono?.trim() || null;

    // Cambiar contrasena via Supabase Auth
    if (password !== undefined) {
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password },
      );
      if (pwError) {
        return jsonResponse(
          { error: `Error al cambiar contrasena: ${pwError.message}` },
          500,
        );
      }
    }

    if (Object.keys(updates).length === 0 && password === undefined) {
      return jsonResponse(
        { error: "No se especificaron campos a actualizar" },
        400,
      );
    }

    // Actualizar usuario en la tabla (si hay campos de tabla)
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("usuarios")
        .update(updates)
        .eq("id", userId);

      if (updateError) {
        return jsonResponse(
          { error: `Error al actualizar: ${updateError.message}` },
          500,
        );
      }
    }

    // Si se desactiva, banear en Supabase Auth para bloquear login
    if (is_active === false) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // ~100 years
      });
    }

    // Si se reactiva, desbanear
    if (is_active === true) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error.message ?? "Error interno del servidor" },
      500,
    );
  }
});
