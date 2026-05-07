# Plan: Módulo Préstamos y Avances de Efectivo

> Contexto: ClaraPOS — sistema POS bimonetario (USD base + Bs vía tasa)
> Fecha inicio discusión: 2026-05-02
> Prioridad 1 completada: 2026-05-02

---

## Resumen del dominio

### Préstamo
- La empresa entrega efectivo al cliente
- El cliente devuelve el dinero después (con interés)
- Genera deuda rastreable en el tiempo (`vencimientos_cobrar`)
- Puede emitirse desde el POS (vinculado a una venta) o desde el módulo de préstamos (standalone)
- Emitido en una sola cuota, pero puede pagarse en varias si el cliente se retrasa

### Avance de efectivo
- La empresa entrega efectivo al cliente
- El cliente paga de inmediato con otro método (tarjeta, transferencia, etc.)
- Incluye un % de recargo sobre el monto entregado
- El total (avance + recargo) se cobra en la misma factura
- No genera deuda pendiente — se salda en la misma sesión

### Origen de fondos (aplica a ambos)
- `CAJA`: sesión de caja activa con fondos suficientes
- `EFECTIVO_EMPRESA`: caja general de la empresa (banking pendiente de implementar)
- `BANCO`: cuenta bancaria de la empresa (banking pendiente de implementar)

---

## Estado actual de la implementación

| Componente | Archivo | Estado |
|---|---|---|
| Modal préstamo en POS | `src/features/caja/components/prestamo-modal.tsx` | ✅ Funciona |
| Modal avance en POS | `src/features/caja/components/avance-modal.tsx` | ✅ Funciona |
| Integración POS | `src/features/ventas/components/pos-terminal.tsx` | ✅ Funciona |
| Creación vencimiento al cerrar venta | `src/features/ventas/hooks/use-ventas.ts` | ✅ Funciona |
| Página de préstamos (sidebar) | `src/features/ventas/components/prestamos-page.tsx` | ✅ Parcial |
| Widget dashboard | `src/features/dashboard/components/dashboard-prestamos-widget.tsx` | ✅ Funciona |
| Hook cargos especiales | `src/features/cxc/hooks/use-cxc.ts` → `useCargosEspecialesVenta` | ✅ Funciona |
| **Hook vencimientos por venta** | `src/features/cxc/hooks/use-cxc.ts` → `useVencimientosVenta` | ✅ **Nuevo** |
| **Sección Operaciones Financieras en modal detalle** | `src/features/cxc/components/factura-detalle-cxc.tsx` | ✅ **Nuevo** |

### Tablas DB involucradas
- `movimientos_metodo_cobro` — egreso de caja al emitir préstamo/avance (`origen = 'PRESTAMO'|'AVANCE'`)
- `vencimientos_cobrar` — deuda del préstamo (total c/interés, saldo, fecha venc, status)
- `ventas` — factura de referencia (`venta_id` nullable en préstamo standalone)

---

## ✅ Prioridad 1 — Completada

**Objetivo:** Mostrar préstamos y avances en el modal "Detalle de Venta" de CxC.

**Cambios realizados:**
- `use-cxc.ts`: nuevo hook `useVencimientosVenta(ventaId)` que lee `vencimientos_cobrar`
- `factura-detalle-cxc.tsx`: sección "Operaciones Financieras" con:
  - **Avances** (amber): concepto + monto entregado + badge "Cobrado en factura"
  - **Préstamos** (purple): concepto/principal del movimiento + tabla de estado real (total c/interés, pagado, saldo, fecha vencimiento, badge estado)
- El `Total Factura` NO cambia — préstamos y avances son referencia informativa

---

## 🔲 Prioridad 2 — Abonos al préstamo desde CxC

**Objetivo:** Al registrar un pago desde el módulo CxC, el usuario puede elegir aplicarlo a la factura (productos) O al préstamo asociado.

**Alcance:**
- Modificar `PagoFacturaModal` para detectar si la factura tiene vencimientos de préstamo
- Si hay préstamo: mostrar selector — "¿Abonar a factura o a préstamo?"
- Crear función `registrarAbonoPrestamo(params)` en `use-cxc.ts`:
  - Valida monto <= saldo pendiente del vencimiento
  - Actualiza `vencimientos_cobrar.monto_pagado_usd` y `saldo_pendiente_usd`
  - Si saldo llega a 0 → `status = 'PAGADO'`
  - Crea movimiento en `movimientos_metodo_cobro` con `origen = 'COBRO_PRESTAMO'`
  - NO afecta `ventas.saldo_pend_usd` (son deudas separadas)
  - NO afecta `clientes.saldo_actual` (el préstamo no es parte del saldo de CxC)

**Archivos a tocar:**
- `src/features/cxc/hooks/use-cxc.ts` — nueva función `registrarAbonoPrestamo`
- `src/features/cxc/components/pago-factura-modal.tsx` — selector factura/préstamo

---

## 🔲 Prioridad 3 — Historial de abonos por préstamo

