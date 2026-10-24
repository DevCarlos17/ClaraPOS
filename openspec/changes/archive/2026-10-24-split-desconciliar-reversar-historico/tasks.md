# Tasks: Separar "Desconciliar" de "Reversar" en Histórico de Tesorería

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230-300 (2 hooks + 2 archivos de test NUEVOS para hooks + 2 archivos de componente/test reescritos) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Hooks (desconciliarMov*/desvalidarTraspaso) + UI split (2 botones) + reescritura de tests existentes | PR 1 (single) | Espejo invertido de código ya shippeado, cero riesgo de diseño; no amerita chaining |

## Phase 1: Hook Functions — RED

- [x] 1.1 Crear `src/features/tesoreria/hooks/__tests__/use-conciliacion-tesoreria.test.ts` (archivo nuevo, mock `@/core/db/powersync/db` con `writeTransaction`/`tx.execute`, patrón de `use-reverso-abono-directo.test.ts`). Tests `desconciliarMovBancario`: flip `validado` 1→0 + `validado_por`/`validado_at`→NULL; guard `validado===0`→throw "ya está desconciliado"; guard `reversado===1`→throw; SELECT y UPDATE filtran `empresa_id`.
- [x] 1.2 Mismo archivo: tests espejo para `desconciliarMovCajaFuerte` sobre `mov_caja_fuerte`.
- [x] 1.3 Crear `src/features/tesoreria/hooks/__tests__/use-traspasos.test.ts` (archivo nuevo). Tests `desvalidarTraspaso`: ambos lados (origen+destino) a `validado=0`/`NULL` en una única `tx`; branch `BANCO`→`movimientos_bancarios`, else→`mov_caja_fuerte`; skip cuando `cuenta_*_tipo==='SESION_CAJA'`; guard `reversado===1`→throw; SELECT filtra `empresa_id`.
- [x] 1.4 `yarn test:run` sobre ambos archivos nuevos — confirmar RED (funciones no existen todavía). Resultado: 12/12 failed con `is not a function`, como esperado.

## Phase 2: Hook Functions — GREEN

- [x] 2.1 `use-conciliacion-tesoreria.ts`: implementar `desconciliarMovBancario(movimientoId, empresaId)` — mirror invertido de `validarMovBancario` (L23-43), `UPDATE ... SET validado=0, validado_por=NULL, validado_at=NULL WHERE id=? AND empresa_id=?`.
- [x] 2.2 Mismo archivo: `desconciliarMovCajaFuerte(movimientoId, empresaId)` — mirror invertido de `validarMovCajaFuerte` (L47-67) sobre `mov_caja_fuerte`.
- [x] 2.3 `use-traspasos.ts`: implementar `desvalidarTraspaso(traspasoId, empresaId)` — mirror invertido de `validarTraspaso` (L986-1032): mismo SELECT+branch+skip SESION_CAJA, sin `userId`, `validado=0`/`validado_por`/`validado_at`→NULL en ambos UPDATE, todo en un único `db.writeTransaction`.
- [x] 2.4 `yarn test:run` (los 2 archivos nuevos) + `yarn type-check:test` — verde (12/12 passed). `yarn type-check` resultó pre-existente roto a nivel de proyecto (no excluye tests del tsconfig de producción) — ver nota en Phase 5.3.

## Phase 3: UI Wiring — RED

- [x] 3.1 `movimientos-table.tsx`: agregar `onDesconciliar?: (id: string) => void` a `MovimientoTableRow` (junto a `onReversar`, L17-31).
- [x] 3.2 Reescribir `movimientos-table.test.tsx`: los 5 tests existentes (L29-78) que afirman que el click en **"Desconciliar"** invoca `onReversar` → renombrar aserciones a **"Reversar"** (mismo guard `validado=1 && reversado=0 && origen==='TRANSFERENCIA_CLIENTE'`, mismo `onReversar`).
- [x] 3.3 Mismo archivo: agregar tests nuevos para el botón **"Desconciliar"** (origin-agnóstico): visible con cualquier `origen` (incl. `'TRASPASO'`) cuando `validado=1 && reversado=0`; oculto si `validado=0`; oculto si `reversado=1`; click invoca `onDesconciliar(id)` sin tocar `onReversar`.
- [x] 3.4 Reescribir `conciliacion-tesoreria.test.tsx`: el test `click en "Desconciliar" abre ReversoModal` (L203-212) → renombrar a `click en "Reversar" abre ReversoModal`, botón `{ name: 'Reversar' }`. Agregar `desvalidarTraspaso: vi.fn()` al mock de `use-traspasos` (L41-48) y `desconciliarMovBancario: vi.fn()`, `desconciliarMovCajaFuerte: vi.fn()` al mock de `use-conciliacion-tesoreria` (L50-55).
- [x] 3.5 Mismo archivo: test nuevo — click en **"Desconciliar"** (Histórico) llama `desconciliarMovBancario` con el id correcto y **no** abre `ReversoModal` (`queryByTestId('mock-reverso-modal')` null).
- [x] 3.6 `yarn test:run` sobre ambos archivos de componente — confirmar RED. Resultado: `movimientos-table.test.tsx` 5 failed/8 passed; `conciliacion-tesoreria.test.tsx` 1 failed/2 passed (como esperado — el rename de "Reversar" ya pasaba por el wiring previo, solo faltaba el flip puro de "Desconciliar").

