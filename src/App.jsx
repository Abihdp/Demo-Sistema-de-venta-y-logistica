import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { useProductos }    from "./hooks/useProductos.js";
import { useClientes }     from "./hooks/useClientes.js";
import { useProveedores }  from "./hooks/useProveedores.js";
import { useCompras }      from "./hooks/useCompras.js";
import { useVentas }        from "./hooks/useVentas.js";
import { useGastos }        from "./hooks/useGastos.js";
import { useCajaHistorial } from "./hooks/useCajaHistorial.js";
import { usePeriodosCerrados } from "./hooks/usePeriodosCerrados.js";
import { useCheques }       from "./hooks/useCheques.js";
import { useRecibos }       from "./hooks/useRecibos.js";
import { useDepositos }     from "./hooks/useDepositos.js";
import { useListasPrecios } from "./hooks/useListasPrecios.js";
import { usePromociones } from "./hooks/usePromociones.js";
import { useTesoreria }     from "./hooks/useTesoreria.js";
import { useRubros }        from "./hooks/useRubros.js";
import { useTarjetas }      from "./hooks/useTarjetas.js";
import { useReservas }      from "./hooks/useReservas.js";
import { useCaja }          from "./hooks/useCaja.js";
import { useAuth }          from "./hooks/useAuth.js";
import { useToast }         from "./components/ui/Toast.jsx";
import { useConnectivity }  from "./lib/connectivity.js";
import { useOutboxStatus, runSync } from "./lib/outbox.js";
import "./styles/global.css";
import Icon from "./components/ui/Icon.jsx";
import SelectorImpresora from "./components/ui/SelectorImpresora.jsx";
import SinConexion from "./components/ui/SinConexion.jsx";
import DemoBanner from "./components/ui/DemoBanner.jsx";
import PageDashboard  from "./components/dashboard/PageDashboard.jsx";
import PageVentas     from "./components/ventas/PageVentas.jsx";
import PageCompras    from "./components/compras/PageCompras.jsx";
import PageCaja       from "./components/caja/PageCaja.jsx";
import PageProductos  from "./components/productos/PageProductos.jsx";
import PageDepositos  from "./components/depositos/PageDepositos.jsx";
import PageClientes   from "./components/clientes/PageClientes.jsx";
import PageTesoreria  from "./components/tesoreria/PageTesoreria.jsx";
import PageGastos     from "./components/gastos/PageGastos.jsx";
import PageUsuarios   from "./components/usuarios/PageUsuarios.jsx";
import PageEtiquetas  from "./components/etiquetas/PageEtiquetas.jsx";
import PageReportes   from "./components/reportes/PageReportes.jsx";
import PageSincronizacion from "./components/sync/PageSincronizacion.jsx";
import PageLogin      from "./components/auth/PageLogin.jsx";
import ModalCambiarPassword from "./components/auth/ModalCambiarPassword.jsx";
import { ROL_LABEL } from "./constants/index.js";

const PAGES = [
  { id:"dashboard",  label:"Dashboard",   icon:"dashboard", section:"Principal" },
  { id:"ventas",     label:"Ventas",      icon:"receipt",   section:"Operaciones",   permiso:"verVentas" },
  { id:"compras",    label:"Compras",     icon:"box",       section:"Operaciones",   permiso:"verCompras" },
  { id:"caja",       label:"Caja",        icon:"cash",      section:"Operaciones",   permiso:"verCaja" },
  { id:"tesoreria",  label:"Tesorería",   icon:"lock",      section:"Operaciones",   permiso:"verTesoreria" },
  { id:"gastos",     label:"Gastos",      icon:"cash",      section:"Operaciones",   permiso:"verGastos" },
  { id:"reportes",   label:"Reportes",    icon:"chart",     section:"Operaciones",   permiso:"verCaja" },
  { id:"sincronizacion", label:"Sincronización", icon:"sync", section:"Operaciones" },
  { id:"productos",  label:"Productos",   icon:"chart",     section:"Inventario",    permiso:"verProductos" },
  { id:"etiquetas",  label:"Etiquetas",   icon:"tag",       section:"Inventario",    permiso:"verEtiquetas" },
  { id:"depositos",  label:"Depósitos",   icon:"box",       section:"Inventario",    permiso:"verDepositos" },
  { id:"clientes",   label:"Clientes",    icon:"users",     section:"Inventario",    permiso:"verClientes" },
  { id:"usuarios",   label:"Usuarios",    icon:"user",      section:"Configuración", permiso:"gestionarUsuarios" },
];

