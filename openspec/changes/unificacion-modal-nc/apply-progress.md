# Apply Progress — unificacion-modal-nc

Chain: feature-branch-chain, slice a slice. Tracker: `feat/unificacion-modal-nc` (desde develop).

## Slice 1 — Extraer `TipoNcSelector` (Total/Parcial) — COMPLETO

- **Rama**: `feat/unificacion-modal-nc-pr1-tiponc`
- **Qué**: Extraccion verbatim del bloque "Tipo de NC" (Total/Parcial), que estaba duplicado byte-a-byte entre `crear-ncr-modal.tsx` y `nota-credito-pos-modal.tsx`, a un componente presentacional puro `tipo-nc-selector.tsx`.
- **Props**: `{ tipoNc: 'TOTAL'|'PARCIAL'|null, onChange, puedeTotal }`. Sin `entryPoint` (el bloque es identico en ambos, no depende del contexto). Sin logica de negocio.
- **Archivos**:
  - `src/features/ventas/components/tipo-nc-selector.tsx` (nuevo)
  - `src/features/ventas/components/__tests__/tipo-nc-selector.test.tsx` (nuevo)
  - `src/features/ventas/components/crear-ncr-modal.tsx` (usa `<TipoNcSelector>`, bloque inline eliminado)
  - `src/features/ventas/components/nota-credito-pos-modal.tsx` (idem)
- **Tests**: 90/90 en los 3 archivos (tipo-nc-selector + crear-ncr-modal + nota-credito-pos-modal). Los tests existentes de AMBOS modales pasan SIN adaptacion -> la extraccion es behavior-preserving.
- **Verificacion**: `yarn test:run src/features/ventas/components/__tests__/{tipo-nc-selector,crear-ncr-modal,nota-credito-pos-modal}.test.tsx`

## Pendiente

- **Slice 2**: reorden Parcial (SeleccionLineasNc justo debajo de Total/Parcial) en AMBOS modales.
- **Slice 3**: compartir seccion NC-info al POS (Devolver dinero/Credito a favor + OrigenReversoSelector + resolverModalidadDesdeOrigen) [ALTO riesgo].
- **Slice 4**: RefundTesoreriaForm al POS con restriccion de origen (sesion propia + Tesoreria PIN C) [ALTO riesgo].
- **Slice 5**: cleanup (remover select "Modalidad de liquidacion" del POS).
