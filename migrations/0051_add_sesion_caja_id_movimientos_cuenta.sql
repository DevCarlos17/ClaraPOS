-- Migration: 0051_add_sesion_caja_id_movimientos_cuenta
-- Vincula movimientos_cuenta (tipo='SAF') con la sesion de caja en la que se aplicaron.
-- Usado por el cuadre de caja para sumar SAF por sesion y mostrar el desglose en el cierre.
-- Nullable, sin DEFAULT. Registros previos a esta migracion conservan sesion_caja_id = NULL.
-- Rollback: ALTER TABLE movimientos_cuenta DROP COLUMN sesion_caja_id;

ALTER TABLE movimientos_cuenta ADD COLUMN sesion_caja_id TEXT;
