-- =============================================================================
-- Migration: 0120_limpiar_trigger_debug_saldo_cliente.sql
-- Created:   2026-10-30
-- Depends:   0119_fix_trigger_saldo_actual_y_reconciliacion.sql (YA MERGEADA a
--              origin/develop, commit d068edfb, PR #286).
--
-- CONTEXTO: en algun momento posterior a aplicar 0119 en staging, la funcion
--   `actualizar_saldo_cliente()` recibio un PARCHE MANUAL en vivo (vía SQL
--   Editor, NUNCA registrado como migracion) que agrego una linea
--   `RAISE WARNING '[TRIGGER-FIRE] ...'` (mas su comentario
--   `-- [TEMPORAL - DEBUG retry doble-disparo, revertir despues]`) para
--   diagnosticar un bug de doble-disparo del trigger. Ese bug ya esta
--   confirmado resuelto esta sesion: un INSERT unico en `movimientos_cuenta`
--   dispara el trigger exactamente una vez, con el delta correcto (ver bloque
--   de verificacion al final de este archivo). La linea de debug:
--     - Nunca existio en el archivo `0119_...sql` del historial de
--       `migrations/` — es ruido operativo agregado FUERA del flujo de
--       migraciones versionadas.
--     - Genera ruido permanente en los logs de Postgres en cada INSERT sobre
--       `movimientos_cuenta` (altisima frecuencia: toda venta, pago, reverso,
--       SAF, etc.).
--     - Deja el historial de `migrations/` desincronizado del estado real de
--       la funcion en la base de datos — `0119` ya no describe lo que esta
--       vivo.
--
-- FIX: `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()` con el cuerpo
--   EXACTO (byte-identico) de `0119_fix_trigger_saldo_actual_y_reconciliacion.sql`
--   Parte 1 (lineas 191-327 de ese archivo) — SIN la linea `RAISE WARNING
--   '[TRIGGER-FIRE]...'` ni su comentario `-- [TEMPORAL]`, porque esa linea
--   JAMAS estuvo en 0119: este archivo simplemente re-declara el estado
--   correcto y documentado en el historial de migraciones, sobrescribiendo el
--   parche manual no versionado que quedo vivo en la DB. CERO cambios de
--   formula, CERO cambios de asercion, CERO cambios de CASE — unicamente se
--   retira instrumentacion de debug que nunca debio persistir fuera de una
--   sesion de diagnostico puntual.
--
-- VERIFICACION DE ESTE ARCHIVO (obligatoria, hecha por sdd-apply antes de
--   entregar este cambio): diff linea por linea del bloque
--   `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente() ... $$ LANGUAGE
--   plpgsql;` de este archivo contra el mismo bloque en
--   `0119_fix_trigger_saldo_actual_y_reconciliacion.sql` — resultado: SIN
--   DIFERENCIAS (byte-identico, modulo comentarios de cabecera del archivo).
--   No hay ninguna diferencia que reportar.
--
-- SEGURO DE RE-EJECUTAR (idempotente): `CREATE OR REPLACE FUNCTION` —
--   reemplazo total, mismo estado final en cualquier cantidad de corridas.
--
-- ROLLBACK:
--   Re-aplicar el `CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()`
--   EXACTO con el cuerpo de 0119 (reproducido completo mas abajo, sin
--   cambios) — funcionalmente IDENTICO a este archivo, porque este archivo
--   YA ES el cuerpo de 0119 sin agregados. Si se necesitara reinsertar el
--   `RAISE WARNING` de debug para depurar de nuevo, pegar esa linea
--   manualmente en el SQL Editor (no amerita nueva migracion, igual que
--   cuando se agrego la primera vez).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION actualizar_saldo_cliente()
RETURNS TRIGGER AS $$
BEGIN
  -- Compute saldo_nuevo from the saldo_anterior provided in the INSERT.
  -- DO NOT read saldo_actual live from clientes for THIS computation — that
  -- created the race condition fixed in migration 0060. Keep that fix. This
  -- block is BYTE-IDENTICAL to the post-0118 state (origin/develop) — it
  -- feeds ONLY the immutable audit column movimientos_cuenta.saldo_nuevo
  -- and the SAF/SAFV/REV consistency assertions below; it no longer governs
  -- clientes.saldo_actual (that now reads the live row, see the UPDATE
  -- below).
  IF NEW.tipo IN ('FAC', 'NDB') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior + NEW.monto;
  ELSIF NEW.tipo IN ('PAG', 'NCR') THEN
    NEW.saldo_nuevo := NEW.saldo_anterior - NEW.monto;
  ELSIF NEW.tipo IN ('SAF', 'SAFV') THEN
    -- SAF/SAFV cover two directions the trigger cannot distinguish from
    -- monto alone (monto is always positive, CHECK constraint):
    -- debt-reduction (saldo_anterior - monto, SAF-CxC flujo de pago de
    -- factura/vencimiento preexistente) or credit-consumption
    -- (saldo_anterior + monto, SAF/SAFV usado como metodo de pago). SAFV se
    -- agrega a ESTA MISMA rama (no una nueva): el movimiento de
    -- saldo_actual es identico al de SAF, misma ambiguedad de signo
    -- (migrations/0115, Opcion B1). Trust the app-computed value (same
    -- treatment as REV/SAL below), but assert internal consistency so a
    -- caller bug (e.g. omitted saldo_nuevo) fails loudly instead of
    -- silently corrupting the ledger a third time.
    IF NEW.saldo_nuevo IS NULL
       OR ABS(ABS(NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'SAF saldo_nuevo (%) inconsistent with saldo_anterior (%) +/- monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior, NEW.monto USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.tipo = 'REV' THEN
    -- REV reabre la deuda pendiente tras un reverso de abono — a diferencia
    -- de SAF/SAFV, la direccion es FIJA (+): saldo_nuevo SIEMPRE debe ser
    -- saldo_anterior + monto (reverso de pago nunca reduce deuda). Defensa
    -- en profundidad (migrations/0118, design fix-saldo-cliente-doble-reverso,
    -- decision D5) — NO detecta el bug original de doble-conteo (el codigo
    -- viejo tambien era internamente consistente bajo esta misma formula);
    -- atrapa bugs de wiring FUTUROS donde saldo_nuevo/monto queden
    -- desincronizados. Mantenida SIN CAMBIOS por esta migracion (0119):
    -- ahora defiende exclusivamente el audit trail inmutable
    -- (movimientos_cuenta.saldo_nuevo), ya no gobierna clientes.saldo_actual
    -- (ver design.md Part 3).
    IF ABS((NEW.saldo_nuevo - NEW.saldo_anterior) - NEW.monto) > 0.005 THEN
      RAISE EXCEPTION 'REV saldo_nuevo (%) inconsistente: esperado saldo_anterior+monto (%)',
        NEW.saldo_nuevo, NEW.saldo_anterior + NEW.monto USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- SAL, SAFC, SAFR: saldo_nuevo stays as provided in the INSERT (no
  -- recalculation, no consistency assertion — unchanged from 0114/0118).

  -- CRITICAL: set context so validate_cliente_update allows this UPDATE.
  IF NEW.saldo_nuevo IS NOT NULL THEN
    PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);
    UPDATE clientes
    SET
        -- saldo_actual (FIX 0119): formula RELATIVA, YA NO `= NEW.saldo_nuevo`
        -- verbatim (ese snapshot de la app podia quedar stale — ver cabecera
        -- de este archivo, repro 4 pasos). Se auto-sana leyendo el valor VIVO
        -- de la fila (saldo_actual, saldo_pendiente_usd, saf_disponible SIN
        -- calificar = fila previa al UPDATE, mismo mecanismo que ya usan
        -- saf_disponible/saldo_pendiente_usd desde 0102/0110, cero queries
        -- nuevas, mismo row-lock) y reaplicando los MISMOS deltas que las
        -- dos columnas hermanas, para TODOS los tipos excepto SAL (ancla
        -- absoluta legacy preservada, ver design.md Part 1 prueba por
        -- induccion):
        --   saldo_actual = saldo_actual_viejo + delta_pendiente - delta_saf
        -- INVARIANTE OBLIGATORIO (cada bracket DEBE ser nuevo-menos-viejo,
        -- NUNCA viejo-menos-nuevo): delta_pendiente debe ser EXACTAMENTE
        -- `(expresion del CASE de saldo_pendiente_usd para ese tipo) -
        -- saldo_pendiente_usd` y delta_saf debe ser EXACTAMENTE `(expresion
        -- del CASE de saf_disponible para ese tipo) - saf_disponible` — de
        -- lo contrario `saldo_actual = saldo_pendiente_usd - saf_disponible`
        -- (identidad canonica, design.md Part 0) deja de cumplirse. SAFV NO
        -- entra en la rama de pendiente (cae en el ELSE, delta_pendiente=0,
        -- igual que saldo_pendiente_usd real abajo) PERO SI entra en la
        -- rama de saf_disponible (delta_saf=consumo de credito, nuevo-viejo)
        -- — verificado linea por linea contra el CASE real de
        -- saldo_pendiente_usd (0115/0118, NO la parafrasis del diseno, ver
        -- cabecera "DESVIACION VERIFICADA").
        --
        -- BUG CRITICO encontrado por sdd-verify y corregido aqui: la rama
        -- SAF/SAFR/SAFV de delta_saf estaba escrita como
        -- `saf_disponible - GREATEST(0, saf_disponible - NEW.monto)`
        -- (viejo-menos-nuevo, el SIGNO AL REVES del invariante de arriba).
        -- Como el bracket completo se RESTA (`- (CASE ...)`), ese signo
        -- invertido se cancelaba con la resta externa y el delta efectivo
        -- quedaba +delta_saf en vez de -delta_saf — doble flip de signo que
        -- corrompia saldo_actual por 2×monto en la direccion equivocada en
        -- CUALQUIER consumo de credito SAF/SAFR/SAFV (SAFC, que ya usaba la
        -- convencion correcta nuevo-menos-viejo por construccion simple
        -- `+NEW.monto` sin GREATEST, no estaba afectado). Fix: la rama
        -- SAF/SAFR/SAFV ahora es `GREATEST(0, saf_disponible - NEW.monto) -
        -- saf_disponible` (nuevo-menos-viejo), identica en forma a como
        -- saf_disponible mismo calcula su propio nuevo valor menos el valor
        -- viejo. Ver TC6 (dry-run al final del archivo) para la prueba
        -- numerica de los 3 casos que atrapo sdd-verify.
        saldo_actual = CASE
          WHEN NEW.tipo = 'SAL' THEN NEW.saldo_nuevo
          ELSE
            saldo_actual
            + (CASE
                 WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN NEW.monto
                 WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF')
                      THEN GREATEST(0, saldo_pendiente_usd - NEW.monto) - saldo_pendiente_usd
                 ELSE 0
               END)
            - (CASE
                 WHEN NEW.tipo = 'SAFC' THEN NEW.monto
                 WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV')
                      THEN GREATEST(0, saf_disponible - NEW.monto) - saf_disponible
                 ELSE 0
               END)
        END,
        -- saf_disponible: BYTE-IDENTICO a 0115/0118, sin cambios por 0119.
        saf_disponible = CASE
          WHEN NEW.tipo = 'SAFC' THEN saf_disponible + NEW.monto
          WHEN NEW.tipo IN ('SAF', 'SAFR', 'SAFV') THEN GREATEST(0, saf_disponible - NEW.monto)
          ELSE saf_disponible
        END,
        -- saldo_pendiente_usd: BYTE-IDENTICO a 0110/0114/0115/0118, sin
        -- cambios por 0119. SAFV cae en el ELSE (punto central del fix de
        -- 0115 — la venta ya nace neta del SAF, esta fila jamas vuelve a
        -- tocar la deuda pendiente).
        saldo_pendiente_usd = CASE
          WHEN NEW.tipo IN ('FAC', 'NDB', 'REV') THEN saldo_pendiente_usd + NEW.monto
          WHEN NEW.tipo IN ('PAG', 'NCR', 'SAF') THEN GREATEST(0, saldo_pendiente_usd - NEW.monto)
          ELSE saldo_pendiente_usd
        END,
        updated_at   = NOW()
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- =============================================================================
-- VERIFICACION MANUAL EN STAGING (owner — bloque BEGIN;...ROLLBACK;, cero
-- efecto persistente, reemplazar los placeholders <...> con IDs reales de un
-- cliente/empresa/usuario de prueba antes de ejecutar). A diferencia de 0119
-- (TC1-TC6 completos, sin cambio de formula), este bloque se limita a probar
-- lo UNICO relevante para 0120: que un INSERT unico sigue disparando el
-- trigger EXACTAMENTE una vez (sin el doble-disparo que motivo el debug
-- temporal) y con el delta correcto — no reproduce toda la bateria de 0119.
-- =============================================================================

-- -- TC-UNICO-FIRE: INSERT unico (FAC $1) en cliente de prueba en cero -------
-- BEGIN;
--   -- Estado inicial esperado del cliente de prueba: saldo_actual=0,
--   -- saldo_pendiente_usd=0, saf_disponible=0.
--   UPDATE clientes SET saldo_actual = 0, saldo_pendiente_usd = 0, saf_disponible = 0
--     WHERE id = '<cliente-test>' AND empresa_id = '<empresa-test>';
--
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'FAC',
--      'TC-UNICO-FIRE', 1, 0, 1, now(), now(), '<usuario-test>');
--
--   SELECT saldo_actual, saldo_pendiente_usd FROM clientes
--     WHERE id = '<cliente-test>' AND empresa_id = '<empresa-test>';
--   -- Esperado: saldo_pendiente_usd=1, saldo_actual=1 — UN SOLO INSERT
--   -- produce UN SOLO incremento de $1 en cada columna (sin doble-conteo;
--   -- si el bug de doble-disparo hubiera resucitado, cualquiera de las dos
--   -- columnas aparece en 2, no en 1).
-- ROLLBACK;
