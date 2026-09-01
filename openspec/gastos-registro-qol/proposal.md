
# Proposal: gastos-registro-qol

_Date: 2026-07-28 | Model: anthropic/claude-sonnet-5_

---

## Intent

ClaraPOS ya lleva un "registro contable" de gastos (no contabilidad real), pero hoy tiene dos bloqueos de diseño que impiden que ventas − costos − gastos = utilidad se vea reflejado correctamente a fin de mes:

1. **`metodos_cobro.comision_pct` es una sola columna NUMERIC** — solo admite un porcentaje de deducción por método de pago. No alcanza para casos reales: tarjetas de crédito tienen retención ISLR (5% típico) además de la comisión bancaria, y un mismo método puede tener múltiples conceptos de descuento del banco.
2. **`cuentas_config` mapea UNA clave global (`COMISION_BANCARIA`) a UNA sola cuenta contable por empresa.** No hay forma de tener una cuenta de comisiones distinta por banco — todas las comisiones de todos los bancos caen en el mismo lugar, y la vinculación banco → cuenta contable de activo (1.1.xx) sigue siendo 100% manual (`handleCrearCuentaContable` en `banco-form.tsx`).

Esto es exactamente lo que `task.md` (input original del usuario) pide resolver: que al crear un banco, el sistema cree automáticamente su cuenta de comisión bancaria vinculada dentro del grupo Gastos Financieros, sin que el usuario promedio (que "no sabe nada de contabilidad") tenga que configurar nada manualmente. El usuario es explícito: **"no estamos haciendo contabilidad como tal"** y **"no reinventar la rueda"** — esta propuesta es un registro QoL, reutilizando helpers y patrones ya existentes.

**Nota relacionada (YA RESUELTA, fuera de este alcance):** el error reportado por el usuario ("error al registrar la comisión bancaria" al cerrar con métodos PUNTO) tenía dos causas raíz, ambas ya corregidas en el Paso 1 (bugfixes previos a este cambio SDD):
- `useTasaDelDia` (`use-cuadre.ts`) usaba `AVG` del día y apuntaba a columnas inexistentes (`tasa`/`created_at` en vez de `valor`/`fecha`), devolviendo 0 — corregido en commits `db0417b` y `1e3a603` (ahora usa la última tasa vigente registrada).
- `FormCierre` (`sesion-caja-form.tsx`) no pasaba `tasaDelDia` al cierre rápido del cajero — corregido en commit `4fc9808` (ahora usa `useTasaActual()`).

No queda deuda pendiente por este lado: el cierre con comisión en Bs ya no falla por falta de tasa. Esto **desbloquea** la validación end-to-end del Slice 4.

---

## Scope

### In Scope

**Slice 1 — Seed + estructura (migración 0080 + limpieza manual):**
- Modelo de 3 niveles en el seed: `Gastos Financieros (grupo) → Comisiones Bancarias (subgrupo) → Comisión Banco XXXX (cuenta de registro, leaf)`.
- Nueva tabla `metodo_cobro_deducciones` (empresa_id, metodo_cobro_id, concepto/nombre, porcentaje, cuenta_gasto_id, tipo, created_at...) — reemplaza `metodos_cobro.comision_pct`.
- Columna de vínculo banco ↔ cuenta de comisión (en `bancos_empresa`).
- Migración 0080 = **solo estructura**, sin DELETE destructivo.
- Script de limpieza SEPARADO, one-time, patrón `cleanup_*.sql`, ejecutado manualmente tras `pg_dump` de respaldo.

**Slice 2 — Banco auto-crea cuentas:**
- Al crear/editar un banco, auto-crear su cuenta de activo (1.1.xx, hoy manual) **y** su cuenta de gasto de comisión bajo el subgrupo Comisiones Bancarias, auto-vinculadas.
- UI en `banco-form.tsx` para ver/seleccionar la cuenta de comisión vinculada.

