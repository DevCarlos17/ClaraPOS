# Diagrama de Base de Datos - ClaraPOS

Diagrama completo del esquema de base de datos de ClaraPOS, un sistema POS multi-tenant bimonetario con auditoria inmutable.

**Fuente**: `supabase-setup.sql`

---

## Diagrama completo (Mermaid ER)

```mermaid
erDiagram
    empresas ||--o{ usuarios : "tiene"
    empresas ||--o{ tasas_cambio : "posee"
    empresas ||--o{ departamentos : "posee"
    empresas ||--o{ productos : "posee"
    empresas ||--o{ recetas : "posee"
    empresas ||--o{ movimientos_inventario : "posee"
    empresas ||--o{ metodos_pago : "posee"
    empresas ||--o{ clientes : "posee"
    empresas ||--o{ movimientos_cuenta : "posee"
    empresas ||--o{ ventas : "posee"
    empresas ||--o{ detalle_venta : "posee"
    empresas ||--o{ pagos : "posee"
    empresas ||--o{ notas_credito : "posee"
    empresas ||--o{ proveedores : "posee"
    empresas ||--o{ compras : "posee"
    empresas ||--o{ detalle_compra : "posee"

    departamentos ||--o{ productos : "clasifica"
    productos ||--o{ recetas : "es servicio (BOM)"
    productos ||--o{ recetas : "es insumo"
    productos ||--o{ movimientos_inventario : "mueve stock"
    productos ||--o{ detalle_venta : "se vende"
    productos ||--o{ detalle_compra : "se compra"

    usuarios ||--o{ movimientos_inventario : "registra"
    usuarios ||--o{ ventas : "factura"
    usuarios ||--o{ notas_credito : "anula"
    usuarios ||--o{ compras : "registra"

    clientes ||--o{ ventas : "compra"
    clientes ||--o{ movimientos_cuenta : "libro auxiliar"
    clientes ||--o{ pagos : "abona"
    clientes ||--o{ notas_credito : "recibe"

    ventas ||--o{ detalle_venta : "contiene"
    ventas ||--o{ pagos : "paga"
    ventas ||--|| notas_credito : "anula"

    metodos_pago ||--o{ pagos : "usa"

    proveedores ||--o{ compras : "provee"
    compras ||--o{ detalle_compra : "contiene"

    empresas {
        uuid id PK
        varchar nombre
        varchar rif
        text direccion
        varchar telefono
        varchar email
        varchar nro_fiscal
        boolean activo
    }

    usuarios {
        uuid id PK "= auth.users.id"
        uuid empresa_id FK
        text email
        text nombre
        int level "1=Dueno 2=Super 3=Cajero"
        boolean activo
    }

    tasas_cambio {
        uuid id PK
        uuid empresa_id FK
        numeric valor "INMUTABLE"
        timestamptz fecha
    }

    departamentos {
        uuid id PK
        uuid empresa_id FK
        text codigo UK "INMUTABLE"
        text nombre
        boolean activo
    }

    productos {
        uuid id PK
        uuid empresa_id FK
        uuid departamento_id FK
        text codigo UK "INMUTABLE"
        text tipo "P=Prod S=Serv INMUTABLE"
        text nombre
        numeric costo_usd
        numeric precio_venta_usd
        numeric precio_mayor_usd
        numeric stock "solo via Kardex"
        numeric stock_minimo
        text medida "UND GRA"
    }

    recetas {
        uuid id PK
        uuid empresa_id FK
        uuid servicio_id FK
        uuid producto_id FK
        numeric cantidad
    }

    movimientos_inventario {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid producto_id FK
        uuid usuario_id FK
        uuid venta_id
        text tipo "E=Entrada S=Salida"
        text origen "MAN FAC VEN AJU NCR COM"
        numeric cantidad
        numeric stock_anterior
        numeric stock_nuevo
    }

    metodos_pago {
        uuid id PK
        uuid empresa_id FK
        text nombre
        text moneda "USD BS"
    }

    clientes {
        uuid id PK
        uuid empresa_id FK
        text identificacion UK "INMUTABLE"
        text nombre_social
        numeric limite_credito
        numeric saldo_actual "solo via trigger"
    }

    movimientos_cuenta {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid cliente_id FK
        uuid venta_id
        text tipo "FAC PAG NCR NDB"
        numeric monto
        numeric saldo_anterior
        numeric saldo_nuevo
    }

    ventas {
        uuid id PK "NO DELETE"
        uuid empresa_id FK
        uuid cliente_id FK
        uuid usuario_id FK
        text nro_factura UK
        numeric tasa "foto del momento"
        numeric total_usd
        numeric total_bs
        numeric saldo_pend_usd "solo baja"
        text tipo "CONTADO CREDITO"
        boolean anulada "solo false-true"
    }

    detalle_venta {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid venta_id FK
        uuid producto_id FK
        numeric cantidad
        numeric precio_unitario_usd
    }

    pagos {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid venta_id FK
        uuid cliente_id FK
        uuid metodo_pago_id FK
        text moneda "USD BS"
        numeric tasa
        numeric monto
        numeric monto_usd
    }

    notas_credito {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid venta_id FK_UK
        uuid cliente_id FK
        uuid usuario_id FK
        text nro_ncr UK
        numeric tasa_historica
        numeric monto_total_usd
        numeric monto_total_bs
    }

    proveedores {
        uuid id PK
        uuid empresa_id FK
        varchar razon_social
        varchar rif UK "INMUTABLE"
        boolean retiene_iva
        boolean retiene_islr
    }

    compras {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid proveedor_id FK
        uuid usuario_id FK
        text nro_compra
        numeric tasa
        numeric total_usd
        numeric total_bs
    }

    detalle_compra {
        uuid id PK "INMUTABLE"
        uuid empresa_id FK
        uuid compra_id FK
        uuid producto_id FK
        numeric cantidad
        numeric costo_unitario_usd
    }
```

