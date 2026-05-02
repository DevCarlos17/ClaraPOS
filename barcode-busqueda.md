# Busqueda por Codigo, Nombre y Codigo de Barras en el POS

## Estado actual

El `ProductoBuscador` ya busca por `codigo` interno y `nombre` con minimo 2 caracteres.
**No existe** campo `codigo_barras` en la DB ni en el schema de PowerSync.
No hay logica de deteccion de lectura por scanner.

---

## Que implica agregar busqueda por codigo de barras

### 1. Migracion de base de datos

Nueva columna `codigo_barras TEXT` en la tabla `productos`.

```sql
ALTER TABLE productos ADD COLUMN codigo_barras TEXT;

-- Indice compuesto por empresa para unicidad y performance
CREATE UNIQUE INDEX idx_productos_codigo_barras
  ON productos(empresa_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;
```

**Archivo nuevo:** `migrations/000X_producto_codigo_barras.sql`

---

### 2. Schema de PowerSync

En `src/core/db/powersync/schema.ts`, agregar a la tabla `productos`:

```typescript
codigo_barras: column.text,
```

El usuario debe re-sincronizar (limpiar IndexedDB) para que el campo aparezca en SQLite local.

---

### 3. Hook de busqueda — `use-ventas.ts`

Extender el WHERE de `useBuscarProductosVenta` para incluir `codigo_barras`:

```typescript
// Antes
AND (p.nombre LIKE ? OR p.codigo LIKE ?)

// Despues
AND (p.nombre LIKE ? OR p.codigo LIKE ? OR p.codigo_barras = ?)
```

`codigo_barras` usa `=` exacto (no LIKE) porque los barcodes son cadenas exactas.
Eso ademas permite que una lectura de scanner haga match directo sin dropdown.

---

### 4. Formulario de producto — `producto-form.tsx`

Agregar campo opcional "Codigo de barras" (texto libre).
No validar formato especifico para soportar EAN-13, UPC-A, Code128, QR, etc.

El schema Zod en `producto-schema.ts`:

```typescript
codigo_barras: z.string().max(100).optional(),
```

---

### 5. Logica de scanner en `ProductoBuscador`

Esta es la parte central del comportamiento POS. Un scanner de codigo de barras HID
(USB o Bluetooth) funciona como teclado que:

- Envia cada caracter muy rapido (< 50 ms entre pulsaciones)
- Termina automaticamente con `Enter`

El componente debe distinguir escritura humana de lectura de scanner:

```
Escritura humana  → abrir dropdown, esperar seleccion manual
Lectura de scanner → buscar match exacto por codigo_barras → agregar al carrito sin dropdown
```

**Implementacion por deteccion de velocidad:**

```typescript
const lastKeyTime = useRef<number>(0)
const isScanning = useRef<boolean>(false)
const SCANNER_THRESHOLD_MS = 50

const handleKeyDown = (e: React.KeyboardEvent) => {
  const now = Date.now()
  const delta = now - lastKeyTime.current
  lastKeyTime.current = now

  // Si los chars llegan mas rapido que el threshold, es un scanner
  if (delta < SCANNER_THRESHOLD_MS) {
    isScanning.current = true
  }

  if (e.key === 'Enter' && isScanning.current) {
    // inputValue contiene el barcode completo
    buscarYAgregarPorCodigoBarras(inputValue)
    isScanning.current = false
    e.preventDefault()
    return
  }
}
```

**Alternativa mas predecible — modo toggle:**
Un boton o shortcut (ej. `F3`) activa "modo scanner" que cambia el comportamiento
del Enter para hacer submit exacto en lugar de seleccionar del dropdown.
Evita falsos positivos por escritura rapida.

---

### 6. Funcion de busqueda exacta por barcode

Cuando el scanner dispara, ejecutar query directa sin mostrar dropdown:

```sql
SELECT p.id, p.codigo, p.tipo, p.nombre, p.precio_venta_usd, p.stock,
       COALESCE(u.es_decimal, 1) as es_decimal
FROM productos p
LEFT JOIN unidades u ON p.unidad_base_id = u.id
WHERE p.empresa_id = ?
  AND p.codigo_barras = ?
  AND p.is_active = 1
  AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)
LIMIT 1
```

- Match → agregar directamente al carrito (misma logica que `handleSeleccionarProducto`)
- Sin match → toast de error "Producto no encontrado"

---

### 7. Display en resultados del dropdown

Mostrar `codigo_barras` como dato secundario en cada fila del dropdown cuando existe,
para que el cajero pueda verificar visualmente la coincidencia.

---

## Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `migrations/000X_producto_codigo_barras.sql` | Nueva columna + indice unico |
| `src/core/db/powersync/schema.ts` | `codigo_barras: column.text` en `productos` |
| `src/features/ventas/hooks/use-ventas.ts` | Extender query + nueva funcion de busqueda exacta |
| `src/features/ventas/components/producto-buscador.tsx` | Deteccion de scanner + busqueda directa |
| `src/features/inventario/schemas/producto-schema.ts` | Campo `codigo_barras` opcional |
| `src/features/inventario/components/productos/producto-form.tsx` | Input de codigo de barras |

---

## Consideraciones adicionales

### Hardware compatible (sin drivers especiales)
- **Scanners USB/Bluetooth HID** → se presentan como teclado, funciona con la logica descrita
- **Scanners que terminan con Tab** en lugar de Enter → ajustar el trigger del handler
- **Camara del dispositivo** via `@zxing/browser` → alternativa para movil sin scanner fisico,
  mas complejo, requiere permiso de camara y procesamiento de imagen en tiempo real

### Codigos duplicados entre empresas
El indice debe ser `(empresa_id, codigo_barras)`, no solo `codigo_barras`.
El mismo EAN puede existir en dos empresas distintas sin conflicto.

### Un producto con multiples barcodes
Si en el futuro un producto tiene presentaciones distintas (unidad vs caja) con EANs
distintos, una sola columna no alcanza. Implicaria tabla `producto_codigos_barras(producto_id, codigo_barras)`.
Por ahora una columna es suficiente para el caso de uso actual.

### Offline-first
La busqueda por barcode ocurre 100% en SQLite local via PowerSync.
El scanner funciona sin conexion a internet sin cambios adicionales.

---

## Orden de implementacion recomendado

1. Migracion SQL → aplicar en Supabase Dashboard
2. Actualizar schema PowerSync → pedir re-sync al usuario
3. Agregar campo al schema Zod + formulario de producto
4. Extender query de busqueda en `use-ventas.ts` + funcion de busqueda exacta
5. Agregar logica de scanner en `ProductoBuscador`
6. Mostrar `codigo_barras` en resultados del dropdown
7. Probar con scanner fisico, con escritura manual, y sin match
