import { useState, useMemo } from "react";
import { calcularSaldosTesoreria, nombresCuentas, esFuenteTesoreria, etiquetaFuente } from "../../utils/tesoreria.js";
import { fmt, horaActual, fmtFechaAR } from "../../utils/helpers.js";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import ModalNuevoProveedor from "./ModalNuevoProveedor";
import ModalNuevaCompra from "./ModalNuevaCompra";
import ModalNuevaOrdenPago from "./ModalNuevaOrdenPago";
import { useToast } from "../ui/Toast";

export default function PageCompras({ compras, setCompras, proveedores, setProveedores, productos, setProductos, depositos = [], setStockDepositos, stockDepositos = [], actualizarStockDepositoMultiple, ordenesPago, setOrdenesPago, periodosCerrados = [], usuarioActivo, permisos = {}, agregarProveedor, actualizarProveedor, agregarCompra, actualizarEstadoCompra, facturarRemito, agregarOrdenPago, anularOrdenPago, actualizarStock, aplicarDeltaStockProductoMultiple, actualizarProducto, agregarProducto, caja, tesoreria, gastos = [], agregarRetiro, agregarMovimientoTesoreria, planCuentas = [] }) {
  const [showModal, setShowModal]     = useState(false);
  const [showProvModal, setShowProvModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);
  const [fromRemito, setFromRemito]   = useState(null);
  const [remitoEditar, setRemitoEditar] = useState(null);
  const [tab, setTab]                 = useState("compras"); // "compras" | "proveedores" | "ctacte" | "ordenes"
  const [tipoNuevo, setTipoNuevo] = useState("Factura");
  const [proveedorOpInicial, setProveedorOpInicial] = useState(null);
  const [proveedorEditar, setProveedorEditar] = useState(null);
  const { toast } = useToast();

  // Saldo disponible en Tesorería — para avisar antes de facturar con esa fuente
  // separado en efectivo y banco: el modal valida contra el que corresponde
  // según la forma de pago.
  const saldosTesoreria = useMemo(() => calcularSaldosTesoreria(tesoreria, gastos, compras), [tesoreria, gastos, compras]);
  const nombresCtas = nombresCuentas(planCuentas);

  const { pagina: paginaCompras, setPagina: setPaginaCompras, totalPaginas: totalPaginasCompras, itemsPagina: comprasPagina, pageSize: pageSizeCompras } = usePaginacion(compras);
  const { pagina: paginaProv, setPagina: setPaginaProv, totalPaginas: totalPaginasProv, itemsPagina: proveedoresPagina, pageSize: pageSizeProv } = usePaginacion(proveedores);
  const { pagina: paginaOp, setPagina: setPaginaOp, totalPaginas: totalPaginasOp, itemsPagina: ordenesPagoPagina, pageSize: pageSizeOp } = usePaginacion(ordenesPago);

  const estadoBadge = (e) => ({
    "recibida":          <span className="badge badge-ok">Recibida</span>,
    "pendiente_factura": <span className="badge badge-warn">Pend. factura</span>,
    "anulada":           <span className="badge badge-danger">Anulada</span>,
  })[e] || <span className="badge">{e}</span>;

  const estadoOpBadge = (e) => ({
    "emitida": <span className="badge badge-blue">Emitida</span>,
    "anulada": <span className="badge badge-danger">Anulada</span>,
  })[e] || <span className="badge">{e}</span>;

  // Saldo en cuenta corriente por proveedor: facturas en cta. cte. menos órdenes de pago emitidas
  const ctaCteResumen = useMemo(() => {
    return proveedores.map(prov => {
      const facturas = compras.filter(c =>
        (c.proveedorId === prov.id || (!c.proveedorId && c.proveedor === prov.nombre)) &&
        c.formaPago === "Cuenta Corriente Proveedor" &&
        c.tipo === "Factura" &&
        c.estado !== "anulada"
      );
      const totalDeuda  = facturas.reduce((s, c) => s + c.total, 0);
      const totalPagado = ordenesPago
        .filter(op => op.proveedorId === prov.id && op.estado !== "anulada")
        .reduce((s, op) => s + op.monto, 0);
      return { proveedor: prov, facturas, totalDeuda, totalPagado, saldo: totalDeuda - totalPagado };
    }).filter(r => r.totalDeuda > 0);
  }, [proveedores, compras, ordenesPago]);

  const TABS = [
    { id:"compras",     label:"Compras" },
    { id:"proveedores", label:"Proveedores" },
    { id:"ctacte",      label:"Cta. Cte." },
    { id:"ordenes",     label:"Órdenes de Pago" },
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{display:"flex",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:"7px 16px",fontSize:13,fontWeight:500,border:"none",cursor:"pointer",
                background: tab===t.id ? "var(--accent)" : "transparent",
                color: tab===t.id ? "#fff" : "var(--text2)"}}>
              {t.label}
              {t.id==="ctacte" && ctaCteResumen.length > 0 && (
                <span style={{marginLeft:6, background:"rgba(255,255,255,0.25)", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700}}>
                  {ctaCteResumen.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          {tab==="compras" && (
            <>
              <button className="btn" onClick={()=>{ setFromRemito(null); setTipoNuevo("Remito"); setShowModal(true); }}>
                <Icon name="plus" size={14}/> Nuevo remito
              </button>
              <button className="btn btn-primary" onClick={()=>{ setFromRemito(null); setTipoNuevo("Factura"); setShowModal(true); }}>
                <Icon name="plus" size={14}/> Nueva factura
              </button>
            </>
          )}
          {tab==="proveedores" && (
            <button className="btn btn-primary" onClick={()=>setShowProvModal(true)}>
              <Icon name="plus" size={14}/> Nuevo proveedor
            </button>
          )}
          {(tab==="ctacte" || tab==="ordenes") && (
            <button className="btn btn-primary" onClick={()=>{ setProveedorOpInicial(null); setShowOpModal(true); }}>
              <Icon name="plus" size={14}/> Nueva Orden de Pago
            </button>
          )}
        </div>
      </div>

      {tab==="compras" && (
        <div className="card">
          <div className="card-title">Documentos de compra</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tipo</th><th>N° Comprobante</th><th>Fecha</th><th>Proveedor</th><th>Forma pago</th><th>Total</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {comprasPagina.map(c=>(
                  <tr key={c.id}>
                    <td>
                      <span className={`badge ${c.tipo==="Factura"?"badge-ok":"badge-blue"}`}>{c.tipo}</span>
                      {c.tipoFactura && (
                        <span style={{marginLeft:5, fontSize:10, color:"var(--text3)"}}>{c.tipoFactura}</span>
                      )}
                      {c.sinDetalle && (
                        <span className="badge badge-warn" style={{marginLeft:6}} title="Compra cargada solo con el importe: no sumó stock">Sin detalle</span>
                      )}
                    </td>
                    <td className="mono" style={{color:"var(--text3)",fontSize:11}}>{c.nro}</td>
                    <td>{fmtFechaAR(c.fecha)}</td>
                    <td style={{color:"var(--text1)"}}>
                      {c.proveedor}
                      {c.sinDetalle && c.descripcion && (
                        <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{c.descripcion}</div>
                      )}
                    </td>
                    <td style={{fontSize:12}}>{c.formaPago}</td>
                    <td style={{color:"var(--accent2)",fontWeight:600}}>{fmt(c.total)}</td>
                    <td>{estadoBadge(c.estado)}</td>
                    <td>
                      {c.tipo==="Remito" && c.estado==="pendiente_factura" && (
                        <div style={{display:"flex", gap:6}}>
                          {permisos?.[usuarioActivo?.id]?.editarRemito && (
                          <button className="btn btn-sm btn-ghost"
                            onClick={()=>setRemitoEditar(c)}
                            title="Editar remito">
                            <Icon name="tag" size={13}/> Editar
                          </button>
                          )}
                          <button className="btn btn-sm btn-success"
                            onClick={()=>{ setFromRemito(c); setTipoNuevo("Factura"); setShowModal(true); }}
                            title="Generar factura desde este remito">
                            <Icon name="receipt" size={13}/> Facturar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacion pagina={paginaCompras} totalPaginas={totalPaginasCompras} onCambiar={setPaginaCompras} totalItems={compras.length} pageSize={pageSizeCompras} etiqueta="compras" />
        </div>
      )}

      {tab==="proveedores" && (
        <div className="card">
          <div className="card-title">Proveedores registrados</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Razón social</th><th>CUIT</th><th>Teléfono</th><th>Email</th><th>IVA</th><th>Próximo viaje</th><th>Margen</th><th></th></tr></thead>
              <tbody>
                {proveedoresPagina.map(p=>(
                  <tr key={p.id}>
                    <td style={{color:"var(--text1)",fontWeight:500}}>{p.nombre}</td>
                    <td className="mono">{p.cuit}</td>
                    <td>{p.tel}</td>
                    <td style={{color:"var(--text3)",fontSize:12}}>{p.email}</td>
                    <td><span className="badge badge-accent">{p.iva}</span></td>
                    <td style={{fontSize:12, color: p.proximoViaje ? "var(--text2)" : "var(--text3)"}}>
                      {p.proximoViaje ? fmtFechaAR(p.proximoViaje) : "Sin definir"}
                    </td>
                    <td style={{fontSize:12, color: p.margen != null ? "var(--accent2)" : "var(--text3)"}}>
                      {p.margen != null ? `${p.margen}%` : "Global"}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={()=>setProveedorEditar(p)}>
                        <Icon name="tag" size={13}/> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacion pagina={paginaProv} totalPaginas={totalPaginasProv} onCambiar={setPaginaProv} totalItems={proveedores.length} pageSize={pageSizeProv} etiqueta="proveedores" />
        </div>
      )}

      {tab==="ctacte" && (
        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          {ctaCteResumen.length === 0 ? (
            <div className="card" style={{textAlign:"center", color:"var(--text3)", padding:40}}>
              <Icon name="check" size={28}/>
              <div style={{marginTop:8}}>Sin deuda en cuenta corriente con proveedores</div>
            </div>
          ) : ctaCteResumen.map(r => (
            <div key={r.proveedor.id} className="card">
              <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10}}>
                <div>
                  <div className="card-title" style={{marginBottom:2}}>{r.proveedor.nombre}</div>
                  <div style={{fontSize:11, color:"var(--text3)"}}>CUIT {r.proveedor.cuit} · {r.proveedor.iva}</div>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:12}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em"}}>Saldo pendiente</div>
                    <div style={{fontSize:22, fontWeight:700, color: r.saldo > 0 ? "var(--red)" : "var(--green)"}}>
                      {fmt(r.saldo)}
                    </div>
                  </div>
                  {r.saldo > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={()=>{ setProveedorOpInicial(r.proveedor.id); setShowOpModal(true); }}>
                      <Icon name="receipt" size={13}/> Emitir OP
                    </button>
                  )}
                </div>
              </div>

              <div style={{display:"flex", gap:16, marginBottom:12, flexWrap:"wrap"}}>
                <div style={{flex:"1 1 160px", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px"}}>
                  <div style={{fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4}}>Total facturado</div>
                  <div style={{fontSize:16, fontWeight:700, color:"var(--text1)"}}>{fmt(r.totalDeuda)}</div>
                </div>
                <div style={{flex:"1 1 160px", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px"}}>
                  <div style={{fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4}}>Órdenes emitidas</div>
                  <div style={{fontSize:16, fontWeight:700, color:"var(--green)"}}>{fmt(r.totalPagado)}</div>
                </div>
                <div style={{flex:"1 1 160px",
                  background: r.saldo > 0 ? "rgba(239,68,68,0.07)" : "rgba(62,207,142,0.07)",
                  border:`1px solid ${r.saldo > 0 ? "rgba(239,68,68,0.2)" : "rgba(62,207,142,0.2)"}`,
                  borderRadius:8, padding:"10px 14px"}}>
                  <div style={{fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4}}>Saldo</div>
                  <div style={{fontSize:16, fontWeight:700, color: r.saldo > 0 ? "var(--red)" : "var(--green)"}}>{fmt(r.saldo)}</div>
                </div>
              </div>

              {r.facturas.length > 0 && (
                <div>
                  <div style={{fontSize:11, color:"var(--text3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em", marginBottom:6}}>
                    Facturas en cuenta corriente
                  </div>
                  <div style={{border:"1px solid var(--border)", borderRadius:8, overflow:"hidden"}}>
                    <table style={{width:"100%", borderCollapse:"collapse", fontSize:12}}>
                      <thead>
                        <tr style={{background:"var(--bg2)"}}>
                          <th style={{padding:"6px 12px", textAlign:"left", color:"var(--text3)", fontWeight:500}}>N° Factura</th>
                          <th style={{padding:"6px 12px", textAlign:"left", color:"var(--text3)", fontWeight:500}}>Fecha</th>
                          <th style={{padding:"6px 12px", textAlign:"right", color:"var(--text3)", fontWeight:500}}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.facturas.map(c => (
                          <tr key={c.id} style={{borderTop:"1px solid var(--border)"}}>
                            <td style={{padding:"7px 12px", fontFamily:"monospace", color:"var(--text2)"}}>{c.nro}</td>
                            <td style={{padding:"7px 12px", color:"var(--text3)"}}>{fmtFechaAR(c.fecha)}</td>
                            <td style={{padding:"7px 12px", textAlign:"right", fontWeight:600, color:"var(--accent2)"}}>{fmt(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="ordenes" && (
        <div className="card">
          <div className="card-title">Órdenes de Pago emitidas</div>
          {ordenesPago.length === 0 ? (
            <div style={{textAlign:"center", color:"var(--text3)", padding:40, fontSize:13}}>
              <Icon name="receipt" size={28}/>
              <div style={{marginTop:8}}>No hay órdenes de pago registradas</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>N° Orden</th><th>Fecha</th><th>Proveedor</th><th>Concepto</th>
                    <th>Forma pago</th><th>Fuente</th><th>Referencia</th><th>Importe</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesPagoPagina.map(op=>(
                    <tr key={op.id}>
                      <td className="mono" style={{color:"var(--text3)", fontSize:11}}>{op.nro}</td>
                      <td>{fmtFechaAR(op.fecha)}</td>
                      <td style={{color:"var(--text1)", fontWeight:500}}>{op.proveedor}</td>
                      <td style={{fontSize:12, color:"var(--text3)"}}>{op.concepto}</td>
                      <td style={{fontSize:12}}>{op.formaPago}</td>
                      <td style={{fontSize:12, color:"var(--text2)"}}>{op.fuentePago || "—"}</td>
                      <td style={{fontSize:11, color:"var(--text3)"}}>{op.referencia || "—"}</td>
                      <td style={{color:"var(--accent2)", fontWeight:600}}>{fmt(op.monto)}</td>
                      <td>{estadoOpBadge(op.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Paginacion pagina={paginaOp} totalPaginas={totalPaginasOp} onCambiar={setPaginaOp} totalItems={ordenesPago.length} pageSize={pageSizeOp} etiqueta="órdenes" />
        </div>
      )}

      {showModal && (
        <ModalNuevaCompra
          proveedores={proveedores}
          agregarProveedor={agregarProveedor}
          productos={productos}
          agregarProducto={agregarProducto}
          depositos={depositos}
          stockDepositos={stockDepositos}
          actualizarStockDepositoMultiple={actualizarStockDepositoMultiple}
          fromRemito={fromRemito}
          tipoInicial={tipoNuevo}
          periodosCerrados={periodosCerrados}
          cajaAbierta={caja?.abierta || false}
          saldosTesoreria={saldosTesoreria}
          nombresCuentas={nombresCtas}
          onClose={()=>{ setShowModal(false); setFromRemito(null); }}
          onConfirm={async (c) => {
            try {
              // Actualizar stock/costo en Supabase para cada item. El total vía
              // delta atómico (no "prod.stock + qty" calculado acá) — así una
              // compra y una venta del mismo producto casi en simultáneo no se
              // pisan (ver aplicarDeltaStockProductoMultiple).
              const skipStock = fromRemito?.stockActualizado === true;
              const itemsConProducto = c.items.filter(i => i.productoId);
              try {
                if (!skipStock && itemsConProducto.length && aplicarDeltaStockProductoMultiple) {
                  await aplicarDeltaStockProductoMultiple(
                    itemsConProducto.map(item => ({ productoId: item.productoId, delta: item.qty }))
                  );
                }
                await Promise.all(itemsConProducto.map(item => actualizarProducto(item.productoId, { costo: item.costo })));
              } catch (stockErr) {
                toast(`Compra guardada, pero error al actualizar stock: ${stockErr.message}. Ajustá el stock manualmente.`, "error");
              }
              if (fromRemito) {
                await facturarRemito(fromRemito.id, c);
              } else {
                await agregarCompra(c);
              }

              // Efecto real del pago: retiro de Caja Salón o egreso de Tesorería,
              // igual que hace Gastos con su selector de "fuente".
              if (c.tipo === "Factura" && c.fuente && c.fuente !== "sin_impacto") {
                try {
                  // Caja Salón solo sabe descontar Efectivo o Transferencia (ver
                  // mismo arreglo en PageGastos.jsx) — antes cualquier otro medio
                  // (Cheque, Tarjeta) caía al "else" y se registraba como un
                  // retiro de Efectivo, descontando plata real de la caja por
                  // algo que nunca salió de ahí.
                  if (c.fuente === "caja_salon" && caja?.abierta && typeof agregarRetiro === "function") {
                    if (c.formaPago === "Efectivo" || c.formaPago === "Transferencia") {
                      await agregarRetiro({
                        monto: c.total,
                        motivo: `Compra: ${c.proveedor} · ${c.nro}`,
                        cuentaContable: "115",
                        medio: c.formaPago,
                        usuario: usuarioActivo?.nombre || null,
                      });
                    } else {
                      toast(`Compra registrada, pero no se descontó de Caja Salón: un pago en ${c.formaPago} no mueve la plata de la caja.`, "warning");
                    }
                  } else if (esFuenteTesoreria(c.fuente) && typeof agregarMovimientoTesoreria === "function") {
                    await agregarMovimientoTesoreria({
                      tipo: "Egreso Compra",
                      fecha: c.fecha,
                      hora: horaActual(),
                      concepto: `Compra · ${c.proveedor} · ${c.nro}${c.fuente === "tesoreria" ? "" : ` · ${etiquetaFuente(c.fuente, nombresCtas)}`}`,
                      monto: c.total,
                      formaPago: c.formaPago,
                      estado: "egreso",
                    });
                  }
                } catch (fuenteErr) {
                  toast(`Compra guardada, pero no se pudo registrar el egreso en ${c.fuente === "caja_salon" ? "Caja" : "Tesorería"}: ${fuenteErr.message}`, "error");
                }
              }

              setShowModal(false);
              setFromRemito(null);
            } catch (err) {
              toast(err.message, "error");
            }
          }}
        />
      )}
      {remitoEditar && (
        <ModalNuevaCompra
          proveedores={proveedores}
          agregarProveedor={agregarProveedor}
          productos={productos}
          agregarProducto={agregarProducto}
          depositos={depositos}
          stockDepositos={stockDepositos}
          actualizarStockDepositoMultiple={actualizarStockDepositoMultiple}
          editandoCompra={remitoEditar}
          periodosCerrados={periodosCerrados}
          onClose={()=>setRemitoEditar(null)}
          onEditar={async (nuevoRemito)=>{
            const viejo = remitoEditar;
            // Revertir stock del remito original si había actualizado stock
            if (viejo.stockActualizado && viejo.depositoId && actualizarStockDepositoMultiple) {
              const cambiosRevertir = viejo.items.filter(i => i.productoId).map(item => {
                const sd = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === viejo.depositoId);
                return { productoId: item.productoId, depositoId: viejo.depositoId, cantidad: Math.max(0, (sd?.cantidad || 0) - item.qty) };
              });
              if (cambiosRevertir.length) await actualizarStockDepositoMultiple(cambiosRevertir).catch(() => {});
            }
            // Aplicar nuevo stock
            if (nuevoRemito.stockActualizado && nuevoRemito.depositoId && actualizarStockDepositoMultiple) {
              const cambiosNuevo = nuevoRemito.items.filter(i => i.productoId).map(item => {
                const sd = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === nuevoRemito.depositoId);
                return { productoId: item.productoId, depositoId: nuevoRemito.depositoId, cantidad: (sd?.cantidad || 0) + item.qty };
              });
              if (cambiosNuevo.length) await actualizarStockDepositoMultiple(cambiosNuevo).catch(() => {});
            }
            setCompras(prev => prev.map(c => c.id === viejo.id ? { ...nuevoRemito, id: viejo.id } : c));
            setRemitoEditar(null);
          }}
        />
      )}

      {showProvModal && (
        <ModalNuevoProveedor
          onClose={()=>setShowProvModal(false)}
          onGuardar={async (p)=>{
            await agregarProveedor(p);
            setShowProvModal(false);
          }}
        />
      )}
      {proveedorEditar && (
        <ModalNuevoProveedor
          proveedorEditar={proveedorEditar}
          onClose={()=>setProveedorEditar(null)}
          onGuardar={async (p)=>{
            await actualizarProveedor(p.id, p);
            setProveedorEditar(null);
          }}
        />
      )}
      {showOpModal && (
        <ModalNuevaOrdenPago
          proveedores={proveedores}
          compras={compras}
          ordenesPago={ordenesPago}
          proveedorIdInicial={proveedorOpInicial}
          onClose={()=>{ setShowOpModal(false); setProveedorOpInicial(null); }}
          onConfirm={async (op) => {
            try {
              await agregarOrdenPago(op);
              setShowOpModal(false);
              setProveedorOpInicial(null);
            } catch (err) {
              toast(err.message, "error");
            }
          }}
        />
      )}
    </div>
  );
}

// ─── PAGE: PRODUCTOS ───────────────────────────────────────────────────────────
