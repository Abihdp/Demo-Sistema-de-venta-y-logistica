import { useState, useMemo, useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import { precioPorLista, precioBaseDe, normalizarCodigoEscaneado, coincideBusqueda } from "../../utils/helpers.js";
import { useLocalStorage } from "../../hooks/useLocalStorage.js";
import Etiqueta from "./Etiqueta.jsx";

const PRESETS = [
  { label: "38×25mm",  ancho: 38,  alto: 25 },
  { label: "50×25mm",  ancho: 50,  alto: 25 },
  { label: "40×30mm",  ancho: 40,  alto: 30 },
  { label: "50×30mm",  ancho: 50,  alto: 30 },
  { label: "58×40mm",  ancho: 58,  alto: 40 },
  { label: "60×40mm",  ancho: 60,  alto: 40 },
  { label: "80×50mm",  ancho: 80,  alto: 50 },
  { label: "100×60mm", ancho: 100, alto: 60 },
];

const AYUDA_VISTA_KEY = "etiquetas_ayuda_vista";

export default function PageEtiquetas({ productos, listas = [], configPrecios = {}, rubros = [], proveedores = [] }) {
  const margenBase = configPrecios?.margenBase ?? 0;

  const [busqueda, setBusqueda]       = useState("");
  const [showResults, setShowResults] = useState(false);
  const [lote, setLote]               = useState([]); // [{ producto, cantidad, nombreCustom }]

  const listaDefault = listas.length > 0
    ? (listas.find(l => l.nombre?.trim().toLowerCase() === "Precio Base" || l.nombre?.trim().toLowerCase() === "precio base")
       || listas.reduce((a, b) => b.pct > a.pct ? b : a))
    : null;
  const [listaId, setListaId] = useState(listaDefault?.id ?? "");
  const listaSeleccionada = listas.find(l => l.id === listaId) || listaDefault;

  // Persistida: la próxima vez que se entra a Etiquetas se retoma el último
  // tamaño/configuración usada, en vez de volver siempre a los valores por defecto.
  const [config, setConfig] = useLocalStorage("peco_etiquetas_config", {
    ancho:        50,
    alto:         25,
    columnas:     2,
    espaciado:    0,
    estilo:       "clasica", // "clasica" | "ticket"
    mostrarNombre: true,
    mostrarPrecio: true,
    mostrarColor:  false,
    mostrarTalle:  false,
    tamanoNombre: 9,
    tamanoPrecio: 14,
    tamanoCodigo: 8,
    tamanoBarras: 40,
  });
  const setC = (k, v) => setConfig(p => ({ ...p, [k]: v }));

  const [showInstrucciones, setShowInstrucciones] = useState(false);
  const [showAyuda, setShowAyuda] = useState(() => !localStorage.getItem(AYUDA_VISTA_KEY));

  // Estilo de impresión dinámico: el tamaño de página (@page) depende del
  // rollo configurado, así que no puede ser CSS estático — se recalcula cada
  // vez que cambia ancho/alto/columnas e inyecta un <style> propio.
  //
  // Cada FILA de etiquetas es una página física, no todo el lote junto: si
  // se armara una sola página gigante (alto × cantidad de filas), su tamaño
  // no coincidiría con el papel personalizado que el usuario configura una
  // sola vez en el driver de la impresora (que tiene el alto de una fila),
  // y con lotes grandes el navegador terminaba repaginando ese contenido
  // dentro de hojas más chicas, dejando franjas en blanco arriba/abajo.
  // Con una página por fila, el tamaño siempre coincide sin importar cuántas
  // etiquetas tenga el lote.
  useEffect(() => {
    const styleId = "etiquetas-print-style";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }

    const margenPagina = 2; // mm, debe coincidir con "margin" del @page de abajo
    const gap = config.espaciado;
    const anchoPagina = (config.ancho * config.columnas) + (gap * (config.columnas - 1)) + (margenPagina * 2);
    const altoPagina   = config.alto + (margenPagina * 2);

    style.textContent = `
      @media print {
        @page {
          size: ${anchoPagina}mm ${altoPagina}mm;
          margin: ${margenPagina}mm;
        }

        body * { visibility: hidden !important; }

        #etiquetas-para-imprimir,
        #etiquetas-para-imprimir * {
          visibility: visible !important;
        }

        #etiquetas-para-imprimir {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: ${(config.ancho * config.columnas) + (gap * (config.columnas - 1))}mm !important;
          padding: 0 !important;
          margin: 0 !important;
          background: white !important;
        }

        #etiquetas-para-imprimir .etiqueta-fila {
          display: grid !important;
          grid-template-columns: repeat(${config.columnas}, ${config.ancho}mm) !important;
          gap: ${gap}mm !important;
          break-after: page !important;
          page-break-after: always !important;
        }

        #etiquetas-para-imprimir .etiqueta-fila:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }

        #etiquetas-para-imprimir .etiqueta-fila > div {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        .no-print {
          display: none !important;
        }
      }
    `;

    return () => { if (style) style.remove(); };
  }, [config.ancho, config.alto, config.columnas, config.espaciado]);

  // ── Buscador de productos (mismo patrón que Nueva venta) ──────────────
  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
    return productos
      .filter(p => (p.tipo || "simple") !== "madre" && p.activo !== false)
      .filter(p => coincideBusqueda([p.nombre, p.codigo].join(" "), q))
      .slice(0, 8);
  }, [busqueda, productos]);

  const agregarProducto = (producto) => {
    setLote(prev => {
      const idx = prev.findIndex(it => it.producto.id === producto.id);
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, cantidad: it.cantidad + 1 } : it);
      return [...prev, { producto, cantidad: 1, nombreCustom: producto.nombre }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const cambiarCantidad = (idx, nuevaCantidad) => {
    const cantidad = Math.max(1, Number(nuevaCantidad) || 1);
    setLote(prev => prev.map((it, i) => i === idx ? { ...it, cantidad } : it));
  };

  // Solo cambia el nombre impreso en la etiqueta — el producto real (catálogo,
  // stock, ventas) no se toca.
  const editarNombreEtiqueta = (idx, nombre) => {
    setLote(prev => prev.map((it, i) => i === idx ? { ...it, nombreCustom: nombre } : it));
  };

  const restaurarNombreEtiqueta = (idx) => {
    setLote(prev => prev.map((it, i) => i === idx ? { ...it, nombreCustom: it.producto.nombre } : it));
  };

  const quitarDelLote = (idx) => setLote(prev => prev.filter((_, i) => i !== idx));

  const totalEtiquetas = lote.reduce((a, i) => a + i.cantidad, 0);
  const precioDe = (producto) => listaSeleccionada ? precioPorLista(producto, listaSeleccionada, margenBase, rubros, proveedores) : precioBaseDe(producto, margenBase, rubros, proveedores);

  // Cada fila se imprime como una página física propia (ver useEffect de
  // arriba), por eso el lote se agrupa acá en filas de `columnas` etiquetas
  // en vez de dejar que un solo grid las acomode automáticamente.
  const filasPreview = useMemo(() => {
    const etiquetas = lote.flatMap(item =>
      Array.from({ length: item.cantidad }, (_, i) => ({
        key: `${item.producto.id}-${i}`,
        producto: item.nombreCustom && item.nombreCustom !== item.producto.nombre
          ? { ...item.producto, nombre: item.nombreCustom }
          : item.producto,
      }))
    );
    const filas = [];
    for (let i = 0; i < etiquetas.length; i += config.columnas) {
      filas.push(etiquetas.slice(i, i + config.columnas));
    }
    return filas;
  }, [lote, config.columnas]);

  return (
    <div>
      {showAyuda && (
        <div className="no-print" style={{
          padding: "12px 14px", borderRadius: 8, marginBottom: 12,
          background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>
              Configuración primera vez — Xprinter
            </span>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 16 }}
              onClick={() => { setShowAyuda(false); localStorage.setItem(AYUDA_VISTA_KEY, "1"); }}>
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.8 }}>
            <div>1. Abrí <strong>Panel de Control → Dispositivos e Impresoras</strong></div>
            <div>2. Click derecho en <strong>Xprinter → Preferencias de impresión</strong></div>
            <div>3. Buscá <strong>"Tamaño de papel personalizado"</strong> o <strong>"User Defined"</strong></div>
            <div>4. Creá un tamaño con el ancho y alto de tu rollo (ej: 40mm × 30mm)</div>
            <div>5. Guardalo como <strong>"Etiqueta PECO"</strong></div>
            <div>6. La próxima vez que imprimás, seleccioná ese tamaño en el diálogo</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 16, alignItems: "start" }}>

        {/* ── Panel izquierdo: búsqueda, lote y configuración (no se imprime) ── */}
        <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Agregar productos */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">Agregar productos</div>
            <div style={{ position: "relative" }}>
              <input
                className="form-input"
                placeholder="Buscar por nombre o código..."
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setShowResults(true); }}
                onFocus={() => busqueda && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
              />
              {showResults && resultados.length > 0 && (
                <div style={{
                  position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                  background: "var(--bg3)", border: "1px solid var(--border2)",
                  borderRadius: "var(--radius)", marginTop: 4,
                  maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                }}>
                  {resultados.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={e => { e.preventDefault(); agregarProducto(p); }}
                      style={{
                        padding: "10px 14px", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        borderBottom: "1px solid var(--border)", fontSize: 13,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.codigo}</div>
                      </div>
                      <div style={{ color: "var(--accent2)", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                        {precioDe(p) ? `$${Math.round(precioDe(p)).toLocaleString("es-AR")}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {lote.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr><th>Producto</th><th>Cant. etiquetas</th><th></th></tr>
                  </thead>
                  <tbody>
                    {lote.map((item, idx) => {
                      const nombreEditado = item.nombreCustom !== item.producto.nombre;
                      return (
                      <tr key={item.producto.id}>
                        <td>
                          <div style={{ position: "relative" }}>
                            <input
                              className="form-input"
                              value={item.nombreCustom ?? item.producto.nombre}
                              onChange={e => editarNombreEtiqueta(idx, e.target.value)}
                              style={{ fontSize: 13, padding: "5px 8px", paddingRight: nombreEditado ? 26 : 8 }}
                              title="Nombre que se imprime en la etiqueta — no cambia el nombre del producto"
                            />
                            {nombreEditado && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                title={`Restaurar: "${item.producto.nombre}"`}
                                onClick={() => restaurarNombreEtiqueta(idx)}
                                style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", padding: 4 }}
                              >
                                <Icon name="x" size={12} color="var(--text3)" />
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{item.producto.codigo}</div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button className="qty-btn" onClick={() => cambiarCantidad(idx, item.cantidad - 1)}>−</button>
                            <input
                              className="form-input mono"
                              type="number"
                              value={item.cantidad}
                              min={1}
                              style={{ width: 56, textAlign: "center", padding: "4px 6px" }}
                              onChange={e => cambiarCantidad(idx, e.target.value)}
                            />
                            <button className="qty-btn" onClick={() => cambiarCantidad(idx, item.cantidad + 1)}>+</button>
                          </div>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" title="Quitar" onClick={() => quitarDelLote(idx)}>
                            <Icon name="trash" size={13} color="var(--red)" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 600, color: "var(--text1)" }}>Total etiquetas</td>
                      <td style={{ fontWeight: 700, color: "var(--accent2)" }}>{totalEtiquetas}</td>
                      <td>
                        <button className="btn btn-sm btn-ghost" onClick={() => setLote([])}>Limpiar</button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Configuración de etiqueta */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">Configuración de etiqueta</div>

            {listas.length > 0 && (
              <div className="form-group">
                <label className="form-label">Lista de precios a imprimir</label>
                <select className="form-select" value={listaSeleccionada?.id ?? ""} onChange={e => setListaId(Number(e.target.value))}>
                  {listas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Estilo</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { key: "clasica", label: "Clásica" },
                  { key: "ticket",  label: "Ticket" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${config.estilo === key ? "btn-primary" : "btn-ghost"}`}
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => setC("estilo", key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Ancho (mm)</label>
                <input className="form-input" type="number" value={config.ancho} onChange={e => setC("ancho", Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Alto (mm)</label>
                <input className="form-input" type="number" value={config.alto} onChange={e => setC("alto", Number(e.target.value))} />
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  className="btn btn-sm btn-ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => setConfig(prev => ({ ...prev, ancho: p.ancho, alto: p.alto }))}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Columnas por fila</label>
                <select className="form-select" value={config.columnas} onChange={e => setC("columnas", Number(e.target.value))}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} columna{n !== 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Espaciado entre etiquetas (mm)</label>
                <input className="form-input" type="number" min={0} value={config.espaciado} onChange={e => setC("espaciado", Number(e.target.value))} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6, fontWeight: 600 }}>
              Información a mostrar
            </div>
            {[
              { key: "mostrarNombre", label: "Nombre del producto" },
              { key: "mostrarPrecio", label: "Precio" },
              { key: "mostrarColor",  label: "Color" },
              { key: "mostrarTalle",  label: "Talle" },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={e => setC(key, e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                {label}
              </label>
            ))}

            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10, marginBottom: 6, fontWeight: 600 }}>
              Tamaño de texto (px)
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input className="form-input" type="number" value={config.tamanoNombre} onChange={e => setC("tamanoNombre", Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Precio</label>
                <input className="form-input" type="number" value={config.tamanoPrecio} onChange={e => setC("tamanoPrecio", Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Código</label>
                <input className="form-input" type="number" value={config.tamanoCodigo} onChange={e => setC("tamanoCodigo", Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Alto barras</label>
                <input className="form-input" type="number" value={config.tamanoBarras} onChange={e => setC("tamanoBarras", Number(e.target.value))} />
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
              disabled={lote.length === 0}
              onClick={() => setShowInstrucciones(true)}
            >
              <Icon name="printer" size={14} /> Imprimir etiquetas
            </button>
          </div>
        </div>

        {/* ── Panel derecho: preview (esto es lo único que se imprime) ── */}
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title no-print">
            Preview
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text3)", marginLeft: 8 }}>
              {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? "s" : ""} en total
            </span>
          </div>

          {lote.length === 0 ? (
            <div className="no-print" style={{ textAlign: "center", padding: "48px 20px", color: "var(--text3)" }}>
              <Icon name="tag" size={28} />
              <div style={{ marginTop: 10, fontSize: 13 }}>Agregá productos al lote para ver la vista previa</div>
            </div>
          ) : (
            <div id="etiquetas-para-imprimir" style={{
              display: "flex",
              flexDirection: "column",
              gap: `${config.espaciado}mm`,
              padding: "4mm",
              background: "#f5f5f5",
            }}>
              {filasPreview.map((fila, fi) => (
                <div key={fi} className="etiqueta-fila" style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${config.columnas}, ${config.ancho}mm)`,
                  gap: `${config.espaciado}mm`,
                }}>
                  {fila.map(({ key, producto }) => (
                    <Etiqueta
                      key={key}
                      producto={producto}
                      precio={precioDe(producto)}
                      config={config}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showInstrucciones && (
        <div className="no-print" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 24, maxWidth: 420, width: "100%",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "var(--text1)" }}>
              Antes de imprimir
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 16 }}>
              <div>1. En el diálogo que va a abrir, seleccioná la <strong>Xprinter</strong> como impresora.</div>
              <div>2. En "Más configuraciones" → "Tamaño de papel" elegí el tamaño personalizado que configuraste ({config.ancho}×{config.alto}mm).</div>
              <div>3. Márgenes: <strong>Ninguno / Sin márgenes</strong>.</div>
              <div>4. Escala: <strong>100%</strong> (sin ajuste).</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setShowInstrucciones(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}
                onClick={() => { setShowInstrucciones(false); window.print(); }}>
                Abrir diálogo de impresión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
