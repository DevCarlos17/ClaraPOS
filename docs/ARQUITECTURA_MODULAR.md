# ClaraPOS — Decisiones de Arquitectura Modular

> Documento generado: 2026-05-07
> Estado: Borrador para revision. Pendiente de implementacion.

---

## 1. Vision General

ClaraPOS evoluciona de un sistema POS para clinica estetica a una **plataforma SaaS multi-vertical**. El mismo motor financiero sirve de base para distintos tipos de negocio, cada uno con su funcionalidad especifica habilitada segun el plan contratado.

```
[Plataforma ClaraPOS]
  ├── Core financiero        ← siempre presente para TODOS
  └── Modulos verticales     ← se habilitan segun el plan del tenant
        ├── Clinica Estetica
        ├── SPA
        └── Salon de Belleza
```

---

## 2. Principio Fundamental

**El core financiero es el piso obligatorio de todos los modulos verticales.**

Ningun modulo vertical funciona sin el core, porque todo tipo de negocio necesita:

| Necesidad del negocio | Feature del core |
|---|---|
| Cobrar servicios y productos | `ventas/` (POS) |
| Controlar stock de insumos | `inventario/` |
| Gestionar su cartera de clientes | `clientes/` |
| Manejar deudas de clientes | `cxc/` |
| Comprar a proveedores | `compras/` |
| Llevar la contabilidad | `contabilidad/` |
| Configurar empresa, cajeros, tasas | `configuracion/` |

Los modulos verticales **extienden** el core con funcionalidad especifica de su industria. Nunca lo reemplazan.

---

## 3. Arquitectura de Carpetas Propuesta

```
src/
├── core/              # Infraestructura (sin cambios)
├── features/          # Core financiero — presente en todos los tenants
│   ├── configuracion/
│   ├── inventario/
│   ├── ventas/
│   ├── clientes/
│   ├── caja/
│   ├── compras/
│   ├── cxc/
│   ├── contabilidad/
│   ├── bancos/
│   ├── proveedores/
│   └── reportes/
│
└── modules/           # Verticales opcionales — habilitados por plan
    ├── clinica/        # Clinica estetica
    │   ├── hooks/
    │   ├── schemas/
    │   └── components/
    │       ├── historias-clinicas/
    │       ├── sesiones/
    │       ├── fotografias/
    │       ├── consentimientos/
    │       └── agenda/
    ├── spa/            # SPA
    │   ├── hooks/
    │   ├── schemas/
    │   └── components/
    │       ├── cabinas/
    │       ├── tratamientos/
    │       ├── fichas-spa/
    │       └── agenda/
    └── salon/          # Salon de belleza
        ├── hooks/
        ├── schemas/
        └── components/
            ├── estilistas/
            ├── agenda/
            ├── historial/
            └── comisiones/
```

### Que agrega cada modulo vertical

**`modules/clinica/`**
- Historias clinicas con datos medicos (alergias, antecedentes)
- Sesiones de procedimientos con notas clinicas
- Fotos antes/despues con galeria (Supabase Storage)
- Consentimientos informados
- Mapas anatomicos para marcar zonas de tratamiento
- Agenda de citas con control de acceso a expedientes

**`modules/spa/`**
- Cabinas / salas de tratamiento
- Tipos de tratamiento con duracion (vinculados a productos tipo 'S' del core)
- Fichas spa del cliente: contraindicaciones, preferencias
- Agenda de citas: cliente + cabina + tratamiento + fecha/hora + estado
- Consumo de productos por sesion → usa `inventario/` del core

**`modules/salon/`**
- Estilistas con especialidades
- Agenda de citas: cliente + estilista + servicio + fecha/hora + estado
- Historial de coloraciones, cortes y tratamientos por cliente
- Comisiones por estilista sobre cada venta → referencia a `ventas/` del core
- Consumo de insumos → usa `inventario/` del core

---

## 4. Modelo de Tenants y Suscripciones

### Flujo de registro

```
Tenant se registra
  └── elige plan (determina el modulo)
  └── sistema lee planes_modulos → setea empresas.tipo_negocio
  └── se activa tenant_app_access
  └── PowerSync sincroniza solo las tablas del modulo habilitado
  └── Sidebar muestra solo las secciones del modulo habilitado
```

### Jerarquia de datos

```
tenants                    ← quien paga (dueno del negocio)
  └── suscripciones        ← que plan tiene y hasta cuando
        └── planes         ← definicion del plan con precio
              └── planes_modulos  ← que modulos incluye ese plan
  └── tenant_app_access    ← acceso activo / suspendido
  └── empresas             ← el negocio que usa el POS
        └── tipo_negocio   ← derivado automaticamente del plan contratado
```

### Planes y modulos

