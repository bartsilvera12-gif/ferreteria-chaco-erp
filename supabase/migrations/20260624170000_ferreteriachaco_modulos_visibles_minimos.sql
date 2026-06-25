-- Limpieza de módulos visibles para Ferretería Chaco.
-- Deja activos solo los módulos operativos del rubro ferretería; desactiva
-- (NO borra) los módulos del stack omnicanal/marketing/recetas/proyectos.
--
-- Reglas:
--   · No se borra ninguna tabla ni módulo del catálogo (`modulos`).
--   · Se siembra el módulo `reportes` si no existe.
--   · Para esta empresa, los slugs no listados quedan con `empresa_modulos.activo=false`.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
  empresa_uuid uuid;
  modulo_uuid uuid;
  slug_actual text;
  activos text[] := ARRAY[
    'dashboard',
    'ventas',
    'inventario',
    'clientes',
    'compras',
    'pagos',
    'reportes',
    'usuarios',
    'configuracion'
  ];
BEGIN
  IF to_regclass(format('%I.empresas', sch)) IS NULL THEN
    RAISE NOTICE '[modulos-min] schema % sin tabla empresas; se omite.', sch;
    RETURN;
  END IF;

  -- 1) Sembrar `reportes` en el catálogo de módulos si no existe.
  EXECUTE format(
    'INSERT INTO %I.modulos (id, nombre, slug)
     SELECT gen_random_uuid(), %L, %L
     WHERE NOT EXISTS (SELECT 1 FROM %I.modulos WHERE slug = %L)',
    sch, 'Reportes', 'reportes', sch, 'reportes'
  );

  -- 2) Para cada empresa, asegurar que los slugs activos estén en empresa_modulos con activo=true,
  --    y todos los demás del catálogo con activo=false.
  FOR empresa_uuid IN EXECUTE format('SELECT id FROM %I.empresas', sch) LOOP

    -- a) Insertar/activar los slugs activos
    FOREACH slug_actual IN ARRAY activos LOOP
      EXECUTE format(
        'SELECT id FROM %I.modulos WHERE slug = $1', sch
      ) INTO modulo_uuid USING slug_actual;

      IF modulo_uuid IS NULL THEN
        RAISE NOTICE '[modulos-min] slug % no existe en catálogo — se omite.', slug_actual;
        CONTINUE;
      END IF;

      EXECUTE format(
        'INSERT INTO %I.empresa_modulos (empresa_id, modulo_id, activo)
         VALUES ($1, $2, true)
         ON CONFLICT (empresa_id, modulo_id) DO UPDATE SET activo = true',
        sch
      ) USING empresa_uuid, modulo_uuid;
    END LOOP;

    -- b) Desactivar (activo=false) todos los módulos NO listados en `activos`.
    EXECUTE format(
      'UPDATE %I.empresa_modulos em
         SET activo = false
       WHERE empresa_id = $1
         AND modulo_id IN (
           SELECT m.id FROM %I.modulos m
            WHERE m.slug NOT IN (SELECT unnest($2::text[]))
         )',
      sch, sch
    ) USING empresa_uuid, activos;

    -- c) Para los slugs NO activos que NUNCA estuvieron en empresa_modulos,
    --    insertar fila explícita con activo=false (deja trazabilidad y bloquea aliases).
    EXECUTE format(
      'INSERT INTO %I.empresa_modulos (empresa_id, modulo_id, activo)
       SELECT $1, m.id, false
         FROM %I.modulos m
        WHERE m.slug NOT IN (SELECT unnest($2::text[]))
          AND NOT EXISTS (
            SELECT 1 FROM %I.empresa_modulos em
             WHERE em.empresa_id = $1 AND em.modulo_id = m.id
          )',
      sch, sch, sch
    ) USING empresa_uuid, activos;

  END LOOP;

  -- 3) Limpiar `usuario_modulos` global del admin para que vea todo lo activo
  --    de la empresa (vacío = ve todo). Los cajeros se restringen en SQL aparte.
  EXECUTE format(
    'DELETE FROM %I.usuario_modulos um
      USING %I.usuarios u
      WHERE um.usuario_id = u.id
        AND lower(u.email) = ''admin@ferreteriachaco.com''',
    sch, sch
  );

  RAISE NOTICE '[modulos-min] limpieza de modulos visibles aplicada en %.', sch;
END $$;

-- Verificación: módulos activos por empresa.
SELECT m.slug, em.activo
FROM ferreteriachaco.empresa_modulos em
JOIN ferreteriachaco.modulos m ON m.id = em.modulo_id
ORDER BY em.activo DESC, m.slug;
