-- =============================================================================
-- Ferretería Chaco — permitir numero_caja=0 (caja del admin)
-- =============================================================================
-- Los cajeros siguen usando estaciones 1..3. El admin opera con una caja
-- separada, numero_caja=0, para que su flujo de efectivo no se mezcle con
-- ninguna estación de cajero.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  EXECUTE format('ALTER TABLE %I.cajas DROP CONSTRAINT IF EXISTS chk_cajas_numero_rango', sch);
  EXECUTE format('ALTER TABLE %I.cajas ADD CONSTRAINT chk_cajas_numero_rango CHECK (numero_caja BETWEEN 0 AND 3)', sch);
END $$;
