# Propuestas de Layout POS

## Opcion A — 3 Columnas

Productos a la izquierda, items en el centro, pagos y totales a la derecha. Todo visible sin scroll.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🟢 Juan · Caja 1 · Bs 36.50   [↓Ingreso F5][↑Retiro F6][Avance F7][Cierre] │
├─────────────────────┬──────────────────────────────┬───────────────────────┤
│  🔍 Buscar  [F1]    │ 👤 Cliente         [F2]  [+]  │  TOTAL                │
│─────────────────────│──────────────────────────────│  $60.00  Bs 2,160.00  │
│  Botox Labios $25   │  # │ Producto    │Cant│  USD  │───────────────────────│
│  Limpieza     $35   │  1 │ Botox Lab.. │ 1  │$25.00 │  Método   [select  ▼] │
│  Keratina     $45   │  2 │ Limpieza..  │ 1  │$35.00 │  Monto    [________]  │
│  Mascarilla   $15   │    │             │    │       │  Ref.     [________]  │
│  Vitamina C   $20   │    │             │    │       │  [+ Agregar   Alt+A]  │
│  Relleno      $80   │    │             │    │       │───────────────────────│
│  Peeling      $30   │    │             │    │       │  ✓ Efectivo    $20.00 │
│  ...                │    │             │    │       │  ✓ Transf.     $40.00 │
│                     │──────────────────────────────│───────────────────────│
│                     │ Cargos especiales: $0.00      │  Pendiente:  $0.00    │
│                     │                               │  Estado:     CONTADO  │
├─────────────────────┴──────────────────────┬────────┴──────────┬────────────┤
│  [Guardar F8]   [Guardadas F9]             │[Cancelar Esc]     │[✔ F10     ]│
└────────────────────────────────────────────┴───────────────────┴────────────┘
```

**Atajos de teclado:**
- `F1` — Foco en buscador de productos
- `F2` — Foco en selector de cliente
- `F5` — Ingreso de caja
- `F6` — Retiro de caja
- `F7` — Avance
- `F8` — Guardar factura en espera
- `F9` — Abrir facturas guardadas
- `F10` — Confirmar venta
- `Alt+A` — Agregar pago
- `Esc` — Cancelar venta

---

## Opcion B — 2 Columnas + Barra Superior

Barra de sesion/cliente/busqueda arriba. Abajo: tabla de items a la izquierda, panel de pagos sticky a la derecha.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🟢 Juan · Caja 1     👤 [Cliente...              F2]  [+]                   │
│  🔍 [Buscar producto...                           F1]                        │
│  [↓Ingreso F5] [↑Retiro F6] [Avance F7] [Préstamo F8] [Cerrar Caja]         │
├─────────────────────────────────────────┬────────────────────────────────────┤
│  # │ Producto            │ Cant │  USD   │  TOTAL: $60.00  Bs 2,160.00       │
│  1 │ Botox Labios        │  1  ↕│ $25.00 │                                   │
│  2 │ Limpieza Facial     │  1  ↕│ $35.00 │  Abonado:   $60.00                │
│    │                     │      │        │  Pendiente: $0.00                 │
│    │                     │      │        │  Estado:    CONTADO               │
│    │                     │      │        │───────────────────────────────────│
│  Cargos especiales:      │$0.00 │        │  Método   [──────────────── ▼]    │
│                          │      │        │  Monto    [__________]            │
│                          │      │        │  Ref.     [__________]            │
│                          │      │        │  [+ Agregar               Alt+A]  │
│                          │      │        │───────────────────────────────────│
│                          │      │        │  ✓ Efectivo USD       $20.00  [x] │
│                          │      │        │  ✓ Transferencia Bs  720.00  [x]  │
├──────────────────────────┴──────┴────────┼──────────────┬─────────────────────┤
│  [Guardar F9]     [Guardadas F10]        │[Cancelar Esc]│ [✔ Confirmar  F12] │
└──────────────────────────────────────────┴──────────────┴────────────────────┘
```

**Atajos de teclado:**
- `F1` — Foco en buscador de productos
- `F2` — Foco en selector de cliente
- `F5` — Ingreso de caja
- `F6` — Retiro de caja
- `F7` — Avance
- `F8` — Préstamo
- `F9` — Guardar factura en espera
- `F10` — Abrir facturas guardadas
- `F12` — Confirmar venta
- `Alt+A` — Agregar pago
- `Esc` — Cancelar venta

---

## Opcion C — Layout Actual Refinado

Mantener el diseño actual de 2 columnas pero agregar atajos de teclado visibles como badges en los botones, sin rediseño mayor.

```
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  🔍 Buscar producto...  [F1]          │  🟢 Juan · Caja 1                    │
│──────────────────────────────────────│  [↓F5] [↑F6] [AvF7] [PrF8] [CieF9]  │
│  # │ Producto      │ Cant │  USD  │  │──────────────────────────────────────│
│  1 │ Botox         │  1  ↕│$25.00 │  │  👤 Cliente...  [F2]          [+]    │
│  2 │ Limpieza      │  1  ↕│$35.00 │  │──────────────────────────────────────│
│    │               │      │       │  │  Total USD     $60.00                │
│    │               │      │       │  │  Total Bs      Bs 2,160.00           │
│    │               │      │       │  │  Ítems         2                     │
│    │               │      │       │  │──────────────────────────────────────│
│    │               │      │       │  │  Método  [──────────────── ▼]        │
│    │               │      │       │  │  Monto   [__________]                │
│    │               │      │       │  │  Ref.    [__________]                │
│    │               │      │       │  │  [+ Agregar              Alt+A]      │
│    │               │      │       │  │  ✓ Efectivo $20.00            [x]    │
│    │               │      │       │  │──────────────────────────────────────│
│    │               │      │       │  │  [Guardar F8]    [Guardadas F9]      │
│    │               │      │       │  │  [Cancelar Esc]  [Confirmar F10]     │
└────────────────────────────────────────┴────────────────────────────────────┘
```

**Atajos de teclado:**
- `F1` — Foco en buscador de productos
- `F2` — Foco en selector de cliente
- `F5` — Ingreso de caja
- `F6` — Retiro de caja
- `F7` — Avance
- `F8` — Guardar factura en espera / Préstamo (segun layout)
- `F9` — Abrir facturas guardadas / Cerrar caja (segun layout)
- `F10` — Confirmar venta
- `Alt+A` — Agregar pago
- `Esc` — Cancelar venta
