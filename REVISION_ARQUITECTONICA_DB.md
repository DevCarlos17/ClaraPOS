# Revision Arquitectonica y Propuesta de Refactorizacion de Base de Datos

**Proyecto**: ClaraPOS - Sistema POS + Gestion de Negocio SaaS Multi-Tenant
**Fecha**: 2026-04-11
**Autor**: Arquitecto Senior de Bases de Datos
**Version**: 1.0

---

## 1. Resumen Ejecutivo

### 1.1 Vista General de la Arquitectura Actual

ClaraPOS opera actualmente con **18 tablas** en PostgreSQL (Supabase), organizadas en un esquema plano con aislamiento multi-tenant basado en `empresa_id`. El sistema implementa:

- **Multi-tenancy simple**: Una tabla `empresas` como raiz, con `empresa_id` en todas las tablas de negocio
- **Permisos por nivel**: Sistema basado en 3 niveles (1=Dueno, 2=Supervisor, 3=Cajero) con tabla `level_permissions`
- **Inmutabilidad financiera**: Triggers que previenen UPDATE/DELETE en registros contables (kardex, pagos, tasas, etc.)
- **RLS con SECURITY DEFINER**: Funcion `current_empresa_id()` para evitar recursion infinita en policies
- **Bimonetario**: USD como moneda base con conversion a Bolivares via tasa de cambio
- **Offline-first**: Sincronizacion via PowerSync con SQLite local

### 1.2 Que Introduce la Nueva Capa

Las nuevas tablas (~35 tablas) introducen **cinco capas arquitectonicas nuevas**:

| Capa | Tablas | Proposito |
|------|--------|-----------|
| **SaaS Platform** | 6 tablas | Super-tenant, apps, planes, suscripciones |
| **Multi-tenant Mejorado** | 5 tablas | Empresas mejoradas, RBAC granular |
| **Fiscal Venezolano** | 4 tablas | Cumplimiento fiscal (IVA, IGTF, ISLR, SENIAT) |
| **Inventario Mejorado** | 11 tablas | Depositos, marcas, unidades, stock separado, kardex mejorado |
| **Compras Mejorado** | 9 tablas | Facturas de compra, retenciones, notas fiscales |

### 1.3 Impacto Arquitectonico

La nueva capa transforma ClaraPOS de un **sistema POS aislado** a un **ecosistema SaaS multi-aplicacion** con:

- Doble aislamiento: `id_tenant` (plataforma) + `id_empresa` (negocio)
- RBAC granular reemplazando permisos por nivel
- Cumplimiento fiscal venezolano completo
- Inventario multi-deposito con stock separado
- Compras con retenciones fiscales

### 1.4 Evaluacion General

**Clasificacion: Necesita Mejoras**

La vision arquitectonica es correcta y necesaria para la evolucion del producto, pero la implementacion presenta:

- Inconsistencias de nomenclatura severas (mezcla de convenciones)
- Redundancia de datos en columnas desnormalizadas (ej. `rol_name` duplicado)
- Typos en nombres de columnas (`uptade_At`)
- Falta de estandarizacion entre tablas actuales y nuevas
- Complejidad de migracion subestimada

---

## 2. Analisis del Esquema Actual

### 2.1 Problemas Identificados

#### P1: Columnas `empresa_id` son NULLABLE

| Campo | Detalle |
|-------|---------|
| **Descripcion** | Las 13 columnas `empresa_id` agregadas via `ALTER TABLE ADD COLUMN` no tienen `NOT NULL` |
| **Por que es problema** | Permite insertar registros sin empresa, rompiendo el aislamiento multi-tenant. Un registro sin `empresa_id` seria invisible para todos los tenants via RLS, creando datos huerfanos |
| **Nivel de riesgo** | **Alto** |
| **Solucion** | `ALTER TABLE <tabla> ALTER COLUMN empresa_id SET NOT NULL;` para todas las tablas de negocio. Antes, verificar y limpiar datos huerfanos existentes |

#### P2: Ausencia de Campos de Auditoria (created_by / updated_by)

| Campo | Detalle |
|-------|---------|
| **Descripcion** | Ninguna tabla actual registra quien creo o modifico el registro. Solo `movimientos_inventario` y `ventas` tienen `usuario_id` |
| **Por que es problema** | Imposible rastrear quien hizo cambios en departamentos, productos, clientes, metodos de pago. Critico para auditoria empresarial y cumplimiento fiscal |
| **Nivel de riesgo** | **Medio** |
| **Solucion** | Agregar `created_by UUID REFERENCES usuarios(id)` y `updated_by UUID REFERENCES usuarios(id)` a todas las tablas mutables |

#### P3: Stock Almacenado Directamente en `productos.stock`

| Campo | Detalle |
|-------|---------|
| **Descripcion** | El stock actual se guarda como columna en `productos` y se actualiza via el frontend tras insertar un movimiento de kardex |
| **Por que es problema** | La actualizacion no es atomica a nivel de DB (depende de que el frontend ejecute ambas operaciones). No soporta multi-deposito. Race conditions posibles en concurrencia |
| **Nivel de riesgo** | **Alto** |
| **Solucion** | Crear tabla `inventario_stock` separada con stock por producto/deposito. Usar trigger en `movimientos_inventario` para actualizar stock automaticamente, similar al patron actual de `saldo_actual` en clientes |

#### P4: Sin Catalogo de Impuestos

| Campo | Detalle |
|-------|---------|
| **Descripcion** | No existen tablas para IVA, IGTF ni otros impuestos. Las tasas impositivas estan hardcodeadas en el frontend |
| **Por que es problema** | Cambios en tasas impositivas requieren despliegue de codigo. No hay trazabilidad de que tasa se aplico a cada transaccion. Incumplimiento con normativa SENIAT |
| **Nivel de riesgo** | **Alto** |
| **Solucion** | Crear tabla de impuestos con tasas vigentes y referencia en detalle de venta/compra |

#### P5: Sin Concepto de Depositos/Almacenes

| Campo | Detalle |
|-------|---------|
| **Descripcion** | El inventario es global por empresa. No existe forma de separar stock por ubicacion fisica |
| **Por que es problema** | Limita el crecimiento a negocios con una sola ubicacion. Clinicas esteticas frecuentemente tienen multiples sedes |
| **Nivel de riesgo** | **Medio** |
| **Solucion** | Introducir tabla `inventario_depositos` y modificar stock/kardex para operar por deposito |

#### P6: Tabla `bancos` en PowerSync sin Correspondencia en SQL

| Campo | Detalle |
|-------|---------|
| **Descripcion** | El schema de PowerSync define una tabla `bancos` (banco, numero_cuenta, cedula_rif, activo, empresa_id) que no existe en las migraciones SQL |
| **Por que es problema** | Discrepancia entre el schema local (PowerSync/SQLite) y la base de datos remota (PostgreSQL). Puede causar errores de sincronizacion |
| **Nivel de riesgo** | **Medio** |
| **Solucion** | Crear la tabla `bancos` en PostgreSQL o eliminarla del schema de PowerSync si no se usa |

#### P7: Funcion de Inmutabilidad Reutilizada Incorrectamente

| Campo | Detalle |
|-------|---------|
| **Descripcion** | Los triggers de inmutabilidad para `tasas_cambio`, `detalle_venta`, `pagos`, `compras` y `detalle_compra` reutilizan la funcion `prevent_kardex_mutation()` cuyo mensaje dice "Los movimientos de inventario son inmutables" |
| **Por que es problema** | Mensaje de error confuso. Si un usuario intenta modificar un pago, recibe un error que habla de "movimientos de inventario" |
| **Nivel de riesgo** | **Bajo** |
| **Solucion** | Crear una funcion generica `prevent_mutation()` con mensaje parametrizado usando `TG_TABLE_NAME`, o funciones separadas por tabla |

#### P8: Indice UNIQUE en `departamentos.codigo` es Global, no por Empresa

| Campo | Detalle |
|-------|---------|
| **Descripcion** | `departamentos.codigo` tiene `UNIQUE` global, pero deberia ser unico solo dentro de la empresa |
| **Por que es problema** | La empresa A no puede usar el codigo "PELUQ" si la empresa B ya lo tiene. Rompe el aislamiento multi-tenant |
| **Nivel de riesgo** | **Alto** |
| **Solucion** | Reemplazar `UNIQUE(codigo)` por `UNIQUE(empresa_id, codigo)`. Aplicar lo mismo a `productos.codigo`, `clientes.identificacion`, `proveedores.rif`, `ventas.nro_factura`, `notas_credito.nro_ncr` |

#### P9: Catalogo de Unidades de Medida Limitado

| Campo | Detalle |
|-------|---------|
| **Descripcion** | Solo existen dos opciones de medida hardcodeadas: `'UND'` y `'GRA'` como CHECK constraint |
| **Por que es problema** | No soporta otras unidades comunes (litros, mililitros, kilogramos, metros, cajas). Requiere migracion SQL para agregar nuevas unidades |
| **Nivel de riesgo** | **Medio** |
| **Solucion** | Crear tabla catalogo `inventario_unidades` con conversion entre unidades |

#### P10: Sin Soporte para Jerarquia de Departamentos

| Campo | Detalle |
|-------|---------|
| **Descripcion** | `departamentos` es una tabla plana sin posibilidad de subdepartamentos |
| **Por que es problema** | Limita la organizacion del catalogo en negocios con categorias complejas. Por ejemplo: Estetica > Facial > Limpieza |
| **Nivel de riesgo** | **Bajo** |
| **Solucion** | Agregar columna `parent_id UUID REFERENCES departamentos(id) NULL` como proponen las nuevas tablas |

### 2.2 Resumen de Problemas del Esquema Actual

| # | Problema | Riesgo | Prioridad |
|---|----------|--------|-----------|
| P1 | empresa_id NULLABLE | Alto | Urgente |
| P2 | Sin auditoria created_by/updated_by | Medio | Alta |
| P3 | Stock en productos directamente | Alto | Alta |
| P4 | Sin catalogo de impuestos | Alto | Alta |
| P5 | Sin depositos/almacenes | Medio | Media |
| P6 | Tabla bancos sin SQL | Medio | Media |
| P7 | Mensaje inmutabilidad generico | Bajo | Baja |
| P8 | UNIQUE global en vez de por empresa | Alto | Urgente |
| P9 | Unidades de medida hardcodeadas | Medio | Media |
| P10 | Sin jerarquia de departamentos | Bajo | Baja |

