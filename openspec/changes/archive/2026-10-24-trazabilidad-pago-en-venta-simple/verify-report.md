# Verify Report: Trazabilidad Pago en Venta — Capa Simple (`crearVenta`)

> Change: `trazabilidad-pago-en-venta-simple` | Phase: verify | Project: clarapos

## Verdict: PASS

Fresh-context adversarial verify del change. Diff scope confirmado mínimo (solo
`use-ventas.ts` +24/-3 y `use-ventas.test.ts` +293/-3); `use-cxc.ts` byte-idéntico
(git diff vacío). Wiring 100% aditivo salvo `for (const pago of pagos)` →
`for (const [i, pago] of pagos.entries())` (semánticamente equivalente, confirmado
sin reorder vía grep + lectura completa de ambos loops).

## Why Verified

`crearVenta` es ruta financiera crítica; se exigió prueba independiente (no confiar
en apply self-report) de: correlación por índice Paso5↔Paso8, monto correcto
(capeado, no recalculado), exclusión SAF, forma del INSERT puente.

## Evidence

- `src/features/ventas/hooks/use-ventas.ts` L838-890 (Paso 5: declaración
  `pagoIdsPorPago`, push `null` antes del `continue` L866, push
  `{pagoId, montoUsd}` tras INSERT `pagos` L890) y L1722-1813 (Paso 8: `.entries()`,
  INSERT puente L1804-1811 dentro de `if (bancoId && depositoDirecto && montoUsd>0)`,
  tras `UPDATE bancos_empresa`).
- `src/features/ventas/hooks/__tests__/use-ventas.test.ts` — nuevo `describe` con
  6 tests.
- Verificación independiente de RED: `git stash push -- use-ventas.ts` (manteniendo
  tests) → 4/34 fallaron exactamente como predicho (directo simple, mixto,
  capeado-no-recalc, cap-SAF-a-cero) → `git stash pop` restauró byte-idéntico →
  GREEN 34/34.
- Regresión amplia: `yarn test:run src/features/ventas/hooks src/features/cxc/hooks`
  → 250/250 passed, 10/10 archivos.
- `yarn type-check:test` → 3 errores preexistentes SOLO en
  `producto-form-*.test.tsx`/`use-pwa-update.ts`, cero relación con el cambio.

## Learnings

1. **Monotonicidad del cap SAF confirmada por lectura real de código**:
   `totalAbonadoUsd` solo crece (`.plus`), `totalUsd` es fijo dentro del loop →
   `Decimal.max(0, totalUsd - totalAbonadoUsd)` nunca vuelve a subir una vez en 0.
   Confirma que el orden `[null, válido]` es geométricamente imposible dentro del
   mismo modo SAF — la desviación de `tasks.md` (test usa `[válido, null]`) es
   correcta y no oculta ningún bug real.
2. **SAF-exclusion confirmada estructuralmente**: el INSERT puente de `use-cxc.ts`
   (L752-756) vive DENTRO del `if (!skipBankAndAccounting)` (L691) — el merged path
   de excedente SAF (que llama `aplicarPagoFacturaEnTx(skipBankAndAccounting:true)`)
   salta el bloque ENTERO, cero riesgo de fila duplicada/cruzada.
3. **Gap no-CRITICAL encontrado**: el escenario de spec "Preview de facturas
   afectadas resuelve el origen VENTA" no tiene un test de integración directo
   (`crearVenta` → `previewFacturasAfectadas`). Está cubierto solo por composición:
   `previewFacturasAfectadas` ya es genérico por `ingreso_id`/`pago_id` (su propia
   suite preexistente en `use-preview-facturas-afectadas.test.ts` no distingue
   origen CxC/VENTA) + los tests nuevos prueban que el bridge se crea con los IDs
   correctos. Flagged como WARNING, requiere QA manual en staging.
4. `.atl/.skill-registry.cache.json` y `.atl/skill-registry.md` aparecen
   modificados en `git status` pero son ruido de tooling de sesión
   (skill-registry), no parte del diff de producción de este change.

## Checklist

- [x] Diff scope mínimo confirmado (2 archivos, +317/-6 total)
- [x] Correlación por índice Paso5↔Paso8 probada (RED/GREEN independiente)
- [x] Monto capeado (no recalculado) probado explícitamente
- [x] Exclusión SAF-overflow confirmada estructuralmente (sin test adicional necesario)
- [x] Regresión amplia: 250/250 passed
- [x] `yarn type-check:test`: cero errores nuevos atribuibles al cambio
- [ ] QA manual en staging para el escenario "preview resuelve origen VENTA" (no bloqueante — WARNING, no CRITICAL)

## Outcome

Mergeado como PR #263 (`feat/trazabilidad-pago-en-venta` → `develop`), merge commit
`92fa7a2`. Sin issues CRITICAL. 1 WARNING no bloqueante (QA manual de integración
end-to-end del preview, cubierto por composición de suites existentes).

Siguiente fase: sdd-archive.
