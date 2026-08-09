# Proposal: Líneas de cargo (Material de Empaque / Flete) en Factura de Compra

## Intent

Las facturas de proveedor con frecuencia incluyen cargos de "material de empaque" (bolsas, cajas) y "flete/transporte" que hoy no tienen dónde registrarse en la factura de compra. El usuario los anota aparte o los ignora, perdiendo trazabilidad contable y afectando el total real de la compra. Se necesita inyectar estos cargos como líneas especiales dentro del formulario de compra existente, sin tocar la lógica de producto (inventario, kardex, PVP, lotes) que ya funciona correctamente.

## Scope

### In Scope
- 2 botones en `compra-form.tsx`: "+ Material de empaque" y "+ Flete", que agregan líneas de cargo no-producto.
- Múltiples líneas por concepto (cajeras repiten la línea de "bolsa" en vez de usar cantidad — comportamiento real a soportar).
- Cada línea de cargo: monto en la moneda ya seleccionada en el formulario + IVA por dropdown limitado a 0% o 16%.
- Los montos de cargo se suman al total de la factura (incluyendo su IVA).
- Al procesar: se CONSOLIDA por concepto → exactamente 1 registro `gastos` para empaque (suma de bases + suma de IVA de todas sus líneas) y 1 para flete. Si un concepto mezcla líneas con IVA 0% y 16%, se suman bases e IVA por separado antes de consolidar.
- Validación: no se puede procesar la factura si hay una línea de cargo incompleta (el usuario debe completarla o eliminarla).
- Nueva migración: clave `MATERIAL_EMPAQUE` en `cuentas_config` (cuenta `6.1.16` ya existe), nueva cuenta `6.1.25 FLETES Y TRANSPORTE DE MERCANCIA` en `plan_cuentas` + clave `FLETE_COMPRA`, con backfill idempotente a empresas existentes (patrón de migración `0066`).

### Out of Scope
- Formulario de Gasto standalone (`gasto-form.tsx` / `crearGasto`): el empaque/flete que cobra el proveedor vive naturalmente en su factura de compra, no en gastos manuales. Decisión de usuario, congelada.
- Refactor de la lógica de producto en `compra-form.tsx` (PVP, lotes, unidades, kardex): se agrega capacidad en paralelo, no se toca lo existente.
- Nuevo mecanismo de tasa de cambio: los cargos usan la tasa ya fotografiada de la factura de compra.
- Remapeo del módulo de contabilidad hacia cuentas de costo para estos cargos (queda como trabajo futuro, fuera de este cambio).
- IVA libre/otros porcentajes distintos de 0%/16% en líneas de cargo.

## Capabilities

### New Capabilities
- `compra-lineas-cargo`: Inyección de líneas especiales no-producto (material de empaque, flete) en la factura de compra, con consolidación por concepto hacia `gastos` al procesar.

### Modified Capabilities
None — no existe spec previa de facturación de compras en `openspec/specs/`; el cambio es aditivo sobre el formulario existente sin alterar comportamiento documentado.

## Approach