## Phase 4: UI Wiring — GREEN

- [x] 4.1 `movimientos-table.tsx` `HistoricoRow` (L391-401): renombrar el botón existente de `"Desconciliar"` a `"Reversar"` — guard y `onReversar` sin cambios.
- [x] 4.2 Mismo bloque: agregar botón nuevo `"Desconciliar"` — guard `isValidado && !isReversado && mov.onDesconciliar` (sin filtro de `origen`), `onClick={() => mov.onDesconciliar!(mov.id)}`.
- [x] 4.3 `conciliacion-tesoreria.tsx`: renombrar `handleDesconciliarMov` (L339-363) → `handleReversarHistorico`, cuerpo intacto.
- [x] 4.4 Mismo archivo: nuevo `handleDesconciliarHistorico(id)` — resuelve `mov` vía `selectedCuenta.tipo` sobre `historicoBancoResult`/`historicoCajaResult`; si `mov.origen==='TRASPASO'` → `findTraspasoByMovId` + `desvalidarTraspaso`; si no → `desconciliarMovBancario`/`desconciliarMovCajaFuerte` según `selectedCuenta.tipo`; `toast.success`/`toast.error`, sin tocar estado de modal.
- [x] 4.5 `toMovRow` (L63-83): agregar 4to parámetro posicional `onDesconciliar?: (id: string) => void`, incluirlo en el objeto retornado.
- [x] 4.6 `historicoMovRows` (L391-393): `toMovRow(mov, undefined, handleReversarHistorico, handleDesconciliarHistorico)`.
- [x] 4.7 `yarn test:run` + `yarn type-check:test` — todo verde (16/16 en los 2 archivos de componente). `yarn type-check` sigue con el mismo roto pre-existente (no relacionado a este cambio).

## Phase 5: Regresión + Suite Completa

- [x] 5.1 Confirmar que `PendienteRow`/`"Rechazar"` (`handleReversarMov`, guard `!isReversado`) no cambia — verificado por el test de regresión ya presente en `movimientos-table.test.tsx` y `conciliacion-tesoreria.test.tsx`, sin tocar código de producción de Pendientes. 70/70 tests pasando en `src/features/tesoreria` (incl. `reverso-modal.test.tsx` sin tocar, 13/13).
- [x] 5.2 `yarn test:run` (suite completa) — `2430 passed`, 3 failed (línea de resultado leída antes de cualquier crash de salida). Los 3 fallos son pre-existentes y no relacionados (`cliente-detalle.test.tsx`, `cxc-list.test.tsx` — texto duplicado / rol "dialog" ausente / `Worker is not defined`, módulos clientes/cxc nunca tocados por este cambio).
- [x] 5.3 `yarn type-check:test` — 0 errores nuevos; 3 errores pre-existentes sin relación (`producto-form-aviso-borrador.test.tsx`, `producto-form-edit-open-mask.test.tsx`, `use-pwa-update.ts`), idénticos a baseline antes de este cambio. (No se usó `yarn lint`.) Nota: `yarn type-check` (tsc de producción) resultó estar roto a nivel de proyecto — no excluye archivos `*.test.ts(x)` de su tsconfig y por lo tanto falla con "Cannot find name 'vi'/'describe'/'expect'" en CUALQUIER test del repo (confirmado en archivos nunca tocados como `src/lib/__tests__/format.test.ts`), pre-existente y fuera de scope de este cambio.
