# Proposal: Gestion Clientes — Estado de Cuenta funcional + saldo reconciliado

## Intent

"Gestion Clientes" (estado de cuenta) tiene dos bugs confirmados en runtime: (1) el panel muestra "Ultimos 5 de 1 movimientos" pero la tabla pinta "Sin movimientos" — la data llega, el render falla; (2) el saldo mostrado debe reconciliar con CxC sin recomputar nada (ambos ya leen fuentes correctas, solo falta que Gestion Clientes pinte lo que ya tiene).

## Scope

### In Scope
- Fix render bug: la tabla de movimientos debe pintar las filas que la query de `useMovimientosClienteFiltrados` ya trae (mismatch entre variable de conteo y variable de map, y/o filtro Desde/Hasta vacio descartando filas).
- Estado de cuenta ordenado cronologicamente (`fecha`/`created_at`/`rowid`), columnas tipo/referencia/monto/saldo posterior (`saldo_nuevo` de la fila).
- Vista default: mes actual; soporta rango via Desde/Hasta + "Generar reporte" (UI ya existente).
- Saldo de cliente = `cliente.saldo_actual` leido tal cual (O(1), sin recompute), con signo correcto para saldo a favor (verde, negativo).
- Multi-tenant: agregar `empresa_id` al query de saldo en `cliente-detalle.tsx:290-293`.
- `TIPO_LABELS` completado para `SAFC`/`SAL` (cosmetico, mismo archivo).

### Out of Scope (deferred — follow-up SDD change)
- Drill-down contextual (click factura -> abonos vinculados; NC -> factura afectada; abono -> FIFO vs especifica; SAF -> aplicado o no).
- Optimizacion de performance de CxC (N subconsultas por fila).
- Error de sync `errores_contabilidad — Sin permiso para guardar este registro` al facturar (sospecha RLS/permisos) — issue separado.
- Rediseño del guard de desactivacion de cliente (`saldo_actual != 0`) — sigue valido segun Decision 6 de `cxc-saldo-favor-modelo`.

## Capabilities

### New Capabilities
- `gestion-clientes-estado-cuenta`: estado de cuenta cronologico (kardex de cliente) con saldo por fila y saldo actual reconciliado, read-only.

### Modified Capabilities
- None. No se toca ninguna spec existente de `openspec/specs/` (ninguna cubre hoy Gestion Clientes/CxC).

## Approach

Leer, nunca recalcular:
- **Decision A**: el kardex lee `saldo_anterior`/`saldo_nuevo` de cada fila de `movimientos_cuenta` (ya snapshot por fila). No reconstruye sumando historial (O(n), no escala).
- **Decision B**: el saldo corrido de cada fila viene de `saldo_nuevo` de esa misma fila, nunca de una resta hecha en frontend. Garantiza coincidencia con `cliente.saldo_actual` y con CxC.
- **Decision C**: el estado de cuenta es READ-ONLY. No aplica pagos, no reversa movimientos, no escribe saldo. Invariante del modulo.
- **Decision D**: CxC (deuda vs SAF por factura) y Gestion Clientes (saldo neto corrido por fecha) son dos lentes correctas y simultaneas del mismo ledger open-item (patron SAP/QuickBooks), no una contradiccion a "arreglar".

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/clientes/components/cliente-detalle.tsx` | Modified | Fix render de tabla; filtro `empresa_id` en query de saldo; `TIPO_LABELS` completo |
| `src/features/clientes/hooks/use-clientes.ts` | Read-only verify | `useMovimientosClienteFiltrados`/`useCountMovimientosCliente` — confirmar contrato consumido correctamente por el componente |
| `src/features/cxc/**` | Not touched | Fuente de verdad ya correcta; no modificar |
| 6 write-sites de `saldo_actual` + trigger Postgres | Not touched | Fuera de alcance por diseño |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|--------------|
| Tocar el render rompe el filtro de fecha existente | Low | Cubrir con caso "sin filtro" y "con rango" en verify |
| Confundir Decision D como bug y "arreglarla" en el futuro | Med | Documentada explicitamente aqui y en design.md |
| Cambio de `empresa_id` filter rompe query de saldo para clientes legacy | Low | `id` ya es PK unica; agregar filtro es aditivo, no cambia resultado hoy |

## Rollback Plan

Cambios acotados a `cliente-detalle.tsx` (+ verificacion de hook existente, sin cambios de escritura ni de schema). Revert via `git revert` del commit del cambio; no hay migraciones ni datos mutados.

## Dependencies

- Ninguna migracion SQL. Ninguna dependencia de `cxc-saldo-favor-modelo` (change independiente, ya deployado).

## Success Criteria

- [ ] Facturar a credito y ver la fila reflejada de inmediato en Estado de Cuenta (sin refresh manual).
- [ ] Saldo mostrado en Gestion Clientes coincide con `cliente.saldo_actual`, con signo/color correcto para SAF.
- [ ] Query de saldo filtra por `empresa_id`.
- [ ] CxC sigue funcionando sin cambios (regression check).
