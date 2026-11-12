// Funciones utilitarias globales

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const fmt = n => "$" + Math.round(n).toLocaleString("es-AR");
const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const uid = () => Math.random().toString(36).slice(2,8).toUpperCase();

// Hora actual en "HH:MM:SS" (24hs, con cero a la izquierda) — para GUARDAR
// en la base (recibos, cambios de artículo, retiros de caja, etc.), nunca
// para mostrar. A diferencia de `new Date().toLocaleTimeString()` sin
// argumentos, que depende de la configuración regional de Windows: en una
// PC en español devuelve algo como "6:37:00 p. m.", y ese "p. m." rompe el
// insert en Supabase con el error "time zone "p.m." not recognized" (la
// columna es `time`/`timestamp` y Postgres intenta leer el sufijo como
// huso horario). Se arma a mano para no depender nunca del idioma del SO.
const horaActual = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

// Fechas internas siempre en "YYYY-MM-DD" (ISO, ordenable) — esto las pasa a
// "DD/MM/AAAA" solo para mostrar (tickets, comprobantes), nunca para guardar.
const fmtFechaAR = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return (y && m && d) ? `${d}/${m}/${y}` : iso;
};

// Hora local a partir de un timestamp ISO (ej: venta.createdAt, que guarda
// Supabase en UTC) — SOLO para mostrar en tickets/pantalla (acá el formato
// "p. m." en español no rompe nada, es texto). Para guardar en la base se
// usa horaActual(), nunca esto.
const fmtHoraAR = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
};

