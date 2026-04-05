import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const { nombre, email, password, nombre_empresa } = await req.json();

    // Validacion de inputs
    if (!nombre?.trim()) {
      return new Response(JSON.stringify({ error: "El nombre es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email?.trim()) {
      return new Response(JSON.stringify({ error: "El email es requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({
          error: "La contrasena debe tener al menos 6 caracteres",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!nombre_empresa?.trim()) {
      return new Response(
        JSON.stringify({ error: "El nombre de la empresa es requerido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Crear cliente Supabase con service_role para operaciones admin
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Crear la empresa
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .insert({ nombre: nombre_empresa.trim() })
      .select("id")
      .single();

    if (empresaError) {
      return new Response(
        JSON.stringify({
          error: `Error al crear empresa: ${empresaError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Crear usuario auth con metadata (el trigger creara la fila en usuarios)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          nombre: nombre.trim(),
          level: 1,
          empresa_id: empresa.id,
        },
      });

    if (authError) {
      // Rollback: eliminar la empresa creada
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      return new Response(
        JSON.stringify({
          error: `Error al crear usuario: ${authError.message}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: authData.user.id,
        empresaId: empresa.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
