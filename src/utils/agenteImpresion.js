import { fmt, fmtFechaAR, fmtHoraAR, pagosDeVenta } from "./helpers";

const AGENTE_BASE = "http://localhost:9100";
const TIMEOUT_MS = 1500;

export const IMPRESORA_LOCALSTORAGE_KEY = "peco_impresora_ticket";

async function enviarAlAgente(ticket) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${AGENTE_BASE}/imprimir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ticket),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// Impresora elegida a mano en el selector de la barra superior (para PCs que
// rotan entre mostradores) — si no eligieron ninguna, el agente sigue solo a
// la predeterminada de Windows o a lo que diga su config.json.
function impresoraSeleccionada() {
  return localStorage.getItem(IMPRESORA_LOCALSTORAGE_KEY) || null;
}

// Lista las impresoras instaladas en esta PC (vía el agente local). Devuelve
// null si el agente no está corriendo — lo usa el selector para saber si
// mostrarse o no.
export async function listarImpresoras() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${AGENTE_BASE}/impresoras`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Si el agente local (instalado en la PC de la caja) está corriendo, imprime
// directo a la impresora térmica sin diálogo de Windows. Si no está instalado
// o no responde, cae al comportamiento de siempre (window.print()) para no
// romper nada en las PCs que todavía no lo tienen configurado.
async function imprimir(ticket) {
  const impresora = impresoraSeleccionada();
  const ok = await enviarAlAgente(impresora ? { ...ticket, impresora } : ticket);
  if (!ok) window.print();
}

export async function imprimirTicketVenta(venta, cambios = [], esRegalo = false, logoBase64 = null) {
  const lineas = [
    { texto: "PECO'S", align: "center", bold: true, grande: true },
    { texto: "Sistema de Gestion Comercial", align: "center" },
    { separador: true },
    { par: ["Fecha", `${fmtFechaAR(venta.fecha)}${venta.createdAt ? ` - ${fmtHoraAR(venta.createdAt)}` : ""}`] },
  ];

  if (venta.id) lineas.push({ par: ["Comprobante", `N° ${String(venta.id).padStart(6, "0")}`] });
  if (venta.usuario) lineas.push({ par: ["Atendio", venta.usuario] });

  lineas.push({ separador: true });
  lineas.push({ par: ["Cliente", venta.cliente || ""] });

  if (!esRegalo) {
    if (venta.pagos && venta.pagos.length > 1) {
      venta.pagos.forEach((p, i) => {
        lineas.push({ par: [i === 0 ? "Pago" : "", `${p.formaPago}: ${fmt(p.monto)}`] });
      });
    } else {
      lineas.push({ par: ["Pago", venta.formaPago || ""] });
    }

    if (venta.pagos?.[0]?.tarjetaNombre) {
      const p = venta.pagos[0];
      lineas.push({
        par: ["Tarjeta", `${p.tarjetaNombre} - ${p.cuotas} cuota${p.cuotas !== 1 ? "s" : ""}${p.interesPct > 0 ? ` (+${p.interesPct}%)` : ""}`],
      });
    }
  }

  lineas.push({ par: ["Tipo", venta.tipo || ""] });
  lineas.push({ separador: true });

  if (venta.esSeña || esRegalo) {
    lineas.push({
      texto: esRegalo
        ? "TICKET DE REGALO - VALIDO PARA CAMBIO"
        : (venta.estado === "pendiente" ? "SEÑA / RESERVA - PENDIENTE DE RETIRO" : "SEÑA / RESERVA"),
      align: "center",
      bold: true,
    });
  }

  if (!esRegalo && venta.estado === "pendiente") {
    const señado = pagosDeVenta(venta).reduce((a, p) => a + p.monto, 0);
    lineas.push({ par: ["Total factura", fmt(venta.total)] });
    lineas.push({ par: ["Seña", fmt(señado)] });
    lineas.push({ par: ["Saldo pendiente", fmt(Math.max(0, venta.total - señado))] });
    lineas.push({ separador: true });
  }

  (venta.items || []).forEach(item => {
    const qtyCambiada = cambios
      .filter(c => c.estado !== "anulada" && c.itemViejo?.nombre === item.nombre)
      .reduce((a, c) => a + (c.itemViejo?.qty || 0), 0);
    const cambiado = qtyCambiada > 0;
    const nombre = `${item.qty}x ${item.nombre}${cambiado ? " (cambiado)" : ""}`;
    if (esRegalo) {
      lineas.push({ texto: nombre });
    } else {
      lineas.push({ par: [nombre, fmt(item.precio * item.qty)] });
    }
  });

  lineas.push({ separador: true });

  if (esRegalo) {
    lineas.push({ texto: "Sin valor fiscal - No indica precios", align: "center" });
  } else {
    lineas.push({ par: ["TOTAL", fmt(venta.total)], bold: true, grande: true });
  }

  lineas.push({ separador: true });
  lineas.push({ texto: "¡GRACIAS POR SU COMPRA!", align: "center", bold: true });
  lineas.push({
    texto: esRegalo ? "Presenta este comprobante para cambios" : "Conserva este comprobante",
    align: "center",
  });

  return imprimir({ ancho: 32, logoBase64, lineas });
}

export async function imprimirComprobanteCambio(cambio, logoBase64 = null) {
  const lista = Array.isArray(cambio) ? cambio : [cambio];
  const primero = lista[0];
  const diferencia = lista.reduce((a, c) => a + (c.diferencia || 0), 0);
  const esNotaCredito = diferencia < 0;
  const esNotaDebito = diferencia > 0;
  const tipoLabel = esNotaCredito ? "Nota de Credito" : esNotaDebito ? "Nota de Debito" : "Comprobante de Cambio";

  const lineas = [
    { texto: "PECO'S", align: "center", bold: true, grande: true },
    { texto: tipoLabel, align: "center", bold: true },
    { texto: `${fmtFechaAR(primero.fecha)} - ${primero.hora?.slice(0, 5) || ""}`, align: "center" },
    { separador: true },
    { par: ["Cliente", primero.ventaOriginalCliente || ""] },
    { par: ["Venta original", `#${primero.ventaOriginalId}`] },
  ];

  if (primero.motivo) lineas.push({ par: ["Motivo", primero.motivo] });

  lineas.push({ separador: true });
  lista.forEach(c => {
    if (c.productoNuevo?.id) {
      lineas.push({ texto: "Articulo nuevo" });
      lineas.push({ par: [`${c.qtyNuevo}x ${c.productoNuevo.nombre}`, `+${fmt(c.totalNuevo)}`] });
    }
  });
  lista.forEach(c => {
    if (c.itemViejo?.nombre) {
      lineas.push({ texto: "Articulo devuelto" });
      lineas.push({ par: [`${c.itemViejo.qty}x ${c.itemViejo.nombre}`, `-${fmt(c.totalViejo)}`] });
    }
  });
  lineas.push({ separador: true });

  const labelDiferencia = esNotaCredito ? "A favor del cliente" : esNotaDebito ? "A cobrar al cliente" : "Diferencia";
  lineas.push({ par: [labelDiferencia, fmt(Math.abs(diferencia))], bold: true });

  if (esNotaDebito) {
    lineas.push({ texto: `Cobrado por ${primero.formaPagoDif}`, align: "right" });
  } else if (esNotaCredito) {
    lineas.push({
      texto: primero.formaPagoDif === "Cuenta Corriente"
        ? "Acreditado en cuenta corriente del cliente"
        : `Devuelto por ${primero.formaPagoDif}`,
      align: "right",
    });
  }

  return imprimir({ ancho: 32, logoBase64, lineas });
}
