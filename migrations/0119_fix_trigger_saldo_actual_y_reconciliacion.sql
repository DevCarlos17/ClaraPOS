-- =============================================================================
-- Migration: 0119_fix_trigger_saldo_actual_y_reconciliacion.sql
-- Created:   2026-10-30
-- CORRECCION POST-VERIFY (misma fecha): sdd-verify encontro un bug CRITICO
--   de signo invertido en la rama SAF/SAFR/SAFV del delta de
--   `saf_disponible` dentro del CASE de `saldo_actual` (Parte 1) — estaba
--   escrita viejo-menos-nuevo en vez de nuevo-menos-viejo, y como ese
--   bracket completo se resta en la formula, el signo se cancelaba dos
--   veces: cada consumo de credito SAF/SAFR/SAFV corrompia `saldo_actual`
--   por 2×monto en la direccion equivocada. Corregido (ver comentario
--   inline junto al CASE de `saldo_actual` mas abajo) + agregado TC6 (dry
--   -run al final del archivo) que cubre exactamente el escenario que dejo
--   escapar el bug original (consumo de credito SAF/SAFR/SAFV — TC2 solo
--   cubria CREACION via SAFC, nunca consumo).
-- Depends:   0117_movimientos_bancarios_pagos.sql (ultima migracion con DDL
--              antes de 0118) +
--            0118_reconciliar_saldo_cliente_y_assertion_rev.sql (YA MERGEADA
--              a origin/develop, commit 6ef15cbb, Y YA APLICADA en la DB de
--              staging — ver memoria del proyecto, topic
--              sdd/reverso-abono-tesoreria/estado-migracion-0118-0119. Esta
--              migracion NO reemplaza 0118 in-place: 0118 queda tal cual en
--              el historial, append-only, como exige migrations/README.md
--              "Nunca editar una migracion ya aplicada". 0119 es el
--              siguiente CREATE OR REPLACE, partiendo EXACTAMENTE del cuerpo
--              post-0118 de actualizar_saldo_cliente() — verificado linea
--              por linea contra origin/develop, no contra ningun borrador
--              local.)
--
-- CONTEXTO: 0118 reparo UNICAMENTE `saldo_pendiente_usd` (reconciliacion con
--   delta compartido) y agrego la asercion REV. NO toco la formula de
--   `saldo_actual` (seguia siendo `= NEW.saldo_nuevo` verbatim, snapshot
--   stale de la app) ni reparo el drift ya acumulado en esa columna. Prueba
--   de que el bug SOBREVIVE a 0118 (repro exacto del owner, cliente de
--   prueba 8, factura C01-000040 $1):
--     1. Venta contado $1, abono directo pago movil (PAG) -> saldo_actual=0 OK.
--     2. Rechazo desde tesoreria (REV) -> saldo_actual sube a 1 OK.
--     3. Abono desde CxC (PAG) -> factura se paga, saldo_pendiente_usd baja
--        a 0 OK (0118 ya corrige esto), PERO saldo_actual QUEDA EN 1 (no
--        baja) — BUG, porque saldo_actual sigue sin auto-sanarse.
--     4. Reverso del abono (REV) -> saldo_actual pasa a 2 (el 1 que quedo
--        mal + 1 del reverso) — BUG.
--   Confirmado en staging: cliente de prueba 6 queda en saldo_actual=-2,
--   cliente de prueba 8 queda en saldo_actual=2. Ambos corruptos por el
--   MISMO mecanismo (snapshots stale acumulados en ciclos), no por casos
--   especiales por cliente.
--
--   Diseno completo: openspec/changes/fix-trigger-saldo-actual/design.md
--   (Part 0: formula canonica saldo_actual = saldo_pendiente_usd -
--   saf_disponible, confirmada por evidencia, no supuesta. Part 1: fix del
--   trigger con formula RELATIVA. Part 2: reconciliacion con DOS chequeos de
--   drift independientes. Part 3: tests/orden.)
--
-- DESVIACION VERIFICADA RESPECTO AL TEXTO LITERAL DEL DISENO (seccion 1.1):
--   el diseno describe el delta de `saldo_pendiente_usd` como
--   `WHEN NEW.tipo IN ('PAG','NCR','SAF','SAFV') THEN ...` — ESO ES
--   INCORRECTO frente al trigger REAL (0115/0118, verificado linea por linea
--   contra origin/develop): el CASE real de `saldo_pendiente_usd` es
--   `WHEN NEW.tipo IN ('FAC','NDB','REV') THEN +monto`,
--   `WHEN NEW.tipo IN ('PAG','NCR','SAF') THEN GREATEST(0, ...)`; SAFV NO
--   esta en ninguna rama (cae en el ELSE, sin cambios) — ese ELSE-para-SAFV
--   es el PUNTO CENTRAL del fix de 0115 (la venta ya nace neta del SAF
--   aplicado, la fila SAFV JAMAS debe volver a tocar saldo_pendiente_usd).
--   Esta migracion usa el CASE REAL (sin SAFV en la rama de pendiente), NO
--   la parafrasis del diseno. `saf_disponible` SI incluye SAFV en su propio
--   CASE (`WHEN NEW.tipo IN ('SAF','SAFR','SAFV') THEN ...`) — eso coincide
--   entre diseno y codigo real, sin cambios.
--
-- FIX (dos partes, mismo archivo, misma transaccion):
--
--   PARTE 1 — CREATE OR REPLACE FUNCTION actualizar_saldo_cliente(): el
--     bloque superior IF/ELSIF (computo/validacion de NEW.saldo_nuevo para
--     FAC/NDB/PAG/NCR/SAF/SAFV/REV) queda BYTE-IDENTICO al estado post-0118
--     — protege el audit trail inmutable (movimientos_cuenta.saldo_nuevo),
--     sigue sin recalcularse para SAL/SAFC/SAFR. El UPDATE clientes
--     mantiene `saf_disponible`/`saldo_pendiente_usd` BYTE-IDENTICOS a
--     0115/0118. Cambia UNICAMENTE `saldo_actual`: de `= NEW.saldo_nuevo`
--     (snapshot de la app, potencialmente stale) a una formula RELATIVA que
--     reutiliza los MISMOS deltas ya calculados para
--     `saf_disponible`/`saldo_pendiente_usd` (nuevo - viejo, dentro del
--     mismo UPDATE, mismo row-lock, cero queries nuevas):
--       saldo_actual = saldo_actual_viejo + delta_pendiente - delta_saf
--     Excepcion preservada: `SAL` (ancla absoluta legacy, import de saldo
--     inicial) sigue escribiendo `NEW.saldo_nuevo` directo, igual que antes
--     — la formula relativa preserva el ancla porque opera como delta sobre
--     el valor YA persistido (ver design.md Part 1, prueba por induccion:
--     SAL $500 + FAC $100 -> relativa da 600 correcto, absoluta daria 100,
--     borrando el ancla).
--     Por que es seguro leer `saldo_actual`/`saldo_pendiente_usd`/
--     `saf_disponible` EN VIVO dentro del mismo SET: esa columna esta en
--     `TRIGGER_MANAGED_PATCH_COLUMNS` (connector.ts) desde la PRIMERA
--     version de ese mecanismo — el PATCH de la app sobre `saldo_actual`
--     JAMAS llega a Supabase (se strippea en upload), por lo que no hay
--     PATCH concurrente con el que esta lectura pueda chocar. El row-lock
--     del propio UPDATE (identico al que ya usan `saf_disponible` desde
--     0102 y `saldo_pendiente_usd` desde 0110, sin incidentes reportados) es
--     la unica proteccion necesaria — CERO reintroduccion de la race
--     condition de 0060/0088 (esa SI era un PATCH real desde la app,
--     mecanismo distinto al de esta migracion).
--
--   PARTE 2 — Reconciliacion (sustituye el chequeo de 0118, que SOLO
--     comparaba `saldo_pendiente_usd` y quedaba CIEGO al drift de
--     `saldo_actual` cuando `saldo_pendiente_usd` ya estaba correcto — EXACTO
--     el caso del paso 3 del repro arriba). Dos chequeos de drift
--     INDEPENDIENTES (no un delta compartido como hacia 0118):
--       (a) `saldo_pendiente_usd` vs `SUM(ventas.saldo_pend_usd) WHERE
--           status != 'ANULADA' AND tipo != 'SALDO_INICIAL'` (bug latente
--           independiente encontrado en el diseno: 0118 NO filtraba
--           SALDO_INICIAL, duplicando el monto de cualquier cliente con
--           import SAL historico — ver use-importar-cxc.ts:177-205+249-258,
--           la venta sintetica de un import SAL SIEMPRE tiene
--           saldo_pend_usd = monto completo, nunca 0, mientras
--           clientes.saldo_pendiente_usd la excluye por diseno — ELSE branch
--           para tipo 'SAL' desde 0110).
--       (b) `saldo_actual` vs `(deuda_real + SUM(movimientos_cuenta WHERE
--           tipo='SAL').monto - saf_disponible)` — formula canonica derivada
--           (design.md Part 0, confirmada por 0062/0089 + 3 citas literales
--           del frontend que tratan `saldo_actual` como valor NETEADO,
--           nunca usado para decisiones de SAF/CxC).
--     Solo se corrigen filas con `ABS(drift) > 0.005` en CUALQUIERA de los
--     dos chequeos (OR, no delta compartido) — cuando una fila dispara por
--     cualquiera de los dos, ambas columnas se fijan a su VALOR OBJETIVO
--     recien calculado (no a un delta): si la otra columna ya estaba
--     correcta, fijarla a su propio objetivo es un no-op matematico, sigue
--     siendo idempotente. Usa el canal OFICIAL de bypass
--     `set_config('clarapos.trigger_context', 'mov_cuenta', TRUE)` — el
--     MISMO mecanismo que usa el propio trigger (0061/0062/0089/0102/0110/
--     0114/0115/0118). NUNCA inserta/actualiza/borra `movimientos_cuenta`
--     (tabla inmutable, sin cambios de forma ni de datos en este archivo) —
--     solo UPDATE directo sobre `clientes`, mismo canal legitimo que ya usan
--     0061/0062/0089/0118.
--
--   Verificado contra el repro completo: cliente de prueba 8 (deuda_real=1,
--   sal=0, saf=0) -> actual_obj=1 (correcto, NO 2). Cliente de prueba 6
--   (reportado en -2): el objetivo se computa con la MISMA formula general
--   para todos los clientes, sin casos especiales.
--
--   ASERCION REV (agregada por 0118, PERMANECE SIN CAMBIOS en esta
--   migracion): cambia de PROPOSITO, no de contenido. Antes de este archivo
--   defendia (parcialmente, de forma incompleta) `saldo_actual` contra
--   basura via el camino de `NEW.saldo_nuevo`. Ahora que `saldo_actual` ya
--   NO lee `NEW.saldo_nuevo` para tipo REV (lee los deltas en vivo), la
--   asercion defiende EXCLUSIVAMENTE la integridad del audit trail
--   inmutable `movimientos_cuenta.saldo_nuevo` — un dato historico que sigue
--   mereciendo ser consistente aunque ya no gobierne la columna viva. Se
--   MANTIENE intacta (byte-identica a 0118), sigue siendo una defensa en
--   profundidad valida contra bugs de wiring futuros.
--
-- ORDEN DELIBERADO dentro de este archivo: PRIMERO el fix del trigger
--   (Parte 1), DESPUES la reconciliacion (Parte 2) — para que los valores
--   corregidos de la reconciliacion no queden expuestos a una proxima
--   insercion bajo el trigger VIEJO (con el bug de saldo_actual todavia
--   activo). La reconciliacion hace UPDATE directo sobre `clientes` (nunca
--   pasa por el trigger, que solo dispara en INSERT sobre
--   `movimientos_cuenta`) — el orden interno no afecta la correccion
--   matematica, pero protege contra una ventana de insercion concurrente
--   entre Parte 1 y Parte 2 dentro de la misma transaccion.
--
-- SEGURO DE RE-EJECUTAR (idempotente):
--   - Parte 1: `CREATE OR REPLACE FUNCTION` — reemplazo total, mismo estado
--     final en cualquier cantidad de corridas.
--   - Parte 2: solo corrige filas con `ABS(drift) > 0.005` en cualquiera de
--     los dos chequeos. Primera corrida: corrige N clientes con drift real
--     (incluye clientes de prueba 6 y 8). Segunda corrida (sin cambios
--     intermedios): ambos chequeos caen por debajo del umbral para esas
--     filas -> 0 filas afectadas, `RAISE NOTICE` reporta 0.
--   - NUNCA toca `movimientos_cuenta` (ni INSERT, ni UPDATE, ni DELETE) —
--     tabla inmutable sin cambios de forma ni de datos en este archivo.
--
-- VERIFICACION MANUAL EN STAGING (owner — esta sesion no tiene credenciales
-- de DB; bloques BEGIN;...ROLLBACK; comentados al final de este archivo,
-- DESPUES del COMMIT, mismo patron que 0102/0110/0115/0118): TC1 (repro 4
-- pasos), TC2 (SAFC creacion de credito, sin deuda), TC3 (ancla SAL + FAC
-- posterior), TC4 (idempotencia de la reconciliacion), TC5 (asercion REV
-- sigue rechazando), TC6 (SAF/SAFR/SAFV CONSUMO de credito — la rama del
-- sign-flip critico encontrado por sdd-verify, corregido en esta version).
--
-- ROLLBACK:
--   Parte 1 (funcion): re-aplicar el `CREATE OR REPLACE FUNCTION` EXACTO
--     del cuerpo post-0118 (reproducido completo en el historial de
--     0118_reconciliar_saldo_cliente_y_assertion_rev.sql, sin cambios) —
--     restaura `saldo_actual = NEW.saldo_nuevo` verbatim.
--   Parte 2 (reconciliacion): NO aplica rollback de datos (correccion de
--     datos, no migracion de forma). Restaurar
--     `clientes.saldo_pendiente_usd`/`saldo_actual` desde un backup previo a
--     esta ejecucion si se necesita revertir.
-- =============================================================================

