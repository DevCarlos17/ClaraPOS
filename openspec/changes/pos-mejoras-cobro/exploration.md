# Exploration: pos-mejoras-cobro

_Date: 2026-06-01 | Model: anthropic/claude-sonnet-4-6_

---

## Executive Summary

El módulo POS de ClaraPOS es sólido y maduro: flujo offline-first completo, bimonetario con tasa congelada al momento del cobro, split-tender funcional, shortcut de teclado F1–F12, y un `SupervisorPinDialog` ya construido. Sin embargo, existen **seis gaps concretos** vs los requerimientos de mejora:

1. **ClienteSelector**: el dropdown usa `absolute z-50` sin escapar del stacking context. El contenedor padre tiene `overflow-hidden`, lo que recorta el dropdown en mobile. ProductoBuscador ya resolvió este mismo problema con `position: fixed` + `z-[9999]` vía `useLayoutEffect`.

2. **Modal de cobro**: funcional pero incompleto en keyboard UX. El botón "Procesar" muestra una kbd `F12` pero dentro del modal no hay listener que lo maneje. ENTER agrega un pago, no lo confirma.

3. **Propinas**: **cero implementación**. No existe en schema, hooks, ni componentes.

4. **Diferencial cambiario en POS**: existe en los módulos de bancos y compras pero **no existe en el flujo de cobro POS**. El único "diferencial" en el POS es una tolerancia de redondeo de ≤ $0.01 que se absorbe silenciosamente.

5. **Autoconsumo**: **no existe** como concepto en el POS. Tampoco como motivo de ajuste por defecto. El módulo de ajustes tiene la infraestructura (ajuste_motivos + movimientos_inventario), pero no hay tipo AUTOCONSUMO.

6. **Saldo a favor del cliente (de overpayment)**: el sistema maneja overpayment devolviendo vuelto físico, pero **no crea un `movimiento_cuenta` de tipo SAF** (saldo a favor). Si se quiere que el excedente quede acreditado al cliente en CxC, eso requiere implementación nueva.

---

## Findings por área

### 1. Buscador de clientes (z-index mobile)

**Implementación actual:**
- Componente: `src/features/ventas/components/cliente-selector.tsx`
- Usa `<div ref={wrapperRef} className="relative">` + dropdown `absolute z-50 mt-1 w-full` (línea 153)
- El dropdown se posiciona relativo al wrapper, pero el POS header card tiene `overflow-hidden` en `className="shrink-0 rounded-2xl bg-card shadow-lg overflow-hidden"` (pos-terminal.tsx línea 637)
- Esto hace que el dropdown quede recortado por el contenedor padre en mobile

**Comparación con ProductoBuscador (que SÍ funciona):**
- `src/features/ventas/components/producto-buscador.tsx` usa `useLayoutEffect` para calcular posición con `getBoundingClientRect()` y renderiza el dropdown con `position: fixed; z-index: 9999` (líneas 101-115, 195)
- Escapa completamente del stacking context usando `position: fixed` en lugar de `absolute`
- El mismo patrón es la solución exacta para ClienteSelector

**Gap vs requerimiento:**
- Dropdown de cliente queda oculto/recortado en mobile por `overflow-hidden` en el ancestor
- Fix: aplicar el mismo patrón `fixed + useLayoutEffect + z-[9999]` que ya existe en ProductoBuscador

---

### 2. Flujo de facturación y modal de pago

**Implementación actual:**
- Componente: `src/features/ventas/components/cobro-modal.tsx` (553 líneas)
- **Un solo paso**: agrega pagos uno a uno en una lista, calcula saldo pendiente en tiempo real
- Estructura visual: Header (total) → IGTF si aplica → Balance resumen → Lista de pagos → Form agregar pago → Sección vuelto → Footer con botón "Procesar"
- La tasa se congela al abrir el modal (`tasaFrozen.current = tasa`)
- Botón "Cobrar" en POS abre el modal via `handleAbrirCobro()` (F12 o botón)
- Validaciones antes de abrir: cliente seleccionado, al menos una línea, cantidades válidas, stock suficiente

**Keyboard UX actual:**
- En el input de monto: `onKeyDown={(e) => { if (e.key === 'Enter') handleAddPago() }}` — ENTER **agrega el pago**, no confirma la venta
- El botón "Procesar" muestra `<kbd>F12</kbd>` como hint visual, pero en `pos-terminal.tsx` línea 534, si `showCobroModal` es true, el handler de F12 hace early return (`if (anyModalOpen) return`)
- **No existe un listener de F12 o ENTER dentro del modal que confirme la venta**

