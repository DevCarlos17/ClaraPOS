# Proposal: pos-tesoreria-integration

_Date: 2026-07-05 | Model: anthropic/claude-sonnet-4-6_

---

## Intent

Conectar los modales de gestión de efectivo del POS con el módulo de Tesorería mediante operaciones atómicas con trazabilidad formal: eliminar la pestaña Banco del avance de efectivo, habilitar traspasos bidireccionales POS↔Caja Fuerte con comprobante de tránsito pendiente, y recordar al cajero depositar el efectivo a Tesorería al cerrar la sesión.

---

## Scope

### In Scope

- Eliminar pestaña **Banco** de `avance-modal.tsx` (banco como origen no aplica — el avance siempre es efectivo)
- Agregar botón **"Traspaso a Tesorería"** en `ingreso-retiro-modal.tsx` solo en modo RETIRO: crea un EGRESO en `movimientos_metodo_cobro` + un registro PENDIENTE en `mov_caja_fuerte` de la caja fuerte de la moneda correspondiente, en una sola `db.writeTransaction()`
- Agregar botón **"Enviar efectivo a caja"** en el módulo de Tesorería: el operador selecciona una sesión de caja activa (muestra usuario, caja, fecha) → crea EGRESO en `mov_caja_fuerte` + INGRESO en `movimientos_metodo_cobro` con origen `INGRESO_TESORERIA` visible en el cuadre
- Mensaje informativo al cierre de sesión: "Recordá depositar el efectivo a la cuenta de Tesorería correspondiente" (sin bloquear el flujo)
- Migración: columna `sesion_caja_id TEXT` nullable en `traspasos_tesoreria`; soporte de `SESION_CAJA` como valor en `cuenta_origen_tipo` / `cuenta_destino_tipo`
- Actualizar `useSaldoSesionCaja` para incluir el origen `INGRESO_TESORERIA` en el cálculo de ingresos manuales

### Out of Scope

- Conciliación automática de registros PENDIENTE en `mov_caja_fuerte` (se validan manualmente desde Tesorería)
- Botón de traspaso en modal **Ingreso** (si la cajera recibe dinero lo ingresa normal)
- Cambios en `prestamo-modal.tsx` — pestaña Banco se mantiene (préstamo por transferencia bancaria es válido)
- Módulo Clínica y cualquier funcionalidad fuera de Caja/Tesorería
- Infraestructura de testing (no existe en el proyecto)

---

## Capabilities

> Specs existentes en `openspec/specs/`: `caja/spec.md` (SAF) y `prestamos/spec.md`. Ninguna cubre traspasos POS↔Tesorería.

### New Capabilities

- `pos-tesoreria-traspasos`: Traspaso atómico desde la sesión de caja hacia Tesorería (RETIRO en sesión + registro PENDIENTE en caja fuerte), con vínculo formal en `traspasos_tesoreria` extendido
- `tesoreria-envio-caja`: Tesorería puede enviar efectivo a una sesión de caja activa seleccionada (egreso en caja fuerte + ingreso en sesión con origen `INGRESO_TESORERIA` identificable en el cuadre)

### Modified Capabilities

- `caja`: `useSaldoSesionCaja` incluye el origen `INGRESO_TESORERIA` en los ingresos; cierre de sesión muestra mensaje informativo de depósito a Tesorería

---

## Approach

**Opción A — extender `traspasos_tesoreria`** (recomendada por la exploración):

Agregar columna `sesion_caja_id TEXT` nullable a `traspasos_tesoreria` y habilitar `SESION_CAJA` como valor en `cuenta_origen_tipo`/`cuenta_destino_tipo`. Esto permite registrar el vínculo como un traspaso formal que aparece en la lista de tesorería con referencia a la sesión.

Nueva función `crearTraspasoSesionATesoreria(params)` que ejecuta en una `db.writeTransaction()`:
1. `INSERT` en `movimientos_metodo_cobro` (origen `EGRESO_TESORERIA` en la sesión)
2. `INSERT` en `mov_caja_fuerte` (tipo `INGRESO`, `validado=0` como comprobante de tránsito)
3. `INSERT` en `traspasos_tesoreria` con `cuenta_origen_tipo='SESION_CAJA'`, `sesion_caja_id` de la sesión activa

Para el flujo inverso (Tesorería → Caja), la misma función en modo espejo:
1. `INSERT` en `mov_caja_fuerte` (tipo `EGRESO`)
2. `INSERT` en `movimientos_metodo_cobro` (origen `INGRESO_TESORERIA`)
3. `INSERT` en `traspasos_tesoreria` con `cuenta_destino_tipo='SESION_CAJA'`