---

## 3. Analisis de las Nuevas Tablas

### 3.1 Capa SaaS Platform

#### table_tenant

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Raiz del ecosistema SaaS. Representa al suscriptor que puede tener multiples empresas y aplicaciones |
| **Fortalezas** | Permite modelo multi-app. `config_global JSONB` es flexible para configuraciones por tenant |
| **Debilidades** | Solo tiene `nombre_usuario` y `email_contacto`. Faltan campos de contacto (telefono, pais). `nombre_usuario` es ambiguo (deberia ser `nombre_comercial` o `razon_social`) |
| **Riesgos** | Si `config_global` crece sin esquema, puede volverse inmanejable. No tiene campo `activo` |
| **Mejoras** | Agregar `is_active`, `pais`, `telefono`. Definir schema JSON para `config_global`. Renombrar a `tenants` (sin prefijo `table_`) |

#### table_apps

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de aplicaciones del ecosistema (ej. ClaraPOS, ClaraClinic, etc.) |
| **Fortalezas** | Permite gestionar multiples aplicaciones bajo un mismo tenant |
| **Debilidades** | Tabla global (sin tenant). No tiene `updated_at`. `app_saas VARCHAR(20)` como slug es buena idea pero deberia ser `slug` |
| **Riesgos** | Tabla de bajo riesgo, es un catalogo simple |
| **Mejoras** | Agregar `updated_at`. Renombrar `app_saas` a `slug` |

#### table_planes

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Define planes de suscripcion por aplicacion |
| **Fortalezas** | Vincula planes a apps. Incluye moneda y frecuencia |
| **Debilidades** | `plan_frecuencia_dias` como INT es limitado (no expresa "mensual", "anual" claramente). Faltan campos como `max_usuarios`, `max_empresas`, `features JSONB` |
| **Riesgos** | Sin limites de uso por plan, no se puede controlar el acceso a features |
| **Mejoras** | Agregar `limites JSONB` para features por plan. Considerar `intervalo TEXT CHECK IN ('mensual','trimestral','anual')` |

#### table_suscripciones_pagos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Registro de pagos de suscripcion del tenant |
| **Fortalezas** | Traza completa con periodo desde/hasta y referencia unica |
| **Debilidades** | Nombre confuso (mezcla suscripcion + pago). Falta una tabla `suscripciones` separada que registre el estado activo del tenant |
| **Riesgos** | Sin tabla de suscripciones, no hay forma directa de saber si un tenant esta al dia |
| **Mejoras** | Separar en `suscripciones` (estado, plan_id, fecha_inicio, fecha_fin) y `pagos_suscripcion` (pagos individuales) |

#### table_user_access

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Controla el acceso de un tenant a una aplicacion con fecha de vencimiento |
| **Fortalezas** | Permite dar acceso granular por app |
| **Debilidades** | `status_acceso` como texto sin CHECK. No tiene `created_at` ni `created_by`. Falta `id_empresa` (el acceso es a nivel tenant, no empresa) |
| **Riesgos** | Sin validacion de status, podrian insertarse valores invalidos |
| **Mejoras** | Agregar CHECK constraint para status. Agregar `created_at` |

#### table_metodos_pago_nexo21

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Metodos de pago para cobrar suscripciones a la plataforma |
| **Fortalezas** | Separacion correcta de metodos de pago de la plataforma vs negocio |
| **Debilidades** | Nombre poco profesional (`nexo21` es marca, no dominio). Columnas con nombres inconsistentes (`nro_cedula_meto_pago` - typo `meto`, `Moneda_metodo_pago` con mayuscula) |
| **Riesgos** | Bajo - tabla administrativa interna |
| **Mejoras** | Renombrar a `plataforma_metodos_pago`. Corregir typos y casing |

### 3.2 Capa Multi-Tenant Mejorada

#### table_empresas

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza la tabla `empresas` actual. Agrega vinculacion al tenant y datos fiscales base |
| **Fortalezas** | `id_tenant` vincula al super-tenant. `config_json JSONB` para configuracion flexible. `moneda_base`, `timezone` |
| **Debilidades** | `id_fiscal_base` apunta a fiscal pero no es FK explicita en la definicion. No tiene `updated_at`. Falta `updated_by` |
| **Riesgos** | `config_json` sin esquema puede acumular datos no validados |
| **Mejoras** | Agregar `updated_at`, `updated_by`. Documentar esquema de `config_json` |

#### table_usuarios_empresa

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza `usuarios`. Vincula auth.users con empresa via relacion muchos-a-muchos implicita |
| **Fortalezas** | `id_auth_user` UNIQUE vincula correctamente con Supabase Auth. RBAC via `id_rol` |
| **Debilidades** | **`uptade_At` es un typo** (falta la 'd' en 'update'). `rol_name VARCHAR(50)` es redundante con `table_usuarios_roles.nombre_rol`. Tiene `id_tenant` + `id_empresa` + `id_rol` + `rol_name` - demasiada desnormalizacion |
| **Riesgos** | `rol_name` puede desincronizarse del rol real si se cambia el nombre del rol |
| **Mejoras** | Corregir `uptade_At` -> `updated_at`. Eliminar `rol_name` (ya se obtiene via JOIN con roles). Eliminar `id_tenant` si siempre se puede derivar de `id_empresa` |

#### table_usuarios_roles

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de roles por empresa. Reemplaza el sistema de niveles (1, 2, 3) |
| **Fortalezas** | Roles personalizables por empresa. Incluye auditoria (created_by, updated_by) |
| **Debilidades** | `id_tenant` puede ser redundante si ya se vincula via `id_empresa` |
| **Riesgos** | Bajo. La migracion de niveles a roles requiere mapeo cuidadoso |
| **Mejoras** | Agregar campo `is_system BOOLEAN DEFAULT FALSE` para proteger roles base de modificaciones |

#### table_usuarios_permisos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo global de permisos disponibles (modulo + slug) |
| **Fortalezas** | `slug_permiso UNIQUE` permite referencia estable. Bien normalizado como catalogo global |
| **Debilidades** | Sin `is_active` ni `created_at`. Si se elimina un permiso, se rompen referencias |
| **Riesgos** | Tabla critica - cambios afectan todos los roles de todos los tenants |
| **Mejoras** | Agregar `is_active`, `created_at`. Usar soft-delete en vez de DELETE |

#### table_rol_permisos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Tabla puente entre roles y permisos (RBAC) |
| **Fortalezas** | Incluye `granted_by` y `granted_at` para auditoria |
| **Debilidades** | `rol_name VARCHAR(50)` es redundante (igual que en usuarios_empresa). Falta `UNIQUE(id_rol, id_permiso)` para evitar duplicados |
| **Riesgos** | Sin UNIQUE constraint, un rol podria tener el mismo permiso registrado multiples veces |
| **Mejoras** | Eliminar `rol_name`. Agregar `UNIQUE(id_rol, id_permiso)` |

### 3.3 Capa Fiscal Venezolana

#### table_empresas_fiscal_ve

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Extension fiscal venezolana de la empresa. Separacion correcta de datos fiscales especificos del pais |
| **Fortalezas** | Excelente separacion de concerns. Permite extender a otros paises sin tocar tabla base. Campos SENIAT completos |
| **Debilidades** | `porcentaje_retencion` deberia ser `porcentaje_retencion_iva`. Falta `created_at` y `created_by` |
| **Riesgos** | Bajo. Es una extension bien disenada |
| **Mejoras** | Agregar auditoria completa |

#### table_global_tipo_persona_ve

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de tipos de persona fiscal (V, E, J, G, P, C) con regex de validacion |
| **Fortalezas** | `formato_regexp` permite validar documentos de identidad dinamicamente. `codigo_letra UNIQUE` es compacto |
| **Debilidades** | Nombre con prefijo `global_` inconsistente |
| **Riesgos** | Bajo - es un catalogo de referencia casi estatico |
| **Mejoras** | Renombrar a `tipos_persona_ve` |

#### table_monedas

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de monedas con ISO 4217 |
| **Fortalezas** | Estandarizado con `codigo_iso`. `es_moneda_base` permite configuracion flexible |
| **Debilidades** | Falta `created_at` y `is_active`. Deberia ser tabla global (sin tenant) |
| **Riesgos** | Bajo |
| **Mejoras** | Agregar `created_at`, `is_active` |

#### table_inventario_impuestos_ve

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de impuestos venezolanos por empresa (IVA, IGTF, INCO) |
| **Fortalezas** | Permite tasas por empresa. `tipo_tributo` con CHECK. `codigo_seniat` para declaraciones |
| **Debilidades** | `uptade_At` - mismo typo recurrente. Nombre con `inventario_` pero aplica tambien a ventas/compras |
| **Riesgos** | Medio - impuestos incorrectos generan problemas fiscales |
| **Mejoras** | Renombrar a `impuestos_ve` (sin prefijo inventario). Corregir typo |

### 3.4 Capa Inventario Mejorado

#### table_departamentos (nueva)

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza `departamentos` actual. Agrega jerarquia, slug, imagen, prioridad visual |
| **Fortalezas** | `id_parent_dept` permite jerarquia. `slug` para URLs. `prioridad_visual` para ordenamiento en UI |
| **Debilidades** | Pierde el campo `codigo` que es critico en el sistema actual. `uptade_At` typo de nuevo |
| **Riesgos** | Medio - perdida del concepto de `codigo` inmutable |
| **Mejoras** | Mantener campo `codigo` del esquema actual. Corregir typo |

#### table_inventario_marcas

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Nuevo catalogo de marcas de productos |
| **Fortalezas** | Permite filtrado y reportes por marca. `logo_marca_url` para catalogo visual |
| **Debilidades** | `uptade_At` typo. No existia antes, requiere migracion de datos |
| **Riesgos** | Bajo - es un catalogo opcional |
| **Mejoras** | Agregar `UNIQUE(id_empresa, nombre_marca)` |