**Gap vs requerimiento:**
- ENTER debería confirmar cuando el pago está completo (esPagado = true y no hay más entrada pendiente)
- O F12 dentro del modal debería llamar a `handleProcesar()`

---

### 3. Overpayment / vuelto / saldo a favor

**Implementación actual:**
- Cálculo: `pendienteBs4 = totalEfectivoBs + igtfBs - totalPagadoBs`
- Overpay detectado: `estaOverpago = pendienteBs4 < -0.01`
- Vuelto: `vueltoMontoBs = Math.abs(pendienteBs4)`, en moneda nativa del método seleccionado
- Al procesar: se crea un `movimiento_metodo_cobro` tipo `EGRESO` origen `VUELTO` (use-ventas.ts líneas 647-668)
- El vuelto registra la salida de efectivo de la caja correctamente

**Saldo a favor (ausente):**
- **No existe SAF**: si el cliente paga de más, el dinero siempre se devuelve físicamente. No se crea `movimiento_cuenta` tipo SAF acreditando al cliente
- La tabla `movimientos_cuenta` tiene campo `tipo` sin restricción a valores fijos, por lo que técnicamente admite un tipo 'SAF', pero no está implementado

**Gap vs requerimiento:**
- Si el requerimiento incluye "opción de dejar excedente como saldo a favor del cliente en CxC", se necesita: nueva opción en el modal ("Dar vuelto" vs "Acreditar a cliente"), y crear un `movimiento_cuenta` tipo 'SAF' al confirmar
- Si solo es vuelto físico: YA FUNCIONA CORRECTAMENTE

---

### 4. Propinas

**Implementación actual:**
- **Zero existencia**. Búsqueda exhaustiva en `src/` sin resultados para "propina"

**Gap vs requerimiento:**
- Requiere schema change: `ventas.propina_usd` + `pagos.es_propina` (boolean o campo)
- Requiere UI en CobroModal: línea extra tipo "Propina" (opcional)
- Requiere lógica en `crearVenta()`: sumar propina al total o registrarla como pago extra etiquetado
- Decisión de diseño: ¿la propina va al cajero/empresa o a un empleado específico?

---

### 5. Diferencial cambiario en POS

**Implementación actual en POS:**
- Solo existe tolerancia de redondeo: si `pendienteBs4 <= tasaUsada * 0.01` (~$0.01), la venta se trata como CONTADO y `saldo_pend_usd = 0` (use-ventas.ts línea 674-675)
- Este es un "diferencial de redondeo", no un diferencial cambiario real

**Diferencial cambiario real (en otros módulos):**
- `src/features/bancos/`: diferencial por revaluación de cuentas bancarias en USD
- `src/features/compras/hooks/use-cxp.ts`: diferencial al pagar CxP a tasa diferente a la tasa BCV original
- `src/features/contabilidad/lib/generar-asientos.ts`: genera asientos de ganancia/pérdida cambiaria

**Gap vs requerimiento:**
- Si "diferencial cambiario en POS" significa: tracking de diferencia entre tasa factura vs tasa pago (para facturas a crédito cobradas días después a diferente tasa), eso **no existe en el POS**
- El POS ya congela la tasa en el modal de cobro; el cliente paga a esa tasa
- Para facturas a crédito (CREDITO), el pago posterior vía CxC sí podría generar diferencial, pero esa lógica está en `use-cxc.ts` (línea 688: "Sin tasaVenta en abono global FIFO: sin diferencial cambiario por simplificación")

---

### 6. Autoconsumo

**Implementación actual:**
- **No existe** como concepto en el POS ni como módulo independiente
- Búsqueda de "autoconsumo" en `src/` sin resultados
- Los motivos de ajuste predeterminados son: CONTEO FISICO - ENTRADA, CONTEO FISICO - SALIDA, AJUSTE DE COSTO (use-ensure-default-motivos.ts)
- El módulo de ajustes (`src/features/inventario/`) permite crear motivos personalizados con `operacion_base = 'RESTA'`