BEGIN;

-- ─── Parte 1: Fix del trigger (saldo_actual se auto-sana en vivo) ──────────
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

-- ─── Parte 2: Reconciliacion — dos chequeos de drift INDEPENDIENTES ────────
DO $$
DECLARE
  v_corregidos INTEGER;
BEGIN
  -- Autoriza el UPDATE directo sobre clientes para este bloque de
  -- reparacion (transaction-local) — mismo canal oficial que usa el propio
  -- trigger actualizar_saldo_cliente() (0061/0062/0089/0102/0110/0114/0115/
  -- 0118).
  PERFORM set_config('clarapos.trigger_context', 'mov_cuenta', TRUE);

  WITH deuda AS (
    SELECT
      v.cliente_id,
      v.empresa_id,
      SUM(CAST(v.saldo_pend_usd AS NUMERIC)) AS deuda_real
    FROM ventas v
    WHERE v.status != 'ANULADA'
      AND v.tipo != 'SALDO_INICIAL'  -- fix del bug latente de 0118: excluye
                                      -- el ancla SAL, que siempre tiene
                                      -- saldo_pend_usd = monto completo
                                      -- (use-importar-cxc.ts:177-205,
                                      -- 249-258) aunque
                                      -- clientes.saldo_pendiente_usd la
                                      -- excluye por diseno.
    GROUP BY v.cliente_id, v.empresa_id
  ), sal AS (
    SELECT
      mc.cliente_id,
      mc.empresa_id,
      SUM(mc.monto) AS sal_total
    FROM movimientos_cuenta mc
    WHERE mc.tipo = 'SAL'
    GROUP BY mc.cliente_id, mc.empresa_id
  ), objetivo AS (
    SELECT
      c.id,
      c.empresa_id,
      COALESCE(d.deuda_real, 0) AS pendiente_obj,
      COALESCE(d.deuda_real, 0) + COALESCE(s.sal_total, 0) - CAST(c.saf_disponible AS NUMERIC) AS actual_obj
    FROM clientes c
    LEFT JOIN deuda d ON d.cliente_id = c.id AND d.empresa_id = c.empresa_id
    LEFT JOIN sal   s ON s.cliente_id = c.id AND s.empresa_id = c.empresa_id
  ), drift AS (
    SELECT o.*
    FROM objetivo o
    JOIN clientes c ON c.id = o.id
    WHERE ABS(o.pendiente_obj - CAST(c.saldo_pendiente_usd AS NUMERIC)) > 0.005  -- chequeo (a), independiente
       OR ABS(o.actual_obj    - CAST(c.saldo_actual AS NUMERIC))        > 0.005  -- chequeo (b), independiente
  )
  UPDATE clientes c
  SET
    saldo_pendiente_usd = d.pendiente_obj,
    saldo_actual         = d.actual_obj,
    updated_at = NOW()
  FROM drift d
  WHERE d.id = c.id;

  GET DIAGNOSTICS v_corregidos = ROW_COUNT;
  RAISE NOTICE '0119_fix_trigger_saldo_actual_y_reconciliacion: % cliente(s) corregido(s) por drift > 0.005 en saldo_pendiente_usd y/o saldo_actual (chequeos independientes).', v_corregidos;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACION MANUAL EN STAGING (owner — bloques BEGIN;...ROLLBACK;, cero
-- efecto persistente, reemplazar los placeholders <...> con IDs reales de
-- un cliente/empresa/usuario de prueba antes de ejecutar).
-- =============================================================================