#### table_inventario_unidades

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de unidades de medida. Reemplaza el CHECK hardcodeado `['UND','GRA']` |
| **Fortalezas** | Extensible. `es_decimal` indica si la unidad permite fracciones |
| **Debilidades** | `uptade_At` typo |
| **Riesgos** | Bajo - mejora significativa sobre el sistema actual |
| **Mejoras** | Agregar seed con unidades basicas (UND, GRA, KG, LT, ML, CM, CAJ) |

#### table_inventario_unidades_conversion

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Define conversiones entre unidades (ej: 1 CAJ = 24 UND) |
| **Fortalezas** | `factor NUMERIC(12,4)` con precision adecuada. CHECK `> 0` previene factor cero |
| **Debilidades** | Falta `UNIQUE(id_empresa, id_unidad_mayor, id_unidad_menor)` |
| **Riesgos** | Medio - conversiones incorrectas afectan inventario |
| **Mejoras** | Agregar constraint UNIQUE. Validar que no existan conversiones circulares |

#### table_inventario_productos (nueva)

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza `productos` actual. Agrega marca, unidad, multiples costos, impuestos |
| **Fortalezas** | `costo_promedio`, `costo_ultimo`, `costo_reposicion` permiten valoracion de inventario multiple. `tipo_impuesto` con tres categorias fiscales. FK a impuestos permite 3 impuestos por producto |
| **Debilidades** | Pierde el campo `tipo ['P','S']` que diferencia productos de servicios. Pierde `stock`, `stock_minimo` directo (ahora en tabla separada, lo cual es correcto). `NUMERIC(15,4)` para precios puede ser excesivo |
| **Riesgos** | Alto - es la tabla mas critica del sistema. La migracion debe ser perfecta |
| **Mejoras** | Mantener `tipo` del esquema actual o crear flag `es_servicio`. Agregar `UNIQUE(id_empresa, codigo_principal)` |

#### table_inventario_depositos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Nuevo concepto: almacenes/depositos fisicos |
| **Fortalezas** | `es_principal` marca el deposito default. `permite_venta` controla cuales depositos surten ventas. `config_json` para extensibilidad |
| **Debilidades** | `capacidad_m3` es muy especifico y puede no usarse. Falta CHECK para `es_principal` (solo uno por empresa) |
| **Riesgos** | Medio - introduce complejidad en todas las operaciones de inventario |
| **Mejoras** | Agregar trigger o partial unique index para garantizar un solo deposito principal por empresa |

#### table_inventario_kardex (nueva)

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza `movimientos_inventario`. Agrega deposito, costo, moneda, secuencia fiscal |
| **Fortalezas** | `secuencia_fiscal BIGINT` permite numeracion correlativa para auditorias. `id_deposito` permite kardex por ubicacion. `costo_unidad` registra costo historico. `observaciones JSONB` es flexible. `id_moneda` + `tasa_cambio` permite trazabilidad bimonetaria completa |
| **Debilidades** | `tipo_movimiento` como CHECK largo puede ser mejor como FK a `inventario_tipos_mov`. Falta `empresa_id` en el nombre de la constraint UNIQUE de secuencia |
| **Riesgos** | Alto - es la tabla de mayor volumen y criticidad |
| **Mejoras** | Usar FK a `inventario_tipos_mov` en lugar de CHECK string. Agregar `UNIQUE(id_empresa, secuencia_fiscal)`. Considerar particionado por fecha |

#### table_inventario_stock

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Tabla separada de stock actual por producto/deposito. Reemplaza `productos.stock` |
| **Fortalezas** | `stock_disponible` como campo GENERATED es excelente (siempre consistente). `stock_reservado` permite reservas para pedidos en proceso. Separacion de stock por deposito |
| **Debilidades** | Falta `created_at`. UNIQUE deberia ser `(id_empresa, id_producto, id_deposito)` |
| **Riesgos** | Medio - el campo GENERATED depende del soporte de PowerSync para columnas calculadas |
| **Mejoras** | Verificar compatibilidad con PowerSync. Agregar constraint UNIQUE. Trigger para actualizar automaticamente desde kardex |

#### table_inventario_ajustes / table_inventario_ajuste_motivos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Formaliza el proceso de ajustes de inventario con motivos catalogados |
| **Fortalezas** | `es_sistema` protege motivos base. `operacion_base` define si suma o resta. `afecta_costo` indica si el ajuste modifica el costo promedio |
| **Debilidades** | `table_inventario_ajustes` no tiene detalle de lineas (que productos se ajustan). Falta tabla `inventario_ajustes_det` |
| **Riesgos** | Medio - sin tabla de detalle, un ajuste no puede documentar multiples productos |
| **Mejoras** | Crear tabla `inventario_ajustes_det` con (id_ajuste FK, id_producto FK, id_deposito FK, cantidad, costo_unitario) |

#### table_inventario_tipos_mov

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Catalogo de tipos de movimiento de inventario |
| **Fortalezas** | Reemplaza el CHECK constraint string del kardex. `slug_mov UNIQUE` permite referencia estable. `requiere_doc` indica si necesita documento de origen |
| **Debilidades** | Tabla global (sin tenant/empresa). Deberia ser global (correcto) |
| **Riesgos** | Bajo |
| **Mejoras** | Agregar `is_active`, `created_at` |

### 3.5 Capa Compras Mejorada

#### table_compras_proveedores (nueva)

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Reemplaza `proveedores`. Agrega datos fiscales venezolanos, concepto ISLR, credito |
| **Fortalezas** | `id_tipo_persona FK` vincula al tipo de persona fiscal. `retencion_iva_pct CHECK IN (0,75,100)` valida porcentajes legales. `dias_credito`, `limite_credito_usd` para gestion de cuentas por pagar |
| **Debilidades** | `rif UNIQUE` es global, deberia ser por empresa. `nombre_comercial` ademas de `razon_social` puede generar confusion |
| **Riesgos** | Medio - la migracion de proveedores debe preservar datos existentes |
| **Mejoras** | UNIQUE(id_empresa, rif). Agregar `saldo_actual` para cuentas por pagar (como clientes) |

#### table_compras_proveedores_bancos

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Datos bancarios de proveedores (para pagos y retenciones) |
| **Fortalezas** | `es_principal` marca la cuenta default. `id_moneda FK` para cuentas multi-moneda. Soporta multiples cuentas por proveedor |
| **Debilidades** | Falta `is_active` para soft-delete |
| **Riesgos** | Bajo |
| **Mejoras** | Agregar `is_active`. Agregar partial unique para `es_principal` por proveedor |

#### table_compras_facturas

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Cabecera de factura de compra con desglose fiscal completo |
| **Fortalezas** | Separacion de exento/base/IVA. `num_control` para control fiscal venezolano. `status` permite flujo BORRADOR -> PROCESADA. Calculo de retencion IVA en cabecera |
| **Debilidades** | Muchos campos de totales que podrian calcularse. `status` sin CHECK constraint explicito |
| **Riesgos** | Alto - tabla financiera critica |
| **Mejoras** | Agregar CHECK para status. Considerar campos calculados via trigger. Agregar inmutabilidad post-procesamiento |

#### table_compras_facturas_det

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Lineas de detalle de factura de compra |
| **Fortalezas** | `id_deposito FK` permite entrada directa al deposito correcto. `id_unidad FK` registra unidad de compra |
| **Debilidades** | Duplica totales en USD y BS (denormalizacion). Falta `tipo_impuesto` por linea |
| **Riesgos** | Medio |
| **Mejoras** | Agregar referencia al impuesto aplicable por linea |

#### table_compras_retenciones_iva / table_compras_retenciones_islr

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Comprobantes de retencion de IVA e ISLR segun normativa SENIAT |
| **Fortalezas** | Campos completos para formato XML SENIAT. Trazabilidad con factura de origen |
| **Debilidades** | `table_compras_retenciones_iva` tiene muchos campos nulos opcionales. No tiene CHECK constraints en montos |
| **Riesgos** | Alto - errores en retenciones generan sanciones fiscales |
| **Mejoras** | Agregar validaciones de montos. Trigger de inmutabilidad |

#### table_compras_notas_fiscales / table_compras_notas_fiscales_det

| Aspecto | Evaluacion |
|---------|------------|
| **Rol** | Notas de credito/debito de compras con detalle |
| **Fortalezas** | `tipo_documento CHECK ['NC','ND']` es correcto. `afecta_inventario` permite notas que no impactan stock |
| **Debilidades** | `descripcion_ajuste` en detalle es ambiguo. Falta vinculacion al kardex |
| **Riesgos** | Medio |
| **Mejoras** | Agregar `id_kardex` para trazabilidad de movimientos de inventario generados |

---

## 4. Analisis del Impacto de la Nueva Capa (SECCION CRITICA)

### 4.1 Justificacion de la Nueva Capa

**La nueva capa SaaS Platform esta JUSTIFICADA** si ClaraPOS evoluciona hacia un ecosistema multi-aplicacion (ClaraPOS, ClaraClinic, ClaraContable, etc.). Sin esta vision, la capa agrega complejidad innecesaria.

| Criterio | Evaluacion |
|----------|------------|
| Justificacion | **SI** - Para ecosistema multi-app. **NO** - Si solo sera ClaraPOS |
| Nivel de abstraccion | Correcto para la vision multi-app |
| Mejora flexibilidad | Si - desacopla billing de operacion |
| Complejidad adicional | Alta - duplica el eje de aislamiento (tenant + empresa) |
| Latencia adicional | Minima - joins adicionales son de tablas pequenas |
| Dependencias circulares | No detectadas |
| Escalabilidad | Mejora - permite particionado por tenant |

### 4.2 Doble Aislamiento: tenant_id + empresa_id

El cambio mas profundo es pasar de un eje de aislamiento (`empresa_id`) a dos (`id_tenant` + `id_empresa`).

**Implicaciones**:

1. **Toda tabla de negocio necesita ambas columnas** - Incrementa el tamano de indices y el overhead de INSERT
2. **RLS debe filtrar por ambos ejes** - Mas complejo, mas lento
3. **PowerSync sync rules** deben incluir `tenant_id` ademas de `empresa_id`
4. **El frontend debe obtener ambos IDs** del usuario actual

