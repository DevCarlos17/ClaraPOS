# Design: Fix race condition en creacion automatica de cuentas de comision de banco

## Technical Approach

Reemplazar la lectura por closure de los hooks reactivos PowerSync
(`useGrupoComisionesBancarias`/`useGrupoComisionesPasarela`) dentro de
`crearCuentasDelBanco` por una funcion pura `resolverGrupoPorClaveConfig`
que ejecuta la MISMA query via `db.execute` directo — mismo patron
imperativo que ya usa la rama PRINCIPAL (nunca falla) y que ya probo
`bancoTieneActividadEnSesionAbierta` (`banco-actividad-sesion.ts`) para
lookups testeables sin PowerSync/Worker. Los hooks reactivos NO se tocan
(siguen usandose en `deducciones-editor.tsx` para dropdowns en vivo).

## Architecture Decisions

### Decision: Nueva funcion pura en `contabilidad/lib`, no reusar el hook

| Opcion | Tradeoff | Decision |
|---|---|---|
| Refactorizar `useGrupoPorClaveConfig` para delegar en una funcion pura compartida | DRY, pero toca codigo reactivo que funciona hoy (riesgo innecesario) | Rechazada |
| Nueva funcion standalone, SQL duplicado (idéntico, 1 query) | Duplica 6 lineas de SQL | **Elegida** — cero riesgo sobre hooks existentes, sigue el patron ya validado de `banco-actividad-sesion.ts` |

### Decision: Validar los grupos de comision ANTES de crear la cuenta PRINCIPAL (fail-fast, reordena sin modificar la logica interna de la rama principal)

**Hallazgo durante el diseño**: si la resolucion de comision se valida
DESPUES de `opts.crearActivo` (orden actual del codigo) y lanza error, la
cuenta de ACTIVO ya fue insertada (su propio `db.execute`, sin
transaccion compartida con el resto) — quedaria **huerfana** en
`plan_cuentas` (un banco fallido dejaria basura contable).

**Choice**: mover la resolucion de `GRUPO_COMISIONES_BANCARIAS`/`GRUPO_COMISIONES_PASARELA`
(cuando `opts` las pide) al INICIO de `crearCuentasDelBanco`, antes del
bloque `if (opts.crearActivo)`. Si falta un grupo requerido, se lanza
`Error` de inmediato — nada se inserta todavia.
**Alternativas consideradas**: (a) dejar el orden actual y aceptar el
riesgo de huerfano (rechazada — contradice regla de integridad
financiera del proyecto); (b) envolver toda la funcion en una
`writeTransaction` compartida (rechazada — cada sub-operacion
(`crearCuenta`, `agregarSubcuentaAGrupo`, `createBanco`/`updateBanco`) ya
abre su propia `writeTransaction` independiente; unificarlas es un
refactor mayor fuera del presupuesto de este cambio).
**Rationale**: no modifica una sola linea de la logica interna de la
rama principal (`db.execute`, generacion de codigo, etc.) — solo cambia
CUANDO se ejecuta relativo a la validacion. Cumple la restriccion "no
tocar la rama principal" en su sentido literal (su código no cambia).

### Decision: Fallo de resolucion = error visible que ABORTA la operacion completa (fail-closed), no solo un log

**Choice**: `resolverGrupoPorClaveConfig` retorna `null` (no lanza) —
es una funcion de lookup pura. Es `crearCuentasDelBanco` quien decide
lanzar `Error` si `opts` pidio esa cuenta y el grupo es `null`. El error
sube por la promesa hasta el `try/catch` que YA existe en cada uno de
los 3 call-sites (`handleCrearCuentaContable`, `handleSubmit` create,
`handleSubmit` edit) → `toast.error(message)` (no dismissable por
defecto en Sonner error, a diferencia de `toast.warning` que se
autodescartaba). Se elimina `avisarComisionesOmitidas` y los campos
`comisionBancariaOmitida`/`comisionPasarelaOmitida` (dead code).

