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

    // pin_hash: SHA-256 hex del pin
    // user_id (opcional): si se provee, el admin está configurando el PIN de otro usuario
    const { pin_hash, user_id: targetUserId } = await req.json();

    if (!pin_hash || typeof pin_hash !== "string" || pin_hash.length !== 64) {
      return jsonResponse(
        {
          error:
            "pin_hash debe ser un hash SHA-256 valido (64 caracteres hex)",
        },
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
      .select("empresa_id, rol_id, is_active")
      .eq("id", caller.id)
      .single();

    if (callerError || !callerUser) {
      return jsonResponse({ error: "No se pudo verificar el usuario" }, 403);
    }

    if (!callerUser.is_active) {
      return jsonResponse({ error: "Usuario inactivo" }, 403);
    }

    // Determinar si el caller es administrador (is_system)
    let callerIsAdmin = false;

    if (callerUser.rol_id) {
      const { data: callerRole } = await supabaseAdmin
        .from("roles")
        .select("is_system")
        .eq("id", callerUser.rol_id)
        .single();
      callerIsAdmin = !!callerRole?.is_system;
    }

    // ID final del usuario cuyo PIN vamos a actualizar
    const finalUserId = targetUserId ?? caller.id;

    if (targetUserId && targetUserId !== caller.id) {
      // El caller intenta actualizar el PIN de OTRO usuario
      // Solo el administrador (is_system) puede hacer esto
      if (!callerIsAdmin) {
        return jsonResponse(
          {
            error:
              "Solo el administrador puede configurar el PIN de otros usuarios",
          },
          403,
        );
      }

      // Verificar que el target pertenece a la misma empresa
      const { data: targetUser, error: targetError } = await supabaseAdmin
        .from("usuarios")
        .select("empresa_id, rol_id, is_active")
        .eq("id", targetUserId)
        .single();

      if (targetError || !targetUser) {
        return jsonResponse({ error: "Usuario no encontrado" }, 404);
      }

      if (targetUser.empresa_id !== callerUser.empresa_id) {
        return jsonResponse(
          { error: "El usuario no pertenece a tu empresa" },
          403,
        );
      }

      // Verificar que el target tiene rol con ventas.anular o is_system
      let targetTienePermiso = false;
      if (targetUser.rol_id) {
        const { data: targetRole } = await supabaseAdmin
          .from("roles")
          .select("is_system")
          .eq("id", targetUser.rol_id)
          .single();

        if (targetRole?.is_system) {
          targetTienePermiso = true;
        } else {
          const { data: permiso } = await supabaseAdmin
            .from("rol_permisos")
            .select("permiso_id, permisos!inner(slug)")
            .eq("rol_id", targetUser.rol_id)
            .eq("permisos.slug", "ventas.anular")
            .single();
          targetTienePermiso = !!permiso;
        }
      }

      if (!targetTienePermiso) {
        return jsonResponse(
          {
            error:
              "El usuario seleccionado no tiene permisos de supervisor para configurar un PIN",
          },
          403,
        );
      }
    } else {
      // El caller actualiza su PROPIO PIN
      // Debe tener ventas.anular o is_system
      let tienePermiso = callerIsAdmin;

      if (!tienePermiso && callerUser.rol_id) {
        const { data: permiso } = await supabaseAdmin
          .from("rol_permisos")
          .select("permiso_id, permisos!inner(slug)")
          .eq("rol_id", callerUser.rol_id)
          .eq("permisos.slug", "ventas.anular")
          .single();
        tienePermiso = !!permiso;
      }

      if (!tienePermiso) {
        return jsonResponse(
          {
            error:
              "No tienes permisos para configurar un PIN de supervisor",
          },
          403,
        );
      }
    }

    // Guardar el hash
    const { error: updateError } = await supabaseAdmin
      .from("usuarios")
      .update({ pin_supervisor_hash: pin_hash })
      .eq("id", finalUserId);

    if (updateError) {
      return jsonResponse(
        { error: `Error al guardar PIN: ${updateError.message}` },
        500,
      );
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error.message ?? "Error interno del servidor" },
      500,
    );
  }
});
