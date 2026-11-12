import { useState, useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import { COLOR_CODES, COLORES } from "../../constants/index.js";
import { STOCK_MINIMO_DEFAULT, fmt, precioBaseDe } from "../../utils/helpers.js";
import { useToast } from "../ui/Toast.jsx";

export default function ModalProducto({ producto, productos = [], proveedores = [], rubrosDB = [], nombresRubros = [], subrubrosDeRubro, margenBase = 0, depositos = [], onGuardar, onClose }) {
  const { toast } = useToast();
  const esEdicion = Boolean(producto?.id);
  const depositosSeleccionables = depositos.filter(d => d.tipo !== "transito");

  // Otras variantes (color/talle) de la misma familia — permiten replicar el costo cargado.
  const relacionados = (esEdicion && producto?.productoMadreId)
    ? productos.filter(p => p.productoMadreId === producto.productoMadreId && p.id !== producto.id)
    : [];
  const [aplicarATodos, setAplicarATodos] = useState(false);

  const initColorCodigo = (color) =>
    COLOR_CODES[color] || (color ? color.replace(/\s+/g, "").slice(0, 3).toUpperCase() : "");

  const [form, setForm] = useState({
    codigoBase:  producto?.codigoBase || "",
    codigo:      producto?.codigo     || "",
    nombre:      producto?.nombre     || "",
    rubro:       producto?.rubro      || producto?.categoria || nombresRubros[0] || "",
    subrubro:    producto?.subrubro   || "",
    color:       producto?.color      || "",
    colorCodigo: initColorCodigo(producto?.color || ""),
    talle:       producto?.talle      || "",
    version:     producto?.version    || "",
    costo:       producto?.costo      || "",
    precioBase:  producto?.precioBase != null ? String(producto.precioBase) : "",
    margen:      producto?.margen     != null ? String(producto.margen)     : "",
    stockMinimo: producto?.stockMinimo ?? STOCK_MINIMO_DEFAULT,
    proveedorId: producto?.proveedorId != null ? String(producto.proveedorId) : "",
    activo:      producto?.activo ?? true,
    stockInicial:  "",
    depositoId:    (depositos.find(d => d.tipo === "normal") || depositos.find(d => d.tipo !== "transito"))?.id ?? "",
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Auto-fill colorCodigo when a known color is selected
  useEffect(() => {
    if (esEdicion) return;
    if (COLOR_CODES[form.color]) set("colorCodigo", COLOR_CODES[form.color]);
  }, [form.color]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate codigo when codigoBase, colorCodigo, talle or versión changes (only on create)
  useEffect(() => {
    if (esEdicion) return;
    if (!form.codigoBase.trim()) { set("codigo", ""); return; }
    const cc = form.colorCodigo.trim();
    const talleCode   = form.talle.trim()   ? form.talle.trim().replace(/\s+/g, "").toUpperCase()            : "";
    const versionCode = form.version.trim() ? form.version.trim().replace(/\s+/g, "").slice(0, 8).toUpperCase() : "";
    set("codigo", [form.codigoBase.trim(), cc, talleCode, versionCode].filter(Boolean).join("-"));
  }, [form.codigoBase, form.colorCodigo, form.talle, form.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Se calculan en cada render (no solo al guardar) para avisar apenas se
  // tipea un código repetido, en vez de recién al final al tocar Guardar.
  const codigoTrim = form.codigo.trim();
  const conflictoCodigo = codigoTrim
    ? productos.find(p => p.id !== producto?.id && p.codigo?.toLowerCase() === codigoTrim.toLowerCase())
    : null;

  // El código base es fijo al editar (input disabled), así que este chequeo
  // solo aplica al crear un producto nuevo y sin relación con ninguna familia.
  const codigoBaseTrim = form.codigoBase.trim();
  const conflictoCodigoBase = (!esEdicion && codigoBaseTrim)
    ? productos.find(p => (p.codigoBase || p.codigo || "").trim().toLowerCase() === codigoBaseTrim.toLowerCase())
    : null;

  const guardar = () => {
    if (!form.nombre.trim())  { toast("El nombre es obligatorio.", "error"); return; }
    if (!form.codigo.trim())  { toast("El código es obligatorio.", "error"); return; }
    if (!form.costo || isNaN(Number(form.costo)) || Number(form.costo) < 0)
      { toast("El costo debe ser un número válido.", "error"); return; }
    if (form.precioBase.trim() !== "" && (isNaN(Number(form.precioBase)) || Number(form.precioBase) < 0))
      { toast("El precio base debe ser un número válido, o dejarlo vacío para calcularlo automático.", "error"); return; }
    if (form.margen.trim() !== "" && (isNaN(Number(form.margen)) || Number(form.margen) < 0))
      { toast("El margen propio debe ser un número válido, o dejarlo vacío para usar el margen de rubro/proveedor/general.", "error"); return; }
    if (form.stockMinimo === "" || isNaN(Number(form.stockMinimo)) || Number(form.stockMinimo) < 0)
      { toast("El stock mínimo debe ser un número válido.", "error"); return; }
    if (!esEdicion && form.stockInicial.trim() !== "" && (isNaN(Number(form.stockInicial)) || Number(form.stockInicial) < 0))
      { toast("El stock inicial debe ser un número válido.", "error"); return; }
    if (!esEdicion && form.stockInicial.trim() !== "" && Number(form.stockInicial) > 0 && !form.depositoId)
      { toast("Elegí en qué depósito cargar el stock inicial.", "error"); return; }

    // No permitir repetir la combinación código base + color + talle + versión
    // (el código generado ya es exactamente esa combinación).
    if (conflictoCodigo) {
      toast(`Ya existe un producto con ese código base + color + talle + versión: "${conflictoCodigo.nombre}" (${conflictoCodigo.codigo}).`, "error");
      return;
    }

    // El código base tampoco puede repetirse entre productos/familias distintas
    // (solo las variantes de una misma familia lo comparten, y eso se arma
    // desde "Nuevo producto con variantes").
    if (conflictoCodigoBase) {
      toast(`El código base "${codigoBaseTrim}" ya lo usa otro producto/familia: "${conflictoCodigoBase.nombre}". Elegí uno distinto.`, "error");
      return;
    }

    onGuardar({
      // El precio de venta por lista se define en Productos → Precios, no acá.
      ...(esEdicion ? producto : { precio: Number(form.costo) }),
      codigoBase:  form.codigoBase.trim() || form.codigo.trim(),
      codigo:      form.codigo.trim(),
      nombre:      form.nombre.trim(),
      rubro:       form.rubro,
      subrubro:    form.subrubro,
      color:       form.color,
      talle:       form.talle.trim(),
      version:     form.version.trim(),
      costo:       Number(form.costo),
      precioBase:  form.precioBase.trim() === "" ? null : Number(form.precioBase),
      margen:      form.margen.trim() === "" ? null : Number(form.margen),
      stockMinimo: Number(form.stockMinimo),
      ...(esEdicion ? {} : {
        stockInicial: form.stockInicial.trim() === "" ? 0 : Number(form.stockInicial),
        depositoInicialId: form.depositoId ? Number(form.depositoId) : null,
      }),
      proveedorId: form.proveedorId ? Number(form.proveedorId) : null,
      activo:      form.activo,
      aplicarCostoATodasVariantes: aplicarATodos && relacionados.length > 0,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {esEdicion ? "Editar producto" : "Nuevo producto"}
          </div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="close" size={16}/>
          </button>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:16}}>

          {/* Código */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Código base</label>
              <input
                className="form-input mono"
                placeholder="Ej: 001"
                value={form.codigoBase}
                onChange={e => set("codigoBase", e.target.value)}
                disabled={esEdicion}
                style={{fontFamily:"'DM Mono',monospace"}}
              />
              {conflictoCodigoBase && (
                <div style={{fontSize:11, color:"var(--amber)", marginTop:3}}>
                  ⚠ Ya lo usa "{conflictoCodigoBase.nombre}" ({conflictoCodigoBase.codigo}). Elegí uno distinto.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">
                Código generado
                {!esEdicion && <span style={{color:"var(--text3)", fontWeight:400, marginLeft:6, textTransform:"none", letterSpacing:0}}>
                  (automático por color y talle)
                </span>}
              </label>
              <input
                className="form-input"
                value={form.codigo}
                onChange={e => set("codigo", e.target.value)}
                readOnly={!esEdicion}
                placeholder="Se genera automáticamente"
                style={{fontFamily:"'DM Mono',monospace", color:"var(--accent2)",
                  background: !esEdicion ? "var(--bg4)" : undefined,
                  cursor: !esEdicion ? "default" : "text"}}
              />
              {conflictoCodigo && (
                <div style={{fontSize:11, color:"var(--amber)", marginTop:3}}>
                  ⚠ Ya existe en "{conflictoCodigo.nombre}" ({conflictoCodigo.codigo}).
                </div>
              )}
            </div>
          </div>

          {/* Nombre */}
          <div className="form-group">
            <label className="form-label">Nombre del producto</label>
            <input
              className="form-input"
              placeholder="Ej: Remera Oversize Roja M"
              value={form.nombre}
              onChange={e => set("nombre", e.target.value)}
            />
          </div>

          {/* Rubro / Subrubro */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Rubro</label>
              <select className="form-select" value={form.rubro}
                onChange={e => { set("rubro", e.target.value); set("subrubro", ""); }}>
                <option value="">Seleccionar rubro...</option>
                {nombresRubros.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subrubro <span style={{color:"var(--text3)", fontWeight:400}}>(opcional)</span></label>
              <select className="form-select" value={form.subrubro} onChange={e => set("subrubro", e.target.value)}
                disabled={!form.rubro || (subrubrosDeRubro?.(form.rubro) || []).length === 0}>
                <option value="">
                  {!form.rubro ? "Primero elegí un rubro" : "— Sin subrubro —"}
                </option>
                {(subrubrosDeRubro?.(form.rubro) || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Color · Abreviatura · Talle · Versión */}
          <div className="form-row form-row-4">
            <div className="form-group">
              <label className="form-label">Color</label>
              <input
                className="form-input"
                list="modal-producto-colores"
                placeholder="Ej: Negro, Azul Francia"
                value={form.color}
                onChange={e => set("color", e.target.value)}
              />
              <datalist id="modal-producto-colores">
                {COLORES.map(c => <option key={c} value={c}/>)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">
                Abreviatura
                <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                  (se usa en el código)
                </span>
              </label>
              <input
                className="form-input mono"
                placeholder="Ej: N, AF"
                maxLength={4}
                value={form.colorCodigo}
                onChange={e => set("colorCodigo", e.target.value.toUpperCase())}
                style={{textTransform:"uppercase"}}
              />
              {(() => {
                const abrev = form.colorCodigo.trim();
                const dueño = abrev
                  ? Object.entries(COLOR_CODES).find(([n, v]) => v === abrev && n !== form.color)?.[0]
                  : null;
                return dueño
                  ? <div style={{fontSize:11, color:"var(--amber)", marginTop:3}}>
                      ⚠ "{abrev}" ya la usa "{dueño}". Usá una abreviatura diferente.
                    </div>
                  : null;
              })()}
            </div>
            <div className="form-group">
              <label className="form-label">Talle</label>
              <input
                className="form-input"
                placeholder="Ej: M, L, 42"
                value={form.talle}
                onChange={e => set("talle", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Versión
                <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                  (opcional)
                </span>
              </label>
              <input
                className="form-input"
                placeholder="Ej: Invierno, V2"
                value={form.version}
                onChange={e => set("version", e.target.value)}
              />
            </div>
          </div>

          {/* Costo · Precio base · Margen propio · Stock mínimo */}
          <div className="form-row form-row-4">
            <div className="form-group">
              <label className="form-label">Costo (compra, sin IVA)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="0"
                value={form.costo}
                onChange={e => set("costo", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Precio base
                <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                  (opcional)
                </span>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder={`Auto: ${fmt(precioBaseDe({ costo: Number(form.costo) || 0, precioBase: null, margen: null, rubro: form.rubro, proveedorId: form.proveedorId ? Number(form.proveedorId) : null }, margenBase, rubrosDB, proveedores))}`}
                  value={form.precioBase}
                  onChange={e => set("precioBase", e.target.value)}
                />
                {form.precioBase !== "" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    title="Usar automático"
                    onClick={() => set("precioBase", "")}
                  >
                    <Icon name="close" size={12}/>
                  </button>
                )}
              </div>
              <div style={{fontSize:11, color:"var(--text3)", marginTop:3}}>
                {form.precioBase.trim() === ""
                  ? "Manual — si lo cargás, tiene prioridad sobre todo lo demás (margen propio, de rubro, de proveedor o general)."
                  : "Fijo — se ignora cualquier margen para este producto. Cada lista aplica su % encima de este valor."}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                Margen propio (%)
                <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                  (opcional)
                </span>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="Usa rubro/proveedor/general"
                  value={form.margen}
                  onChange={e => set("margen", e.target.value)}
                  disabled={form.precioBase.trim() !== ""}
                />
                {form.margen !== "" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    title="Usar el margen de rubro/proveedor/general"
                    onClick={() => set("margen", "")}
                  >
                    <Icon name="close" size={12}/>
                  </button>
                )}
              </div>
              <div style={{fontSize:11, color:"var(--text3)", marginTop:3}}>
                {form.precioBase.trim() !== ""
                  ? "No aplica — hay un precio base manual cargado."
                  : form.margen.trim() === ""
                    ? "Sin margen propio: usa el del rubro, luego el del proveedor, luego el general."
                    : `Precio base = costo × (1 + ${form.margen || 0}%), ignorando rubro/proveedor/general.`}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                Stock mínimo
                <span style={{color:"var(--text3)", fontWeight:400, marginLeft:6, textTransform:"none", letterSpacing:0, fontSize:11}}>
                  (stock bajo)
                </span>
              </label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder={String(STOCK_MINIMO_DEFAULT)}
                value={form.stockMinimo}
                onChange={e => set("stockMinimo", e.target.value)}
              />
            </div>
          </div>

          {/* Stock inicial — solo al crear un producto nuevo */}
          {!esEdicion && (
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">
                  Depósito
                  <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                    (para el stock inicial)
                  </span>
                </label>
                <select className="form-select" value={form.depositoId} onChange={e => set("depositoId", e.target.value)}>
                  <option value="">Seleccionar depósito...</option>
                  {depositosSeleccionables.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Stock inicial
                  <span style={{color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0, fontSize:11}}>
                    (opcional)
                  </span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.stockInicial}
                  onChange={e => set("stockInicial", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Aplicar costo a variantes relacionadas */}
          {relacionados.length > 0 && (
            <div style={{
              display:"flex", alignItems:"flex-start", gap:10, padding:"12px 14px",
              background:"var(--bg3)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)",
            }}>
              <input
                type="checkbox"
                id="prod-aplicar-relacionados"
                checked={aplicarATodos}
                onChange={e => setAplicarATodos(e.target.checked)}
                style={{width:16, height:16, marginTop:2, cursor:"pointer", accentColor:"var(--accent)"}}
              />
              <label htmlFor="prod-aplicar-relacionados" style={{fontSize:13, color:"var(--text2)", cursor:"pointer", userSelect:"none"}}>
                Aplicar este costo a las {relacionados.length} variante{relacionados.length !== 1 ? "s" : ""} relacionada{relacionados.length !== 1 ? "s" : ""} de la misma familia
                <div style={{fontSize:11, color:"var(--text3)", fontWeight:400, marginTop:3}}>
                  {relacionados.map(p => `${p.color || ""}${p.talle ? ` ${p.talle}` : ""}`.trim() || p.codigo).join(", ")}
                </div>
              </label>
            </div>
          )}

          {/* Proveedor */}
          <div className="form-group">
            <label className="form-label">Proveedor</label>
            <select className="form-select" value={form.proveedorId} onChange={e => set("proveedorId", e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Activo — solo en edición */}
          {esEdicion && (
            <div style={{
              display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
              background:"var(--bg3)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)",
            }}>
              <input
                type="checkbox"
                id="prod-activo"
                checked={form.activo !== false}
                onChange={e => set("activo", e.target.checked)}
                style={{width:16, height:16, cursor:"pointer", accentColor:"var(--accent)"}}
              />
              <label htmlFor="prod-activo" style={{fontSize:13, color:"var(--text2)", cursor:"pointer", userSelect:"none"}}>
                Producto activo (disponible para ventas y búsquedas)
              </label>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-sm btn-primary" onClick={guardar}>
            <Icon name="check" size={13}/>
            {esEdicion ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
