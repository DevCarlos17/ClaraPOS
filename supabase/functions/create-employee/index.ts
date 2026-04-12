import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
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

    const { nombre, email, password, rol_id } = await req.json();

    // Validaciones
    if (!nombre?.trim() || nombre.trim().length < 2) {
      return jsonResponse(
        { error: "El nombre debe tener al menos 2 caracteres" },
        400,
      );
    }
    if (!email?.trim()) {
      return jsonResponse({ error: "El email es requerido" }, 400);
    }
    if (!password || password.length < 6) {
      return jsonResponse(
        { error: "La contrasena debe tener al menos 6 caracteres" },
        400,
      );
    }
    if (!rol_id) {
      return jsonResponse({ error: "El rol es requerido" }, 400);
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

    // Obtener datos del caller: empresa_id y verificar que es Administrador
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

    if (!callerUser.empresa_id) {
      return jsonResponse(
        { error: "El usuario no tiene empresa asociada" },
        400,
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
          { error: "Solo el administrador puede crear empleados" },
          403,
        );
      }
    } else {
      return jsonResponse(
        { error: "Solo el administrador puede crear empleados" },
        403,
      );
    }

    // Verificar que el rol asignado pertenece a la misma empresa
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
        { error: "No puedes asignar el rol de administrador a un empleado" },
        400,
      );
    }

    // Crear usuario auth con metadata
    // El trigger handle_new_user() insertara en la tabla usuarios
    const { data: authData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          nombre: nombre.trim(),
          empresa_id: callerUser.empresa_id,
          rol_id,
        },
      });

    if (createError) {
      return jsonResponse(
        { error: `Error al crear empleado: ${createError.message}` },
        400,
      );
    }

    return jsonResponse({ success: true, userId: authData.user.id }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error.message ?? "Error interno del servidor" },
      500,
    );
  }
});