**Objetivo:** Vista de detalle de un préstamo con log inmutable de cada movimiento (abono, interés, mora).

**Alcance:**
- Nueva tabla `abonos_prestamo` (inmutable, como kardex):
  ```sql
  id, prestamo_id (= vencimiento_cobrar_id), empresa_id,
  monto_usd, tasa_id, tipo (ABONO | INTERES | MORA),
  saldo_antes_usd, saldo_despues_usd,
  registrado_por, fecha, created_at
  ```
- O alternativamente: usar `movimientos_metodo_cobro` con `origen = 'COBRO_PRESTAMO'` como log (ya existe, evaluar si es suficiente)
- En `prestamos-page.tsx`: al hacer clic en un préstamo, abrir modal de detalle con:
  - Datos del préstamo (cliente, factura origen, monto original, interés, plazo, fecha venc)
  - Tabla de abonos/movimientos con saldos antes/después
  - Saldo pendiente actual

**Archivos a tocar:**
- `src/features/ventas/components/prestamos-page.tsx` — click en fila abre detalle
- Nuevo componente `prestamo-detalle-modal.tsx`
- `src/features/cxc/hooks/use-cxc.ts` o nuevo hook — query de historial

---

## ✅ Prioridad 4 — Origen de fondos seleccionable (Completada 2026-05-02)

**Objetivo:** Al emitir un préstamo o avance, el usuario elige de dónde salen los fondos.

**Alcance:**
- Añadir selector en `prestamo-modal.tsx` y `avance-modal.tsx`:
  - "Caja actual" (sesión activa — ya funciona, es el default)
  - "Efectivo empresa" (stub hasta implementar banking)
  - "Banco" (stub hasta implementar banking, requiere seleccionar cuenta)
- Guardar `origen_fondos_tipo` y `origen_fondos_id` en `vencimientos_cobrar` o en el movimiento
- Validar disponibilidad según tipo seleccionado
- Los tipos EFECTIVO_EMPRESA y BANCO pueden quedar como UI funcional pero sin movimiento bancario real hasta que banking esté completo (registrar intención, ejecutar movimiento bancario cuando el módulo esté listo)

**Archivos a tocar:**
- `src/features/caja/components/prestamo-modal.tsx`
- `src/features/caja/components/avance-modal.tsx`
- Posible migración DB: columnas `origen_fondos_tipo`, `origen_fondos_id` en `vencimientos_cobrar`

---

## ✅ Prioridad 5 — Préstamo standalone (sin venta) — Completada 2026-05-02

**Objetivo:** Crear un préstamo directamente desde el módulo de préstamos del sidebar, sin necesidad de pasar por el POS.

**Alcance:**
- Formulario de creación en `prestamos-page.tsx`:
  - Selector de cliente
  - Monto (USD y/o Bs)
  - Porcentaje de interés
  - Plazo en días / fecha de vencimiento
  - Origen de fondos
  - Concepto / descripción
- Lógica de creación:
  - Crea `movimientos_metodo_cobro` con `origen = 'PRESTAMO'` y `doc_origen_id = null`
  - Crea `vencimientos_cobrar` con `venta_id = null`
- El préstamo standalone no aparece en ninguna factura (no hay `venta_id`)
- Aparece en la lista de `prestamos-page` con indicador "Sin factura asociada"

**Archivos a tocar:**
- `src/features/ventas/components/prestamos-page.tsx` — botón "Nuevo Préstamo" + formulario
- `src/features/cxc/hooks/use-cxc.ts` o nuevo hook — función `crearPrestamoStandalone`

---

## Notas de arquitectura

### ¿Por qué préstamos y avances no van en `detalle_venta`?
Son instrumentos financieros, no productos/servicios vendidos. Mezclarlos en `detalle_venta` sería un error conceptual. La factura es referencia de contexto, no el contenedor de la deuda del préstamo.

### ¿Por qué el total de la factura SÍ incluye el avance pero NO el préstamo?
- **Avance**: el recargo es un ingreso inmediato de la empresa → va al total de la factura
- **Préstamo**: es una deuda separada que el cliente paga después → tiene su propio tracking en `vencimientos_cobrar`

> ⚠️ Nota: En la implementación actual el `total_usd` de la venta SÍ incluye `montoCargoUsd` del préstamo (principal + interés). Esto puede ser incorrecto conceptualmente — evaluar si el préstamo debe o no sumarse al total de la factura. Si no debe sumarse, requiere ajuste en `use-ventas.ts` líneas 161-164.

### Sobre abonos y `clientes.saldo_actual`
El `saldo_actual` del cliente refleja deuda de facturas (productos/servicios). Los préstamos son deuda separada. Un abono a un préstamo NO debe reducir `clientes.saldo_actual`.

### Módulo bancario (pendiente)
Las prioridades 4 y 5 tienen dependencia parcial con el módulo bancario para el origen de fondos tipo BANCO. Implementar con stubs que registren la intención pero no ejecuten el movimiento bancario real.
