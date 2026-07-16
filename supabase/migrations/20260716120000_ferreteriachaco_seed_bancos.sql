-- =============================================================================
-- Ferretería Chaco — seed de bancos en entidades_bancarias
-- =============================================================================
-- Inserta los bancos plaza Paraguay + una entrada "Otro" para casos no listados.
-- Idempotente por (empresa_id, lower(codigo)) — usa el índice único ya existente.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
  eid uuid;
BEGIN
  SELECT id INTO eid FROM public.empresas ORDER BY created_at ASC LIMIT 1;
  IF eid IS NULL THEN
    RAISE NOTICE '[seed bancos] no hay empresa cargada — salto seed';
    RETURN;
  END IF;

  EXECUTE format($f$
    INSERT INTO %I.entidades_bancarias (empresa_id, codigo, nombre, tipo, activo, orden)
    VALUES
      ($1, '001', 'Banco BASA S.A.',                                                'banco', true, 10),
      ($1, '002', 'BANCO ITAU',                                                     'banco', true, 20),
      ($1, '003', 'BANCO UENO',                                                     'banco', true, 30),
      ($1, '004', 'BANCO FAMILIAR',                                                 'banco', true, 40),
      ($1, '005', 'BANCO SUDAMERIS',                                                'banco', true, 50),
      ($1, '006', 'BANCO CONTINENTAL',                                              'banco', true, 60),
      ($1, '007', 'BANCO ATLAS',                                                    'banco', true, 70),
      ($1, '008', 'Bancop (Banco para la Comercialización y la Producción S.A.)',   'banco', true, 80),
      ($1, '999', 'Otro',                                                           'otro',  true, 999)
    ON CONFLICT (empresa_id, lower(codigo)) WHERE codigo IS NOT NULL AND codigo <> '' DO NOTHING
  $f$, sch) USING eid;
END $$;
