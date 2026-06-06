# Tasks: CxC Mejoras de Pagos

_Change: cxc-mejoras-pagos | Date: 2026-06-06 | Model: anthropic/claude-sonnet-4-6_

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420–480 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (Infra+Hook) → PR2 (Logic) → PR3 (CxC UI) → PR4 (POS UI) |
| Delivery strategy | pending |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Lines est. |
|------|------|-----------|------------|
| 1 | T-01+T-02+T-03: Infra + Hook | PR 1 | ~38 |
| 2 | T-04+T-05: Business logic | PR 2 | ~95 |
| 3 | T-06+T-07: CxC UI modals | PR 3 | ~175 |
| 4 | T-08: POS CobroModal | PR 4 | ~125 |

---

## Phase 1 — Infraestructura (T-01, T-02 — paralelas, sin dependencias)

- [x] **T-01** `migrations/0050_saf_origen_refs.sql` — CREATE: `ALTER TABLE movimientos_cuenta ADD COLUMN saf_origen_refs TEXT;` (nullable, sin backfill). Implements **CAP-5**.
  _Deps: none. Done: archivo existe, SQL es aditivo, sin UPDATE/backfill._

- [x] **T-02** `src/core/db/powersync/schema.ts` — ADD `saf_origen_refs: column.text` en la definición de `movimientos_cuenta` (buscar línea `tipo_referencia: column.text` como ancla). Implements **CAP-5**.
  _Deps: none. Done: TypeScript compila sin errores, columna aparece en el schema._

---

## Phase 2 — Hook Compartido (T-03 — depende de T-01, T-02)

- [x] **T-03** `src/core/hooks/use-saldo-a-favor.ts` — CREATE: hook `useSaldoAFavor(clienteId: string | null)` que retorna `{ disponible: number; tieneSaf: boolean }`. Query PowerSync: `SELECT saldo_actual FROM clientes WHERE id = ? AND empresa_id = ?`. `disponible = saldo_actual < -0.001 ? Math.abs(saldo_actual) : 0`. Sin `any`. Implements **CAP-1, CAP-2**.
  _Deps: T-01, T-02. Done: retorna `{ disponible: 0, tieneSaf: false }` para saldo≥-0.001; valor correcto para saldo negativo._

---

## Phase 3 — Lógica de Negocio (T-04, T-05 — paralelas, dependen de T-03)

- [x] **T-04** `src/features/cxc/hooks/use-cxc.ts` — ADD campos opcionales `aplicarSaf?`, `montoSaf?`, `safOrigenRefs?` a `PagoFacturaParams` y `AbonoGlobalParams`. En `aplicarPagoFacturaEnTx`: si `aplicarSaf`, INSERT `movimientos_cuenta {tipo:'SAF', monto_usd: montoSaf, saf_origen_refs: JSON.stringify(safOrigenRefs), referencia:'SAF-CXC-{nroFactura}'}`, luego `UPDATE clientes SET saldo_actual = saldo_actual + montoSaf`. Reduce el monto efectivo del `pagos`. Mismo patrón en `registrarAbonoGlobal`. Todo dentro del `writeTransaction` existente. Implements **CAP-1**.
  _Deps: T-03. Done: tx rollback total ante fallo; SAF movement insertado; saldo_actual actualizado (ej: -50+30=-20)._

- [x] **T-05** `src/features/ventas/hooks/use-ventas.ts` — ADD interfaz `SafEntry { clienteId: string; montoUsd: number; safOrigenRefs?: string[] }`. ADD `safEntry?: SafEntry` a `CrearVentaParams`. En `crearVenta`: si `safEntry`, INSERT `movimientos_cuenta {tipo:'SAF', monto_usd: safEntry.montoUsd, saf_origen_refs: JSON.stringify([ventaId]), referencia:'SAF-VTA-{nroVenta}'}`, UPDATE `clientes.saldo_actual += safEntry.montoUsd`, reduce `saldoPend`. Sin fila en `pagos` por el monto SAF. Dentro del `writeTransaction` existente. Implements **CAP-2**.
  _Deps: T-03. Done: safEntry procesado atómicamente; no se inserta pagos por montoSaf._

---

## Phase 4 — UI CxC (T-06, T-07 — paralelas, dependen de T-04)

- [x] **T-06** `src/features/cxc/components/pago-factura-modal.tsx` — REMOVE lógica de auto-aplicación `aplicarSaldoFavor` del sub-modo SAF+FIFO. ADD sección colapsable "Usar saldo a favor" gated por `useSaldoAFavor(clienteId).tieneSaf`: muestra `disponible`, input `montoSaf` (máx=disponible), reduce el monto requerido al cajero en tiempo real. Pasar `aplicarSaf`, `montoSaf`, `safOrigenRefs` a `registrarPagoFactura` en submit. Implements **CAP-1**.
  _Deps: T-04. Done: sección ausente si saldo≥-0.001; montoSaf reduce el monto requerido en pantalla._

- [x] **T-07** `src/features/cxc/components/abono-global-modal.tsx` — ADD sección colapsable "Usar saldo a favor" (mismo patrón que T-06). En tabla FIFO: reemplazar cada `formatUsd(p.aplicar)` por `moneda === 'BS' ? formatBs(p.aplicar * tasaEfectiva) : formatUsd(p.aplicar)`. Footer total: mismo ternario. Pasar SAF params en submit. Implements **CAP-1, CAP-3**.
  _Deps: T-04. Done: SAF section gateada; tabla FIFO cambia moneda al seleccionar método; valores almacenados permanecen en USD._

---

## Phase 5 — UI POS (T-08 — depende de T-05)

- [x] **T-08** `src/features/ventas/components/cobro-modal.tsx` — ADD "Saldo a favor" como método de pago dinámico gated por `useSaldoAFavor(clienteId).tieneSaf`: pre-cargar monto = `Math.min(disponible, totalVenta)`, editable hasta `disponible`. Al confirmar, ensamblar `safEntry` y pasarlo a `crearVenta`. ADD panel de vuelto por moneda (visible solo si hay vuelto): si un solo método → `"Vuelto: $X.XX"` o `"Bs X.XX"`; si métodos mixtos → fila por moneda. Preservar inserción `movimientos_metodo_cobro {tipo:'EGRESO', origen:'VUELTO'}` existente sin cambios. Implements **CAP-2, CAP-4**.
  _Deps: T-05. Done: opción SAF ausente sin cliente o sin crédito; vuelto muestra desglose por moneda; registro EGRESO/VUELTO sigue insertándose._
