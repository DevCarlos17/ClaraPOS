## Exploration: consulta-factura-evolucion

### Current State

`ReimprimirFacturaModal` (`src/features/ventas/components/reimprimir-factura-modal.tsx`) opens from
`cliente-detalle.tsx` on row-click over `FacturasEmpresaTable`. It calls
`useReciboDesdeFactura(venta, { esReimpresion: true, derivarMonedaPresentacion: true })`
(`src/features/ventas/utils/recibo-desde-factura.ts`), which composes 3 PowerSync `useQuery` hooks
(`useDetalleFactura`, `usePagosFactura` — both from `@/features/cxc/hooks/use-cxc.ts` — and `useCompany`)
and maps them via the pure `buildReciboDataDesdeFacturaGuardada` into a `ReciboData`
(`src/features/ventas/utils/factura-export.ts`). The same `ReciboData` feeds all 3 outputs:
`FacturaDetallePanel` (screen), `buildReciboPdfBlob` (PDF), and `construirLineasRecibo` → `buildReciboTextoPlano`/`buildReciboImagenBlob` (shared text/PNG). All 3 render paths already read
`recibo.pagos` and print "Metodos de pago" + "Total abonos" — **except** the on-screen
`FacturaDetallePanel`, which deliberately omits that block (comment L117-132) because of a real,
narrow data-correctness gap explained below. The panel DOES render a "Notas de credito aplicadas"
section today, but it is QUANTITY-only (no USD amounts) and fed by a *different* prop
(`reversos: ReversoAplicado[]`, from `useReversosFactura` + `agruparReversosPorNc`), not by `ReciboData`.

Nothing in the current pipeline reports what happened to an invoice **after** emission (subsequent
abonos, reversals, or generated saldo a favor) in the PDF/shared-image outputs — only the ad-hoc,
lines-only "reversos" block exists, and only in the modal.

### The "capped pagos" bug — confirmed real, and precisely scoped

Root cause, found in `use-ventas.ts` L771-800 (`crearVenta`, Step 5 — insert one `pagos` row per
tendered payment method):

```ts
const isSafWithAssignments = discrepancy?.mode === 'SAF' && !!discrepancy.invoiceAssignments?.length
...
const montoMovVenta = (discrepancy?.mode === 'SAF')
  ? Decimal.min(montoUsd, Decimal.max(new Decimal(0), totalUsd.minus(totalAbonadoUsd)))
  : montoUsd
const pagoMontoUsd = isSafWithAssignments ? montoMovVenta : montoUsd   // <-- CAP
```

When a client tenders MORE than the invoice total and the POS checkout applies the excess via FIFO
to OTHER pending invoices (`discrepancy.mode === 'SAF'` **and** `invoiceAssignments.length > 0`), the
`pagos` row written for the **origin** invoice is capped to `montoMovVenta` (what that invoice
needed), not the full tendered amount. The excess is written as **separate** `pagos` rows against the
**destination** invoices (`aplicarPagoFacturaEnTx`, `is_pos_saf_allocation = 1`,
`use-cxc.ts` L446-459) — each of those rows IS the correct capped/applied amount **for that
destination invoice**, so no data is wrong per-row; the origin invoice's own row just doesn't show
the full cash physically handed over.