-- -- TC1: Repro 4 pasos exacto (cliente de prueba 8) --------------------------
-- BEGIN;
--   -- Estado inicial esperado del cliente de prueba: saldo_actual=0,
--   -- saldo_pendiente_usd=0, saf_disponible=0.
--   -- Paso 1a: FAC $1 (venta credito).
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'FAC',
--      'TC1-FAC', 1, 0, 1, now(), now(), '<usuario-test>');
--   -- Esperado: saldo_actual=1, saldo_pendiente_usd=1.
--
--   -- Paso 1b: PAG $1 (abono directo pago movil, contado).
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'PAG',
--      'TC1-PAG1', 1, 1, 0, now(), now(), '<usuario-test>');
--   -- Esperado: saldo_actual=0, saldo_pendiente_usd=0.
--
--   -- Paso 2: REV (rechazo desde tesoreria).
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--      'TC1-REV1', 1, 0, 1, now(), now(), '<usuario-test>');
--   -- Esperado: saldo_actual=1 (ya funcionaba antes del fix), saldo_pendiente_usd=1.
--
--   -- Paso 3: PAG (abono desde CxC) — EL PASO QUE ANTES SE ROMPIA.
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'PAG',
--      'TC1-PAG2', 1, 1, 0, now(), now(), '<usuario-test>');
--   SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado POST-FIX: saldo_actual=0 (antes del fix quedaba en 1 — BUG).
--
--   -- Paso 4: REV (reverso del abono del paso 3).
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--      'TC1-REV2', 1, 0, 1, now(), now(), '<usuario-test>');
--   SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado POST-FIX: saldo_actual=1 (antes del fix daba 2 — BUG).
-- ROLLBACK;

