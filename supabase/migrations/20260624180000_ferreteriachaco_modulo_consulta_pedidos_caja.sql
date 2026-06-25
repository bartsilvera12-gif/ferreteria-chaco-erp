-- Módulo "Consulta y envío a caja" (slug `consulta`) para Ferretería Chaco.
-- Tabla pedidos_caja: el vendedor de salón arma un pedido en /consulta,
-- elige a qué caja (1/2/3) lo envía, y el cajero lo ve en /ventas para
-- facturar de una. Estados: pendiente | facturado | cancelado.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  IF to_regclass(format('%I.empresas', sch)) IS NULL THEN
    RAISE NOTICE '[consulta] schema % sin tabla empresas; se omite.', sch;
    RETURN;
  END IF;

  -- 1) Tabla pedidos_caja
  IF to_regclass(format('%I.pedidos_caja', sch)) IS NULL THEN
    EXECUTE format($ddl$
      CREATE TABLE %I.pedidos_caja (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        titulo text NOT NULL,
        cliente_id uuid REFERENCES %I.clientes(id) ON DELETE SET NULL,
        cliente_nombre text,
        cliente_telefono text,
        observacion text,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_estimado numeric(14,2) NOT NULL DEFAULT 0,
        estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','facturado','cancelado')),
        caja_destino_numero smallint CHECK (caja_destino_numero BETWEEN 1 AND 3),
        venta_id uuid,
        venta_numero text,
        armado_por_id uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
        armado_por_email text,
        cancelado_por_id uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
        cancelado_motivo text,
        cancelado_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        facturado_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    $ddl$, sch, sch, sch, sch, sch);
  ELSE
    -- migración aditiva: agregar caja_destino_numero si la tabla ya existía
    EXECUTE format('ALTER TABLE %I.pedidos_caja ADD COLUMN IF NOT EXISTS caja_destino_numero smallint', sch);
    BEGIN
      EXECUTE format('ALTER TABLE %I.pedidos_caja DROP CONSTRAINT IF EXISTS chk_pedidos_caja_destino', sch);
      EXECUTE format('ALTER TABLE %I.pedidos_caja ADD CONSTRAINT chk_pedidos_caja_destino CHECK (caja_destino_numero IS NULL OR caja_destino_numero BETWEEN 1 AND 3)', sch);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[consulta] no se pudo agregar CHECK destino: %', SQLERRM;
    END;
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS ix_pedidos_caja_empresa_estado ON %I.pedidos_caja (empresa_id, estado, created_at DESC)', sch);
  EXECUTE format('CREATE INDEX IF NOT EXISTS ix_pedidos_caja_armado_por ON %I.pedidos_caja (empresa_id, armado_por_id, created_at DESC)', sch);
  EXECUTE format('CREATE INDEX IF NOT EXISTS ix_pedidos_caja_destino ON %I.pedidos_caja (empresa_id, caja_destino_numero, estado)', sch);

  EXECUTE format('ALTER TABLE %I.pedidos_caja ENABLE ROW LEVEL SECURITY', sch);
  EXECUTE format('DROP POLICY IF EXISTS pedidos_caja_select ON %I.pedidos_caja', sch);
  EXECUTE format('CREATE POLICY pedidos_caja_select ON %I.pedidos_caja FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, sch);
  EXECUTE format('DROP POLICY IF EXISTS pedidos_caja_insert ON %I.pedidos_caja', sch);
  EXECUTE format('CREATE POLICY pedidos_caja_insert ON %I.pedidos_caja FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, sch);
  EXECUTE format('DROP POLICY IF EXISTS pedidos_caja_update ON %I.pedidos_caja', sch);
  EXECUTE format('CREATE POLICY pedidos_caja_update ON %I.pedidos_caja FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, sch, sch);
  EXECUTE format('DROP POLICY IF EXISTS pedidos_caja_delete ON %I.pedidos_caja', sch);
  EXECUTE format('CREATE POLICY pedidos_caja_delete ON %I.pedidos_caja FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))', sch, sch);

  EXECUTE format('DROP TRIGGER IF EXISTS tr_pedidos_caja_updated ON %I.pedidos_caja', sch);
  EXECUTE format('CREATE TRIGGER tr_pedidos_caja_updated BEFORE UPDATE ON %I.pedidos_caja FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()', sch, sch);

  -- 2) Catálogo modulos: agregar slug `consulta` y activarlo para las empresas.
  EXECUTE format(
    'INSERT INTO %I.modulos (id, nombre, slug)
     SELECT gen_random_uuid(), %L, %L
     WHERE NOT EXISTS (SELECT 1 FROM %I.modulos WHERE slug = %L)',
    sch, 'Consulta', 'consulta', sch, 'consulta'
  );

  DECLARE
    mid uuid;
  BEGIN
    EXECUTE format('SELECT id FROM %I.modulos WHERE slug = ''consulta''', sch) INTO mid;
    IF mid IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO %I.empresa_modulos (empresa_id, modulo_id, activo)
         SELECT e.id, $1, true FROM %I.empresas e
         ON CONFLICT (empresa_id, modulo_id) DO UPDATE SET activo = true',
        sch, sch
      ) USING mid;
    END IF;
  END;

  RAISE NOTICE '[consulta] modulo pedidos_caja aplicado en %.', sch;
END $$;
