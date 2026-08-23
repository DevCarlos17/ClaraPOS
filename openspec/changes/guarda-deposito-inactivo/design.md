# Design: Guarda de Depósito Inactivo en el Write-Path de Inventario

## Technical Approach

Replica la filosofía de 2 capas de PR #57 (`deposito-unico-principal`): funciones puras en un nuevo `lib/deposito-inactivo.ts` (testeable sin I/O) + guard fail-fast en cada hook de escritura (capa app, fuente de verdad) + trigger reject-only en `movimientos_inventario` (capa DB, defensa en profundidad). La clave arquitectónica: el fallback de NCR (origen → principal si inactivo) se resuelve **en la app antes de** construir el INSERT, así el trigger nunca rechaza un fallback legítimo — solo dispara ante escrituras crudas que bypasean el hook.

## Architecture Decisions

| # | Decisión | Elegido | Alternativa rechazada | Rationale |
|---|----------|---------|------------------------|-----------|
| 1 | Ubicación lógica pura | Nuevo archivo `src/features/inventario/lib/deposito-inactivo.ts` | Extender `deposito-principal.ts` | Invariante distinta (`is_active` uso-en-caja vs `es_principal` unicidad); mezclar acopla dos conceptos que ya están separados en el código |
| 2 | Datos de transparencia en el listado | 1 query agrupada por `deposito_id` con `EXISTS` correlacionado por sesión abierta, agrupada client-side (mismo patrón que `conteosMap` ya en `deposito-list.tsx`) | N+1 (una query por depósito) | Evita N+1; reutiliza el patrón `useMemo` + `Map` ya establecido en el mismo archivo |
| 3 | UX de reasignación de caja | **Proactiva**: el listado ya carga cajas-por-depósito (requisito 2); el toggle de desactivar revisa ese mapa ANTES de llamar al hook — si hay caja sin sesión abierta, abre `ReasignarCajaDialog` directo; si hay sesión abierta, bloquea con toast (sin diálogo, debe cerrarse la sesión primero) | Reactiva (parsear el mensaje del throw del hook) | El hook sigue teniendo su propio guard fail-fast (defensa en profundidad para callers no-UI), pero la UI feliz nunca debería depender de parsear strings de error |
| 4 | Guard de venta: bloqueo vs fallback | `crearVenta` hace **hard-throw** (bloqueo real, decisión de producto #2); `useDepositoActivoVenta` (solo lectura/stock) trata el depósito de caja inactivo como `null` → cae al principal para mostrar stock | Fallback silencioso también en `crearVenta` | Decisión #2 exige bloqueo explícito en la venta; el hook de lectura no escribe kardex, así que mostrar stock del principal es cosmético y sin riesgo — `crearVenta` re-valida independientemente antes de cualquier escritura |
| 5 | Orden trigger vs fallback NCR | Confirmado: la app SIEMPRE resuelve el depósito activo (origen o principal) antes de construir el INSERT de `movimientos_inventario` — el trigger nunca ve un fallback en tránsito | Trigger que intente detectar "es un fallback" | No hay forma de distinguir intención en el trigger; la garantía debe venir del orden de resolución en la app, documentado explícitamente para que nadie "arregle" el trigger pensando que rechaza fallbacks legítimos |
| 6 | Guard en `abrirSesionCaja` | **No se agrega** (diverge de `proposal.md`) | Bloquear apertura si `cajas.deposito_id` es inactivo | `spec.md` (fuente de verdad, decisiones ya resueltas) no lo incluye entre sus 6 requirements: la decisión #1 (reasignar-antes-de-desactivar) ya hace casi imposible que una caja apunte a un depósito inactivo, y el requisito 3 (guard en venta) es el punto de enforcement real al momento de uso. Se documenta para que no se lea como omisión accidental |

## Data Flow

```
Desactivación:
DepositoList (cajasPorDeposito precargado)
  ├─ caja con sesión ABIERTA → toast bloqueo (cerrar sesión primero)
  ├─ caja SIN sesión, referenciando el depósito → ReasignarCajaDialog
  │     → actualizarCaja(cajaId, {deposito_id: nuevo}) × N → actualizarDeposito(is_active=false)
  └─ sin cajas referenciando → actualizarDeposito(is_active=false) directo
        actualizarDeposito ── (propio pre-check fail-fast, defensa en profundidad) ──→ writeTransaction

Venta:
crearVenta → JOIN sesiones_caja→cajas→depositos (trae is_active)
  ├─ is_active=0 → throw (bloqueo, antes de tocar stock)
  └─ is_active=1 → resolveDepositoEgresoVenta (sin cambios) → writeTransaction (kardex+stock)

NCR (POS-express):
crearNotaCredito → lee venta.deposito_id + su is_active
  → resolveDepositoReingresoNcr(origenId, origenActivo, principalId)
  → INSERT movimiento_inventario hacia el depósito YA resuelto activo
        → [trigger DB: is_active=0 nunca dispara en este camino]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/features/inventario/lib/deposito-inactivo.ts` | Create | Funciones puras: guard de desactivación, agrupación cajas-por-depósito, resolución de reingreso NCR |
| `src/features/inventario/lib/__tests__/deposito-inactivo.test.ts` | Create | Unit tests (Vitest) de las funciones puras |
| `src/features/inventario/hooks/use-depositos.ts` | Modify | `actualizarDeposito`: pre-check fail-fast (sesión abierta / caja referenciando) antes de `writeTransaction` |
| `src/features/inventario/components/depositos/deposito-list.tsx` | Modify | Query agrupada cajas+sesión por depósito; toggle proactivo (dialog o toast bloqueo en vez de llamar directo al hook) |
| `src/features/inventario/components/depositos/reasignar-caja-dialog.tsx` | Create | Diálogo: lista cajas afectadas, selector de depósito destino (activo, `permite_venta=1`, distinto al que se desactiva) por caja |
| `src/features/ventas/hooks/use-ventas.ts:312-350` | Modify | JOIN a `depositos` para traer `is_active` del depósito de la caja; throw si inactivo |
| `src/features/ventas/hooks/use-deposito-activo.ts` | Modify | Trata `is_active=0` del depósito de la caja como `null` antes de llamar `resolveDepositoEgresoVenta` |
| `src/features/ventas/hooks/use-notas-credito.ts:161-282` | Modify | Lee `is_active` del `venta.deposito_id`; aplica `resolveDepositoReingresoNcr` antes del INSERT |
| `migrations/0087_deposito_inactivo_guard.sql` | Create | `CREATE OR REPLACE FUNCTION validate_movimiento_inventario_insert` (añade chequeo `is_active`, mismo estilo idempotente que `0086`) |

## Interfaces / Contracts

```typescript
// deposito-inactivo.ts
export interface CajaReferenciaDeposito {
  cajaId: string
  cajaNombre: string
  tieneSesionAbierta: boolean
}

/** Agrupa filas planas (1 query) en Map<deposito_id, CajaReferenciaDeposito[]> */
export function agruparCajasPorDeposito(
  rows: { deposito_id: string; caja_id: string; caja_nombre: string; tiene_sesion_abierta: number }[]
): Map<string, CajaReferenciaDeposito[]>

export interface BloqueoDesactivacion {
  bloqueado: boolean
  motivo?: 'SESION_ABIERTA' | 'CAJA_SIN_SESION'
  cajas: CajaReferenciaDeposito[]
}

/** Pura: decide si desactivar debe bloquearse y por qué, dado el set de cajas que referencian el depósito */
export function resolveBloqueoDesactivacion(cajas: CajaReferenciaDeposito[]): BloqueoDesactivacion

/** Pura: origen si sigue activo, si no el principal — nunca pregunta al cajero */
export function resolveDepositoReingresoNcr(
  origenDepositoId: string,
  origenIsActive: boolean,
  principalDepositoId: string | null
): string | null
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `resolveBloqueoDesactivacion`, `agruparCajasPorDeposito`, `resolveDepositoReingresoNcr` | Vitest, sin I/O, tabla de casos (mirror `deposito-principal.test.ts`) |
| Unit | Guard de venta (mensaje/throw) | Vitest en `use-ventas.ts` con PowerSync mockeado (patrón existente en `use-ventas` tests) |
| Component (RTL) | `DepositoList` toggle → dialog vs toast; `ReasignarCajaDialog` flujo completo | React Testing Library, mock de `actualizarDeposito`/`actualizarCaja` |
| Manual SQL | Trigger `validate_movimiento_inventario_insert` — INSERT crudo a depósito inactivo (rechaza) vs INSERT ya resuelto a activo (acepta) | No es testeable con Vitest; verificación manual documentada en el archivo de migración, igual que `0086` |

## Migration / Rollout

Cada guard es aditivo (pre-check o `RAISE EXCEPTION`), sin cambios destructivos de schema. El scope combinado (6 archivos de código + 1 migración + 1 componente nuevo) es notablemente mayor que PR #57 (~318 líneas estimadas vs 112 de referencia). Se sugiere que `sdd-tasks` evalúe slicing en 2 PRs encadenados:

- **Slice A — Desactivación + transparencia**: `use-depositos.ts`, `deposito-inactivo.ts` (mitad), `deposito-list.tsx`, `reasignar-caja-dialog.tsx`. Autocontenido, sin tocar ventas/NCR.
- **Slice B — Venta + NCR + DB trigger**: `use-ventas.ts`, `use-deposito-activo.ts`, `use-notas-credito.ts`, migración `0087`. Depende de Slice A solo conceptualmente (mismo lib), no en runtime.

Reversión: quitar el commit del guard correspondiente; el trigger nuevo vive en una migración separada (reversible sin migración inversa, mismo patrón que `0086`).

## Open Questions

Ninguna bloqueante. Nota de diseño: la divergencia del guard en `abrirSesionCaja` (Decisión #6) debe mencionarse explícitamente en `tasks.md` para que no se lea como un olvido durante `sdd-verify`.