-- -- TC2: Cliente SAF puro (credito a favor, sin deuda) — no se rompe --------
-- BEGIN;
--   UPDATE clientes SET saldo_actual = 0, saldo_pendiente_usd = 0, saf_disponible = 0
--     WHERE id = '<cliente-test>';
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFC',
--      'TC2-SAFC', 100, 0, 100, now(), now(), '<usuario-test>');
--   SELECT saldo_actual, saldo_pendiente_usd, saf_disponible FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado: saf_disponible=100, saldo_pendiente_usd=0 (sin cambios),
--   -- saldo_actual=-100 (favor, negativo = credito a favor, igual que
--   -- 0062/0089).
-- ROLLBACK;

-- -- TC3: Ancla SAL + FAC posterior — el ancla NO se pierde --------------------
-- BEGIN;
--   -- Simula import SAL $500 (saldo_actual=500 ancla absoluta, pendiente=0,
--   -- saf=0 — SAL no pasa por ninguna de las dos).
--   UPDATE clientes SET saldo_actual = 0, saldo_pendiente_usd = 0, saf_disponible = 0
--     WHERE id = '<cliente-test>';
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAL',
--      'TC3-SAL', 500, 0, 500, now(), now(), '<usuario-test>');
--   -- Venta a credito FAC $100 posterior.
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'FAC',
--      'TC3-FAC', 100, 0, 100, now(), now(), '<usuario-test>');
--   SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado: saldo_actual=600 (500 ancla + 100 delta FAC, el ancla NO se
--   -- pierde — con la formula ABSOLUTA en vez de la RELATIVA esto daria 100,
--   -- borrando el ancla), saldo_pendiente_usd=100.
-- ROLLBACK;