// Algunos lectores de código de barras emulan teclado en inglés (US) por
// defecto; si Windows tiene un layout en español activo, la tecla del guion
// "-" en esos códigos llega como apóstrofe "'". Los códigos internos nunca
// usan apóstrofe, así que es seguro normalizar uno por el otro al buscar.
const normalizarCodigoEscaneado = (str) => str.replace(/'/g, "-");

// Búsqueda flexible por palabras: separa la consulta en tokens y exige que
// cada uno aparezca en cualquier parte del texto, sin importar el orden ni
// que sea la palabra completa. Así "conj negro" encuentra "Conjunto Deportivo
// Negro", y abreviaturas como "conj" siguen matcheando "conjunto" (ya que
// buscar una letra/conjunto de letras alcanza, no hace falta la palabra entera).
const coincideBusqueda = (texto, query) => {
  const t = (texto || "").toLowerCase();
  const tokens = (query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  return tokens.length === 0 || tokens.every(tok => t.includes(tok));
};

// Ejecuta `fn` sobre cada item en tandas de `batchSize` en paralelo (en vez de
// disparar todas las requests a la vez), para no saturar al navegador ni a
// Supabase en actualizaciones masivas (ej: ajustar precio a cientos de productos).
async function runInBatches(items, batchSize, fn) {
  const resultados = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const tanda = items.slice(i, i + batchSize);
    resultados.push(...await Promise.allSettled(tanda.map(fn)));
  }
  return resultados;
}

// Fecha local, N días atrás, en formato "YYYY-MM-DD" (sin desvíos por UTC).
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MESES_LARGO = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// "2026-05" → "Mayo 2026"
const mesLabel = (mes) => {
  const [anio, mm] = mes.split("-");
  return `${MESES_LARGO[Number(mm) - 1]} ${anio}`;
};

// Busca si el mes de una fecha ("YYYY-MM-DD") está cerrado en Tesorería
const periodoCerrado = (fecha, periodosCerrados) => {
  const mes = fecha.slice(0, 7);
  return (periodosCerrados || []).find(p => p.mes === mes && p.cerrado) || null;
};

// Determina si una venta puede editarse/anularse según el estado de la caja
// del turno en que se registró. Es la regla de negocio compartida por
// "Editar" y "Anular": una venta solo puede tocarse si la caja sigue abierta
// y pertenece al período actual (desde la apertura o el último cierre de
// control/parcial) — los cierres de control "cierran" lo vendido hasta ese
// momento aunque la caja física siga abierta para el resto del turno.
const ventaEditable = (venta, caja, periodosCerrados) => {
  if (venta.estado === "anulada") {
    return { puede: false, motivo: "Esta venta ya fue anulada y no puede modificarse." };
  }
  if (!caja?.abierta) {
    return { puede: false, motivo: "La caja está cerrada. Abrí el turno para poder editar o anular ventas." };
  }
  if (periodoCerrado(venta.fecha, periodosCerrados)) {
    return { puede: false, motivo: "El período contable de esta venta ya fue cerrado." };
  }

  // Límite del período actual: el más reciente entre la apertura de caja y
  // el último cierre parcial (checkpoint) del turno.
  const parciales      = caja.cierresParciales || [];
  const ultimoParcial  = parciales.length > 0 ? parciales[parciales.length - 1] : null;
  const tsUltimoParcial = ultimoParcial?._ts || 0;
  const tsApertura      = caja.aperturaTs ? new Date(caja.aperturaTs).getTime() : 0;
  const limitePeriodo   = Math.max(tsUltimoParcial, tsApertura);

  const tsVenta = venta.createdAt ? new Date(venta.createdAt).getTime() : null;
  if (limitePeriodo && tsVenta != null && tsVenta < limitePeriodo) {
    return {
      puede: false,
      motivo: ultimoParcial
        ? `Esta venta ya fue incluida en el cierre de control ${ultimoParcial.numero} y no puede modificarse desde acá.`
        : "Esta venta pertenece a un turno anterior y no puede modificarse.",
    };
  }

  // Sin createdAt para comparar contra el período: al menos evitar tocar
  // ventas de un día anterior al actual.
  if (tsVenta == null && venta.fecha < today()) {
    return { puede: false, motivo: "Esta venta es de un turno anterior y no puede modificarse desde acá." };
  }

  return { puede: true, motivo: null };
};

// Igual que ventaEditable, pero para un cambio de artículo (grupo de filas de
// cambios_articulo que comparten el mismo "nro" de comprobante) — solo se
// puede anular mientras la caja del turno en que se hizo sigue abierta y
// pertenece al período actual.
const cambioEditable = (cambio, caja, periodosCerrados) => {
  if (cambio.estado === "anulada") {
    return { puede: false, motivo: "Este cambio ya fue anulado." };
  }
  if (!caja?.abierta) {
    return { puede: false, motivo: "La caja está cerrada. Abrí el turno para poder anular cambios." };
  }
  if (periodoCerrado(cambio.fecha, periodosCerrados)) {
    return { puede: false, motivo: "El período contable de este cambio ya fue cerrado." };
  }

  const parciales      = caja.cierresParciales || [];
  const ultimoParcial  = parciales.length > 0 ? parciales[parciales.length - 1] : null;
  const tsUltimoParcial = ultimoParcial?._ts || 0;
  const tsApertura      = caja.aperturaTs ? new Date(caja.aperturaTs).getTime() : 0;
  const limitePeriodo   = Math.max(tsUltimoParcial, tsApertura);

  const tsCambio = cambio.createdAt ? new Date(cambio.createdAt).getTime() : null;
  if (limitePeriodo && tsCambio != null && tsCambio < limitePeriodo) {
    return {
      puede: false,
      motivo: ultimoParcial
        ? `Este cambio ya fue incluido en el cierre de control ${ultimoParcial.numero} y no puede anularse desde acá.`
        : "Este cambio pertenece a un turno anterior y no puede anularse.",
    };
  }

  if (tsCambio == null && cambio.fecha < today()) {
    return { puede: false, motivo: "Este cambio es de un turno anterior y no puede anularse desde acá." };
  }

  return { puede: true, motivo: null };
};

// Igual que ventaEditable/cambioEditable, pero para un recibo — solo se puede
// editar/anular mientras la caja del turno en que se emitió sigue abierta y
// pertenece al período actual (mismo criterio: "dentro de la misma caja").
const reciboEditable = (recibo, caja, periodosCerrados) => {
  if (recibo.estado === "anulada") {
    return { puede: false, motivo: "Este recibo ya fue anulado." };
  }
  if (!caja?.abierta) {
    return { puede: false, motivo: "La caja está cerrada. Abrí el turno para poder editar o anular recibos." };
  }
  if (periodoCerrado(recibo.fecha, periodosCerrados)) {
    return { puede: false, motivo: "El período contable de este recibo ya fue cerrado." };
  }

  const parciales      = caja.cierresParciales || [];
  const ultimoParcial  = parciales.length > 0 ? parciales[parciales.length - 1] : null;
  const tsUltimoParcial = ultimoParcial?._ts || 0;
  const tsApertura      = caja.aperturaTs ? new Date(caja.aperturaTs).getTime() : 0;
  const limitePeriodo   = Math.max(tsUltimoParcial, tsApertura);

  const tsRecibo = recibo.createdAt ? new Date(recibo.createdAt).getTime() : null;
  if (limitePeriodo && tsRecibo != null && tsRecibo < limitePeriodo) {
    return {
      puede: false,
      motivo: ultimoParcial
        ? `Este recibo ya fue incluido en el cierre de control ${ultimoParcial.numero} y no puede modificarse desde acá.`
        : "Este recibo pertenece a un turno anterior y no puede modificarse.",
    };
  }

  if (tsRecibo == null && recibo.fecha < today()) {
    return { puede: false, motivo: "Este recibo es de un turno anterior y no puede modificarse desde acá." };
  }

  return { puede: true, motivo: null };
};

// A diferencia de ventaEditable, esto NO exige "misma caja/turno que la
// venta original": retirar mercadería o cobrar una seña pendiente son
// acciones "de hoy" (quedan fechadas y auditadas con su propio registro en
// `venta.retiros`/`venta.pagos`), no una reescritura del turno viejo, así
// que una seña de hace semanas se puede seguir moviendo sin reabrir nada.
// Editar el precio/los items de la venta o anularla entera sigue usando
// ventaEditable sin cambios.
function motivoNoRetirarSeña(venta, caja) {
  if (venta.estado === "anulada") return "Esta venta ya fue anulada.";
  if (!caja?.abierta) return "La caja está cerrada. Abrí el turno para operar sobre esta seña.";
  return null;
}

// Precio base de un producto (antes del ajuste por lista): si el producto
// tiene un precio base manual cargado (producto.precioBase), se usa tal cual;
// si no, se calcula con un margen que sigue este orden de prioridad:
//   1. Margen propio del artículo (producto.margen), si está seteado
//   2. Margen propio del rubro del producto (rubros[].margen), si está seteado
//   3. Margen propio del proveedor del producto (proveedores[].margen), si está seteado
//   4. Margen general configurado en Productos → Precios (margenBase)
// producto.precioBase === null/undefined significa "sin manual, usar automático"
// — no confundir con 0, que sería un precio base manual de $0. Lo mismo para
// producto.margen: null/undefined = "sin margen propio", no confundir con 0%.
const precioBaseDe = (producto, margenBase = 0, rubros = [], proveedores = []) => {
  if (producto.precioBase != null) return producto.precioBase;
  if (producto.margen != null) return Math.round(producto.costo * (1 + producto.margen / 100));
  const rubro = rubros.find(r => r.nombre === producto.rubro);
  if (rubro?.margen != null) return Math.round(producto.costo * (1 + rubro.margen / 100));
  const proveedor = proveedores.find(p => p.id === producto.proveedorId);
  if (proveedor?.margen != null) return Math.round(producto.costo * (1 + proveedor.margen / 100));
  return Math.round(producto.costo * (1 + margenBase / 100));
};

// Precio de un producto para una lista dada.
// Si el producto tiene un precio manual para esa lista (producto.precios[listaId]),
// lo usa directamente. Si no, aplica dos pasos:
//   1. Precio base = precioBaseDe(producto, margenBase, rubros, proveedores)
//   2. Precio lista = precio base × (1 + lista.pct/100)  ← ajuste (+/-) de la lista
const precioPorLista = (producto, lista, margenBase = 0, rubros = [], proveedores = []) => {
  if (producto.precios?.[lista.id] !== undefined) return producto.precios[lista.id];
  return Math.round(precioBaseDe(producto, margenBase, rubros, proveedores) * (1 + lista.pct / 100));
};

// Etiqueta de una lista de precio para selects: nombre + ajuste% + medios de pago.
const labelLista = (lista) =>
  `${lista.nombre}${lista.pct === 0 ? " (base)" : ` (${lista.pct > 0 ? "+" : ""}${lista.pct}%)`}${lista.formasPago?.length ? ` · ${lista.formasPago.join(", ")}` : ""}`;

// Lista de precios asignada a un medio de pago puntual (configurado en
// "Gestionar listas" → "Medios de pago" de cada lista). Mismo criterio que
// ya usan ModalNuevaVenta/ModalNuevaReserva/PageVentas para auto-seleccionar
// la lista al elegir el medio de pago — centralizado acá para poder
// reutilizarlo también al recalcular precios (seña en un medio, saldo en
// otro: ej. señaron en efectivo y pagan la diferencia con tarjeta).
const listaParaFormaPago = (listas, forma) =>
  (listas || []).find(l => (l.formasPago || []).length > 0 && (l.formasPago || []).includes(forma)) || null;

// Stock mínimo de un producto antes de avisar "stock bajo" (editable por
// producto en Productos; si no se definió, se usa el valor por defecto).
const STOCK_MINIMO_DEFAULT = 5;
const stockMinimo = (producto) => producto.stockMinimo ?? STOCK_MINIMO_DEFAULT;

// ── Proyección de stock / sugerido de compra ──────────────────────────────────
// Pensado para reposición por viaje (no por punto de pedido continuo):
// se calcula cuánto vender hasta la próxima fecha de compra + un colchón de
// seguridad, y se compara contra el stock actual.
//
//   ventaPromedioDiaria = unidades vendidas en los últimos N días / N
//   diasACubrir         = días hasta el próximo viaje + días de colchón
//   necesario           = ventaPromedioDiaria * diasACubrir
//   sugerido            = max(0, necesario - stockActual)

const DIAS_VENTANA_DEFAULT = 30;

function ventaPromedioDiaria(nombreProducto, ventas, diasVentana = DIAS_VENTANA_DEFAULT) {
  const hoy = new Date(today());
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - diasVentana);
  const desdeStr = desde.toISOString().slice(0, 10);

  let unidades = 0;
  (ventas || []).forEach(v => {
    if (v.fecha < desdeStr || v.estado === "anulada") return;
    (v.items || []).forEach(it => {
      if (it.nombre === nombreProducto) unidades += it.qty;
    });
  });
  return unidades / diasVentana;
}