**Recomendación de implementación:**
- **Opción A (módulo inventario)**: Crear un ajuste_motivo de sistema "AUTOCONSUMO" con `operacion_base = 'RESTA'`, y agregar un flujo rápido en el módulo de ajustes. Pro: lógica de kardex ya existe. Con: no pasa por caja ni genera registro financiero.
- **Opción B (tipo de venta especial)**: Crear una venta con método de pago "AUTOCONSUMO" (tipo especial, monto $0), al que se asocia un cliente interno. Pro: genera kardex + registro de costo. Con: requiere cliente ficticio y método de pago especial.
- **Recomendación**: Opción A si es solo para controlar inventario. Opción B si necesita generar el costo contabilizado.

---

### 7. Input de cantidad (+ / -)

**Implementación actual:**
- `<input type="number" min="0">` en `linea-items.tsx` (líneas 85-111 compact, 201-227 full)
- ENTER: llama `onCantidadEnter()` → foca `ProductoBuscador` (flujo correcto)
- Negativo bloqueado: `if (e.key === '-') e.preventDefault()`
- Decimales bloqueados si `!es_decimal`: `if (e.key === '.' || e.key === ',') e.preventDefault()`
- Selección automática: `useImperativeHandle` expone `focusCantidad(index)` que hace `.focus()` + `.select()` (linea-items.tsx línea 25-31)
- Auto-focus al agregar producto: `pendingFocusIndexRef` en pos-terminal.tsx (líneas 308, 317) + `useEffect` en línea 187-193

**Gap vs requerimiento:**
- No existen botones `+` / `-` al costado del input (requeriría UI change en linea-items.tsx)
- El input funcional ya es suficiente para uso de teclado, pero para touch/mobile los botones +/- mejorarían mucho la UX

---

### 8. PIN de supervisor

**¿Existe ya?**
- **SÍ**. Componente: `src/components/ui/supervisor-pin-dialog.tsx` (182 líneas)

**¿Cómo funciona?**
- Usa nativo `<dialog>` element (no shadcn Dialog)
- Hash del PIN: `hashPin(pin, empresa_id)` desde `@/lib/crypto` (salt por empresa)
- Busca en `usuarios.pin_supervisor_hash` dentro de la empresa activa
- Verifica el permiso `requiredPermission` en la tabla `rol_permisos` → `permisos.slug`
- Roles sistema (`is_system = 1`) bypassean la verificación de permiso
- ENTER confirma, ESC cancela
- Callback `onAuthorized(supervisorId: string)` devuelve el ID del supervisor que autorizó

**Usos actuales en POS:**
1. Eliminar una línea: si usuario no tiene `PERMISSIONS.SALES_VOID`
2. Cancelar la venta: mismo permiso
3. Cerrar caja desde POS: si usuario no tiene `PERMISSIONS.CAJA_CLOSE`, con `requiredPermission='caja.close'`

**Para nuevo flujo "absorber pérdida":**
- Requeriría nuevo slug de permiso, ej: `'ventas.absorber_diferencial'`
- El componente es reutilizable sin cambios

**Campo de datos:**
- `usuarios.pin_supervisor_hash` → ya existe en schema (schema.ts línea 118)

---

### 9. Schema de base de datos relevante

| Tabla | Campos clave | Notas |
|-------|-------------|-------|
| `ventas` | `total_usd`, `total_bs`, `descuento_usd/bs`, `total_igtf_usd`, `saldo_pend_usd`, `tipo` (CONTADO/CREDITO), `tasa` | Sin `propina_usd` actualmente |
| `pagos` | `metodo_cobro_id`, `moneda_id`, `monto`, `monto_usd`, `referencia`, `is_reversed` | Sin campo para marcar propina |
| `movimientos_cuenta` | `tipo`, `monto`, `saldo_anterior`, `saldo_nuevo`, `venta_id`, `tasa_pago` | Campo `tipo` sin constraint; acepta nuevo valor 'SAF' |
| `movimientos_inventario` | `tipo` (S=salida), `origen` (VEN=venta), `cantidad`, `stock_anterior`, `stock_nuevo` | No existe `origen = 'AUT'` para autoconsumo |
| `movimientos_metodo_cobro` | `tipo` (INGRESO/EGRESO), `origen` (VENTA/VUELTO/AVANCE/PRESTAMO), `monto` | Vuelto ya registrado aquí |
| `usuarios` | `pin_supervisor_hash` | Existe; hash con salt empresa_id |
| `ajuste_motivos` | `nombre`, `operacion_base` (SUMA/RESTA/NEUTRO), `es_sistema` | Base para implementar autoconsumo |