export default function App() {
  const [page,  setPage]  = useState("dashboard");
  const [theme, setTheme] = useLocalStorage("peco_theme", "dark");
  const [showCambiarPassword, setShowCambiarPassword] = useState(false);
  const { toast } = useToast();
  const isOnline = useConnectivity();
  const { pendientes: pendientesSync, fallidas: fallidasSync } = useOutboxStatus();

  // Apenas se confirma que volvió la conexión, disparar la sincronización de
  // lo que haya quedado en cola (ventas/retiros/refuerzos/recibos offline).
  useEffect(() => {
    if (isOnline) runSync();
  }, [isOnline]);

  // Aviso cuando OTRA PC modifica la caja (Realtime) — no cuando el cambio lo
  // originamos nosotros mismos.
  const onCambioCajaRemoto = useCallback((nuevo, anterior) => {
    if (nuevo.abierta && !anterior.abierta) {
      toast(`La caja fue abierta${nuevo.usuarioApertura ? ` por ${nuevo.usuarioApertura}` : ""} desde otra computadora.`, "info");
    } else if (!nuevo.abierta && anterior.abierta) {
      toast("La caja fue cerrada desde otra computadora.", "info");
    }
  }, [toast]);

  // Candado optimista de setCaja: nuestro cambio no se guardó porque otra PC
  // ya había escrito la caja primero (evita pisar retiros/apertura/cierre en
  // simultáneo sin darse cuenta).
  const onConflictoCaja = useCallback(() => {
    toast("La caja fue modificada desde otra PC justo antes — tu cambio no se aplicó. Volvé a intentarlo.", "warning");
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // ── Autenticación ──────────────────────────────────────────────────────
  const {
    session, usuarioActivo, usuarios, loadingAuth, errorAuth,
    login, logout, invitarUsuario, actualizarUsuario,
    cambiarPassword, resetearPassword, cargarUsuarios,
  } = useAuth();

  // Compatibilidad: todas las páginas usan permisos[usuarioActivo.id]?.key
  const permisos = useMemo(
    () => usuarioActivo ? { [usuarioActivo.id]: usuarioActivo.permisos || {} } : {},
    [usuarioActivo]
  );

  // ── Datos en Supabase ──────────────────────────────────────────────────
  const { productos, setProductos, loading: loadingProductos, agregarProducto, actualizarProducto, actualizarStock, aplicarDeltaStockProductoMultiple, eliminarProducto } = useProductos();
  const {
    clientes, setClientes,
    pagosCtaCte, setPagosCtaCte,
    loading: loadingClientes,
    error:   errorClientes,
    cargar:  recargarClientes,
    agregarCliente, actualizarCliente, agregarPagoCtaCte, eliminarPagoCtaCte,
    modificarConfigMora, registrarMoraCobrada, revertirMoraCobrada,
  } = useClientes();
  const {
    proveedores, setProveedores,
    loading: loadingProveedores,
    agregarProveedor, actualizarProveedor,
  } = useProveedores();
  const {
    compras, setCompras,
    ordenesPago, setOrdenesPago,
    loading: loadingCompras,
    agregarCompra, actualizarEstadoCompra, facturarRemito,
    agregarOrdenPago, anularOrdenPago,
  } = useCompras();
  const {
    ventas, setVentas,
    anulaciones, setAnulaciones,
    cambiosArticulo, setCambiosArticulo,
    loading: loadingVentas,
    error:   errorVentas,
    cargar: cargarVentas,
    agregarVenta, confirmarVenta, editarVenta, editarVentaConItems, anularVenta, registrarRetiroSeña, registrarPagoSeña, agregarCambioArticulo, anularCambioArticulo,
  } = useVentas();
  const {
    depositos,        setDepositos,
    stockDepositos,   setStockDepositos,
    movimientosStock, setMovimientosStock,
    pasesDeposito,    setPasesDeposito,
    loading: loadingDepositos,
    agregarDeposito, actualizarStockDeposito, actualizarStockDepositoMultiple, aplicarDeltaStockMultiple,
    registrarMovimiento, registrarPase, agregarPase, actualizarPase,
  } = useDepositos();
  const { recibos, setRecibos, loading: loadingRecibos, agregarRecibo, emitirRecibo, editarRecibo, anularRecibo } = useRecibos({ agregarPagoCtaCte, aplicarDeltaStockMultiple, registrarMoraCobrada });
  const { gastos, setGastos, loading: loadingGastos, agregarGasto, anularGasto } = useGastos();
  const { historialCierres, setHistorialCierres, loading: loadingCierres, guardarCierre } = useCajaHistorial();
  const { cheques, setCheques, loading: loadingCheques, agregarCheque, cambiarEstadoCheque } = useCheques();
  const {
    planCuentas, setPlanCuentas,
    asientosManuales, setAsientosManuales,
    tesoreria, setTesoreria,
    loading: loadingTesoreria,
    agregarCuenta, actualizarCuenta, agregarAsiento, eliminarAsiento,
    agregarMovimientoTesoreria, actualizarMovimientoTesoreria,
  } = useTesoreria();
  const {
    listas, setListas,
    configPrecios, setConfigPrecios,
    loading: loadingListas,
    agregarLista, actualizarLista, eliminarLista,
    actualizarConfigPrecios,
  } = useListasPrecios();
  const {
    promociones,
    agregarPromocion, actualizarPromocion, eliminarPromocion,
  } = usePromociones();
  const {
    rubros,
    nombresRubros,
    subrubrosDeRubro,
    loading: loadingRubros,
    agregarRubro, editarRubro, desactivarRubro,
    agregarSubrubro, editarSubrubro, desactivarSubrubro,
  } = useRubros();
  const {
    tarjetas,
    loading: loadingTarjetas,
    agregarTarjeta, editarTarjeta, desactivarTarjeta,
    agregarCuota, editarCuota, eliminarCuota,
  } = useTarjetas();
  const {
    reservas,
    loading: loadingReservas,
    crearReserva, agregarSeña, editarPreciosReserva, registrarRetiroReserva, cancelarReserva,
  } = useReservas();

  // ── Caja: estado global compartido en Supabase (Realtime entre PCs) ────
  const {
    caja, setCaja,
    retiros: retirosCaja, agregarRetiro, eliminarRetiro,
    refuerzos: refuerzosCaja, agregarRefuerzo,
    loading: loadingCaja, cargarRetirosRango,
  } = useCaja({ onCambioRemoto: onCambioCajaRemoto, onConflicto: onConflictoCaja });

  const {
    periodosCerrados,
    cerrarPeriodo, reabrirPeriodo,
  } = usePeriodosCerrados();

  // Migración única: "Períodos cerrados" vivía solo en localStorage de cada
  // PC (nunca se sincronizaba entre computadoras, ni sobrevivía a un cambio
  // de navegador) — ahora vive en la tabla `periodos_cerrados` de Supabase.
  // Este efecto sube, una sola vez, lo que haya quedado guardado localmente
  // en ESTA PC y que todavía no esté en la base (por mes), y limpia la
  // clave vieja para no reintentarlo en cada carga.
  useEffect(() => {
    const LEGACY_KEY = "peco_periodos_cerrados";
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    let legacy;
    try { legacy = JSON.parse(legacyRaw); } catch { legacy = null; }
    if (!Array.isArray(legacy) || legacy.length === 0) { localStorage.removeItem(LEGACY_KEY); return; }
    const yaExistentes = new Set(periodosCerrados.map(p => p.mes));
    const pendientes = legacy.filter(p => p.mes && !yaExistentes.has(p.mes));
    if (pendientes.length === 0) { localStorage.removeItem(LEGACY_KEY); return; }
    Promise.all(pendientes.map(p => cerrarPeriodo({
      mes: p.mes, cerrado: p.cerrado ?? true,
      cerradoPor: p.cerradoPor || null, fechaCierre: p.fechaCierre || null,
      reabiertoPor: p.reabiertoPor || null, fechaReapertura: p.fechaReapertura || null,
      resumen: p.resumen || {},
    }))).then(() => localStorage.removeItem(LEGACY_KEY))
      .catch(() => {}); // si falla (sin conexión), se reintenta en la próxima carga
  }, [periodosCerrados, cerrarPeriodo]);

  // ── Estado en localStorage ─────────────────────────────────────────────
  // ── Configuración global de mora ───────────────────────────────────────
  // Se guarda en Supabase (config_precios.config_mora) para que todas las
  // PCs usen la misma. La copia en localStorage queda como respaldo: se usa
  // mientras no carga la base, o si la columna todavía no existe.
  const [configMoraLocal, setConfigMoraLocal] = useLocalStorage("peco_config_mora", {
    diasGracia: 30, tipo: "mensual", pct: 5,
    escala: [], usarEscala: false, aplicarPagoA: "capital_primero",
    baseCalculo: "monto_total",
  });
  const configMora = configPrecios?.configMora || configMoraLocal;
  // Si falla la base (sin conexión o columna sin crear) queda guardada en
  // esta PC y se avisa — ConfigMora muestra el error.
  const setConfigMora = useCallback(async (nueva) => {
    setConfigMoraLocal(nueva);
    await actualizarConfigPrecios({ configMora: nueva });
  }, [actualizarConfigPrecios, setConfigMoraLocal]);

  // Migración única: si la base todavía no tiene config de mora pero esta PC
  // tenía una guardada en el navegador, se sube esa.
  useEffect(() => {
    if (loadingListas || configPrecios?.configMora !== null) return;
    if (localStorage.getItem("peco_config_mora") === null) return;
    actualizarConfigPrecios({ configMora: configMoraLocal }).catch(() => {});
  }, [loadingListas, configPrecios?.configMora]); // eslint-disable-line react-hooks/exhaustive-deps

  // Migración única: formasPago legacy (localStorage) → listas en memoria
  useEffect(() => {
    setListas(prev => {
      let cambio = false;
      let next = prev.map(l => {
        if (l.formaPago && !l.formasPago) {
          cambio = true;
          const { formaPago, ...resto } = l;
          return { ...resto, formasPago: [formaPago] };
        }
        return l;
      });
      const legacy = localStorage.getItem("peco_mapeo_pago_lista");
      if (legacy) {
        try {
          const mapeo = JSON.parse(legacy) || {};
          next = next.map(l => {
            const formaPago = Object.entries(mapeo).find(([, listaId]) => listaId === l.id)?.[0];
            if (!formaPago) return l;
            const formasPago = l.formasPago || [];
            if (formasPago.includes(formaPago)) return l;
            cambio = true;
            return { ...l, formasPago: [...formasPago, formaPago] };
          });
        } catch { /* mapeo corrupto */ }
        localStorage.removeItem("peco_mapeo_pago_lista");
      }
      return cambio ? next : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Permisos / navegación ──────────────────────────────────────────────
  const puedeGestionarUsuarios = !!permisos[usuarioActivo?.id]?.gestionarUsuarios;

  useEffect(() => {
    if (page === "usuarios" && !puedeGestionarUsuarios) setPage("dashboard");
  }, [page, puedeGestionarUsuarios]);

  const titles = {
    dashboard:"Dashboard", ventas:"Ventas", compras:"Compras", caja:"Caja",
    tesoreria:"Tesorería", gastos:"Gastos", reportes:"Reportes", productos:"Productos", etiquetas:"Etiquetas",
    depositos:"Depósitos", clientes:"Clientes", usuarios:"Usuarios", sincronizacion:"Sincronización",
  };

  // ── Guards: auth → perfil → datos ─────────────────────────────────────
  if (loadingAuth) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"var(--bg1)", flexDirection:"column", gap:16 }}>
        <div style={{ fontSize:32, fontWeight:800, color:"var(--accent)", letterSpacing:"-0.02em" }}>PECO'S</div>
        <div style={{ fontSize:14, color:"var(--text3)", letterSpacing:".05em" }}>Verificando sesión...</div>
      </div>
    );
  }

  if (!session) {
    return <PageLogin onLogin={login} onResetPassword={resetearPassword} errorAuth={errorAuth} />;
  }

  if (!usuarioActivo) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"var(--bg1)", flexDirection:"column", gap:16 }}>
        <div style={{ fontSize:32, fontWeight:800, color:"var(--accent)", letterSpacing:"-0.02em" }}>PECO'S</div>
        <div style={{ fontSize:13, color:"var(--red)", maxWidth:360, textAlign:"center" }}>
          {errorAuth || "No se encontró el perfil de usuario. Contactá al administrador."}
        </div>
        <button className="btn btn-ghost" onClick={logout}>Cerrar sesión</button>
      </div>
    );
  }

  // "Core" = lo que necesitan Ventas/Caja para funcionar — estos hooks tienen
  // caché local (offlineDb) y no se quedan colgados esperando a Supabase, así
  // que alcanza con esperarlos a ellos para mostrar la app. El resto
  // ("extra": Compras, Tesorería, Gastos, etc. — fuera del alcance offline)
  // no bloquea la pantalla principal; cada una de esas páginas se bloquea
  // sola si hace falta (ver SinConexion más abajo).
  const appLoadingCore  = loadingProductos || loadingClientes || loadingVentas || loadingDepositos || loadingRecibos || loadingListas || loadingCaja;
  const appLoadingExtra = loadingProveedores || loadingCompras || loadingGastos || loadingCierres || loadingCheques || loadingTesoreria || loadingRubros || loadingTarjetas || loadingReservas;
  const appError = errorClientes || errorVentas;
  if (appLoadingCore || appError) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"var(--bg1)", flexDirection:"column", gap:16 }}>
        <div style={{ fontSize:32, fontWeight:800, color:"var(--accent)", letterSpacing:"-0.02em" }}>PECO'S</div>
        {appLoadingCore && <div style={{ fontSize:14, color:"var(--text3)", letterSpacing:".05em" }}>Cargando datos...</div>}
        {appError && !appLoadingCore && (
          <>
            <div style={{ fontSize:13, color:"var(--red)", maxWidth:360, textAlign:"center" }}>
              Error al conectar: {appError}
            </div>
            <button className="btn btn-ghost" onClick={recargarClientes}>Reintentar</button>
          </>
        )}
      </div>
    );
  }

  // Página fuera del alcance offline (Compras, Tesorería, Gastos, Productos,
  // Depósitos, Usuarios) todavía cargando sus propios datos y sin conexión
  // real — no tiene caché, así que en vez de quedar en blanco o colgada se
  // muestra un estado explícito.
  const sinConexionExtra = !isOnline && appLoadingExtra;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <PageDashboard ventas={ventas} productos={productos} caja={caja} clientes={clientes} pagosCtaCte={pagosCtaCte} configMora={configMora} setPage={setPage} reservas={reservas} cambiosArticulo={cambiosArticulo}/>;
      case "ventas":    return <PageVentas ventas={ventas} setVentas={setVentas} clientes={clientes} setClientes={setClientes} productos={productos} setProductos={setProductos} caja={caja} setCaja={setCaja} usuarioActivo={usuarioActivo} permisos={permisos} listas={listas} setListas={setListas} agregarLista={agregarLista} actualizarLista={actualizarLista} eliminarLista={eliminarLista} configMora={configMora} configPrecios={configPrecios} actualizarConfigPrecios={actualizarConfigPrecios} depositos={depositos} stockDepositos={stockDepositos} cambiosArticulo={cambiosArticulo} setCambiosArticulo={setCambiosArticulo} pagosCtaCte={pagosCtaCte} setPagosCtaCte={setPagosCtaCte} periodosCerrados={periodosCerrados} anulaciones={anulaciones} setAnulaciones={setAnulaciones} agregarVenta={agregarVenta} confirmarVenta={confirmarVenta} editarVenta={editarVenta} editarVentaConItems={editarVentaConItems} anularVenta={anularVenta} registrarRetiroSeña={registrarRetiroSeña} registrarPagoSeña={registrarPagoSeña} agregarCambioArticulo={agregarCambioArticulo} anularCambioArticulo={anularCambioArticulo} actualizarStock={actualizarStock} agregarPagoCtaCte={agregarPagoCtaCte} eliminarPagoCtaCte={eliminarPagoCtaCte} aplicarDeltaStockMultiple={aplicarDeltaStockMultiple} aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple} registrarPase={registrarPase} rubros={rubros} proveedores={proveedores} tarjetas={tarjetas} promociones={promociones} agregarPromocion={agregarPromocion} actualizarPromocion={actualizarPromocion} eliminarPromocion={eliminarPromocion} recibos={recibos} agregarRecibo={agregarRecibo}/>;
      case "compras":   return sinConexionExtra ? <SinConexion seccion="Compras" /> : <PageCompras compras={compras} setCompras={setCompras} proveedores={proveedores} setProveedores={setProveedores} productos={productos} setProductos={setProductos} depositos={depositos} setStockDepositos={setStockDepositos} stockDepositos={stockDepositos} actualizarStockDepositoMultiple={actualizarStockDepositoMultiple} ordenesPago={ordenesPago} setOrdenesPago={setOrdenesPago} periodosCerrados={periodosCerrados} usuarioActivo={usuarioActivo} permisos={permisos} agregarProveedor={agregarProveedor} actualizarProveedor={actualizarProveedor} agregarCompra={agregarCompra} actualizarEstadoCompra={actualizarEstadoCompra} facturarRemito={facturarRemito} agregarOrdenPago={agregarOrdenPago} anularOrdenPago={anularOrdenPago} actualizarStock={actualizarStock} aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple} actualizarProducto={actualizarProducto} agregarProducto={agregarProducto} caja={caja} tesoreria={tesoreria} gastos={gastos} agregarRetiro={agregarRetiro} agregarMovimientoTesoreria={agregarMovimientoTesoreria} planCuentas={planCuentas}/>;
      case "caja":      return <PageCaja caja={caja} setCaja={setCaja} retiros={retirosCaja} agregarRetiro={agregarRetiro} eliminarRetiro={eliminarRetiro} refuerzos={refuerzosCaja} agregarRefuerzo={agregarRefuerzo} ventas={ventas} recibos={recibos} setRecibos={setRecibos} clientes={clientes} pagosCtaCte={pagosCtaCte} setPagosCtaCte={setPagosCtaCte} agregarPagoCtaCte={agregarPagoCtaCte} eliminarPagoCtaCte={eliminarPagoCtaCte} revertirMoraCobrada={revertirMoraCobrada} stockDepositos={stockDepositos} aplicarDeltaStockMultiple={aplicarDeltaStockMultiple} tesoreria={tesoreria} agregarMovimientoTesoreria={agregarMovimientoTesoreria} actualizarMovimientoTesoreria={actualizarMovimientoTesoreria} cambiosArticulo={cambiosArticulo} anulaciones={anulaciones} historialCierres={historialCierres} setHistorialCierres={setHistorialCierres} usuarioActivo={usuarioActivo} permisos={permisos} configMora={configMora} guardarCierre={guardarCierre} agregarRecibo={agregarRecibo} emitirRecibo={emitirRecibo} editarRecibo={editarRecibo} anularRecibo={anularRecibo} periodosCerrados={periodosCerrados} planCuentas={planCuentas} gastos={gastos} agregarGasto={agregarGasto} proveedores={proveedores}/>;
      case "tesoreria": return sinConexionExtra ? <SinConexion seccion="Tesorería" /> : <PageTesoreria tesoreria={tesoreria} agregarMovimientoTesoreria={agregarMovimientoTesoreria} actualizarMovimientoTesoreria={actualizarMovimientoTesoreria} ventas={ventas} compras={compras} recibos={recibos} ordenesPago={ordenesPago} gastos={gastos} cheques={cheques} setCheques={setCheques} clientes={clientes} proveedores={proveedores} planCuentas={planCuentas} setPlanCuentas={setPlanCuentas} asientosManuales={asientosManuales} periodosCerrados={periodosCerrados} cerrarPeriodo={cerrarPeriodo} reabrirPeriodo={reabrirPeriodo} cargarRetirosRango={cargarRetirosRango} usuarioActivo={usuarioActivo} permisos={permisos} productos={productos} agregarCheque={agregarCheque} cambiarEstadoCheque={cambiarEstadoCheque} agregarCuenta={agregarCuenta} actualizarCuenta={actualizarCuenta} agregarAsiento={agregarAsiento} eliminarAsiento={eliminarAsiento} tarjetas={tarjetas} agregarTarjeta={agregarTarjeta} editarTarjeta={editarTarjeta} desactivarTarjeta={desactivarTarjeta} agregarCuota={agregarCuota} editarCuota={editarCuota} eliminarCuota={eliminarCuota} pagosCtaCte={pagosCtaCte} cambiosArticulo={cambiosArticulo}/>;
      case "reportes":  return <PageReportes ventas={ventas} productos={productos} gastos={gastos} planCuentas={planCuentas} recibos={recibos} cargarRetirosRango={cargarRetirosRango}/>;
      case "sincronizacion": return <PageSincronizacion/>;
      case "gastos":    return sinConexionExtra ? <SinConexion seccion="Gastos" /> : <PageGastos gastos={gastos} setGastos={setGastos} planCuentas={planCuentas} proveedores={proveedores} periodosCerrados={periodosCerrados} caja={caja} tesoreria={tesoreria} compras={compras} agregarMovimientoTesoreria={agregarMovimientoTesoreria} agregarGasto={agregarGasto} anularGasto={anularGasto} agregarRetiro={agregarRetiro} usuarioActivo={usuarioActivo}/>;
      case "productos": return sinConexionExtra ? <SinConexion seccion="Productos" /> : <PageProductos
        productos={productos}           setProductos={setProductos}
        agregarProducto={agregarProducto}
        actualizarProducto={actualizarProducto}
        eliminarProducto={eliminarProducto}
        actualizarStock={actualizarStock}
        aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple}
        depositos={depositos}
        stockDepositos={stockDepositos}
        movimientosStock={movimientosStock}
        actualizarStockDeposito={actualizarStockDeposito}
        actualizarStockDepositoMultiple={actualizarStockDepositoMultiple}
        aplicarDeltaStockMultiple={aplicarDeltaStockMultiple}
        registrarMovimiento={registrarMovimiento}
        ventas={ventas}
        compras={compras}
        pasesDeposito={pasesDeposito}
        cambiosArticulo={cambiosArticulo}
        proveedores={proveedores}
        usuarioActivo={usuarioActivo}
        permisos={permisos}
        listas={listas}             setListas={setListas}
        agregarLista={agregarLista} actualizarLista={actualizarLista} eliminarLista={eliminarLista}
        configPrecios={configPrecios} setConfigPrecios={setConfigPrecios}
        actualizarConfigPrecios={actualizarConfigPrecios}
        rubros={rubros}
        nombresRubros={nombresRubros}
        subrubrosDeRubro={subrubrosDeRubro}
        agregarRubro={agregarRubro}
        editarRubro={editarRubro}
        desactivarRubro={desactivarRubro}
        agregarSubrubro={agregarSubrubro}
        editarSubrubro={editarSubrubro}
        desactivarSubrubro={desactivarSubrubro}
      />;
      case "etiquetas": return <PageEtiquetas
        productos={productos}
        listas={listas}
        configPrecios={configPrecios}
        rubros={rubros}
        proveedores={proveedores}
      />;
      case "depositos": return <PageDepositos
        depositos={depositos}           setDepositos={setDepositos}
        stockDepositos={stockDepositos} setStockDepositos={setStockDepositos}
        pasesDeposito={pasesDeposito}   setPasesDeposito={setPasesDeposito}
        productos={productos}
        usuarioActivo={usuarioActivo}
        permisos={permisos}
        configPrecios={configPrecios}
        agregarDeposito={agregarDeposito}
        actualizarStockDepositoMultiple={actualizarStockDepositoMultiple}
        agregarPase={agregarPase}
        actualizarPase={actualizarPase}
      />;
      case "clientes":  return <PageClientes clientes={clientes} setClientes={setClientes} ventas={ventas} pagosCtaCte={pagosCtaCte} setPagosCtaCte={setPagosCtaCte} cambiosArticulo={cambiosArticulo} configMora={configMora} setConfigMora={setConfigMora} recibos={recibos} setRecibos={setRecibos} caja={caja} usuarioActivo={usuarioActivo} permisos={permisos} agregarCliente={agregarCliente} actualizarCliente={actualizarCliente} modificarConfigMora={modificarConfigMora} agregarPagoCtaCte={agregarPagoCtaCte} agregarRecibo={agregarRecibo} emitirRecibo={emitirRecibo} productos={productos} depositos={depositos} stockDepositos={stockDepositos} listas={listas} configPrecios={configPrecios} rubros={rubros} proveedores={proveedores} agregarVenta={agregarVenta} cargarVentas={cargarVentas} registrarRetiroSeña={registrarRetiroSeña} registrarPagoSeña={registrarPagoSeña} actualizarStock={actualizarStock} actualizarStockDepositoMultiple={actualizarStockDepositoMultiple} aplicarDeltaStockMultiple={aplicarDeltaStockMultiple} aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple} reservas={reservas} crearReserva={crearReserva} agregarSeña={agregarSeña} editarPreciosReserva={editarPreciosReserva} registrarRetiroReserva={registrarRetiroReserva} cancelarReserva={cancelarReserva} editarVenta={editarVenta} editarVentaConItems={editarVentaConItems} anularVenta={anularVenta} periodosCerrados={periodosCerrados} tarjetas={tarjetas}/>;
      case "usuarios":  return puedeGestionarUsuarios ? (
        <PageUsuarios
          usuarios={usuarios}
          usuarioActivo={usuarioActivo}
          invitarUsuario={invitarUsuario}
          actualizarUsuario={actualizarUsuario}
          cargarUsuarios={cargarUsuarios}
          cambiarPassword={cambiarPassword}
        />
      ) : null;
      default: return null;
    }
  };

  let lastSection = null;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">P</div>
          <div>
            <div className="brand-text">PECO S.</div>
            <div className="brand-sub">Gestión Comercial</div>
          </div>
        </div>
        {PAGES.filter(p => !p.permiso || permisos[usuarioActivo.id]?.[p.permiso]).map(p => {
          const showSection = p.section !== lastSection;
          lastSection = p.section;
          return (
            <div key={p.id}>
              {showSection && <div className="nav-section">{p.section}</div>}
              <div className={`nav-item ${page === p.id ? "active" : ""}`} onClick={() => setPage(p.id)}>
                <Icon name={p.icon} size={16}/> {p.label}
                {p.id === "sincronizacion" && (pendientesSync + fallidasSync.length) > 0 && (
                  <span className={`badge ${fallidasSync.length > 0 ? "badge-danger" : "badge-warn"}`} style={{ marginLeft: "auto", fontSize: 10 }}>
                    {pendientesSync + fallidasSync.length}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <h1>{titles[page]}</h1>
            {page === "caja" && (
              <span className={`badge ${caja.abierta ? "badge-ok" : "badge-danger"}`} style={{ fontSize:11 }}>
                {caja.abierta ? "Abierta" : "Cerrada"}
              </span>
            )}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <DemoBanner />
            <div style={{ fontSize:12, color:"var(--text3)" }}>
              {new Date().toLocaleDateString("es-AR", { weekday:"long", day:"numeric", month:"long" })}
            </div>

            <button
              className={`badge ${!isOnline ? "badge-danger" : fallidasSync.length > 0 ? "badge-danger" : pendientesSync > 0 ? "badge-warn" : "badge-ok"}`}
              style={{ fontSize:11, cursor: (pendientesSync > 0 || fallidasSync.length > 0) ? "pointer" : "default", border: "none" }}
              onClick={() => {
                if (pendientesSync > 0 || fallidasSync.length > 0) setPage("sincronizacion");
              }}
              title={
                !isOnline ? "Sin conexión — los cambios se guardan localmente y se sincronizan solos al volver internet"
                : fallidasSync.length > 0 ? "Hay operaciones que no se pudieron sincronizar — hacé clic para ver el detalle"
                : pendientesSync > 0 ? "Sincronizando lo pendiente... hacé clic para ver el detalle" : "Todo sincronizado"
              }
            >
              {!isOnline
                ? "Sin conexión"
                : fallidasSync.length > 0
                  ? `⚠ ${fallidasSync.length} sin sincronizar`
                  : pendientesSync > 0
                    ? `Sincronizando (${pendientesSync})`
                    : "En línea"}
            </button>

            <SelectorImpresora />

            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15}/>
            </button>

            {/* Usuario activo */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 8px", borderRadius:8, background:"var(--bg3)", border:"1px solid var(--border)" }}>
              <div style={{
                width:26, height:26, borderRadius:"50%",
                background: usuarioActivo.color,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700, color:"#fff", flexShrink:0,
              }}>
                {usuarioActivo.nombre[0]}
              </div>
              <div style={{ lineHeight:1.2 }}>
                <div style={{ fontSize:13, color:"var(--text1)", fontWeight:500 }}>{usuarioActivo.nombre}</div>
                <div style={{ fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em" }}>
                  {ROL_LABEL[usuarioActivo.rol] || usuarioActivo.rol}
                </div>
              </div>
            </div>

            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setShowCambiarPassword(true)}
              title="Cambiar contraseña"
            >
              <Icon name="lock" size={14}/>
            </button>

            <button
              className="btn btn-sm btn-ghost"
              onClick={logout}
              title="Cerrar sesión"
            >
              <Icon name="close" size={14}/>
              <span style={{ fontSize:12 }}>Salir</span>
            </button>
          </div>
        </div>

        <div className="page-content">
          {renderPage()}
        </div>
      </div>

      {showCambiarPassword && (
        <ModalCambiarPassword
          onClose={() => setShowCambiarPassword(false)}
          onConfirm={cambiarPassword}
        />
      )}
    </div>
  );
}
