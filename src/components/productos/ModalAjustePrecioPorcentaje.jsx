import { useState, useMemo, useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, precioPorLista, precioBaseDe, labelLista, runInBatches } from "../../utils/helpers.js";
import { useToast } from "../ui/Toast.jsx";

const AMBITOS = [
  { id: "rubro",     label: "Rubro"     },
  { id: "proveedor", label: "Proveedor" },
  { id: "producto",  label: "Producto"  },
];

const BASES_COSTO = [
  { id: "sin",    label: "Costo sin IVA" },
  { id: "con",    label: "Costo con IVA" },
  { id: "precio", label: "Precio base actual" },
];

const REDONDEOS = [
  { id: "0",    label: "Sin redondeo" },
  { id: "10",   label: "Más cercano a $10" },
  { id: "50",   label: "Más cercano a $50" },
  { id: "100",  label: "Más cercano a $100" },
  { id: "1000", label: "Más cercano a $1.000" },
];

const ALICUOTA_IVA = 21;

const redondear = (valor, denom) => denom > 0 ? Math.round(valor / denom) * denom : Math.round(valor);

export default function ModalAjustePrecioPorcentaje({ productos, setProductos, actualizarProducto, proveedores, rubros, rubrosDB = [], listas, listaInicial, margenBase = 0, onClose }) {
  const { toast } = useToast();
  const listaBaseId = (listas.find(l => l.pct === 0) || listas[0]).id;
  const [listaId,       setListaId]       = useState(listaInicial ?? listaBaseId);
  const [ambito,        setAmbito]        = useState("rubro");
  const [ambitoValor,   setAmbitoValor]   = useState("");
  const [baseCosto,     setBaseCosto]     = useState("sin"); // "sin" | "con" IVA
  const [redondeo,      setRedondeo]      = useState("0");
  const [pct,           setPct]           = useState("");
  const [previewAjuste, setPreviewAjuste] = useState(null); // null | filas[]
  const [excluidos,     setExcluidos]     = useState(0); // productos con base $0, fuera del preview
  const [aplicando,     setAplicando]     = useState(false);

  const { pagina: paginaAjuste, setPagina: setPaginaAjuste, totalPaginas: totalPaginasAjuste, itemsPagina: previewAjustePagina, pageSize: pageSizeAjuste } = usePaginacion(previewAjuste || []);

  const listaSeleccionada = useMemo(
    () => listas.find(l => l.id === Number(listaId)) || listas[0],
    [listas, listaId]
  );

  const cambiarLista  = (val) => { setListaId(val); setPreviewAjuste(null); };
  const cambiarAmbito = (val) => { setAmbito(val); setAmbitoValor(""); setPreviewAjuste(null); };

  // "Aplicar % sobre": costo (con o sin IVA) o el precio base actual del
  // producto (precioBaseDe respeta la precedencia real: manual > margen
  // propio > rubro > proveedor > general — nunca el campo legado
  // producto.precio, que quedó con datos viejos de costo en varios productos).
  const baseDe = (p) => {
    if (baseCosto === "con")    return Math.round(p.costo * (1 + ALICUOTA_IVA / 100));
    if (baseCosto === "precio") return precioBaseDe(p, margenBase, rubrosDB, proveedores);
    return p.costo;
  };
  const baseLabel = BASES_COSTO.find(b => b.id === baseCosto)?.label.toLowerCase() || "base";

  const productosEnAmbito = useMemo(() => {
    if (!ambitoValor) return [];
    return productos.filter(p => {
      if (p.activo === false) return false;
      if (ambito === "rubro") return (p.rubro || p.categoria) === ambitoValor;
      if (ambito === "proveedor") return String(p.proveedorId) === String(ambitoValor);
      if (ambito === "producto")  return String(p.id) === String(ambitoValor);
      return false;
    });
  }, [productos, ambito, ambitoValor]);

  // Calcula las filas del preview (sin validar ni mostrar toasts) — se usa
  // tanto al abrir la vista previa como al recalcularla en caliente si el
  // usuario cambia "Aplicar % sobre" con el preview ya abierto.
  const computarFilas = () => {
    const pctNum = Number(pct);
    const denom = Number(redondeo);
    const incluidos = productosEnAmbito.filter(p => baseDe(p) > 0);
    const excluidosCount = productosEnAmbito.length - incluidos.length;
    const filas = incluidos.map(p => {
      const base = baseDe(p);
      return {
        productoId:   p.id,
        codigo:       p.codigo,
        nombre:       p.nombre,
        baseUsada:    base,
        precioActual: precioPorLista(p, listaSeleccionada, margenBase, rubrosDB, proveedores),
        precioNuevo:  Math.max(0, redondear(base * (1 + pctNum / 100), denom)),
      };
    });
    return { filas, excluidosCount };
  };

  const calcularVistaPrevia = () => {
    if (!ambitoValor) { toast("Seleccioná un valor para el ámbito elegido.", "error"); return; }
    const pctNum = Number(pct);
    if (!pct || isNaN(pctNum) || pctNum === 0) { toast("Ingresá un porcentaje válido (puede ser negativo para descuentos).", "error"); return; }
    if (productosEnAmbito.length === 0) { toast("No hay productos activos que coincidan con ese filtro.", "error"); return; }
    const { filas, excluidosCount } = computarFilas();
    if (filas.length === 0) { toast(`Todos los productos filtrados tienen ${baseLabel} $0 — no hay nada para actualizar.`, "error"); return; }
    setPreviewAjuste(filas);
    setExcluidos(excluidosCount);
    setPaginaAjuste(1);
  };

  // Si ya hay un preview abierto y el usuario cambia entre Costo/Precio base,
  // se recalcula solo, sin tener que tocar "Vista previa" de nuevo.
  useEffect(() => {
    if (previewAjuste === null) return;
    const { filas, excluidosCount } = computarFilas();
    setPreviewAjuste(filas);
    setExcluidos(excluidosCount);
  }, [baseCosto]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarAjuste = async () => {
    if (!previewAjuste) return;
    setAplicando(true);
    const resultados = await runInBatches(previewAjuste, 20, r => {
      const p = productos.find(pr => pr.id === r.productoId);
      // El % de una lista nunca pisa el costo ni el precio base del producto:
      // siempre se guarda como precio final propio de esa lista, calculado
      // sobre la base elegida (costo con/sin IVA, o el precio base actual).
      return actualizarProducto(p.id, { precios: { ...p.precios, [listaSeleccionada.id]: r.precioNuevo } });
    });
    setAplicando(false);
    const fallidos = resultados.filter(res => res.status === "rejected").length;
    const aplicados = previewAjuste.length - fallidos;
    if (aplicados > 0) toast(`Precio de "${listaSeleccionada.nombre}" actualizado en ${aplicados} producto(s).`, "success");
    if (fallidos > 0) toast(`No se pudo actualizar el precio de ${fallidos} producto(s). Probá de nuevo.`, "error");
    setPreviewAjuste(null);
    setPct("");
    setAmbitoValor("");
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Ajustar % por lista</div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="close" size={16}/>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Lista de precio</label>
              <select className="form-select" value={listaId} onChange={e => cambiarLista(e.target.value)}>
                {listas.map(l => (
                  <option key={l.id} value={l.id}>{labelLista(l)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Aplicar por</label>
              <select className="form-select" value={ambito} onChange={e => cambiarAmbito(e.target.value)}>
                {AMBITOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                {ambito === "rubro" ? "Rubro" : ambito === "proveedor" ? "Proveedor" : "Producto"}
              </label>
              <select className="form-select" value={ambitoValor} onChange={e => { setAmbitoValor(e.target.value); setPreviewAjuste(null); }}>
                <option value="">Seleccionar...</option>
                {ambito === "rubro" && (rubros || []).map(r => <option key={r} value={r}>{r}</option>)}
                {ambito === "proveedor" && proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                {ambito === "producto"  && productos.filter(p => p.activo !== false).map(p => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="form-group" style={{ width: 180 }}>
              <label className="form-label">Aplicar % sobre</label>
              <select className="form-select" value={baseCosto} onChange={e => setBaseCosto(e.target.value)}>
                {BASES_COSTO.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ width: 160 }}>
              <label className="form-label">% a aplicar</label>
              <input
                className="form-input"
                type="number"
                placeholder="Ej: 100 ó 150"
                value={pct}
                onChange={e => { setPct(e.target.value); setPreviewAjuste(null); }}
                style={Number(pct) < 0 ? { color: "var(--amber)", borderColor: "var(--amber)" } : undefined}
              />
            </div>
            <div className="form-group" style={{ width: 180 }}>
              <label className="form-label">Redondear a</label>
              <select className="form-select" value={redondeo} onChange={e => { setRedondeo(e.target.value); setPreviewAjuste(null); }}>
                {REDONDEOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <button className="btn btn-sm btn-primary" onClick={calcularVistaPrevia}>
              <Icon name="search" size={13}/> Vista previa
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: -8 }}>
            {baseCosto === "precio"
              ? "El precio se calcula como: Precio base actual × (1 + %). Ejemplo: precio base $5.000 con 10% → precio $5.500."
              : "El precio se calcula como: Costo × (1 + %). Ejemplo: costo $1.000 con 10% → precio $1.100."}
            {" "}No es un incremento sobre el precio final anterior.
          </div>

          {previewAjuste && (
            <div>
              {excluidos > 0 && (
                <div style={{
                  marginBottom: 8, padding: "8px 12px", borderRadius: 6, fontSize: 12,
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "var(--amber)",
                }}>
                  {excluidos} producto{excluidos !== 1 ? "s" : ""} {excluidos !== 1 ? "tienen" : "tiene"} {baseLabel} $0 — no se {excluidos !== 1 ? "van" : "va"} a actualizar.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  Ajustando <strong style={{ color: "var(--text2)" }}>{listaSeleccionada.nombre}</strong> sobre {baseLabel} — {previewAjuste.length} producto{previewAjuste.length !== 1 ? "s" : ""} afectado{previewAjuste.length !== 1 ? "s" : ""}
                </div>
                <button className="btn btn-sm btn-success" onClick={aplicarAjuste} disabled={aplicando}>
                  <Icon name="check" size={13}/> {aplicando ? "Aplicando…" : `Aplicar a ${previewAjuste.length} producto${previewAjuste.length !== 1 ? "s" : ""}`}
                </button>
              </div>
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Base usada</th>
                      <th>Precio final actual</th>
                      <th>Precio final nuevo</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewAjustePagina.map(r => (
                      <tr key={r.productoId}>
                        <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.codigo}</td>
                        <td style={{ color: "var(--text1)" }}>{r.nombre}</td>
                        <td style={{ color: "var(--text3)" }}>{fmt(r.baseUsada)}</td>
                        <td style={{ color: "var(--text2)" }}>{fmt(r.precioActual)}</td>
                        <td style={{ color: "var(--accent2)", fontWeight: 600 }}>{fmt(r.precioNuevo)}</td>
                        <td style={{ color: r.precioNuevo >= r.precioActual ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                          {r.precioNuevo >= r.precioActual ? "+" : ""}{fmt(r.precioNuevo - r.precioActual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Paginacion pagina={paginaAjuste} totalPaginas={totalPaginasAjuste} onCambiar={setPaginaAjuste} totalItems={previewAjuste.length} pageSize={pageSizeAjuste} etiqueta="productos" />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