Seguir el patrón ya usado en `inventario/ajustes` (motivos MERMA/EXTRAVIO) en vez de reusar `crearGasto()`:
1. Zod: extender `compra-schema.ts` con una unión discriminada — línea de producto (como hoy, `producto_id` UUID requerido) vs. línea de cargo (`tipo: 'EMPAQUE'|'FLETE'`, `monto`, `porcentaje_iva` enum 0|16).
2. UI: agregar botones + lista de líneas de cargo en `compra-form.tsx`, sumando sus montos/IVA al total ya calculado, sin tocar el loop de líneas de producto.
3. `crearCompra()` en `use-compras.ts`: dentro de la MISMA `db.writeTransaction` (PowerSync no permite tx anidada — no se puede llamar `crearGasto()`), agregar los montos de cargo al bucketing de `totalBaseUsd`/`totalIvaUsd`, y tras el insert de `facturas_compra` + líneas, resolver cuenta por clave (`SELECT cuenta_contable_id FROM cuentas_config WHERE empresa_id = ? AND clave = ?`) y hacer `tx.execute('INSERT INTO gastos ...')` crudo — uno por concepto consolidado, `doc_origen_id = compraId`, `doc_origen_tipo = 'FACTURA_COMPRA'`.
4. Migración nueva: seed de cuenta `6.1.25` + claves `MATERIAL_EMPAQUE`/`FLETE_COMPRA`, backfill `ON CONFLICT DO NOTHING` a empresas existentes.
5. `CLAVES_CONFIG` en `use-cuentas-config.ts`: agregar las 2 claves nuevas para que aparezcan en la UI de Configuración.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `migrations/00XX_seed_material_empaque_flete_cuentas.sql` | New | Cuenta `6.1.25`, claves `MATERIAL_EMPAQUE`/`FLETE_COMPRA`, backfill empresas |
| `src/features/inventario/schemas/compra-schema.ts` | Modified | Unión discriminada línea-producto / línea-cargo |
| `src/features/inventario/components/compras/compra-form.tsx` | Modified | Botones + UI de líneas de cargo, fold en total/IVA |
| `src/features/inventario/hooks/use-compras.ts` | Modified | `crearCompra()`: bucketing de cargos + INSERT crudo consolidado en `gastos` dentro de la tx |
| `src/features/contabilidad/hooks/use-cuentas-config.ts` | Modified | `CLAVES_CONFIG`: agregar `MATERIAL_EMPAQUE`, `FLETE_COMPRA` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PowerSync no permite `writeTransaction` anidada | Low (ya identificado) | Usar INSERT crudo `tx.execute` dentro de la tx existente de `crearCompra`, no llamar `crearGasto()` — patrón ya validado en `use-ajustes.ts` |
| Consolidación incorrecta al mezclar IVA 0%/16% en el mismo concepto | Medium | Sumar bases e IVA por separado antes de crear el registro `gastos`; cubrir con test unitario del cálculo |
| `compra-form.tsx` es un archivo grande (2421 líneas) — riesgo de acoplar la nueva UI a la lógica de producto | Medium | Mantener el estado de líneas de cargo en un array separado, sin tocar `LineaUI`/`pvp_niveles` |
| Migración de cuenta nueva no aplicada en producción antes de deploy del frontend | Low | Migración es prerrequisito documentado, con backfill idempotente (`ON CONFLICT DO NOTHING`) |

## Rollback Plan

Frontend: revertir el commit/PR restaura `compra-form.tsx`/`use-compras.ts`/`compra-schema.ts` a su estado previo; las líneas de cargo dejan de estar disponibles en la UI, sin afectar facturas de compra existentes (no se migran datos históricos). Migración de BD: es aditiva (nueva cuenta + nuevas claves de config), no destructiva — no requiere rollback salvo eliminar la cuenta/claves si nunca se usan, lo cual es seguro porque no hay FKs históricas apuntando a ellas antes de este cambio.

## Dependencies

- Migración de cuentas (`6.1.25` + claves) debe aplicarse en Supabase antes de que el frontend haga el primer `crearCompra()` con líneas de cargo.

## Success Criteria

- [ ] Se puede agregar N líneas de "Material de empaque" y N de "Flete" en una factura de compra, cada una con monto + IVA (0%/16%).
- [ ] El total de la factura incluye correctamente los cargos + su IVA.
- [ ] Al procesar, se crean exactamente 1 `gastos` por concepto presente (empaque y/o flete), consolidando bases e IVA de todas sus líneas.
- [ ] No se puede procesar con una línea de cargo incompleta.
- [ ] La lógica de producto (inventario, kardex, PVP, lotes) permanece sin cambios de comportamiento.
- [ ] Los registros `gastos` generados respetan `empresa_id`, tasa de la factura, y no violan inmutabilidad financiera.