**Campos a agregar para mejoras:**
- `ventas.propina_usd TEXT` (si se implementa propinas)
- nuevo `ajuste_motivo` con `nombre='AUTOCONSUMO'` (si opción A)

---

## Riesgos y complejidades identificadas

- **z-index ClienteSelector**: bajo riesgo, patrón exacto ya existe en ProductoBuscador. Copiar + adaptar.
- **ENTER en CobroModal**: bajo riesgo. Agregar listener F12 / ENTER condicional dentro del modal. Cuidado: no disparar si el foco está en el input de referencia o si hay un pago en progreso.
- **Propinas**: complejidad media. Requiere decisión de producto: ¿la propina afecta total factura? ¿aparece en reporte de caja? ¿se etiqueta por empleado? El schema change es mínimo.
- **SAF (saldo a favor de overpayment)**: complejidad media. Requiere UI choice en modal de vuelto + nueva transacción en movimientos_cuenta. Riesgo: CxC debe luego poder consumir ese SAF como pago, lo cual puede implicar cambios en `use-cxc.ts`.
- **Autoconsumo**: complejidad baja-media. Si se usa ajuste, solo agregar motivo. Si es venta especial, requiere más coordinación.
- **Diferencial cambiario en POS**: alta complejidad si se quiere tracking completo. Aclarar alcance exacto del requerimiento antes de diseñar.
- **Botones +/- en linea-items**: bajo riesgo, pero impacta UX mobile significativamente.

---

## Archivos clave mapeados

| Archivo | Rol |
|---------|-----|
| `src/features/ventas/components/pos-terminal.tsx` (1281 líneas) | Componente principal del POS. Maneja estado global, shortcuts F1-F12, lógica de cargos especiales, apertura de CobroModal |
| `src/features/ventas/components/cobro-modal.tsx` (553 líneas) | Modal de cobro split-tender. Tasa congelada, pagos múltiples, vuelto, IGTF, límite de crédito, crédito parcial |
| `src/features/ventas/components/cliente-selector.tsx` (196 líneas) | Buscador de clientes. BUG: `absolute z-50` en vez de `fixed z-[9999]` |
| `src/features/ventas/components/producto-buscador.tsx` (268 líneas) | Buscador de productos. Patrón correcto con `fixed + useLayoutEffect`. Referencia para fix de ClienteSelector |
| `src/features/ventas/components/linea-items.tsx` (275 líneas) | Tabla de ítems en la factura. Input cantidad con ENTER→foco buscador. Sin botones +/- |
| `src/features/ventas/hooks/use-ventas.ts` (932 líneas) | Core de la lógica de negocio. `crearVenta()` en writeTransaction: kardex, pagos, vuelto, movimientos_cuenta, asientos contables |
| `src/features/ventas/schemas/venta-schema.ts` (30 líneas) | Zod schemas para LineaVentaForm y PagoEntryForm |
| `src/components/ui/supervisor-pin-dialog.tsx` (182 líneas) | PIN de supervisor ya implementado. Reutilizable para nuevas acciones protegidas |
| `src/features/ventas/components/venta-exitosa-modal.tsx` (225 líneas) | Pantalla post-venta. ENTER/ESC cierran y vuelven al POS |
| `src/core/db/powersync/schema.ts` (1502 líneas) | Schema completo de 63 tablas. Referencia para campos disponibles |
| `src/features/inventario/hooks/use-ensure-default-motivos.ts` (61 líneas) | Siembra motivos de ajuste por defecto. Punto de extensión para agregar AUTOCONSUMO |

---

## Ready for Proposal

**Sí**. La exploración está completa y cubre todas las preguntas planteadas. Se recomienda que el orchestrator aclare con el usuario el alcance exacto de:
1. **Diferencial cambiario en POS**: ¿es tolerancia de redondeo mejorada, o tracking de diferencia de tasa entre factura y cobro?
2. **Propinas**: ¿afectan el total factura o son aparte? ¿se etiquetan por empleado?
3. **Autoconsumo**: ¿módulo de ajuste o tipo de venta especial?
4. **Saldo a favor (overpayment)**: ¿vuelto físico únicamente (YA FUNCIONA) o también acreditar en CxC?

Los demás ítems (fix z-index, ENTER en cobro, botones +/-, PIN supervisor) son implementables directamente sin ambigüedad.