**Recomendacion**: `id_tenant` se puede **derivar siempre de `id_empresa`** (relacion 1:N). Por lo tanto, incluir `id_tenant` en todas las tablas de negocio es **desnormalizacion redundante**. Solo debe existir en tablas que no tienen `id_empresa` (ej: `suscripciones`, `user_access`).

### 4.3 Impacto en Mantenibilidad

| Aspecto | Antes | Despues | Impacto |
|---------|-------|---------|---------|
| Tablas | 18 | ~50 | +177% mas tablas a mantener |
| Columnas de FK por tabla | 1-3 | 3-6 | Mas JOINs en queries |
| Nivel de RLS | 1 eje | 2 ejes | Policies mas complejas |
| Schema PowerSync | 18 tablas | ~35 tablas | Mayor schema local |
| Migraciones | Simple | Compleja | Riesgo de perdida de datos |

### 4.4 Impacto en Consultas SQL

**Antes** (consulta tipica):
```sql
SELECT p.* FROM productos p
WHERE p.empresa_id = current_empresa_id()
  AND p.activo = true;
```

**Despues** (con nuevas tablas):
```sql
SELECT p.*, m.nombre_marca, u.abreviatura, d.nombre_deposito,
       s.cantidad_actual, s.stock_disponible
FROM inventario_productos p
LEFT JOIN inventario_marcas m ON m.id_marca = p.id_marca
LEFT JOIN inventario_unidades u ON u.id_unidad = p.id_unidad_base
LEFT JOIN inventario_stock s ON s.id_producto = p.id_producto
LEFT JOIN inventario_depositos d ON d.id_deposito = s.id_deposito
WHERE p.id_empresa = current_empresa_id()
  AND p.is_active = true
  AND d.permite_venta = true;
```

**Complejidad de queries aumenta significativamente**, pero esto es el costo esperado de una normalizacion correcta. Se mitiga con:
- Vistas materializadas para consultas frecuentes
- Indices compuestos optimizados
- Cache a nivel de aplicacion

### 4.5 Soporte Multi-Tenant

El nuevo esquema **mejora significativamente** el soporte multi-tenant:

- Aislamiento reforzado con doble eje (cuando se use para multi-app)
- Permisos granulares por rol y empresa
- Configuracion por empresa via JSONB
- Datos fiscales separados por pais (extensible)

---

## 5. Reporte de Alineacion del Esquema

### 5.1 Mapeo de Tablas Antiguas a Nuevas

| Tabla Actual | Tabla Nueva | Accion | Notas |
|-------------|-------------|--------|-------|
| `empresas` | `table_empresas` | **REEMPLAZAR** | Agregar `id_tenant`, `config_json`, `moneda_base`, `timezone` |
| `usuarios` | `table_usuarios_empresa` | **REEMPLAZAR** | Migrar `level` a `id_rol`. Mantener `id_auth_user = auth.uid()` |
| `level_permissions` | `table_usuarios_roles` + `table_rol_permisos` + `table_usuarios_permisos` | **REEMPLAZAR** | Migrar niveles 1/2/3 a roles con permisos granulares |
| `departamentos` | `table_departamentos` | **REEMPLAZAR** | Agregar jerarquia, mantener `codigo` |
| `productos` | `table_inventario_productos` | **REEMPLAZAR** | Separar stock a tabla dedicada |
| `movimientos_inventario` | `table_inventario_kardex` | **REEMPLAZAR** | Agregar deposito, costo, moneda |
| - (no existia) | `table_inventario_stock` | **CREAR** | Stock por producto/deposito |
| - (no existia) | `table_inventario_depositos` | **CREAR** | Almacenes/depositos |
| - (no existia) | `table_inventario_marcas` | **CREAR** | Catalogo de marcas |
| - (no existia) | `table_inventario_unidades` | **CREAR** | Catalogo de unidades |
| - (no existia) | `table_inventario_unidades_conversion` | **CREAR** | Conversion entre unidades |
| `metodos_pago` | Sin reemplazo directo | **MANTENER** | No aparece en nuevas tablas (se mantiene) |
| `clientes` | Sin reemplazo directo | **MANTENER** | No aparece en nuevas tablas |
| `movimientos_cuenta` | Sin reemplazo directo | **MANTENER** | No aparece en nuevas tablas |
| `ventas` | Sin reemplazo directo | **MANTENER** | Falta capa de ventas mejorada en nuevas tablas |
| `detalle_venta` | Sin reemplazo directo | **MANTENER** | Pendiente agregar campos fiscales |
| `pagos` | Sin reemplazo directo | **MANTENER** | Pendiente agregar `id_moneda FK` |
| `notas_credito` | Sin reemplazo directo | **MANTENER** | Compatible con estructura actual |
| `recetas` | Sin reemplazo directo | **MANTENER** | No aparece en nuevas tablas |
| `proveedores` | `table_compras_proveedores` | **REEMPLAZAR** | Agregar datos fiscales, credito |
| `compras` | `table_compras_facturas` | **REEMPLAZAR** | Agregar desglose fiscal completo |
| `detalle_compra` | `table_compras_facturas_det` | **REEMPLAZAR** | Agregar deposito, unidad, impuestos |
| `bancos` (PowerSync) | `table_compras_proveedores_bancos` | **REEMPLAZAR** | Vincular a proveedores en vez de tabla global |

### 5.2 Responsabilidades Duplicadas

| Conflicto | Tablas | Resolucion |
|-----------|--------|------------|
| Metodos de pago | `metodos_pago` (actual) vs `table_metodos_pago_nexo21` (nueva) | Son dominios diferentes: uno es del negocio, otro de la plataforma. **Mantener ambas** |
| Notas de credito | `notas_credito` (actual) vs `table_compras_notas_fiscales` (nueva) | Son dominios diferentes: ventas vs compras. **Mantener ambas** con nomenclatura clara |
| Permisos | `level_permissions` (actual) vs RBAC (nuevo) | **Migrar** a RBAC. Eliminar `level_permissions` post-migracion |

### 5.3 Tablas Faltantes en la Nueva Capa

Las nuevas tablas **no cubren** los siguientes dominios que ya existen:

1. **Ventas** (ventas, detalle_venta, pagos) - Sin mejora propuesta
2. **Clientes** (clientes, movimientos_cuenta) - Sin mejora propuesta
3. **Recetas** (BOM para servicios) - Sin mejora propuesta
4. **Tasas de cambio** - No se menciona como se manejan en el nuevo esquema

Estos dominios deben mantenerse del esquema actual y adaptarse a la nueva arquitectura.

---

## 6. Arquitectura Final Recomendada

### 6.1 Principios de Diseno

1. **Eliminar prefijo `table_`** de todas las tablas nuevas
2. **snake_case consistente** en todas las columnas
3. **`id` como PK** en todas las tablas (UUID v4)
4. **Corregir todos los typos** (`uptade_At` -> `updated_at`)
5. **`id_tenant` solo donde sea necesario** (tablas de plataforma y empresas)
6. **`empresa_id` en todas las tablas de negocio** (como ahora)
7. **Auditoria completa** (`created_at`, `updated_at`, `created_by`, `updated_by`)
8. **Inmutabilidad** preservada en tablas financieras

### 6.2 Esquema Propuesto por Dominio

#### Dominio: Plataforma SaaS

```
tenants (id, nombre, email_contacto, telefono, pais, config JSONB, is_active, created_at, updated_at)
apps (id, slug UNIQUE, nombre_comercial, descripcion, is_active, created_at, updated_at)
planes (id, app_id FK apps, nombre, monto NUMERIC(10,2), moneda DEFAULT 'USD', intervalo TEXT, is_active, created_at, updated_at)
suscripciones (id, tenant_id FK, plan_id FK, fecha_inicio, fecha_fin, status TEXT, created_at, updated_at)
pagos_suscripcion (id, suscripcion_id FK, monto NUMERIC(10,2), metodo_pago_id FK, referencia UNIQUE, fecha, created_at)
tenant_app_access (id, tenant_id FK, app_id FK apps, fecha_vencimiento, status DEFAULT 'activo', created_at, updated_at)
plataforma_metodos_pago (id, nombre, banco, nro_cuenta, cedula_rif, moneda DEFAULT 'USD', is_active, created_at)
```

#### Dominio: Multi-Tenant (Empresa + Usuarios + RBAC)

```
empresas (id, tenant_id FK tenants, nombre_comercial, rif, direccion, telefono, email, logo_url, timezone, moneda_base DEFAULT 'USD', config JSONB, is_active, created_at, updated_at)
usuarios (id PK = auth.users.id, empresa_id FK empresas, email, nombre, rol_id FK roles, is_active, created_at, updated_at, created_by FK, updated_by FK)
roles (id, empresa_id FK empresas, nombre, descripcion, is_system BOOLEAN DEFAULT FALSE, is_active, created_at, updated_at, created_by FK, updated_by FK)
permisos (id, modulo TEXT, slug UNIQUE, nombre, descripcion, is_active, created_at)
rol_permisos (id, rol_id FK roles, permiso_id FK permisos, granted_by FK usuarios, granted_at, UNIQUE(rol_id, permiso_id))
```

#### Dominio: Fiscal Venezolano

```
empresas_fiscal_ve (id, empresa_id FK empresas UNIQUE, tipo_contribuyente, es_agente_retencion, documento_identidad, tipo_documento, nro_providencia, porcentaje_retencion_iva NUMERIC(5,2) DEFAULT 75, codigo_sucursal_seniat DEFAULT '0000', usa_maquina_fiscal, aplica_igtf DEFAULT true, created_at, updated_at, updated_by FK)
tipos_persona_ve (id, codigo VARCHAR(1) UNIQUE, nombre, es_entidad_legal, aplica_sustraendo, formato_regexp, is_active)
monedas (id, codigo_iso VARCHAR(3) UNIQUE, nombre, simbolo, es_moneda_base, is_active, created_at, updated_at)
impuestos_ve (id, empresa_id FK, nombre, tipo_tributo CHECK ['IVA','IGTF','INCO'], porcentaje NUMERIC(5,2), codigo_seniat, descripcion, is_active, created_at, updated_at, updated_by FK)
```

#### Dominio: Inventario

