import { useState, useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import { fmt, today, pagosDeVenta, fmtFechaAR, itemsPendientesEntrega, asignarSeñasFIFO, precioPorLista } from "../../utils/helpers.js";
import { useGestionSeñaVenta } from "../../hooks/useGestionSeñaVenta.js";
import ModalNuevaReserva from "./ModalNuevaReserva.jsx";
import ModalDetalleReserva from "./ModalDetalleReserva.jsx";
import ModalCompletarRetiro from "../ventas/ModalCompletarRetiro.jsx";
import ModalAnulacionVenta from "../ventas/ModalAnulacionVenta.jsx";
import ModalTicket from "../ventas/ModalTicket.jsx";

const ESTADO_BADGE = {
  pendiente:  { label: "Pendiente",  cls: "badge-warn"   },
  completada: { label: "Completada", cls: "badge-ok"     },
  cancelada:  { label: "Cancelada",  cls: "badge-danger" },
};

export default function TabReservas({
  reservas = [], clientes, productos, depositos = [], stockDepositos = [],
  listas = [], configPrecios = {}, rubros = [], proveedores = [],
  caja, usuarioActivo,
  crearReserva, agregarSeña, editarPreciosReserva, registrarRetiroReserva, cancelarReserva,
  agregarVenta, actualizarStock, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple,
  ventas = [], editarVenta, editarVentaConItems, anularVenta,
  registrarRetiroSeña, registrarPagoSeña,
  periodosCerrados = [], permisos, agregarPagoCtaCte, cambiosArticulo = [],
  tarjetas = [], recibos = [], agregarRecibo,
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const margenBase = configPrecios?.margenBase ?? 0;
  const [showNueva, setShowNueva] = useState(false);
  const [detalleReserva, setDetalleReserva] = useState(null);
  const [showCompletarRetiro, setShowCompletarRetiro] = useState(null); // venta con seña a completar
  const [showAnulacion, setShowAnulacion] = useState(null); // venta a anular
  const [showTicket, setShowTicket] = useState(null); // venta a ver

  const [fEstado, setFEstado] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");

  // Señas hechas desde Ventas ("Venta con retiro después") comparten la
  // misma lógica de retirar/pagar/anular que la pantalla de Ventas — se
  // reutiliza tal cual para no duplicarla acá.
  const { motivoNoAnular, motivoNoRetirar, handleAnular, handleRetirarSeña, handleAgregarPagoSeña, handleRecalcularPrecios } =
    useGestionSeñaVenta({
      caja, periodosCerrados, depositos, stockDepositos, productos, listas,
      configPrecios, rubros, proveedores, usuarioActivo, permisos,
      editarVenta, editarVentaConItems, anularVenta,
      registrarRetiroSeña, registrarPagoSeña,
      actualizarStock, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple, agregarPagoCtaCte,
      agregarRecibo, recibos,
    });

  // Lista unificada: reservas nativas + ventas con seña ("es_sena"), en una
  // sola forma común para la tabla/métricas de esta pantalla. `key` lleva
  // el origen como prefijo porque los ids de `reservas` y `ventas` son
  // secuencias independientes y pueden coincidir.
  const combinado = useMemo(() => {
    const reservasMapeadas = reservas.map(r => ({
      origin: "reserva", key: `r-${r.id}`, id: r.id, nro: r.nro, fecha: r.fecha,
      cliente: r.cliente, total: r.total, totalSeñas: r.totalSeñas,
      saldoPendiente: r.saldoPendiente, estado: r.estado,
      fechaCompletada: r.fechaCompletada, raw: r,
    }));
    const señasVenta = ventas.filter(v => v.esSeña).map(v => {
      const cobrado = pagosDeVenta(v).reduce((a, p) => a + p.monto, 0);
      return {
        origin: "venta", key: `v-${v.id}`, id: v.id, nro: `Venta #${v.id}`, fecha: v.fecha,
        cliente: v.cliente, total: v.total, totalSeñas: cobrado,
        saldoPendiente: Math.max(0, v.total - cobrado),
        estado: v.estado === "anulada" ? "cancelada" : v.estado === "activa" ? "completada" : "pendiente",
        fechaCompletada: v.fechaCompletada, raw: v,
      };
    });
    return [...reservasMapeadas, ...señasVenta];
  }, [reservas, ventas]);

  const metrics = useMemo(() => {
    const pendientes = combinado.filter(r => r.estado === "pendiente");
    const mesActual = today().slice(0, 7);
    return {
      pendientes: pendientes.length,
      totalSeñas: combinado.reduce((a, r) => a + r.totalSeñas, 0),
      saldoPendiente: pendientes.reduce((a, r) => a + r.saldoPendiente, 0),
      completadasMes: combinado.filter(r => r.estado === "completada" && r.fechaCompletada?.slice(0, 7) === mesActual).length,
    };
  }, [combinado]);

  const filtradas = useMemo(() => {
    return combinado.filter(r => {
      if (fEstado !== "todas" && r.estado !== fEstado) return false;
      if (fDesde && r.fecha < fDesde) return false;
      if (fHasta && r.fecha > fHasta) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        if (!r.cliente.toLowerCase().includes(q) && !r.nro.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.key.localeCompare(a.key)));
  }, [combinado, fEstado, busqueda, fDesde, fHasta]);

  const { pagina: paginaRes, setPagina: setPaginaRes, totalPaginas: totalPaginasRes, itemsPagina: filtradasPagina, pageSize: pageSizeRes } = usePaginacion(filtradas);

  // ── Retirar mercadería de una reserva — total o parcial. Genera una venta
  // solo con los items retirados AHORA y descuenta stock recién en este
  // momento (nunca antes). El pago no condiciona el retiro ("retiro libre"):
  // las señas ya cobradas se reparten en FIFO entre los sucesivos retiros
  // (asignarSeñasFIFO) para que la plata quede bien atribuida a lo largo de
  // varias entregas parciales, pero si no alcanza a cubrir un retiro, el
  // faltante simplemente no se asigna — la mercadería sale igual. La reserva
  // se marca "completada" recién cuando no queda ningún item pendiente.
  const handleRetirarItems = async (reserva, itemsARetirar) => {
    if (!caja?.abierta) throw new Error("La caja está cerrada. Abrila desde Caja para registrar el retiro.");
    if (!itemsARetirar.length) throw new Error("Elegí al menos un producto para retirar.");

    const pendientes = itemsPendientesEntrega(reserva);
    const permitirStockNegativo = configPrecios?.permitirStockNegativo ?? false;
    const itemsSinStock = [];
    for (const item of itemsARetirar) {
      const pend = pendientes.find(p => p.productoId === item.productoId);
      if (!pend || item.qty > pend.qtyPendiente) {
        throw new Error(`"${item.nombre}": cantidad a retirar (${item.qty}) supera lo pendiente (${pend?.qtyPendiente ?? 0}).`);
      }
      const disp = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === reserva.depositoId)?.cantidad ?? 0;
      if (item.qty > disp) {
        if (!permitirStockNegativo) {
          throw new Error(`Stock insuficiente en ${reserva.depositoNombre}: "${item.nombre}" — disponible: ${disp}, pedido: ${item.qty}.`);
        }
        itemsSinStock.push({ nombre: item.nombre, resultante: disp - item.qty });
      }
    }

    const cierraReserva = pendientes.every(p => {
      const tomado = itemsARetirar.find(i => i.productoId === p.productoId)?.qty || 0;
      return tomado >= p.qtyPendiente;
    });

    const subtotalRetiro = itemsARetirar.reduce((a, i) => a + i.qty * i.precio, 0);
    const montoYaConsumido = (reserva.retiros || []).reduce(
      (a, r) => a + (r.pagosAsignados || []).reduce((s, p) => s + p.monto, 0), 0
    );
    const montoDisponible = Math.max(0, reserva.totalSeñas - montoYaConsumido);
    const pagosAsignados = asignarSeñasFIFO(reserva.señas, montoYaConsumido, Math.min(subtotalRetiro, montoDisponible));
    const formaPagoVenta = pagosAsignados.length === 0 ? "Retiro (sin cobro nuevo)"
      : pagosAsignados.length === 1 ? pagosAsignados[0].formaPago
      : "Pago combinado";

    const venta = {
      fecha: today(),
      periodo: today().slice(0, 7),
      usuario: usuarioActivo?.nombre || "—",
      clienteId: reserva.clienteId,
      cliente: reserva.cliente,
      lista: reserva.lista || "",
      formaPago: formaPagoVenta,
      pagos: pagosAsignados,
      tipo: "Mostrador",
      depositoId: reserva.depositoId,
      depositoNombre: reserva.depositoNombre,
      items: itemsARetirar.map(i => ({ productoId: i.productoId, nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total: subtotalRetiro,
    };

    let ventaGuardada;
    try {
      ventaGuardada = await agregarVenta(venta);
    } catch {
      throw new Error("No se pudo generar la venta del retiro. Reintentá.");
    }

    try {
      const cambiosDeposito = itemsARetirar.map(item => ({
        productoId: item.productoId, depositoId: reserva.depositoId, delta: -item.qty,
      }));
      await aplicarDeltaStockMultiple(cambiosDeposito);
      // Delta atómico también para el total (no "prod.stock - qty" calculado
      // acá) — la cantidad ya se validó contra lo pendiente/disponible más
      // arriba, así que no hace falta volver a recortarla.
      await aplicarDeltaStockProductoMultiple(
        itemsARetirar.map(item => ({ productoId: item.productoId, delta: -item.qty }))
      );
    } catch {
      toast(`Venta #${ventaGuardada.id} generada, pero hubo un error al descontar stock — verificá manualmente.`, "warning");
    }

    await registrarRetiroReserva(reserva.id, {
      fecha: today(),
      ventaId: ventaGuardada.id,
      items: itemsARetirar.map(i => ({ productoId: i.productoId, nombre: i.nombre, qty: i.qty, precio: i.precio })),
      pagosAsignados,
      usuario: usuarioActivo?.nombre || "",
      cierraReserva,
    });

    toast(
      (cierraReserva ? "Reserva completada. " : "Retiro parcial registrado. ") + `Venta #${ventaGuardada.id} generada.` +
      (itemsSinStock.length ? ` Atención: quedó stock negativo en ${itemsSinStock.map(i => `"${i.nombre}" (${i.resultante})`).join(", ")}.` : ""),
      itemsSinStock.length ? "warning" : "success"
    );
  };

  // ── Recalcular precios de una reserva pendiente. Por defecto contra la
  // misma lista con la que se creó (repreciar tras mucho tiempo); si se pasa
  // `listaOverride` (la lista asignada al medio de pago con el que están
  // cobrando el saldo — señaron en un medio y pagan la diferencia con otro),
  // recalcula contra esa lista y la deja guardada como lista de la reserva.
  // Mismo criterio que handleRecalcularPrecios de useGestionSeñaVenta, para
  // las señas hechas desde Ventas.
  const handleRecalcularPreciosReserva = async (reserva, listaOverride = null) => {
    const listaObj = listaOverride || listas.find(l => l.nombre === reserva.lista);
    if (!listaObj) { toast("No se encontró la lista de precios de esta reserva.", "error"); return; }

    const nuevosItems = (reserva.items || []).map(it => {
      const prod = productos.find(p => p.id === it.productoId);
      if (!prod) return it;
      const precio = precioPorLista(prod, listaObj, margenBase, rubros, proveedores);
      return { ...it, precio, subtotal: precio * it.qty };
    });

    const totalViejo = reserva.total;
    const totalNuevo = nuevosItems.reduce((a, it) => a + it.precio * it.qty, 0);
    const cambiaLista = listaObj.nombre !== reserva.lista;

    if (totalNuevo === totalViejo && !cambiaLista) {
      toast("Los precios no cambiaron.", "success");
      return;
    }

    const cantCambiados = nuevosItems.filter((it, i) => it.precio !== reserva.items[i].precio).length;
    const mensaje = cambiaLista
      ? `Se recalcula con la lista "${listaObj.nombre}". Nuevo total: ${fmt(totalNuevo)} (antes ${fmt(totalViejo)}). ¿Aplicar?`
      : `El precio de ${cantCambiados} artículo${cantCambiados !== 1 ? "s" : ""} cambió. Nuevo total: ${fmt(totalNuevo)} (antes ${fmt(totalViejo)}). ¿Aplicar los precios actuales?`;
    const continuar = await confirm(mensaje, { confirmLabel: "Aplicar" });
    if (!continuar) return;

    try {
      await editarPreciosReserva(reserva.id, { lista: listaObj.nombre, items: nuevosItems, total: totalNuevo });
      toast("Precios actualizados.", "success");
    } catch (err) {
      toast(err.message || "Error al actualizar los precios.", "error");
    }
  };

  const filtroBtn = (id, label) => (
    <button key={id} className={`btn btn-sm ${fEstado === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setFEstado(id)}>
      {label}
    </button>
  );

  return (
    <div>
      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Reservas pendientes", val: metrics.pendientes, color: "var(--amber)" },
          { label: "Total señas cobradas", val: fmt(metrics.totalSeñas), color: "var(--green)" },
          { label: "Saldo pendiente de cobro", val: fmt(metrics.saldoPendiente), color: metrics.saldoPendiente > 0 ? "var(--red)" : "var(--green)" },
          { label: "Completadas este mes", val: metrics.completadasMes, color: "var(--text1)" },
        ].map((m, i) => (
          <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros + acción */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {filtroBtn("todas", "Todas")}
            {filtroBtn("pendiente", "Pendientes")}
            {filtroBtn("completada", "Completadas")}
            {filtroBtn("cancelada", "Canceladas")}
          </div>
          <div style={{ position: "relative", minWidth: 200 }}>
            <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
            <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Cliente o N° reserva..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <input type="date" className="form-input" style={{ width: 150 }} value={fDesde} onChange={e => setFDesde(e.target.value)} />
          <input type="date" className="form-input" style={{ width: 150 }} value={fHasta} onChange={e => setFHasta(e.target.value)} />
          <button className="btn btn-sm btn-primary" style={{ marginLeft: "auto" }} onClick={() => setShowNueva(true)}>
            <Icon name="plus" size={14}/> Nueva reserva
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        <div className="card-title">
          Reservas
          <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text3)", fontSize: 11 }}>{filtradas.length} resultado{filtradas.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N° Reserva</th><th>Fecha</th><th>Cliente</th><th style={{ textAlign: "right" }}>Total</th>
                <th>Señas</th><th style={{ textAlign: "right" }}>Saldo</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text3)", padding: 40 }}>Sin reservas para los filtros aplicados</td></tr>
              )}
              {filtradasPagina.map(r => {
                const badge = ESTADO_BADGE[r.estado] || { label: r.estado, cls: "badge-accent" };
                const pct = r.total > 0 ? Math.min(100, Math.round((r.totalSeñas / r.total) * 100)) : 0;
                const esVenta = r.origin === "venta";
                const motivoAnulV = esVenta ? motivoNoAnular(r.raw) : null;
                return (
                  <tr key={r.key}>
                    <td>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.nro}</div>
                      <span
                        className="badge"
                        style={{
                          fontSize: 9, marginTop: 2, display: "inline-block",
                          background: esVenta ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "var(--bg4)",
                          color: esVenta ? "var(--accent2)" : "var(--text3)",
                        }}
                      >
                        {esVenta ? "Seña · Venta" : "Reserva"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtFechaAR(r.fecha)}</td>
                    <td style={{ color: "var(--text1)", fontWeight: 500 }}>{r.cliente}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--accent2)" }}>{fmt(r.total)}</td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ height: 6, background: "var(--bg4)", borderRadius: 99, overflow: "hidden", marginBottom: 3 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "var(--green)" : "var(--accent)" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>{fmt(r.totalSeñas)} ({pct}%)</div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: r.saldoPendiente > 0 ? "var(--amber)" : "var(--green)" }}>{fmt(r.saldoPendiente)}</td>
                    <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {!esVenta && (
                          <>
                            <button className="btn btn-sm" onClick={() => setDetalleReserva(r.raw)}>Ver</button>
                            {r.estado === "pendiente" && (
                              <>
                                <button className="btn btn-sm btn-ghost" title="Agregar seña" onClick={() => setDetalleReserva(r.raw)}>
                                  <Icon name="plus" size={12}/> Seña
                                </button>
                                <button className="btn btn-sm btn-success" title="Retirar mercadería" onClick={() => setDetalleReserva(r.raw)}>
                                  <Icon name="check" size={12}/>
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {esVenta && (
                          <>
                            <button className="btn btn-sm" title="Ver / imprimir comprobante" onClick={() => setShowTicket(r.raw)}>Ver</button>
                            {r.estado === "pendiente" && (
                              <button
                                className="btn btn-sm btn-success"
                                title="Retirar / cobrar"
                                onClick={() => {
                                  const motivo = motivoNoRetirar(r.raw);
                                  if (motivo) { toast(motivo, "warning"); return; }
                                  setShowCompletarRetiro(r.raw);
                                }}
                              >
                                Retirar / cobrar
                              </button>
                            )}
                            {(r.estado === "pendiente" || r.estado === "completada") && (
                              <button
                                className="btn btn-sm"
                                title={motivoAnulV || (r.estado === "pendiente" ? "Anular esta seña" : "Anular esta venta")}
                                onClick={() => {
                                  if (motivoAnulV) { toast(motivoAnulV, "warning"); return; }
                                  setShowAnulacion(r.raw);
                                }}
                                style={{
                                  color: motivoAnulV ? "var(--text3)" : "var(--red)",
                                  borderColor: motivoAnulV ? "var(--border)" : "rgba(242,107,91,0.35)",
                                  opacity: motivoAnulV ? 0.35 : 1,
                                  cursor: motivoAnulV ? "not-allowed" : "pointer",
                                }}
                              >
                                Anular
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Paginacion pagina={paginaRes} totalPaginas={totalPaginasRes} onCambiar={setPaginaRes} totalItems={filtradas.length} pageSize={pageSizeRes} etiqueta="reservas" />
      </div>

      {showNueva && (
        <ModalNuevaReserva
          clientes={clientes}
          productos={productos}
          depositos={depositos}
          stockDepositos={stockDepositos}
          listas={listas}
          configPrecios={configPrecios}
          rubros={rubros}
          proveedores={proveedores}
          reservas={reservas}
          usuarioActivo={usuarioActivo}
          crearReserva={crearReserva}
          onClose={() => setShowNueva(false)}
        />
      )}

      {detalleReserva && (
        <ModalDetalleReserva
          reserva={reservas.find(r => r.id === detalleReserva.id) || detalleReserva}
          agregarSeña={agregarSeña}
          onRetirar={handleRetirarItems}
          onRecalcularPrecios={handleRecalcularPreciosReserva}
          listas={listas.filter(l => l.activa !== false)}
          cancelarReserva={cancelarReserva}
          onClose={() => setDetalleReserva(null)}
          usuarioActivo={usuarioActivo}
          logoBase64={configPrecios?.logoBase64}
        />
      )}

      {showAnulacion && (
        <ModalAnulacionVenta
          venta={showAnulacion}
          caja={caja}
          onClose={() => setShowAnulacion(null)}
          onConfirmar={async ({ motivo }) => {
            try {
              await handleAnular(showAnulacion, motivo);
              setShowAnulacion(null);
            } catch {
              // handleAnular ya mostró el toast de error — dejamos el modal
              // abierto para que se pueda reintentar, igual que en Ventas.
            }
          }}
        />
      )}

      {showCompletarRetiro && (
        <ModalCompletarRetiro
          venta={ventas.find(v => v.id === showCompletarRetiro.id) || showCompletarRetiro}
          configPrecios={configPrecios}
          tarjetas={tarjetas}
          listas={listas.filter(l => l.activa !== false)}
          onRetirar={handleRetirarSeña}
          onAgregarPago={handleAgregarPagoSeña}
          onRecalcularPrecios={handleRecalcularPrecios}
          onClose={() => setShowCompletarRetiro(null)}
        />
      )}

      {showTicket && (
        <ModalTicket
          venta={showTicket}
          cambios={(cambiosArticulo || []).filter(c => c.ventaOriginalId === showTicket.id)}
          logoBase64={configPrecios?.logoBase64}
          onClose={() => setShowTicket(null)}
        />
      )}
    </div>
  );
}
