# Plan de Implementacion: Cash Ledger Bimonetario

**Referencia**: `ANALISIS_CASH_LEDGER.md` + `task.md`
**Fecha**: 2026-05-09

---

## Vision General

Implementar en 5 fases el modelo de caja descrito en `task.md`: registro inmutable del vuelto,
separacion de saldos por divisa (USD vs VES), modal de cobro split-tender a prueba de errores,
y validaciones anti-fraude. Las fases son secuenciales — cada una desbloquea la siguiente.

---

## FASE 1 — Migraciones de Base de Datos

**Objetivo**: Extender el schema para soportar vuelto como evento, saldos por divisa en sesiones,
y campos de trazabilidad en movimientos manuales.

**Archivo a crear**: `migrations/0032_cash_ledger_bimonetario.sql`

### Tareas

#### 1.1 — Agregar origen `VUELTO` a `movimientos_metodo_cobro`

El vuelto entregado al cliente se registrara como un evento EGRESO en la tabla existente,
reutilizando toda la infraestructura de inmutabilidad ya construida.

```sql
-- Primero eliminar el constraint existente
ALTER TABLE movimientos_metodo_cobro
  DROP CONSTRAINT IF EXISTS movimientos_metodo_cobro_origen_check;

-- Recrear incluyendo VUELTO
ALTER TABLE movimientos_metodo_cobro
  ADD CONSTRAINT movimientos_metodo_cobro_origen_check
  CHECK (origen IN (
    'VENTA', 'PAGO_CXC', 'DEPOSITO_BANCO', 'RETIRO', 'AJUSTE',
    'APERTURA_CAJA', 'CIERRE_CAJA', 'INGRESO_MANUAL', 'EGRESO_MANUAL',
    'AVANCE', 'PRESTAMO',
    'VUELTO'  -- NUEVO: dinero que sale de gaveta como cambio al cliente
  ));
```

> El tipo (`tipo`) para VUELTO sera siempre `EGRESO`. Se vincula a la venta via `doc_origen_id`.

#### 1.2 — Agregar campos bimonetarios a `sesiones_caja`

Actualmente solo existe `monto_sistema_usd`. El spec exige saldos separados por divisa.

```sql
ALTER TABLE sesiones_caja
  ADD COLUMN IF NOT EXISTS monto_sistema_bs  NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_fisico_bs   NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS diferencia_bs     NUMERIC(15,2) DEFAULT NULL;
```

> Estos campos se calculan al cerrar la sesion con los mismos datos ya existentes,
> pero filtrando por moneda VES en lugar de convertir todo a USD.

#### 1.3 — Agregar campos de trazabilidad a `movimientos_metodo_cobro`

Para cumplir con los requisitos de auditoria de Avances y Prestamos.

```sql
ALTER TABLE movimientos_metodo_cobro
  ADD COLUMN IF NOT EXISTS autorizado_por_id         UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS destinatario_id            UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS referencia_pago_digital_id UUID REFERENCES pagos(id);
```

> `autorizado_por_id`: obligatorio cuando `origen IN ('AVANCE', 'PRESTAMO')`.
> `referencia_pago_digital_id`: obligatorio cuando `origen = 'AVANCE'` (el pago digital que origina el avance).
> `destinatario_id`: obligatorio cuando `origen = 'PRESTAMO'`.

#### 1.4 — Trigger: bloquear inserciones en sesion cerrada

```sql
CREATE OR REPLACE FUNCTION fn_validate_sesion_abierta()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NEW.sesion_caja_id IS NOT NULL THEN
    SELECT status INTO v_status
    FROM sesiones_caja
    WHERE id = NEW.sesion_caja_id;

    IF v_status IS DISTINCT FROM 'ABIERTA' THEN
      RAISE EXCEPTION
        'Operacion rechazada: la sesion de caja % esta en estado %. Solo se aceptan operaciones en sesiones ABIERTA.',
        NEW.sesion_caja_id, v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a movimientos manuales
CREATE TRIGGER trg_validate_sesion_movimientos
  BEFORE INSERT ON movimientos_metodo_cobro
  FOR EACH ROW EXECUTE FUNCTION fn_validate_sesion_abierta();

-- Aplicar a pagos (evita pagos post-cierre)
CREATE TRIGGER trg_validate_sesion_pagos
  BEFORE INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_validate_sesion_abierta();
```