```
departamentos (id, empresa_id FK, codigo TEXT, nombre, parent_id FK self NULL, slug, descripcion, imagen_url, prioridad_visual INT, is_active, created_at, updated_at, created_by FK, updated_by FK, UNIQUE(empresa_id, codigo))
marcas (id, empresa_id FK, nombre, descripcion, logo_url, is_active, created_at, updated_at, updated_by FK, UNIQUE(empresa_id, nombre))
unidades (id, empresa_id FK, nombre, abreviatura, es_decimal BOOLEAN, is_active, created_at, updated_at, updated_by FK)
unidades_conversion (id, empresa_id FK, unidad_mayor_id FK unidades, unidad_menor_id FK unidades, factor NUMERIC(12,4) CHECK >0, is_active, created_at, updated_at, UNIQUE(empresa_id, unidad_mayor_id, unidad_menor_id))
productos (id, empresa_id FK, departamento_id FK, marca_id FK NULL, unidad_base_id FK unidades, codigo TEXT, tipo TEXT CHECK ['P','S'], nombre, precio_venta_usd NUMERIC(12,2), precio_mayor_usd NUMERIC(12,2), costo_promedio NUMERIC(12,4), costo_ultimo NUMERIC(12,4), stock_minimo NUMERIC(12,3), maneja_lotes BOOLEAN DEFAULT FALSE, tipo_impuesto CHECK ['Gravable','Exento','Exonerado'], impuesto_iva_id FK NULL, impuesto_igtf_id FK NULL, is_active, created_at, updated_at, created_by FK, updated_by FK, UNIQUE(empresa_id, codigo))
depositos (id, empresa_id FK, nombre, direccion, es_principal BOOLEAN, permite_venta BOOLEAN, is_active, created_at, updated_at, created_by FK, updated_by FK)
inventario_stock (id, empresa_id FK, producto_id FK, deposito_id FK, cantidad_actual NUMERIC(12,3), stock_reservado NUMERIC(12,3) DEFAULT 0, updated_at, updated_by FK, UNIQUE(empresa_id, producto_id, deposito_id))
tipos_movimiento (id, nombre, slug UNIQUE, operacion CHECK ['ENTRADA','SALIDA','NEUTRO'], requiere_doc BOOLEAN, is_active, created_at)
kardex (id, empresa_id FK, secuencia_fiscal BIGINT, producto_id FK, deposito_id FK, tipo_movimiento_id FK tipos_movimiento, doc_origen_id UUID, doc_origen_ref TEXT, operacion CHECK ['ENTRADA','SALIDA'], cantidad NUMERIC(12,3), saldo_anterior NUMERIC(12,3), saldo_posterior NUMERIC(12,3), costo_unitario NUMERIC(12,4), moneda_id FK monedas NULL, tasa_cambio NUMERIC(12,4), observaciones TEXT, created_by FK, created_at, UNIQUE(empresa_id, secuencia_fiscal))
-- INMUTABLE: triggers prevent UPDATE/DELETE
ajuste_motivos (id, empresa_id FK, nombre, es_sistema BOOLEAN, operacion_base CHECK ['SUMA','RESTA','NEUTRO'], afecta_costo BOOLEAN, is_active, created_at, updated_at, created_by FK, updated_by FK)
ajustes (id, empresa_id FK, num_ajuste TEXT UNIQUE, motivo_id FK, fecha, observaciones, status DEFAULT 'PROCESADO', created_at, updated_at, created_by FK, updated_by FK)
ajustes_det (id, ajuste_id FK, producto_id FK, deposito_id FK, cantidad NUMERIC(12,3), costo_unitario NUMERIC(12,4), created_at, created_by FK)
recetas (id, empresa_id FK, servicio_id FK productos, producto_id FK productos, cantidad NUMERIC(12,3), created_at, UNIQUE(empresa_id, servicio_id, producto_id))
```

#### Dominio: Ventas (mantener + mejorar)

```
tasas_cambio (id, empresa_id FK NOT NULL, fecha, valor NUMERIC(12,4), moneda_id FK monedas, created_at, created_by FK)
-- INMUTABLE
metodos_pago (id, empresa_id FK, nombre, moneda_id FK monedas, is_active, created_at, updated_at)
clientes (id, empresa_id FK, identificacion TEXT, nombre_social, direccion, telefono, email, limite_credito NUMERIC(12,2), saldo_actual NUMERIC(12,2), is_active, created_at, updated_at, UNIQUE(empresa_id, identificacion))
movimientos_cuenta (id, empresa_id FK, cliente_id FK, tipo CHECK ['FAC','PAG','NCR','NDB'], referencia, monto NUMERIC(12,2), saldo_anterior, saldo_nuevo, observacion, venta_id UUID, fecha, created_at)
-- INMUTABLE
ventas (id, empresa_id FK, cliente_id FK, nro_factura TEXT, tasa NUMERIC(12,4), total_exento_usd NUMERIC(12,2), total_base_usd NUMERIC(12,2), total_iva_usd NUMERIC(12,2), total_usd NUMERIC(12,2), total_bs NUMERIC(12,2), saldo_pend_usd NUMERIC(12,2), tipo CHECK ['CONTADO','CREDITO'], usuario_id FK, fecha, anulada BOOLEAN DEFAULT FALSE, created_at, UNIQUE(empresa_id, nro_factura))
detalle_venta (id, empresa_id FK, venta_id FK, producto_id FK, deposito_id FK, cantidad NUMERIC(12,3), precio_unitario_usd NUMERIC(12,2), tipo_impuesto TEXT, impuesto_pct NUMERIC(5,2), created_at)
-- INMUTABLE
pagos (id, empresa_id FK, venta_id FK NULL, cliente_id FK, metodo_pago_id FK, moneda_id FK monedas, tasa NUMERIC(12,4), monto NUMERIC(12,2), monto_usd NUMERIC(12,2), referencia, fecha, created_at, created_by FK)
-- INMUTABLE
notas_credito (id, empresa_id FK, nro_ncr TEXT, venta_id FK UNIQUE, cliente_id FK, motivo, tasa_historica NUMERIC(12,4), monto_total_usd, monto_total_bs, usuario_id FK, fecha, created_at, UNIQUE(empresa_id, nro_ncr))
-- INMUTABLE
```

#### Dominio: Compras

```
proveedores (id, empresa_id FK, tipo_persona_id FK NULL, razon_social, nombre_comercial, rif, direccion_fiscal, ciudad, telefono, email, tipo_contribuyente, concepto_islr_id FK NULL, retencion_iva_pct NUMERIC(5,2) DEFAULT 0, dias_credito INT DEFAULT 0, limite_credito_usd NUMERIC(12,2), is_active, created_at, updated_at, created_by FK, updated_by FK, UNIQUE(empresa_id, rif))
proveedores_bancos (id, proveedor_id FK, banco, nro_cuenta, tipo_cuenta, titular, titular_rif, moneda_id FK, es_principal BOOLEAN, is_active, created_at, updated_at, created_by FK, updated_by FK)
islr_conceptos_ve (id, codigo_seniat UNIQUE, descripcion, porcentaje_pj NUMERIC(5,2), porcentaje_pn NUMERIC(5,2), sustraendo_ut NUMERIC(10,2), monto_minimo_base NUMERIC(10,2), is_active)
facturas_compra (id, empresa_id FK, proveedor_id FK, num_factura, num_control, fecha_factura DATE, fecha_recepcion, moneda_id FK, tasa_cambio NUMERIC(12,4), total_exento_usd NUMERIC(12,2), total_base_usd NUMERIC(12,2), total_iva_usd NUMERIC(12,2), total_usd NUMERIC(12,2), total_bs NUMERIC(12,2), aplica_retencion_iva BOOLEAN, pct_retencion_iva NUMERIC(5,2), monto_retencion_iva_bs NUMERIC(12,2), status TEXT DEFAULT 'BORRADOR', created_at, updated_at, created_by FK, updated_by FK)
facturas_compra_det (id, factura_compra_id FK, empresa_id FK, producto_id FK, deposito_id FK, cantidad NUMERIC(12,3), unidad_id FK, costo_unitario_usd NUMERIC(12,4), subtotal_usd NUMERIC(12,2), costo_unitario_bs NUMERIC(12,4), subtotal_bs NUMERIC(12,2), created_at, created_by FK, updated_by FK, updated_at)
retenciones_iva (id, empresa_id FK, factura_compra_id FK, fecha_comprobante, nro_comprobante, base_imponible NUMERIC(12,2), porcentaje_iva NUMERIC(5,2), monto_iva NUMERIC(12,2), monto_iva_retenido NUMERIC(12,2), status DEFAULT 'ACTIVO', created_at, created_by FK)
-- INMUTABLE post-procesamiento
retenciones_islr (id, empresa_id FK, factura_compra_id FK, concepto_islr_id FK, nro_comprobante UNIQUE, fecha_comprobante, base_imponible_bs NUMERIC(12,2), porcentaje_retencion NUMERIC(5,2), monto_retenido_bs NUMERIC(12,2), sustraendo_bs NUMERIC(12,2), status DEFAULT 'ACTIVO', created_at, created_by FK)
-- INMUTABLE post-procesamiento
notas_fiscales_compra (id, empresa_id FK, factura_afectada_id FK, tipo CHECK ['NC','ND'], num_nota, num_control, fecha, moneda_id FK, tasa_cambio NUMERIC(12,4), total_usd NUMERIC(12,2), total_bs NUMERIC(12,2), motivo, created_at, created_by FK, updated_by FK, updated_at)
notas_fiscales_compra_det (id, nota_fiscal_id FK, empresa_id FK, producto_id FK NULL, cantidad NUMERIC(12,3), costo_unitario_usd NUMERIC(12,4), subtotal_usd NUMERIC(12,2), afecta_inventario BOOLEAN DEFAULT TRUE, descripcion_ajuste TEXT, created_at, created_by FK)
```

### 6.3 Diagrama de Relaciones (Entidad-Relacion)

