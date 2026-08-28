# Proposal: Consolidar a Tesorería el monto REPORTADO (no el de sistema) para métodos por-lote

## Intent

En `cerrarSesionCaja`, la rama "sin lotes" del cierre (métodos por-lote: EFECTIVO y bancarios con `deposito_directo=0`) envía siempre `totalSistemaD` a Tesorería, ignorando el monto que el cajero contó físicamente. Si hay faltante/sobrante, Tesorería recibe el monto "que debería haber" según el sistema, no lo que realmente se entregó/depositó — inconsistente con el diseño declarado por el mantenedor y con `sesiones_caja_detalle.diferencia`, que se calcula pero nunca se usa aguas abajo.

## Problem (grounded)

`src/features/caja/hooks/use-sesiones-caja.ts:1259` — `consolidarMetodoATesoreriaEnTx({ ..., monto: toStorageString(totalSistemaD), ... })`. El monto contado (`conteoFisicoPorMetodo`/`totalFisicoNativo`, calculado en L900-908 e insertado en `sesiones_caja_detalle.total_fisico` en L921) se usa solo como snapshot de reporte y nunca vuelve a leerse (confirmado L923-1307).

## Business Contract (confirmed by maintainer)

- **DIRECTOS** (`deposito_directo=1`): ya viajan a Tesorería en cada venta. Sin cambios. El campo "Conteo Físico" que el usuario llena para directos en el cuadre es solo guía visual para el cuadre — nunca viaja.
- **POR-LOTE** (`deposito_directo=0`, incluye EFECTIVO y débito/punto): no viajan en venta, se acumulan por sesión. Al cierre, el monto que el cajero ENTRA en el input de conteo físico es lo que debe viajar a Tesorería — no `totalSistemaD`.
- Ejemplo canónico: sistema muestra Bs 1000 en débito pero el punto falló → batch real Bs 0 → cajero entra 0 → Tesorería recibe 0. El cierre detecta faltante de Bs 1000 (lógica de faltante/cuadre YA funciona, no se toca).
- Fallback: se envía el monto reportado tal cual llega en `conteoFisicoPorMetodo`; si un método no tiene entrada, NO se hace fallback silencioso a `totalSistemaD` (reintroduciría el bug). Se trata como monto reportado ausente/0 según lo que la UI ya captura — este caso se detalla en specs.

## Scope

### In Scope
- Cambiar el monto consolidado en la rama sin-lotes (L1251-1269) de `totalSistemaD` a `totalFisicoNativo`/`conteoFisicoPorMetodo` para métodos por-lote.
- Extraer la decisión como función pura testeable (precedente: `consolidacion-cierre.ts`, `deducciones-cierre.ts`), ej. `resolverMontoConsolidacion({ totalSistemaD, totalFisicoReportado })`.

### Out of Scope
- Reconciliación histórica: sesiones cerradas desde 22-jul-2026 (PR2, `bba3b2d`/`4f65cb5`) con diferencia de caja pueden tener el monto sistema en Tesorería en vez del físico. Requiere auditoría/autorización de negocio — se deja como riesgo conocido.
- Botón "rechazar" en pendientes de Tesorería (mecanismo ya existe, wiring pendiente) — futuro.
- Lógica de faltante/cuadre (ya funciona, no se toca).
- Rama con lotes POS (L1209-1250) — ya usa monto reportado (suma de lotes), sin cambios.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tesoreria-consolidacion-cierre`: Requirement "Routing per payment method" — para métodos por-lote sin lotes POS, el monto ruteado cambia de `totalSistemaD` a `totalFisicoReportado`.

## Approach

Reutilizar `totalFisicoNativo` ya calculado en el primer loop (L900-908), propagarlo al `Map` `consolidacionPorMetodo`/`metodosParaConsolidar` junto a `totalSistemaD`, y en la rama sin-lotes (L1251-1269) sustituir el monto por una función pura `resolverMontoConsolidacion` que decide entre sistema/reportado sin fallback silencioso. No se toca la firma de `consolidarMetodoATesoreriaEnTx` (compartida con traspaso manual POS→Tesorería) ni la detección de diferencia/faltante.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/caja/hooks/use-sesiones-caja.ts` | Modified | L1251-1269 usa monto reportado; propagar `totalFisicoNativo` al Map de consolidación |
| `src/features/caja/lib/resolucion-monto-consolidacion.ts` (nuevo) | New | Función pura, testeada con Vitest, precedente `consolidacion-cierre.ts` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exposición histórica de reconciliación mayor a lo estimado | Med | Documentar como fuera de alcance; recomendar auditoría de `sesiones_caja_detalle.diferencia <> 0` por separado |
| Precisión decimal en el nuevo monto (dinero) | Low | Reusar `Decimal`/`toStorageString`, mismos patrones que el código existente |
| Caso borde: método usado pero sin input de conteo renderizado | Low | Cubrir explícitamente en specs/tests; sin fallback silencioso |

## Rollback Plan

Revertir el commit único que cambia L1251-1269 y remueve la función pura nueva; `consolidarMetodoATesoreriaEnTx` no cambia de firma, por lo que el revert es directo sin efectos en llamadores existentes.

## Dependencies

Ninguna. Precedente de patrón: `consolidacion-cierre.ts`, `deducciones-cierre.ts`.

## Success Criteria

- [ ] Métodos por-lote consolidan el monto reportado por el cajero, no `totalSistemaD`.
- [ ] Directos y rama con lotes POS sin cambios de comportamiento (no-regresión).
- [ ] Función pura nueva con cobertura de tests (incl. faltante/sobrante y ausencia de conteo).
- [ ] Diff proporcionado, muy por debajo de 400 líneas.
