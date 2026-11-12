import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";

const TIPOS = [
  { value: "mensual", label: "Fijo mensual %" },
  { value: "diario", label: "Diario %" },
  { value: "sin_recargo", label: "Sin recargo" },
];

const BASES_CALCULO = [
  { value: "monto_total", label: "Monto total de la cuenta" },
  { value: "ultima_venta", label: "Saldo pendiente de la última venta" },
];

const defaultConfig = {
  usarGlobal: true,
  diasGracia: 30,
  tipo: "mensual",
  pct: 5,
  escala: [],
  usarEscala: false,
  aplicarPagoA: "capital_primero",
  baseCalculo: "monto_total",
};

export default function ConfigMora({
  cliente,
  globalConfig,
  setGlobalConfig,
  onGuardarClienteConfig,
  onClose,
  usuarioActivo,
}) {
  const esAdmin = usuarioActivo?.rol === "admin";
  const { toast } = useToast();
  const [form, setForm] = useState(defaultConfig);
  const modo = cliente ? "cliente" : "global";

  useEffect(() => {
    if (cliente) {
      setForm({ ...defaultConfig, ...(cliente.configMora || {}) });
    } else {
      setForm({ ...defaultConfig, ...(globalConfig || {}) });
    }
  }, [cliente, globalConfig]);

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const [guardando, setGuardando] = useState(false);

  // Espera a que se guarde en la base antes de cerrar: si falla, el modal
  // queda abierto con el aviso en vez de cerrarse como si se hubiera guardado.
  const handleSave = async () => {
    if (!esAdmin || guardando) return;
    setGuardando(true);
    try {
      if (cliente) {
        await onGuardarClienteConfig({ ...form });
      } else {
        await setGlobalConfig({ ...form });
        toast("Configuración global de mora guardada.", "success");
        onClose();
      }
    } catch (err) {
      toast(cliente
        ? `No se pudo guardar la configuración: ${err.message}`
        : `Se guardó solo en esta PC — no se pudo guardar en la base (${err.message}).`, "error");
    } finally {
      setGuardando(false);
    }
  };

  const labelTipo = TIPOS.find(t => t.value === form.tipo)?.label || "";

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">{cliente ? "Configuración de mora del cliente" : "Configuración global de mora"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            {cliente ? cliente.nombre : "Aplica a todos los clientes que no tengan mora individual."}
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 10 }}>
        {cliente && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div className="form-label" style={{ marginBottom: 4 }}>Cliente</div>
              <div style={{ color: "var(--text2)" }}>{cliente.nombre} · DNI {cliente.dni || "—"}</div>
            </div>
            <span className="badge badge-blue">{cliente.configMora?.usarGlobal !== false ? "Usa global" : "Config. individual"}</span>
          </div>
        )}

        {cliente && (
          <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.usarGlobal} onChange={e => setField("usarGlobal", e.target.checked)} />
            Usar configuración global
          </label>
        )}

        {(!cliente || !form.usarGlobal) && (
          <>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Días de gracia</label>
                <input type="number" className="form-input" min={0} value={form.diasGracia} onChange={e => setField("diasGracia", Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de recargo</label>
                <select className="form-select" value={form.tipo} onChange={e => setField("tipo", e.target.value)}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Porcentaje</label>
                <input type="number" min={0} className="form-input" value={form.pct} onChange={e => setField("pct", Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div>
                  <label className="form-label">Escala progresiva</label>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>Permite aplicar tramos según días de mora.</div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={form.usarEscala} onChange={e => setField("usarEscala", e.target.checked)} /> Activar
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Base de cálculo del recargo</label>
              <select className="form-select" value={form.baseCalculo} onChange={e => setField("baseCalculo", e.target.value)}>
                {BASES_CALCULO.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                {form.baseCalculo === "ultima_venta"
                  ? "El % se aplica solo sobre lo que quedó pendiente de la última venta a cta. cte. del cliente."
                  : "El % se aplica sobre el total adeudado en cta. cte. (todas las ventas pendientes)."}
              </div>
            </div>

            {form.usarEscala && (
              <div style={{ display: "grid", gap: 10 }}>
                {(form.escala || []).map((tramo, index) => (
                  <div key={index} className="form-row form-row-3" style={{ alignItems: "flex-end" }}>
                    <div className="form-group">
                      <label className="form-label">Hasta días</label>
                      <input type="number" min={1} className="form-input" value={tramo.hastaDias} onChange={e => {
                        const next = [...form.escala];
                        next[index] = { ...next[index], hastaDias: Number(e.target.value) };
                        setField("escala", next);
                      }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">%</label>
                      <input type="number" min={0} className="form-input" value={tramo.pct} onChange={e => {
                        const next = [...form.escala];
                        next[index] = { ...next[index], pct: Number(e.target.value) };
                        setField("escala", next);
                      }} />
                    </div>
                    <button type="button" className="btn btn-ghost" style={{ height: 34, marginTop: 4 }} onClick={() => {
                      const next = form.escala.filter((_, i) => i !== index);
                      setField("escala", next);
                    }}>Eliminar</button>
                  </div>
                ))}
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setField("escala", [...(form.escala || []), { hastaDias: 30, pct: 5 }])}>
                  <Icon name="plus" size={13}/> Agregar tramo
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ color: "var(--text3)", fontSize: 12 }}>
            <div>Tipo aplicado: {labelTipo}</div>
            <div>Base de cálculo: {BASES_CALCULO.find(b => b.value === form.baseCalculo)?.label}</div>
            <div>Pago aplica a: {form.aplicarPagoA === "recargo_primero" ? "Recargo primero" : "Capital primero"}</div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!esAdmin || guardando} onClick={handleSave}>
          <Icon name="check" size={14}/> {guardando ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </Modal>
  );
}
