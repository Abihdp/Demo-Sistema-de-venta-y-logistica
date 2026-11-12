import { useState, useMemo, Fragment } from "react";
import Icon from "../ui/Icon.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, today, stockMinimo, precioBaseDe, normalizarCodigoEscaneado, coincideBusqueda, fmtFechaAR } from "../../utils/helpers.js";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import ModalProducto from "./ModalProducto.jsx";
import ModalMovimiento from "./ModalMovimiento.jsx";
import TabPrecios from "./TabPrecios.jsx";
import TabProyeccion from "./TabProyeccion.jsx";
import TabRubros from "./TabRubros.jsx";
import ModalProductoMadre from "./ModalProductoMadre.jsx";

const ORIGEN_LABEL = { manual:"Manual", venta:"Venta", pase:"Pase", cambio:"Cambio", compra:"Compra" };
const ORIGEN_BADGE  = { manual:"badge-accent", venta:"badge-blue", pase:"badge-warn", cambio:"badge-accent", compra:"badge-ok" };
const CATALOGO_PAGE_SIZE = 15;

export default function PageProductos({
  productos,         setProductos,
  agregarProducto,   actualizarProducto,  actualizarStock,  aplicarDeltaStockProductoMultiple,
  eliminarProducto,
  depositos,
  stockDepositos,
  movimientosStock,
  actualizarStockDeposito,
  actualizarStockDepositoMultiple,
  aplicarDeltaStockMultiple,
  registrarMovimiento,
  ventas = [],
  compras = [],
  pasesDeposito = [],
  cambiosArticulo = [],
  proveedores,
  usuarioActivo,
  permisos,
  listas, setListas,
  agregarLista, actualizarLista, eliminarLista,
  configPrecios, setConfigPrecios,
  actualizarConfigPrecios,
  rubros: rubrosDB = [],
  nombresRubros = [],
  subrubrosDeRubro,
  agregarRubro, editarRubro, desactivarRubro,
  agregarSubrubro, editarSubrubro, desactivarSubrubro,
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const esAdmin = !!permisos?.[usuarioActivo?.id]?.gestionarProductos;
  const margenBase = configPrecios?.margenBase ?? 0;
  const permitirStockNegativo = configPrecios?.permitirStockNegativo ?? false;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("catalogo");

  // ── Filtros catálogo ──────────────────────────────────────────────────────
  const [buscar,     setBuscar]    = useState("");
  const [fRubro,     setFRubro]    = useState("");
  const [fSubrubro,  setFSubrubro] = useState("");
  const [fEstado,    setFEstado]   = useState("activos");
  const [paginaCatalogo, setPaginaCatalogo] = useState(1);

  // ── Filtros movimientos ───────────────────────────────────────────────────
  const [fMov, setFMov] = useState({ tipo:"", origen:"", productoId:"", depositoId:"", desde:"", hasta:"" });
  const setFM = (k, v) => setFMov(f => ({ ...f, [k]: v }));

  // ── Filtros inventario ────────────────────────────────────────────────────
  const [fInvRubro, setFInvRubro] = useState("");

  // ── Modales ───────────────────────────────────────────────────────────────
  const [modalProducto,   setModalProducto]   = useState(null); // null | {} (nuevo) | producto (editar)
  const [modalMovimiento, setModalMovimiento] = useState(null); // null | { tipo, productoId? }
  const [verStockProd,       setVerStockProd]       = useState(null);
  const [expandidos,         setExpandidos]         = useState(new Set());
  const [modalProductoMadre, setModalProductoMadre] = useState(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getStockDep = (productoId, depositoId) => {
    const r = stockDepositos.find(s => s.productoId === productoId && s.depositoId === depositoId);
    return r ? r.cantidad : 0;
  };

  const rubrosEnUso = useMemo(() => [...new Set(productos.map(p => p.rubro || p.categoria).filter(Boolean))].sort(), [productos]);
  const subrubrosEnUso = useMemo(() => {
    if (!fRubro) return [];
    return [...new Set(productos.filter(p => (p.rubro || p.categoria) === fRubro).map(p => p.subrubro).filter(Boolean))].sort();
  }, [productos, fRubro]);

  const depositoTransito = depositos.find(d => d.tipo === "transito");

  const productoPorNombre = useMemo(() => {
    const map = new Map();
    productos.forEach(p => map.set(p.nombre, p));
    return map;
  }, [productos]);

  // ── Movimientos unificados: manuales + ventas + pases + cambios + compras ──
  const movimientosUnificados = useMemo(() => {
    const rows = [];

    // Manuales (entrada/salida desde esta misma página)
    (movimientosStock || []).forEach(m => {
      rows.push({
        id: `manual-${m.id}`, fecha: m.fecha, tipo: m.tipo, origen: "manual",
        productoId: m.productoId, productoNombre: m.productoNombre,
        depositoId: m.depositoId, depositoNombre: m.depositoNombre,
        cantidad: m.cantidad,
        detalle: m.motivo + (m.observacion ? ` — ${m.observacion}` : ""),
        usuario: m.usuario,
      });
    });

    // Ventas normales (la seña ya queda registrada como pase, no se duplica acá).
    // Una venta anulada revierte el stock directo (aplicarDeltaStockMultiple),
    // sin pasar por acá, así que no debe dejar esta "salida" fantasma sin su
    // entrada compensatoria.
    (ventas || []).forEach(v => {
      if (v.esSeña || !v.depositoId || v.estado === "anulada") return;
      (v.items || []).forEach((item, idx) => {
        rows.push({
          id: `venta-${v.id}-${idx}`, fecha: v.fecha, tipo: "salida", origen: "venta",
          productoId: productoPorNombre.get(item.nombre)?.id ?? null, productoNombre: item.nombre,
          depositoId: v.depositoId, depositoNombre: v.depositoNombre,
          cantidad: item.qty, detalle: `Venta #${v.id} — ${v.cliente}`, usuario: v.usuario,
        });
      });
    });

    // Compras facturadas (los remitos no actualizan stock). No tienen depósito
    // Compras y remitos que actualizaron stock. Una Factura generada al
    // facturar un remito (`remitoOrigen` seteado) no suma una entrada propia:
    // la mercadería ya entró con el remito original, esto solo le agrega el
    // dato fiscal — contarla de nuevo duplicaría la entrada de stock acá.
    (compras || []).forEach(c => {
      if (c.tipo !== "Factura" && !c.stockActualizado) return;
      if (c.tipo === "Factura" && c.remitoOrigen) return;
      const depNombre = c.depositoNombre
        || depositos.find(d => d.id === c.depositoId)?.nombre
        || "Sin depósito asignado";
      (c.items || []).forEach((item, idx) => {
        rows.push({
          id: `compra-${c.id}-${idx}`, fecha: c.fecha, tipo: "entrada", origen: "compra",
          productoId: item.productoId ?? productoPorNombre.get(item.nombre)?.id ?? null,
          productoNombre: item.nombre,
          depositoId: c.depositoId || null, depositoNombre: depNombre,
          cantidad: item.qty, detalle: `${c.tipo} ${c.nro} — ${c.proveedor}`, usuario: "",
        });
      });
    });

    // Pases de depósito
    (pasesDeposito || []).forEach(p => {
      if (Array.isArray(p.items)) {
        // Estilo "documento" (creado desde Depósitos): origen → tránsito → destino
        p.items.forEach((item, idx) => {
          rows.push({
            id: `pase-${p.id}-${idx}-origen`, fecha: p.fecha, tipo: "salida", origen: "pase",
            productoId: item.productoId, productoNombre: item.productoNombre,
            depositoId: p.depositoOrigenId, depositoNombre: p.depositoOrigenNombre,
            cantidad: item.cantidad, detalle: `Pase a ${p.depositoDestinoNombre}`, usuario: p.usuarioEnvio,
          });
          rows.push({
            id: `pase-${p.id}-${idx}-transito-in`, fecha: p.fecha, tipo: "entrada", origen: "pase",
            productoId: item.productoId, productoNombre: item.productoNombre,
            depositoId: depositoTransito?.id, depositoNombre: depositoTransito?.nombre || "Depósito Tránsito",
            cantidad: item.cantidad, detalle: `En tránsito hacia ${p.depositoDestinoNombre}`, usuario: p.usuarioEnvio,
          });
          if (p.estado === "recibido") {
            rows.push({
              id: `pase-${p.id}-${idx}-transito-out`, fecha: p.fechaRecepcion, tipo: "salida", origen: "pase",
              productoId: item.productoId, productoNombre: item.productoNombre,
              depositoId: depositoTransito?.id, depositoNombre: depositoTransito?.nombre || "Depósito Tránsito",
              cantidad: item.cantidad, detalle: `Recepcionado en ${p.depositoDestinoNombre}`, usuario: p.usuarioRecepcion,
            });
            rows.push({
              id: `pase-${p.id}-${idx}-destino`, fecha: p.fechaRecepcion, tipo: "entrada", origen: "pase",
              productoId: item.productoId, productoNombre: item.productoNombre,
              depositoId: p.depositoDestinoId, depositoNombre: p.depositoDestinoNombre,
              cantidad: item.cantidad, detalle: `Pase desde ${p.depositoOrigenNombre}`, usuario: p.usuarioRecepcion,
            });
          } else if (p.estado === "anulado") {
            const fechaAnul = p.fechaAnulacion || p.fecha;
            rows.push({
              id: `pase-${p.id}-${idx}-anulado-out`, fecha: fechaAnul, tipo: "salida", origen: "pase",
              productoId: item.productoId, productoNombre: item.productoNombre,
              depositoId: depositoTransito?.id, depositoNombre: depositoTransito?.nombre || "Depósito Tránsito",
              cantidad: item.cantidad, detalle: `Pase anulado — vuelve a ${p.depositoOrigenNombre}`, usuario: p.usuarioEnvio,
            });
            rows.push({
              id: `pase-${p.id}-${idx}-anulado-in`, fecha: fechaAnul, tipo: "entrada", origen: "pase",
              productoId: item.productoId, productoNombre: item.productoNombre,
              depositoId: p.depositoOrigenId, depositoNombre: p.depositoOrigenNombre,
              cantidad: item.cantidad, detalle: "Pase anulado — vuelve de tránsito", usuario: p.usuarioEnvio,
            });
          }
        });
      } else if (p.productoId) {
        // Estilo "plano" (seña de venta, creado desde Ventas): origen ↔ destino, mismo día
        rows.push({
          id: `pase-${p.id}-origen`, fecha: p.fecha, tipo: "salida", origen: "pase",
          productoId: p.productoId, productoNombre: p.productoNombre,
          depositoId: p.depositoOrigenId, depositoNombre: p.depositoOrigenNombre,
          cantidad: p.cantidad, detalle: p.motivo || `Pase a ${p.depositoDestinoNombre}`, usuario: p.usuario,
        });
        rows.push({
          id: `pase-${p.id}-destino`, fecha: p.fecha, tipo: "entrada", origen: "pase",
          productoId: p.productoId, productoNombre: p.productoNombre,
          depositoId: p.depositoDestinoId, depositoNombre: p.depositoDestinoNombre,
          cantidad: p.cantidad, detalle: p.motivo || `Pase desde ${p.depositoOrigenNombre}`, usuario: p.usuario,
        });
      }
    });

    // Cambios de artículo (devolución del viejo + descuento del nuevo).
    // Los anulados no dejan movimiento — el stock ya vuelve a su valor original.
    (cambiosArticulo || []).filter(c => c.estado !== "anulada").forEach(c => {
      const depositoNombreCambio = depositos.find(d => d.id === c.depositoId)?.nombre || "—";
      if (c.itemViejo?.productoId) {
        rows.push({
          id: `cambio-${c.id}-devuelto`, fecha: c.fecha, tipo: "entrada", origen: "cambio",
          productoId: c.itemViejo.productoId, productoNombre: c.itemViejo.nombre,
          depositoId: c.depositoId, depositoNombre: depositoNombreCambio,
          cantidad: c.itemViejo.qty, detalle: `Cambio ${c.nro} — devolución`, usuario: c.usuario,
        });
      }
      if (c.productoNuevo?.id) {
        rows.push({
          id: `cambio-${c.id}-nuevo`, fecha: c.fecha, tipo: "salida", origen: "cambio",
          productoId: c.productoNuevo.id, productoNombre: c.productoNuevo.nombre || "",
          depositoId: c.depositoId, depositoNombre: depositoNombreCambio,
          cantidad: c.qtyNuevo, detalle: `Cambio ${c.nro} — artículo nuevo`, usuario: c.usuario,
        });
      }
    });

    return rows;
  }, [movimientosStock, ventas, compras, pasesDeposito, cambiosArticulo, productoPorNombre, depositos, depositoTransito]);

  // ── Catálogo filtrado ──────────────────────────────────────────────────────
  const variantesPorMadre = useMemo(() => {
    const mapa = {};
    productos.forEach(p => {
      if (p.tipo === "variante" && p.productoMadreId) {
        if (!mapa[p.productoMadreId]) mapa[p.productoMadreId] = [];
        mapa[p.productoMadreId].push(p);
      }
    });
    return mapa;
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const txt = normalizarCodigoEscaneado((buscar || "").toLowerCase());
    return productos.filter(p => {
      if (p.tipo === "variante") return false;
      const pRubro = p.rubro || p.categoria || "";
      if (fRubro && pRubro !== fRubro) return false;
      if (fSubrubro && (p.subrubro || "") !== fSubrubro) return false;
      if (fEstado === "activos"   && p.activo === false) return false;
      if (fEstado === "inactivos" && p.activo !== false) return false;
      if (txt) {
        const selfMatch = coincideBusqueda([p.nombre, p.codigo].join(" "), txt);
        if (!selfMatch) {
          const vars = variantesPorMadre[p.id] || [];
          const varMatch = vars.some(v => coincideBusqueda([v.nombre, v.codigo].join(" "), txt));
          if (!varMatch) return false;
        }
      }
      return true;
    });
  }, [productos, variantesPorMadre, buscar, fRubro, fSubrubro, fEstado]);

  // El catálogo completo es muy largo para mostrarlo de una: solo se lista
  // una vez que se busca o se elige un rubro/subrubro, y paginado de a 15.
  const hayFiltroCatalogo = buscar.trim() !== "" || fRubro !== "" || fSubrubro !== "";
  const totalPaginasCatalogo = Math.max(1, Math.ceil(productosFiltrados.length / CATALOGO_PAGE_SIZE));
  const paginaCatalogoActual = Math.min(paginaCatalogo, totalPaginasCatalogo);
  const productosCatalogoPagina = useMemo(
    () => hayFiltroCatalogo
      ? productosFiltrados.slice((paginaCatalogoActual - 1) * CATALOGO_PAGE_SIZE, paginaCatalogoActual * CATALOGO_PAGE_SIZE)
      : [],
    [productosFiltrados, paginaCatalogoActual, hayFiltroCatalogo]
  );

  const setBuscarCatalogo = (v) => { setBuscar(v); setPaginaCatalogo(1); };
  const setFRubroCatalogo = (v) => { setFRubro(v); setFSubrubro(""); setPaginaCatalogo(1); };
  const setFSubrubroCatalogo = (v) => { setFSubrubro(v); setPaginaCatalogo(1); };
  const setFEstadoCatalogo = (v) => { setFEstado(v); setPaginaCatalogo(1); };

  // ── Movimientos filtrados ──────────────────────────────────────────────────
  const movFiltrados = useMemo(() => movimientosUnificados.filter(m => {
    if (fMov.tipo       && m.tipo       !== fMov.tipo)                    return false;
    if (fMov.origen     && m.origen     !== fMov.origen)                  return false;
    if (fMov.productoId && m.productoId !== Number(fMov.productoId))      return false;
    if (fMov.depositoId && m.depositoId !== Number(fMov.depositoId))      return false;
    if (fMov.desde      && m.fecha < fMov.desde)                          return false;
    if (fMov.hasta      && m.fecha > fMov.hasta)                          return false;
    return true;
  }).slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)),
  [movimientosUnificados, fMov]);

  const { pagina: paginaMov, setPagina: setPaginaMov, totalPaginas: totalPaginasMov, itemsPagina: movFiltradosPagina, pageSize: pageSizeMov } = usePaginacion(movFiltrados);

  // ── Datos de inventario ────────────────────────────────────────────────────
  const invData = useMemo(() => {
    const base = productos.filter(p => p.activo !== false && (p.tipo || "simple") !== "madre");
    const items = fInvRubro ? base.filter(p => (p.rubro || p.categoria) === fInvRubro) : base;
    const byRubro = {};
    items.forEach(p => {
      const r = p.rubro || p.categoria || "Sin rubro";
      if (!byRubro[r]) byRubro[r] = { costo:0, precio:0, unidades:0, qty:0 };
      byRubro[r].costo    += p.costo * p.stock;
      byRubro[r].precio   += precioBaseDe(p, margenBase, rubrosDB, proveedores) * p.stock;
      byRubro[r].unidades += p.stock;
      byRubro[r].qty      += 1;
    });
    const totalCosto  = items.reduce((s, p) => s + p.costo * p.stock, 0);
    const totalPrecio = items.reduce((s, p) => s + precioBaseDe(p, margenBase, rubrosDB, proveedores) * p.stock, 0);
    const totalUnid   = items.reduce((s, p) => s + p.stock, 0);
    return { byRubro, totalCosto, totalPrecio, totalUnid, items };
  }, [productos, fInvRubro, margenBase, rubrosDB, proveedores]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  // Arma, para un lote de productos recién insertados, los cambios de stock por
  // depósito (todo en 0 salvo el depósito elegido, que recibe stockInicial) y
  // los movimientos de "Carga inicial" para que quede auditado como cualquier
  // otro movimiento de stock. `fuente` y `insertados` deben estar en el mismo
  // orden (vienen de mapear el mismo array con Promise.all).
  const construirCargaInicial = (fuente, insertados) => {
    const cambios = [];
    const movimientos = [];
    insertados.forEach((prod, i) => {
      const v = fuente[i];
      const cantidad = Number(v.stockInicial) || 0;
      depositos.forEach(d => {
        cambios.push({ productoId: prod.id, depositoId: d.id, cantidad: d.id === v.depositoInicialId ? cantidad : 0 });
      });
      if (cantidad > 0 && v.depositoInicialId) {
        movimientos.push({
          fecha: today(),
          productoId: prod.id,
          depositoId: v.depositoInicialId,
          tipo: "entrada",
          origen: "manual",
          origenId: null,
          cantidad,
          stockAntes: 0,
          stockDespues: cantidad,
          motivo: "Carga inicial",
          usuario: usuarioActivo?.nombre || "",
        });
      }
    });
    return { cambios, movimientos };
  };

  const handleGuardarProducto = async (data) => {
    const { aplicarCostoATodasVariantes, stockInicial, depositoInicialId, ...productoData } = data;
    try {
      if (productoData.id) {
        await actualizarProducto(productoData.id, productoData);
        if (aplicarCostoATodasVariantes && productoData.productoMadreId) {
          const relacionados = productos.filter(p => p.productoMadreId === productoData.productoMadreId && p.id !== productoData.id);
          if (relacionados.length > 0) {
            const resultados = await Promise.allSettled(
              relacionados.map(p => actualizarProducto(p.id, { costo: productoData.costo }))
            );
            const fallidos = resultados.filter(r => r.status === "rejected").length;
            if (fallidos > 0) toast(`Costo actualizado, pero falló en ${fallidos} variante${fallidos !== 1 ? "s" : ""} relacionada${fallidos !== 1 ? "s" : ""}.`, "warning");
            else toast(`Costo aplicado a ${relacionados.length} variante${relacionados.length !== 1 ? "s" : ""} relacionada${relacionados.length !== 1 ? "s" : ""}.`, "success");
          }
        }
      } else {
        const cantidadInicial = Number(stockInicial) || 0;
        const nuevo = await agregarProducto({ ...productoData, stock: cantidadInicial, activo: true });
        if (depositos.length && actualizarStockDepositoMultiple) {
          const cambios = depositos.map(d => ({ productoId: nuevo.id, depositoId: d.id, cantidad: d.id === depositoInicialId ? cantidadInicial : 0 }));
          actualizarStockDepositoMultiple(cambios).catch(() => {});
        }
        if (cantidadInicial > 0 && depositoInicialId && registrarMovimiento) {
          registrarMovimiento({
            fecha: today(),
            productoId: nuevo.id,
            depositoId: depositoInicialId,
            tipo: "entrada",
            origen: "manual",
            origenId: null,
            cantidad: cantidadInicial,
            stockAntes: 0,
            stockDespues: cantidadInicial,
            motivo: "Carga inicial",
            usuario: usuarioActivo?.nombre || "",
          }).catch(() => {});
        }
      }
      setModalProducto(null);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handleToggleActivo = async (p) => {
    try {
      await actualizarProducto(p.id, { activo: !p.activo });
    } catch (e) {
      toast(e.message, "error");
    }
  };

  // Solo se puede borrar definitivamente un producto sin stock cargado y sin
  // ningún movimiento asociado (ventas, compras/remitos, movimientos de stock,
  // pases entre depósitos, cambios de artículo). Si tiene algo de eso, la
  // opción queda deshabilitada y hay que inhabilitarlo en su lugar.
  const motivoNoEliminar = (p) => {
    if (p.tipo === "madre" && (variantesPorMadre[p.id]?.length || 0) > 0) {
      return "Es una familia con variantes — eliminá primero cada variante.";
    }
    if ((p.stock || 0) > 0) {
      return "Tiene stock cargado y no se puede eliminar. Podés inhabilitarlo.";
    }
    if (movimientosUnificados.some(m => m.productoId === p.id)) {
      return "Tiene movimientos registrados (ventas, compras, remitos, etc.) y no se puede eliminar. Podés inhabilitarlo.";
    }
    return null;
  };

  const handleEliminarProducto = async (p) => {
    const motivo = motivoNoEliminar(p);
    if (motivo) { toast(motivo, "warning"); return; }
    if (!await confirm(`¿Eliminar definitivamente "${p.nombre}" (${p.codigo})? Esta acción no se puede deshacer.`, { danger: true, confirmLabel: "Eliminar" })) return;
    try {
      await eliminarProducto(p.id);
      toast(`"${p.nombre}" eliminado.`, "success");
    } catch (e) {
      toast("Error al eliminar: " + e.message, "error");
    }
  };

  const handleGuardarProductoMadre = async ({ madre, variantes }) => {
    try {
      if (madre.id) {
        // Edición: preservar stock de variantes existentes
        const stockPorId = {};
        productos.filter(p => p.productoMadreId === madre.id).forEach(p => { stockPorId[p.id] = p.stock; });

        const viejasIds = new Set(productos.filter(p => p.productoMadreId === madre.id).map(p => p.id));
        const nuevasIds = new Set(variantes.filter(v => v.id).map(v => v.id));
        const removedIds = [...viejasIds].filter(id => !nuevasIds.has(id));

        await actualizarProducto(madre.id, { ...madre, tipo: "madre", stock: 0 });
        await Promise.all(removedIds.map(id => actualizarProducto(id, { activo: false })));
        await Promise.all(
          variantes.filter(v => v.id).map(v =>
            actualizarProducto(v.id, { ...v, tipo: "variante", productoMadreId: madre.id, stock: stockPorId[v.id] ?? 0 })
          )
        );

        const nuevasVariantes = variantes.filter(v => !v.id);
        const insertadas = await Promise.all(
          nuevasVariantes.map(v => agregarProducto({ ...v, tipo: "variante", productoMadreId: madre.id, stock: Number(v.stockInicial) || 0, activo: true }))
        );

        if (insertadas.length > 0) {
          const { cambios, movimientos } = construirCargaInicial(nuevasVariantes, insertadas);
          if (cambios.length && actualizarStockDepositoMultiple) actualizarStockDepositoMultiple(cambios).catch(() => {});
          if (registrarMovimiento) movimientos.forEach(m => registrarMovimiento(m).catch(() => {}));
        }
      } else {
        // Nueva madre + variantes
        const nuevaMadre = await agregarProducto({ ...madre, tipo: "madre", stock: 0, activo: true });
        const insertadas = await Promise.all(
          variantes.map(v => agregarProducto({ ...v, tipo: "variante", productoMadreId: nuevaMadre.id, stock: Number(v.stockInicial) || 0, activo: true }))
        );

        if (depositos.length && actualizarStockDepositoMultiple) {
          const cambiosMadre = depositos.map(d => ({ productoId: nuevaMadre.id, depositoId: d.id, cantidad: 0 }));
          actualizarStockDepositoMultiple(cambiosMadre).catch(() => {});
        }
        const { cambios, movimientos } = construirCargaInicial(variantes, insertadas);
        if (cambios.length && actualizarStockDepositoMultiple) actualizarStockDepositoMultiple(cambios).catch(() => {});
        if (registrarMovimiento) movimientos.forEach(m => registrarMovimiento(m).catch(() => {}));
      }

      setModalProductoMadre(null);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const handleMovimiento = async (data) => {
    const prod   = productos.find(p => p.id === data.productoId);
    const delta  = data.tipo === "entrada" ? data.cantidad : -data.cantidad;
    const sdAct  = stockDepositos.find(s => s.productoId === data.productoId && s.depositoId === data.depositoId);
    const stockAntes   = sdAct?.cantidad || 0;
    const stockDespues = permitirStockNegativo ? stockAntes + delta : Math.max(0, stockAntes + delta);
    // Delta ya recortado a lo que realmente se aplica cuando no se permite
    // stock negativo (una "salida" mayor al stock disponible no debe mandar
    // el delta completo al RPC, solo hasta llegar a 0).
    const deltaDeposito = stockDespues - stockAntes;
    const stockTotalAntes   = prod?.stock || 0;
    const stockTotalDespues = permitirStockNegativo ? stockTotalAntes + delta : Math.max(0, stockTotalAntes + delta);
    const deltaTotal = stockTotalDespues - stockTotalAntes;

    try {
      await registrarMovimiento({
        fecha:         today(),
        productoId:    data.productoId,
        depositoId:    data.depositoId,
        tipo:          data.tipo,
        origen:        "manual",
        origenId:      null,
        cantidad:      data.cantidad,
        stockAntes,
        stockDespues,
        motivo:        data.motivo,
        usuario:       usuarioActivo?.nombre || "",
      });
    } catch (e) {
      toast(`Error al registrar movimiento: ${e.message}`, "error");
      return;
    }

    // Delta atómico (no absoluto calculado acá) tanto para el depósito como
    // para el total — así un movimiento manual no pisa una venta/compra del
    // mismo producto que se esté procesando en simultáneo desde otra PC.
    try {
      if (aplicarDeltaStockMultiple) {
        await aplicarDeltaStockMultiple([{ productoId: data.productoId, depositoId: data.depositoId, delta: deltaDeposito }]);
      } else {
        await actualizarStockDeposito(data.productoId, data.depositoId, stockDespues);
      }
    } catch (e) {
      toast(`Movimiento registrado. Error al actualizar stock en depósito: ${e.message}`, "warning");
    }

    try {
      if (aplicarDeltaStockProductoMultiple) {
        await aplicarDeltaStockProductoMultiple([{ productoId: data.productoId, delta: deltaTotal }]);
      } else {
        await actualizarStock(data.productoId, stockTotalDespues);
      }
    } catch (e) {
      toast(`Movimiento registrado. Error al actualizar stock total: ${e.message}`, "warning");
    }

    setModalMovimiento(null);
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const downloadCSV = (csv, nombre) => {
    const blob = new Blob(["﻿sep=,\n" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = nombre; a.click();
    URL.revokeObjectURL(url);
  };

  const exportarStock = () => {
    const headers = ["Código", "Nombre", "Rubro", "Subrubro", "Stock Total", ...depositos.map(d => d.nombre)];
    const rows = productos.map(p => [
      p.codigo, `"${p.nombre}"`, p.rubro || p.categoria || "", p.subrubro || "", p.stock,
      ...depositos.map(d => getStockDep(p.id, d.id)),
    ]);
    downloadCSV([headers, ...rows].map(r => r.join(",")).join("\n"), `stock_${today()}.csv`);
  };

  const exportarMovimientos = () => {
    const headers = ["Fecha", "Producto", "Tipo", "Cantidad", "Depósito", "Origen", "Detalle", "Usuario"];
    const rows = movFiltrados.map(m => [
      fmtFechaAR(m.fecha), `"${m.productoNombre}"`, m.tipo, m.cantidad,
      `"${m.depositoNombre}"`, ORIGEN_LABEL[m.origen] || m.origen, `"${m.detalle || ""}"`, m.usuario || "",
    ]);
    downloadCSV([headers, ...rows].map(r => r.join(",")).join("\n"), `movimientos_${today()}.csv`);
  };

  const exportarInventario = () => {
    const headers = ["Rubro", "Subrubro", "Código", "Nombre", "Color", "Talle", "Stock", "Costo Unit.", "Precio Unit.", "Total Costo", "Total Precio", "Margen %"];
    const rows = invData.items.map(p => {
      const precioBase = precioBaseDe(p, margenBase, rubrosDB, proveedores);
      const margen = p.costo > 0 ? Math.round(((precioBase - p.costo) / p.costo) * 100) : 0;
      return [p.rubro || p.categoria || "", p.subrubro || "", p.codigo, `"${p.nombre}"`, p.color, p.talle, p.stock, p.costo, precioBase, p.costo * p.stock, precioBase * p.stock, margen];
    });
    downloadCSV([headers, ...rows].map(r => r.join(",")).join("\n"), `inventario_${today()}.csv`);
  };

  const importarStock = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const allLines = ev.target.result.replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter(Boolean);
      const skipCount = allLines[0]?.toLowerCase().startsWith("sep=") ? 2 : 1;
      const lines = allLines.slice(skipCount);
      if (lines.length === 0) { toast("Archivo vacío o sin datos.", "error"); return; }
      let errores = 0;
      for (const line of lines) {
        const cols     = line.split(",");
        const codigo   = cols[0]?.replace(/"/g, "").trim();
        const prod     = productos.find(p => p.codigo === codigo);
        if (!prod) continue;
        // Columnas: Código, Nombre, Rubro, Subrubro, Stock Total, <un depósito por columna>
        const stockTotal = parseInt(cols[4]) || 0;
        try {
          await actualizarStock(prod.id, stockTotal);
        } catch {
          errores++;
        }
        if (actualizarStockDepositoMultiple) {
          const cambios = depositos.map((dep, i) => ({
            productoId: prod.id,
            depositoId: dep.id,
            cantidad:   parseInt(cols[5 + i]) || 0,
          }));
          actualizarStockDepositoMultiple(cambios).catch(() => { errores++; });
        }
      }
      if (errores > 0) toast(`Importación completada con ${errores} error(es) al guardar.`, "warn");
      else toast("Importación completada.", "success");
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  // ── Badge de estado ────────────────────────────────────────────────────────
  const stockBadge = (p) => {
    if (p.activo === false)
      return <span className="badge" style={{background:"rgba(92,91,110,0.15)",color:"var(--text3)"}}>Inactivo</span>;
    if (p.stock === 0) return <span className="badge badge-danger">Sin stock</span>;
    if (p.stock < stockMinimo(p)) return <span className="badge badge-warn">Stock bajo</span>;
    return <span className="badge badge-ok">OK</span>;
  };

  const TAB_STYLE = (id) => ({
    borderBottom: tab === id ? "2px solid var(--accent)" : "2px solid transparent",
    borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
    color:        tab === id ? "var(--accent2)" : "var(--text2)",
    gap:6, paddingBottom:10,
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Tabs ── */}
      <div style={{display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid var(--border)"}}>
        {[
          { id:"catalogo",     label:"Catálogo",    icon:"box"     },
          { id:"movimientos",  label:"Movimientos", icon:"receipt" },
          { id:"inventario",   label:"Inventario",  icon:"chart"   },
          { id:"proyeccion",   label:"Proyección",  icon:"chart"   },
          ...(esAdmin ? [{ id:"rubros", label:"Rubros", icon:"tag" }] : []),
          ...(esAdmin ? [{ id:"precios", label:"Precios", icon:"tag" }] : []),
        ].map(t => (
          <button key={t.id} className="btn btn-sm btn-ghost" style={TAB_STYLE(t.id)} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14}/> {t.label}
            {t.id === "movimientos" && movimientosUnificados.length > 0 && (
              <span style={{
                background:"var(--bg4)", borderRadius:99, padding:"1px 7px",
                fontSize:10, color:"var(--text3)", marginLeft:2,
              }}>
                {movimientosUnificados.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: CATÁLOGO
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "catalogo" && (
        <div>
          {/* Toolbar */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
              <div style={{position:"relative", flex:1, minWidth:200}}>
                <Icon name="search" size={14} style={{
                  position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--text3)"
                }}/>
                <input
                  className="form-input"
                  style={{paddingLeft:32}}
                  placeholder="Buscar nombre o código..."
                  value={buscar}
                  onChange={e => setBuscarCatalogo(e.target.value)}
                />
              </div>
              <select className="form-select" style={{width:"auto"}} value={fRubro}
                onChange={e => setFRubroCatalogo(e.target.value)}>
                <option value="">Todos los rubros</option>
                {rubrosEnUso.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {fRubro && subrubrosEnUso.length > 0 && (
                <select className="form-select" style={{width:"auto"}} value={fSubrubro} onChange={e => setFSubrubroCatalogo(e.target.value)}>
                  <option value="">Todos los subrubros</option>
                  {subrubrosEnUso.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <select className="form-select" style={{width:"auto"}} value={fEstado} onChange={e => setFEstadoCatalogo(e.target.value)}>
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
                <option value="todos">Todos</option>
              </select>
              {esAdmin && (
                <div style={{marginLeft:"auto", display:"flex", gap:6}}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setModalProductoMadre({})}>
                    <Icon name="plus" size={14}/> Con variantes
                  </button>
                  <button className="btn btn-sm btn-primary"
                    onClick={() => setModalProducto({})}>
                    <Icon name="plus" size={14}/> Nuevo producto
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tabla catálogo */}
          <div className="card">
            <div style={{
              fontSize:11, color:"var(--text3)", marginBottom:10,
              display:"flex", justifyContent:"flex-end",
            }}>
              {hayFiltroCatalogo
                ? `${productosFiltrados.length} producto${productosFiltrados.length !== 1 ? "s" : ""}`
                : `${productos.length} productos en el catálogo`}
            </div>
            {!hayFiltroCatalogo ? (
              <div style={{textAlign:"center", padding:"48px 20px", color:"var(--text3)"}}>
                <Icon name="search" size={28}/>
                <div style={{marginTop:10, fontSize:13}}>
                  Buscá por nombre/código o elegí un rubro para ver el catálogo
                </div>
              </div>
            ) : (
            <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Rubro / Subrubro</th>
                    <th>Color / Talle</th>
                    <th>Stock</th>
                    <th>Costo</th>
                    <th>Precio base</th>
                    <th>Margen</th>
                    <th>Estado</th>
                    {esAdmin && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={esAdmin ? 10 : 9} style={{textAlign:"center", color:"var(--text3)", padding:40}}>
                        Sin resultados para los filtros aplicados
                      </td>
                    </tr>
                  )}
                  {productosCatalogoPagina.map(p => {
                    const esMadre  = p.tipo === "madre";
                    const variantes = esMadre ? (variantesPorMadre[p.id] || []) : [];
                    const expandido = expandidos.has(p.id);
                    const precioBaseP = precioBaseDe(p, margenBase, rubrosDB, proveedores);
                    const margen    = (!esMadre && p.costo > 0) ? Math.round(((precioBaseP - p.costo) / p.costo) * 100) : null;
                    return (
                      <Fragment key={p.id}>
                        <tr style={{ opacity: p.activo === false ? 0.5 : 1, background: esMadre ? "var(--bg4)" : undefined }}>
                          <td className="mono" style={{color:"var(--text3)", fontSize:12}}>
                            {esMadre ? (
                              <div style={{display:"flex", alignItems:"center", gap:4}}>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  style={{padding:"0 4px", minWidth:18, fontSize:11}}
                                  onClick={() => setExpandidos(prev => {
                                    const s = new Set(prev);
                                    s.has(p.id) ? s.delete(p.id) : s.add(p.id);
                                    return s;
                                  })}
                                >
                                  {expandido ? "▼" : "▶"}
                                </button>
                                {p.codigo}
                              </div>
                            ) : p.codigo}
                          </td>
                          <td style={{color:"var(--text1)", fontWeight:500}}>
                            {p.nombre}
                            {esMadre && (
                              <span className="badge badge-blue" style={{marginLeft:6, fontSize:10}}>
                                Familia · {variantes.length} variante{variantes.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-accent">{p.rubro || p.categoria || "—"}</span>
                            {p.subrubro && <span style={{fontSize:11, color:"var(--text3)", marginLeft:4}}>{p.subrubro}</span>}
                          </td>
                          <td style={{color:"var(--text2)", fontSize:12}}>
                            {esMadre ? "—" : (p.color + (p.talle ? ` / ${p.talle}` : ""))}
                          </td>
                          <td>
                            {esMadre ? (
                              <span className="mono" style={{color:"var(--text3)"}}>
                                {variantes.reduce((a, v) => a + (v.stock || 0), 0)}
                              </span>
                            ) : (
                              <span
                                className="mono"
                                title="Ver stock por depósito"
                                onClick={() => setVerStockProd(p)}
                                style={{
                                  cursor:"pointer", textDecoration:"underline dotted",
                                  color: p.stock === 0 ? "var(--text3)" : "var(--text1)",
                                  fontWeight: p.stock > 0 ? 600 : 400,
                                }}
                              >
                                {p.stock}
                              </span>
                            )}
                          </td>
                          <td style={{color:"var(--text2)"}}>{esMadre ? "—" : fmt(p.costo)}</td>
                          <td style={{color:"var(--accent2)", fontWeight:600}}>{esMadre ? "—" : fmt(precioBaseP)}</td>
                          <td style={{color: margen !== null && margen >= 0 ? "var(--green)" : "var(--red)", fontSize:12, fontWeight:500}}>
                            {margen !== null ? `${margen}%` : "—"}
                          </td>
                          <td>
                            {esMadre
                              ? <span className="badge badge-blue">{variantes.filter(v => v.stock > 0).length}/{variantes.length} con stock</span>
                              : stockBadge(p)}
                          </td>
                          {esAdmin && (
                            <td>
                              <div style={{display:"flex", gap:4}}>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  title={esMadre ? "Editar familia" : "Editar producto"}
                                  onClick={() => esMadre ? setModalProductoMadre(p) : setModalProducto(p)}
                                >
                                  <Icon name="edit" size={13}/>
                                </button>
                                {!esMadre && (
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    title={p.activo === false ? "Habilitar" : "Inhabilitar"}
                                    style={{color: p.activo === false ? "var(--green)" : "var(--red)"}}
                                    onClick={() => handleToggleActivo(p)}
                                  >
                                    <Icon name={p.activo === false ? "unlock" : "lock"} size={13}/>
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-ghost"
                                  title="Ver stock por depósito"
                                  onClick={() => setVerStockProd(p)}
                                >
                                  <Icon name="eye" size={13}/>
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  title={motivoNoEliminar(p) || "Eliminar definitivamente"}
                                  style={{ opacity: motivoNoEliminar(p) ? 0.35 : 1, cursor: motivoNoEliminar(p) ? "not-allowed" : "pointer" }}
                                  onClick={() => handleEliminarProducto(p)}
                                >
                                  <Icon name="trash" size={13} color={motivoNoEliminar(p) ? undefined : "var(--red)"}/>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {esMadre && expandido && variantes.map(v => {
                          const precioBaseV = precioBaseDe(v, margenBase, rubrosDB, proveedores);
                          const vMargen = v.costo > 0 ? Math.round(((precioBaseV - v.costo) / v.costo) * 100) : null;
                          return (
                            <tr key={v.id} style={{ opacity: v.activo === false ? 0.45 : 1, background: "var(--bg2)" }}>
                              <td className="mono" style={{color:"var(--text3)", fontSize:11, paddingLeft:32}}>
                                └ {v.codigo}
                              </td>
                              <td style={{color:"var(--text2)", fontSize:13}}>{v.nombre}</td>
                              <td></td>
                              <td style={{color:"var(--text2)", fontSize:12}}>
                                {v.color}{v.talle ? ` / ${v.talle}` : ""}
                              </td>
                              <td>
                                <span
                                  className="mono"
                                  title="Ver stock por depósito"
                                  onClick={() => setVerStockProd(v)}
                                  style={{
                                    cursor:"pointer", textDecoration:"underline dotted",
                                    color: v.stock === 0 ? "var(--text3)" : "var(--text1)",
                                    fontWeight: v.stock > 0 ? 600 : 400, fontSize:13,
                                  }}
                                >
                                  {v.stock}
                                </span>
                              </td>
                              <td style={{color:"var(--text2)", fontSize:13}}>{fmt(v.costo)}</td>
                              <td style={{color:"var(--accent2)", fontWeight:600, fontSize:13}}>{fmt(precioBaseV)}</td>
                              <td style={{color: vMargen !== null && vMargen >= 0 ? "var(--green)" : "var(--red)", fontSize:12, fontWeight:500}}>
                                {vMargen !== null ? `${vMargen}%` : "—"}
                              </td>
                              <td>{stockBadge(v)}</td>
                              {esAdmin && (
                                <td>
                                  <div style={{display:"flex", gap:4}}>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      title="Editar variante"
                                      onClick={() => setModalProducto(v)}
                                    >
                                      <Icon name="edit" size={13}/>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      title={v.activo === false ? "Habilitar" : "Inhabilitar"}
                                      style={{color: v.activo === false ? "var(--green)" : "var(--red)"}}
                                      onClick={() => handleToggleActivo(v)}
                                    >
                                      <Icon name={v.activo === false ? "unlock" : "lock"} size={13}/>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      title="Ver stock"
                                      onClick={() => setVerStockProd(v)}
                                    >
                                      <Icon name="eye" size={13}/>
                                    </button>
                                    <button
                                      className="btn btn-sm btn-ghost"
                                      title={motivoNoEliminar(v) || "Eliminar definitivamente"}
                                      style={{ opacity: motivoNoEliminar(v) ? 0.35 : 1, cursor: motivoNoEliminar(v) ? "not-allowed" : "pointer" }}
                                      onClick={() => handleEliminarProducto(v)}
                                    >
                                      <Icon name="trash" size={13} color={motivoNoEliminar(v) ? undefined : "var(--red)"}/>
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {productosFiltrados.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  Mostrando {(paginaCatalogoActual - 1) * CATALOGO_PAGE_SIZE + 1}–{Math.min(paginaCatalogoActual * CATALOGO_PAGE_SIZE, productosFiltrados.length)} de {productosFiltrados.length}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-sm btn-ghost" disabled={paginaCatalogoActual <= 1} onClick={() => setPaginaCatalogo(p => p - 1)}>
                    ‹ Anterior
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Página {paginaCatalogoActual} de {totalPaginasCatalogo}</span>
                  <button className="btn btn-sm btn-ghost" disabled={paginaCatalogoActual >= totalPaginasCatalogo} onClick={() => setPaginaCatalogo(p => p + 1)}>
                    Siguiente ›
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: MOVIMIENTOS
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "movimientos" && (
        <div>
          {/* Toolbar movimientos */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
              <select className="form-select" style={{width:"auto"}} value={fMov.tipo} onChange={e => setFM("tipo", e.target.value)}>
                <option value="">Todos los tipos</option>
                <option value="entrada">↑ Entradas</option>
                <option value="salida">↓ Salidas</option>
              </select>
              <select className="form-select" style={{width:"auto"}} value={fMov.origen} onChange={e => setFM("origen", e.target.value)}>
                <option value="">Todos los orígenes</option>
                <option value="manual">Manual</option>
                <option value="venta">Venta</option>
                <option value="pase">Pase</option>
                <option value="cambio">Cambio</option>
                <option value="compra">Compra</option>
              </select>
              <select className="form-select" style={{width:220}} value={fMov.productoId} onChange={e => setFM("productoId", e.target.value)}>
                <option value="">Todos los productos</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select className="form-select" style={{width:"auto"}} value={fMov.depositoId} onChange={e => setFM("depositoId", e.target.value)}>
                <option value="">Todos los depósitos</option>
                {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <input className="form-input" type="date" style={{width:140}} value={fMov.desde} onChange={e => setFM("desde", e.target.value)}/>
              <input className="form-input" type="date" style={{width:140}} value={fMov.hasta} onChange={e => setFM("hasta", e.target.value)}/>

              <div style={{marginLeft:"auto", display:"flex", gap:8}}>
                <button className="btn btn-sm btn-success"
                  onClick={() => setModalMovimiento({ tipo:"entrada" })}>
                  <Icon name="plus" size={13}/> Entrada
                </button>
                <button className="btn btn-sm btn-danger"
                  onClick={() => setModalMovimiento({ tipo:"salida" })}>
                  <Icon name="minus" size={13}/> Salida
                </button>
                <button className="btn btn-sm btn-ghost" onClick={exportarMovimientos} title="Exportar CSV">
                  <Icon name="download" size={13}/> Exportar
                </button>
              </div>
            </div>
          </div>

          {/* Tabla movimientos */}
          <div className="card">
            <div style={{
              fontSize:11, color:"var(--text3)", marginBottom:10,
              display:"flex", justifyContent:"flex-end",
            }}>
              {movFiltrados.length} movimiento{movFiltrados.length !== 1 ? "s" : ""}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Depósito</th>
                    <th>Origen</th>
                    <th>Detalle</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{textAlign:"center", color:"var(--text3)", padding:40}}>
                        Sin movimientos registrados
                      </td>
                    </tr>
                  )}
                  {movFiltradosPagina.map(m => (
                    <tr key={m.id}>
                      <td className="mono" style={{fontSize:12, color:"var(--text3)"}}>{fmtFechaAR(m.fecha)}</td>
                      <td style={{color:"var(--text1)", fontWeight:500}}>{m.productoNombre}</td>
                      <td>
                        <span className={`badge ${m.tipo === "entrada" ? "badge-ok" : "badge-danger"}`}>
                          {m.tipo === "entrada" ? "↑ Entrada" : "↓ Salida"}
                        </span>
                      </td>
                      <td className="mono" style={{
                        fontWeight:700,
                        color: m.tipo === "entrada" ? "var(--green)" : "var(--red)",
                      }}>
                        {m.tipo === "entrada" ? "+" : "−"}{m.cantidad}
                      </td>
                      <td style={{color:"var(--text2)", fontSize:12}}>{m.depositoNombre}</td>
                      <td><span className={`badge ${ORIGEN_BADGE[m.origen] || "badge-accent"}`}>{ORIGEN_LABEL[m.origen] || m.origen}</span></td>
                      <td style={{color:"var(--text2)", fontSize:12, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={m.detalle}>
                        {m.detalle}
                      </td>
                      <td style={{color:"var(--text3)", fontSize:12}}>{m.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Paginacion pagina={paginaMov} totalPaginas={totalPaginasMov} onCambiar={setPaginaMov} totalItems={movFiltrados.length} pageSize={pageSizeMov} etiqueta="movimientos" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: INVENTARIO
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "inventario" && (
        <div>
          {/* Métricas */}
          <div className="metric-grid" style={{marginBottom:12}}>
            <div className="metric-card">
              <div className="metric-label">Valor de costo total</div>
              <div className="metric-value">{fmt(invData.totalCosto)}</div>
              <div className="metric-delta">{invData.totalUnid} unidades en stock</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Valor de venta (precio base)</div>
              <div className="metric-value" style={{color:"var(--accent2)"}}>{fmt(invData.totalPrecio)}</div>
              <div className="metric-delta">{invData.items.length} productos activos</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Ganancia potencial</div>
              <div className="metric-value" style={{color:"var(--green)"}}>
                {fmt(invData.totalPrecio - invData.totalCosto)}
              </div>
              <div className="metric-delta up">
                {invData.totalCosto > 0
                  ? `${Math.round(((invData.totalPrecio - invData.totalCosto) / invData.totalCosto) * 100)}% margen promedio`
                  : "Sin datos de costo"}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Rubros</div>
              <div className="metric-value">{Object.keys(invData.byRubro).length}</div>
              <div className="metric-delta">
                {productos.filter(p => p.activo === false).length} producto{productos.filter(p => p.activo === false).length !== 1 ? "s" : ""} inactivo{productos.filter(p => p.activo === false).length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Filtro + exportar */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              <select className="form-select" style={{width:"auto"}} value={fInvRubro} onChange={e => setFInvRubro(e.target.value)}>
                <option value="">Todos los rubros</option>
                {rubrosEnUso.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div style={{marginLeft:"auto", display:"flex", gap:8}}>
                {esAdmin && (
                  <>
                    <label className="btn btn-sm btn-ghost" style={{cursor:"pointer"}}>
                      <Icon name="upload" size={13}/> Importar stock
                      <input type="file" accept=".csv" style={{display:"none"}} onChange={importarStock}/>
                    </label>
                    <button className="btn btn-sm btn-ghost" onClick={exportarStock} title="Exportar stock por depósito">
                      <Icon name="download" size={13}/> Exportar stock
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-ghost" onClick={exportarInventario} title="Exportar valorización">
                  <Icon name="chart" size={13}/> Exportar inventario
                </button>
              </div>
            </div>
            {esAdmin && (
              <div style={{fontSize:12, color:"var(--text3)", marginTop:10}}>
                Formato esperado (CSV): <strong>Código, Nombre, Rubro, Subrubro, Stock Total</strong>, seguido de una columna por cada depósito
                (en el mismo orden en que aparecen en Depósitos{depositos.length > 0 ? `: ${depositos.map(d => d.nombre).join(", ")}` : ""}).
                El <strong>Código</strong> es la clave para encontrar el producto — filas con un código que no existe en el sistema se ignoran.
                Usá "Exportar stock" para bajar la planilla ya armada con estas columnas, editá los números y volvé a importar ese mismo archivo.
              </div>
            )}
          </div>

          {/* Tabla por rubro */}
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title">Valorización por rubro</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rubro</th>
                    <th>Productos</th>
                    <th>Unidades</th>
                    <th>Costo total</th>
                    <th>Precio total</th>
                    <th>Ganancia</th>
                    <th>Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(invData.byRubro).map(([rub, d]) => {
                    const margen = d.costo > 0 ? Math.round(((d.precio - d.costo) / d.costo) * 100) : null;
                    return (
                      <tr key={rub} style={{cursor:"pointer"}} onClick={() => setFInvRubro(rub === fInvRubro ? "" : rub)}>
                        <td>
                          <span className="badge badge-accent">{rub}</span>
                          {rub === fInvRubro && (
                            <Icon name="check" size={12} style={{marginLeft:6, color:"var(--accent2)"}}/>
                          )}
                        </td>
                        <td className="mono">{d.qty}</td>
                        <td className="mono">{d.unidades}</td>
                        <td style={{color:"var(--text2)"}}>{fmt(d.costo)}</td>
                        <td style={{color:"var(--accent2)", fontWeight:600}}>{fmt(d.precio)}</td>
                        <td style={{color:"var(--green)"}}>{fmt(d.precio - d.costo)}</td>
                        <td style={{color:"var(--green)", fontWeight:500}}>
                          {margen !== null ? `${margen}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Fila de totales */}
                  <tr style={{borderTop:"2px solid var(--border2)", fontWeight:700}}>
                    <td style={{color:"var(--text1)"}}>TOTAL{fInvRubro ? ` — ${fInvRubro}` : ""}</td>
                    <td className="mono">{invData.items.length}</td>
                    <td className="mono">{invData.totalUnid}</td>
                    <td style={{color:"var(--text1)"}}>{fmt(invData.totalCosto)}</td>
                    <td style={{color:"var(--accent2)"}}>{fmt(invData.totalPrecio)}</td>
                    <td style={{color:"var(--green)"}}>{fmt(invData.totalPrecio - invData.totalCosto)}</td>
                    <td style={{color:"var(--green)"}}>
                      {invData.totalCosto > 0
                        ? `${Math.round(((invData.totalPrecio - invData.totalCosto) / invData.totalCosto) * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle de productos cuando se filtra por rubro */}
          {fInvRubro && (
            <div className="card">
              <div className="card-title" style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <span>Detalle — {fInvRubro}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setFInvRubro("")}>
                  <Icon name="close" size={12}/> Quitar filtro
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Subrubro</th>
                      <th>Color / Talle</th>
                      <th>Stock</th>
                      <th>Costo unit.</th>
                      <th>Precio unit.</th>
                      <th>Total costo</th>
                      <th>Total precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invData.items.filter(p => (p.rubro || p.categoria) === fInvRubro).map(p => (
                      <tr key={p.id}>
                        <td className="mono" style={{color:"var(--text3)", fontSize:12}}>{p.codigo}</td>
                        <td style={{color:"var(--text1)"}}>{p.nombre}</td>
                        <td style={{color:"var(--text3)", fontSize:12}}>{p.subrubro || "—"}</td>
                        <td style={{color:"var(--text2)", fontSize:12}}>
                          {p.color}{p.talle ? ` / ${p.talle}` : ""}
                        </td>
                        <td className="mono" style={{color: p.stock === 0 ? "var(--text3)" : "var(--text1)", fontWeight: p.stock > 0 ? 600 : 400}}>
                          {p.stock}
                        </td>
                        <td style={{color:"var(--text2)"}}>{fmt(p.costo)}</td>
                        <td style={{color:"var(--accent2)"}}>{fmt(precioBaseDe(p, margenBase, rubrosDB, proveedores))}</td>
                        <td style={{color:"var(--text2)"}}>{fmt(p.costo * p.stock)}</td>
                        <td style={{color:"var(--accent2)", fontWeight:600}}>{fmt(precioBaseDe(p, margenBase, rubrosDB, proveedores) * p.stock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: PROYECCIÓN
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "proyeccion" && (
        <TabProyeccion
          productos={productos}
          ventas={ventas}
          proveedores={proveedores}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: RUBROS
      ══════════════════════════════════════════════════════════════════ */}
      {esAdmin && tab === "rubros" && (
        <TabRubros
          rubros={rubrosDB}
          agregarRubro={agregarRubro}
          editarRubro={editarRubro}
          desactivarRubro={desactivarRubro}
          agregarSubrubro={agregarSubrubro}
          editarSubrubro={editarSubrubro}
          desactivarSubrubro={desactivarSubrubro}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: PRECIOS
      ══════════════════════════════════════════════════════════════════ */}
      {esAdmin && (
        <div style={{ display: tab === "precios" ? "block" : "none" }}>
          <TabPrecios
            productos={productos}
            setProductos={setProductos}
            actualizarProducto={actualizarProducto}
            proveedores={proveedores}
            rubros={rubrosEnUso}
            rubrosDB={rubrosDB}
            listas={listas}
            setListas={setListas}
            agregarLista={agregarLista}
            actualizarLista={actualizarLista}
            eliminarLista={eliminarLista}
            configPrecios={configPrecios}
            setConfigPrecios={setConfigPrecios}
            actualizarConfigPrecios={actualizarConfigPrecios}
            usuarioActivo={usuarioActivo}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: VER STOCK POR DEPÓSITO
      ══════════════════════════════════════════════════════════════════ */}
      {verStockProd && (
        <div className="modal-bg" onClick={() => setVerStockProd(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{fontSize:15, fontWeight:600, color:"var(--text1)"}}>{verStockProd.nombre}</div>
                <div className="mono" style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{verStockProd.codigo}</div>
              </div>
              <button className="close-btn" onClick={() => setVerStockProd(null)}>
                <Icon name="close" size={16}/>
              </button>
            </div>

            <div style={{marginBottom:16}}>
              <table>
                <thead>
                  <tr>
                    <th>Depósito</th>
                    <th>Tipo</th>
                    <th style={{textAlign:"right"}}>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {depositos.map(d => {
                    const qty = getStockDep(verStockProd.id, d.id);
                    return (
                      <tr key={d.id}>
                        <td style={{color:"var(--text1)"}}>{d.nombre}</td>
                        <td><span className="badge badge-blue">{d.tipo}</span></td>
                        <td className="mono" style={{textAlign:"right", fontWeight:600, color: qty > 0 ? "var(--text1)" : "var(--text3)"}}>
                          {qty}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:"1px solid var(--border2)"}}>
                    <td style={{fontWeight:600, color:"var(--text1)"}}>Total</td>
                    <td></td>
                    <td className="mono" style={{textAlign:"right", fontWeight:700, color:"var(--accent2)", fontSize:15}}>
                      {verStockProd.stock}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{display:"flex", gap:8, paddingTop:12, borderTop:"1px solid var(--border)"}}>
              <button className="btn btn-sm btn-success" style={{flex:1}}
                onClick={() => { setVerStockProd(null); setModalMovimiento({ tipo:"entrada", productoId: verStockProd.id }); }}>
                <Icon name="plus" size={13}/> Entrada
              </button>
              <button className="btn btn-sm btn-danger" style={{flex:1}}
                onClick={() => { setVerStockProd(null); setModalMovimiento({ tipo:"salida", productoId: verStockProd.id }); }}>
                <Icon name="minus" size={13}/> Salida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: NUEVO / EDITAR PRODUCTO
      ══════════════════════════════════════════════════════════════════ */}
      {modalProducto !== null && (
        <ModalProducto
          producto={modalProducto?.id ? modalProducto : null}
          productos={productos}
          proveedores={proveedores}
          rubrosDB={rubrosDB}
          nombresRubros={nombresRubros}
          subrubrosDeRubro={subrubrosDeRubro}
          margenBase={margenBase}
          depositos={depositos}
          onGuardar={handleGuardarProducto}
          onClose={() => setModalProducto(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: NUEVO / EDITAR PRODUCTO CON VARIANTES
      ══════════════════════════════════════════════════════════════════ */}
      {modalProductoMadre !== null && (
        <ModalProductoMadre
          productoMadre={modalProductoMadre}
          variantesExistentes={
            modalProductoMadre?.id
              ? productos.filter(p => p.tipo === "variante" && p.productoMadreId === modalProductoMadre.id)
              : []
          }
          productos={productos}
          proveedores={proveedores}
          nombresRubros={nombresRubros}
          subrubrosDeRubro={subrubrosDeRubro}
          depositos={depositos}
          onGuardar={handleGuardarProductoMadre}
          onClose={() => setModalProductoMadre(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: MOVIMIENTO DE STOCK
      ══════════════════════════════════════════════════════════════════ */}
      {modalMovimiento !== null && (
        <ModalMovimiento
          tipoInicial={modalMovimiento.tipo}
          productoInicial={modalMovimiento.productoId}
          productos={productos.filter(p => p.activo !== false && (p.tipo || "simple") !== "madre")}
          depositos={depositos}
          stockDepositos={stockDepositos}
          permitirStockNegativo={configPrecios?.permitirStockNegativo}
          onGuardar={handleMovimiento}
          onClose={() => setModalMovimiento(null)}
        />
      )}
    </div>
  );
}
