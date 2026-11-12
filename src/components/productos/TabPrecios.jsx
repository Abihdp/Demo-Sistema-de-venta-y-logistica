import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import Icon from "../ui/Icon.jsx";
import { fmt, today, precioPorLista, precioBaseDe, labelLista, runInBatches, normalizarCodigoEscaneado, coincideBusqueda } from "../../utils/helpers.js";
import { useToast } from "../ui/Toast.jsx";
import ModalAjustePrecioPorcentaje from "./ModalAjustePrecioPorcentaje.jsx";
import ModalGestionListas from "./ModalGestionListas.jsx";

const COL_COSTO_SIN_IVA = "Costo sin IVA";
const COL_COSTO_CON_IVA = "Costo con IVA";

const PAGE_SIZE = 15;

export default function TabPrecios({ productos, setProductos, actualizarProducto, proveedores, rubros, rubrosDB = [], listas, setListas, configPrecios = {}, setConfigPrecios, actualizarConfigPrecios, agregarLista, actualizarLista, eliminarLista, usuarioActivo }) {
  const { toast } = useToast();
  const margenBase = configPrecios?.margenBase ?? 0;

  // Lista que se selecciona por defecto al entrar al tab (la de menor % de ajuste).
  const listaBaseId = (listas.find(l => l.pct === 0) || listas[0]).id;

  // ── Exportar / Importar planilla (costo + precios por lista) ────────────────
  // Mismo formato de columnas para las dos direcciones: lo que exportás, lo
  // podés editar en Excel y volver a importar tal cual — matchea por Código.
  const [previewImport, setPreviewImport] = useState(null); // null | filas[]
  const [importando,    setImportando]    = useState(false);

  const exportarPlantilla = () => {
    const productosExport = productos.filter(p => (p.tipo || "simple") !== "madre");
    const filas = productosExport.map(p => {
      const fila = {
        "Código":   p.codigo,
        "Rubro":    p.rubro    || "",
        "Subrubro": p.subrubro || "",
        "Nombre":   p.nombre,
        [COL_COSTO_SIN_IVA]: Math.round(p.costo || 0),
        [COL_COSTO_CON_IVA]: Math.round((p.costo || 0) * 1.21),
      };
      listas.forEach(l => {
        fila[l.nombre] = precioPorLista(p, l, margenBase, rubrosDB, proveedores);
      });
      return fila;
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Precios");
    const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `precios_${today()}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleArchivoPrecios = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let filasArchivo;
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        filasArchivo = XLSX.utils.sheet_to_json(ws, { defval: "" });
      } catch {
        toast("No se pudo leer el archivo. Verificá que sea un .xlsx válido.", "error");
        return;
      }
      if (filasArchivo.length === 0) { toast("Archivo vacío o sin datos.", "error"); return; }

      const aNumero = (val) => {
        if (val === "" || val == null) return null;
        const n = Number(val);
        return isNaN(n) ? null : n;
      };

      const filas = filasArchivo.map(row => {
        const codigo = String(row["Código"] ?? row["Codigo"] ?? "").trim();
        const prod = productos.find(p => p.codigo === codigo);

        const costoSinIva = aNumero(row[COL_COSTO_SIN_IVA]);
        const costoConIva = aNumero(row[COL_COSTO_CON_IVA]);
        const costoNuevo  = costoSinIva != null ? Math.round(costoSinIva)
                           : costoConIva != null ? Math.round(costoConIva / 1.21)
                           : null;

        const preciosNuevos = {};
        listas.forEach(l => {
          const val = aNumero(row[l.nombre]);
          if (val != null) preciosNuevos[l.id] = Math.round(val);
        });

        return {
          codigo,
          nombreArch: String(row["Nombre"] ?? ""),
          productoId:    prod?.id     ?? null,
          nombreSistema: prod?.nombre ?? null,
          costoActual:   prod?.costo  ?? null,
          costoNuevo,
          preciosActuales: prod
            ? Object.fromEntries(listas.map(l => [l.id, precioPorLista(prod, l, margenBase, rubrosDB, proveedores)]))
            : {},
          preciosNuevos,
        };
      });
      setPreviewImport(filas);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const encontradosImport = useMemo(
    () => (previewImport || []).filter(r => r.productoId != null),
    [previewImport]
  );

  const aplicarImportacion = async () => {
    if (encontradosImport.length === 0) return;
    setImportando(true);
    const resultados = await runInBatches(encontradosImport, 20, async (r) => {
      const p = productos.find(pr => pr.id === r.productoId);
      const cambios = {};
      if (r.costoNuevo != null && r.costoNuevo !== p.costo) cambios.costo = r.costoNuevo;
      if (Object.keys(r.preciosNuevos).length > 0) cambios.precios = { ...p.precios, ...r.preciosNuevos };
      if (Object.keys(cambios).length === 0) return "sin-cambios";
      return actualizarProducto(p.id, cambios);
    });
    setImportando(false);
    const fallidos    = resultados.filter(r => r.status === "rejected").length;
    const sinCambios  = resultados.filter(r => r.status === "fulfilled" && r.value === "sin-cambios").length;
    const actualizados = encontradosImport.length - fallidos - sinCambios;
    const noEncontrados = previewImport.length - encontradosImport.length;
    toast(
      `${actualizados} producto(s) actualizados.`
      + (sinCambios > 0 ? ` ${sinCambios} sin cambios.` : "")
      + (fallidos > 0 ? ` ${fallidos} con error.` : "")
      + (noEncontrados > 0 ? ` ${noEncontrados} código(s) no encontrados.` : ""),
      fallidos > 0 ? "warning" : "success"
    );
    setPreviewImport(null);
  };

  // ── Tabla de precios por lista ───────────────────────────────────────────────
  const [listaId,     setListaId]     = useState(listaBaseId);
  const [fProveedor,  setFProveedor]  = useState("");
  const [fNombre,     setFNombre]     = useState("");
  const [fId,         setFId]         = useState("");
  const [pagina,      setPagina]      = useState(1);
  const [ediciones,   setEdiciones]   = useState({}); // { [productoId]: string }
  const [showAjuste,  setShowAjuste]  = useState(false);
  const [showGestionListas, setShowGestionListas] = useState(false);

  const listaSeleccionada = useMemo(
    () => listas.find(l => l.id === Number(listaId)) || listas[0],
    [listas, listaId]
  );

  const cambiarLista = (val) => { setListaId(val); setEdiciones({}); setPagina(1); };

  const productosFiltrados = useMemo(() => {
    const qNombre = fNombre.trim().toLowerCase();
    const qId     = normalizarCodigoEscaneado(fId.trim().toLowerCase());
    return productos.filter(p => {
      if ((p.tipo || "simple") === "madre") return false;
      if (fProveedor && String(p.proveedorId) !== String(fProveedor)) return false;
      if (qNombre && !coincideBusqueda(p.nombre, qNombre)) return false;
      if (qId && !(p.codigo.toLowerCase().includes(qId) || String(p.id) === qId)) return false;
      return true;
    });
  }, [productos, fProveedor, fNombre, fId]);

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const productosPagina = useMemo(
    () => productosFiltrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE),
    [productosFiltrados, paginaActual]
  );

  const setFiltro = (setter) => (val) => { setter(val); setPagina(1); };

  const valorFinal = (p) =>
    ediciones[p.id] !== undefined ? ediciones[p.id] : String(precioPorLista(p, listaSeleccionada, margenBase, rubrosDB, proveedores));

  // % de ajuste que representa el precio final actual sobre el precio base.
  const pctAplicado = (p) => {
    if (!p.costo) return null;
    const valor = Number(valorFinal(p));
    if (isNaN(valor)) return null;
    const precioBase = precioBaseDe(p, margenBase, rubrosDB, proveedores);
    if (!precioBase) return null;
    return Math.round(((valor - precioBase) / precioBase) * 100);
  };

  const handleEditarPrecio = (p, valor) => setEdiciones(prev => ({ ...prev, [p.id]: valor }));

  const cantidadCambios = Object.keys(ediciones).length;

  const [guardando, setGuardando] = useState(false);

  const guardarCambios = async () => {
    for (const valor of Object.values(ediciones)) {
      const num = Number(valor);
      if (valor === "" || isNaN(num) || num < 0) {
        toast("Hay precios inválidos sin guardar. Revisá los valores antes de continuar.", "error");
        return;
      }
    }
    setGuardando(true);
    const ids = Object.keys(ediciones);
    const resultados = await runInBatches(ids, 20, id => {
      const p = productos.find(pr => String(pr.id) === id);
      const nuevoPrecio = Math.round(Number(ediciones[id]));
      // El precio final de una lista nunca pisa el costo ni el precio de venta
      // base del producto: siempre se guarda como override de esa lista puntual.
      return actualizarProducto(p.id, { precios: { ...p.precios, [listaSeleccionada.id]: nuevoPrecio } });
    });
    setGuardando(false);
    const fallidos = resultados.filter(r => r.status === "rejected").length;
    const guardados = ids.length - fallidos;
    if (guardados > 0) toast(`Se guardaron ${guardados} precio(s) de "${listaSeleccionada.nombre}".`, "success");
    if (fallidos > 0) toast(`No se pudieron guardar ${fallidos} precio(s). Probá de nuevo.`, "error");
    setEdiciones(prev => {
      const next = { ...prev };
      resultados.forEach((r, i) => { if (r.status === "fulfilled") delete next[ids[i]]; });
      return next;
    });
  };

  const descartarCambios = () => setEdiciones({});

  return (
    <div>
      {/* ══════════════════════════════════════════════════════════════════
          EXPORTAR / IMPORTAR PLANILLA (costo + precios por lista)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Exportar / Importar planilla</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={exportarPlantilla} title="Descargar código, rubro, subrubro, nombre, costo y precios por lista">
              <Icon name="download" size={13}/> Descargar Excel
            </button>
            <label className="btn btn-sm btn-primary" style={{ cursor: "pointer" }}>
              <Icon name="upload" size={13}/> Importar Excel
              <input type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleArchivoPrecios}/>
            </label>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 4 }}>
          Matchea por Código. Actualiza el costo si vienen las columnas "{COL_COSTO_SIN_IVA}" y/o "{COL_COSTO_CON_IVA}" (si están las dos, manda la de sin IVA),
          y actualiza el precio final de cada lista cuya columna (con el nombre exacto de la lista) tenga un valor — las columnas vacías o ausentes no se tocan.
        </div>

        {previewImport && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>
                {encontradosImport.length} de {previewImport.length} código(s) coinciden con productos existentes
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setPreviewImport(null)} disabled={importando}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={encontradosImport.length === 0 || importando} onClick={aplicarImportacion}>
                  <Icon name="check" size={13}/> {importando ? "Aplicando…" : "Aplicar importación"}
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Costo (actual → nuevo)</th>
                    {listas.map(l => <th key={l.id}>{l.nombre} (actual → nuevo)</th>)}
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewImport.map((r, i) => (
                    <tr key={i} style={{ opacity: r.productoId == null ? 0.5 : 1 }}>
                      <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.codigo}</td>
                      <td style={{ color: "var(--text1)" }}>{r.nombreSistema || r.nombreArch}</td>
                      <td style={{ fontSize: 12 }}>
                        {r.costoActual != null ? fmt(r.costoActual) : "—"}
                        {r.costoNuevo != null && r.costoNuevo !== r.costoActual && (
                          <span style={{ color: "var(--accent2)", fontWeight: 600 }}> → {fmt(r.costoNuevo)}</span>
                        )}
                      </td>
                      {listas.map(l => {
                        const actual = r.preciosActuales?.[l.id];
                        const nuevo  = r.preciosNuevos?.[l.id];
                        return (
                          <td key={l.id} style={{ fontSize: 12 }}>
                            {actual != null ? fmt(actual) : "—"}
                            {nuevo != null && nuevo !== actual && (
                              <span style={{ color: "var(--accent2)", fontWeight: 600 }}> → {fmt(nuevo)}</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        {r.productoId != null
                          ? <span className="badge badge-ok">Encontrado</span>
                          : <span className="badge badge-danger">Sin coincidencia</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TABLA DE PRECIOS POR LISTA
      ══════════════════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Precios por lista</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowGestionListas(true)}>
              <Icon name="edit" size={13}/> Gestionar listas
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowAjuste(true)}>
              <Icon name="tag" size={13}/> Ajustar % por lista
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label className="form-label">Lista de precio</label>
            <select className="form-select" value={listaId} onChange={e => cambiarLista(e.target.value)}>
              {listas.map(l => (
                <option key={l.id} value={l.id}>{labelLista(l)}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label className="form-label">Proveedor</label>
            <select className="form-select" value={fProveedor} onChange={e => setFiltro(setFProveedor)(e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map(pr => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label">Nombre</label>
            <input className="form-input" placeholder="Buscar por nombre..." value={fNombre} onChange={e => setFiltro(setFNombre)(e.target.value)}/>
          </div>
          <div className="form-group" style={{ width: 150 }}>
            <label className="form-label">Código / ID</label>
            <input className="form-input" placeholder="Ej: RO-NEG-M" value={fId} onChange={e => setFiltro(setFId)(e.target.value)}/>
          </div>
        </div>

        {/* Cambios sin guardar */}
        {cantidadCambios > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
            padding: "8px 12px", background: "color-mix(in srgb, var(--accent) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: "var(--radius-sm)",
          }}>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>
              {cantidadCambios} precio{cantidadCambios !== 1 ? "s" : ""} de "{listaSeleccionada.nombre}" sin guardar
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={descartarCambios} disabled={guardando}>Descartar</button>
              <button className="btn btn-sm btn-success" onClick={guardarCambios} disabled={guardando}>
                <Icon name="check" size={13}/> {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Proveedor</th>
                <th>Costo sin IVA</th>
                <th>Costo con IVA</th>
                <th>Precio final ({listaSeleccionada.nombre})</th>
                <th>% aplicado</th>
              </tr>
            </thead>
            <tbody>
              {productosPagina.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: 30 }}>
                    Sin resultados para los filtros aplicados
                  </td>
                </tr>
              )}
              {productosPagina.map(p => {
                const proveedorNombre = proveedores.find(pr => pr.id === p.proveedorId)?.nombre || "—";
                const editado = ediciones[p.id] !== undefined;
                const pct = pctAplicado(p);
                return (
                  <tr key={p.id} style={{ opacity: p.activo === false ? 0.5 : 1 }}>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{p.codigo}</td>
                    <td style={{ color: "var(--text1)" }}>{p.nombre}</td>
                    <td style={{ color: "var(--text2)", fontSize: 12 }}>{proveedorNombre}</td>
                    <td style={{ color: "var(--text2)" }}>{fmt(p.costo)}</td>
                    <td style={{ color: "var(--text2)" }}>{fmt(Math.round(p.costo * 1.21))}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className="form-input mono"
                        style={{
                          width: 120, padding: "6px 8px", fontSize: 13,
                          borderColor: editado ? "var(--accent)" : undefined,
                          color: editado ? "var(--accent2)" : "var(--text1)",
                          fontWeight: editado ? 600 : 500,
                        }}
                        value={valorFinal(p)}
                        onChange={e => handleEditarPrecio(p, e.target.value)}
                      />
                    </td>
                    <td className="mono" style={{
                      fontSize: 12, fontWeight: 600,
                      color: pct === null ? "var(--text3)" : pct >= 0 ? "var(--green)" : "var(--red)",
                    }}>
                      {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct}%`} <span style={{color:"var(--text3)", fontWeight:400}}>s/precio base</span>
                      {p.tipo === "variante" && p.productoMadreId && editado && (
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", fontFamily: "var(--font-sans)", fontWeight: 500 }}
                          title="Aplicar este precio a todas las variantes del mismo producto"
                          onClick={() => {
                            const precio = ediciones[p.id];
                            const hermanas = productos.filter(h => h.tipo === "variante" && h.productoMadreId === p.productoMadreId);
                            setEdiciones(prev => {
                              const next = { ...prev };
                              hermanas.forEach(h => { next[h.id] = precio; });
                              return next;
                            });
                          }}
                        >
                          Aplicar a grupo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>
            {productosFiltrados.length === 0
              ? "0 productos"
              : `Mostrando ${(paginaActual - 1) * PAGE_SIZE + 1}–${Math.min(paginaActual * PAGE_SIZE, productosFiltrados.length)} de ${productosFiltrados.length}`}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-sm btn-ghost" disabled={paginaActual <= 1} onClick={() => setPagina(p => p - 1)}>
              ‹ Anterior
            </button>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>Página {paginaActual} de {totalPaginas}</span>
            <button className="btn btn-sm btn-ghost" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: AJUSTAR % POR LISTA
      ══════════════════════════════════════════════════════════════════ */}
      {showAjuste && (
        <ModalAjustePrecioPorcentaje
          productos={productos}
          setProductos={setProductos}
          actualizarProducto={actualizarProducto}
          proveedores={proveedores}
          rubros={rubros}
          rubrosDB={rubrosDB}
          listas={listas}
          listaInicial={listaId}
          margenBase={margenBase}
          onClose={() => setShowAjuste(false)}
        />
      )}

      {showGestionListas && (
        <ModalGestionListas
          listas={listas}
          setListas={setListas}
          productos={productos}
          actualizarProducto={actualizarProducto}
          configPrecios={configPrecios}
          setConfigPrecios={setConfigPrecios}
          actualizarConfigPrecios={actualizarConfigPrecios}
          agregarLista={agregarLista}
          actualizarLista={actualizarLista}
          eliminarLista={eliminarLista}
          usuarioActivo={usuarioActivo}
          onClose={() => setShowGestionListas(false)}
        />
      )}
    </div>
  );
}
