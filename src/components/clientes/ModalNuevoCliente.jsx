import { useState } from "react";
import Icon from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { COND_IVA } from "../../constants";

const NECESITA_CUIT = ["Responsable Inscripto", "Monotributista"];

function validarDni(valor) {
  const limpio = valor.replace(/[\.\-\s]/g, "");
  return /^\d{7,8}$/.test(limpio);
}

function validarCuit(valor) {
  const limpio = valor.replace(/[\.\-\s]/g, "");
  return /^\d{11}$/.test(limpio);
}

export default function ModalNuevoCliente({ onClose, onGuardar, usuarioActivo, cliente = null }) {
  const esEdicion = !!cliente;
  const [form, setForm] = useState(() => cliente
    ? { nombre: cliente.nombre || "", dni: cliente.dni || "", tel: cliente.tel || "", email: cliente.email || "", dir: cliente.dir || "", iva: cliente.iva || "Consumidor Final" }
    : { nombre:"", dni:"", tel:"", email:"", dir:"", iva:"Consumidor Final" });
  const [configMora, setConfigMora] = useState(() => cliente?.configMora
    ? { usarGlobal: false, diasGracia: 30, tipo: "mensual", pct: 5, escala: [], usarEscala: false, ...cliente.configMora }
    : { usarGlobal: true, diasGracia: 30, tipo: "mensual", pct: 5, escala: [], usarEscala: false });
  const [error, setError] = useState("");
  const isAdmin = usuarioActivo?.rol === "admin";
  const set = (k, v) => setForm(p => ({...p, [k]: v}));
  const setConfig = (k, v) => setConfigMora(p => ({ ...p, [k]: v }));
  const necesitaCuit = NECESITA_CUIT.includes(form.iva);

  const guardar = async () => {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio"); return; }
    if (!form.dni.trim()) { setError(`El ${necesitaCuit ? "CUIT" : "DNI"} es obligatorio`); return; }
    if (necesitaCuit && !validarCuit(form.dni)) { setError("CUIT inválido. Debe tener 11 dígitos (ej: 20-12345678-9)"); return; }
    if (!necesitaCuit && !validarDni(form.dni)) { setError("DNI inválido. Debe tener 7 u 8 dígitos"); return; }
    if (!form.dir.trim()) { setError("La dirección es obligatoria"); return; }
    const datosCliente = { ...form };
    // Antes solo se mandaba la config si era individual: volver a "usar
    // global" no se guardaba y el cliente seguía con la individual. Ahora se
    // manda siempre que un admin edita (al crear, solo si es individual).
    // Los cargos manuales y la mora cobrada viajan dentro de configMora
    // (vienen de cliente.configMora), así que no se pierden.
    if (isAdmin && (esEdicion || !configMora.usarGlobal)) {
      datosCliente.configMora = configMora.usarGlobal
        ? { ...(cliente?.configMora || {}), usarGlobal: true }
        : configMora;
    }
    try {
      await onGuardar(datosCliente);
    } catch (err) {
      setError(err.message || "Error al guardar el cliente");
    }
  };
  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">{esEdicion ? "Editar cliente" : "Nuevo cliente"}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Nombre y apellido *</label>
            <input className="form-input" value={form.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Ej: Juan Pérez"/>
          </div>
          <div className="form-group">
            <label className="form-label">Condición ante IVA</label>
            <select className="form-select" value={form.iva} onChange={e=>set("iva",e.target.value)}>
              {COND_IVA.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">{necesitaCuit ? "CUIT" : "DNI"} *</label>
            <input className="form-input" value={form.dni} onChange={e=>set("dni",e.target.value)} placeholder={necesitaCuit ? "20-12345678-9" : "20123456"}/>
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" value={form.tel} onChange={e=>set("tel",e.target.value)} placeholder="381-555-0000"/>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Mail</label>
          <input className="form-input" type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="juan@ejemplo.com"/>
        </div>
        <div className="form-group">
          <label className="form-label">Dirección *</label>
          <input className="form-input" value={form.dir} onChange={e=>set("dir",e.target.value)} placeholder="Av. San Martín 1234"/>
        </div>

        {isAdmin && (
          <div style={{borderTop:"1px solid var(--border)",paddingTop:14,marginTop:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div className="form-label" style={{marginBottom:4}}>Configuración de mora</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>Usar configuración global salvo que se complete una configuración individual.</div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                <input type="checkbox" checked={configMora.usarGlobal} onChange={e=>setConfig("usarGlobal", e.target.checked)} />
                Usar configuración global
              </label>
            </div>
            {!configMora.usarGlobal && (
              <>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label">Días de gracia</label>
                    <input type="number" className="form-input" value={configMora.diasGracia} min={0} onChange={e=>setConfig("diasGracia", Number(e.target.value))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo de recargo</label>
                    <select className="form-select" value={configMora.tipo} onChange={e=>setConfig("tipo", e.target.value)}>
                      <option value="mensual">Fijo mensual %</option>
                      <option value="diario">Diario %</option>
                      <option value="sin_recargo">Sin recargo</option>
                    </select>
                  </div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label">Porcentaje</label>
                    <input type="number" className="form-input" value={configMora.pct} min={0} onChange={e=>setConfig("pct", Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{display:"flex",alignItems:"flex-end",gap:10}}>
                    <label className="form-label" style={{marginBottom:4}}>Escala progresiva</label>
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                      <input type="checkbox" checked={configMora.usarEscala} onChange={e=>setConfig("usarEscala", e.target.checked)} />
                      Activar
                    </label>
                  </div>
                </div>
                {configMora.usarEscala && (
                  <div style={{display:"grid",gap:10}}>
                    {(configMora.escala || []).map((tramo,index) => (
                      <div key={index} className="form-row form-row-3" style={{alignItems:"flex-end"}}>
                        <div className="form-group">
                          <label className="form-label">Hasta días</label>
                          <input type="number" className="form-input" value={tramo.hastaDias} min={1} onChange={e=>{
                            const next = [...configMora.escala];
                            next[index] = {...next[index], hastaDias: Number(e.target.value)};
                            setConfig("escala", next);
                          }} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">%</label>
                          <input type="number" className="form-input" value={tramo.pct} min={0} onChange={e=>{
                            const next = [...configMora.escala];
                            next[index] = {...next[index], pct: Number(e.target.value)};
                            setConfig("escala", next);
                          }} />
                        </div>
                        <button type="button" className="btn btn-ghost" style={{height:34,marginTop:4}} onClick={()=>{
                          const next = configMora.escala.filter((_,i)=>i!==index);
                          setConfig("escala", next);
                        }}>Eliminar</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-primary btn-sm" onClick={()=>{
                      setConfig("escala", [...(configMora.escala||[]), { hastaDias: 30, pct: 5 }]);
                    }}>Agregar tramo</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {error && (
        <div style={{color:"var(--danger)",fontSize:12,marginTop:10}}>{error}</div>
      )}
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar}><Icon name="check" size={14}/> {esEdicion ? "Guardar cambios" : "Guardar cliente"}</button>
      </div>
    </Modal>
  );
}

// ─── PAGE: CLIENTES ────────────────────────────────────────────────────────────