```
PLATAFORMA:
  tenants --1:N--> empresas
  tenants --1:N--> suscripciones --N:1--> planes --N:1--> apps
  tenants --1:N--> tenant_app_access --N:1--> apps

EMPRESA + AUTH:
  empresas --1:N--> usuarios --N:1--> roles --N:N--> permisos (via rol_permisos)
  empresas --1:1--> empresas_fiscal_ve

INVENTARIO:
  empresas --1:N--> departamentos --1:N(self)--> departamentos (jerarquia)
  empresas --1:N--> productos --N:1--> departamentos
  productos --N:1--> marcas (opcional)
  productos --N:1--> unidades
  empresas --1:N--> depositos
  productos + depositos --1:1--> inventario_stock (UNIQUE)
  productos + depositos --1:N--> kardex
  kardex --N:1--> tipos_movimiento
  productos --1:N--> recetas (servicios)

VENTAS:
  empresas --1:N--> clientes --1:N--> ventas
  ventas --1:N--> detalle_venta --N:1--> productos
  ventas --1:N--> pagos --N:1--> metodos_pago
  ventas --1:1--> notas_credito
  clientes --1:N--> movimientos_cuenta

COMPRAS:
  empresas --1:N--> proveedores --1:N--> facturas_compra
  facturas_compra --1:N--> facturas_compra_det --N:1--> productos
  facturas_compra --1:N--> retenciones_iva
  facturas_compra --1:N--> retenciones_islr
  facturas_compra --1:N--> notas_fiscales_compra --1:N--> notas_fiscales_compra_det
  proveedores --1:N--> proveedores_bancos
```

---

## 7. Estrategia de Migracion

### 7.1 Principios

1. **Zero-downtime**: El sistema debe seguir operando durante la migracion
2. **Reversible**: Cada fase debe poder revertirse sin perdida de datos
3. **Incremental**: Dividir en fases independientes que se despliegan una a la vez
4. **Datos primero**: Crear tablas nuevas, migrar datos, luego cambiar frontend

### 7.2 Fases de Migracion

#### Fase 0: Preparacion (1-2 dias)

**Acciones**:
1. Backup completo de la base de datos
2. Documentar estado actual de datos (conteos por tabla, integridad referencial)
3. Crear branch de migracion
4. Escribir tests de integridad pre/post migracion

**Riesgos**: Ninguno (solo lectura)

#### Fase 1: Correcciones Criticas al Esquema Actual (1 dia)

**Acciones**:
```sql
-- 1.1 empresa_id NOT NULL en todas las tablas
-- Primero verificar y limpiar datos huerfanos
SELECT 'tasas_cambio' AS tabla, COUNT(*) FROM tasas_cambio WHERE empresa_id IS NULL
UNION ALL
SELECT 'departamentos', COUNT(*) FROM departamentos WHERE empresa_id IS NULL
-- ... (repetir para todas)

-- 1.2 Aplicar NOT NULL
ALTER TABLE tasas_cambio ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE departamentos ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE productos ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE recetas ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE movimientos_inventario ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE metodos_pago ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE movimientos_cuenta ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE detalle_venta ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE pagos ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE notas_credito ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE proveedores ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE compras ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE detalle_compra ALTER COLUMN empresa_id SET NOT NULL;

-- 1.3 UNIQUE por empresa (reemplazar UNIQUE globales)
ALTER TABLE departamentos DROP CONSTRAINT departamentos_codigo_key;
ALTER TABLE departamentos ADD CONSTRAINT uq_departamentos_empresa_codigo UNIQUE(empresa_id, codigo);

ALTER TABLE productos DROP CONSTRAINT productos_codigo_key;
ALTER TABLE productos ADD CONSTRAINT uq_productos_empresa_codigo UNIQUE(empresa_id, codigo);

ALTER TABLE clientes DROP CONSTRAINT clientes_identificacion_key;
ALTER TABLE clientes ADD CONSTRAINT uq_clientes_empresa_identificacion UNIQUE(empresa_id, identificacion);

ALTER TABLE proveedores DROP CONSTRAINT proveedores_rif_key;
ALTER TABLE proveedores ADD CONSTRAINT uq_proveedores_empresa_rif UNIQUE(empresa_id, rif);

ALTER TABLE ventas DROP CONSTRAINT ventas_nro_factura_key;
ALTER TABLE ventas ADD CONSTRAINT uq_ventas_empresa_nro_factura UNIQUE(empresa_id, nro_factura);

ALTER TABLE notas_credito DROP CONSTRAINT notas_credito_nro_ncr_key;
ALTER TABLE notas_credito ADD CONSTRAINT uq_notas_credito_empresa_nro_ncr UNIQUE(empresa_id, nro_ncr);
```

**Rollback**: Revertir a UNIQUE globales (siempre posible porque UNIQUE por empresa es mas permisivo)

#### Fase 2: Tablas de Plataforma SaaS (2-3 dias)

**Acciones**:
1. Crear tablas: `tenants`, `apps`, `planes`, `suscripciones`, `pagos_suscripcion`, `tenant_app_access`, `plataforma_metodos_pago`
2. Crear tenant por defecto para la empresa existente
3. Agregar `tenant_id` a `empresas` (nullable primero, luego NOT NULL)
4. Migrar empresa existente al tenant por defecto
5. Actualizar Edge Functions `register-owner` para crear tenant + empresa

**Riesgos**: Bajo (tablas nuevas, sin impacto en funcionamiento actual)

#### Fase 3: RBAC (2-3 dias)

**Acciones**:
1. Crear tablas: `roles`, `permisos`, `rol_permisos`
2. Seed de permisos (migrar de `level_permissions`)
3. Crear roles por defecto: Propietario, Supervisor, Cajero (por empresa)
4. Agregar `rol_id` a `usuarios` (nullable primero)
5. Mapear: level 1 -> rol Propietario, level 2 -> rol Supervisor, level 3 -> rol Cajero
6. Actualizar frontend para leer permisos de RBAC en vez de nivel
7. Eliminar columna `level` y tabla `level_permissions`

**Riesgos**: Medio (cambio en logica de permisos)
**Rollback**: Mantener `level` + `level_permissions` hasta confirmar que RBAC funciona

#### Fase 4: Fiscal + Monedas (1-2 dias)

**Acciones**:
1. Crear tablas: `monedas`, `tipos_persona_ve`, `impuestos_ve`, `empresas_fiscal_ve`, `islr_conceptos_ve`
2. Seed de monedas (USD, VES, EUR)
3. Seed de tipos de persona (V, E, J, G, P, C)
4. Seed de impuestos base (IVA 16%, IGTF 3%)
5. Seed de conceptos ISLR
6. Migrar `moneda_destino TEXT` en `tasas_cambio` a `moneda_id FK`
7. Migrar `moneda TEXT` en `metodos_pago` a `moneda_id FK`

**Riesgos**: Bajo (datos nuevos, cambios de FK menores)

#### Fase 5: Inventario Mejorado (3-5 dias)

**Acciones**:
1. Crear tablas: `unidades`, `marcas`, `depositos`, `inventario_stock`, `tipos_movimiento`, `ajuste_motivos`, `ajustes`, `ajustes_det`
2. Seed unidades basicas (UND, GRA)
3. Crear deposito principal por defecto para cada empresa
4. Agregar columnas nuevas a `productos`: `marca_id`, `unidad_base_id`, `tipo_impuesto`, `costo_promedio`, `costo_ultimo`
5. Migrar `medida` a `unidad_base_id`
6. Migrar `stock` de `productos` a `inventario_stock` (deposito principal)
7. Agregar `deposito_id` a `movimientos_inventario` / kardex
8. Crear trigger para actualizar `inventario_stock` desde kardex
9. Actualizar frontend para usar nuevo modelo de stock

**Riesgos**: **Alto** (afecta la tabla mas usada del sistema)
**Rollback**: Mantener `productos.stock` como columna legacy hasta confirmar que `inventario_stock` funciona

#### Fase 6: Compras Mejorado (2-3 dias)

**Acciones**:
1. Crear tablas: `facturas_compra`, `facturas_compra_det`, `retenciones_iva`, `retenciones_islr`, `notas_fiscales_compra`, `notas_fiscales_compra_det`, `proveedores_bancos`
2. Agregar columnas nuevas a `proveedores`
3. Migrar datos de `compras` -> `facturas_compra`
4. Migrar datos de `detalle_compra` -> `facturas_compra_det`
5. Actualizar frontend

**Riesgos**: Medio (datos historicos deben preservarse)

### 7.3 Riesgos de Migracion

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|-------------|---------|------------|
| Perdida de datos en migracion de stock | Baja | Critico | Script de validacion pre/post, backup, campo legacy |
| Incompatibilidad PowerSync con nuevas tablas | Media | Alto | Probar sync rules en ambiente de staging |
| Columnas GENERATED no soportadas en PowerSync | Alta | Medio | Calcular `stock_disponible` en frontend o trigger |
| Downtime durante ALTER TABLE en tablas grandes | Baja | Medio | Usar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` con defaults |
| Permisos rotos durante migracion RBAC | Media | Alto | Ejecutar en paralelo: nivel + RBAC, cortar nivel solo cuando RBAC este probado |

### 7.4 Compatibilidad Hacia Atras

- **PowerSync schema**: Debe actualizarse junto con las migraciones SQL. Agregar tablas nuevas incrementalmente
- **Sync rules**: Actualizar buckets para incluir nuevas tablas
- **Frontend**: Actualizar hooks de datos por fase (no todo de golpe)
- **Edge Functions**: Actualizar para crear tenant + empresa en registro

---

## 8. Consideraciones de Rendimiento

### 8.1 Estrategia de Indices

#### Indices Compuestos Recomendados

```sql
-- Inventario: busqueda por empresa + producto + deposito
CREATE INDEX idx_inventario_stock_lookup ON inventario_stock(empresa_id, producto_id, deposito_id);

-- Kardex: consultas por empresa + producto + fecha
CREATE INDEX idx_kardex_producto_fecha ON kardex(empresa_id, producto_id, created_at DESC);

-- Kardex: busqueda por documento de origen
CREATE INDEX idx_kardex_doc_origen ON kardex(doc_origen_id) WHERE doc_origen_id IS NOT NULL;

-- Productos: busqueda por empresa + activo + departamento
CREATE INDEX idx_productos_empresa_activo ON productos(empresa_id, is_active, departamento_id);

-- Ventas: reportes por empresa + fecha
CREATE INDEX idx_ventas_empresa_fecha ON ventas(empresa_id, fecha DESC);

