# Verification Report — preview-panel-moneda-metodo

**Mode**: Strict TDD. **Verdict**: PASS.

### Completeness
tasks.md: 19/19 checkboxes checked (0 incomplete). NOTE: apply-progress claimed "29/29 tasks checked" — actual file has 19 numbered items, all done. Self-report count discrepancy (WARNING, not blocking — all real tasks complete).

### Diff scope (independently verified)
`git diff --stat` on tracked files: ONLY `use-preview-facturas-afectadas.ts` (+55/-?), its test (+156), `reverso-modal.tsx` (+49), its test (+90), plus unrelated `.atl/skill-registry.cache.json` noise. `git diff --stat` on `src/features/cxc/hooks/reversa-pago-saf.ts`, `use-reverso-abono-directo.ts`, `use-cxc.ts` → EMPTY (zero diff) for all three — confirmed independently, not just trusted from apply report.

### Native amount derivation (CRITICAL check — PASS)
`montoAplicadoNativo = new Decimal(row.monto_aplicado_usd).times(row.tasa).toNumber()` — uses Decimal, derived from the per-bridge-row USD amount * tasa, never reads `pagos.monto`. Test "monto nativo se deriva de la fila puente, no del pago completo" uses a decoy `monto: '1000.00000000'` (full pago) alongside `monto_aplicado_usd: '1.00000000'`, `tasa: '500.0000'` and asserts `montoAplicadoNativo === 500`, explicitly `not.toBe(1000)`. This is the exact partial-bridge-row proof requested.

### SAF purity (CRITICAL check — PASS)
`reversa-pago-saf.ts` has zero diff (confirmed via git). Enrichment of `facturasSaf` happens only at the spread site inside the loop: `facturasSaf.push(...detalle.facturasAfectadas.map((f) => ({ ...f, montoAplicadoNativo, monedaCodigo, metodoNombre, tasa })))`. `detectarLoteSafDePago`'s own mocked return stays `{ventaId, nroFactura, montoAplicadoUsd}`-only in the test, proving the extra fields come from the bridge row, not the shared function.

### Join query + return shape (PASS)
Bridge SELECT adds `p.tasa, p.metodo_cobro_id, p.moneda_id, mc.nombre AS metodo_nombre, mon.codigo_iso` + `JOIN metodos_cobro mc ON mc.id = p.metodo_cobro_id` (INNER — matches `usePagosFactura` in `use-cxc.ts` L251/L462, since `pagos.metodo_cobro_id` is always populated at insert time across the codebase) + `LEFT JOIN monedas mon ON mon.id = p.moneda_id` (LEFT — moneda_id is nullable, same as `usePagosFactura`). `FacturaAfectadaPreview` return type carries `montoAplicadoNativo`, `monedaCodigo`, `metodoNombre`, `tasa`.

### Multi-tenant isolation (CRITICAL check — PASS)
`mbp.empresa_id = ?` remains in the WHERE clause (unchanged, sole isolation boundary). New JOINs key off `pagos.metodo_cobro_id`/`pagos.moneda_id` (global catalog FKs), never off `metodos_cobro`/`monedas` own empresa columns — these are shared catalogs across tenants by design, so the JOINs cannot leak cross-empresa rows; the row set is still gated entirely by the `mbp.empresa_id` filter on the bridge table. Test "aislamiento multi-tenant" explicitly asserts `sql.toContain('empresa_id = ?')` and `params.toContain('emp-a')` survive the new JOINs.

### formatMontoPago deviation (PASS, correctly reasoned)
`aLineaPago()` sets `moneda: 'USD'` + `forzarBimonetario: true` unconditionally (deviating from tasks.md's literal `monedaCodigo === 'USD' ? 'USD' : 'BS'` wording). Verified against `formatMontoPago`'s actual branching (`factura-export.ts` L468-475): `forzarBimonetario: true` skips the same-currency short-circuit and falls into `linea.moneda === 'USD' ? "$X (Bs. Y)" : "Bs. Y ($X)"` — since `moneda` is hardcoded `'USD'`, output is always USD-primary dual-currency, exactly matching the spec's locked example `"$1.00 (Bs. 500,00)"`. Panel test asserts the literal rendered strings `'$1.00 (Bs. 500,00)'` and `'$30.00 (Bs. 15.000,00)'` — not just presence of numbers, the actual formatted output.

### Tests — execution evidence
- Targeted run (`use-preview-facturas-afectadas.test.ts` + `reverso-modal.test.tsx`): **23/23 passed** (8 hook + 15 panel).
- RED repro: `git stash push` on the 2 production files only (tests kept) → **7/23 failed, 16/23 passed** — proves the tests exercise the new enrichment code and aren't vacuous. `git stash pop` restored; re-ran → 23/23 passed again (GREEN confirmed, not a fluke).
- `yarn type-check:test`: exactly 3 errors, ALL pre-existing/unrelated (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`) — none touch tesoreria files. Matches apply-progress's baseline claim, independently confirmed by inspecting the error list (no tesoreria/preview/reverso-modal errors present).

### Read-only (PASS)
Hook file only calls `db.getAll` (no `db.writeTransaction`/`db.execute` anywhere in the file). Test mock for `db` only stubs `getAll` — if production code called any write method it would throw at runtime and fail all 8 hook tests, giving implicit coverage of "no mutation" beyond static read.

### Assertion quality audit
No tautologies, no ghost loops, no ratio red flags. All `toEqual` assertions carry full derived objects with real computed values (montoAplicadoNativo, tasa, etc.), not just truthy/defined checks. Panel test asserts exact rendered strings. Triangulation: 3 distinct hook scenarios (direct w/ moneda, partial-row-via-tasa, SAF-enrichment) + abono-global + exclusion + legacy + multi-tenant = 7 non-trivial cases, no single-assertion duplicates.

### Issues
**CRITICAL**: None.
**WARNING**: apply-progress self-reported "29/29 tasks" but tasks.md has 19 checkbox items (all checked) — count mismatch in the self-report, no functional impact.
**SUGGESTION**: None.

### Verdict: PASS. Safe to commit and open as a single PR stacked to main. Next: sdd-archive.
