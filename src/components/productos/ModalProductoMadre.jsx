import { useState } from "react";
import { COLORES, COLOR_CODES } from "../../constants/index.js";

export default function ModalProductoMadre({
  productoMadre,
  variantesExistentes,
  productos,
  proveedores,
  nombresRubros = [],
  subrubrosDeRubro,
  depositos = [],
  onGuardar,
  onClose,
}) {
  const esNueva = !productoMadre?.id;
  const depositosSeleccionables = depositos.filter(d => d.tipo !== "transito");

  const [form, setForm] = useState({
    codigoBase:  productoMadre?.codigoBase || productoMadre?.codigo || "",
    nombre:      productoMadre?.nombre     || "",
    rubro:       productoMadre?.rubro      || productoMadre?.categoria || nombresRubros[0] || "",
    subrubro:    productoMadre?.subrubro   || "",
    costo:       productoMadre?.costo      ?? "",
    // "precio" acá es el precio base (manual): se guarda en producto.precioBase,
    // no en el campo legado producto.precio — ver comentario en handleGuardar.
    precio:      productoMadre?.precioBase != null ? String(productoMadre.precioBase) : "",
    margen:      productoMadre?.margen     != null ? String(productoMadre.margen)     : "",
    proveedorId: productoMadre?.proveedorId != null ? String(productoMadre.proveedorId) : "",
    depositoId:  (depositos.find(d => d.tipo === "normal") || depositos.find(d => d.tipo !== "transito"))?.id ?? "",
  });

  const [variantes, setVariantes] = useState(
    (variantesExistentes || []).map(v => ({
      id:      v.id,
      codigo:  v.codigo  || "",
      color:   v.color   || "",
      talle:   v.talle   || "",
      version: v.version || "",
      costo:   v.costo   ?? "",
      precio:  v.precioBase != null ? String(v.precioBase) : "",
      margen:  v.margen  != null ? String(v.margen) : "",
      stock:   v.stock   ?? 0,
      stockInicial: "",
      activo:  v.activo  ?? true,
    }))
  );

  const [genColores,        setGenColores]        = useState(new Map()); // Map<nombre, codigo>
  const [genTalles,         setGenTalles]         = useState("");
  const [customColorNombre, setCustomColorNombre] = useState("");
  const [customColorCodigo, setCustomColorCodigo] = useState("");
  const [error,             setError]             = useState("");

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const genCodigo = (base, colorCodigo, talle, version) => {
    const tc = talle   ? talle.replace(/\s+/g, "").slice(0, 4).toUpperCase()   : "";
    const vc = version ? version.replace(/\s+/g, "").slice(0, 8).toUpperCase() : "";
    return [base, colorCodigo, tc, vc].filter(Boolean).join("-");
  };

  // Abreviatura de color para variantes cargadas a mano (fuera del generador
  // masivo, que ya pide su propia abreviatura): usa la predefinida si existe,
  // si no las primeras letras del nombre — igual que en el alta de un producto simple.
  const colorAbbrev = (color) =>
    COLOR_CODES[color] || (color ? color.replace(/\s+/g, "").slice(0, 3).toUpperCase() : "");

  // El código base es fijo y viene predefinido: el código de cada variante NUEVA
  // se arma solo a partir de codigoBase + color + talle + versión (no se tipea
  // a mano). Las variantes YA EXISTENTES conservan su código editable, por si
  // hace falta corregir algo cargado con una convención vieja.
  const codigoFinal = (v) =>
    v.id ? v.codigo : genCodigo(form.codigoBase.trim(), colorAbbrev(v.color), v.talle, v.version);

  // IDs que son "de esta misma familia" (las propias variantes + la madre) —
  // cualquier otro producto que use el mismo código base sí es un conflicto real.
  const propiosIds = new Set([
    ...(variantesExistentes || []).map(v => v.id),
    ...(productoMadre?.id ? [productoMadre.id] : []),
  ]);

  // Se recalcula en cada render para avisar apenas se tipea el código base,
  // no recién al tocar Guardar.
  const codigoBaseTrim = form.codigoBase.trim().toLowerCase();
  const conflictoCodigoBase = codigoBaseTrim
    ? (productos || []).find(p => !propiosIds.has(p.id) && (p.codigoBase || p.codigo || "").trim().toLowerCase() === codigoBaseTrim)
    : null;

  const toggleColor = (nombre) => {
    setGenColores(prev => {
      const m = new Map(prev);
      m.has(nombre) ? m.delete(nombre) : m.set(nombre, COLOR_CODES[nombre]);
      return m;
    });
  };

  const addCustomColor = () => {
    const nombre = customColorNombre.trim();
    const codigo = customColorCodigo.trim().toUpperCase();
    if (!nombre || !codigo) return;

    // Verificar abreviatura duplicada contra predefinidos + ya agregados
    const abreviaturas = new Set([
      ...Object.values(COLOR_CODES),
      ...[...genColores.values()],
    ]);
    if (abreviaturas.has(codigo)) {
      const conflicto = Object.entries(COLOR_CODES).find(([, v]) => v === codigo)?.[0]
        || [...genColores.entries()].find(([, v]) => v === codigo)?.[0];
      setError(`La abreviatura "${codigo}" ya está en uso por "${conflicto}".`);
      return;
    }
    if (genColores.has(nombre) || COLOR_CODES[nombre]) {
      setError(`El color "${nombre}" ya existe.`);
      return;
    }

    setError("");
    setGenColores(prev => new Map(prev).set(nombre, codigo));
    setCustomColorNombre("");
    setCustomColorCodigo("");
  };

  const removeColor = (nombre) => {
    setGenColores(prev => { const m = new Map(prev); m.delete(nombre); return m; });
  };

  const generarVariantes = () => {
    if (!form.codigoBase.trim()) {
      setError("Ingresá el código base antes de generar variantes.");
      return;
    }
    const tallesArr  = genTalles.split("\n").map(t => t.trim()).filter(Boolean);
    const coloresArr = [...genColores.entries()]; // [[nombre, codigo], ...]
    if (!tallesArr.length && !coloresArr.length) {
      setError("Seleccioná al menos un color o ingresá talles para generar variantes.");
      return;
    }

    let combos = [];
    if (coloresArr.length && tallesArr.length) {
      coloresArr.forEach(([cNombre, cCodigo]) => tallesArr.forEach(t => combos.push({ color: cNombre, colorCodigo: cCodigo, talle: t })));
    } else if (coloresArr.length) {
      coloresArr.forEach(([cNombre, cCodigo]) => combos.push({ color: cNombre, colorCodigo: cCodigo, talle: "" }));
    } else {
      tallesArr.forEach(t => combos.push({ color: "", colorCodigo: "", talle: t }));
    }

    const existing = new Set(variantes.map(v => codigoFinal(v)));
    const nuevas = combos
      .map(({ color, colorCodigo, talle }) => ({
        color,
        talle,
        version: "",
        codigo: genCodigo(form.codigoBase.trim(), colorCodigo, talle, ""),
        costo:  form.costo,
        precio: form.precio,
        margen: form.margen,
        stockInicial: "",
        activo: true,
      }))
      .filter(v => !existing.has(v.codigo));

    if (!nuevas.length) {
      setError("Todas las combinaciones ya existen en la tabla de variantes.");
      return;
    }
    setVariantes(prev => [...prev, ...nuevas]);
    setError("");
  };

  const removeVariante  = (idx) => setVariantes(prev => prev.filter((_, i) => i !== idx));
  const updateVariante  = (idx, k, v) =>
    setVariantes(prev => prev.map((x, i) => i === idx ? { ...x, [k]: v } : x));

  const handleGuardar = () => {
    setError("");
    if (!form.nombre.trim())     { setError("El nombre del producto es obligatorio."); return; }
    if (!form.codigoBase.trim()) { setError("El código base es obligatorio."); return; }

    const codigos = variantes.map(v => codigoFinal(v)).filter(Boolean);
    const dupes   = codigos.filter((c, i) => codigos.indexOf(c) !== i);
    if (dupes.length) {
      setError(`Códigos duplicados: ${[...new Set(dupes)].join(", ")} — completá color y/o talle para diferenciar esas variantes.`);
      return;
    }

    const codigosOtros = new Set(
      (productos || []).filter(p => !propiosIds.has(p.id)).map(p => p.codigo)
    );
    const conflicto = variantes.find(v => codigoFinal(v) && codigosOtros.has(codigoFinal(v)));
    if (conflicto) {
      setError(`El código "${codigoFinal(conflicto)}" ya existe en otro producto.`);
      return;
    }

    // El código base no puede repetirse entre familias distintas — solo las
    // variantes de esta misma familia pueden compartirlo (para eso existe).
    // Si no, dos productos sin relación podrían terminar bajo el mismo número
    // base con solo el color/talle diferenciándolos, algo confuso a la hora
    // de buscar o escanear por código.
    if (conflictoCodigoBase) {
      setError(`El código base "${form.codigoBase.trim()}" ya lo usa otro producto/familia: "${conflictoCodigoBase.nombre}". Elegí uno distinto.`);
      return;
    }

    const nuevasConStock = variantes.filter(v => !v.id && Number(v.stockInicial) > 0);
    if (nuevasConStock.length > 0 && !form.depositoId) {
      setError("Elegí en qué depósito cargar el stock inicial de las variantes nuevas.");
      return;
    }

    const base = form.codigoBase.trim();
    const madre = {
      ...(productoMadre?.id ? { id: productoMadre.id } : {}),
      codigoBase:  base,
      codigo:      base,
      nombre:      form.nombre.trim(),
      rubro:       form.rubro,
      subrubro:    form.subrubro,
      costo:       Number(form.costo)  || 0,
      // Vacío = sin precio base manual (se calcula con costo × margen propio,
      // de rubro, de proveedor o general); no usar 0 acá, que sería un precio
      // base manual de $0. Lo mismo para margen: vacío = sin margen propio.
      precioBase:  form.precio.toString().trim() === "" ? null : Number(form.precio),
      margen:      form.margen.toString().trim() === "" ? null : Number(form.margen),
      proveedorId: form.proveedorId !== "" ? Number(form.proveedorId) : null,
    };

    const variantesData = variantes.map(v => ({
      ...(v.id
        ? { id: v.id, stock: v.stock }
        : { stockInicial: v.stockInicial.toString().trim() === "" ? 0 : Number(v.stockInicial), depositoInicialId: form.depositoId ? Number(form.depositoId) : null }),
      codigoBase:  base,
      codigo:      codigoFinal(v),
      nombre:      `${form.nombre.trim()}${v.color ? " " + v.color : ""}${v.talle ? " " + v.talle : ""}`,
      color:       v.color,
      talle:       v.talle,
      version:     v.version || "",
      rubro:       form.rubro,
      subrubro:    form.subrubro,
      costo:       Number(v.costo) || 0,
      precioBase:  v.precio.toString().trim() === "" ? null : Number(v.precio),
      margen:      v.margen.toString().trim() === "" ? null : Number(v.margen),
      proveedorId: form.proveedorId !== "" ? Number(form.proveedorId) : null,
      activo:      v.activo ?? true,
    }));

    onGuardar({ madre, variantes: variantesData });
  };

  const tallesCount = genTalles.split("\n").filter(t => t.trim()).length;
  const coloresCount = genColores.size;
  const comboCount  = coloresCount > 0 && tallesCount > 0
    ? coloresCount * tallesCount
    : coloresCount + tallesCount;

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div className="modal-title">
            {esNueva ? "Nuevo producto con variantes" : `Editar: ${productoMadre.nombre}`}
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          {error && (
            <div style={{
              background: "rgba(220,38,38,0.1)", border: "1px solid var(--red)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 14,
              fontSize: 13, color: "var(--red)",
            }}>
              {error}
            </div>
          )}

          {/* Datos del producto */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Datos del producto</div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Código base *</label>
                <input
                  className="form-input"
                  value={form.codigoBase}
                  onChange={e => setF("codigoBase", e.target.value.toUpperCase())}
                  placeholder="Ej: REM-OV"
                />
                {conflictoCodigoBase && (
                  <div style={{fontSize:11, color:"var(--amber)", marginTop:3}}>
                    ⚠ Ya lo usa "{conflictoCodigoBase.nombre}" ({conflictoCodigoBase.codigo}). Elegí uno distinto.
                  </div>
                )}
              </div>
              <div className="form-group" style={{ gridColumn: "2 / 4" }}>
                <label className="form-label">Nombre *</label>
                <input
                  className="form-input"
                  value={form.nombre}
                  onChange={e => setF("nombre", e.target.value)}
                  placeholder="Ej: Remera Oversize"
                />
              </div>
            </div>
            <div className="form-row form-row-2" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Rubro</label>
                <select className="form-select" value={form.rubro}
                  onChange={e => { setF("rubro", e.target.value); setF("subrubro", ""); }}>
                  <option value="">Seleccionar rubro...</option>
                  {nombresRubros.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subrubro <span style={{color:"var(--text3)",fontWeight:400}}>(opcional)</span></label>
                <select className="form-select" value={form.subrubro} onChange={e => setF("subrubro", e.target.value)}
                  disabled={!form.rubro || (subrubrosDeRubro?.(form.rubro) || []).length === 0}>
                  <option value="">
                    {!form.rubro ? "Primero elegí un rubro" : "— Sin subrubro —"}
                  </option>
                  {(subrubrosDeRubro?.(form.rubro) || []).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Costo base</label>
                <input
                  className="form-input" type="number" min="0"
                  value={form.costo}
                  onChange={e => setF("costo", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Precio base
                  <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                    (opcional)
                  </span>
                </label>
                <input
                  className="form-input" type="number" min="0"
                  value={form.precio}
                  onChange={e => setF("precio", e.target.value)}
                  placeholder="Auto: costo × margen"
                  disabled={form.margen.trim() !== ""}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Margen propio (%)
                  <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                    (opcional)
                  </span>
                </label>
                <input
                  className="form-input" type="number" min="0"
                  value={form.margen}
                  onChange={e => setF("margen", e.target.value)}
                  placeholder="Usa rubro/proveedor/general"
                  disabled={form.precio.trim() !== ""}
                />
              </div>
            </div>
            <div style={{fontSize:11, color:"var(--text3)", marginTop:-4, marginBottom:10}}>
              Estos valores son solo el default para variantes nuevas — cada variante puede tener su propio precio base o margen en la tabla de abajo.
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Proveedor</label>
                <select
                  className="form-select"
                  value={form.proveedorId}
                  onChange={e => setF("proveedorId", e.target.value)}
                >
                  <option value="">Sin proveedor</option>
                  {(proveedores || []).map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Depósito
                  <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                    (para el stock inicial de variantes nuevas)
                  </span>
                </label>
                <select className="form-select" value={form.depositoId} onChange={e => setF("depositoId", e.target.value)}>
                  <option value="">Seleccionar depósito...</option>
                  {depositosSeleccionables.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Generador de variantes */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Generar variantes en masa</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

              {/* Colores */}
              <div style={{ flex: "0 0 auto", maxWidth: 330 }}>
                <div className="form-label" style={{ marginBottom: 6 }}>Colores predefinidos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {COLORES.map(c => {
                    const sel = genColores.has(c);
                    return (
                      <button key={c} type="button" onClick={() => toggleColor(c)} style={{
                        padding: "3px 10px", fontSize: 12, borderRadius: 99, cursor: "pointer",
                        border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
                        background: sel ? "var(--accent)" : "var(--bg3)",
                        color: sel ? "#fff" : "var(--text2)",
                      }}>
                        {c}
                      </button>
                    );
                  })}
                </div>

                {/* Colores personalizados ya agregados */}
                {[...genColores.entries()].filter(([n]) => !COLOR_CODES[n]).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {[...genColores.entries()].filter(([n]) => !COLOR_CODES[n]).map(([nombre, codigo]) => (
                      <span key={nombre} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", fontSize: 12, borderRadius: 99,
                        background: "var(--accent)", color: "#fff",
                        border: "1px solid var(--accent)",
                      }}>
                        {nombre} <span style={{ fontSize: 10, opacity: 0.8 }}>({codigo})</span>
                        <button type="button" onClick={() => removeColor(nombre)}
                          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Agregar color personalizado */}
                <div className="form-label" style={{ marginBottom: 4 }}>Color personalizado</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    className="form-input" style={{ width: 130, fontSize: 12 }}
                    placeholder="Nombre (Ej: Azul Francia)"
                    value={customColorNombre}
                    onChange={e => setCustomColorNombre(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomColor()}
                  />
                  <input
                    className="form-input mono" style={{ width: 60, fontSize: 12 }}
                    placeholder="Abrev."
                    maxLength={4}
                    value={customColorCodigo}
                    onChange={e => setCustomColorCodigo(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && addCustomColor()}
                  />
                  <button className="btn btn-sm btn-ghost" type="button" onClick={addCustomColor}>
                    + Agregar
                  </button>
                </div>
              </div>

              {/* Talles */}
              <div style={{ flex: "1 1 110px" }}>
                <div className="form-label" style={{ marginBottom: 6 }}>Talles (uno por línea)</div>
                <textarea
                  className="form-input"
                  rows={5}
                  placeholder={"S\nM\nL\nXL\n42\n43"}
                  value={genTalles}
                  onChange={e => setGenTalles(e.target.value)}
                  style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
                />
              </div>

              {/* Botón generar */}
              <div style={{ flex: "0 0 auto", paddingTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-primary" type="button" onClick={generarVariantes}>
                  Generar combinaciones
                </button>
                {comboCount > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center" }}>
                    {coloresCount > 0 && tallesCount > 0
                      ? `${coloresCount} × ${tallesCount} = `
                      : ""}
                    <strong>{comboCount}</strong> combo{comboCount !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabla de variantes */}
          <div className="card">
            <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Variantes ({variantes.length})</span>
              <button
                className="btn btn-sm btn-ghost" type="button"
                onClick={() => setVariantes(prev => [...prev, {
                  color: "", talle: "", version: "", codigo: "",
                  costo: form.costo, precio: form.precio, margen: form.margen, stockInicial: "", activo: true,
                }])}
              >
                + Agregar variante
              </button>
            </div>

            {variantes.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                Usá el generador o agregá variantes manualmente
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Color</th>
                      <th>Talle</th>
                      <th>Versión</th>
                      <th>Costo</th>
                      <th>Precio</th>
                      <th>Margen %</th>
                      <th style={{ textAlign: "right" }}>Stock</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantes.map((v, idx) => (
                      <tr key={idx}>
                        <td>
                          {v.id ? (
                            <input
                              className="form-input" style={{ width: 130, fontSize: 12 }}
                              value={v.codigo}
                              onChange={e => updateVariante(idx, "codigo", e.target.value.toUpperCase())}
                            />
                          ) : (
                            <input
                              className="form-input mono"
                              style={{ width: 130, fontSize: 12, background: "var(--bg4)", color: "var(--accent2)", cursor: "default" }}
                              value={codigoFinal(v)}
                              readOnly
                              title="Se arma solo con código base + color + talle + versión"
                            />
                          )}
                        </td>
                        <td>
                          <input
                            className="form-input"
                            list="madre-colores-datalist"
                            style={{ width: 130, fontSize: 12 }}
                            placeholder="Color"
                            value={v.color}
                            onChange={e => updateVariante(idx, "color", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input" style={{ width: 72, fontSize: 12 }}
                            value={v.talle}
                            onChange={e => updateVariante(idx, "talle", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input" style={{ width: 90, fontSize: 12 }}
                            placeholder="Opcional"
                            value={v.version || ""}
                            onChange={e => updateVariante(idx, "version", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input" type="number" min="0" style={{ width: 88, fontSize: 12 }}
                            value={v.costo}
                            onChange={e => updateVariante(idx, "costo", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input" type="number" min="0" style={{ width: 88, fontSize: 12 }}
                            value={v.precio}
                            onChange={e => updateVariante(idx, "precio", e.target.value)}
                            disabled={(v.margen || "").toString().trim() !== ""}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input" type="number" min="0" style={{ width: 72, fontSize: 12 }}
                            value={v.margen}
                            onChange={e => updateVariante(idx, "margen", e.target.value)}
                            placeholder="—"
                            disabled={(v.precio || "").toString().trim() !== ""}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {v.id ? (
                            <span className="mono" style={{ fontSize: 13, color: "var(--text3)" }} title="Para cambiar el stock de una variante existente, usá Movimientos">
                              {v.stock ?? 0}
                            </span>
                          ) : (
                            <input
                              className="form-input" type="number" min="0" style={{ width: 72, fontSize: 12 }}
                              value={v.stockInicial}
                              onChange={e => updateVariante(idx, "stockInicial", e.target.value)}
                              placeholder="0"
                            />
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: "var(--red)" }}
                            type="button"
                            onClick={() => removeVariante(idx)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar}>
            {esNueva ? "Crear producto con variantes" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <datalist id="madre-colores-datalist">
        {COLORES.map(c => <option key={c} value={c}/>)}
        {[...genColores.keys()].filter(n => !COLOR_CODES[n]).map(n => <option key={n} value={n}/>)}
      </datalist>
    </div>
  );
}