#### 1.5 — Actualizar sync rules de PowerSync

**Archivo**: `backend/powersync-sync-rules.yaml`

Agregar los nuevos campos al bucket de `movimientos_metodo_cobro`:
- `autorizado_por_id`
- `destinatario_id`
- `referencia_pago_digital_id`

Agregar los nuevos campos al bucket de `sesiones_caja`:
- `monto_sistema_bs`
- `monto_fisico_bs`
- `diferencia_bs`

---

## FASE 2 — Calculo de Saldo por Divisa en Cierre de Sesion

**Objetivo**: Que `cerrarSesionCaja()` calcule y persista el saldo esperado en VES de forma
independiente al USD, usando los movimientos ya existentes filtrados por moneda.

**Archivo afectado**: `front/src/features/caja/hooks/use-sesiones-caja.ts`

### Tareas

#### 2.1 — Separar pagos de efectivo por moneda

**Antes** (actual): suma todo en `monto_usd` unificado.

**Despues**: dos queries separadas dentro del `writeTransaction` del cierre.

```typescript
// Pagos efectivo en USD (monto en moneda nativa = USD, moneda_id = USD)
const pagosEfectivoUsd = await tx.executeQuery<{ total: number }>(
  `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
   FROM pagos p
   JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
   JOIN monedas mo ON p.moneda_id = mo.id
   WHERE p.sesion_caja_id = ?
     AND mc.tipo = 'EFECTIVO'
     AND mo.codigo = 'USD'
     AND p.is_reversed = 0`,
  [sesionId]
)

// Pagos efectivo en VES (monto en moneda nativa = Bs)
const pagosEfectivoBs = await tx.executeQuery<{ total: number }>(
  `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
   FROM pagos p
   JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
   JOIN monedas mo ON p.moneda_id = mo.id
   WHERE p.sesion_caja_id = ?
     AND mc.tipo = 'EFECTIVO'
     AND mo.codigo = 'VES'
     AND p.is_reversed = 0`,
  [sesionId]
)
```

#### 2.2 — Separar movimientos manuales por moneda

Actualmente la query agrupa por `origen` pero no por moneda. Extender para incluir la moneda
del metodo de cobro del movimiento.

```typescript
// Movimientos manuales en USD
const movimientosUsd = await tx.executeQuery<{ origen: string; total: number }>(
  `SELECT mmc.origen,
          COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
   FROM movimientos_metodo_cobro mmc
   JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
   JOIN monedas mo ON mc.moneda_id = mo.id
   WHERE mmc.sesion_caja_id = ?
     AND mmc.origen IN ('INGRESO_MANUAL','EGRESO_MANUAL','AVANCE','PRESTAMO','VUELTO')
     AND mo.codigo = 'USD'
   GROUP BY mmc.origen`,
  [sesionId]
)

// Movimientos manuales en VES (igual cambiando codigo = 'VES')
```

#### 2.3 — Aplicar las formulas del spec por divisa

```typescript
// Saldo esperado USD
const montoSistemaUsd = Number((
  aperturaUsd
  + pagosEfectivoUsd
  + ingresosManualUsd
  - egresosManualUsd   // EGRESO_MANUAL + AVANCE + PRESTAMO + VUELTO en USD
).toFixed(2))

// Saldo esperado VES (formula identica, datos en VES)
const montoSistemaBs = Number((
  aperturaBs
  + pagosEfectivoBs
  + ingresosManualBs
  - egresosManualBs    // EGRESO_MANUAL + AVANCE + PRESTAMO + VUELTO en VES
).toFixed(2))
```

#### 2.4 — Persistir ambos saldos en `sesiones_caja`