-- Facturas compra: busqueda por proveedor + fecha
CREATE INDEX idx_facturas_compra_prov ON facturas_compra(empresa_id, proveedor_id, fecha_factura DESC);

-- Permisos RBAC: busqueda frecuente
CREATE INDEX idx_rol_permisos_rol ON rol_permisos(rol_id);
CREATE INDEX idx_usuarios_empresa_rol ON usuarios(empresa_id, rol_id);
```

### 8.2 Particionado

El `kardex` es la tabla de mayor crecimiento. Se recomienda particionado por rango de fecha:

```sql
CREATE TABLE kardex (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ... demas columnas
) PARTITION BY RANGE (created_at);

-- Particiones anuales
CREATE TABLE kardex_2025 PARTITION OF kardex FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE kardex_2026 PARTITION OF kardex FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

**Nota**: Evaluar compatibilidad con PowerSync antes de implementar particionado.

### 8.3 Vistas Materializadas

Para reportes frecuentes, crear vistas materializadas:

```sql
-- Stock consolidado por producto (todos los depositos)
CREATE MATERIALIZED VIEW mv_stock_consolidado AS
SELECT empresa_id, producto_id,
       SUM(cantidad_actual) AS stock_total,
       SUM(stock_reservado) AS reservado_total,
       SUM(cantidad_actual - stock_reservado) AS disponible_total
FROM inventario_stock
GROUP BY empresa_id, producto_id;

-- Refresh cada 5 minutos o despues de cada movimiento de kardex
```

### 8.4 Optimizacion de PowerSync

- **Reducir columnas sincronizadas**: No sincronizar `created_by`, `updated_by`, `config JSONB` pesados a SQLite
- **Indices en PowerSync schema**: Agregar indices locales para las queries mas frecuentes
- **Buckets selectivos**: Solo sincronizar tablas del modulo activo (lazy sync)

### 8.5 Optimizacion de JOINs

Para queries frecuentes con multiples JOINs (ej: producto + marca + unidad + stock):

1. Crear funcion SQL que retorna el producto "completo" como JSONB
2. Usar `LATERAL JOIN` para obtener stock del deposito principal en una sola query
3. Considerar campos desnormalizados con trigger de actualizacion para consultas criticas de rendimiento (ej: nombre del departamento en productos)

---

## 9. Revision del Modelo de Seguridad y Permisos

### 9.1 Modelo Actual

| Aspecto | Implementacion | Evaluacion |
|---------|---------------|------------|
| Autenticacion | Supabase Auth (JWT) | Correcto |
| RLS | Policies por tabla con `current_empresa_id()` | Funcional, pero no filtra por tenant |
| Permisos | Nivel 1/2/3 en `level_permissions` | Muy basico, no granular |
| Aislamiento | Solo `empresa_id` | Suficiente sin multi-app |
| RLS recursion | `SECURITY DEFINER` en `current_empresa_id()` | Solucion correcta |

### 9.2 Modelo Propuesto

#### Funciones SECURITY DEFINER

```sql
-- Mantener funcion actual para backward compatibility
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE PARALLEL SAFE
SET search_path = public AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()
$$;

-- Nueva: obtener tenant del usuario actual (derivado de empresa)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE PARALLEL SAFE
SET search_path = public AS $$
  SELECT e.tenant_id FROM public.empresas e
  INNER JOIN public.usuarios u ON u.empresa_id = e.id
  WHERE u.id = auth.uid()
$$;

-- Nueva: verificar si el usuario tiene un permiso especifico
CREATE OR REPLACE FUNCTION public.user_has_permission(p_slug TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE PARALLEL SAFE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rol_permisos rp
    INNER JOIN public.permisos p ON p.id = rp.permiso_id
    INNER JOIN public.usuarios u ON u.rol_id = rp.rol_id
    WHERE u.id = auth.uid() AND p.slug = p_slug
  )
$$;
```

#### RLS Policies Mejoradas

```sql
-- Ejemplo para productos con permiso granular:
CREATE POLICY "select_own_empresa" ON productos
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

CREATE POLICY "insert_own_empresa" ON productos
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND public.user_has_permission('inventario.crear')
  );

CREATE POLICY "update_own_empresa" ON productos
  FOR UPDATE TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.user_has_permission('inventario.editar')
  );
```

### 9.3 Permisos Granulares Recomendados

| Modulo | Slug | Descripcion |
|--------|------|-------------|
| inventario | `inventario.ver` | Ver productos, stock, kardex |
| inventario | `inventario.crear` | Crear productos y departamentos |
| inventario | `inventario.editar` | Editar productos y departamentos |
| inventario | `inventario.ajustar` | Ajustes de inventario |
| inventario | `inventario.editar_precios` | Modificar precios |
| ventas | `ventas.crear` | Crear ventas |
| ventas | `ventas.anular` | Anular ventas (notas de credito) |
| clientes | `clientes.gestionar` | CRUD de clientes |
| clientes | `clientes.credito` | Aprobar ventas a credito |
| compras | `compras.crear` | Crear ordenes de compra |
| compras | `compras.retenciones` | Gestionar retenciones fiscales |
| reportes | `reportes.ver` | Ver reportes basicos |
| reportes | `reportes.cuadre_caja` | Cuadre de caja |
| configuracion | `config.empresa` | Editar datos de empresa |
| configuracion | `config.usuarios` | Gestionar empleados |
| configuracion | `config.tasas` | Registrar tasas de cambio |
| configuracion | `config.metodos_pago` | Gestionar metodos de pago |
| clinica | `clinica.acceso` | Acceso al modulo clinico |

### 9.4 Aislamiento Multi-Tenant Mejorado

**Recomendacion**: Mantener el aislamiento actual basado en `empresa_id` para tablas de negocio. Solo agregar `tenant_id` al nivel de `empresas` y tablas de plataforma. Esto simplifica:

- Las policies RLS (un solo eje de filtrado)
- Las queries del frontend (un solo `empresa_id`)
- La sincronizacion PowerSync (un solo bucket parameter)

El `tenant_id` solo se usa para:
- Facturacion de la plataforma
- Control de acceso a apps
- Administracion de multiples empresas bajo un mismo tenant

---

## 10. Estandarizacion de Nombres

### 10.1 Problemas Detectados

| Problema | Ejemplos | Impacto |
|----------|----------|---------|
| **Prefijo `table_`** en tablas nuevas | `table_tenant`, `table_empresas`, `table_inventario_productos` | Ruido visual, rompe convencion SQL |
| **Typo `uptade_At`** | En 8+ tablas nuevas | Error persistente, confuso |
| **CamelCase mezclado** | `Moneda_metodo_pago`, `uptade_At` | Inconsistente con snake_case |
| **Prefijos largos** | `id_factura_compra`, `nro_cedula_meto_pago` | Nombres excesivamente largos |
| **`is_active` vs `activo`** | Tablas nuevas usan `is_active`, actuales usan `activo` | Inconsistencia entre capas |
| **`_id` vs `id_`** | Actual: `empresa_id`, `producto_id`. Nuevo: `id_empresa`, `id_producto` | Convencion opuesta |
| **Booleanos** | Actual: `activo BOOLEAN`. Nuevo: `is_active` (sin tipo explicito) | Falta estandar |

### 10.2 Convencion Propuesta

