-- ============================================================
-- Ferretería Chaco: limpieza de productos duplicados y con precios inválidos.
--
-- Contexto: importaciones repetidas del mismo Excel con SKUs auto-generados
-- distintos por corrida dejaron múltiples copias del mismo producto. Algunas
-- copias además tienen precio_venta corrupto (valores como -4.59e14).
--
-- Regla del "keeper" por grupo (empresa_id + UPPER(TRIM(nombre))):
--   1) precio_venta entre 1 y 100.000.000 primero
--   2) mayor stock_actual
--   3) más antiguo (created_at ASC)
--   4) menor id (desempate estable)
--
-- Se ejecuta en transacción; si algún FK bloquea el DELETE, revierte todo.
-- ============================================================

BEGIN;

-- 1) Snapshot de conteos previos (visible en el log de la migración)
DO $$
DECLARE
  total_prev integer;
  grupos_dup integer;
BEGIN
  SELECT COUNT(*) INTO total_prev FROM ferreteriachaco.productos;
  SELECT COUNT(*) INTO grupos_dup FROM (
    SELECT 1 FROM ferreteriachaco.productos
    GROUP BY empresa_id, UPPER(TRIM(nombre))
    HAVING COUNT(*) > 1
  ) g;
  RAISE NOTICE 'Antes: % productos, % grupos duplicados', total_prev, grupos_dup;
END $$;

-- 2) Borrar duplicados quedándose con el keeper por grupo
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY empresa_id, UPPER(TRIM(nombre))
      ORDER BY
        CASE WHEN precio_venta > 0 AND precio_venta < 100000000 THEN 0 ELSE 1 END,
        stock_actual DESC NULLS LAST,
        created_at ASC,
        id ASC
    ) AS rn
  FROM ferreteriachaco.productos
)
DELETE FROM ferreteriachaco.productos p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 3) Snapshot de conteos post-limpieza
DO $$
DECLARE
  total_post integer;
  grupos_dup integer;
  precio_delir integer;
BEGIN
  SELECT COUNT(*) INTO total_post FROM ferreteriachaco.productos;
  SELECT COUNT(*) INTO grupos_dup FROM (
    SELECT 1 FROM ferreteriachaco.productos
    GROUP BY empresa_id, UPPER(TRIM(nombre))
    HAVING COUNT(*) > 1
  ) g;
  SELECT COUNT(*) INTO precio_delir
    FROM ferreteriachaco.productos
    WHERE precio_venta >= 100000000 OR precio_venta < 0;
  RAISE NOTICE 'Después: % productos, % grupos duplicados restantes, % con precio delirante restante',
    total_post, grupos_dup, precio_delir;
END $$;

COMMIT;