```typescript
await tx.executeQuery(
  `UPDATE sesiones_caja SET
     usuario_cierre_id = ?,
     fecha_cierre = ?,
     monto_sistema_usd = ?,
     monto_fisico_usd = ?,
     diferencia_usd = ?,
     monto_sistema_bs = ?,    -- NUEVO
     monto_fisico_bs = ?,     -- NUEVO (lo ingresa el usuario en el cuadre)
     diferencia_bs = ?,       -- NUEVO
     observaciones_cierre = ?,
     status = 'CERRADA'
   WHERE id = ?`,
  [
    usuarioCierreId,
    fechaCierre,
    montoSistemaUsd, montoFisicoUsd, diferenciaUsd,
    montoSistemaBs, montoFisicoBs, diferenciaBs,
    observaciones,
    sesionId
  ]
)
```

#### 2.5 — Actualizar interfaz `SesionCaja` en TypeScript

```typescript
export interface SesionCaja {
  // ... campos existentes ...
  monto_sistema_bs: string | null   // NUEVO
  monto_fisico_bs: string | null    // NUEVO
  diferencia_bs: string | null      // NUEVO
}
```

---

## FASE 3 — Modal de Cobro Split-Tender (POS)

**Objetivo**: Redisenar el flujo de cobro en `pos-terminal.tsx` para cumplir con el spec:
(a) tasa congelada al abrir, (b) saldo restante en tiempo real, (c) lista de pagos con X,
(d) selector de moneda del vuelto, (e) registro del vuelto como evento VUELTO.

**Archivos afectados**:
- `front/src/features/ventas/components/pos-terminal.tsx` (logica)
- Extraer en componente propio: `front/src/features/ventas/components/cobro-modal.tsx` (nuevo)

### Tareas

#### 3.1 — Extraer el modal de cobro a su propio componente

El `pos-terminal.tsx` tiene 1267 lineas. Extraer toda la logica de cobro a `cobro-modal.tsx`
para mantener el principio de separacion de responsabilidades. El pos-terminal solo llama:

```tsx
<CobroModal
  open={modalCobro}
  onClose={() => setModalCobro(false)}
  totalUsd={totalFactura}
  sesionCajaId={sesionActiva.id}
  clienteId={clienteId}
  ventaId={ventaEnProceso.id}
  onSuccess={handleVentaCompletada}
/>
```

#### 3.2 — Congelar la tasa al abrir el modal

```tsx
// Dentro de CobroModal
const tasaCongeladaRef = useRef<number>(0)

useEffect(() => {
  if (open && tasaDelDia > 0) {
    // La tasa se "fotografía" UNA SOLA VEZ al abrir
    tasaCongeladaRef.current = tasaDelDia
  }
}, [open])  // Solo ejecuta cuando `open` cambia a true

// Todos los calculos internos usan tasaCongeladaRef.current
// NO usan tasaDelDia directamente
```

#### 3.3 — Estado interno del modal: lista de pagos agregados

```typescript
interface PagoAgregado {
  id: string          // UUID local para poder eliminarlo
  metodoCobro: MetodoCobro
  monto: number       // En moneda nativa del metodo
  montoUsd: number    // Convertido a USD con tasa congelada
  referencia?: string
}

const [pagosAgregados, setPagosAgregados] = useState<PagoAgregado[]>([])
const [metodoCobro, setMetodoCobro] = useState<MetodoCobro | null>(null)
const [montoInput, setMontoInput] = useState<string>('')
const [monedaVuelto, setMonedaVuelto] = useState<'USD' | 'VES' | null>(null)

// Calculos derivados (useMemo para performance)
const totalRecibidoUsd = useMemo(
  () => pagosAgregados.reduce((acc, p) => acc + p.montoUsd, 0),
  [pagosAgregados]
)
const saldoRestanteUsd = Math.max(0, totalUsd - totalRecibidoUsd)
const vueltoUsd = Math.max(0, totalRecibidoUsd - totalUsd)
const hayVuelto = vueltoUsd > 0
const pagoCompleto = saldoRestanteUsd === 0
```

#### 3.4 — Auto-completar monto con saldo restante

