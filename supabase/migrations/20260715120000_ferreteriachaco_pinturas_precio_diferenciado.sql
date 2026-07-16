-- Ferretería Chaco: precio diferenciado para pinturas (efectivo vs tarjeta).
-- Se agregan 3 columnas a productos:
--   es_pintura       — flag manual del producto; si true la UI de venta
--                      usa precio_efectivo/precio_tarjeta según método
--                      y EXCLUYE la línea del recargo global del 4%.
--   precio_efectivo  — precio para efectivo/transferencia (opcional).
--   precio_tarjeta   — precio para tarjeta (opcional).
-- Idempotente.

ALTER TABLE ferreteriachaco.productos
  ADD COLUMN IF NOT EXISTS es_pintura boolean NOT NULL DEFAULT false;

ALTER TABLE ferreteriachaco.productos
  ADD COLUMN IF NOT EXISTS precio_efectivo numeric;

ALTER TABLE ferreteriachaco.productos
  ADD COLUMN IF NOT EXISTS precio_tarjeta numeric;
