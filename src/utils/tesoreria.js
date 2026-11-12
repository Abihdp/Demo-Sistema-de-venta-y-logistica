// Saldos de Tesorería separados en tres "lugares":
//   - Efectivo de Tesorería: efectivo y cheques.
//   - Cuenta Transferencia (cta 1.1.2): lo cobrado por transferencia.
//   - Banco (cta 1.1.3, p. ej. Banco Macro): lo cobrado con tarjeta de débito,
//     crédito y Mercado Pago.
//
// Son las mismas cuentas a las que ya imputa cada venta (ver PAGO_CTAS en
// PageTesoreria.jsx). Los nombres se toman del Plan de Cuentas, así los pueden
// cambiar desde Tesorería → "Plan de Cuentas" sin tocar código.

export const CTA_TRANSF = "112";
export const CTA_BANCO  = "113";

const NOMBRES_DEFAULT = {
  [CTA_TRANSF]: { viejo: "Banco / Transferencias",   fallback: "Cuenta Transferencia" },
  [CTA_BANCO]:  { viejo: "Tarjetas / Mercado Pago",  fallback: "Banco" },
};

function nombreCuenta(planCuentas, id) {
  const c = (planCuentas || []).find(p => String(p.id) === id);
  const n = (c?.nombre || "").trim();
  const d = NOMBRES_DEFAULT[id];
  return !n || n === d.viejo ? d.fallback : n;
}

export function nombresCuentas(planCuentas) {
  return { banco: nombreCuenta(planCuentas, CTA_BANCO), transferencia: nombreCuenta(planCuentas, CTA_TRANSF) };
}

// ── Fuente de un pago (campo `fuente` de gastos y compras) ──────────────────
//   caja_salon        → retiro de la caja abierta (no es Tesorería)
//   tesoreria         → efectivo/cheques de Tesorería
//   cta_transferencia → Cuenta Transferencia
//   banco             → banco (p. ej. Banco Macro)
//   sin_impacto       → otra cuenta no registrada en el sistema
// Registros viejos con fuente "tesoreria" pagados por transferencia/tarjeta
// (antes de existir las cuentas) se siguen ubicando según la forma de pago.
export const FUENTES_TESORERIA = ["tesoreria", "cta_transferencia", "banco"];
export const esFuenteTesoreria = (fuente) => FUENTES_TESORERIA.includes(fuente);

export function opcionesFuente(nombres = {}) {
  return [
    { value: "caja_salon",        label: "Caja Salón",                                       desc: "Sale como retiro de la caja abierta" },
    { value: "tesoreria",         label: "Efectivo de Tesorería",                            desc: "Efectivo o cheque guardado en Tesorería" },
    { value: "cta_transferencia", label: nombres.transferencia || "Cuenta Transferencia",    desc: "Transferencia desde esa cuenta" },
    { value: "banco",             label: nombres.banco || "Banco",                           desc: "Débito, transferencia o pago desde el banco" },
    { value: "sin_impacto",       label: "Sin movimiento propio",                            desc: "Tarjeta personal u otra cuenta no registrada aquí" },
  ];
}

export const etiquetaFuente = (fuente, nombres = {}) =>
  opcionesFuente(nombres).find(o => o.value === fuente)?.label || "";

// Formas de pago que tienen sentido para cada fuente. null = sin restricción.
export const MEDIOS_POR_FUENTE = {
  caja_salon:        ["Efectivo", "Transferencia"],   // lo único que Caja Salón sabe descontar
  tesoreria:         ["Efectivo", "Cheque"],
  cta_transferencia: ["Transferencia"],
  banco:             null,                             // débito, crédito, transferencia, cheque...
};
export function medioInvalidoParaFuente(fuente, formaPago) {
  if (fuente === "banco") return formaPago === "Efectivo";
  const permitidos = MEDIOS_POR_FUENTE[fuente];
  return Array.isArray(permitidos) && !permitidos.includes(formaPago);
}

// De qué lugar sale un egreso. Sin fuente explícita de cuenta (retiros de
// Tesorería, registros viejos), se deduce de la forma de pago.
export function lugarDeEgreso(fuente, formaPago) {
  if (fuente === "banco") return "banco";
  if (fuente === "cta_transferencia") return "transferencia";
  if (formaPago === "Transferencia") return "transferencia";
  if (/tarjeta|d[eé]bito|mercado/i.test(formaPago || "")) return "banco";
  return "efectivo";
}

// Parte de un cierre de caja que va a cada cuenta.
export const ingresoTransfDeCierre = (t) => t.montoTransf || 0;
export const ingresoBancoDeCierre = (t) => {
  const hasSplit = t.montoTarjetaD != null || t.montoTarjetaC != null;
  const tarj = hasSplit ? (t.montoTarjetaD || 0) + (t.montoTarjetaC || 0) : (t.montoTarjeta || 0);
  return tarj + (t.montoMpago || 0);
};

// Saldo a hoy (todo el historial). efectivo + transferencia + banco = total.
export function calcularSaldosTesoreria(tesoreria = [], gastos = [], compras = []) {
  const cajaMayor     = (tesoreria || []).filter(t => t.estado === "en_caja_mayor");
  const retiros       = (tesoreria || []).filter(t => t.tipo === "Retiro");
  const ingresosACaja = (tesoreria || []).filter(t => t.tipo === "Ingreso a Caja");
  const gastosT       = (gastos    || []).filter(g => esFuenteTesoreria(g.fuente) && g.estado !== "anulado");
  const comprasT      = (compras   || []).filter(c => esFuenteTesoreria(c.fuente) && c.estado !== "anulada");

  const total = cajaMayor.reduce((s, t) => s + t.monto, 0)
    - retiros.reduce((s, t) => s + t.monto, 0)
    - ingresosACaja.reduce((s, t) => s + t.monto, 0)
    - gastosT.reduce((s, g) => s + g.monto, 0)
    - comprasT.reduce((s, c) => s + c.total, 0);

  const egresosDe = (lugar) =>
      retiros.filter(r => lugarDeEgreso(null, r.formaPago) === lugar).reduce((s, t) => s + t.monto, 0)
    + gastosT.filter(g => lugarDeEgreso(g.fuente, g.formaPago) === lugar).reduce((s, g) => s + g.monto, 0)
    + comprasT.filter(c => lugarDeEgreso(c.fuente, c.formaPago) === lugar).reduce((s, c) => s + c.total, 0);

  const banco         = cajaMayor.reduce((s, t) => s + ingresoBancoDeCierre(t), 0)  - egresosDe("banco");
  const transferencia = cajaMayor.reduce((s, t) => s + ingresoTransfDeCierre(t), 0) - egresosDe("transferencia");

  return { total, banco, transferencia, efectivo: total - banco - transferencia };
}

// Saldo del que sale un pago, según la fuente elegida (y la forma de pago
// solo para registros sin cuenta explícita).
export function saldoDeFuente(saldos, fuente, formaPago, nombres = {}) {
  const lugar = fuente === "tesoreria" ? "efectivo" : lugarDeEgreso(fuente, formaPago);
  const donde = lugar === "banco"         ? (nombres.banco || "Banco")
              : lugar === "transferencia" ? (nombres.transferencia || "Cuenta Transferencia")
              : "efectivo de Tesorería";
  return { disponible: saldos?.[lugar] ?? 0, donde };
}