```typescript
// Cuando el cajero selecciona un metodo de pago, auto-completar con el restante
const handleSeleccionarMetodo = (metodo: MetodoCobro) => {
  setMetodoCobro(metodo)

  if (metodo.tipo === 'EFECTIVO') {
    // Auto-completa con el saldo restante en la moneda del metodo
    if (metodo.moneda === 'USD') {
      setMontoInput(saldoRestanteUsd.toFixed(2))
    } else {
      // Convertir saldo restante a Bs con tasa congelada
      setMontoInput((saldoRestanteUsd * tasaCongeladaRef.current).toFixed(2))
    }
  } else {
    // Para no-efectivo, igual auto-completar con el equivalente
    setMontoInput(saldoRestanteUsd.toFixed(2))
  }
}
```

#### 3.5 — Validacion anti-negativo antes de agregar pago de tipo EGRESO

Antes de procesar vuelto o movimientos, verificar saldo disponible por divisa:

```typescript
const validarSaldoDisponible = async (moneda: 'USD' | 'VES', montoEgreso: number) => {
  // Query al ledger de la sesion activa
  const saldoActual = await calcularSaldoSesionPorMoneda(sesionCajaId, moneda)
  if (montoEgreso > saldoActual) {
    throw new Error(
      `Saldo insuficiente en ${moneda}. Disponible: ${saldoActual.toFixed(2)} — Solicitado: ${montoEgreso.toFixed(2)}`
    )
  }
}
```

La funcion `calcularSaldoSesionPorMoneda()` hace:
```sql
SELECT
  COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0)
  + CAST(sc.monto_apertura_usd AS REAL)   -- o monto_apertura_bs segun moneda
FROM movimientos_metodo_cobro mmc
JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
JOIN monedas mo ON mc.moneda_id = mo.id
JOIN sesiones_caja sc ON mmc.sesion_caja_id = sc.id
WHERE mmc.sesion_caja_id = ?
  AND mo.codigo = ?   -- 'USD' o 'VES'
```

#### 3.6 — Selector obligatorio de moneda del vuelto

```tsx
{hayVuelto && (
  <div className="rounded-md border border-yellow-400 bg-yellow-50 p-4">
    <p className="text-sm font-semibold text-yellow-800 mb-2">
      Vuelto: {formatUsd(vueltoUsd)} ({formatBs(vueltoUsd * tasaCongeladaRef.current)})
    </p>
    <p className="text-xs text-yellow-700 mb-3">
      Selecciona la moneda en que entregaras el vuelto:
    </p>
    <div className="flex gap-2">
      <Button
        variant={monedaVuelto === 'USD' ? 'default' : 'outline'}
        onClick={() => setMonedaVuelto('USD')}
      >
        Efectivo USD ({formatUsd(vueltoUsd)})
      </Button>
      <Button
        variant={monedaVuelto === 'VES' ? 'default' : 'outline'}
        onClick={() => setMonedaVuelto('VES')}
      >
        Efectivo VES ({formatBs(vueltoUsd * tasaCongeladaRef.current)})
      </Button>
    </div>
  </div>
)}

{/* Boton de procesar deshabilitado si no se eligio moneda de vuelto */}
<Button
  disabled={!pagoCompleto || (hayVuelto && !monedaVuelto)}
  onClick={handleProcesarVenta}
>
  Procesar Factura y Cerrar
</Button>
```

#### 3.7 — Registrar el VUELTO como evento al procesar la venta

Dentro del `writeTransaction` de la venta, despues de insertar los pagos, agregar:

