# Proposal: Guarda de Depósito Inactivo en el Write-Path de Inventario

## Intent

QA post-merge de PR #57 (`deposito-unico-principal`) encontró que `is_active` en `depositos` es casi decorativo: nada en el write-path de ventas, apertura de caja, desactivación de depósito o notas de crédito verifica que el depósito destino/origen siga activo. Un depósito marcado "Inactivo" puede seguir recibiendo y emitiendo kardex/stock en silencio, rompiendo la garantía implícita del badge Activo/Inactivo y ensuciando futuras conciliaciones por depósito.

## Scope

### In Scope
- Bloquear `crearVenta` cuando el depósito de egreso (resuelto vía `sesiones_caja → cajas.deposito_id`) está inactivo (Finding 2, severidad alta).
- Bloquear `actualizarDeposito` cuando el depósito a desactivar está referenciado por una `sesión de caja` ABIERTA.
- Bloquear `abrirSesionCaja` cuando `cajas.deposito_id` apunta a un depósito inactivo.
- Guardar el mismo invariante en `crearNotaCredito` cuando `venta.deposito_id` (destino de reingreso) está inactivo (Finding 3, severidad media).
- Preservar la lógica ya correcta de "devolución al depósito de origen" en NCR — no se toca ese diseño, solo se le agrega el guard.

### Out of Scope
- Finding 1 (checkbox `es_principal` no bloqueado con 2+ depósitos) — es un gap de UX puro, sin riesgo de integridad; se resuelve como fix directo, fuera de este change.
- Reasignar `cajas.deposito_id` a un depósito inactivo vía configuración de cajas (gap adyacente no explorado).
- Cambios al modelo `es_principal` — ya cubiertos por `deposito-principal-unico`.

## Capabilities

### New Capabilities
- `deposito-inactivo-guard`: un depósito con `is_active=0` no puede recibir ni emitir movimientos de inventario (venta, apertura de caja, NCR), y no puede desactivarse mientras está en uso por una sesión de caja abierta.

### Modified Capabilities
- None.

## Approach

Replicar la filosofía de 2 capas usada en `deposito-principal-unico`: guard fail-fast en el hook (capa de aplicación, antes de `writeTransaction`) como primera línea, más un guard opcional a nivel DB (trigger en `movimientos_inventario`) como defensa en profundidad. La capa de aplicación cubre los 4 puntos de entrada identificados (venta, apertura de caja, desactivación de depósito, NCR); la capa DB (si se aprueba) actúa como red de seguridad ante escrituras crudas o bypass del hook.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/ventas/hooks/use-ventas.ts:312-325` | Modified | `crearVenta` valida `is_active=1` del depósito resuelto antes de descontar stock |
| `src/features/inventario/hooks/use-depositos.ts` | Modified | `actualizarDeposito` valida que no haya sesión de caja ABIERTA referenciando el depósito a desactivar |
| `src/features/caja/hooks/use-sesiones-caja.ts:605-649` | Modified | `abrirSesionCaja` valida `is_active=1` del depósito de la caja |
| `src/features/ventas/hooks/use-notas-credito.ts:161-282` | Modified | `crearNotaCredito` valida `is_active=1` de `venta.deposito_id` antes de reingresar stock |
| `src/features/ventas/hooks/use-deposito-activo.ts` | Modified | Alinear hook read-only con el mismo filtro `is_active` |
| `migrations/` (nueva migración) | New (opcional, pendiente decisión) | Trigger `validate_movimiento_inventario_insert` extendido con chequeo `is_active`, si se aprueba defensa en profundidad |

## Open Product Decisions

> Estas 4 decisiones deben resolverse ANTES de sdd-spec — no se asumen aquí.

1. **Desactivar depósito con sesión de caja abierta**: ¿bloquear siempre, o permitir si no hay sesión abierta? (Recomendado: bloquear mientras exista sesión abierta referenciándolo.)
2. **Venta con depósito de caja inactivo**: ¿bloquear la venta (hard-block), o hacer fallback al depósito principal con advertencia? (Decisión UX cara al cajero.)
3. **NCR con depósito de origen inactivo**: ¿bloquear la NCR forzando decisión explícita, permitir con advertencia, o fallback al principal? El kardex es inmutable — una vez escrito no se puede deshacer.
4. **Guard a nivel DB (trigger)**: ¿agregar defensa en profundidad en `validate_movimiento_inventario_insert`, espejando la filosofía de 2 capas de PR #57, o el guard de aplicación es suficiente para este caso?

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bloquear ventas por depósito inactivo interrumpe operación en vivo del cajero | Medium | Definir decisión #2 antes de implementar; mensaje de error claro y accionable |
| Guard en NCR bloquea devoluciones legítimas si el depósito fue desactivado por error | Low | Mensaje debe guiar a reactivar el depósito o resolver el fallback (decisión #3) |
| Trigger DB duplica lógica de la capa de aplicación y diverge con el tiempo | Low | Si se aprueba, mantener ambas capas con el mismo criterio (`is_active=1`), igual que `deposito-principal-unico` |

## Rollback Plan

Cada guard es un chequeo aditivo (pre-check antes de `writeTransaction` o `RAISE EXCEPTION` en trigger) sin cambios de schema destructivos. Revertir = quitar el commit del guard correspondiente; no requiere migración inversa si el trigger nuevo se implementa en una migración separada y reversible.

## Dependencies

- Depende de las decisiones de producto (#1-#4) resueltas antes de `sdd-spec`.
- Depende de PR #57 (`deposito-unico-principal`, ya mergeado) que introdujo el modelo `es_principal`/`is_active` sobre el que este change opera.

## Success Criteria

- [ ] Un depósito inactivo no puede recibir ni emitir stock vía venta, NCR o apertura de caja
- [ ] Un depósito no puede desactivarse mientras una sesión de caja abierta lo referencia
- [ ] Las 4 decisiones de producto quedan resueltas y documentadas en el spec/design resultante
- [ ] Tests cubren los 4 puntos de entrada bloqueados
