# Plan: Modulo Contable - Libro Contable con Partida Doble

## Contexto

ClaraPOS tiene un modulo contable basico (`plan_cuentas` con 2 tipos + `gastos`). Se necesita expandirlo a un sistema contable completo con partida doble que centralice TODOS los movimientos financieros del sistema en un libro contable unificado (`libro_contable`). Cada operacion en cualquier modulo (ventas, compras, gastos, CxC, CxP, NCR) generara automaticamente sus asientos contables correspondientes. El plan de cuentas seguira las normas NIIF/NIC, Ba VEN-NIIF y leyes fiscales venezolanas (IVA, ISLR, IGTF).

---

## Arquitectura de Datos

### 1. ALTER `plan_cuentas` - Expandir tipos y agregar naturaleza

**Archivo**: `migrations/0019_libro_contable.sql`

Cambios:
- Expandir `tipo` CHECK: `'ACTIVO','PASIVO','PATRIMONIO','INGRESO','COSTO','GASTO'`
- Agregar columna `naturaleza TEXT NOT NULL CHECK ('DEUDORA','ACREEDORA')`
- Migrar datos existentes: `GASTO` -> naturaleza `DEUDORA`, `INGRESO_OTRO` -> tipo `INGRESO`, naturaleza `ACREEDORA`

### 2. CREATE `cuentas_config` - Mapeo modulo->cuenta contable

Tabla que define que cuenta contable usar para cada tipo de transaccion automatica:

```
cuentas_config (
  id, empresa_id, clave TEXT UNIQUE(empresa_id,clave),
  cuenta_contable_id FK plan_cuentas, descripcion,
  created_at, updated_at, created_by, updated_by
)
```

Claves predefinidas del seed:
| Clave | Descripcion | Cuenta |
|-------|-------------|--------|
| CAJA_EFECTIVO | Efectivo en caja | 1.1.01.01 |
| BANCO_DEFAULT | Bancos | 1.1.01.03 |
| CXC_CLIENTES | Cuentas por cobrar | 1.1.02.01 |
| INVENTARIO | Inventario mercancia | 1.1.03.01 |
| IVA_CREDITO | IVA credito fiscal | 1.1.04.01 |
| RET_IVA_SOPORTADA | Retenciones IVA soportadas | 1.1.04.02 |
| RET_ISLR_SOPORTADA | Retenciones ISLR soportadas | 1.1.04.03 |
| CXP_PROVEEDORES | Cuentas por pagar | 2.1.01.01 |
| IVA_DEBITO | IVA debito fiscal | 2.1.02.01 |
| RET_IVA_POR_ENTERAR | Ret IVA por enterar | 2.1.02.02 |
| RET_ISLR_POR_ENTERAR | Ret ISLR por enterar | 2.1.02.03 |
| IGTF_POR_PAGAR | IGTF por pagar | 2.1.02.04 |
| INGRESO_VENTA_PRODUCTO | Ventas de productos | 4.1.01 |
| INGRESO_VENTA_SERVICIO | Servicios prestados | 4.1.02 |
| DESCUENTO_VENTAS | Descuentos en ventas | 4.1.03 |
| DEVOLUCION_VENTAS | Devoluciones en ventas | 4.1.04 |
| COSTO_VENTA | Costo de mercancia vendida | 5.1.01 |

### 3. ALTER `bancos_empresa` - Vincular a cuenta contable

Agregar `cuenta_contable_id UUID REFERENCES plan_cuentas(id)` para que cada banco tenga su cuenta contable especifica. Si un banco tiene cuenta asignada, el generador de asientos usa esa en vez de `BANCO_DEFAULT`.

### 4. CREATE `libro_contable` - Libro contable unificado (partida doble)

