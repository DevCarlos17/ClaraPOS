# Proposal: Desglose Salidas NC por Origen (POS vs Administración) en Cuadre de Caja

## Intent

En el cuadre de caja, "Salidas de Caja" muestra dos cifras que HOY se ven como si pertenecieran a categorías distintas pero son la misma cosa contada dos veces desde ángulos distintos: "Total NC en caja" (lo que el cajero emitió desde el POS) y "Total devoluciones" (dinero que Administración retiró de la caja para reembolsar, modalidad `REFUND_TESORERIA` → destino `SESION_CAJA`). Ambas cifras son correctas — el cuadre no tiene ningún error aritmético — pero la UI no distingue que parte de la salida de NC vino del cajero (POS) y parte vino de una decisión administrativa (Admin), generando confusión al auditar. El usuario pidió una distinción visual por fila + subtotales (Opción B), sin romper el diseño existente.

## Scope

### In Scope
- Extender el SELECT/JOIN ya existente en `use-cuadre.ts` (`movimientos_metodo_cobro` JOIN `notas_credito` ON `origen='NCR' AND doc_origen_id=nc.id`) para traer también `notas_credito.liquidacion_modalidad`.
- Nueva función pura `cuadre-salidas-caja-model.ts`: clasifica cada salida NC como POS o Admin a partir de `liquidacion_modalidad`, y calcula los dos subtotales. Con tests (TDD, `yarn test:run`).
- `cuadre-page.tsx`: dividir el badge rojo único "NC" en dos variantes (`NC` vs `NC · Adm`), reutilizando el patrón de badge ya probado (Tesorería/CxP, L1274-1295) y el patrón de fila subtotal ya probado (`CobranzasCxCTable`, L1389-1392).
- Tests unitarios de la función de clasificación/subtotales.

### Out of Scope
- Migraciones SQL — `liquidacion_modalidad` ya existe y ya distingue POS de Admin.
- Cualquier cambio a la lógica de ESCRITURA en `use-notas-credito.ts` más allá de, si hace falta, leer `liquidacion_modalidad` (ya se escribe hoy, no se toca su valor).
- Recalcular o modificar el arqueo teórico, `egresosUsd`/`egresosBsNativo`, o cualquier total agregado del cuadre.
- Cambios a `notas_credito_admin` / flujo de emisión de NC.
- Módulo Clínica.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `caja`: el cuadre de sesión (`openspec/specs/caja/spec.md`) gana un requerimiento de presentación: las salidas de caja por NC MUST distinguirse visualmente por origen (POS vs Admin) y MUST mostrar subtotal por origen, sin alterar ningún total agregado existente.

## Approach

Clasificar por `notas_credito.liquidacion_modalidad` (dato ya persistido, ya joineable), NO por el string libre de `concepto`. El join ya existe en `use-cuadre.ts`; solo se agrega una columna al SELECT. Una función pura nueva separa la clasificación/aritmética de la presentación (testeable sin DOM). El JSX reutiliza dos patrones ya existentes en el mismo archivo (badge por origen, fila de subtotal), por lo que el cambio visual es aditivo y de bajo riesgo de romper el layout.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/reportes/hooks/use-cuadre.ts` | Modified | Agregar `nc.liquidacion_modalidad` al SELECT existente del JOIN `movimientos_metodo_cobro` ↔ `notas_credito` |
| `src/features/reportes/components/cuadre-salidas-caja-model.ts` | New | Función pura: clasifica POS/Admin desde `liquidacion_modalidad`, calcula subtotales |
| `src/features/reportes/components/cuadre-page.tsx` | Modified | Badge `NC` → `NC`/`NC · Adm` (L1274-1295), filas de subtotal por origen (patrón `CobranzasCxCTable`, L1389-1392) |
| `src/features/reportes/components/__tests__/cuadre-salidas-caja-model.test.ts` | New | Tests TDD de la función de clasificación |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Clasificar por texto de `concepto` en vez de `liquidacion_modalidad` (frágil, se rompe si cambia el copy) | Low | Diseño explícito: clasificar SOLO por `liquidacion_modalidad`; el modelo puro se testea contra los 5 valores de modalidad, no contra strings |
| Romper el invariante `retiros + devolucionesNc + vueltos == total egresos` al introducir el desglose | Low | Invariante SAGRADO declarado abajo; los subtotales son SUMA de las mismas filas ya agregadas, ningún total existente se recalcula ni reemplaza |
| Badge nuevo rompe layout responsive de la tabla | Low | Reutiliza clases Tailwind ya usadas por los badges Tesorería/CxP en la misma tabla |

## Invariante sagrado (display-only)

Ningún total de arqueo/conteo cambia. Igual que el comentario existente en `cuadre-salidas-caja-model.ts` original ("Ningún total... cambia — esto es PURA presentación"): la suma `retiros + devolucionesNc + vueltos == total egresos` se mantiene exacta. El desglose de 2500 en 1500 (POS) + 1000 (Admin) es puramente visual — un re-agrupamiento del mismo dato ya sumado, nunca un recálculo.

## Rollback Plan

Revertir es trivial: los tres archivos modificados/nuevos no tocan escritura ni schema. Revertir el commit restaura el badge único `NC` y el SELECT sin `liquidacion_modalidad` — cero impacto en datos persistidos, cero migración que revertir.

## Dependencies

- `notas_credito.liquidacion_modalidad` (migración 0091) — ya existe y ya distingue POS de `REFUND_TESORERIA`.
- Join `movimientos_metodo_cobro` ↔ `notas_credito` en `use-cuadre.ts` (~L1535) — ya existe.

## Success Criteria

- [ ] La tabla de Salidas de Caja distingue visualmente NC-POS de NC-Admin por fila
- [ ] Se muestran subtotales POS y Admin que suman exactamente el total de NC ya mostrado hoy
- [ ] Ningún total de arqueo/cuadre cambia de valor
- [ ] Clasificación basada en `liquidacion_modalidad`, no en texto de `concepto`
- [ ] Función de clasificación con tests unitarios (TDD, `yarn test:run`)
- [ ] Cambio autocontenible en un solo PR (< 400 líneas)