```typescript
if (vueltoUsd > 0 && monedaVuelto) {
  // Determinar metodo de cobro EFECTIVO en la moneda del vuelto
  const metodoCajaVuelto = metodosEfectivoPorMoneda[monedaVuelto]
  const montoVueltoNativo = monedaVuelto === 'USD'
    ? vueltoUsd
    : vueltoUsd * tasaCongeladaRef.current

  // Validar saldo antes de registrar
  await validarSaldoDisponible(monedaVuelto, montoVueltoNativo)

  // Insertar movimiento VUELTO (EGRESO inmutable)
  await tx.executeQuery(
    `INSERT INTO movimientos_metodo_cobro
       (id, empresa_id, metodo_cobro_id, tipo, origen, monto,
        saldo_anterior, saldo_nuevo, doc_origen_id, doc_origen_ref,
        sesion_caja_id, concepto, fecha, created_at, created_by)
     VALUES (?, ?, ?, 'EGRESO', 'VUELTO', ?,
             ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(), empresaId,
      metodoCajaVuelto.id,
      montoVueltoNativo.toFixed(2),
      saldoAnteriorMetodo.toFixed(2),
      (saldoAnteriorMetodo - montoVueltoNativo).toFixed(2),
      ventaId,          // doc_origen_id = ID de la factura
      `Factura ${nroFactura}`,
      sesionCajaId,
      `Vuelto entregado en ${monedaVuelto}`,
      new Date().toISOString(),
      new Date().toISOString(),
      userId
    ]
  )
}
```

---

## FASE 4 — Actualizacion del Cuadre de Caja

**Objetivo**: Mostrar saldos esperados y fisicos separados por divisa (USD y VES),
y que el conteo fisico del cajero incluya el conteo en Bs por separado.

**Archivos afectados**:
- `front/src/features/reportes/components/cuadre-conteo-fisico.tsx`
- `front/src/features/reportes/hooks/use-cuadre.ts`

### Tareas

#### 4.1 — Agregar calculo de saldo esperado en VES al hook use-cuadre.ts

Crear funcion `useSaldoEsperadoPorMoneda(filters)` que retorne:

```typescript
interface SaldoEsperadoBimonetario {
  saldoEsperadoUsd: number
  saldoEsperadoBs: number
}
```

Implementacion con dos queries separadas al ledger de la sesion (igual que en Fase 2),
pero ahora desde el frontend para mostrarlo en tiempo real mientras la sesion esta abierta.

#### 4.2 — Agregar campo de conteo fisico en Bs al CuadreConteoFisico

```tsx
// Seccion del conteo fisico actual (en USD)
<div>
  <Label>Efectivo USD contado</Label>
  <Input type="number" value={conteoFisicoUsd} onChange={...} />
  <p className="text-sm text-muted-foreground">
    Sistema espera: {formatUsd(saldoEsperadoUsd)}
  </p>
</div>

// NUEVO: seccion conteo fisico en Bs
<div>
  <Label>Efectivo VES contado (Bs)</Label>
  <Input type="number" value={conteoFisicoBs} onChange={...} />
  <p className="text-sm text-muted-foreground">
    Sistema espera: {formatBs(saldoEsperadoBs)}
  </p>
