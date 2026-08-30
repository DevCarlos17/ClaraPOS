# Proposal: Fix race condition en creacion automatica de cuentas de comision de banco

## Intent

Al crear/editar un banco, la cuenta contable PRINCIPAL siempre se crea (usa `db.execute` directo), pero las dos cuentas de COMISION (bancaria y pasarela) dependen de hooks reactivos PowerSync (`useGrupoComisionesBancarias`/`useGrupoComisionesPasarela` via `useGrupoPorClaveConfig`) capturados por closure en `crearCuentasDelBanco`. Si el usuario hace click antes de que esos `useQuery` resuelvan, los valores llegan `undefined`, la rama de comision setea `comisionOmitida=true` y omite la creacion en silencio (solo un `toast.warning` descartable). Resultado: bancos guardados con `cuenta_gasto_comision_id` / `cuenta_gasto_pasarela_id` en `NULL`.

CONFIRMADO con evidencia de DB real (empresa `f0aba92c`): `cuentas_config` -> `plan_cuentas` esta sano (grupos padre `6.2.06.01` y `6.1.25.01` existen y activos), y ese mismo grupo padre ya tiene 7 cuentas de comision auto-creadas correctamente. Esto descarta la hipotesis de seed/datos rotos — es una race condition intermitente del front, no un problema de datos.

## Scope

### In Scope
- Extraer `resolverGrupoPorClaveConfig(ejecutor, clave, empresaId)`: lookup DIRECTO (`db.execute`, mismo patron imperativo que la rama principal que nunca falla), reemplazando el uso del hook reactivo por closure dentro de `crearCuentasDelBanco`.
- Aplicar el fix a los 3 call-sites que comparten `crearCuentasDelBanco` (crear banco, editar banco, boton manual "Crear Cuenta").
- Convertir el fallo silencioso (`comisionOmitida` + `toast.warning` descartable) en un error visible y explicito.
- Empresa_id se pasa explicitamente a `resolverGrupoPorClaveConfig` (no se infiere de estado ambiente) para mantener el aislamiento multi-tenant.

### Out of Scope
- Backfill historico de bancos ya guardados con comision `NULL` (ej. BANCO TEST 3, id `03c55344`, EMPRESATEST 1). El flujo de edicion ya intenta auto-completar al reabrir/guardar, por lo que aplicar este fix + reabrir cada banco afectado puede auto-sanarlos sin necesidad de un script de migracion. Se documenta como seguimiento, no se construye ahora.
- Confiabilidad del seed de bootstrap de empresa (`register-owner` no valida errores de RPC). Concern separado — los datos estan sanos en empresas reales; no se mezcla con este fix.
- Los hooks reactivos (`useGrupoPorClaveConfig` y derivados) siguen existiendo y se usan legitimamente en otros lugares (ej. dropdowns en vivo). No se tocan.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `banco-form` (creacion/edicion de bancos): la creacion de cuentas contables de comision deja de depender de un hook reactivo con race condition y pasa a resolverse via lookup directo sincronico; el fallo deja de ser silencioso.

## Approach

1. Crear funcion pura `resolverGrupoPorClaveConfig(ejecutor: EjecutorSql, clave: string, empresaId: string)` en `use-plan-cuentas.ts` (o modulo hermano), reutilizando el patron `EjecutorSql` ya usado en `banco-actividad-sesion.ts` para queries testeables sin PowerSync/Worker.
2. En `crearCuentasDelBanco` (banco-form.tsx ~614-628), reemplazar la lectura de `grupoComisionesBancarias`/`grupoComisionesPasarela` (capturados por closure de hooks reactivos) por una llamada directa a `resolverGrupoPorClaveConfig` con el `empresaId` explicito del banco.
3. Si el grupo no se resuelve, lanzar/propagar un error visible (no un `toast.warning` descartable) para que el usuario sepa que la cuenta de comision no se creo.
4. No tocar la rama de la cuenta PRINCIPAL (ya usa `db.execute` directo y funciona).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/features/configuracion/bancos/banco-form.tsx` | Modified | Reemplaza dependencia de hooks reactivos por lookup directo en `crearCuentasDelBanco`; error visible en vez de warning silencioso |
| `src/features/contabilidad/hooks/use-plan-cuentas.ts` (o modulo equivalente) | Modified | Nueva funcion pura `resolverGrupoPorClaveConfig(ejecutor, clave, empresaId)` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Romper la rama de cuenta PRINCIPAL al refactorizar cerca | Low | No se toca esa rama; tests cubren ambas rutas por separado |
| Nuevo error visible genera ruido en flujos legitimos (ej. grupo config realmente ausente en empresa nueva) | Low | Mensaje de error claro y accionable; comportamiento ya era un fallo, solo se hace visible |
| Regresion en los 3 call-sites (crear/editar/boton manual) si alguno no se actualiza | Medium | Los 3 comparten `crearCuentasDelBanco`; un solo cambio los cubre; test por cada entrypoint |

## Rollback Plan

Revertir el commit del fix restaura el uso de los hooks reactivos y el `toast.warning` silencioso (comportamiento previo, con el bug conocido). No hay migraciones de datos involucradas — es un cambio puramente de codigo frontend, revertible con `git revert`.

## Dependencies

- Ninguna dependencia externa nueva. Reutiliza el patron `EjecutorSql` ya existente en `banco-actividad-sesion.ts`.

## Success Criteria

- [ ] Crear un banco nuevo genera SIEMPRE las 3 cuentas contables (principal + comision bancaria + comision pasarela) sin importar el timing de carga de PowerSync.
- [ ] Si el grupo de comision no existe/no resuelve, el usuario ve un error explicito (no un warning descartable) y sabe que debe corregirlo.
- [ ] Los 3 call-sites (crear, editar, boton manual) usan el mismo lookup directo y pasan tests unitarios con `EjecutorSql` mock.
- [ ] Diff total dentro del presupuesto de revision (~40-70 lineas, muy por debajo de 400) — se entrega en un solo PR.
