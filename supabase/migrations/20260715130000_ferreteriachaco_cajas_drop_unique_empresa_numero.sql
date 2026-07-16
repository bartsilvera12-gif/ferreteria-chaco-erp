-- =============================================================================
-- Ferretería Chaco — arreglo de constraint que impide reabrir la caja
-- =============================================================================
-- La tabla `cajas` tenía DOS constraints de unicidad sobre (empresa_id, numero_caja):
--
--   1) uq_cajas_empresa_numero      → UNIQUE full (sin filtro por estado)
--   2) uq_cajas_una_abierta_por_numero → UNIQUE parcial WHERE estado='abierta'
--
-- El (1) impide insertar una nueva caja para el mismo numero_caja aunque las
-- anteriores estén cerradas — bloqueando reabrir la caja al día siguiente.
-- El (2) es el que realmente enforza el invariante correcto ("una sola abierta
-- por estación") sin bloquear el historial.
--
-- Esta migración quita (1). El INSERT en abrirCajaPg deja de fallar con 23505
-- cuando existen cajas cerradas previas.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  EXECUTE format('ALTER TABLE %I.cajas DROP CONSTRAINT IF EXISTS uq_cajas_empresa_numero', sch);
END $$;
