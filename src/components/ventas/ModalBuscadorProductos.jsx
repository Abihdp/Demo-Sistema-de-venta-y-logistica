import { useState, useMemo } from "react";
import { Modal } from "../ui/Modal";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, precioPorLista, normalizarCodigoEscaneado, coincideBusqueda } from "../../utils/helpers";

export default function ModalBuscadorProductos({ productos, lista, margenBase = 0, rubrosDB = [], proveedores = [], recargoPct = 0, depositoId, depositoNombre, stockDepositos = [], permitirStockNegativo = false, onAgregar, onClose }) {
  const stockEnDeposito = (productoId) => {
    if (!depositoId) return null; // null = sin depósito seleccionado
    return stockDepositos.find(s => s.productoId === productoId && s.depositoId === depositoId)?.cantidad ?? 0;
  };
  const [busqueda,      setBusqueda]      = useState("");
  const [fRubro,        setFRubro]        = useState("");
  const [fColor,        setFColor]        = useState("");
  const [fTalle,        setFTalle]        = useState("");
  const [soloConStock,  setSoloConStock]  = useState(true);
  const [agregados,     setAgregados]     = useState({}); // { [id]: true } feedback visual

  // Valores únicos para los selectores
  const rubros = useMemo(() => [...new Set(productos.map(p => p.rubro || p.categoria).filter(Boolean))].sort(), [productos]);
  const colores    = useMemo(() => [...new Set(productos.map(p => p.color).filter(Boolean))].sort(), [productos]);
  const talles     = useMemo(() => [...new Set(productos.map(p => p.talle).filter(Boolean))].sort(), [productos]);

  const resultados = useMemo(() => {
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase().trim());
    return productos.filter(p => {
      const sd = stockEnDeposito(p.id);
      const stockDisp = sd !== null ? sd : p.stock;
      if (soloConStock && stockDisp <= 0) return false;
      if (fRubro && (p.rubro || p.categoria) !== fRubro) return false;
      if (fColor && p.color !== fColor)     return false;
      if (fTalle && p.talle !== fTalle)     return false;
      if (q && !coincideBusqueda([p.nombre, p.codigo, p.rubro, p.subrubro, p.color, p.talle].filter(Boolean).join(" "), q)) return false;
      return true;
    });
  }, [productos, busqueda, fRubro, fColor, fTalle, soloConStock]);

  const { pagina, setPagina, totalPaginas, itemsPagina: resultadosPagina, pageSize } = usePaginacion(resultados);

  const limpiar = () => {
    setBusqueda("");
    setFRubro("");
    setFColor("");
    setFTalle("");
    setSoloConStock(true);
  };

  const handleAgregar = (prod) => {
    onAgregar(prod);
    setAgregados(prev => ({ ...prev, [prod.id]: true }));
    setTimeout(() => setAgregados(prev => { const n = { ...prev }; delete n[prod.id]; return n; }), 1200);
  };

  const precio = (p) => {
    const base = precioPorLista(p, lista, margenBase, rubrosDB, proveedores);
    return recargoPct > 0 ? Math.round(base * (1 + recargoPct / 100)) : base;
  };

  return (
    <Modal onClose={onClose} size="modal-xl">
      <div className="modal-header">
        <div className="modal-title">Catálogo de productos</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {/* Filtros */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto auto auto", gap: 8, alignItems: "end", marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label">Buscar</label>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", pointerEvents: "none" }}>
              <Icon name="search" size={13} />
            </div>
            <input
              className="form-input"
              style={{ paddingLeft: 28 }}
              placeholder="Nombre, código..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Rubro</label>
          <select className="form-select" value={fRubro} onChange={e => setFRubro(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Todos</option>
            {rubros.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {colores.length > 0 && (
          <div className="form-group">
            <label className="form-label">Color</label>
            <select className="form-select" value={fColor} onChange={e => setFColor(e.target.value)} style={{ minWidth: 110 }}>
              <option value="">Todos</option>
              {colores.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {talles.length > 0 && (
          <div className="form-group">
            <label className="form-label">Talle</label>
            <select className="form-select" value={fTalle} onChange={e => setFTalle(e.target.value)} style={{ minWidth: 90 }}>
              <option value="">Todos</option>
              {talles.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="form-group" style={{ justifyContent: "flex-end" }}>
          <label className="form-label">Stock</label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, height: 38, cursor: "pointer", fontSize: 13, color: "var(--text2)", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={soloConStock}
              onChange={e => setSoloConStock(e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
            />
            Con stock
          </label>
        </div>

        <button className="btn btn-sm" onClick={limpiar} style={{ alignSelf: "flex-end", height: 38 }} title="Limpiar filtros">
          <Icon name="close" size={13} /> Limpiar
        </button>
      </div>

      {/* Contador */}
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
        {resultados.length} producto{resultados.length !== 1 ? "s" : ""} · Lista: <strong style={{ color: "var(--accent2)" }}>{lista.nombre}</strong>
        {lista.pct !== 0 && <span style={{ color: lista.pct < 0 ? "var(--green)" : undefined }}> ({lista.pct > 0 ? "+" : ""}{lista.pct}%)</span>}
        {recargoPct > 0 && <span style={{ color: "var(--amber)" }}> + {recargoPct}% mora</span>}
        {depositoNombre && <span> · <strong style={{ color: "var(--text2)" }}>{depositoNombre}</strong></span>}
      </div>

      {/* Tabla */}
      <div style={{ overflowY: "auto", maxHeight: "calc(80vh - 230px)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
        <table>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 1 }}>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Rubro</th>
              {colores.length > 0 && <th>Color</th>}
              {talles.length > 0 && <th>Talle</th>}
              <th style={{ textAlign: "center" }}>Stock</th>
              <th style={{ textAlign: "right" }}>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resultados.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--text3)", padding: 40 }}>
                  No se encontraron productos con los filtros seleccionados
                </td>
              </tr>
            ) : (
              resultadosPagina.map(p => {
                const sdCant  = stockEnDeposito(p.id);
                const dispQty = sdCant !== null ? sdCant : p.stock;
                const sinStock = dispQty <= 0;
                const bloqueado = sinStock && !permitirStockNegativo;
                const yaAgregado = agregados[p.id];
                return (
                  <tr key={p.id} style={{ opacity: sinStock ? 0.5 : 1 }}>
                    <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>{p.codigo}</td>
                    <td style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</td>
                    <td><span className="badge badge-accent">{p.rubro || p.categoria || "—"}</span></td>
                    {colores.length > 0 && (
                      <td>
                        {p.color && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--text2)" }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: colorHex(p.color), border: "1px solid var(--border2)", flexShrink: 0 }} />
                            {p.color}
                          </span>
                        )}
                      </td>
                    )}
                    {talles.length > 0 && (
                      <td style={{ color: "var(--text2)", fontSize: 13 }}>{p.talle || "—"}</td>
                    )}
                    <td style={{ textAlign: "center" }}>
                      {sinStock
                        ? <span className="badge badge-danger">Sin stock</span>
                        : <div>
                            <span style={{ color: dispQty <= 3 ? "var(--amber)" : "var(--green)", fontWeight: 600, fontSize: 13 }}>{dispQty}</span>
                            {sdCant !== null && sdCant !== p.stock && (
                              <div style={{ fontSize: 10, color: "var(--text3)" }}>total: {p.stock}</div>
                            )}
                          </div>
                      }
                    </td>
                    <td style={{ textAlign: "right", color: "var(--accent2)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {fmt(precio(p))}
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${yaAgregado ? "btn-success" : ""}`}
                        disabled={bloqueado}
                        title={sinStock && !bloqueado ? "Sin stock — se agrega igual (stock en negativo activado)" : ""}
                        onClick={() => handleAgregar(p)}
                        style={{ whiteSpace: "nowrap", minWidth: 80 }}
                      >
                        {yaAgregado
                          ? <><Icon name="check" size={13} /> Agregado</>
                          : <><Icon name="plus"  size={13} /> Agregar</>
                        }
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} totalItems={resultados.length} pageSize={pageSize} etiqueta="productos" />
    </Modal>
  );
}

// Convierte nombre de color a hex aproximado para el círculo decorativo
function colorHex(nombre) {
  const map = {
    negro:   "#2a2a2a", blanco: "#f0eff8",
    rojo:    "#e53e3e", azul:   "#3b82f6", verde:  "#22c55e",
    amarillo:"#eab308",naranja:"#f97316", rosa:   "#ec4899",
    violeta:"#8b5cf6", gris:   "#6b7280", marron: "#92400e",
    celeste:"#38bdf8", beige:  "#d4b896",
  };
  return map[nombre?.toLowerCase()] || "var(--border2)";
}
