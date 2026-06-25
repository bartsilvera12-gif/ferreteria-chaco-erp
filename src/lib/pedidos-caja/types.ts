/**
 * Pedido armado en /consulta y enviado al cajero para cobrar.
 *
 * Vive en `ferreteriachaco.pedidos_caja`. El vendedor elige a qué caja
 * (1, 2 o 3) lo manda. El cajero ve solo los de su caja en /ventas.
 */

export type EstadoPedidoCaja = "pendiente" | "facturado" | "cancelado";

export interface PedidoCajaItem {
  producto_id: string;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  precio_venta: number;
  tipo_precio: "minorista" | "mayorista";
}

export interface PedidoCaja {
  id: string;
  titulo: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  observacion: string | null;
  items: PedidoCajaItem[];
  total_estimado: number;
  estado: EstadoPedidoCaja;
  /** Caja a la que el vendedor mandó el pedido (1, 2 o 3). Null = cualquier caja. */
  caja_destino_numero: number | null;
  venta_id: string | null;
  venta_numero: string | null;
  armado_por_id: string | null;
  armado_por_email: string | null;
  created_at: string;
  facturado_at: string | null;
}