function diasHastaFecha(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(today());
  const objetivo = new Date(fechaStr);
  return Math.ceil((objetivo - hoy) / (1000 * 60 * 60 * 24));
}

// Devuelve el detalle de proyección para UN producto.
function proyeccionProducto(producto, ventas, proveedor, diasVentana = DIAS_VENTANA_DEFAULT) {
  const promedioDiario = ventaPromedioDiaria(producto.nombre, ventas, diasVentana);
  const diasHastaViaje = diasHastaFecha(proveedor?.proximoViaje);
  const colchon = proveedor?.diasColchon ?? 5;

  // Si no hay fecha de próximo viaje configurada, no se puede proyectar
  if (diasHastaViaje === null) {
    return {
      promedioDiario, diasHastaViaje: null, colchon,
      diasACubrir: null, necesario: null, sugerido: null, sinFecha: true,
    };
  }

  const diasACubrir = Math.max(0, diasHastaViaje) + colchon;
  const necesario = promedioDiario * diasACubrir;
  const sugerido = Math.max(0, Math.ceil(necesario - producto.stock));

  return { promedioDiario, diasHastaViaje, colchon, diasACubrir, necesario, sugerido, sinFecha: false };
}

// ── Pago dividido ───────────────────────────────────────────────────────────────
// Desglose de pagos de una venta: usa venta.pagos si la venta se cobró con
// varios medios de pago; si no, lo arma con su único formaPago/total (incluye
// ventas anteriores a la existencia de pago dividido).
const pagosDeVenta = (venta) =>
  (venta.pagos && venta.pagos.length) ? venta.pagos : [{ formaPago: venta.formaPago, monto: venta.total }];

