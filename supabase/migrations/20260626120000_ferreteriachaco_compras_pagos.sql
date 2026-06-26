-- Tabla compras_pagos: cuotas/pagos a proveedores asociados a una compra a crédito
-- (numero_control). El endpoint /api/compras/cuentas-por-pagar ya consultaba esta
-- tabla, pero no existía en ningún esquema; este script la crea en ferreteriachaco.

DO $$
DECLARE
  sch text := 'ferreteriachaco';
BEGIN
  IF to_regclass(format('%I.compras', sch)) IS NULL THEN
    RAISE NOTICE '[compras_pagos] schema % sin tabla compras; se omite.', sch;
    RETURN;
  END IF;

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS %I.compras_pagos (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id      uuid NOT NULL,
      numero_control  text NOT NULL,
      monto           numeric(14,2) NOT NULL CHECK (monto > 0),
      fecha_pago      date NOT NULL DEFAULT CURRENT_DATE,
      metodo          text,
      nota            text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      created_by      uuid
    )
  $f$, sch);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS ix_compras_pagos_empresa_numero ON %I.compras_pagos (empresa_id, numero_control)',
    sch
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS ix_compras_pagos_empresa_fecha ON %I.compras_pagos (empresa_id, fecha_pago)',
    sch
  );

  RAISE NOTICE '[compras_pagos] tabla lista en %.', sch;
END $$;
