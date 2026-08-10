# Proposal: Base Imponible como Costo Real en Gastos y Compras

## Intent

`gastos.monto_usd` guarda base+IVA para TODA la tabla (gastos manuales y cargos de empaque/flete de compras). Eso infla el costo/gasto real de la empresa con un impuesto que no es costo. El tester confirmó: un flete de $1 + 16% IVA registra $1.16 en `gastos` cuando debe registrar $1 (la base). Los reportes de gastos/compras deben leer la BASE IMPONIBLE como costo, con IVA como columna de impuesto y Total como desembolso global (Decisión Opción B, obs Engram #1350).

## Scope

### In Scope
- Corregir el INSERT de gasto por cargo (empaque/flete) para que `monto_usd`/`monto_bs` reflejen la BASE (no base+IVA); `base_imponible_usd`/`monto_iva_usd` ya se guardan bien.
- Actualizar reportes/dashboard de gastos (`gasto-reportes.tsx`, `gastos-dashboard.tsx`, ~19 sitios) para presentar Base | IVA | Total, leyendo `base_imponible_usd` como costo y `monto_iva_usd` como impuesto. Esto también cambia el significado del total reportado de gastos manuales (intencional: la base es el costo real).
- Corregir el desglose en pantalla de `compra-form.tsx` (~línea 440) para incluir `lineasCargo` (hoy solo suma productos, aunque el total general sí incluye cargos).
- Agregar columnas Base / IVA en `compra-list.tsx` junto a Total (dato ya existe en `facturas_compra.total_base_usd`/`total_iva_usd`).
- Garantizar consistencia de escritura: todo path que crea un `gastos` (manual `crearGasto`, cargo empaque/flete) puebla base+IVA+total de forma coherente.

### Out of Scope
- Migración/fallback de datos históricos: ninguna empresa tiene datos reales; usuarios saben que gastos está en desarrollo. Solo importa la corrección hacia adelante.
- Almacenamiento de IVA por alícuota detallado (no existe hoy; requeriría schema nuevo).
- Módulo de asientos contables (`libro_contable`, `generarAsientosCompra`) — pausado, se deja como está.
- No modifica ni reabre PR #17 (`compra-empaque-flete`); rama nueva desde `develop`.

## Capabilities

### New Capabilities
- `gastos-costeo-base-iva`: Toda escritura y lectura de `gastos` (manual o por cargo de compra) presenta y reporta Base (costo real), IVA (impuesto) y Total (desembolso) de forma consistente.

### Modified Capabilities
- None. `compra-lineas-cargo` (spec pendiente, PR #17 sin archivar) no exige `monto_usd = total`; este cambio ajusta implementación, no su contrato.

## Approach

Cambiar el valor escrito en `monto_usd`/`monto_bs` para cargos de compra de `dTotal` a `dBase` (dato de IVA ya existe separado). Migrar los ~19 sitios de lectura en reportes/dashboard de gastos a leer `base_imponible_usd` (costo) + `monto_iva_usd` (impuesto), mostrando Total (`monto_usd` recalculado o base+iva) aparte. Extender el desglose de `compra-form.tsx` para iterar también `lineasCargo`. Agregar columnas Base/IVA a `compra-list.tsx` desde datos ya existentes en `facturas_compra`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/inventario/hooks/use-compras.ts:861` | Modified | `monto_usd` del gasto-cargo pasa de `dTotal` a `dBase` |
| `src/features/inventario/hooks/use-gastos.ts:218` | Modified | Verificar consistencia base/iva/total en `crearGasto` |
| `src/features/contabilidad/components/gasto-reportes.tsx` | Modified | Leer base_imponible_usd + monto_iva_usd, desglose Base/IVA/Total |
| `src/features/contabilidad/components/gastos-dashboard.tsx` | Modified | Ídem, ~19 sitios de lectura de `monto_usd` |
| `src/features/inventario/components/compras/compra-form.tsx:436-477` | Modified | Desglose incluye `lineasCargo` |
| `src/features/inventario/components/compras/compra-list.tsx:169-216` | Modified | Nuevas columnas Base / IVA |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `monto_usd` es semánticamente compartido por toda la tabla `gastos`; cambiar su lectura afecta totales de gastos manuales, no solo cargos de compra | High | Es intencional (decisión Opción B): base = costo real siempre. Comunicar en changelog/tasks. |
| ~19 sitios de lectura en reportes/dashboard — omitir uno deja un total inconsistente | Med | Grep exhaustivo de `monto_usd` en `gasto-reportes.tsx`/`gastos-dashboard.tsx` antes de dar por cerrado; checklist en tasks.md |
| Conflicto futuro con PR #17 (compra-lineas-cargo) al mergear ambas ramas | Low | Cambio aislado a `use-compras.ts:861` (una línea) + capas de lectura; sin tocar consolidación de líneas de cargo |

## Rollback Plan

Revertir el commit del cambio de valor en `use-compras.ts:861` (vuelve a escribir `dTotal`) y revertir los reads de reportes/dashboard a `monto_usd`. Sin migración de datos de por medio (no hay históricos reales), el rollback es limpio a nivel de código.

## Dependencies

- Ninguna externa. Depende conceptualmente de que `base_imponible_usd`/`monto_iva_usd` ya existan y se guarden bien en cargos (confirmado en exploración, obs #1348).

## Success Criteria

- [ ] Gasto de cargo (empaque/flete) con base $1 + IVA 16% registra `monto_usd = 1.00` (no 1.16)
- [ ] Reportes/dashboard de gastos muestran Base | IVA | Total y los tres cuadran con las filas subyacentes
- [ ] Desglose en pantalla de `compra-form.tsx` incluye el IVA de `lineasCargo`
- [ ] `compra-list.tsx` muestra columnas Base y IVA junto a Total
- [ ] Módulo de contabilidad (asientos) permanece sin tocar
