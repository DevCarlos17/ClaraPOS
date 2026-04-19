import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
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
    const { nombre, email, password, nombre_empresa } = await req.json();

    // Validacion de inputs
    if (!nombre?.trim()) {
      return jsonResponse({ error: "El nombre es requerido" }, 400);
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
    if (!nombre_empresa?.trim()) {
      return jsonResponse(
        { error: "El nombre de la empresa es requerido" },
        400,
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Crear tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        nombre: nombre_empresa.trim(),
        email_contacto: email.trim(),
      })
      .select("id")
      .single();

    if (tenantError) {
      return jsonResponse(
        { error: `Error al crear tenant: ${tenantError.message}` },
        500,
      );
    }

    // 2. Crear empresa bajo el tenant
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .insert({
        tenant_id: tenant.id,
        nombre: nombre_empresa.trim(),
      })
      .select("id")
      .single();

    if (empresaError) {
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return jsonResponse(
        { error: `Error al crear empresa: ${empresaError.message}` },
        500,
      );
    }

    // 3. Crear registro fiscal VE con defaults
    const { error: fiscalError } = await supabaseAdmin
      .from("empresas_fiscal_ve")
      .insert({ empresa_id: empresa.id });

    if (fiscalError) {
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return jsonResponse(
        { error: `Error al crear datos fiscales: ${fiscalError.message}` },
        500,
      );
    }

    // 4. Crear roles por defecto para la empresa
    const { data: rolesData, error: rolError } = await supabaseAdmin
      .from("roles")
      .insert([
        {
          empresa_id: empresa.id,
          nombre: "Administrador",
          descripcion: "Rol de sistema con acceso total",
          is_system: true,
        },
        {
          empresa_id: empresa.id,
          nombre: "Supervisor",
          descripcion: "Acceso amplio con restricciones administrativas",
          is_system: false,
        },
        {
          empresa_id: empresa.id,
          nombre: "Cajero",
          descripcion: "Acceso limitado a operaciones de caja y ventas",
          is_system: false,
        },
      ])
      .select("id, nombre");

    if (rolError || !rolesData) {
      await supabaseAdmin
        .from("empresas_fiscal_ve")
        .delete()
        .eq("empresa_id", empresa.id);
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return jsonResponse(
        { error: `Error al crear roles: ${rolError?.message}` },
        500,
      );
    }

    const rol = rolesData.find((r: { nombre: string }) => r.nombre === "Administrador")!;

    // 5. Habilitar todos los permisos para el tenant
    const { data: permisos, error: permisosError } = await supabaseAdmin
      .from("permisos")
      .select("id")
      .eq("is_active", true);

    if (permisosError) {
      await supabaseAdmin.from("roles").delete().eq("empresa_id", empresa.id);
      await supabaseAdmin
        .from("empresas_fiscal_ve")
        .delete()
        .eq("empresa_id", empresa.id);
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return jsonResponse(
        { error: `Error al obtener permisos: ${permisosError.message}` },
        500,
      );
    }

    if (permisos && permisos.length > 0) {
      const tenantPermisos = permisos.map((p: { id: string }) => ({
        tenant_id: tenant.id,
        permiso_id: p.id,
        habilitado: true,
      }));

      const { error: tpError } = await supabaseAdmin
        .from("tenant_permisos")
        .insert(tenantPermisos);

      if (tpError) {
        await supabaseAdmin.from("roles").delete().eq("empresa_id", empresa.id);
        await supabaseAdmin
          .from("empresas_fiscal_ve")
          .delete()
          .eq("empresa_id", empresa.id);
        await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        return jsonResponse(
          {
            error: `Error al asignar permisos al tenant: ${tpError.message}`,
          },
          500,
        );
      }
    }

    // 6. Seed rol_permisos para Supervisor y Cajero
    const supervisorRol = rolesData.find(
      (r: { nombre: string }) => r.nombre === "Supervisor",
    );
    const cajeroRol = rolesData.find(
      (r: { nombre: string }) => r.nombre === "Cajero",
    );

    if (supervisorRol && cajeroRol && permisos && permisos.length > 0) {
      const supervisorSlugs = [
        "inventario.ver",
        "inventario.crear",
        "inventario.editar",
        "inventario.ajustar",
        "inventario.editar_precios",
        "ventas.crear",
        "ventas.anular",
        "clientes.gestionar",
        "clientes.credito",
        "compras.crear",
        "caja.abrir",
        "caja.cerrar",
        "caja.movimientos",
        "reportes.ver",
        "reportes.cuadre_caja",
        "config.tasas",
        "config.metodos_cobro",
        "contabilidad.gastos",
        "cxc.ver",
        "cxp.ver",
        "cxp.pagar",
        "clinica.acceso",
      ];

      const cajeroSlugs = [
        "inventario.ver",
        "ventas.crear",
        "clientes.gestionar",
        "caja.abrir",
        "caja.cerrar",
        "reportes.ver",
      ];

      const { data: allPermisos } = await supabaseAdmin
        .from("permisos")
        .select("id, slug")
        .eq("is_active", true);

      if (allPermisos) {
        const permisosBySlug = new Map(
          allPermisos.map((p: { id: string; slug: string }) => [p.slug, p.id]),
        );

        const supervisorPermisos = supervisorSlugs
          .filter((slug) => permisosBySlug.has(slug))
          .map((slug) => ({
            rol_id: supervisorRol.id,
            permiso_id: permisosBySlug.get(slug)!,
          }));

        const cajeroPermisos = cajeroSlugs
          .filter((slug) => permisosBySlug.has(slug))
          .map((slug) => ({
            rol_id: cajeroRol.id,
            permiso_id: permisosBySlug.get(slug)!,
          }));

        const rolPermisos = [...supervisorPermisos, ...cajeroPermisos];

        if (rolPermisos.length > 0) {
          const { error: rpError } = await supabaseAdmin
            .from("rol_permisos")
            .insert(rolPermisos);

          if (rpError) {
            await supabaseAdmin
              .from("tenant_permisos")
              .delete()
              .eq("tenant_id", tenant.id);
            await supabaseAdmin
              .from("roles")
              .delete()
              .eq("empresa_id", empresa.id);
            await supabaseAdmin
              .from("empresas_fiscal_ve")
              .delete()
              .eq("empresa_id", empresa.id);
            await supabaseAdmin
              .from("empresas")
              .delete()
              .eq("id", empresa.id);
            await supabaseAdmin
              .from("tenants")
              .delete()
              .eq("id", tenant.id);
            return jsonResponse(
              {
                error: `Error al asignar permisos a roles: ${rpError.message}`,
              },
              500,
            );
          }
        }
      }
    }

    // 7. Crear usuario auth con metadata
    //    El trigger handle_new_user() insertara en la tabla usuarios
    //    usando empresa_id y rol_id del user_metadata
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          nombre: nombre.trim(),
          empresa_id: empresa.id,
          rol_id: rol.id,
        },
      });

    if (authError) {
      // Rollback completo
      await supabaseAdmin
        .from("tenant_permisos")
        .delete()
        .eq("tenant_id", tenant.id);
      await supabaseAdmin.from("roles").delete().eq("empresa_id", empresa.id);
      await supabaseAdmin
        .from("empresas_fiscal_ve")
        .delete()
        .eq("empresa_id", empresa.id);
      await supabaseAdmin.from("empresas").delete().eq("id", empresa.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return jsonResponse(
        { error: `Error al crear usuario: ${authError.message}` },
        400,
      );
    }

    // 8. Seed plan de cuentas y configuracion contable
    // No-critico: si falla el usuario ya esta creado y puede configurarlo manualmente
    await supabaseAdmin.rpc("seed_plan_cuentas", {
      p_empresa_id: empresa.id,
      p_created_by: null,
    });
    await supabaseAdmin.rpc("seed_cuentas_config", {
      p_empresa_id: empresa.id,
      p_created_by: null,
    });

    return jsonResponse(
      {
        success: true,
        userId: authData.user.id,
        empresaId: empresa.id,
        tenantId: tenant.id,
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      { error: error.message ?? "Error interno del servidor" },
      500,
    );
  }
});