Los registros `mov_caja_fuerte` con `validado=0` actúan como comprobante de dinero en tránsito. Se validan manualmente desde Tesorería actualizando solo el campo `validado` (sin editar monto — inmutabilidad preservada).

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/caja/components/avance-modal.tsx` | Modified | Eliminar tab BANCO |
| `src/features/caja/components/ingreso-retiro-modal.tsx` | Modified | Agregar botón "Traspaso a Tesorería" (solo modo RETIRO) + prop `cuentas?: CuentaTesoreria[]` |
| `src/features/caja/hooks/use-saldo-sesion-caja.ts` | Modified | Incluir origen `INGRESO_TESORERIA` en el cálculo de ingresos |
| `src/features/caja/components/cierre-sesion-modal.tsx` | Modified | Mensaje informativo post-cierre sobre depósito a Tesorería |
| `src/features/tesoreria/hooks/use-traspasos.ts` | Modified | Nueva función `crearTraspasoSesionATesoreria()`; actualizar `reversarTraspaso()` para soportar tipo `SESION_CAJA` |
| `src/features/tesoreria/components/` | New | Modal selector de sesión activa + botón "Enviar efectivo a caja" |
| `src/core/db/powersync/schema.ts` | Modified | Agregar `sesion_caja_id: column.text` a `traspasos_tesoreria` |
| `migrations/` | New | `ALTER TABLE traspasos_tesoreria ADD COLUMN sesion_caja_id TEXT` |
| `powersync-sync-rules.yaml` | Check | Verificar que la nueva columna está cubierta por `SELECT *` |
| `src/routes/_app/ventas/` (pos-terminal) | Modified | Pasar `cuentas` de Tesorería a `IngresoRetiroModal` |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `reversarTraspaso()` asume solo `BANCO`/`CAJA_FUERTE` — rompe con `SESION_CAJA` | High | Actualizar `reversarTraspaso()` como parte del scope antes de deploy |
| `useSaldoSesionCaja` no incluye `INGRESO_TESORERIA` → balance de cuadre incorrecto | Medium | Incluido en scope; verificar en test manual del cuadre |
| Migración nullable afecta todos los tenants | Low | Columna `TEXT` nullable sin `DEFAULT` — 100% compatible con filas existentes |
| `powersync-sync-rules.yaml` usa `SELECT` específico y no incluye nueva columna | Low | Auditar sync rules como parte del paso de migración |

---

## Rollback Plan

- **Schema**: `sesion_caja_id` es nullable — revertir con `ALTER TABLE traspasos_tesoreria DROP COLUMN sesion_caja_id` si no hay filas con el nuevo tipo creadas
- **Frontend**: todos los cambios están confinados a `features/caja` y `features/tesoreria` — `git revert` de los archivos afectados sin efectos secundarios en otros módulos
- **Eliminación de tab Banco en Avance**: puro UI — reversible con un commit de un solo archivo

---

## Dependencies

- `useCuentasTesoreria()` ya disponible en `pos-terminal.tsx` — solo propagar como prop a `IngresoRetiroModal`
- `useSesionesActivas()` o equivalente — verificar si existe en `features/caja/hooks/`; si no, crear una query simple sobre `sesiones_caja WHERE status='ABIERTA'`

---

## Success Criteria

- [ ] Pestaña Banco no aparece en `AvanceModal`
- [ ] Al ejecutar un RETIRO con "Traspaso a Tesorería", aparece un registro `validado=0` en `mov_caja_fuerte` de la caja fuerte de la moneda correspondiente
- [ ] Desde Tesorería se puede enviar efectivo a una sesión de caja activa; la cajera ve el ingreso marcado como `INGRESO_TESORERIA` en el cuadre
- [ ] `useSaldoSesionCaja` refleja correctamente los ingresos provenientes de Tesorería
- [ ] El cierre de sesión muestra el mensaje recordatorio de depósito a Tesorería
- [ ] Todas las queries nuevas filtran por `empresa_id` — aislamiento multi-tenant garantizado
- [ ] Las operaciones son atómicas: si falla cualquier INSERT, toda la transacción revierte

---

## Estimated Effort

**M (Medio)** — ~5 archivos frontend modificados, 1 archivo nuevo (modal selector de sesión), 1 función nueva en hooks de Tesorería, 1 migración additive. Sin infrastructure de testing. El riesgo principal (`reversarTraspaso`) requiere atención antes de cualquier deploy parcial.