// Monto de una venta que corresponde específicamente a "Cuenta Corriente"
// (puede ser parte del total si el resto se pagó con otros medios).
// Una venta anulada no debe seguir generando deuda: devuelve 0 sin importar
// cómo se haya cobrado originalmente.
const montoCtaCte = (venta) =>
  venta.estado === "anulada" ? 0 :
  pagosDeVenta(venta).filter(p => p.formaPago === "Cuenta Corriente").reduce((a, p) => a + p.monto, 0);

// Suma, dentro de un conjunto de ventas, lo cobrado por un medio de pago puntual
// (tiene en cuenta pagos divididos: cada venta puede aportar solo una parte).
const totalPorFormaPago = (ventas, forma) =>
  (ventas || []).reduce((a, v) => a + pagosDeVenta(v).filter(p => p.formaPago === forma).reduce((s, p) => s + p.monto, 0), 0);

// ── Recargo por mora en cuenta corriente ───────────────────────────────────────
// Días transcurridos desde una fecha pasada ("YYYY-MM-DD") hasta hoy.
function diasDesde(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(today());
  const desde = new Date(fechaStr);
  return Math.floor((hoy - desde) / (1000 * 60 * 60 * 24));
}

// Antigüedad (en días) de la deuda más vieja de un cliente que todavía no fue
// cubierta por sus pagos. Asigna los pagos a las ventas a cta. cte. en orden
// cronológico (FIFO): la primera venta no cubierta del todo marca la mora.
// Si una venta se pagó con varios medios, solo cuenta la porción a cta. cte.
// Devuelve null si el cliente no tiene deuda pendiente.
function diasMoraCliente(clienteId, ventas, pagos, cambiosArticulo) {
  const fecha = fechaDeudaMasVieja(clienteId, ventas, pagos, cambiosArticulo);
  return fecha ? diasDesde(fecha) : null;
}

// Fecha del cargo en cta. cte. más viejo que todavía no fue cubierto por los
// pagos (mismo reparto FIFO que diasMoraCliente). Identifica el "episodio"
// de mora actual: se usa para saber qué mora cobrada corresponde a esta
// deuda y cuál a una deuda anterior ya saldada. null si no debe nada.
function fechaDeudaMasVieja(clienteId, ventas, pagos, cambiosArticulo) {
  const cargos = cargosCtaCte(clienteId, ventas, cambiosArticulo);
  if (cargos.length === 0) return null;

  let disponible = (pagos || []).filter(p => p.clienteId === clienteId).reduce((a, p) => a + p.monto, 0);
  for (const c of cargos) {
    if (disponible >= c.monto) { disponible -= c.monto; continue; }
    return c.fecha;
  }
  return null;
}

// % de recargo aplicable según los días de mora y los tramos configurados
// (cada tramo es { dias, pct }). Se usa el % del tramo más alto cuyo umbral
// de días ya fue superado; si ninguno aplica todavía, no hay recargo.
function pctRecargoMora(diasMora, tramos) {
  if (diasMora == null) return 0;
  const aplicables = (tramos || []).filter(t => diasMora >= t.dias);
  if (aplicables.length === 0) return 0;
  return Math.max(...aplicables.map(t => t.pct));
}

const MORA_CONFIG_DEFAULT = {
  diasGracia: 30,
  tipo: "mensual",
  pct: 5,
  escala: [],
  usarEscala: false,
  aplicarPagoA: "capital_primero",
  baseCalculo: "monto_total",
};

function obtenerConfigMora(configGlobal = {}, configCliente = null) {
  const global = { ...MORA_CONFIG_DEFAULT, ...(configGlobal || {}) };
  if (!configCliente || configCliente.usarGlobal !== false) {
    return global;
  }
  return { ...MORA_CONFIG_DEFAULT, ...(configCliente || {}) };
}