</div>
```

#### 4.3 — Mostrar vueltos en el resumen del cuadre

En la seccion de movimientos del cuadre, agregar una linea para los vueltos entregados:

```tsx
// En el resumen de la sesion
{vueltos.length > 0 && (
  <div className="flex justify-between text-sm text-red-600">
    <span>Vueltos entregados ({vueltos.length})</span>
    <span>- {formatUsd(totalVueltosUsd)}</span>
  </div>
)}
```

#### 4.4 — Pasar `monto_fisico_bs` al `cerrarSesionCaja()`

Actualizar la llamada a `cerrarSesionCaja()` para incluir el conteo fisico en Bs:

```typescript
await cerrarSesionCaja({
  sesionId,
  usuarioCierreId: user.id,
  montoFisicoUsd: conteoFisicoUsd,
  montoFisicoBs: conteoFisicoBs,   // NUEVO
  observaciones,
  conteoFisicoPorMetodo
})
```

---

## FASE 5 — Anti-fraude: Trazabilidad de Avances y Prestamos

**Objetivo**: Implementar los controles de auditoria para AVANCE y PRESTAMO descritos en el spec.

**Archivos afectados**:
- `front/src/features/caja/components/movimiento-manual-form.tsx` (o equivalente en pos-terminal.tsx)
- `front/src/features/caja/hooks/use-movimientos-manuales.ts` (o similar)

### Tareas

#### 5.1 — Avance: Requerir referencia a pago digital

En el formulario de AVANCE, agregar un selector de pagos digitales de la sesion activa:

```tsx
{tipoMovimiento === 'AVANCE' && (
  <div>
    <Label>Pago digital de referencia *</Label>
    <p className="text-xs text-muted-foreground mb-1">
      Selecciona el Punto de Venta o Pago Movil que origina este avance
    </p>
    <Select onValueChange={setPagoDigitalId} required>
      {pagosDigitalesSesion.map(pago => (
        <SelectItem key={pago.id} value={pago.id}>
          {pago.metodoCobro} — {formatUsd(pago.monto_usd)} — Ref: {pago.referencia}
        </SelectItem>
      ))}
    </Select>
  </div>
)}
```

Validar en el submit que `pagoDigitalId` no sea null cuando `origen = 'AVANCE'`:

```typescript
if (origen === 'AVANCE' && !pagoDigitalId) {
  toast.error('Un avance requiere referenciar el pago digital que lo origina')
  return
}
if (origen === 'AVANCE') {
  const pagoReferenciado = pagosDigitalesSesion.find(p => p.id === pagoDigitalId)
  if (!pagoReferenciado || pagoReferenciado.monto_usd < montoUsd) {
    toast.error('El pago digital referenciado no cubre el monto del avance')
    return
  }
}
```

Guardar `referencia_pago_digital_id` en el INSERT de `movimientos_metodo_cobro`.

#### 5.2 — Prestamo: Requerir supervisor y destinatario

```tsx
{tipoMovimiento === 'PRESTAMO' && (
  <>
    <div>
      <Label>Autorizado por (Supervisor) *</Label>
      <Select onValueChange={setSupervisorId} required>
        {supervisores.map(s => (
          <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
        ))}
      </Select>
    </div>
    <div>
      <Label>Destinatario del prestamo *</Label>
      <Select onValueChange={setDestinatarioId} required>
        {usuarios.map(u => (
          <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
        ))}
      </Select>
    </div>
  </>
)}
```

Guardar `autorizado_por_id` y `destinatario_id` en el INSERT.

---

## Orden de Implementacion y Dependencias

```
FASE 1 (DB)
  └─► FASE 2 (Hook cerrar sesion con saldos por divisa)
        └─► FASE 4 (Cuadre muestra saldos por divisa)
  └─► FASE 3 (Modal de cobro con vuelto)
        └─► FASE 5 (Anti-fraude avance/prestamo)
```

Las Fases 2+4 y la Fase 3 pueden desarrollarse en paralelo una vez aplicada la Fase 1.

---

## Checklist de Archivos a Crear / Modificar

### Nuevos archivos
- [ ] `migrations/0032_cash_ledger_bimonetario.sql` — Schema (Fase 1)
- [ ] `front/src/features/ventas/components/cobro-modal.tsx` — Extraccion del modal (Fase 3)

### Archivos a modificar
- [ ] `backend/powersync-sync-rules.yaml` — Nuevos campos en buckets (Fase 1)
- [ ] `front/src/features/caja/hooks/use-sesiones-caja.ts` — Calculos por divisa + campos BS (Fase 2)
- [ ] `front/src/features/ventas/components/pos-terminal.tsx` — Delegar cobro al nuevo modal (Fase 3)
- [ ] `front/src/features/reportes/hooks/use-cuadre.ts` — Saldo esperado por moneda (Fase 4)
- [ ] `front/src/features/reportes/components/cuadre-conteo-fisico.tsx` — Conteo fisico en BS (Fase 4)
- [ ] Formulario de movimientos manuales (AVANCE/PRESTAMO) — Nuevos campos (Fase 5)

---

## Consideraciones Tecnicas

| Tema | Decision |
|---|---|
| Tabla de vueltos | Reutilizar `movimientos_metodo_cobro` con `origen='VUELTO'` (no crear tabla nueva) |
| Tasa congelada | `useRef` en el modal de cobro, capturada al abrir (`useEffect([open])`) |
| Saldo por divisa | Calculado via query al ledger `movimientos_metodo_cobro` filtrando por `monedas.codigo` |
| Atomicidad | Registro del vuelto dentro del mismo `writeTransaction` de la venta |
| Retrocompatibilidad | Los nuevos campos en `sesiones_caja` son `DEFAULT NULL` — sesiones antiguas no se rompen |
| PowerSync | Los nuevos campos deben estar en `powersync-sync-rules.yaml` para sincronizarse offline |
