-- Asignación de caja por cajero: cada cajero tiene su Caja (1, 2 o 3).
-- Null = sin asignar = ve las 3 cajas (comportamiento actual para admin).
-- Reglas de negocio:
--   · Solo un cajero por número de caja activa (no exclusivo en DB; el negocio
--     decide quién opera qué turno). Si dos usuarios tienen la misma asignación,
--     ambos pueden trabajar en la misma caja.
--   · Si el usuario NO tiene asignación → cae al comportamiento anterior:
--     CajaControlPanel muestra las 3 cards, /ventas/nueva no preselecciona.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  IF to_regclass(format('%I.usuarios', sch)) IS NULL THEN
    RAISE NOTICE '[caja-asignada] schema % sin tabla usuarios; se omite.', sch;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.usuarios ADD COLUMN IF NOT EXISTS numero_caja_asignada smallint',
    sch
  );

  BEGIN
    EXECUTE format('ALTER TABLE %I.usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_caja_asignada', sch);
    EXECUTE format(
      'ALTER TABLE %I.usuarios ADD CONSTRAINT chk_usuarios_caja_asignada CHECK (numero_caja_asignada IS NULL OR numero_caja_asignada BETWEEN 1 AND 3)',
      sch
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[caja-asignada] no se pudo agregar CHECK: %', SQLERRM;
  END;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS ix_usuarios_caja_asignada ON %I.usuarios (empresa_id, numero_caja_asignada) WHERE numero_caja_asignada IS NOT NULL',
    sch
  );

  RAISE NOTICE '[caja-asignada] columna numero_caja_asignada lista en %.', sch;
END $$;

-- Asignación sugerida (idempotente — solo si el usuario existe).
UPDATE ferreteriachaco.usuarios SET numero_caja_asignada = 1
 WHERE lower(email) = 'cajero1@ferreteriachaco.com' AND numero_caja_asignada IS NULL;
UPDATE ferreteriachaco.usuarios SET numero_caja_asignada = 2
 WHERE lower(email) = 'cajero2@ferreteriachaco.com' AND numero_caja_asignada IS NULL;
UPDATE ferreteriachaco.usuarios SET numero_caja_asignada = 3
 WHERE lower(email) = 'cajero3@ferreteriachaco.com' AND numero_caja_asignada IS NULL;
