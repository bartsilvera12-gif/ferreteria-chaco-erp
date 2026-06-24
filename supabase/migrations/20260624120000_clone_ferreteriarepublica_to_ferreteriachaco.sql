-- Clona la estructura del esquema `ferreteriarepublica` dentro de un esquema
-- nuevo `ferreteriachaco`. Todas las referencias internas (FKs, defaults de
-- secuencias, cuerpos de funciones/vistas/triggers/policies) se reescriben para
-- que `ferreteriachaco` sea autocontenido y no dependa de otros esquemas.
--
-- Estructura únicamente (sin filas).

DO $clone$
DECLARE
  src text := 'ferreteriarepublica';
  dst text := 'ferreteriachaco';
  r   record;
  def text;
  pending text[];
  next_pending text[];
  fndef text;
  pass int := 0;
  last_error text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = src) THEN
    RAISE EXCEPTION 'El esquema origen % no existe', src;
  END IF;

  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', dst);
  EXECUTE format('CREATE SCHEMA %I', dst);

  -- 1) Dominios
  FOR r IN
    SELECT t.typname,
           pg_catalog.format_type(t.typbasetype, t.typtypmod) AS base_type,
           t.typnotnull,
           pg_get_expr(t.typdefaultbin, 0) AS default_expr
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = src AND t.typtype = 'd'
  LOOP
    def := format('CREATE DOMAIN %I.%I AS %s', dst, r.typname, r.base_type);
    IF r.default_expr IS NOT NULL THEN
      def := def || ' DEFAULT ' || r.default_expr;
    END IF;
    IF r.typnotnull THEN
      def := def || ' NOT NULL';
    END IF;
    EXECUTE def;
  END LOOP;

  -- 2) Tipos enum
  FOR r IN
    SELECT t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = src AND t.typtype = 'e'
    GROUP BY t.typname
  LOOP
    EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', dst, r.typname, r.labels);
  END LOOP;

  -- 3) Tipos compuestos
  FOR r IN
    SELECT t.typname, t.oid
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = src AND t.typtype = 'c'
      AND t.typrelid IN (SELECT oid FROM pg_class WHERE relkind = 'c')
  LOOP
    SELECT string_agg(
             format('%I %s', a.attname,
                    replace(pg_catalog.format_type(a.atttypid, a.atttypmod),
                            src || '.', dst || '.')),
             ', ' ORDER BY a.attnum)
      INTO def
    FROM pg_attribute a
    WHERE a.attrelid = (SELECT typrelid FROM pg_type WHERE oid = r.oid)
      AND a.attnum > 0 AND NOT a.attisdropped;
    EXECUTE format('CREATE TYPE %I.%I AS (%s)', dst, r.typname, def);
  END LOOP;

  -- 4) Secuencias (estructura; el valor actual no se replica)
  FOR r IN
    SELECT c.relname AS seqname,
           s.seqtypid::regtype::text AS data_type,
           s.seqstart, s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle
    FROM pg_sequence s
    JOIN pg_class c ON c.oid = s.seqrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src
  LOOP
    EXECUTE format(
      'CREATE SEQUENCE %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s',
      dst, r.seqname, r.data_type, r.seqincrement, r.seqmin, r.seqmax,
      r.seqstart, r.seqcache, CASE WHEN r.seqcycle THEN 'CYCLE' ELSE 'NO CYCLE' END
    );
  END LOOP;

  -- 5) Tablas (estructura + defaults + checks + identity + indexes + storage)
  --    Las FKs no se copian con LIKE; se agregan después reescribiendo el esquema.
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'CREATE TABLE %I.%I (LIKE %I.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING IDENTITY INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)',
      dst, r.tablename, src, r.tablename
    );
  END LOOP;

  -- 6) Reapuntar DEFAULTs que usan secuencias del esquema origen al nuevo
  FOR r IN
    SELECT c.relname AS tablename,
           a.attname AS colname,
           replace(pg_get_expr(ad.adbin, ad.adrelid), src || '.', dst || '.') AS new_default
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = dst
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%' || src || '.%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
                   dst, r.tablename, r.colname, r.new_default);
  END LOOP;

  -- 7) Asignar ownership de secuencias a sus columnas (OWNED BY)
  FOR r IN
    SELECT seq.relname AS seqname,
           tab.relname AS tablename,
           a.attname   AS colname
    FROM pg_class seq
    JOIN pg_namespace n ON n.oid = seq.relnamespace
    JOIN pg_depend d ON d.objid = seq.oid AND d.classid = 'pg_class'::regclass
    JOIN pg_class tab ON tab.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = tab.relnamespace
    JOIN pg_attribute a ON a.attrelid = tab.oid AND a.attnum = d.refobjsubid
    WHERE n.nspname = src AND seq.relkind = 'S' AND tn.nspname = src
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNED BY %I.%I.%I',
                   dst, r.seqname, dst, r.tablename, r.colname);
  END LOOP;

  -- 8) Primary keys, unique, exclude, foreign keys (reescritos)
  FOR r IN
    SELECT c.conname,
           rel.relname AS tablename,
           c.contype,
           replace(pg_get_constraintdef(c.oid), src || '.', dst || '.') AS condef
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = src
      AND c.contype IN ('p', 'u', 'f', 'x')
    ORDER BY CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'x' THEN 3 ELSE 4 END
  LOOP
    -- Saltar si ya existe (LIKE INCLUDING CONSTRAINTS pudo haber traído algo similar con nombre auto)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c2
      JOIN pg_class rc ON rc.oid = c2.conrelid
      JOIN pg_namespace nc ON nc.oid = rc.relnamespace
      WHERE nc.nspname = dst AND rc.relname = r.tablename AND c2.conname = r.conname
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
                     dst, r.tablename, r.conname, r.condef);
    END IF;
  END LOOP;

  -- 9) Índices que no son de constraint (LIKE INCLUDING INDEXES copia los simples,
  --    pero los con WHERE / expresiones a veces requieren reescritura explícita)
  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx_oid_name,
           ic.relname AS idxname,
           tc.relname AS tablename,
           replace(pg_get_indexdef(i.indexrelid), src || '.', dst || '.') AS idxdef
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = ic.relnamespace
    WHERE n.nspname = src
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class ic2
      JOIN pg_namespace nc ON nc.oid = ic2.relnamespace
      WHERE nc.nspname = dst AND ic2.relname = r.idxname AND ic2.relkind IN ('i','I')
    ) THEN
      EXECUTE r.idxdef;
    END IF;
  END LOOP;

  -- 10) Vistas
  FOR r IN
    SELECT c.relname AS viewname,
           replace(pg_get_viewdef(c.oid, true), src || '.', dst || '.') AS viewdef
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND c.relkind = 'v'
  LOOP
    EXECUTE format('CREATE VIEW %I.%I AS %s', dst, r.viewname, r.viewdef);
  END LOOP;

  -- 11) Vistas materializadas
  FOR r IN
    SELECT c.relname AS mvname,
           replace(pg_get_viewdef(c.oid, true), src || '.', dst || '.') AS mvdef
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND c.relkind = 'm'
  LOOP
    EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s WITH NO DATA', dst, r.mvname, r.mvdef);
  END LOOP;

  -- 12) Funciones y procedimientos.
  --     Las funciones SQL validan su cuerpo al crearse, así que pueden fallar
  --     por forward references. Reintentamos en pasadas hasta que converja.
  --     Además reescribimos `SET search_path TO '<otro_esquema>'` para que
  --     apunte a ferreteriachaco (self-containment).
  SELECT array_agg(
    regexp_replace(
      replace(pg_get_functiondef(p.oid), src || '.', dst || '.'),
      'SET\s+search_path\s+TO\s+''[^'']*''',
      'SET search_path TO ''' || dst || '''',
      'gi'
    )
  )
  INTO pending
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = src AND p.prokind IN ('f', 'p');

  WHILE pending IS NOT NULL AND array_length(pending, 1) > 0 AND pass < 10 LOOP
    pass := pass + 1;
    next_pending := ARRAY[]::text[];
    FOREACH fndef IN ARRAY pending LOOP
      BEGIN
        EXECUTE fndef;
      EXCEPTION WHEN OTHERS THEN
        last_error := SQLERRM;
        next_pending := next_pending || fndef;
      END;
    END LOOP;
    IF array_length(next_pending, 1) = array_length(pending, 1) THEN
      RAISE EXCEPTION 'No se pudo resolver dependencias de funciones tras % pasadas. Último error: %', pass, last_error;
    END IF;
    pending := next_pending;
  END LOOP;

  -- 13) Triggers
  FOR r IN
    SELECT t.tgname,
           c.relname AS tablename,
           replace(pg_get_triggerdef(t.oid), src || '.', dst || '.') AS tgdef
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND NOT t.tgisinternal
  LOOP
    EXECUTE r.tgdef;
  END LOOP;

  -- 14) Políticas RLS
  FOR r IN
    SELECT c.relname AS tablename, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', dst, r.tablename);
    IF r.relforcerowsecurity THEN
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', dst, r.tablename);
    END IF;
  END LOOP;

  FOR r IN
    SELECT pol.polname,
           c.relname AS tablename,
           pol.polcmd,
           pol.polpermissive,
           ARRAY(SELECT rolname::text FROM pg_roles WHERE oid = ANY(pol.polroles)) AS roles,
           replace(pg_get_expr(pol.polqual, pol.polrelid), src || '.', dst || '.') AS using_expr,
           replace(pg_get_expr(pol.polwithcheck, pol.polrelid), src || '.', dst || '.') AS check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src
  LOOP
    def := format('CREATE POLICY %I ON %I.%I AS %s FOR %s',
                  r.polname, dst, r.tablename,
                  CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                  CASE r.polcmd
                    WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                    ELSE 'ALL' END);
    IF array_length(r.roles, 1) IS NOT NULL AND NOT (r.roles = ARRAY['public']) THEN
      def := def || ' TO ' || array_to_string(
        ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) AS x), ', ');
    END IF;
    IF r.using_expr IS NOT NULL THEN
      def := def || ' USING (' || r.using_expr || ')';
    END IF;
    IF r.check_expr IS NOT NULL THEN
      def := def || ' WITH CHECK (' || r.check_expr || ')';
    END IF;
    EXECUTE def;
  END LOOP;

  -- 15) Comentarios en tablas, columnas, vistas, funciones
  FOR r IN
    SELECT format('COMMENT ON TABLE %I.%I IS %L',
                  dst, c.relname,
                  obj_description(c.oid, 'pg_class')) AS stmt
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = src AND c.relkind IN ('r','v','m')
      AND obj_description(c.oid, 'pg_class') IS NOT NULL
  LOOP
    EXECUTE r.stmt;
  END LOOP;

  FOR r IN
    SELECT format('COMMENT ON COLUMN %I.%I.%I IS %L',
                  dst, c.relname, a.attname,
                  col_description(c.oid, a.attnum)) AS stmt
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = src AND c.relkind IN ('r','v','m')
      AND a.attnum > 0 AND NOT a.attisdropped
      AND col_description(c.oid, a.attnum) IS NOT NULL
  LOOP
    EXECUTE r.stmt;
  END LOOP;

END
$clone$;