**Alternativas consideradas**: mantener el flag `omitida` y solo cambiar
`toast.warning`→`toast.error` sin abortar (permite guardar el banco con
FK NULL) — rechazada porque perpetua el estado invalido que el propio
codigo ya documenta como tal ("un banco sin las 3 cuentas es un estado
invalido del sistema", comentario linea 795-797 de banco-form.tsx).

**⚠️ OPEN QUESTION (impacto en flujo de EDICION, no solo creacion)**:
en el branch de EDICION (linea 751-779), el backfill de comision para
bancos LEGACY con FK ya NULL hoy es "no bloqueante" (el banco se
actualiza igual aunque la comision no se resuelva). Con fail-closed
uniforme, un banco legacy roto bloqueara CUALQUIER edicion (incluso
cambiar el titular) hasta que se arregle `cuentas_config`. Esto excede
el bug de la creacion (race condition) y toca una decision de negocio:
¿bloquear ediciones de bancos legacy hasta reparar la config contable,
o mantener la edicion no-bloqueante y solo hacer el error visible sin
abortar el guardado, ÚNICAMENTE para el branch de edicion? Recomiendo
fail-closed uniforme (consistente con "estado invalido nunca se
persiste"), pero es una decision de negocio — **flageado para
confirmacion del mantenedor antes de implementar**, no se asume en el
codigo hasta confirmar.

## Interfaces / Contracts

Nuevo archivo `src/features/contabilidad/lib/grupo-por-clave-config.ts`:

```ts
export interface EjecutorSql {
  execute: (sql: string, params: unknown[]) =>
    Promise<{ rows?: { item: (i: number) => unknown; length: number } }>
}

export interface GrupoCuenta { id: string; codigo: string; nivel: number }

export async function resolverGrupoPorClaveConfig(
  ejecutor: EjecutorSql,
  clave: string,
  empresaId: string
): Promise<GrupoCuenta | null> {
  const result = await ejecutor.execute(
    `SELECT pc.id AS id, pc.codigo AS codigo, pc.nivel AS nivel
     FROM cuentas_config cc
     JOIN plan_cuentas pc ON pc.id = cc.cuenta_contable_id
     WHERE cc.empresa_id = ? AND cc.clave = ?
     LIMIT 1`,
    [empresaId, clave]
  )
  if (!result.rows || result.rows.length === 0) return null
  return result.rows.item(0) as GrupoCuenta
}
```

Query IDENTICA a `useGrupoPorClaveConfig` (`use-plan-cuentas.ts:132-147`),
solo cambia `undefined`→`null` como sentinel de "no resuelto".

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `src/features/contabilidad/lib/grupo-por-clave-config.ts` | Create | Lookup puro, testeable con `EjecutorSql` mock (patron `banco-actividad-sesion.ts`) |
| `src/features/contabilidad/lib/__tests__/grupo-por-clave-config.test.ts` | Create | Tests unitarios (ver abajo) |
| `src/features/configuracion/components/banco-form.tsx` | Modify | Quitar import/uso de `useGrupoComisionesBancarias`/`useGrupoComisionesPasarela` (líneas 27-28, 239-240); reordenar `crearCuentasDelBanco` (líneas ~504-632) para resolver grupos ANTES del bloque `crearActivo` y lanzar `Error` si falta uno requerido; eliminar `comisionBancariaOmitida`/`comisionPasarelaOmitida` del tipo de retorno; eliminar `avisarComisionesOmitidas` (líneas 639-662) y sus 3 llamadas (líneas ~707, ~778, ~825) |

No se toca `use-plan-cuentas.ts` (hooks reactivos intactos) ni la rama
`opts.crearActivo` interna.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (RED first) | `resolverGrupoPorClaveConfig`: clave resuelve → `GrupoCuenta`; clave inexistente en `cuentas_config` → `null`; aislamiento multi-tenant (empresa A nunca recibe el grupo de empresa B — verificar `params` incluyen `empresaId` correcto, mismo patron de `use-bancos.test.ts:33-40`) | `EjecutorSql` mockeado (`vi.fn()`), sin PowerSync/Worker |
| Unit | `crearCuentasDelBanco` lanza `Error` visible cuando `resolverGrupoPorClaveConfig` retorna `null` para una clave requerida por `opts`, y NO ejecuta `crearCuenta` (cuenta principal) antes de validar | Mock de `db.execute` a nivel de módulo (patrón `use-payment-methods.test.ts`) |
| Component/Integration (fuera de este PR, verify) | Los 3 call-sites muestran `toast.error` (no `toast.warning`) y no persisten banco/edicion cuando falta un grupo | Manual QA + revisión en fase `sdd-verify` |

## Migration / Rollout

No migration required. Cambio puramente frontend, `git revert` seguro.

## Changed-Lines Forecast

~40 (nuevo lib) + ~50 (test nuevo) + ~60 tocadas en `banco-form.tsx`
(remueve ~35 de dead code: `avisarComisionesOmitidas` + flags omitida +
3 call-sites; agrega ~25 de resolucion fail-fast) ≈ **150 líneas de
diff total**, muy por debajo del presupuesto de revisión (400).

## Open Questions

- [ ] **Bloqueante de negocio**: ¿el branch de EDICION debe bloquear el
  guardado completo del banco cuando el backfill de comision falla
  (fail-closed, mi recomendación), o debe permitir guardar el resto de
  cambios y solo mostrar el error (no-bloqueante, comportamiento actual
  para bancos legacy)? Ver decisión arriba — necesito confirmación antes
  de implementar ese branch específico.