| Plan | Modulos incluidos | Observacion |
|---|---|---|
| ClaraPOS Base | core | Solo funcionalidad financiera |
| ClaraPOS Clinica | core + clinica | Para clinicas esteticas |
| ClaraPOS SPA | core + spa | Para spas |
| ClaraPOS Salon | core + salon | Para salones de belleza |
| ClaraPOS Completo | core + todos | Para negocios con multiples verticales |

### Panel de administrador (interno)

El dueno de ClaraPOS gestiona desde un panel interno:
- Ver todos los tenants activos / suspendidos
- Registrar pagos manualmente en `pagos_suscripcion`
- Cambiar plan de un tenant (upgrade/downgrade)
- Suspender / reactivar acceso via `tenant_app_access`
- Ver vencimientos proximos

---

## 5. Mecanismo de Habilitacion de Modulos

### Campo en la base de datos

```sql
-- Columna nueva en empresas
ALTER TABLE empresas
  ADD COLUMN tipo_negocio text NOT NULL DEFAULT 'clinica'
  CHECK (tipo_negocio IN ('clinica', 'spa', 'salon'));
```

Se setea automaticamente al momento del registro segun el plan elegido. Es inmutable despues de la creacion.

### Hook en el frontend

```typescript
// src/modules/use-modulo.ts
function useModulo() {
  const { user } = useCurrentUser()
  return {
    tieneModulo: (modulo: 'clinica' | 'spa' | 'salon') =>
      user?.tipo_negocio === modulo,
    moduloActivo: user?.tipo_negocio
  }
}
```

### Sidebar dinamico

```typescript
// Los items del sidebar filtran por modulo activo
const navItems = [
  // Core — siempre visible
  { label: 'Ventas',      href: '/ventas/nueva',    modulo: 'core' },
  { label: 'Inventario',  href: '/inventario',       modulo: 'core' },
  { label: 'Clientes',    href: '/clientes',         modulo: 'core' },

  // Verticales — solo si el modulo esta activo
  { label: 'Clinica',     href: '/clinica',          modulo: 'clinica' },
  { label: 'SPA',         href: '/spa',              modulo: 'spa' },
  { label: 'Salon',       href: '/salon',            modulo: 'salon' },
].filter(item =>
  item.modulo === 'core' || tieneModulo(item.modulo)
)
```

### PowerSync — sync rules

Las tablas de modulos verticales solo se sincronizan al dispositivo si el tenant tiene ese modulo:

```yaml
# Solo descarga tablas de SPA si el tenant es tipo spa
- table: cabinas
  where: empresa_id = bucket.empresa_id
    AND (SELECT tipo_negocio FROM empresas WHERE id = bucket.empresa_id) = 'spa'

- table: citas_spa
  where: empresa_id = bucket.empresa_id
    AND (SELECT tipo_negocio FROM empresas WHERE id = bucket.empresa_id) = 'spa'
```

Un tenant de clinica **nunca descarga** las tablas de SPA ni salon. Isolation total en el dispositivo.

---

## 6. Cambios en la Base de Datos

### 6.1 Tablas nuevas — SaaS layer (ya existe, agregar)

```sql
-- Tabla nueva para vincular planes con modulos
CREATE TABLE planes_modulos (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id  uuid NOT NULL REFERENCES planes(id),
  modulo   text NOT NULL CHECK (modulo IN ('core', 'clinica', 'spa', 'salon'))
);
```

### 6.2 Tablas nuevas — modulos verticales

**Modulo Clinica:**
```
historias_clinicas       -- ficha medica del cliente
sesiones_clinica         -- cada sesion de procedimiento
fotos_clinica            -- fotos antes/despues (referencia a Storage)
consentimientos          -- documentos firmados
mapas_anatomicos_notas   -- anotaciones por zona corporal
citas_clinica            -- agenda de citas
```

**Modulo SPA:**
```
cabinas                  -- salas de tratamiento
tratamientos_spa         -- tipos de tratamiento (vinculados a productos tipo 'S')
fichas_spa               -- datos spa del cliente (contraindicaciones, preferencias)
citas_spa                -- agenda: cliente + cabina + tratamiento + fecha/hora
```

**Modulo Salon:**
```
estilistas               -- empleados con especialidades
citas_salon              -- agenda: cliente + estilista + servicio + fecha/hora
historial_salon          -- coloraciones, cortes, observaciones por visita
comisiones               -- comision de estilista sobre cada venta
```

Todas estas tablas siguen el patron del core:
- `empresa_id` en cada tabla (multi-tenant)
- UUID como PK
- `created_at` / `updated_at`
- FK hacia tablas del core donde corresponda (clientes, productos, ventas, etc.)

### 6.3 Optimizaciones de tablas existentes

**Unificacion de retenciones (4 → 1):**