-- -- TC4: Reconciliacion — idempotencia ----------------------------------------
-- BEGIN;
--   -- Simula drift SOLO en saldo_actual (el caso exacto que 0118 no veia):
--   -- deja saldo_pendiente_usd correcto pero saldo_actual desviado +20.
--   UPDATE clientes SET saldo_actual = saldo_actual + 20
--     WHERE id = '<cliente-test>';
--   -- (Ejecutar aqui el bloque DO $$ de la Parte 2 de este archivo.)
--   SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado 1ra corrida: saldo_actual corregido a su objetivo real
--   -- (RAISE NOTICE reporta >= 1 cliente corregido).
--   -- Ejecutar el bloque DO $$ de nuevo (2da corrida, sin cambios
--   -- intermedios): RAISE NOTICE debe reportar 0 clientes corregidos.
-- ROLLBACK;

-- -- TC5: Asercion REV (0118, sin cambios) sigue rechazando inconsistencias ---
-- BEGIN;
--   -- Caso BUENO: saldo_nuevo = saldo_anterior + monto (debe tener exito).
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--      'TC5-OK', 10, 0, 10, now(), now(), '<usuario-test>');
--   -- Esperado: INSERT exitoso.
--
--   -- Caso MALO: saldo_nuevo NO coincide con saldo_anterior + monto.
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'REV',
--      'TC5-BAD', 10, 0, 999, now(), now(), '<usuario-test>');
--   -- Esperado: RAISE EXCEPTION 'REV saldo_nuevo (...) inconsistente...' con
--   -- ERRCODE = 'P0001'.
-- ROLLBACK;