---

## Vista agrupada por dominios

```
┌──────────────────────── NUCLEO MULTI-TENANT ────────────────────────┐
│                                                                      │
│   empresas ──1:N──> usuarios (level 1/2/3)                           │
│      │                                                                │
│      └──1:N──> TODAS las tablas de negocio tienen empresa_id         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

┌────────────── CONFIG ──────────────┐  ┌────────── INVENTARIO ──────────┐
│                                     │  │                                 │
│  tasas_cambio    (inmutable)        │  │  departamentos                  │
│  metodos_pago                       │  │      │                          │
│  level_permissions (global)         │  │      └─1:N─> productos          │
│                                     │  │                 │               │
└─────────────────────────────────────┘  │                 ├─ recetas      │
                                          │                 │  (BOM para   │
                                          │                 │   servicios) │
                                          │                 │              │
                                          │                 └─ movimientos_│
                                          │                    inventario  │
                                          │                    (KARDEX     │
                                          │                    inmutable)  │
                                          └────────────────────────────────┘

┌──────────────── CLIENTES ───────────────┐
│                                          │
│  clientes                                │
│     │                                    │
│     ├─ saldo_actual (solo via trigger)   │
│     │                                    │
│     └─1:N─> movimientos_cuenta           │
│             (libro auxiliar, inmutable)  │
│             tipo: FAC / PAG / NCR / NDB  │
│                                          │
└──────────────────────────────────────────┘

┌──────────────────────────── VENTAS / POS ───────────────────────────┐
│                                                                      │
│   ventas  ──N:1──> clientes                                          │
│      │    ──N:1──> usuarios                                          │
│      │                                                                │
│      ├─1:N─> detalle_venta ──N:1──> productos    (inmutable)         │
│      │                                                                │
│      ├─1:N─> pagos  ──N:1──> metodos_pago        (inmutable)         │
│      │       (bimonetario USD/Bs con tasa foto)                      │
│      │                                                                │
│      └─1:1─> notas_credito  (anulacion, inmutable)                   │
│                                                                       │
│   Efectos colaterales de una venta:                                  │
│     - movimientos_inventario (salida por cada producto/receta)       │
│     - movimientos_cuenta (si CREDITO, genera FAC)                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘

┌──────────────── PROVEEDORES / COMPRAS ────────────────────┐
│                                                            │
│   proveedores                                              │
│       │                                                     │
│       └─1:N─> compras ──N:1──> usuarios                    │
│                  │                                          │
│                  └─1:N─> detalle_compra ──N:1─> productos  │
│                                                              │
│   Efectos: movimientos_inventario (entrada origen='COM')    │
└─────────────────────────────────────────────────────────────┘
```

