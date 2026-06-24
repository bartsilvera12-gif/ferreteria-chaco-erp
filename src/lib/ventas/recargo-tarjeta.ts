/**
 * Recargo automático para pagos con tarjeta (Ferretería Chaco).
 * El precio base de cada producto es el precio contado — se usa para efectivo y
 * transferencia. Cuando el cobro es con tarjeta, se aplica este recargo sobre el total.
 */

export const CARD_SURCHARGE_PCT = 0.04;

export type MetodoPagoTarjetable = "efectivo" | "tarjeta" | "transferencia" | string;

export function aplicaRecargoTarjeta(metodoPago: MetodoPagoTarjetable | null | undefined): boolean {
  return (metodoPago ?? "").toLowerCase() === "tarjeta";
}

export function calcularRecargoTarjeta(totalContado: number, metodoPago: MetodoPagoTarjetable | null | undefined): number {
  if (!aplicaRecargoTarjeta(metodoPago)) return 0;
  if (!Number.isFinite(totalContado) || totalContado <= 0) return 0;
  return Math.round(totalContado * CARD_SURCHARGE_PCT);
}

export function totalConRecargo(totalContado: number, metodoPago: MetodoPagoTarjetable | null | undefined): number {
  return totalContado + calcularRecargoTarjeta(totalContado, metodoPago);
}