| Elemento | Convencion | Ejemplo |
|----------|------------|---------|
| Tablas | snake_case, plural, sin prefijo | `productos`, `facturas_compra` |
| PKs | `id` (UUID v4) | `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` |
| FKs | `<tabla_singular>_id` | `producto_id`, `empresa_id` |
| Booleanos | `is_<adjetivo>` o `<verbo>` | `is_active`, `permite_venta`, `aplica_igtf` |
| Timestamps | `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| Auditoria | `created_by`, `updated_by` | `UUID REFERENCES usuarios(id)` |
| Indices | `idx_<tabla>_<columnas>` | `idx_productos_empresa_codigo` |
| Constraints | `uq_<tabla>_<columnas>`, `chk_<tabla>_<condicion>` | `uq_productos_empresa_codigo` |
| Policies | `<accion>_own_empresa` | `select_own_empresa`, `insert_own_empresa` |
| Triggers | `trg_<tabla>_<evento>` | `trg_kardex_no_update` |

### 10.3 Tabla de Renombramiento

| Nombre Actual/Propuesto en PDF | Nombre Corregido |
|-------------------------------|-----------------|
| `table_tenant` | `tenants` |
| `table_apps` | `apps` |
| `table_planes` | `planes` |
| `table_empresas` | `empresas` (mantener) |
| `table_usuarios_empresa` | `usuarios` (mantener) |
| `table_usuarios_roles` | `roles` |
| `table_usuarios_permisos` | `permisos` |
| `table_rol_permisos` | `rol_permisos` |
| `table_inventario_productos` | `productos` (mantener) |
| `table_inventario_kardex` | `kardex` |
| `table_inventario_stock` | `inventario_stock` |
| `table_inventario_depositos` | `depositos` |
| `table_compras_proveedores` | `proveedores` (mantener) |
| `table_compras_facturas` | `facturas_compra` |
| `table_compras_facturas_det` | `facturas_compra_det` |
| `uptade_At` | `updated_at` |
| `id_empresa` | `empresa_id` |
| `id_tenant` | `tenant_id` |
| `id_producto` | `producto_id` |
| `nro_cedula_meto_pago` | `cedula_rif` |

---

## 11. Evaluacion de Riesgos

### 11.1 Matriz de Riesgos

| ID | Riesgo | Probabilidad | Impacto | Severidad | Mitigacion |
|----|--------|-------------|---------|-----------|------------|
| R1 | Perdida de datos durante migracion de stock (productos -> inventario_stock) | Baja | Critico | **Critico** | Backup previo, script de validacion pre/post, mantener campo legacy |
| R2 | Incompatibilidad de columnas GENERATED con PowerSync SQLite | Alta | Alto | **Critico** | Calcular en frontend o usar trigger para llenar el campo |
| R3 | UNIQUE globales causan colision entre empresas (estado actual) | Media | Alto | **Alto** | Fase 1 de migracion: convertir a UNIQUE por empresa |
| R4 | empresa_id NULL permite datos sin tenant (estado actual) | Media | Alto | **Alto** | Fase 1: ALTER COLUMN SET NOT NULL |
| R5 | Permisos rotos durante transicion de niveles a RBAC | Media | Alto | **Alto** | Ejecucion paralela, fallback a niveles |
| R6 | Impacto en rendimiento por JOINs adicionales (stock, marca, unidad) | Media | Medio | **Medio** | Indices compuestos, vistas materializadas |
| R7 | Complejidad de sync rules PowerSync con nuevas tablas | Media | Medio | **Medio** | Agregar tablas incrementalmente, probar en staging |
| R8 | Particionado de kardex incompatible con PowerSync | Media | Medio | **Medio** | Evaluar antes de implementar, considerar vistas |
| R9 | Typos propagados del PDF a produccion | Baja | Bajo | **Bajo** | Revision de nombres en fase de creacion SQL |
| R10 | Over-engineering: capa SaaS Platform sin uso inmediato | Baja | Medio | **Medio** | Implementar solo cuando haya segundo producto (ClaraClinic) |
| R11 | Migracion de compras historicas a nuevo formato fiscal | Media | Medio | **Medio** | Migrar solo datos futuros, archivar historicos |
| R12 | Triggers de inmutabilidad no cubren nuevas tablas | Media | Alto | **Alto** | Agregar triggers en la misma migracion que crea la tabla |

### 11.2 Distribucion de Riesgos

| Severidad | Cantidad | IDs |
|-----------|----------|-----|
| Critico | 2 | R1, R2 |
| Alto | 4 | R3, R4, R5, R12 |
| Medio | 4 | R6, R7, R8, R10, R11 |
| Bajo | 1 | R9 |

---

## 12. Recomendaciones Finales

### 12.1 Top 10 Mejoras Prioritarias

| # | Recomendacion | Urgencia | Esfuerzo | Impacto |
|---|---------------|----------|----------|---------|
| 1 | **Hacer `empresa_id` NOT NULL** en todas las tablas | Urgente | 1 dia | Critico - Cierra brecha de integridad multi-tenant |
| 2 | **Convertir UNIQUE globales a UNIQUE por empresa** (codigo, rif, nro_factura, etc.) | Urgente | 1 dia | Critico - Previene colisiones entre tenants |
| 3 | **Separar stock a tabla `inventario_stock`** con trigger desde kardex | Alta | 3 dias | Alto - Habilita multi-deposito y elimina race conditions |
| 4 | **Crear catalogo de impuestos** (`impuestos_ve`) con FK desde productos y ventas | Alta | 2 dias | Alto - Cumplimiento fiscal, trazabilidad |
| 5 | **Implementar RBAC** (roles + permisos) reemplazando niveles | Alta | 3 dias | Alto - Permisos granulares, extensible |
| 6 | **Agregar campos de auditoria** (`created_by`, `updated_by`) a todas las tablas mutables | Alta | 1 dia | Medio - Trazabilidad empresarial |
| 7 | **Crear catalogo de unidades de medida** con conversiones | Media | 1 dia | Medio - Extensibilidad, elimina hardcoding |
| 8 | **Crear tabla de depositos** con deposito principal por defecto | Media | 2 dias | Medio - Habilita multi-sede |
| 9 | **Estandarizar nombres** (corregir typos, unificar convenciones FK) | Media | 1 dia | Bajo - Calidad de codigo, mantenibilidad |
| 10 | **Agregar triggers de inmutabilidad** a nuevas tablas financieras (retenciones, etc.) | Alta | 1 dia | Alto - Integridad financiera |

### 12.2 Cambios Urgentes (Hacer Inmediatamente)

1. `empresa_id SET NOT NULL` en las 15 tablas de negocio
2. `UNIQUE(empresa_id, codigo)` en departamentos, productos, clientes, proveedores, ventas, notas_credito
3. Crear tabla `bancos` en PostgreSQL (ya existe en PowerSync schema)
4. Corregir mensaje de funcion `prevent_kardex_mutation()` para ser generico

### 12.3 Recomendaciones a Mediano Plazo (1-3 meses)

1. Implementar capa de inventario mejorado (stock separado, depositos, unidades)
2. Implementar capa fiscal venezolana (impuestos, tipos persona, retenciones)
3. Migrar a RBAC completo
4. Mejorar compras con desglose fiscal
5. Agregar particionado al kardex cuando supere 100K registros
6. Crear vistas materializadas para reportes de dashboard
7. Implementar `stock_reservado` para preventa/pedidos
8. Agregar `costo_promedio` calculado por trigger en kardex

### 12.4 Recomendaciones a Largo Plazo (3-12 meses)

1. Implementar capa SaaS Platform cuando exista segundo producto
2. Evaluar migracion a esquemas por tenant (PostgreSQL schemas) si los datos crecen significativamente
3. Considerar event sourcing para tablas inmutables (kardex, movimientos_cuenta)
4. Implementar CDC (Change Data Capture) para alimentar data warehouse
5. Evaluar columnar storage (TimescaleDB) para tablas de alto volumen temporal

---

## Anexo A: Checklist de Validacion Post-Migracion

Para cada fase de migracion, ejecutar:

```sql
-- 1. Verificar conteo de registros (debe coincidir pre/post)
SELECT 'productos' AS tabla, COUNT(*) FROM productos
UNION ALL SELECT 'inventario_stock', COUNT(*) FROM inventario_stock
-- ... etc

-- 2. Verificar integridad referencial
SELECT 'productos sin empresa' AS check, COUNT(*)
FROM productos WHERE empresa_id IS NULL
UNION ALL
SELECT 'stock sin producto', COUNT(*)
FROM inventario_stock s
LEFT JOIN productos p ON p.id = s.producto_id
WHERE p.id IS NULL

-- 3. Verificar consistencia de stock
SELECT p.id, p.nombre,
       old_stock, -- de backup
       s.cantidad_actual AS new_stock
FROM productos p
JOIN inventario_stock s ON s.producto_id = p.id
WHERE ABS(old_stock - s.cantidad_actual) > 0.001

-- 4. Verificar RLS funciona
SET ROLE authenticated;
SELECT current_empresa_id(); -- debe retornar UUID
SELECT * FROM productos; -- debe retornar solo datos de la empresa
```

## Anexo B: Diagrama de Dependencias para Creacion de Tablas

Orden de creacion respetando FKs:

```
Nivel 0 (sin dependencias):
  tenants, apps, monedas, tipos_persona_ve, permisos,
  tipos_movimiento, islr_conceptos_ve

Nivel 1 (depende de nivel 0):
  planes (-> apps)
  empresas (-> tenants)
  plataforma_metodos_pago

Nivel 2 (depende de nivel 1):
  empresas_fiscal_ve (-> empresas)
  roles (-> empresas)
  impuestos_ve (-> empresas)
  depositos (-> empresas)
  unidades (-> empresas)
  marcas (-> empresas)
  departamentos (-> empresas)
  ajuste_motivos (-> empresas)
  metodos_pago (-> empresas, monedas)
  suscripciones (-> tenants, planes)
  tenant_app_access (-> tenants, apps)

Nivel 3 (depende de nivel 2):
  usuarios (-> empresas, roles)
  productos (-> empresas, departamentos, marcas, unidades, impuestos_ve)
  proveedores (-> empresas, tipos_persona_ve, islr_conceptos_ve)
  clientes (-> empresas)
  tasas_cambio (-> empresas, monedas)
  unidades_conversion (-> unidades)
  rol_permisos (-> roles, permisos)
  pagos_suscripcion (-> suscripciones)

Nivel 4 (depende de nivel 3):
  inventario_stock (-> productos, depositos)
  kardex (-> productos, depositos, tipos_movimiento, monedas)
  recetas (-> productos, productos)
  ventas (-> clientes, usuarios)
  facturas_compra (-> proveedores, monedas)
  ajustes (-> empresas, ajuste_motivos)
  proveedores_bancos (-> proveedores, monedas)

Nivel 5 (depende de nivel 4):
  detalle_venta (-> ventas, productos, depositos)
  pagos (-> ventas, clientes, metodos_pago, monedas)
  notas_credito (-> ventas, clientes)
  movimientos_cuenta (-> clientes)
  facturas_compra_det (-> facturas_compra, productos, depositos, unidades)
  ajustes_det (-> ajustes, productos, depositos)

Nivel 6 (depende de nivel 5):
  retenciones_iva (-> facturas_compra)
  retenciones_islr (-> facturas_compra, islr_conceptos_ve)
  notas_fiscales_compra (-> facturas_compra, monedas)

Nivel 7 (depende de nivel 6):
  notas_fiscales_compra_det (-> notas_fiscales_compra, productos)
```

## Anexo C: Glosario

| Termino | Definicion |
|---------|------------|
| **Tenant** | Suscriptor de la plataforma SaaS. Puede tener multiples empresas |
| **Empresa** | Unidad de negocio con datos aislados. Pertenece a un tenant |
| **RBAC** | Role-Based Access Control. Permisos asignados a roles, roles asignados a usuarios |
| **Kardex** | Registro inmutable de movimientos de inventario (entradas/salidas) |
| **RLS** | Row Level Security. Filtrado automatico de filas en PostgreSQL |
| **SECURITY DEFINER** | Funcion que ejecuta con privilegios del owner, ignora RLS |
| **PowerSync** | Servicio de sincronizacion offline que replica PostgreSQL a SQLite local |
| **Bimonetario** | Sistema que opera en dos monedas (USD base + Bolivares) |
| **SENIAT** | Servicio Nacional Integrado de Administracion Aduanera y Tributaria (Venezuela) |
| **IVA** | Impuesto al Valor Agregado (16% en Venezuela) |
| **IGTF** | Impuesto a las Grandes Transacciones Financieras (3%) |
| **ISLR** | Impuesto Sobre La Renta |
| **Retencion** | Monto que el comprador retiene al proveedor por obligacion fiscal |
| **Nota de Credito (NCR)** | Documento que anula total o parcialmente una factura |
| **Nota de Debito (NDB)** | Documento que incrementa la deuda de una factura |

---

*Documento generado como parte de la evolucion arquitectonica de ClaraPOS.*
*Siguiente paso: Revisar y aprobar prioridades, luego iniciar Fase 1 de migracion.*