---

## Como funciona el flujo (puntos clave)

### 1. Aislamiento multi-tenant
Toda tabla de negocio tiene `empresa_id` FK a `empresas`. Las policies RLS filtran:

```sql
empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
```

Un usuario solo ve datos de su empresa.

### 2. Cadena de inmutabilidad (triggers bloquean UPDATE/DELETE)

**Totalmente inmutables:**
- `tasas_cambio`
- `movimientos_inventario`
- `movimientos_cuenta`
- `detalle_venta`
- `pagos`
- `notas_credito`
- `compras`
- `detalle_compra`

**Semi-inmutables:**
- `ventas` - permite UPDATE solo para `anulada` (false→true) y `saldo_pend_usd` (solo baja)

### 3. Stock solo via Kardex
`productos.stock` nunca se edita directo. Cada movimiento guarda `stock_anterior` y `stock_nuevo`, y un trigger valida consistencia matematica.

**Origenes posibles:**
- `MAN` - manual
- `FAC` - facturacion
- `VEN` - venta
- `AJU` - ajuste
- `NCR` - nota credito
- `COM` - compra

### 4. Saldo cliente via trigger
Al insertar en `movimientos_cuenta`, el trigger `actualizar_saldo_cliente` lee `saldo_actual`, lo suma/resta segun tipo y actualiza `clientes.saldo_actual`.

| Tipo | Efecto en saldo |
|------|-----------------|
| `FAC` | Suma (factura a credito) |
| `NDB` | Suma (nota de debito) |
| `PAG` | Resta (pago del cliente) |
| `NCR` | Resta (nota de credito) |

### 5. Bimonetario con foto de tasa
Campos con tasa historica guardada en cada transaccion:
- `ventas.tasa`
- `pagos.tasa`
- `notas_credito.tasa_historica`
- `compras.tasa`

La tasa del momento queda guardada para recalculos historicos.

### 6. Recetas (BOM)
`productos` tipo `S` (servicio) tiene `stock=0` fijo. Al venderse consume productos tipo `P` via `recetas` (self-reference: `servicio_id` y `producto_id` ambos apuntan a `productos`).

### 7. Auth en cascada
`auth.users` → trigger `handle_new_user` → inserta en `usuarios` leyendo `empresa_id` y `level` del `raw_user_meta_data`.

---

## Niveles de usuario

| Level | Rol | Descripcion |
|-------|-----|-------------|
| 1 | Propietario | Acceso total, gestiona empleados |
| 2 | Supervisor | Operativo completo (ventas, inventario, reportes, creditos) |
| 3 | Cajero | Basico (ventas, consultas) |

Los permisos del nivel 2 y 3 se guardan en `level_permissions` (tabla global, no por empresa). El nivel 1 es hardcoded (return true).

---

## Tablas por dominio

| Dominio | Tablas |
|---------|--------|
| **Multi-tenant** | `empresas`, `usuarios` |
| **Configuracion** | `tasas_cambio`, `metodos_pago`, `level_permissions` |
| **Inventario** | `departamentos`, `productos`, `recetas`, `movimientos_inventario` |
| **Clientes** | `clientes`, `movimientos_cuenta` |
| **Ventas/POS** | `ventas`, `detalle_venta`, `pagos`, `notas_credito` |
| **Proveedores/Compras** | `proveedores`, `compras`, `detalle_compra` |