```sql
-- Reemplaza: retenciones_iva_ventas, retenciones_islr_ventas,
--            retenciones_iva, retenciones_islr
CREATE TABLE retenciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL,
  tipo                 text CHECK (tipo IN ('IVA', 'ISLR')),
  lado                 text CHECK (lado IN ('VENTAS', 'COMPRAS')),
  venta_id             uuid REFERENCES ventas(id),
  factura_compra_id    uuid REFERENCES facturas_compra(id),
  cliente_id           uuid REFERENCES clientes(id),
  proveedor_id         uuid REFERENCES proveedores(id),
  nro_comprobante      text,
  fecha_comprobante    date,
  periodo_fiscal       text,
  base_imponible       numeric(18,4),
  porcentaje_retencion numeric(6,4),
  monto_retenido       numeric(18,2),
  status               text,
  observaciones        text,
  created_at           timestamptz DEFAULT now(),
  created_by           uuid
);
```

**Unificacion de movimientos de tesoreria (3 → 1):**

```sql
-- Reemplaza: movimientos_bancarios, movimientos_metodo_cobro, mov_caja_fuerte
CREATE TABLE movimientos_tesoreria (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  cuenta_tipo    text CHECK (cuenta_tipo IN ('BANCO', 'METODO_COBRO', 'CAJA_FUERTE')),
  cuenta_id      uuid NOT NULL,
  tipo           text CHECK (tipo IN ('ENTRADA', 'SALIDA')),
  origen         text,
  monto          numeric(18,2),
  saldo_anterior numeric(18,2),
  saldo_nuevo    numeric(18,2),
  doc_origen_id  uuid,
  doc_origen_tipo text,
  referencia     text,
  descripcion    text,
  validado       boolean DEFAULT false,
  validado_por   uuid,
  validado_at    timestamptz,
  reversado      boolean DEFAULT false,
  reverso_de     uuid,
  sesion_caja_id uuid,
  fecha          date,
  created_at     timestamptz DEFAULT now(),
  created_by     uuid
);
```

**Absorcion de `caja_fuerte` en `bancos_empresa`:**

```sql
ALTER TABLE bancos_empresa
  ADD COLUMN es_caja_fuerte boolean DEFAULT false;
-- Los movimientos van a movimientos_tesoreria con cuenta_tipo = 'CAJA_FUERTE'
```

**`gasto_pagos` — expandir para multiples pagos:**

```sql
-- Se mantiene como tabla separada y se expande
-- Permite N pagos por gasto (pagos parciales, cuotas)
ALTER TABLE gasto_pagos
  ADD COLUMN fecha      date,
  ADD COLUMN concepto   text,
  ADD COLUMN status     text CHECK (status IN ('PENDIENTE', 'APLICADO', 'REVERSADO'));
```

### 6.4 Orden de migraciones

```
migrations/
├── 0040_tipo_negocio_empresas.sql         -- ADD COLUMN tipo_negocio
├── 0041_planes_modulos.sql                -- tabla de modulos por plan
├── 0042_unificar_retenciones.sql          -- nueva tabla retenciones (migrar datos)
├── 0043_unificar_mov_tesoreria.sql        -- nueva tabla movimientos_tesoreria
├── 0044_absorber_caja_fuerte.sql          -- ADD COLUMN es_caja_fuerte a bancos_empresa
├── 0045_expandir_gasto_pagos.sql          -- ADD COLUMNS a gasto_pagos
├── 0046_modulo_clinica.sql                -- tablas del modulo clinica
├── 0047_modulo_spa.sql                    -- tablas del modulo spa
└── 0048_modulo_salon.sql                  -- tablas del modulo salon
```

---

## 7. Resumen de Impacto en Tablas

| Operacion | Antes | Despues |
|---|---|---|
| Unificar retenciones | 4 tablas | 1 tabla (-3) |
| Unificar movimientos tesoreria | 3 tablas | 1 tabla (-2) |
| Absorber caja_fuerte | 2 tablas | 0 tablas (-2) |
| Agregar planes_modulos | 0 | 1 tabla (+1) |
| Agregar tipo_negocio a empresas | — | +1 columna |
| **Total tablas** | **71** | **~65** |

---

## 8. Pendientes de Definir

Estos puntos quedaron abiertos para una proxima sesion:

- [ ] Esquema detallado de cada tabla de los modulos verticales (columnas completas)
- [ ] Permisos nuevos por modulo (ej: `clinic.access`, `spa.agenda`, `salon.comisiones`)
- [ ] Flujo de onboarding: pantalla de seleccion de modulo en el registro
- [ ] Panel de administrador: alcance y pantallas del admin interno
- [ ] Politica de upgrade/downgrade de plan (que pasa con los datos del modulo anterior)
- [ ] Estrategia de migracion: orden y dependencias entre las migraciones 0042-0044

---

## 9. Lo Que No Cambia

- La arquitectura feature-based de `src/features/` no se toca
- Las 12 reglas de negocio criticas del core (inmutabilidad, bimonetario, stock via kardex, etc.)
- El sistema de permisos por nivel (1/2/3) existente
- El patron de sync PowerSync + Supabase
- El patron de queries con `empresa_id`
