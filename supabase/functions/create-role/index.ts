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

    const { nombre, descripcion, permiso_ids } = await req.json();

    // Validaciones
    if (!nombre?.trim() || nombre.trim().length < 2) {
      return jsonResponse(
        { error: "El nombre del rol debe tener al menos 2 caracteres" },
        400,
      );
    }
    if (!Array.isArray(permiso_ids) || permiso_ids.length === 0) {
      return jsonResponse(
        { error: "Debes seleccionar al menos un permiso" },
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
          { error: "Solo el administrador puede crear roles" },
          403,
        );
      }
    } else {
      return jsonResponse(
        { error: "Solo el administrador puede crear roles" },
        403,
      );
    }

    // Verificar nombre unico en la empresa
    const { data: existingRole } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("empresa_id", callerUser.empresa_id)
      .ilike("nombre", nombre.trim())
      .maybeSingle();

    if (existingRole) {
      return jsonResponse(
        { error: "Ya existe un rol con ese nombre en tu empresa" },
        400,
      );
    }

    // Crear el rol
    const { data: newRole, error: roleError } = await supabaseAdmin
      .from("roles")
      .insert({
        empresa_id: callerUser.empresa_id,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        is_system: false,
        is_active: true,
        created_by: caller.id,
        updated_by: caller.id,
      })
      .select("id")
      .single();

    if (roleError || !newRole) {
      return jsonResponse(
        { error: `Error al crear rol: ${roleError?.message ?? "desconocido"}` },
        500,
      );
    }

    // Insertar permisos del rol
    const rolPermisos = permiso_ids.map((permisoId: string) => ({
      empresa_id: callerUser.empresa_id,
      rol_id: newRole.id,
      permiso_id: permisoId,
      granted_by: caller.id,
    }));

    const { error: permisosError } = await supabaseAdmin
      .from("rol_permisos")
      .insert(rolPermisos);

    if (permisosError) {
      return jsonResponse(
        { error: `Error al asignar permisos: ${permisosError.message}` },
        500,
      );
    }

    return jsonResponse({ success: true, roleId: newRole.id }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error.message ?? "Error interno del servidor" },
      500,
    );
  }
});