-- -- TC6: SAF/SAFR/SAFV — CONSUMO de credito (la rama del sign-flip que ----
-- -- sdd-verify encontro; TC2 solo cubria CREACION via SAFC, nunca consumo).
-- -- Los 3 casos son EXACTAMENTE los que uso sdd-verify para probar el bug
-- -- (verify-report.md, Check 2): con el bug (bracket viejo-menos-nuevo) el
-- -- resultado hubiera sido 2x el delta de saf en la direccion equivocada.
-- BEGIN;
--   -- Caso A: SAF paga $30 de una factura de $30 usando credito SAF
--   -- existente. Estado previo: pendiente=30 (factura activa),
--   -- saf_disponible=100 (credito disponible), saldo_actual=-70 (coincide
--   -- con el canonico pendiente-saf = 30-100).
--   UPDATE clientes SET saldo_pendiente_usd = 30, saf_disponible = 100, saldo_actual = -70
--     WHERE id = '<cliente-test>';
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAF',
--      'TC6-SAF', 30, 0, 30, now(), now(), '<usuario-test>');
--   SELECT saldo_pendiente_usd, saf_disponible, saldo_actual FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado POST-FIX: saldo_pendiente_usd=0, saf_disponible=70,
--   -- saldo_actual=-70 (canonico: pendiente-saf = 0-70 = -70). CON EL BUG
--   -- (antes del fix): saldo_actual daba -130 (verify's caso numerico #2).
--
--   -- Caso B: SAFR anula un remanente de credito SAF de $100, sin deuda
--   -- asociada. Estado previo: pendiente=0, saf_disponible=100,
--   -- saldo_actual=-100 (canonico: 0-100=-100).
--   UPDATE clientes SET saldo_pendiente_usd = 0, saf_disponible = 100, saldo_actual = -100
--     WHERE id = '<cliente-test>';
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFR',
--      'TC6-SAFR', 100, 0, 100, now(), now(), '<usuario-test>');
--   SELECT saldo_pendiente_usd, saf_disponible, saldo_actual FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado POST-FIX: saldo_pendiente_usd=0 (sin cambios, SAFR no toca
--   -- pendiente), saf_disponible=0, saldo_actual=0 (canonico: 0-0=0). CON EL
--   -- BUG: saldo_actual daba -200 (verify's caso numerico #3).
--
--   -- Caso C: SAFV aplicado como metodo de pago en una venta POS ($100 de
--   -- credito consumido; la FAC asociada YA nacio neta del SAF, dejando
--   -- pendiente=50 ANTES de insertar esta fila SAFV — invariante
--   -- FAC-es-neto, migrations/0115). Estado previo: pendiente=50,
--   -- saf_disponible=100, saldo_actual=-50 (canonico: 50-100=-50).
--   UPDATE clientes SET saldo_pendiente_usd = 50, saf_disponible = 100, saldo_actual = -50
--     WHERE id = '<cliente-test>';
--   INSERT INTO movimientos_cuenta
--     (id, empresa_id, cliente_id, tipo, referencia, monto,
--      saldo_anterior, saldo_nuevo, fecha, created_at, created_by)
--   VALUES
--     (gen_random_uuid(), '<empresa-test>', '<cliente-test>', 'SAFV',
--      'TC6-SAFV', 100, 0, 100, now(), now(), '<usuario-test>');
--   SELECT saldo_pendiente_usd, saf_disponible, saldo_actual FROM clientes WHERE id = '<cliente-test>';
--   -- Esperado POST-FIX: saldo_pendiente_usd=50 (SIN CAMBIOS, SAFV no toca
--   -- pendiente — punto central del fix de 0115), saf_disponible=0,
--   -- saldo_actual=50 (canonico: 50-0=50). CON EL BUG: saldo_actual daba
--   -- -150 (verify's caso numerico #4).
--
--   -- Invariante general verificado en los 3 casos de este bloque:
--   -- saldo_actual = saldo_pendiente_usd - saf_disponible SIEMPRE se cumple
--   -- despues de cada INSERT, post-fix (lo que NO se cumplia antes: la
--   -- identidad canonica se rompia por 2x el delta de saf en cada uno).
-- ROLLBACK;
