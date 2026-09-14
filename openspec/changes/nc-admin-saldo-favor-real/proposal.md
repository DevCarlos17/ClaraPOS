# Proposal: Nota de Credito administrativa — "Credito a favor" escribe SAFC real

## Intent

En la ruta administrativa de Notas de Credito (`crear-ncr-modal.tsx`, "Facturas emitidas"), el selector "Credito a favor" es cosmetico: `modalidad` esta hardcodeado a `AJUSTE_CXC` sin importar el estado del selector `origenReverso`. Resultado: la deuda de la factura se reduce (clamped a 0) pero **nunca se crea saldo a favor real** — no hay fila `movimientos_cuenta` `tipo='SAFC'`. El cliente pierde visibilidad de un credito que el operador cree haber otorgado, y desaparece de CxC en vez de aparecer con `credito_disponible_usd`.

## Scope

### In Scope
- `crear-ncr-modal.tsx` (linea ~162): mapear `modalidad` real desde `origenReverso` — `CREDITO_A_FAVOR` → `SALDO_FAVOR` (en vez de literal `AJUSTE_CXC`).
- Reescribir los 3 bloques de comentario (lineas ~38-46, ~59-63, ~159-162) que hoy documentan el selector como placeholder "nunca alimenta modalidad".
- `crear-ncr-modal.test.tsx`: actualizar los 3 tests que hoy afirman `modalidad: 'AJUSTE_CXC'` para afirmar `SALDO_FAVOR` (incluye reescribir la premisa del test que dice "el selector es cosmetico").

### Out of Scope
- **Backfill historico**: NCs admin ya emitidas con `AJUSTE_CXC` no se reconstruyen a SAFC. Forward-fix only.
- **"Devolver dinero" (REFUND_TESORERIA)**: sigue `disabled`/"Proximamente" en la UI; el write core sigue lanzando `'aun no esta implementado'` para esa modalidad. No se toca.
- **Issue A (pantalla Clientes)**: el `saldo_actual` neteado mostrando -1.51 en vez de deuda/credito separados es un bug de PANTALLA, no de datos, y vive en `src/features/clientes/**`. Es un change separado.
- Cambios al write core `crearNotaCredito()` en `use-notas-credito.ts` — el branch `SALDO_FAVOR` ya existe, ya esta probado, y funciona igual para `entryPoint: 'TRADICIONAL'` que para `'POS'`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `notas-credito-admin`: el selector "Credito a favor" ahora produce una modalidad real (`SALDO_FAVOR`) en vez de `AJUSTE_CXC` fijo; el requisito de que la NC admin genere credito trazable (fila SAFC) cambia de "no soportado" a "soportado".

## Approach

Wiring puro (Approach 1 de la exploracion). El write core ya tiene el branch generico y probado (`use-notas-credito.test.ts` TRADICIONAL+SALDO_FAVOR, lineas 709-753). Solo se conecta el estado de UI ya existente (`origenReverso`, hoy muerto) al parametro `modalidad` que ya viaja al write core, igual que ya hace `nota-credito-pos-modal.tsx` con su propio selector.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/ventas/components/crear-ncr-modal.tsx` | Modified | Mapeo `origenReverso → modalidad`; comentarios actualizados |
| `src/features/ventas/components/__tests__/crear-ncr-modal.test.tsx` | Modified | 3 assertions `AJUSTE_CXC` → `SALDO_FAVOR`; 1 titulo/premisa reescrito |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mas clientes mostraran `saldo_actual` neteado negativo en pantalla Clientes (Issue A, hoy latente) | High (esperado) | Aceptado explicitamente por el usuario; Issue A queda como follow-up separado, no bloquea este change |
| Regresion en Regla de Oro / gate anti-fraude | Low | Ninguno de los dos chequea `SALDO_FAVOR`+`TRADICIONAL`; probado en `use-notas-credito.test.ts` |
| Test admin queda desalineado con comportamiento real | Low | Las 3 assertions se corrigen en el mismo PR, TDD estricto activo (Vitest) |

## Rollback Plan

Revertir el commit unico (mapeo en `crear-ncr-modal.tsx` + 3 asserts de test). Cero cambios de schema/migracion — no requiere rollback de base de datos. El write core no cambia, asi que ningun otro flujo se ve afectado por el revert.

## Dependencies

Ninguna. El branch `SALDO_FAVOR` del write core y el CHECK constraint de `liquidacion_modalidad` (migracion 0091) ya existen en produccion.

## Success Criteria

- [ ] NC admin con "Credito a favor" seleccionado inserta `movimientos_cuenta` `tipo='SAFC'`, `doc_origen_tipo='NOTA_CREDITO'` (no `tipo='NCR'`)
- [ ] Cliente con ese credito aparece en CxC con `credito_disponible_usd` > 0, sin egreso de caja ni movimiento de sesion/tesoreria
- [ ] Los 3 tests de `crear-ncr-modal.test.tsx` afirman `SALDO_FAVOR` y pasan en verde
- [ ] `use-notas-credito.test.ts` sigue en verde sin modificaciones (prueba que el write core no se toco)
- [ ] "Devolver dinero" sigue `disabled` con "Proximamente"; ningun cambio en su throw de write core