**Slice 3 — Métodos de pago, N conceptos:**
- UI para gestionar N deducciones por método (reusa patrones de formularios existentes).
- Defaults por tipo de método: PUNTO → 2 slots al 0%; transferencia/otros bancarios → 1 slot; tarjetas de crédito → ISLR 5% por defecto.
- Todos los métodos bancarios permiten agregar más conceptos manualmente (nombre + % + cuenta de gasto existente o nueva).

**Slice 4 — Cierre + Tesorería:**
- El cierre detecta el banco de cada método de pago seleccionado, itera `metodo_cobro_deducciones` (loop sobre N conceptos, reemplaza el único `comision_pct` en `use-sesiones-caja.ts` ~L1138-1179) y registra cada deducción en la cuenta de comisión del banco correspondiente.
- Los registros de comisión siguen apareciendo en Tesorería (sin cambios en esa visibilidad).

### Out of Scope (Non-Goals)

- **No es contabilidad real**: sin partida doble formal más allá de lo que ya existe (`libro_contable` como bitácora), sin conciliación fiscal.
- **Sin vinculación a impuestos o anticipos** para el ISLR de tarjetas de crédito — la deducción va directo a Gastos > Comisiones Bancarias como cualquier otro concepto, explícitamente confirmado por el usuario.
- Fix del bug de `tasaDelDia` (en `useTasaDelDia` y `FormCierre`) — YA RESUELTO en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`), fuera del alcance de este cambio.
- Correlativo secuencial de sesiones, rediseño de conciliación bancaria, o cualquier otro tema no listado en `task.md`.

---

## Capabilities

> Specs existentes: `openspec/specs/caja/spec.md`. No existe spec principal de `contabilidad` ni `configuracion/bancos` todavía.

### New Capabilities
- `gastos-comisiones-bancarias-seed`: modelo de 3 niveles (grupo → subgrupo → cuenta por banco) para comisiones bancarias, con migración de estructura y auto-creación al registrar un banco.
- `metodo-cobro-deducciones`: N conceptos de deducción por método de pago (reemplaza `comision_pct` único), con defaults por tipo de método y vínculo a cuenta de gasto.

### Modified Capabilities
- `caja`: el cierre de sesión (`cerrarSesionCaja`) itera N deducciones por método en vez de un único `comision_pct`, y resuelve la cuenta de gasto por banco (no por clave global `COMISION_BANCARIA`).
- `configuracion` (bancos): creación/edición de banco auto-crea y vincula su cuenta de comisión; UI para ver/reasignar el vínculo.

---

## Approach

**Slice 1** resuelve la tensión de diseño detectada en la exploración (obs #627/#632): hoy `6.2.01 GASTOS FINANCIEROS` y `6.2.03 COMISION BANCARIA` son leaves hermanas, no padre-hijo, y `codigo` es inmutable (no se puede reconvertir en el lugar sin romper FKs de gastos ya posteados). La migración 0080 **no reconvierte los nodos existentes**: crea nodos nuevos para el árbol de 3 niveles real (grupo Gastos Financieros ya existe como padre; se agrega el subgrupo Comisiones Bancarias vía `agregarSubcuentaAGrupo` o inserción directa siguiendo su patrón, y las cuentas por banco se crean bajo ese subgrupo). Los leaves viejos (`6.2.01`, `6.2.03`) quedan desactivados una vez el script de limpieza retire los gastos que los referencian — nunca se les cambia `codigo` ni se les hace DROP dentro de la migración. Esto respeta la regla 5 (códigos inmutables) y el principio de que 0080 no borra nada.

El script de limpieza (separado, manual, post-`pg_dump`) borra gastos/CxP en **todas las empresas** (incluye la real `sabroqueso2`, confirmado por el usuario como datos de prueba), siguiendo el orden hijo→padre y los triggers a deshabilitar mapeados en la exploración de blast radius (obs #633): `gasto_pagos`, `facturas_compra_det`, `retenciones_iva/islr`, `notas_fiscales_compra(_det)`, `movimientos_cuenta_proveedor`, `vencimientos_pagar`, `facturas_compra`, `gastos`, más las tablas compartidas con discriminador (`movimientos_metodo_cobro WHERE origen='PAGO_PROVEEDOR'`, `movimientos_bancarios WHERE origen IN ('GASTO','PAGO_PROVEEDOR')` **excluyendo `origen='MANUAL'`**, `libro_contable WHERE modulo_origen IN (...)`). **Balances derivados se RECALCULAN, nunca se resetean a 0**: `bancos_empresa.saldo_actual` y `metodos_cobro.saldo_actual` se recomputan como `SUM` sobre las filas remanentes (alimentadas también por ventas/tesorería, que se preservan); `proveedores.saldo_actual` sí es 100% derivado de CxP y es seguro resetear a 0.

**Slices 2-4** reutilizan helpers existentes en vez de construir lógica nueva: `crearGrupoGastoConSubcuentas` / `agregarSubcuentaAGrupo` (`use-plan-cuentas.ts`) para crear el subgrupo y las cuentas por banco; el patrón manual `handleCrearCuentaContable` (`banco-form.tsx:334-399`) se extiende para disparar también la creación de la cuenta de comisión; `insertarGastoComisionEnTx` (`use-gastos.ts:505-645`) se generaliza para iterar N conceptos en vez de uno solo, resolviendo la cuenta destino por banco en vez de por clave global.

---

## Affected Areas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `migrations/0080_*.sql` (nueva) | New | Seed 3 niveles, tabla `metodo_cobro_deducciones`, columna de vínculo banco↔cuenta comisión |
| `migrations/cleanup_gastos_cxp_qol.sql` (nueva, manual) | New | Limpieza one-time de gastos/CxP + recompute de saldos, post-`pg_dump` |
| `src/features/contabilidad/hooks/use-plan-cuentas.ts` | Modified | Reuso de `crearGrupoGastoConSubcuentas`/`agregarSubcuentaAGrupo` para el subgrupo y cuentas por banco |
| `src/features/configuracion/components/banco-form.tsx` (~L334-399) | Modified | Auto-creación + auto-vínculo de cuenta de comisión al crear/editar banco; UI de selección |
| `src/features/configuracion/components/payment-method-form.tsx` + `schemas/payment-method-schema.ts` | Modified | UI de N deducciones por método, defaults por tipo |
| `src/features/caja/hooks/use-sesiones-caja.ts` (`aplicarComisionSiCorresponde` ~L1138-1179) | Modified | Loop sobre `metodo_cobro_deducciones` en vez de `comision_pct` único; resolución de cuenta por banco |
| `src/features/contabilidad/hooks/use-gastos.ts` (`insertarGastoComisionEnTx` L505-645) | Modified | Generalizado para N conceptos y cuenta destino por banco |
| `src/core/db/powersync/schema.ts` + `src/core/db/kysely/types.ts` | Modified | Nueva tabla `metodo_cobro_deducciones`, columna de vínculo en `bancos_empresa` |
| `src/features/tesoreria/*` | None (verify) | Confirmar que la visibilidad de comisiones en Tesorería no cambia |

---

## Risks

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Limpieza destructiva borra gastos/CxP reales de `sabroqueso2` | Alto (por diseño) | `pg_dump` obligatorio antes de correr el script; usuario ya confirmó que son datos de prueba |
| Tablas compartidas (`movimientos_metodo_cobro`, `movimientos_bancarios`) no estaban en la lista original del usuario — descubiertas por trazado de código (obs #633) | Medio | Incluidas explícitamente con discriminador `origen`; excluir `origen='MANUAL'` por ambigüedad |
| Recompute de `bancos_empresa.saldo_actual`/`metodos_cobro.saldo_actual` mal calculado deja saldos incorrectos post-limpieza | Alto | Recompute como `SUM` sobre filas remanentes, nunca reset a 0; verificar contra `pg_dump` antes/después |
| Triggers de inmutabilidad (`trg_gasto_protect`, `trg_libro_contable_protect`, etc., obs #633) bloquean el DELETE si no se deshabilitan en el orden correcto | Medio | Reusar el patrón ya usado en `cleanup_*.sql` existentes: deshabilitar → borrar hijos→padres → recompute → rehabilitar |
| PowerSync sincroniza el borrado por `empresa_id`; escrituras offline en cola contra un `gasto_id`/`factura_compra_id` ya borrado fallarán al sincronizar | Bajo-Medio | Recomendar forzar sync/online de sesiones activas (alphatester) antes de correr la limpieza |
| Códigos inmutables (regla de negocio #5) impiden reconvertir `6.2.01`/`6.2.03` en el lugar | Medio | Slice 1 crea nodos nuevos para el árbol de 3 niveles; leaves viejas se desactivan, no se editan ni se borran |
| ~~Bug de `tasaDelDia` bloquea el cierre con comisión en Bs~~ | Resuelto | YA corregido en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`); no es riesgo pendiente para este cambio |

---

## Rollback Plan

- **Slice 1 (migración 0080)**: aditiva únicamente (nueva tabla + nueva columna + nuevos nodos de plan_cuentas) — revertible con `DROP TABLE`/`DROP COLUMN` sin tocar datos existentes.
- **Script de limpieza**: **no revertible sin el `pg_dump` de respaldo** — es la salvaguarda obligatoria antes de ejecutar, no opcional.
- **Slices 2-4**: cambios de frontend/hooks, revertibles vía `git revert` de los commits afectados; ningún cambio de schema fuera de lo ya cubierto en Slice 1.

---

## Dependencies

- Slice 1 (migración + limpieza) debe completarse, con `pg_dump` verificado, **antes** de que Slices 2-4 tengan datos consistentes para trabajar.
- Slice 4 depende de que Slices 2 y 3 ya existan (necesita cuentas por banco vinculadas y `metodo_cobro_deducciones` poblada).
- Fix de `tasaDelDia` (en `useTasaDelDia` y `FormCierre`): YA RESUELTO en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`) — sin dependencia pendiente.

---

## Success Criteria

- [ ] Crear un banco genera automáticamente su cuenta de activo y su cuenta de comisión vinculada bajo Comisiones Bancarias, sin pasos manuales adicionales.
- [ ] Un método de pago admite N conceptos de deducción, con los defaults correctos por tipo (PUNTO=2@0%, transferencia/otros=1@0%, tarjeta crédito=ISLR 5%).
- [ ] El cierre aplica cada deducción configurada y la registra en la cuenta de comisión del banco correspondiente (no en una clave global única).
- [ ] Las comisiones siguen visibles en Tesorería igual que hoy.
- [ ] Post-limpieza, `bancos_empresa.saldo_actual` y `metodos_cobro.saldo_actual` reflejan correctamente solo las operaciones preservadas (ventas/tesorería).
- [ ] `yarn type-check` y `yarn lint` pasan.

---

## Open Questions

1. **Numeración exacta de códigos** para el subgrupo Comisiones Bancarias y las cuentas por banco (ej. `6.2.04`, `6.2.04.01`...) — se define en `sdd-design`, no en esta propuesta.
2. **¿La UI de Slice 3 permite eliminar un concepto de deducción o solo desactivarlo?** — dado que `metodo_cobro_deducciones` podría tener historial de cierres ya aplicados referenciándolo.
3. ~~¿El fix de `tasaDelDia` se gestiona como cambio separado?~~ RESUELTO — ya corregido en el Paso 1 (commits `db0417b`, `1e3a603`, `4fc9808`). Slice 4 ya se puede validar end-to-end.

---

## Estimated Effort / Review Size

**Slice 1**: M-L (migración + script de limpieza manual, requiere respaldo y verificación cuidadosa — candidato a su propia PR). **Slices 2-4**: S-M cada uno, secuenciales, cada uno con su propio PR encadenado dado el presupuesto de revisión de 400 líneas.
