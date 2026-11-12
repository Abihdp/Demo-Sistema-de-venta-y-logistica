import { useState, useMemo, useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import ModalUsuario from "./ModalUsuario.jsx";
import ModalCambiarPassword from "../auth/ModalCambiarPassword.jsx";
import { ROLES, ROL_LABEL, PERMISOS_LABELS, PERMISOS_POR_ROL } from "../../constants/index.js";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";

const GRUPOS = ["Módulos", "Ventas", "Compras", "Caja", "Inventario", "Administración"];

const permisosPorGrupo = Object.entries(PERMISOS_LABELS).reduce((acc, [key, info]) => {
  if (!acc[info.grupo]) acc[info.grupo] = [];
  acc[info.grupo].push({ key, ...info });
  return acc;
}, {});

export default function PageUsuarios({ usuarios, usuarioActivo, invitarUsuario, actualizarUsuario, cargarUsuarios, cambiarPassword }) {
  const { toast }   = useToast();
  const { confirm } = useConfirm();
  const [tab,          setTab]          = useState("usuarios");
  const [modalUsuario, setModalUsuario] = useState(null);
  const [usuarioSelId, setUsuarioSelId] = useState(null);
  const [showCambiarPwd, setShowCambiarPwd] = useState(false);
  const [cargando,     setCargando]     = useState(false);

  // Cargar la lista completa al montar (RLS garantiza que solo el admin ve todos)
  useEffect(() => {
    setCargando(true);
    cargarUsuarios().catch(() => {}).finally(() => setCargando(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const usuarioSel = useMemo(
    () => usuarios.find(u => u.id === usuarioSelId) || usuarios[0] || null,
    [usuarioSelId, usuarios]
  );

  const guardarUsuario = async (datos) => {
    if (modalUsuario && modalUsuario.id) {
      // Edición — solo nombre, rol, color
      try {
        await actualizarUsuario(modalUsuario.id, {
          nombre: datos.nombre,
          rol:    datos.rol,
          color:  datos.color,
        });
        toast(`Usuario "${datos.nombre}" actualizado.`, "success");
        setModalUsuario(null);
      } catch (e) {
        toast("Error al actualizar: " + e.message, "error");
      }
    } else {
      // Nuevo usuario — invitar con permisos por defecto del rol
      try {
        await invitarUsuario({
          ...datos,
          permisos: PERMISOS_POR_ROL[datos.rol] || {},
        });
        toast(`Usuario "${datos.nombre}" creado. Ya puede ingresar con su nombre y contraseña.`, "success");
        setModalUsuario(null);
      } catch (e) {
        toast("Error al crear usuario: " + e.message, "error");
      }
    }
  };

  const desactivarUsuario = async (u) => {
    if (u.rol === "admin") {
      const otrosAdmins = usuarios.filter(x => x.rol === "admin" && x.id !== u.id && x.activo !== false);
      if (otrosAdmins.length === 0) {
        toast("No se puede desactivar al único administrador.", "error"); return;
      }
    }
    if (!await confirm(`¿Desactivar a "${u.nombre}"? No podrá ingresar al sistema.`, { danger: true, confirmLabel: "Desactivar" })) return;
    try {
      await actualizarUsuario(u.id, { activo: false });
      toast(`Usuario "${u.nombre}" desactivado.`, "success");
    } catch (e) {
      toast("Error al desactivar: " + e.message, "error");
    }
  };

  const togglePermiso = async (userId, key) => {
    const user = usuarios.find(u => u.id === userId);
    if (!user) return;
    const newPermisos = { ...(user.permisos || {}), [key]: !user.permisos?.[key] };
    try {
      await actualizarUsuario(userId, { permisos: newPermisos });
    } catch (e) {
      toast("Error al actualizar permiso: " + e.message, "error");
    }
  };

  const aplicarPlantilla = async (userId, rol) => {
    const plantilla = PERMISOS_POR_ROL[rol];
    if (!plantilla) return;
    try {
      await actualizarUsuario(userId, { permisos: plantilla });
      toast(`Permisos de ${ROL_LABEL[rol] || rol} aplicados.`, "success");
    } catch (e) {
      toast("Error al aplicar plantilla: " + e.message, "error");
    }
  };

  const permsUsuarioSel = usuarioSel?.permisos || {};
  const esAdmin = usuarioActivo?.rol === "admin";

  return (
    <div>
      {showCambiarPwd && (
        <ModalCambiarPassword
          onClose={() => setShowCambiarPwd(false)}
          onConfirm={cambiarPassword}
        />
      )}

      {/* ── Botón cambiar contraseña (visible para todos) ─── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowCambiarPwd(true)}>
          <Icon name="lock" size={13}/> Cambiar mi contraseña
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 8, overflow: "hidden", marginBottom: 16, width: "fit-content" }}>
        {[["usuarios", "Usuarios"], ["permisos", "Permisos por usuario"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "7px 16px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
            background: tab === k ? "var(--accent)" : "transparent",
            color: tab === k ? "#fff" : "var(--text2)",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Tab: Usuarios ───────────────────────────────────────────────── */}
      {tab === "usuarios" && (
        <>
          <div className="card">
            <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Usuarios del sistema</span>
              {esAdmin && (
                <button className="btn btn-sm btn-primary" onClick={() => setModalUsuario({})}>
                  <Icon name="plus" size={14}/> Nuevo usuario
                </button>
              )}
            </div>

            {cargando ? (
              <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
                Cargando usuarios...
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      {esAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => (
                      <tr key={u.id} style={{ opacity: u.activo === false ? 0.5 : 1 }}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%", background: u.color,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                            }}>{u.nombre[0]}</div>
                            <span style={{ color: "var(--text1)", fontWeight: 500 }}>
                              {u.nombre}{u.id === usuarioActivo?.id ? " (yo)" : ""}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text3)" }}>{u.email || "—"}</td>
                        <td><span className="badge badge-accent">{ROL_LABEL[u.rol] || u.rol}</span></td>
                        <td>
                          {u.activo === false
                            ? <span className="badge badge-danger">Inactivo</span>
                            : u.authId
                              ? <span className="badge badge-ok">Activo</span>
                              : <span className="badge" style={{ background: "rgba(245,158,11,0.1)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}>Pendiente invitación</span>
                          }
                        </td>
                        {esAdmin && (
                          <td>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <button className="btn btn-sm btn-ghost" title="Editar permisos"
                                onClick={() => { setUsuarioSelId(u.id); setTab("permisos"); }}>
                                <Icon name="lock" size={13}/>
                              </button>
                              <button className="btn btn-sm btn-ghost" title="Editar usuario" onClick={() => setModalUsuario(u)}>
                                <Icon name="edit" size={13}/>
                              </button>
                              {u.id !== usuarioActivo?.id && (
                                <button className="btn btn-sm btn-ghost" title="Desactivar" onClick={() => desactivarUsuario(u)}>
                                  <Icon name="trash" size={13} color="var(--red)"/>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </>
      )}

      {/* ── Tab: Permisos por usuario ────────────────────────────────────── */}
      {tab === "permisos" && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

          <div className="card" style={{ minWidth: 180, flexShrink: 0 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Usuario</div>
            {usuarios.filter(u => u.activo !== false).map(u => (
              <button key={u.id}
                onClick={() => setUsuarioSelId(u.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  marginBottom: 4,
                  background: usuarioSel?.id === u.id ? "var(--accent)" : "transparent",
                  color: usuarioSel?.id === u.id ? "#fff" : "var(--text1)",
                  fontWeight: usuarioSel?.id === u.id ? 600 : 400,
                  fontSize: 13,
                }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", background: u.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>{u.nombre[0]}</div>
                <div style={{ textAlign: "left" }}>
                  <div>{u.nombre}</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{ROL_LABEL[u.rol] || u.rol}</div>
                </div>
              </button>
            ))}
          </div>

          {usuarioSel && (
            <div className="card" style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 2 }}>
                    Permisos de {usuarioSel.nombre}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>
                    Rol base: {ROL_LABEL[usuarioSel.rol] || usuarioSel.rol}
                  </div>
                </div>
                {esAdmin && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center", marginRight: 4 }}>Aplicar plantilla:</span>
                    {ROLES.map(r => (
                      <button key={r.id} className="btn btn-sm btn-ghost"
                        onClick={() => aplicarPlantilla(usuarioSel.id, r.id)}
                        style={{ fontSize: 11 }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {GRUPOS.filter(g => permisosPorGrupo[g]?.length > 0).map(grupo => (
                <div key={grupo} style={{ marginBottom: 18 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "var(--text3)",
                    textTransform: "uppercase", letterSpacing: ".06em",
                    borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 8,
                  }}>{grupo}</div>
                  {permisosPorGrupo[grupo].map(({ key, label, desc }) => (
                    <label key={key} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "6px 0", cursor: esAdmin ? "pointer" : "default",
                    }}>
                      <input
                        type="checkbox"
                        checked={!!permsUsuarioSel[key]}
                        onChange={() => esAdmin && togglePermiso(usuarioSel.id, key)}
                        disabled={!esAdmin}
                        style={{ width: 15, height: 15, marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ color: "var(--text1)", fontWeight: 500, fontSize: 13 }}>{label}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalUsuario && (
        <ModalUsuario
          usuario={modalUsuario.id ? modalUsuario : null}
          onClose={() => setModalUsuario(null)}
          onGuardar={guardarUsuario}
        />
      )}
    </div>
  );
}
