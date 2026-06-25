-- Permitir venta sin stock como configuración por empresa, y desbloquear
-- stock negativo en `productos`.
--
-- Por defecto para Ferretería Chaco: TRUE (inventario progresivo cargado por
-- sectores, la venta nunca se bloquea por falta de stock).

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  IF to_regclass(format('%I.empresas', sch)) IS NULL THEN
    RAISE NOTICE '[stock-config] schema % sin tabla empresas; se omite.', sch;
    RETURN;
  END IF;

  -- 1) Columna en empresas (default true). Si ya existe, no se toca.
  EXECUTE format(
    'ALTER TABLE %I.empresas ADD COLUMN IF NOT EXISTS permitir_venta_sin_stock_default boolean NOT NULL DEFAULT true',
    sch
  );

  -- 2) Drop de cualquier CHECK que impida stock negativo en productos.
  --    (productos.stock_actual >= 0 / similar). Best-effort, sin romper.
  IF to_regclass(format('%I.productos', sch)) IS NOT NULL THEN
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = sch
          AND c.relname = 'productos'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%stock_actual%>=%0%'
      LOOP
        EXECUTE format('ALTER TABLE %I.productos DROP CONSTRAINT IF EXISTS %I', sch, r.conname);
        RAISE NOTICE '[stock-config] CHECK % removido de productos para habilitar stock negativo.', r.conname;
      END LOOP;
    END;
  END IF;

  RAISE NOTICE '[stock-config] config de venta sin stock aplicada en %.', sch;
END $$;