**Confirmed NOT a bug for normal invoices**: when there is no `discrepancy`, or `discrepancy.mode`
is anything other than `'SAF'`, or `discrepancy.mode === 'SAF'` with **no** `invoiceAssignments`
(the whole excess goes straight to a fresh `SAFC` credit, not FIFO'd to other invoices),
`isSafWithAssignments` is `false` and `pagoMontoUsd = montoUsd` — the full tendered amount, uncapped.
This is the exact same condition `venta-exitosa-modal.tsx` never hits, because it renders the receipt
from the **in-memory** checkout `pagos` param (never capped) at sale time — so a reconstructed
(reprinted/consulted) receipt for a SAF-FIFO invoice can differ from the receipt shown at
checkout time. This is the gap part C's "Genero saldo a favor" line is meant to cover on the
**source** side; the destination side already shows correctly (it's a real applied payment).

`useAfectacionCxc` (`use-cxc.ts` L263-272) is `COUNT(*) FROM movimientos_cuenta WHERE venta_id = ?`
— a blunt, untyped count across every movimiento type (`FAC`,`PAG`,`REV`,`NCR`,`SAFC`,`SAF`). It
cannot distinguish reversals from abonos from saldo-a-favor, and for the SAF-FIFO origin invoice it
returns `0` even though CxC *was* affected (on the destination invoice, not the origin). **Verdict:
avoid it entirely for both Part B and Part C** — it is strictly inferior to the typed query below.

### Decision for Part B: un-hide "Metodos de pago" — YES, safe

`recibo.pagos` is *always* populated (via `agruparPagosPorMetodo`, unconditionally called inside
`buildReciboData`) regardless of `esReimpresion`/panel visibility — the panel simply never renders it.
Un-hiding means adding one JSX block to `FacturaDetallePanel` that mirrors
`construirLineasRecibo`'s "Metodos de pago" section (factura-export.ts L486-499), reusing the
already-exported pure helpers `formatMontoPago`, `sumarAbonos`, `formatMontoBimonetario` — same data,
same known/accepted caveat (narrow SAF-FIFO origin case), zero new query. This reaches **exact**
parity with the shared/PDF receipt with no new risk, because the correctness gap it reopens is the
SAME one the receipt has shipped with since the previous change, and the user explicitly accepts it
given Part C's separate, additive "saldo a favor generado" line.

### Part C: exact data sources for each evolution case

**Critical discovery — reversal amounts are NOT reliably in `movimientos_cuenta` for CONTADO
invoices.** In `use-notas-credito.ts` (`crearNotaCredito`, Step 6, L779-827), the `movimientos_cuenta`
tipo `'NCR'` row is only inserted when `montoAplicadoAPendiente.gt('0.01')`, where
`montoAplicadoAPendiente = Decimal.min(saldoPendVenta, totalUsdNc)`. For a CONTADO invoice,
`saldo_pend_usd` is already `0` (paid in full at emission) — so `montoAplicadoAPendiente` is
always `0` and **no `NCR` movimiento is ever written** for a pure contado reversal. The comment at
L783-784 even documents the CxC-side invariant ("para TOTAL, montoAplicadoAPendiente ==
saldoPendVenta SIEMPRE") without covering the contado=0 corollary. This means the task's suggested
source (`movimientos_cuenta` `NCR`) is **unreliable for the "contado reversed" case** and the
correct source is instead the `notas_credito` table itself, via `useReversosFactura`.

| Evolution case | Correct source | Exact shape / query | Notes |
|---|---|---|---|
| **Contado/credito reversed (NC applied)** | `useReversosFactura(ventaId, empresaId)` — `use-notas-credito.ts` L296-309 | Currently: `SELECT nc.id, nc.nro_ncr, nc.tipo, nc.fecha, ncd.venta_det_id, ncd.descripcion, ncd.cantidad FROM notas_credito nc JOIN notas_credito_det ncd ... WHERE nc.venta_id=? AND nc.empresa_id=?`. **MUST extend additively with `nc.total_usd, nc.total_bs`** (both columns already exist on `notas_credito`, confirmed via `NotaCreditoRow` interface L27-40) so `agruparReversosPorNc`'s output (`ReversoAplicado`) carries the real reversed amount, not just quantities. | `ReversoAplicado` today has **no amount field** — only per-line `cantidad`. This is the one genuinely missing piece; everything else already exists. Works identically for contado and credito (reads the NC's own total, never depends on `saldo_pend_usd`). |
| **Credit with abonos (subsequent)** | NEW query: `movimientos_cuenta WHERE venta_id=? AND empresa_id=? AND tipo='PAG'` | `SELECT monto, fecha, referencia, observacion FROM movimientos_cuenta WHERE venta_id=? AND empresa_id=? AND tipo='PAG' ORDER BY fecha ASC` | `'PAG'` movimientos against a `venta_id` are written **only** by `aplicarPagoFacturaEnTx`/`registrarPagoFactura` (`use-cxc.ts`), i.e. **only for abonos made after emission** via the CxC module. The original down-payment tendered at `crearVenta` time never writes a `'PAG'` movimiento (it writes `'FAC'` for the remaining debt instead) — so this filter naturally excludes the original transaction with zero extra logic. Cleaner than filtering `usePagosFactura` by date. |
| **Reversos de abono (payment reversed)** | Same query, `tipo='REV'` | `... AND tipo='REV' ...` | Written only by `registrarReversoAbono` (`use-cxc.ts` L1466-1592), always carries `venta_id` when the reversed pago had one. Amount is `monto` (USD), sign is positive (restoration), `observacion` already contains the human reason. |
| **Saldo a favor generado (SAF/excedente)** | Same query, `tipo='SAFC'` | `... AND tipo='SAFC' ...` | Confirmed at `use-ventas.ts` L1138-1152: inserted with `venta_id=ventaId`, `referencia='SAF-ANTICIPO-{nroFactura}'`, `observacion='Saldo a favor — excedente venta {nro}'`, `monto=remainingSaf`. Traceable to THIS invoice as the generator; deliberately does NOT assert which destination invoice later consumed it (matches the accepted scope). |
| `useAfectacionCxc` | **Avoid** | — | Superseded by the typed query above; blunt COUNT across all types, cannot distinguish cases, wrong for the SAF-FIFO origin case (see above). |
| Original condition (contado vs credito) | `ventas.tipo` (`'CONTADO' \| 'CREDITO'`) | Already exposed on `FacturaParaAnular.tipo` | Confirmed via `CrearVentaParams.tipo` type and `FacturaParaAnular` interface (`use-notas-credito.ts` L42-62). `saldo_pend_usd` is NOT the discriminator (a credit invoice can reach `saldo_pend_usd=0` after being fully paid off and still be `tipo='CREDITO'`). |

**One combined additive query** covers 3 of the 4 cases (`PAG`/`REV`/`SAFC` in one
`movimientos_cuenta` read); the 4th (NC reversal amount) needs the `useReversosFactura` extension
above. Both are `empresa_id`-scoped (rule #11) and pure `SELECT`s via `@powersync/react` `useQuery` —
zero writes.

### Where the evolution composition should live

The **hook** (`useReciboDesdeFactura`) must compose it — it already fetches `useDetalleFactura`,
`usePagosFactura`, `useCompany`, and would add `useReversosFactura` (extended) + one new hook (e.g.
`useEvolucionFactura(ventaId, empresaId)` in `use-cxc.ts`, sibling to `useAfectacionCxc`, reading the
`PAG`/`REV`/`SAFC` rows). The **pure builder** (`buildReciboDataDesdeFacturaGuardada` →
`buildReciboData`) only maps already-fetched arrays into `ReciboData.evolucion` — same
fetch-in-hook/map-in-pure-fn split the codebase already uses for `detalle`/`pagos`/`company`.

Proposed additive `ReciboData` field (all optional, so omission ⇒ current behavior, byte-identical):

```ts
export interface ReciboEvolucionReverso {
  nroNcr: string
  tipo: 'TOTAL' | 'PARCIAL'
  fecha: string
  montoUsd: number
  montoBs: number
}
export interface ReciboEvolucionMovimiento {
  fecha: string
  montoUsd: number
  montoBs: number
}
export interface ReciboEvolucion {
  reversos: ReciboEvolucionReverso[]
  abonos: ReciboEvolucionMovimiento[]
  reversosPago: ReciboEvolucionMovimiento[]
  saldoAFavorGeneradoUsd: number | null
  saldoAFavorGeneradoBs: number | null
}
// ReciboData.evolucion?: ReciboEvolucion
```

Default/empty evolution (all arrays empty, both saldo fields `null`) must render **nothing** in all
3 outputs — same zero-impact-regression discipline `esReimpresion` already established.

### Exact injection points (all 3 render paths)

1. **Text/PNG** (`construirLineasRecibo`, `factura-export.ts`): after the pagos block ends (line 499,
   `lines.push({ text: SEPARADOR })`) and before `if (recibo.cierre)` (line 501). Insert a new
   "Evolucion" section here, guarded by `recibo.evolucion && (evolucion.reversos.length ||
   evolucion.abonos.length || evolucion.reversosPago.length || evolucion.saldoAFavorGeneradoUsd)`.
2. **PDF** (`buildReciboPdfBlob`, `factura-export.ts`): after the pagos `autoTable` block ends
   (line 663, `y = (doc as AutoTableDoc).lastAutoTable.finalY + 6`) and before `if (recibo.cierre)`
   (line 665). Same guard; render as a third `autoTable` (mirrors the existing pagos table styling).
3. **Modal** (`FacturaDetallePanel`, `factura-detalle-panel.tsx`): after the totals block (ends
   line 115) — this is also where the un-hidden "Metodos de pago" block from Part B goes — and
   **replacing** the current lines-only "Notas de credito aplicadas" block (lines 134-156) for the
   Consulta surface, since `evolucion.reversos` now carries the amount too. The existing `reversos`
   prop stays defined and untouched for the two NC modals (FROZEN files, unrelated purpose: gating
   max-double-credit by remaining quantity, not money-flow reporting) — they simply never pass
   `evolucion` on their `ReciboData`, so nothing new renders there.

### Affected Areas

- `src/features/ventas/components/reimprimir-factura-modal.tsx` — title change ("Reimprimir Factura" → "Consulta de Factura"); rename candidate (see Approaches).
- `src/features/ventas/components/factura-detalle-panel.tsx` — un-hide "Metodos de pago" (Part B); add evolution section (Part C); the L117-132 comment must be rewritten (no longer "hidden", now "accepted caveat, see evolucion.saldoAFavorGenerado").
- `src/features/ventas/utils/factura-export.ts` — new `ReciboEvolucion*` types on `ReciboData`; injection in `construirLineasRecibo` and `buildReciboPdfBlob`.
- `src/features/ventas/utils/recibo-desde-factura.ts` — `useReciboDesdeFactura` composes the new evolution hooks; `buildReciboDataDesdeFacturaGuardada` gains an additive `evolucion` param.
- `src/features/ventas/hooks/use-notas-credito.ts` — extend `useReversosFactura`'s SELECT with `nc.total_usd, nc.total_bs`; extend `ReversoFacturaRowInput`/`ReversoAplicado` (notas-credito-ui.ts) with amount fields (additive, must not break `agruparReversosPorNc`'s existing NC-modal callers).
- `src/features/cxc/hooks/use-cxc.ts` — new `useEvolucionFactura(ventaId, empresaId)` hook (or equivalent name) reading `movimientos_cuenta` `PAG`/`REV`/`SAFC` rows, `empresa_id`-scoped.
- `src/features/clientes/components/cliente-detalle.tsx` — import path + JSX usage if the file is renamed.
- `src/features/clientes/components/__tests__/cliente-detalle.test.tsx` — `vi.mock` path + `data-testid` string if renamed.
- `src/features/ventas/components/__tests__/reimprimir-factura-modal.test.tsx` — full rewrite/rename if the file is renamed; otherwise only the `DialogTitle` assertion changes.

### Approaches

1. **Extend `ReciboData` additively (`evolucion` field), hook composes, pure fn maps, all 3 render paths read one source of truth. Un-hide payment methods in the panel.**
   - Pros: satisfies the explicit "all three outputs" requirement; single source of truth prevents the 3 renderers from drifting (the exact bug class `construirFilasTotales` was extracted to prevent, per its own doc comment); default-empty is byte-identical (same discipline as `esReimpresion`); reuses 100% existing hooks/patterns (`useDetalleFactura`/`usePagosFactura`/`useCompany` composition pattern).
   - Cons: touches a FROZEN-adjacent shared type (`ReciboData`) and both renderer functions; requires one schema-correcting extension (`useReversosFactura` + `total_usd`/`total_bs`) before the amount-bearing case works.
   - Effort: Medium.

2. **Separate evolution component, rendered ONLY in the modal (not PDF/shared image).**
   - Pros: zero touch to `factura-export.ts`'s renderer functions; smallest, most isolated diff.
   - Cons: **directly violates the stated requirement** ("appended at the END, in ALL THREE outputs"); produces exactly the render-path-drift bug the codebase already fixed once (`construirFilasTotales` extraction comment explicitly calls this out as "motivo del bug original de orden inconsistente"); a client sharing/printing the PDF would get a materially different (less informative) document than what they see on screen — inconsistent with the bimonetario/auditability posture of the app (rule #9/#10 spirit: financial documents should not silently omit information depending on render path).
   - Effort: Low, but rejected on requirements grounds.

### Recommendation

**Approach 1.** It is the only option that satisfies the literal requirement (evolution in all 3
outputs) and it follows the exact fetch-in-hook / map-in-pure-fn / single-source-of-truth pattern this
codebase already established for `esReimpresion`, `pagos`, and `construirFilasTotales`. The two real
prerequisites are small and additive: (a) extend `useReversosFactura`'s SELECT with
`nc.total_usd, nc.total_bs` (2 columns, both already exist on the table), and (b) add one new
`empresa_id`-scoped read hook for `movimientos_cuenta` (`PAG`/`REV`/`SAFC`), modeled directly on the
existing `useAfectacionCxc`.

For the rename question (Part A): **rename both file and component.** The blast radius is small and
fully enumerated above (1 production consumer + 2 test files, all already found via grep — no hidden
call sites). "Reimprimir Factura" is actively misleading once this change ships (consultation +
evolution become the primary content, reprint is one of three actions in the footer). Renaming now,
before the file grows further with the evolution section, is cheaper than renaming later. Suggested
name: `consulta-factura-modal.tsx` / `ConsultaFacturaModal` (keep the same prop shape —
`{ venta, isOpen, onClose }` — zero API change beyond the identifier).

### Risks

- `notas_credito_det` join in `useReversosFactura` produces one row per NC line; `nc.total_usd`
  selected per row is redundant-but-harmless (same value repeated) — `agruparReversosPorNc` must take
  it once per NC group, not sum it across lines (would double/triple count).
- The new `movimientos_cuenta` evolution hook must NOT reuse `useAfectacionCxc`'s COUNT-only shape;
  it needs the typed columns (`tipo`, `monto`, `fecha`, `referencia`, `observacion`) and must filter
  `empresa_id` (rule #11) — `venta_id` alone is not sufficient defense-in-depth (same pre-existing gap
  documented for `useDetalleFactura`/`usePagosFactura`, not to be repeated in new code).
  `useAfectacionCxc` already does this correctly — mirror its `WHERE venta_id = ? AND empresa_id = ?`
  pattern exactly.
  - `PAG`-type movimientos written via `aplicarPagoFacturaEnTx` with `isPosAllocation: true` (the
    SAF-FIFO destination-side allocation) will ALSO appear in the destination invoice's evolution
    "abonos" list — this is correct and desired (it IS a real abono to that invoice), not a bug.
- Un-hiding "Metodos de pago" in the panel (Part B) surfaces the capped-amount caveat to users on
  SAF-FIFO origin invoices for the first time on screen (previously only in PDF/shared image). This
  is accepted per the task's framing, but worth a one-line note in the eventual proposal/design so
  it's a documented, not accidental, UX change.
- `esReimpresion`-style default-must-be-invisible discipline must be verified with an explicit test:
  an invoice with zero reversos/abonos/reversosPago/SAFC must produce byte-identical PDF/text/PNG
  output to today (regression guard), mirroring how `esReimpresion` was verified in the prior change.

### Ready for Proposal

**Yes.** All data sources are confirmed with exact table/column names and code line references; the
one gap in the task's own framing (movimientos_cuenta `NCR` unreliable for contado reversals) is
identified and resolved (use `notas_credito.total_usd` via extended `useReversosFactura` instead).
Tell the user: the `NCR` movimiento-based amount they described for reversals only works for CREDITO
invoices with remaining `saldo_pend_usd` at time of NC — for CONTADO reversals we read the NC's own
`total_usd` instead (same visible outcome, different/more reliable source), and `useAfectacionCxc`
should NOT be reused for this feature.