```sql
libro_contable (
  id UUID PK,
  empresa_id UUID NOT NULL FK empresas,
  nro_asiento TEXT NOT NULL UNIQUE(empresa_id, nro_asiento),  -- LC-000001
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Origen
  modulo_origen TEXT NOT NULL CHECK (
    'VENTA','PAGO_CXC','COMPRA','PAGO_CXP','GASTO',
    'NCR_VENTA','NCR_COMPRA','NDB','MANUAL','REVERSO'
  ),
  doc_origen_id UUID,           -- FK polimorfica al documento
  doc_origen_ref TEXT,           -- Referencia legible: "FAC-000123"
  -- Contabilidad
  cuenta_contable_id UUID NOT NULL FK plan_cuentas,
  banco_empresa_id UUID FK bancos_empresa,  -- nullable, solo si aplica
  monto NUMERIC(12,2) NOT NULL,  -- positivo = DEBE, negativo = HABER
  detalle TEXT NOT NULL,
  -- Control
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK ('PENDIENTE','CONCILIADO','ANULADO'),
  parent_id UUID FK libro_contable,  -- para contra-asientos (reversal)
  -- Auditoria
  usuario_id UUID NOT NULL FK usuarios,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Reglas de inmutabilidad**:
- No DELETE nunca
- UPDATE solo: estado PENDIENTE -> CONCILIADO o PENDIENTE -> ANULADO
- No se pueden modificar monto, cuenta, banco, nro_asiento

**Partida doble**: Cada operacion genera N asientos que suman cero. Ejemplo venta contado: DEBE banco +100, HABER ingreso -100 = suma 0.

**Saldo acumulado**: Se calcula dinamicamente con `SUM(monto) OVER (ORDER BY fecha_registro)` en la query, NO se almacena. Esto evita conflictos de sincronizacion offline.

### 5. Plan de cuentas seed - Apegado a NIIF/Ba VEN-NIIF

Funcion SQL `seed_plan_cuentas(empresa_id, created_by)` que se ejecuta:
- En la migracion para empresas existentes
- Desde el frontend al primer acceso al modulo contable (si no hay cuentas)

Plan de cuentas base (~40 cuentas):
```
1       ACTIVO                          (DEUDORA, grupo)
1.1     ACTIVO CORRIENTE                (DEUDORA, grupo)
1.1.01  EFECTIVO Y EQUIVALENTES         (DEUDORA, grupo)
1.1.01.01 CAJA GENERAL                  (DEUDORA, detalle)
1.1.01.02 CAJA CHICA                    (DEUDORA, detalle)
1.1.01.03 BANCOS                        (DEUDORA, detalle)
1.1.02  CUENTAS POR COBRAR COMERCIALES  (DEUDORA, grupo)
1.1.02.01 CLIENTES                      (DEUDORA, detalle)
1.1.03  INVENTARIOS                     (DEUDORA, grupo)
1.1.03.01 INVENTARIO DE MERCANCIA       (DEUDORA, detalle)
1.1.04  IMPUESTOS POR RECUPERAR         (DEUDORA, grupo)
1.1.04.01 IVA CREDITO FISCAL            (DEUDORA, detalle)
1.1.04.02 RETENCIONES IVA SOPORTADAS    (DEUDORA, detalle)
1.1.04.03 RETENCIONES ISLR SOPORTADAS   (DEUDORA, detalle)
1.2     ACTIVO NO CORRIENTE             (DEUDORA, grupo)
2       PASIVO                          (ACREEDORA, grupo)
2.1     PASIVO CORRIENTE                (ACREEDORA, grupo)
2.1.01  CUENTAS POR PAGAR COMERCIALES   (ACREEDORA, grupo)
2.1.01.01 PROVEEDORES                   (ACREEDORA, detalle)
2.1.02  IMPUESTOS POR PAGAR            (ACREEDORA, grupo)
2.1.02.01 IVA DEBITO FISCAL             (ACREEDORA, detalle)
2.1.02.02 RETENCIONES IVA POR ENTERAR   (ACREEDORA, detalle)
2.1.02.03 RETENCIONES ISLR POR ENTERAR  (ACREEDORA, detalle)
2.1.02.04 IGTF POR PAGAR               (ACREEDORA, detalle)
2.1.03  OBLIGACIONES LABORALES          (ACREEDORA, grupo)
2.2     PASIVO NO CORRIENTE             (ACREEDORA, grupo)
3       PATRIMONIO                      (ACREEDORA, grupo)
3.1     CAPITAL SOCIAL                  (ACREEDORA, detalle)
3.2     RESERVA LEGAL                   (ACREEDORA, detalle)
3.3     RESULTADOS ACUMULADOS           (ACREEDORA, detalle)
3.4     RESULTADO DEL EJERCICIO         (ACREEDORA, detalle)
4       INGRESOS                        (ACREEDORA, grupo)
4.1     INGRESOS OPERACIONALES          (ACREEDORA, grupo)
4.1.01  VENTAS DE PRODUCTOS             (ACREEDORA, detalle)
4.1.02  PRESTACION DE SERVICIOS         (ACREEDORA, detalle)
4.1.03  DESCUENTOS EN VENTAS            (DEUDORA, detalle)
4.1.04  DEVOLUCIONES EN VENTAS          (DEUDORA, detalle)
4.2     OTROS INGRESOS                  (ACREEDORA, grupo)
5       COSTOS                          (DEUDORA, grupo)
5.1     COSTO DE VENTAS                 (DEUDORA, grupo)
5.1.01  COSTO DE MERCANCIA VENDIDA      (DEUDORA, detalle)
5.1.02  COSTO DE SERVICIOS PRESTADOS    (DEUDORA, detalle)
6       GASTOS                          (DEUDORA, grupo)
6.1     GASTOS OPERACIONALES            (DEUDORA, grupo)
6.1.01  GASTOS DE PERSONAL              (DEUDORA, detalle)
6.1.02  SERVICIOS BASICOS               (DEUDORA, detalle)
6.1.03  ALQUILER                        (DEUDORA, detalle)
6.1.04  MANTENIMIENTO Y REPARACIONES    (DEUDORA, detalle)
6.1.05  DEPRECIACION                    (DEUDORA, detalle)
6.1.06  SEGUROS                         (DEUDORA, detalle)
6.1.07  PAPELERIA Y UTILES              (DEUDORA, detalle)
6.1.08  OTROS GASTOS OPERACIONALES      (DEUDORA, detalle)
6.2     GASTOS NO OPERACIONALES         (DEUDORA, grupo)
6.2.01  GASTOS FINANCIEROS              (DEUDORA, detalle)
```

---

## Logica de Asientos por Modulo

Cada operacion genera asientos que suman cero (partida doble). `monto > 0` = DEBE, `monto < 0` = HABER.

### VENTA CONTADO ($100 producto, pago banco)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +100 | | BANCO (o cuenta del banco_empresa) |
| | -100 | INGRESO_VENTA_PRODUCTO |

### VENTA CREDITO ($100 producto, sin pago)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +100 | | CXC_CLIENTES |
| | -100 | INGRESO_VENTA_PRODUCTO |

### VENTA MIXTA ($100, paga $40, queda $60 credito)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +40 | | BANCO |
| +60 | | CXC_CLIENTES |
| | -100 | INGRESO_VENTA_PRODUCTO |

### VENTA CON SERVICIOS ($50 producto + $30 servicio)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +80 | | BANCO |
| | -50 | INGRESO_VENTA_PRODUCTO |
| | -30 | INGRESO_VENTA_SERVICIO |

### PAGO CXC (cliente paga $60 pendiente)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +60 | | BANCO |
| | -60 | CXC_CLIENTES |

### COMPRA CONTADO ($200 mercancia)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +200 | | INVENTARIO |
| | -200 | BANCO |

### COMPRA CREDITO ($200)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +200 | | INVENTARIO |
| | -200 | CXP_PROVEEDORES |

### PAGO CXP ($200 al proveedor)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +200 | | CXP_PROVEEDORES |
| | -200 | BANCO |

### GASTO ($50 servicios basicos, pago banco)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +50 | | Cuenta del gasto (plan_cuentas del gasto) |
| | -50 | BANCO |

### NCR VENTA (anulacion factura $100)
| DEBE | HABER | Cuenta |
|------|-------|--------|
| +100 | | DEVOLUCION_VENTAS (o INGRESO_VENTA_PRODUCTO) |
| | -100 | BANCO o CXC_CLIENTES (segun caso) |
Los asientos originales de la venta se marcan estado=ANULADO.

### REVERSO MANUAL (contra-asiento)
Crea exactamente los mismos asientos del original pero con monto * -1, y parent_id apuntando al original. El original se marca estado=ANULADO.

---

## Archivos a Crear/Modificar

### Backend (SQL)
| Archivo | Accion | Detalle |
|---------|--------|---------|
| `migrations/0019_libro_contable.sql` | CREAR | ALTER plan_cuentas + CREATE cuentas_config + CREATE libro_contable + ALTER bancos_empresa + seed function + triggers + RLS |

### Sync (PowerSync)
| Archivo | Accion |
|---------|--------|
| `backend/powersync-sync-rules.yaml` | MODIFICAR: agregar libro_contable y cuentas_config al bucket by_empresa |
| `src/core/db/powersync/schema.ts` | MODIFICAR: agregar tablas libro_contable y cuentas_config, actualizar plan_cuentas (naturaleza) y bancos_empresa (cuenta_contable_id) |
| `src/core/db/kysely/types.ts` | MODIFICAR: agregar interfaces LibroContable y CuentasConfig, actualizar PlanCuentas y BancosEmpresa, agregar al tipo DB |

### Feature Contabilidad - Nuevo
| Archivo | Accion |
|---------|--------|
| `src/features/contabilidad/lib/generar-asientos.ts` | CREAR: Helper puro para generar INSERT de libro_contable dentro de un tx existente |
| `src/features/contabilidad/hooks/use-libro-contable.ts` | CREAR: useLibroContable(filtros), crearAsientoManual(), conciliarAsiento(), reversarAsiento() |
| `src/features/contabilidad/hooks/use-cuentas-config.ts` | CREAR: useCuentasConfig(), actualizarCuentaConfig() |
| `src/features/contabilidad/schemas/libro-contable-schema.ts` | CREAR: Zod schema para movimientos manuales |
| `src/features/contabilidad/schemas/cuentas-config-schema.ts` | CREAR: Zod schema para config |
| `src/features/contabilidad/components/libro-contable-list.tsx` | CREAR: Vista principal con filtros, tabla, acciones de fila |
| `src/features/contabilidad/components/libro-contable-form.tsx` | CREAR: Dialog para movimientos manuales |
| `src/features/contabilidad/components/cuentas-config-list.tsx` | CREAR: Vista de configuracion de cuentas |
| `src/routes/_app/contabilidad/libro-contable.tsx` | CREAR: Ruta |
| `src/routes/_app/contabilidad/cuentas-config.tsx` | CREAR: Ruta |

### Feature Contabilidad - Modificar
| Archivo | Accion |
|---------|--------|
| `src/features/contabilidad/schemas/cuenta-schema.ts` | MODIFICAR: expandir enum tipo a 6 valores, agregar naturaleza |
| `src/features/contabilidad/hooks/use-plan-cuentas.ts` | MODIFICAR: agregar naturaleza a interface y funciones |
| `src/features/contabilidad/components/plan-cuentas-list.tsx` | MODIFICAR: badges para 6 tipos + naturaleza |
| `src/features/contabilidad/components/cuenta-form.tsx` | MODIFICAR: form para nuevos tipos y naturaleza |

### Integracion con Modulos Existentes
| Archivo | Accion |
|---------|--------|
| `src/features/ventas/hooks/use-ventas.ts` | MODIFICAR: agregar generacion de asientos en crearVenta() |
| `src/features/contabilidad/hooks/use-gastos.ts` | MODIFICAR: agregar generacion de asientos en crearGasto() y anularGasto() |
| `src/features/ventas/hooks/use-notas-credito.ts` | MODIFICAR: agregar generacion de asientos en crearNotaCredito() |
| `src/features/cxc/hooks/use-cxc.ts` | MODIFICAR: agregar asientos en registrarPagoFactura(), registrarAbonoGlobal(), registrarReversoAbono() |
| `src/features/inventario/hooks/use-compras.ts` | MODIFICAR: agregar asientos en crearCompra() |

### Configuracion Bancaria
| Archivo | Accion |
|---------|--------|
| `src/features/configuracion/schemas/banco-schema.ts` | MODIFICAR: agregar cuenta_contable_id opcional |
| `src/features/configuracion/components/banco-form.tsx` | MODIFICAR: agregar selector de cuenta contable |

### Navegacion
| Archivo | Accion |
|---------|--------|
| `src/components/layout/sidebar.tsx` | MODIFICAR: agregar "Libro Contable" y "Config. Contable" bajo Contabilidad |

---

## Orden de Implementacion

### Paso 1: Migracion SQL
- Crear `migrations/0019_libro_contable.sql` con:
  - ALTER plan_cuentas (tipo expandido + naturaleza)
  - CREATE cuentas_config
  - CREATE libro_contable + triggers inmutabilidad
  - ALTER bancos_empresa (cuenta_contable_id)
  - CREATE seed_plan_cuentas() function con plan NIIF/Ba VEN-NIIF
  - RLS para todas las tablas nuevas
  - Seed para empresas existentes

### Paso 2: PowerSync + Tipos
- Actualizar schema.ts (agregar tablas, modificar existentes)
- Actualizar types.ts (interfaces TypeScript)
- Actualizar powersync-sync-rules.yaml

### Paso 3: Plan de Cuentas Expandido
- Actualizar cuenta-schema.ts, use-plan-cuentas.ts
- Actualizar plan-cuentas-list.tsx y cuenta-form.tsx para 6 tipos + naturaleza
- Agregar logica de seed desde frontend (primer acceso)

### Paso 4: Cuentas Config
- Crear hooks, schemas, componentes y ruta para cuentas_config
- Actualizar sidebar

### Paso 5: Generador de Asientos (lib)
- Crear generar-asientos.ts con funciones:
  - `generarAsientos(tx, params)` - base
  - `generarAsientosVenta(tx, venta, pagos, ...)`
  - `generarAsientosGasto(tx, gasto, ...)`
  - `generarAsientosNCR(tx, ncr, ...)`
  - `generarAsientosPagoCxC(tx, pago, ...)`
  - `generarAsientosCompra(tx, compra, ...)`

### Paso 6: Libro Contable UI
- Crear hooks, schema, componentes y ruta
- Vista con filtros (banco, cuenta, modulo, estado, fechas)
- Tabla con columnas: Nro, Fecha, Modulo, Documento, Cuenta, Debe, Haber, Saldo, Estado, Acciones
- Acciones: Conciliar (PENDIENTE->CONCILIADO), Reversar (crea contra-asiento)
- Form para movimientos manuales (requiere partida doble: debe = haber)

### Paso 7: Integracion con Modulos
- Modificar use-ventas.ts -> inyectar asientos en crearVenta()
- Modificar use-gastos.ts -> inyectar asientos en crearGasto() y anularGasto()
- Modificar use-notas-credito.ts -> inyectar asientos en crearNotaCredito()
- Modificar use-cxc.ts -> inyectar asientos en pagos y reversos
- Modificar use-compras.ts -> inyectar asientos en crearCompra()

### Paso 8: Vinculacion Bancos
- Actualizar banco-schema.ts y banco-form.tsx para agregar selector de cuenta contable

---

## Verificacion

1. **Crear una venta** y verificar que se generan asientos en libro_contable que suman 0
2. **Crear un gasto** y verificar asientos
3. **Crear una NCR** y verificar que los asientos originales se marcan ANULADO y se crean contra-asientos
4. **Registrar un pago CxC** y verificar asientos
5. **Crear una compra** y verificar asientos
6. **Agregar movimiento manual** y verificar que exige partida doble (debe = haber)
7. **Conciliar un asiento** y verificar que no se puede modificar despues
8. **Reversar un asiento** y verificar contra-asiento con parent_id
9. **Verificar saldo acumulado** (running balance) en la vista filtrada por banco
10. **Verificar offline**: crear venta sin conexion, verificar que asientos se crean localmente en SQLite
11. **Verificar seed**: registrar nueva empresa y verificar que plan de cuentas + cuentas_config se crean automaticamente