// Cargos en cta. cte. de un cliente (ventas + cambios de artículo dejados a
// cuenta), ordenados cronológicamente. Base compartida por diasMoraCliente y
// saldoUltimoCargoCtaCte.
function cargosCtaCte(clienteId, ventas, cambiosArticulo) {
  const ventasCtaCte = (ventas || [])
    .filter(v => v.clienteId === clienteId && montoCtaCte(v) > 0)
    .map(v => ({ fecha: v.fecha, monto: montoCtaCte(v) }));
  const cambiosCtaCte = cargosCambioCtaCte(clienteId, cambiosArticulo)
    .map(g => ({ fecha: g.fecha, monto: g.diferencia }));
  return [...ventasCtaCte, ...cambiosCtaCte].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Saldo pendiente del cargo (venta o cambio) más reciente en cta. cte. de un
// cliente, repartiendo los pagos en orden FIFO igual que diasMoraCliente —
// usado cuando la config de mora aplica el % sobre "última venta" en vez de
// sobre el total de la cuenta.
function saldoUltimoCargoCtaCte(clienteId, ventas, pagos, cambiosArticulo) {
  const cargos = cargosCtaCte(clienteId, ventas, cambiosArticulo);
  if (cargos.length === 0) return 0;

  let disponible = (pagos || []).filter(p => p.clienteId === clienteId).reduce((a, p) => a + p.monto, 0);
  let saldo = 0;
  for (const c of cargos) {
    const cubierto = Math.min(disponible, c.monto);
    saldo = c.monto - cubierto;
    disponible -= cubierto;
  }
  return saldo;
}

// ── Mora manual (cargo tipeado a mano, no calculado por %) ──────────────────────
// Vive en cliente.configMora.cargosManuales: una lista de cargos que el admin
// escribe a mano, cada uno aplicado a una factura puntual (ventaId) o a toda
// la cuenta (ventaId: null, p.ej. "se le vino a destiempo el tipo de cambio").
// Reemplaza al % automático para ese cliente (ver calcularMoraCliente) — nunca
// se suman los dos, para no terminar cobrando mora dos veces por la misma
// deuda. Solo cuentan los cargos con activo !== false; "quitar" uno lo marca
// inactivo en vez de borrarlo, para no perder el rastro de qué se cobró.
function cargosManualesActivos(configCliente) {
  return (configCliente?.cargosManuales || []).filter(c => c.activo !== false);
}

function totalMoraManual(configCliente) {
  return cargosManualesActivos(configCliente).reduce((a, c) => a + (Number(c.monto) || 0), 0);
}

function agregarCargoMoraManual(configCliente, cargo) {
  const actual = configCliente || { usarGlobal: true };
  return { ...actual, cargosManuales: [...(actual.cargosManuales || []), { id: uid(), activo: true, ...cargo }] };
}

function quitarCargoMoraManual(configCliente, cargoId) {
  const actual = configCliente || { usarGlobal: true };
  return { ...actual, cargosManuales: (actual.cargosManuales || []).map(c => c.id === cargoId ? { ...c, activo: false } : c) };
}

// ── Mora cobrada en un recibo ──────────────────────────────────────────────────
// La parte de mora de un recibo NO se registra como pago de la deuda (si no,
// sobra y queda como "saldo a favor"). Se anota en cliente.configMora:
//   • Si el cliente tenía mora manual activa → esos cargos quedan cobrados
//     (activo: false, cobrado: true, reciboId) y dejan de sumar.
//   • Si era mora por % → se agrega a configMora.moraCobrada con la fecha de
//     la deuda que la generó (deudaDesde), y calcularMoraCliente la descuenta
//     mientras esa misma deuda siga siendo la más vieja pendiente.
// Es idempotente por reciboId (un reintento de la cola offline no la duplica).
// `cargoIds` (opcional): solo esos cargos manuales quedan cobrados — p.ej. al
// cobrar en Caja solo algunas facturas, se cobra solo la mora de esas. Sin
// `cargoIds` se cobran todos los cargos manuales activos.
function registrarCobroMora(configCliente, { monto, reciboId, fecha, deudaDesde, cargoIds }) {
  const actual = configCliente || { usarGlobal: true };
  if (moraCobradaDeRecibo(actual, reciboId) > 0) return actual;
  const activos = cargosManualesActivos(actual);
  if (activos.length > 0) {
    const ids = new Set(Array.isArray(cargoIds) ? cargoIds : activos.map(c => c.id));
    return {
      ...actual,
      cargosManuales: (actual.cargosManuales || []).map(c =>
        ids.has(c.id) ? { ...c, activo: false, cobrado: true, reciboId, fechaCobro: fecha } : c),
    };
  }
  return {
    ...actual,
    moraCobrada: [...(actual.moraCobrada || []), { id: uid(), monto, fecha, reciboId, deudaDesde: deudaDesde || null }],
  };
}

// Mora manual activa por factura: { [ventaId]: total }. Los cargos de "toda
// la cuenta" (ventaId null) van en la clave "cuenta".
function moraManualPorVenta(configCliente) {
  const res = {};
  for (const c of cargosManualesActivos(configCliente)) {
    const k = c.ventaId ?? "cuenta";
    res[k] = (res[k] || 0) + (Number(c.monto) || 0);
  }
  return res;
}

// Mora sugerida para UNA factura con la config de mora del cliente (global
// o individual): mismo cálculo que el % automático (calcularMoraCliente),
// pero sobre el saldo pendiente de esa factura y sus propios días de
// atraso. Sirve de punto de partida al cargar mora manual por factura.
function sugerirMoraFactura({ fecha, saldoPendiente }, config) {
  const cfg = { ...MORA_CONFIG_DEFAULT, ...(config || {}) };
  if (!(saldoPendiente > 0) || cfg.tipo === "sin_recargo") return 0;
  const dias = diasDesde(fecha);
  const diasEnMora = dias != null ? dias - cfg.diasGracia : 0;
  if (diasEnMora <= 0) return 0;
  let pct = cfg.pct || 0;
  if (cfg.usarEscala && Array.isArray(cfg.escala) && cfg.escala.length > 0) {
    const escalas = [...cfg.escala].sort((a, b) => a.hastaDias - b.hastaDias);
    pct = (escalas.find(t => diasEnMora <= t.hastaDias) || escalas[escalas.length - 1])?.pct || 0;
  }
  if (cfg.tipo === "mensual") return Math.round(saldoPendiente * (pct / 100) * Math.ceil(diasEnMora / 30));
  if (cfg.tipo === "diario")  return Math.round(saldoPendiente * (pct / 100) * diasEnMora);
  return 0;
}

// Deshace registrarCobroMora (al anular el recibo): los cargos manuales
// vuelven a estar activos y se borra la mora por % cobrada en ese recibo.
function revertirCobroMora(configCliente, reciboId) {
  const actual = configCliente || { usarGlobal: true };
  return {
    ...actual,
    cargosManuales: (actual.cargosManuales || []).map(c => {
      if (!(c.cobrado && c.reciboId === reciboId)) return c;
      const resto = { ...c, activo: true };
      delete resto.cobrado; delete resto.reciboId; delete resto.fechaCobro;
      return resto;
    }),
    moraCobrada: (actual.moraCobrada || []).filter(m => m.reciboId !== reciboId),
  };
}

// Cuánto de un recibo fue mora (para que editar el recibo no la vuelva a
// cargar como pago de la deuda).
function moraCobradaDeRecibo(configCliente, reciboId) {
  if (reciboId == null) return 0;
  const manual = (configCliente?.cargosManuales || [])
    .filter(c => c.cobrado && c.reciboId === reciboId)
    .reduce((a, c) => a + (Number(c.monto) || 0), 0);
  const pct = (configCliente?.moraCobrada || [])
    .filter(m => m.reciboId === reciboId)
    .reduce((a, m) => a + (Number(m.monto) || 0), 0);
  return manual + pct;
}

function calcularMoraCliente(clienteId, ventas, pagos, configMoraGlobal = {}, configMoraCliente = null, cambiosArticulo) {
  const config = obtenerConfigMora(configMoraGlobal, configMoraCliente);
  const ventasCtaCte = (ventas || [])
    .filter(v => v.clienteId === clienteId && montoCtaCte(v) > 0);
  const pagosCliente = (pagos || []).filter(p => p.clienteId === clienteId);
  const deudaCambios = cargosCambioCtaCte(clienteId, cambiosArticulo).reduce((a, g) => a + g.diferencia, 0);
  const deudaOriginal = ventasCtaCte.reduce((a, v) => a + montoCtaCte(v), 0) + deudaCambios;
  const pagado = pagosCliente.reduce((a, p) => a + p.monto, 0);
  const saldoOriginal = Math.max(0, deudaOriginal - pagado);
  const saldoAFavor = Math.max(0, pagado - deudaOriginal);

  const fechaDeuda = fechaDeudaMasVieja(clienteId, ventas, pagos, cambiosArticulo);
  const diasMora = fechaDeuda ? diasDesde(fechaDeuda) : null;
  const diasEnMora = diasMora != null ? Math.max(0, diasMora - config.diasGracia) : 0;

  const moraManual = totalMoraManual(configMoraCliente);

  let pctAplicado = 0;
  let recargo = 0;
  let moraYaCobrada = 0;
  if (moraManual > 0) {
    // Mora tipeada a mano: pisa el % para este cliente, no se combinan.
    recargo = moraManual;
  } else {
    if (diasMora != null && diasEnMora > 0 && config.tipo !== "sin_recargo") {
      if (config.usarEscala && Array.isArray(config.escala) && config.escala.length > 0) {
        const escalas = [...config.escala].sort((a, b) => a.hastaDias - b.hastaDias);
        const tramo = escalas.find(t => diasEnMora <= t.hastaDias) || escalas[escalas.length - 1];
        pctAplicado = tramo?.pct || 0;
      } else {
        pctAplicado = config.pct || 0;
      }
    }

    const saldoBase = config.baseCalculo === "ultima_venta"
      ? saldoUltimoCargoCtaCte(clienteId, ventas, pagos, cambiosArticulo)
      : saldoOriginal;

    if (diasMora != null && diasEnMora > 0 && pctAplicado > 0 && saldoBase > 0) {
      if (config.tipo === "mensual") {
        // Cada mes empezado cuenta: el primer % se cobra apenas termina la
        // gracia (día 31 con 30 de gracia = 1 mes, día 61 = 2 meses...).
        const mesesTranscurridos = Math.ceil(diasEnMora / 30);
        recargo = Math.round(saldoBase * (pctAplicado / 100) * mesesTranscurridos);
      } else if (config.tipo === "diario") {
        recargo = Math.round(saldoBase * (pctAplicado / 100) * diasEnMora);
      }
    }

    // Mora por % ya cobrada en recibos para ESTA deuda (misma fecha de deuda
    // más vieja): se descuenta para no cobrarla dos veces.
    moraYaCobrada = (configMoraCliente?.moraCobrada || [])
      .filter(m => fechaDeuda && m.deudaDesde === fechaDeuda)
      .reduce((a, m) => a + (Number(m.monto) || 0), 0);
    recargo = Math.max(0, recargo - moraYaCobrada);
  }

  const saldoConRecargo = saldoOriginal + recargo;
  let estado = "al_dia";

  if (diasMora == null) {
    estado = "al_dia";
  } else if (diasMora <= config.diasGracia) {
    estado = "en_gracia";
  } else if (diasMora <= 60) {
    estado = "vencido_leve";
  } else {
    estado = "vencido_grave";
  }

  return {
    saldoOriginal,
    saldoAFavor,
    recargo,
    saldoConRecargo,
    diasMora,
    fechaDeuda,
    moraYaCobrada,
    estado,
    moraManual: moraManual > 0,
    config: { ...config, pctAplicado, diasEnMora },
  };
}

// Cliente vencido (ya pasó los días de gracia, con deuda real) pero sin
// ningún recargo activo — ni el % automático generó nada (config
// "sin_recargo", 0%, o escala/base en $0) ni hay una mora manual cargada.
// Pensado para avisarle al cajero/admin que se está olvidando de cobrar algo,
// no para bloquear nada.
function clienteAtrasadoSinMora(mora) {
  if (!mora || mora.diasMora == null) return false;
  const enGracia = mora.diasMora <= (mora.config?.diasGracia ?? 0);
  return !enGracia && mora.saldoOriginal > 0 && mora.recargo === 0;
}

// Agrupa cambiosArticulo por "nro" (un cambio con varios artículos genera
// varias filas que comparten nro — ver cambiosAgrupados en PageVentas.jsx) y
// devuelve, para un cliente puntual, los grupos cuya diferencia total quedó
// a cargo del cliente en cuenta corriente (diferencia > 0 y formaPagoDif ===
// "Cuenta Corriente"). Sumar por GRUPO y no por fila es necesario: en un
// cambio de varios artículos cada fila puede tener un signo distinto al
// total (se "emparejan" de a pares y a veces sobra un artículo de un lado).
// Los grupos anulados no cuentan — se anulan enteros, comparten estado.
function cargosCambioCtaCte(clienteId, cambiosArticulo) {
  const grupos = new Map();
  for (const c of (cambiosArticulo || [])) {
    if (c.ventaOriginalClienteId !== clienteId || c.estado === "anulada") continue;
    if (!grupos.has(c.nro)) {
      grupos.set(c.nro, { nro: c.nro, fecha: c.fecha, motivo: c.motivo, formaPagoDif: c.formaPagoDif, diferencia: 0 });
    }
    grupos.get(c.nro).diferencia += c.diferencia || 0;
  }
  return [...grupos.values()].filter(g => g.diferencia > 0 && g.formaPagoDif === "Cuenta Corriente");
}

// ── Retiro parcial (reservas Y ventas con seña) ─────────────────────────────
// Cuánto de cada item de una entrega pendiente (reserva o venta con seña) ya
// se retiró (sumando todos los retiros parciales registrados) y cuánto queda
// pendiente. `entidad.items` es el pedido original completo; `entidad.retiros`
// es el historial de entregas — misma forma en `reservas` y en `ventas`, así
// que esta función sirve para las dos.
function itemsPendientesEntrega(entidad) {
  const retirado = {};
  for (const r of (entidad.retiros || [])) {
    for (const it of (r.items || [])) {
      retirado[it.productoId] = (retirado[it.productoId] || 0) + it.qty;
    }
  }
  return (entidad.items || []).map(it => {
    const qtyRetirada = retirado[it.productoId] || 0;
    return { ...it, qtyRetirada, qtyPendiente: Math.max(0, it.qty - qtyRetirada) };
  });
}

// Reparte los pagos de una reserva (señas, en orden cronológico) entre los
// sucesivos retiros parciales, en orden FIFO — cada retiro "consume" primero
// el dinero ya cobrado, incluso si viene de una seña que cubre parte de un
// retiro y parte del siguiente. `montoYaConsumido` es lo que ya tomaron los
// retiros anteriores (suma de sus `pagosAsignados`); `montoATomar` es el
// subtotal del retiro actual (topado a lo que realmente haya disponible).
// Si no alcanza a cubrirse, el resto queda simplemente sin pago asignado —
// el retiro de mercadería no está condicionado a que esté todo cobrado.
function asignarSeñasFIFO(señas, montoYaConsumido, montoATomar) {
  let acumulado = 0;
  const tomados = [];
  for (const s of (señas || [])) {
    const inicio = acumulado;
    acumulado += s.monto;
    const desde = Math.max(inicio, montoYaConsumido);
    const hasta = Math.min(acumulado, montoYaConsumido + montoATomar);
    if (hasta > desde) tomados.push({ formaPago: s.formaPago, monto: hasta - desde });
    if (acumulado >= montoYaConsumido + montoATomar) break;
  }
  const porForma = {};
  for (const p of tomados) porForma[p.formaPago] = (porForma[p.formaPago] || 0) + p.monto;
  return Object.entries(porForma).map(([formaPago, monto]) => ({ formaPago, monto }));
}

// Saldo total en cuenta corriente de un cliente: deuda de ventas + diferencia
// de cambios de artículo dejada en cta. cte. (a cargo del cliente), menos lo
// pagado. Usa montoCtaCte(venta) — no venta.total — para contemplar ventas
// con pago dividido donde solo una parte fue a cuenta corriente.
//
// Los cambios a favor DEL CLIENTE (diferencia < 0) no restan acá: ese
// crédito ya se registra como un pago real en `pagosCtaCte` al confirmarse
// el cambio (ver onConfirmar en PageVentas.jsx) — restarlo acá también sería
// contarlo dos veces.
function calcularSaldoCtaCte(clienteId, ventas, pagosCtaCte, cambiosArticulo) {
  const deudaVentas = (ventas || [])
    .filter(v => v.clienteId === clienteId && v.estado !== "anulada")
    .reduce((a, v) => a + montoCtaCte(v), 0);

  const deudaCambios = cargosCambioCtaCte(clienteId, cambiosArticulo)
    .reduce((a, g) => a + g.diferencia, 0);

  const pagado = (pagosCtaCte || [])
    .filter(p => p.clienteId === clienteId)
    .reduce((a, p) => a + p.monto, 0);

  return Math.max(0, deudaVentas + deudaCambios - pagado);
}

// Detalle cronológico de cargos en cta. cte. (ventas + cambios de artículo
// dejados a cuenta) con el saldo pendiente de cada uno, repartiendo los
// pagos en orden FIFO. Los cambios se representan con una fila sintética
// (mismo campo `total`/`items` que una venta, para que el resto del código
// que ya sabe renderizar "ventas" los muestre sin cambios) — su `id` es un
// string ("cambio-NC-0001") para no colisionar con ids reales de `ventas`.
function detalleVentasCtaCte(clienteId, ventas, pagos, cambiosArticulo) {
  const ventasCtaCte = (ventas || [])
    .filter(v => v.clienteId === clienteId && montoCtaCte(v) > 0);

  const cambiosCtaCte = cargosCambioCtaCte(clienteId, cambiosArticulo).map(g => ({
    id: `cambio-${g.nro}`,
    fecha: g.fecha,
    formaPago: "Cuenta Corriente",
    total: g.diferencia,
    items: [{ nombre: `Cambio de artículo ${g.nro}${g.motivo ? " — " + g.motivo : ""}`, qty: 1, precio: g.diferencia }],
  }));

  const cargos = [...ventasCtaCte, ...cambiosCtaCte].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let disponible = (pagos || []).filter(p => p.clienteId === clienteId).reduce((a, p) => a + p.monto, 0);

  return cargos.map(v => {
    const monto = montoCtaCte(v);
    const saldoPendiente = Math.max(0, monto - disponible);
    disponible = Math.max(0, disponible - monto);
    return {
      ...v,
      saldoPendiente,
      diasMora: saldoPendiente > 0 ? diasDesde(v.fecha) : 0,
    };
  });
}

export {
  fmt, today, daysAgo, uid, horaActual, fmtFechaAR, fmtHoraAR, runInBatches, normalizarCodigoEscaneado, coincideBusqueda, mesLabel, periodoCerrado, precioPorLista, precioBaseDe, labelLista, listaParaFormaPago, stockMinimo, STOCK_MINIMO_DEFAULT,
  ventaPromedioDiaria, diasHastaFecha, proyeccionProducto, DIAS_VENTANA_DEFAULT,
  diasDesde, diasMoraCliente, pctRecargoMora, MORA_CONFIG_DEFAULT, obtenerConfigMora, calcularMoraCliente, detalleVentasCtaCte,
  cargosManualesActivos, totalMoraManual, agregarCargoMoraManual, quitarCargoMoraManual, clienteAtrasadoSinMora,
  fechaDeudaMasVieja, registrarCobroMora, revertirCobroMora, moraCobradaDeRecibo,
  moraManualPorVenta, sugerirMoraFactura,
  pagosDeVenta, montoCtaCte, totalPorFormaPago, calcularSaldoCtaCte, cargosCambioCtaCte,
  ventaEditable, cambioEditable, reciboEditable, motivoNoRetirarSeña,
  itemsPendientesEntrega, asignarSeñasFIFO,
};
