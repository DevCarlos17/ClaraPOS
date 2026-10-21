# Verify Report: preview-facturas-afectadas-reverso-tesoreria

Dos verificaciones adversariales independientes de contexto fresco, una por slice. Ambas **PASS WITH WARNINGS**.

## Slice 1a-hook (PR #256, merge commit `6a9501b`)

**Mode**: Strict TDD. **Verdict**: PASS WITH WARNINGS — safe to commit/open as PR #1.

- **Diff scope**: solo 2 archivos nuevos tocan `src/` (`use-preview-facturas-afectadas.ts` + su test). `reverso-modal.tsx` y `reversa-pago-saf.ts` confirmados sin diff.
- **Read-chain**: `movimientos_bancarios_pagos` JOIN `pagos` LEFT JOIN `ventas`, filtro `(p.is_reversed IS NULL OR p.is_reversed = 0)` + `empresa_id`, columnas verificadas 1:1 contra `schema.ts`. Reusa `detectarLoteSafDePago` (de `reversa-pago-saf.ts`) sin modificarlo — confirmado read-only, no reimplementado.
- **Legacy vs zero**: `bridgeRows.length === 0` → `LEGACY` (corto-circuita antes de llamar a `detectarLoteSafDePago`); cualquier conteo >0 → `OK`, incluso si neto 0 facturas.
- **Read-only**: cero `writeTransaction`/INSERT/UPDATE/DELETE en el hook — confirmado por lectura completa de fuente.
- **Multi-tenant**: ambas queries (propia + delegada) filtran `empresa_id`, confirmado por test.
- **Tests**: RED→GREEN reproducido independientemente (removí el archivo del hook, reconfirmé fallo de import, restauré, 6/6 verde). `yarn type-check:test`: 3 errores baseline preexistentes, 0 nuevos. Coverage del archivo nuevo: 100% stmt/line/func, 88.88% branch (1 rama sin cubrir: fallback `nro_factura ?? ''`).
- **Contrato para 1b**: el hook no recibe ni valida `origen` — el gate queda deliberadamente en 1b. Confirmado por `grep`: el hook solo se llama desde su propio test, cero riesgo de uso prematuro en este slice.

**Issues**: CRITICAL: ninguno. WARNING: el escenario de aplicabilidad-por-origen tiene cobertura cero en este slice (deferral esperado, trackeado como obligación de verify de 1b). SUGGESTION: `yarn lint` no ejecutable en el shell de verify (PATH); 1 rama sin cubrir (bajo riesgo); 2 tests assertan sobre SQL crudo (convención ya establecida en el repo, no una deficiencia).

## Slice 1b-panel (PR #257, merge commit `6dfe417`)

**Mode**: Strict TDD. **Verdict**: PASS WITH WARNINGS — safe to commit/open as PR #2 stacked (depende de PR #1 ya mergeado).

- **Diff scope**: solo `reverso-modal.tsx` modificado (+114/-10) + 3 archivos nuevos (1 util, 2 test). `use-conciliacion-tesoreria.ts`, `use-traspasos.ts`, `use-preview-facturas-afectadas.ts`, `reversa-pago-saf.ts` confirmados sin diff.
- **Origen gate (el seguimiento flaggeado por 1a) — reconfirmado explícitamente**: `esTransferenciaCliente(origen) => origen === 'TRANSFERENCIA_CLIENTE'`, única condición que gatea tanto el `useEffect` que llama al hook como el render JSX. La condición vieja rota (`doc_origen_tipo === 'PAGO'`, nunca verdadera en datos reales) confirmada eliminada vía diff línea-por-línea. Test de regresión directo usa `doc_origen_tipo: 'PAGO_CXC'` (el valor real) + `origen: 'TRANSFERENCIA_CLIENTE'` y confirma que el hook SÍ se llama y el panel SÍ se renderiza. **Gate verdict: correctamente implementado, única condición, confirmado con test de regresión dedicado.**
- **Solo lectura (invariante crítico)**: `handleSubmit` (líneas 91-142, llama a `reversarTraspaso`/`reversarMovBancario`/`reversarMovCajaFuerte`) byte-idéntico a la versión pre-1b, fuera de todo hunk del diff. Las únicas adiciones son imports, 2 `useState`, 1 `useEffect` (llama solo al hook read-only de 1a) y un bloque JSX sin `onClick`/elementos de formulario (`panel.querySelector('button')` → null, confirmado por test). **Read-only verdict: sí — el camino de mutación no fue tocado.**
- **4 estados + edge cases**: OK-con-facturas (grupos "Pago directo"/"SAF" distinguidos + total), OK-0-facturas (copy distinto de LEGACY), LEGACY (copy distinto de OK-0), loading, y ausencia total del panel para origen≠TRANSFERENCIA_CLIENTE — los 5 casos cubiertos por 7/7 tests verdes.
- **On-demand, no reactivo**: `useEffect` depende de primitivos (`isOpen, aplicaPreview, movimientoId, empresaId`), no del objeto `movimiento` completo — evita loop de refetch reactivo (anti-patrón PowerSync). Flag `cancelled` en cleanup.
- **Tests**: RED→GREEN reproducido independientemente restaurando la versión pre-1b vía `git show` y re-ejecutando (6/22 tests fallaron como esperado). 26/26 verde tras restaurar. `yarn type-check:test`: 3 errores baseline, 0 nuevos (idénticos a 1a).
- **empresa_id sourcing**: `useCurrentUser()` → `empresaId`, confirmado por test (`toHaveBeenCalledWith('empresa-1', 'mov-1')`).

**Issues**: CRITICAL: ninguno.
**WARNING — W1 (spec/implementation text mismatch, CORREGIDO en este archive)**: el texto literal del spec (`Scenario: Ingreso de lote o consolidación de cierre`) decía "el panel muestra 'no aplica'", pero la implementación renderiza NADA (`{aplicaPreview && (...)}`, sin rama de fallback). Funcionalmente cumple la intención del requirement (no sugiere reversabilidad) y es mejor UX (sin ruido de banner para el caso común), pero era una desviación literal del texto Given/When/Then nunca corregida en el spec. **Resuelto en este archive**: `spec.md` (delta y copia promovida a `openspec/specs/`) corregido para decir "no se renderiza el panel de facturas afectadas (ausencia total, sin texto 'no aplica')", reflejando el comportamiento shipped.
SUGGESTION: `yarn lint` no ejecutable en el shell de verify (misma limitación que 1a); 2 tests assertan sobre argumentos de mock en vez de comportamiento puro (necesario para probar que `empresaId`/`movimientoId` llegan al hook, consistente con convención de 1a).

## Veredicto combinado

**PASS WITH WARNINGS** en ambos slices. Cero CRITICAL en todo el change. El único WARNING funcional real (ausencia de gate defensivo por `origen` dentro del propio hook) fue cerrado explícitamente por 1b con un test de regresión dedicado. El único WARNING restante (W1, spec vs. implementación) es documentación/cosmético y se corrigió en este mismo archive, antes de promover el spec a `openspec/specs/`.
