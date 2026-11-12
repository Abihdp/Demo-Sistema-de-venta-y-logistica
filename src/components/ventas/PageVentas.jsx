import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, today, daysAgo, mesLabel, periodoCerrado, precioPorLista, labelLista, diasMoraCliente, pagosDeVenta, calcularMoraCliente, calcularSaldoCtaCte, normalizarCodigoEscaneado, coincideBusqueda, ventaEditable, cambioEditable, fmtFechaAR } from "../../utils/helpers";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/Confirm.jsx";
import { FORMAS_PAGO, ALICUOTAS_IVA, TIPOS_FACTURA_VENTA, PAGO_COMBINADO } from "../../constants";
import { useGestionSeñaVenta } from "../../hooks/useGestionSeñaVenta.js";
import ModalNuevoCliente from "../clientes/ModalNuevoCliente";
import InfoCtaCte from "../clientes/InfoCtaCte.jsx";
import ModalTicket from "./ModalTicket";
import ModalBuscadorProductos from "./ModalBuscadorProductos";
import ModalEditarVenta from "./ModalEditarVenta";
import ModalCambioArticulo from "./ModalCambioArticulo";
import ModalComprobanteCambio from "./ModalComprobanteCambio";
import ModalGestionListas from "../productos/ModalGestionListas";
import ModalGestionPromociones from "./ModalGestionPromociones";
import ModalAnulacionVenta from "./ModalAnulacionVenta";
import ModalAnulacionCambio from "./ModalAnulacionCambio";
import ModalCompletarRetiro from "./ModalCompletarRetiro";

export default function PageVentas({ ventas, setVentas, clientes, setClientes, productos, setProductos, caja, setCaja, usuarioActivo, permisos, listas, setListas, agregarLista, actualizarLista, eliminarLista, configMora, configPrecios = {}, actualizarConfigPrecios, rubros = [], proveedores = [], tarjetas = [], depositos = [], stockDepositos = [], cambiosArticulo = [], setCambiosArticulo, pagosCtaCte, setPagosCtaCte, periodosCerrados = [], anulaciones = [], setAnulaciones, agregarVenta, confirmarVenta, editarVenta, editarVentaConItems, anularVenta, registrarRetiroSeña, registrarPagoSeña, agregarCambioArticulo, anularCambioArticulo, actualizarStock, agregarPagoCtaCte, eliminarPagoCtaCte, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple, registrarPase, promociones = [], agregarPromocion, actualizarPromocion, eliminarPromocion, recibos = [], agregarRecibo }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const margenBase = configPrecios?.margenBase ?? 0;
  const permitirStockNegativo = configPrecios?.permitirStockNegativo ?? false;

  const { motivoNoAnular, motivoNoRetirar, handleAnular, handleRetirarSeña, handleAgregarPagoSeña, handleRecalcularPrecios } =
    useGestionSeñaVenta({
      caja, periodosCerrados, depositos, stockDepositos, productos, listas,
      configPrecios, rubros, proveedores, usuarioActivo, permisos,
      editarVenta, editarVentaConItems, anularVenta,
      registrarRetiroSeña, registrarPagoSeña,
      actualizarStock, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple, agregarPagoCtaCte,
      agregarRecibo, recibos,
    });

  // ── Estado del formulario ─────────────────────────────────────────────
  // Listas eliminadas (activa:false) siguen existiendo para no romper ventas
  // viejas que las usaron, pero no deben poder elegirse en operaciones nuevas.
  const listasActivas = listas.filter(l => l.activa !== false).length > 0
    ? listas.filter(l => l.activa !== false)
    : listas;
  const listaDefault   = listasActivas.reduce((a, b) => b.pct > a.pct ? b : a);
  const depositoInicial = depositos.find(d => d.tipo !== "reserva")?.id || null;

  const [clienteInput, setClienteInput]   = useState("");
  const [clienteSelec, setClienteSelec]   = useState(null);
  const [lista, setLista]                 = useState(listaDefault);
  const [formaPago, setFormaPago]         = useState(FORMAS_PAGO[0]);
  const [tarjetaId, setTarjetaId]         = useState(null);
  const [cuotasSel, setCuotasSel]         = useState(null);
  const [modoPago, setModoPago]           = useState("unico"); // "unico" | "dividido"
  const [pagosSplit, setPagosSplit]       = useState([{ formaPago: FORMAS_PAGO[0], monto: "", cuotas: 1, tarjetaId: null }]);
  const [tipo, setTipo]                   = useState("Mostrador");
  const [descripcion, setDescripcion]     = useState("");
  const [tipoFactura, setTipoFactura]     = useState("B");
  const [alicuotaIva, setAlicuotaIva]     = useState(21);
  const [items, setItems]                 = useState([]);
  const [busqueda, setBusqueda]           = useState("");
  const [showResults, setShowResults]     = useState(false);
  const [depositoId,    setDepositoId]    = useState(depositoInicial);
  const [esSeña,        setEsSeña]        = useState(false);
  const [señaMonto,     setSeñaMonto]     = useState("");
  const [señaFormaPago, setSeñaFormaPago] = useState(FORMAS_PAGO[0]);
  const [showNuevoCliente,  setShowNuevoCliente]  = useState(false);
  const [showCatalogo,      setShowCatalogo]      = useState(false);
  const [showTicket,        setShowTicket]        = useState(null);
  const [ventaParaEditar,   setVentaParaEditar]   = useState(null);
  const [showCambioArt,     setShowCambioArt]     = useState(false);
  const [comprobanteCambio, setComprobanteCambio] = useState(null);
  const [showGestionListas, setShowGestionListas] = useState(false);
  const [showGestionPromociones, setShowGestionPromociones] = useState(false);
  const [showAnulacion,     setShowAnulacion]     = useState(null); // venta a anular
  const [showAnulacionCambio, setShowAnulacionCambio] = useState(null); // grupo de cambio a anular
  const [showCompletarRetiro, setShowCompletarRetiro] = useState(null); // venta con seña a completar
  const [guardandoVenta,    setGuardandoVenta]    = useState(false); // evita doble click mientras se registra
  const [soloPendientesRetiro, setSoloPendientesRetiro] = useState(false);
  const [tab,               setTab]               = useState("ventas"); // "ventas" | "cambios"

  // ── Estado de filtros del historial ───────────────────────────────────
  const [fUsuario,  setFUsuario]  = useState("");
  const [fCliente,  setFCliente]  = useState("");
  const [fDesde,    setFDesde]    = useState(daysAgo(3));
  const [fHasta,    setFHasta]    = useState(today());
  const [fPago,     setFPago]     = useState("");
  const [fArticulo, setFArticulo] = useState("");
  const [fTipo,     setFTipo]     = useState(""); // "" | "Comprobante" | "Mostrador"

  // Atajo Ctrl+M: ciclar filtro de tipo (compliance facturas)
  useEffect(() => {
    const CICLO = ["", "Comprobante", "Mostrador"];
    const handler = (e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "m") {
        e.preventDefault();
        setFTipo(prev => {
          const i = CICLO.indexOf(prev);
          return CICLO[(i + 1) % CICLO.length];
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Al elegir un medio de pago en modo único, la lista se auto-selecciona
  // si ese medio fue asignado a alguna lista en "Gestionar listas".
  // Si ninguna lista lo tiene asignado, la lista queda libre para elegir.
  const listaParaFormaPago = (forma) =>
    listasActivas.find(l => (l.formasPago || []).length > 0 && (l.formasPago || []).includes(forma)) || null;

  // Con seña activa, el medio de pago relevante es el de la seña (señaFormaPago),
  // no el del formulario de pago normal (que queda oculto en ese caso).
  const formaPagoActual = esSeña ? señaFormaPago : formaPago;
  const listaFijadaPorPago = modoPago === "unico" && listaParaFormaPago(formaPagoActual) !== null;

  useEffect(() => {
    if (modoPago !== "unico") return;
    const asignada = listaParaFormaPago(formaPagoActual);
    if (asignada) setLista(asignada);
  }, [formaPagoActual, modoPago]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tarjeta de crédito + cuotas (recargo por interés, solo en pago único) ──
  // Al elegir "Tarjeta Crédito" se autoselecciona la primera tarjeta cargada
  // en Tesorería → Tarjetas (si hay alguna); si no hay ninguna cargada, el
  // pago se comporta como antes (sin recargo, sin selectores).
  useEffect(() => {
    if (modoPago === "unico" && formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && !tarjetaId) {
      setTarjetaId(tarjetas[0].id);
    }
    if (formaPago !== "Tarjeta Crédito" || modoPago !== "unico") {
      if (tarjetaId !== null) setTarjetaId(null);
      if (cuotasSel !== null) setCuotasSel(null);
    }
  }, [formaPago, modoPago, tarjetas]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarjetaSeleccionada = tarjetas.find(t => t.id === tarjetaId) || null;

  useEffect(() => {
    if (!tarjetaSeleccionada) return;
    if (!tarjetaSeleccionada.cuotas.some(c => c.cuotas === cuotasSel)) {
      setCuotasSel(tarjetaSeleccionada.cuotas[0]?.cuotas ?? null);
    }
  }, [tarjetaId, tarjetaSeleccionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const cuotaInfo = tarjetaSeleccionada?.cuotas.find(c => c.cuotas === cuotasSel) || null;
  const interesTarjetaPct = cuotaInfo?.interesPct || 0;

  // ── Helpers de depósitos ─────────────────────────────────────────────
  const depositoNombre  = depositos.find(d => d.id === depositoId)?.nombre || "—";
  const depositoReserva = depositos.find(d => d.tipo === "reserva");
  const depositosNormales = depositos.filter(d => d.tipo !== "reserva");

  const stockEnDeposito = (productoId) => {
    if (!depositoId) return 0;
    return stockDepositos.find(s => s.productoId === productoId && s.depositoId === depositoId)?.cantidad ?? 0;
  };

  // ── Lógica del formulario ─────────────────────────────────────────────
  const clienteSugs = useMemo(() => {
    if (!clienteInput) return [];
    const q   = clienteInput.toLowerCase();
    const dni = clienteInput.replace(/[\.\-\s]/g, "");
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.dni?.replace(/[\.\-\s]/g, "").includes(dni)
    ).slice(0, 6);
  }, [clientes, clienteInput]);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
    return productos
      .filter(p => (p.tipo || "simple") !== "madre")
      .filter(p => coincideBusqueda([p.nombre, p.codigo, p.rubro || p.categoria || ""].join(" "), q))
      .map(p => ({ ...p, stockDeposito: stockEnDeposito(p.id) }))
      .slice(0, 8);
  }, [busqueda, productos, depositoId, stockDepositos]);

  // ── Recargo por mora en cta. cte. (mismos tramos configurados en Clientes) ──
  // En pago dividido alcanza con que algún medio de pago sea Cuenta Corriente.
  const esCtaCte     = modoPago === "unico"
    ? formaPago === "Cuenta Corriente"
    : pagosSplit.some(p => p.formaPago === "Cuenta Corriente");
  const moraClienteSel = (esCtaCte && clienteSelec)
    ? calcularMoraCliente(clienteSelec.id, ventas, pagosCtaCte, configMora, clienteSelec.configMora, cambiosArticulo)
    : null;
  const pctMoraVenta = moraClienteSel?.config?.pctAplicado || 0;
  const diasMoraSel = moraClienteSel?.diasMora || 0;

  const precioFinal = (prod) => {
    const base = precioPorLista(prod, lista, margenBase, rubros, proveedores);
    return pctMoraVenta > 0 ? Math.round(base * (1 + pctMoraVenta / 100)) : base;
  };

  const addItem = (prod) => {
    const disponible = stockEnDeposito(prod.id);
    if (disponible <= 0 && !permitirStockNegativo) return;
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        if (ex.qty >= disponible && !permitirStockNegativo) return prev;
        return prev.map(i => i.productoId === prod.id ? { ...i, qty: i.qty + 1 } : i);
      }
      const precio = precioFinal(prod);
      return [...prev, {
        productoId: prod.id, nombre: prod.nombre, codigo: prod.codigo, precio, qty: 1, stock: disponible,
        precioBase: precio, promoId: null, promoNombre: null, promoPct: 0, precioManual: false,
      }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const changeQty = (productoId, delta) => {
    setItems(prev => prev.map(i => {
      if (i.productoId !== productoId) return i;
      const nq = i.qty + delta;
      if (nq <= 0) return null;
      if (nq > i.stock && !permitirStockNegativo) return i;
      return { ...i, qty: nq };
    }).filter(Boolean));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.productoId !== id));

  // Promoción manual por artículo (ej: "Ropa Casual −15%") — un descuento
  // adicional sobre el precio ya calculado por lista, independiente del
  // resto del carrito. `promocion=null` la quita y vuelve al precio de lista.
  const aplicarPromoItem = (productoId, promocion) => {
    setItems(prev => prev.map(i => {
      if (i.productoId !== productoId) return i;
      const base = i.precioBase ?? i.precio;
      const precio = promocion ? Math.round(base * (1 - promocion.pct / 100)) : base;
      return { ...i, precio, promoId: promocion?.id ?? null, promoNombre: promocion?.nombre ?? null, promoPct: promocion?.pct ?? 0, precioManual: false };
    }));
  };

  const aplicarPromoATodos = (promocion) => {
    setItems(prev => prev.map(i => {
      const base = i.precioBase ?? i.precio;
      const precio = promocion ? Math.round(base * (1 - promocion.pct / 100)) : base;
      return { ...i, precio, promoId: promocion?.id ?? null, promoNombre: promocion?.nombre ?? null, promoPct: promocion?.pct ?? 0, precioManual: false };
    }));
  };

  // Corrección manual del precio de venta de un artículo — pensado como algo
  // temporal mientras se terminan de cargar bien los precios del sistema
  // (togglea desde "Gestionar listas" → Permitir editar el precio en la
  // venta). Reemplaza cualquier promoción aplicada: un precio tipeado a mano
  // es la fuente de verdad, no algo que se combine con el % de una promo.
  const editarPrecioManual = (productoId, valor) => {
    const precio = Math.max(0, Number(valor) || 0);
    setItems(prev => prev.map(i => i.productoId === productoId
      ? { ...i, precio, precioManual: true, promoId: null, promoNombre: null, promoPct: 0 }
      : i
    ));
  };

  const agregarPorCodigoExacto = (match) => {
    const disponible = stockEnDeposito(match.id);
    if (disponible <= 0 && !permitirStockNegativo) { toast(`"${match.nombre}" sin stock en ${depositoNombre}.`, "error"); setBusqueda(""); setShowResults(false); return; }
    addItem(match);
  };

  // Lector de código de barras: emula un teclado, tipeando muy rápido. En
  // cuanto el texto tipeado coincide exacto con un código, se agrega directo
  // al carrito sin dejarlo escrito en el buscador (no hace falta ni Enter).
  const handleBusquedaChange = (valor) => {
    const q = normalizarCodigoEscaneado(valor.trim().toLowerCase());
    const match = q && productos.find(p => (p.tipo || "simple") !== "madre" && p.codigo.toLowerCase() === q);
    if (match) { agregarPorCodigoExacto(match); return; }
    setBusqueda(valor);
    setShowResults(true);
  };

  // Por si el lector no manda el código exacto (o el usuario tipea a mano):
  // Enter agrega el match exacto o, si el filtro dejó un único resultado, ese.
  // El código madre (compartido por todos los talles/colores de un mismo
  // producto) nunca cuenta como match exacto — no es un ítem vendible en sí
  // mismo, así que si el código escaneado es el del madre, cae al listado de
  // `resultados` para que se elija la variante puntual (color/talle) a vender.
  const handleBusquedaKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = busqueda.trim();
    if (!q) return;
    const match = productos.find(p => (p.tipo || "simple") !== "madre" && p.codigo.toLowerCase() === normalizarCodigoEscaneado(q.toLowerCase()))
      || (resultados.length === 1 ? resultados[0] : null);
    if (!match) { toast(`Sin resultados para "${q}".`, "warning"); return; }
    agregarPorCodigoExacto(match);
  };

  useEffect(() => {
    setItems(prev => prev.map(i => {
      if (i.precioManual) return i; // precio corregido a mano: no se pisa con el recálculo de lista/mora
      const prod = productos.find(p => p.id === i.productoId);
      if (!prod) return i;
      const base = precioFinal(prod);
      const precio = i.promoPct > 0 ? Math.round(base * (1 - i.promoPct / 100)) : base;
      return { ...i, precioBase: base, precio };
    }));
  }, [lista, pctMoraVenta]);

  const subtotal     = items.reduce((a, i) => a + i.precio * i.qty, 0);
  // Recargo por tarjeta de crédito en cuotas: se aplica sobre el subtotal de
  // artículos, por encima de cualquier otro ajuste (mora, etc.) — es un
  // recargo del medio de pago, no del artículo.
  const totalConInteres = interesTarjetaPct > 0 ? Math.round(subtotal * (1 + interesTarjetaPct / 100)) : subtotal;

  // Mismo recargo, pero por fila dentro de un pago dividido: cada fila de
  // "Tarjeta Crédito" tiene su propia tarjeta/cuotas, y el interés se suma
  // solo sobre el monto de esa fila (no sobre el total completo).
  const cuotaInfoDeFila = (p) => {
    if (p.formaPago !== "Tarjeta Crédito") return null;
    const t = tarjetas.find(t => t.id === p.tarjetaId);
    return t?.cuotas.find(c => c.cuotas === p.cuotas) || null;
  };
  const montoFinalFila = (p) => {
    const base = Number(p.monto) || 0;
    const pct = cuotaInfoDeFila(p)?.interesPct || 0;
    return pct > 0 ? Math.round(base * (1 + pct / 100)) : base;
  };
  const totalConRecargoSplit = pagosSplit.reduce((a, p) => a + montoFinalFila(p), 0);
  // Total real de la venta: en pago dividido incluye el recargo de las filas
  // de tarjeta; en pago único (y seña, que siempre fuerza modoPago "unico")
  // es el mismo totalConInteres de siempre.
  const totalFinal = modoPago === "dividido" ? totalConRecargoSplit : totalConInteres;

  const esComprobante = tipo === "Comprobante electrónico";
  const neto          = esComprobante ? totalFinal / (1 + alicuotaIva / 100) : totalFinal;
  const iva           = esComprobante ? totalFinal - neto : 0;
  const clienteFinal  = clienteSelec ? clienteSelec.nombre : "Consumidor Final";

  // ── Pago dividido (varios medios de pago en una misma venta) ──────────────
  const activarPagoDividido = () => {
    setPagosSplit([{ formaPago, monto: String(subtotal), cuotas: 1, tarjetaId: null }]);
    setModoPago("dividido");
  };
  const activarPagoUnico = () => setModoPago("unico");
  const agregarPagoSplit = () => setPagosSplit(prev => [...prev, { formaPago: FORMAS_PAGO[0], monto: "", cuotas: 1, tarjetaId: null }]);
  const quitarPagoSplit  = (idx) => setPagosSplit(prev => prev.filter((_, i) => i !== idx));
  const editarPagoSplit  = (idx, campo, valor) => setPagosSplit(prev => prev.map((p, i) => {
    if (i !== idx) return p;
    let upd = { ...p, [campo]: valor };
    if (campo === "formaPago") {
      if (valor !== "Tarjeta Crédito") {
        upd.cuotas = 1; upd.tarjetaId = null;
      } else if (tarjetas.length > 0) {
        upd.tarjetaId = tarjetas[0].id;
        upd.cuotas = tarjetas[0].cuotas?.[0]?.cuotas ?? 1;
      }
    }
    if (campo === "tarjetaId") {
      const tid = Number(valor);
      upd.tarjetaId = tid;
      const t = tarjetas.find(t => t.id === tid);
      if (t && !t.cuotas.some(c => c.cuotas === p.cuotas)) upd.cuotas = t.cuotas[0]?.cuotas ?? 1;
    }
    if (campo === "cuotas") upd.cuotas = Number(valor);
    return upd;
  }));

  const sumaPagosSplit = pagosSplit.reduce((a, p) => a + (Number(p.monto) || 0), 0);
  const pagosSplitOk   = modoPago === "unico" || (pagosSplit.length > 0 && Math.round(sumaPagosSplit) === Math.round(subtotal));

  // Monto que efectivamente va a saldo de cta. cte. en esta venta (puede ser
  // parcial si el resto del total se paga con otro medio).
  const montoCtaCteForm = modoPago === "unico"
    ? (esCtaCte ? subtotal : 0)
    : pagosSplit.filter(p => p.formaPago === "Cuenta Corriente").reduce((a, p) => a + (Number(p.monto) || 0), 0);

  const limpiarForm = () => {
    setClienteInput("");
    setClienteSelec(null);
    setLista(listaDefault);
    setFormaPago(FORMAS_PAGO[0]);
    setTarjetaId(null);
    setCuotasSel(null);
    setModoPago("unico");
    setPagosSplit([{ formaPago: FORMAS_PAGO[0], monto: "", cuotas: 1, tarjetaId: null }]);
    setTipo("Mostrador");
    setDescripcion("");
    setTipoFactura("B");
    setAlicuotaIva(21);
    setItems([]);
    setBusqueda("");
    setEsSeña(false);
    setSeñaMonto("");
    setSeñaFormaPago(FORMAS_PAGO[0]);
    // depositoId se mantiene para la siguiente venta
  };

  const confirmar = async () => {
    if (guardandoVenta) return; // ya se está registrando — ignorar clicks de más
    const cerrado = periodoCerrado(today(), periodosCerrados);
    if (cerrado) { toast(`El período ${mesLabel(cerrado.mes)} está cerrado. Pedile al administrador que lo reabra desde Tesorería → Cierre de Período.`, "warning"); return; }
    if (!caja.abierta) { toast("La caja está cerrada. Abrila desde Caja para registrar ventas.", "warning"); return; }
    if (!depositoId)   { toast("Seleccioná un depósito de origen.", "error"); return; }
    if (items.length === 0) { toast("Agregá al menos un producto.", "error"); return; }
    if (esCtaCte && !clienteSelec) { toast("Para cuenta corriente debés seleccionar un cliente.", "error"); return; }

    let pagosFinal;
    if (esSeña) {
      const señaNum = Number(señaMonto);
      if (!señaMonto.toString().trim() || isNaN(señaNum) || señaNum <= 0) { toast("Ingresá el monto de la seña.", "error"); return; }
      if (señaNum > totalConInteres) { toast(`La seña (${fmt(señaNum)}) no puede ser mayor al total de la venta (${fmt(totalConInteres)}).`, "error"); return; }
      pagosFinal = [{ formaPago: señaFormaPago, monto: Math.round(señaNum), fecha: today() }];
    } else if (modoPago === "unico") {
      pagosFinal = [{
        formaPago, monto: totalConInteres,
        ...(interesTarjetaPct > 0 ? {
          tarjetaId, tarjetaNombre: tarjetaSeleccionada?.nombre || "",
          cuotas: cuotasSel, interesPct: interesTarjetaPct,
        } : {}),
      }];
    } else {
      for (const p of pagosSplit) {
        const m = Number(p.monto);
        if (!p.formaPago || isNaN(m) || m <= 0) { toast("Revisá los medios de pago: todos los montos deben ser mayores a cero.", "error"); return; }
      }
      if (Math.round(sumaPagosSplit) !== Math.round(subtotal)) {
        toast(`La suma de los pagos (${fmt(sumaPagosSplit)}) no coincide con el total de la venta (${fmt(subtotal)}). Ajustá los montos.`, "error");
        return;
      }
      pagosFinal = pagosSplit.map(p => {
        const pct = cuotaInfoDeFila(p)?.interesPct || 0;
        return {
          formaPago: p.formaPago,
          monto: montoFinalFila(p),
          ...(pct > 0 ? {
            tarjetaId: p.tarjetaId,
            tarjetaNombre: tarjetas.find(t => t.id === p.tarjetaId)?.nombre || "",
            cuotas: p.cuotas,
            interesPct: pct,
          } : {}),
        };
      });
    }
    const formaPagoVenta = pagosFinal.length === 1 ? pagosFinal[0].formaPago : PAGO_COMBINADO;

    // Validar stock en el depósito seleccionado
    const itemsStockNegativo = [];
    for (const item of items) {
      const disp = stockEnDeposito(item.productoId);
      if (item.qty > disp) {
        if (!permitirStockNegativo) {
          toast(`Stock insuficiente en ${depositoNombre}: "${item.nombre}" — disponible: ${disp}, pedido: ${item.qty}`, "error");
          return;
        }
        itemsStockNegativo.push({ nombre: item.nombre, resultante: disp - item.qty });
      }
    }

    // Límite de cuenta corriente: es una advertencia, no un bloqueo duro —
    // el admin/cajero decide si registrar la venta igual.
    if (esCtaCte && clienteSelec) {
      const saldoActual = calcularSaldoCtaCte(clienteSelec.id, ventas, pagosCtaCte, cambiosArticulo);
      const limite = clienteSelec.limiteCtaCte;
      if (limite !== null && limite !== undefined && (saldoActual + montoCtaCteForm) > limite) {
        const continuar = await confirm(
          `El cliente supera su límite de cuenta corriente (${fmt(limite)}). Saldo resultante: ${fmt(saldoActual + montoCtaCteForm)}. ¿Querés registrar la venta de todas formas?`,
          { danger: true, confirmLabel: "Registrar igual" }
        );
        if (!continuar) return;
      }
    }

    const venta = {
      fecha:           today(),
      periodo:         today().slice(0, 7),
      usuario:         usuarioActivo?.nombre || "—",
      clienteId:       clienteSelec?.id || null,
      cliente:         clienteFinal,
      lista:           lista.nombre,
      formaPago:       formaPagoVenta,
      pagos:           pagosFinal,
      tipo,
      depositoId,
      depositoNombre,
      esSeña,
      descripcion: descripcion.trim(),
      estado: esSeña ? "pendiente" : "activa",
      items: items.map(i => ({ productoId: i.productoId, nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total: totalFinal,
      ...(esComprobante ? { tipoFactura, alicuotaIva, neto, iva } : {}),
    };

    setGuardandoVenta(true);
    try {
      let ventaGuardada;

      if (esSeña) {
        ventaGuardada = await agregarVenta(venta);
        // ── SEÑA: mover stock del depósito origen → depósito de reservas (Supabase) ──
        if (depositoReserva) {
          try {
            await Promise.all(items.map(item => registrarPase({
              fecha:             today(),
              productoId:        item.productoId,
              nombreProducto:    item.nombre,
              depositoOrigenId:  depositoId,
              depositoDestinoId: depositoReserva.id,
              cantidad:          item.qty,
              motivo:            "Seña de venta",
              usuario:           usuarioActivo?.nombre || "—",
            })));
          } catch {
            toast("Seña registrada. Error al actualizar stock en depósito — verificá manualmente.", "warning");
          }
        }
        // El stock total (producto.stock) NO cambia — la mercadería sigue en el local

      } else {
        // ── VENTA NORMAL: la venta y el descuento de stock (depósito + total,
        // ambos por delta — atómicos en Postgres) se registran como una sola
        // operación. Si no hay conexión, queda encolada y se aplica sola
        // cuando vuelve internet — el ticket se puede imprimir igual con el
        // registro local mientras tanto.
        const cambiosDeposito = items.map(item => ({ productoId: item.productoId, depositoId, delta: -item.qty }));
        ventaGuardada = await confirmarVenta(venta, cambiosDeposito);
        if (String(ventaGuardada.id).startsWith("local-")) {
          toast("Sin conexión: la venta se guardó localmente y se va a sincronizar sola cuando vuelva internet.", "warning");
        }
      }

      if (itemsStockNegativo.length > 0) {
        toast(`Venta registrada con stock insuficiente: ${itemsStockNegativo.map(i => `"${i.nombre}" quedará en ${i.resultante}`).join(", ")}.`, "warning");
      }

      setShowTicket(ventaGuardada);
      limpiarForm();
    } catch {
      toast("No se pudo registrar la venta. Intentá de nuevo.", "error");
    } finally {
      setGuardandoVenta(false);
    }
  };

  // ── Permisos de edición ───────────────────────────────────────────────
  // Regla: primero el estado de la venta/caja/período (ventaEditable), luego el rol.
  const motivoNoEditar = (v) => {
    const { puede, motivo } = ventaEditable(v, caja, periodosCerrados);
    if (!puede) return motivo;
    if (v.estado === "pendiente") return "Esta venta tiene una seña pendiente — completá el retiro para poder editarla.";
    if (!permisos?.[usuarioActivo?.id]?.editarVenta) return "No tenés permiso para editar ventas.";
    if (!permisos?.[usuarioActivo?.id]?.editarVentaAjena && v.usuario !== usuarioActivo?.nombre) {
      return "Solo podés editar las ventas que registraste vos.";
    }
    return null;
  };

  // ── Guardar edición de venta (datos generales + items) ────────────────
  const handleGuardarEdicion = async (ventaActualizada) => {
    const original = ventaParaEditar;
    // Reverificar por si el turno se cerró (o se hizo un cierre de control)
    // mientras el modal de edición estaba abierto.
    const { puede, motivo } = ventaEditable(original, caja, periodosCerrados);
    if (!puede) {
      toast(motivo, "warning");
      setVentaParaEditar(null);
      return;
    }

    try {
      const depositoCambio = !!ventaActualizada.depositoId && ventaActualizada.depositoId !== original.depositoId;
      const depositoNombreNuevo = depositoCambio
        ? (depositos.find(d => d.id === ventaActualizada.depositoId)?.nombre || null)
        : original.depositoNombre;

      await editarVentaConItems(original.id, {
        lista:     ventaActualizada.lista,
        formaPago: ventaActualizada.formaPago,
        pagos:     ventaActualizada.pagos,
        tipo:      ventaActualizada.tipo,
        descripcion: ventaActualizada.descripcion,
        total:     ventaActualizada.total,
        depositoId:     ventaActualizada.depositoId ?? original.depositoId,
        depositoNombre: depositoNombreNuevo,
        clienteId: ventaActualizada.clienteId,
        cliente:   ventaActualizada.cliente,
      }, ventaActualizada.items);

      // Ajustar stock — solo para ventas normales. Una seña nunca descontó
      // productos.stock ni el stock del depósito de venta (su mercadería vive
      // en el depósito de Reservas vía un pase, ajeno a esta edición).
      if (!original.esSeña && original.depositoId) {
        const originales = original.items || [];
        const nuevos      = ventaActualizada.items;
        const idsRelevantes = new Set([
          ...originales.map(o => o.productoId).filter(Boolean),
          ...nuevos.map(n => n.productoId).filter(Boolean),
        ]);

        // Stock TOTAL del producto (productos.stock): no depende del depósito,
        // solo de cuánto se lleva el cliente en total.
        const diffsTotal = [...idsRelevantes]
          .map(pid => {
            const qtyOrig  = originales.filter(o => o.productoId === pid).reduce((a, o) => a + o.qty, 0);
            const qtyNuevo = nuevos.filter(n => n.productoId === pid).reduce((a, n) => a + n.qty, 0);
            return { pid, diff: qtyNuevo - qtyOrig }; // positivo = se llevó más (descontar), negativo = devolver
          })
          .filter(d => d.diff !== 0);

        if (diffsTotal.length > 0) {
          try {
            if (aplicarDeltaStockProductoMultiple) {
              // Delta atómico (no absoluto calculado acá) — recortado a lo que
              // realmente se aplica cuando no se permite stock negativo, igual
              // que antes, pero sin arriesgarse a pisar un cambio concurrente.
              const cambiosTotal = diffsTotal.map(({ pid, diff }) => {
                const prod = productos.find(p => p.id === pid);
                const stockAntes = prod?.stock || 0;
                const nuevoTotal = permitirStockNegativo ? stockAntes - diff : Math.max(0, stockAntes - diff);
                return { productoId: pid, delta: nuevoTotal - stockAntes };
              });
              await aplicarDeltaStockProductoMultiple(cambiosTotal);
            } else {
              await Promise.all(diffsTotal.map(({ pid, diff }) => {
                const prod = productos.find(p => p.id === pid);
                if (!prod) return Promise.resolve();
                const nuevoTotal = prod.stock - diff;
                return actualizarStock(pid, permitirStockNegativo ? nuevoTotal : Math.max(0, nuevoTotal));
              }));
            }
          } catch {
            toast("Venta actualizada. Error al ajustar el stock total — verificá manualmente el inventario.", "warning");
          }
        }

        // Stock por DEPÓSITO: si el depósito no cambió, solo se ajusta la
        // diferencia de cantidad (como antes). Si cambió, hay que devolver
        // TODO lo original al depósito viejo y descontar TODO lo nuevo del
        // depósito nuevo — son dos ubicaciones distintas, no alcanza con la
        // diferencia.
        try {
          const cambiosDeposito = depositoCambio
            ? [
                ...originales.filter(o => o.productoId).map(o => ({ productoId: o.productoId, depositoId: original.depositoId, delta: o.qty })),
                ...nuevos.filter(n => n.productoId).map(n => ({ productoId: n.productoId, depositoId: ventaActualizada.depositoId, delta: -n.qty })),
              ]
            : diffsTotal.map(({ pid, diff }) => ({ productoId: pid, depositoId: original.depositoId, delta: -diff }));
          if (cambiosDeposito.length > 0) await aplicarDeltaStockMultiple(cambiosDeposito);
        } catch {
          toast("Venta actualizada. Error al ajustar el stock por depósito — verificá manualmente.", "warning");
        }
      }

      setVentaParaEditar(null);
      toast("Venta actualizada correctamente.", "success");
    } catch (err) {
      toast(err.message || "Error al guardar los cambios.", "error");
    }
  };

  // handleAnular, handleRetirarSeña, handleAgregarPagoSeña,
  // handleRecalcularPrecios, motivoNoAnular y motivoNoRetirar vienen de
  // useGestionSeñaVenta (arriba) — compartidos con Clientes → Reservas, ver
  // src/hooks/useGestionSeñaVenta.js.

  // ── Filtrado del historial ────────────────────────────────────────────
  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      if (soloPendientesRetiro) return v.estado === "pendiente";
      if (fDesde    && v.fecha < fDesde) return false;
      if (fHasta    && v.fecha > fHasta) return false;
      if (fUsuario  && !v.usuario?.toLowerCase().includes(fUsuario.toLowerCase())) return false;
      if (fCliente  && !v.cliente.toLowerCase().includes(fCliente.toLowerCase())) return false;
      if (fPago     && !pagosDeVenta(v).some(p => p.formaPago === fPago)) return false;
      if (fTipo     && v.tipo !== fTipo) return false;
      if (fArticulo && !v.items?.some(i => coincideBusqueda(i.nombre, fArticulo))) return false;
      return true;
    }).sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.id - a.id));
  }, [ventas, fDesde, fHasta, fUsuario, fCliente, fPago, fTipo, fArticulo, soloPendientesRetiro]);

  const { pagina: paginaVentas, setPagina: setPaginaVentas, totalPaginas: totalPaginasVentas, itemsPagina: ventasPagina, pageSize: pageSizeVentas } = usePaginacion(ventasFiltradas);

  // Un cambio con varios artículos queda emitido como varias filas en cambios_articulo
  // (mismo "nro") — se agrupan acá para mostrarlo como una única transacción.
  const cambiosAgrupados = useMemo(() => {
    const grupos = new Map();
    for (const c of cambiosArticulo || []) {
      if (!grupos.has(c.nro)) {
        grupos.set(c.nro, {
          nro: c.nro, fecha: c.fecha, hora: c.hora,
          ventaOriginalId: c.ventaOriginalId, ventaOriginalCliente: c.ventaOriginalCliente,
          ventaOriginalClienteId: c.ventaOriginalClienteId,
          usuario: c.usuario, formaPagoDif: c.formaPagoDif, motivo: c.motivo,
          depositoId: c.depositoId, estado: c.estado, createdAt: c.createdAt,
          id: c.id, totalViejo: 0, totalNuevo: 0, diferencia: 0, rows: [],
        });
      }
      const g = grupos.get(c.nro);
      g.rows.push(c);
      g.totalViejo += c.totalViejo || 0;
      g.totalNuevo += c.totalNuevo || 0;
      g.diferencia += c.diferencia || 0;
      if (c.id > g.id) g.id = c.id;
    }
    return [...grupos.values()].sort((a, b) => b.id - a.id);
  }, [cambiosArticulo]);

  const { pagina: paginaCambios, setPagina: setPaginaCambios, totalPaginas: totalPaginasCambios, itemsPagina: cambiosPagina, pageSize: pageSizeCambios } = usePaginacion(cambiosAgrupados);

  // Anula un cambio (todas sus filas, comparten "nro"): revierte el stock de
  // cada artículo involucrado y, si había generado un crédito en cuenta
  // corriente, lo cancela. El resto (dejar de contar en Caja) es automático:
  // Caja ya filtra las filas con estado "anulada".
  const handleAnularCambio = async (grupo, motivo) => {
    const { puede, motivo: motivoBloqueo } = cambioEditable(grupo, caja, periodosCerrados);
    if (!puede) { toast(motivoBloqueo, "warning"); return; }

    try {
      await anularCambioArticulo(grupo.nro, motivo);

      const deltas = {};
      const acumular = (productoId, delta) => {
        if (!productoId) return;
        deltas[productoId] = (deltas[productoId] || 0) + delta;
      };
      grupo.rows.forEach(par => {
        if (par.itemViejo?.productoId) acumular(par.itemViejo.productoId, -par.itemViejo.qty); // se retira lo que se había devuelto
        if (par.productoNuevo?.id)     acumular(par.productoNuevo.id, par.qtyNuevo);            // vuelve al stock lo que se había llevado
      });
      const cambiosStock = Object.entries(deltas).map(([productoId, delta]) => ({
        productoId: Number(productoId), depositoId: grupo.depositoId, delta,
      }));
      if (cambiosStock.length && aplicarDeltaStockMultiple) {
        try {
          await aplicarDeltaStockMultiple(cambiosStock);
        } catch {
          toast("Cambio anulado. Error al revertir el stock — verificá manualmente.", "warning");
        }
      }
      // Mismo ajuste también en el total (productos.stock) — el cambio
      // original tampoco lo tocaba, así que anularlo no debía "revertir"
      // algo que nunca se aplicó; ahora que el confirm sí lo actualiza, el
      // anular tiene que revertirlo también.
      if (cambiosStock.length && aplicarDeltaStockProductoMultiple) {
        try {
          await aplicarDeltaStockProductoMultiple(cambiosStock.map(c => ({ productoId: c.productoId, delta: c.delta })));
        } catch {
          toast("Cambio anulado. Error al revertir el stock total — verificá manualmente.", "warning");
        }
      }

      if (grupo.diferencia < 0 && grupo.formaPagoDif === "Cuenta Corriente") {
        // Comparación exacta, no substring: con miles de cambios emitidos, un
        // "NC-1234" podría ser prefijo literal de "NC-12345" y el includes()
        // terminaría revirtiendo el pago de otro cliente.
        const pago = (pagosCtaCte || []).find(p => p.observacion === `Nota de crédito ${grupo.nro} — cambio de artículo`);
        if (pago && eliminarPagoCtaCte) {
          try {
            await eliminarPagoCtaCte(pago.id);
          } catch {
            toast("Cambio anulado. Error al revertir la cuenta corriente — verificá el saldo del cliente.", "warning");
          }
        }
      }

      toast("Cambio anulado.", "success");
    } catch (err) {
      toast(err.message || "Error al anular el cambio.", "error");
      throw err;
    }
  };

  const cantPendientesRetiro = useMemo(() => ventas.filter(v => v.estado === "pendiente").length, [ventas]);

  const limpiarFiltros = () => {
    setFUsuario("");
    setFCliente("");
    setFDesde(daysAgo(3));
    setFHasta(today());
    setFPago("");
    setFTipo("");
    setFArticulo("");
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Tabs ── */}
      <div style={{ display:"flex", background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", alignSelf:"flex-start" }}>
        {[{ id:"ventas", label:"Ventas" }, { id:"cambios", label:"Cambios" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:"7px 16px", fontSize:13, fontWeight:500, border:"none", cursor:"pointer",
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text2)" }}>
            {t.label}
            {t.id === "cambios" && (cambiosArticulo?.length || 0) > 0 && (
              <span style={{ marginLeft:6, background:"rgba(255,255,255,0.25)", borderRadius:10, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                {cambiosArticulo.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "ventas" && <>

      {/* ═══ FORMULARIO NUEVA VENTA ═══════════════════════════════════ */}
      <div className="card" style={{ position: "relative" }}>
        <div className="card-title">Nueva venta</div>

        {permitirStockNegativo && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, fontSize: 12, color: "var(--amber)", display: "flex", gap: 6, alignItems: "center" }}>
            <Icon name="box" size={13}/>
            Stock en negativo activado: se pueden registrar ventas aunque no haya stock suficiente.
          </div>
        )}

        {/* Overlay bloqueante cuando la caja está cerrada */}
        {!caja.abierta && (
          <div className="caja-overlay">
            <div className="caja-overlay-body">
              <div className="caja-overlay-icon">
                <Icon name="cash" size={28} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text1)", marginBottom: 6 }}>
                Caja cerrada
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
                No se pueden registrar ni modificar ventas con la caja cerrada.
                Abrila desde la sección <strong style={{ color: "var(--text2)" }}>Caja</strong> para continuar.
              </div>
            </div>
          </div>
        )}

        <div className="venta-layout">

          {/* ── Columna izquierda ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Cliente */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title">Cliente</div>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  placeholder="Buscar por nombre o DNI (vacío = Consumidor Final)"
                  value={clienteInput}
                  onChange={e => { setClienteInput(e.target.value); setClienteSelec(null); }}
                />
                {clienteInput && clienteSugs.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                    background: "var(--bg3)", border: "1px solid var(--border2)",
                    borderRadius: "var(--radius)", marginTop: 4,
                    maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                  }}>
                    {clienteSugs.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={e => { e.preventDefault(); setClienteSelec(c); setClienteInput(c.nombre); }}
                        style={{
                          padding: "10px 14px", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderBottom: "1px solid var(--border)", fontSize: 13,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div>
                          <div style={{ color: "var(--text1)", fontWeight: 500 }}>{c.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>DNI {c.dni} · {c.iva}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {clienteSelec
                    ? `Seleccionado: ${clienteSelec.nombre} — ${clienteSelec.iva}`
                    : "Consumidor Final (sin selección)"}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setShowNuevoCliente(true)}
                >
                  <Icon name="plus" size={13}/> Nuevo cliente
                </button>
              </div>

              {esCtaCte && clienteSelec && (
                <InfoCtaCte
                  cliente={clienteSelec}
                  ventas={ventas}
                  pagosCtaCte={pagosCtaCte}
                  cambiosArticulo={cambiosArticulo}
                  montoNuevaVenta={montoCtaCteForm}
                />
              )}
            </div>

            {/* Configuración */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Configuración</span>
                {permisos?.[usuarioActivo?.id]?.gestionarPreciosVenta && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowGestionListas(true)}>
                      <Icon name="tag" size={13}/> Gestionar listas
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowGestionPromociones(true)}>
                      <Icon name="tag" size={13}/> Gestionar promociones
                    </button>
                  </div>
                )}
              </div>

              {/* Fila 1: lista, pago, tipo */}
              <div className="form-row form-row-3" style={{ gap: 10, marginBottom: 10 }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Lista de precios</span>
                    {listaFijadaPorPago && (
                      <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400, textTransform: "none" }}>
                        fijada por medio de pago
                      </span>
                    )}
                  </label>
                  <select
                    className="form-select"
                    value={lista.id}
                    disabled={listaFijadaPorPago}
                    style={listaFijadaPorPago ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
                    onChange={e => setLista(listasActivas.find(l => l.id === parseInt(e.target.value)))}>
                    {listasActivas.map(l => (
                      <option key={l.id} value={l.id}>{labelLista(l)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  {esSeña ? (
                    <>
                      <label className="form-label">Forma de pago</label>
                      <div style={{ padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                        Se define abajo, en "Seña"
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Forma de pago</span>
                        <button
                          type="button"
                          onClick={modoPago === "unico" ? activarPagoDividido : activarPagoUnico}
                          style={{ background: "none", border: "none", color: "var(--accent2)", fontSize: 11, cursor: "pointer", padding: 0 }}
                        >
                          {modoPago === "unico" ? "Dividir pago" : "Pago único"}
                        </button>
                      </label>
                      {modoPago === "unico" ? (
                        <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                          {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                        </select>
                      ) : (
                        <div style={{ padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                          {pagosSplit.length} medio{pagosSplit.length !== 1 ? "s" : ""} de pago (ver abajo)
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de comprobante</label>
                  <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option>Mostrador</option>
                    <option>Comprobante electrónico</option>
                  </select>
                </div>
              </div>

              {/* Tarjeta + cuotas — solo pago único con "Tarjeta Crédito" y si hay tarjetas cargadas (no aplica a señas) */}
              {!esSeña && modoPago === "unico" && formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && (
                <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Tarjeta</label>
                    <select className="form-select" value={tarjetaId ?? ""} onChange={e => setTarjetaId(Number(e.target.value))}>
                      {tarjetas.map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}{t.banco ? ` (${t.banco})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cuotas</label>
                    {tarjetaSeleccionada?.cuotas.length > 0 ? (
                      <select className="form-select" value={cuotasSel ?? ""} onChange={e => setCuotasSel(Number(e.target.value))}>
                        {tarjetaSeleccionada.cuotas.map(c => (
                          <option key={c.id} value={c.cuotas}>
                            {c.cuotas} cuota{c.cuotas !== 1 ? "s" : ""}{c.interesPct > 0 ? ` (+${c.interesPct}%)` : " (sin interés)"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                        Sin cuotas cargadas para esta tarjeta
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pago dividido: filas de medio de pago + monto (no aplica a señas) */}
              {!esSeña && modoPago === "dividido" && (
                <div style={{ marginBottom: 10, padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                    Medios de pago
                  </div>
                  {pagosSplit.map((p, idx) => {
                    const tarjetaFila = tarjetas.find(t => t.id === p.tarjetaId);
                    const montoFinal  = montoFinalFila(p);
                    const conRecargo  = montoFinal !== (Number(p.monto) || 0);
                    return (
                      <div key={idx} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select className="form-select" style={{ flex: 1 }} value={p.formaPago}
                            onChange={e => editarPagoSplit(idx, "formaPago", e.target.value)}>
                            {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                          </select>
                          <input
                            className="form-input mono" type="number" style={{ width: 130 }} placeholder="Monto"
                            value={p.monto} onChange={e => editarPagoSplit(idx, "monto", e.target.value)}
                          />
                          <button
                            onClick={() => quitarPagoSplit(idx)}
                            disabled={pagosSplit.length <= 1}
                            style={{ background: "none", border: "none", cursor: pagosSplit.length <= 1 ? "not-allowed" : "pointer", color: "var(--red)", padding: 4, opacity: pagosSplit.length <= 1 ? 0.4 : 1 }}
                          >
                            <Icon name="trash" size={14}/>
                          </button>
                        </div>
                        {p.formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={p.tarjetaId ?? ""}
                              onChange={e => editarPagoSplit(idx, "tarjetaId", e.target.value)}>
                              {tarjetas.map(t => (
                                <option key={t.id} value={t.id}>{t.nombre}{t.banco ? ` (${t.banco})` : ""}</option>
                              ))}
                            </select>
                            {tarjetaFila?.cuotas.length > 0 ? (
                              <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={p.cuotas ?? ""}
                                onChange={e => editarPagoSplit(idx, "cuotas", e.target.value)}>
                                {tarjetaFila.cuotas.map(c => (
                                  <option key={c.id} value={c.cuotas}>
                                    {c.cuotas} cuota{c.cuotas !== 1 ? "s" : ""}{c.interesPct > 0 ? ` (+${c.interesPct}%)` : " (sin interés)"}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>Sin cuotas cargadas</span>
                            )}
                          </div>
                        )}
                        {conRecargo && (
                          <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2, textAlign: "right" }}>
                            Con recargo: {fmt(montoFinal)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <button className="btn btn-sm btn-ghost" onClick={agregarPagoSplit}>
                      <Icon name="plus" size={13}/> Agregar medio de pago
                    </button>
                    <span style={{ fontSize: 12, fontWeight: 600, color: pagosSplitOk ? "var(--green)" : "var(--amber)" }}>
                      Asignado: {fmt(sumaPagosSplit)} de {fmt(subtotal)}
                      {!pagosSplitOk && (
                        sumaPagosSplit < subtotal
                          ? ` (falta ${fmt(subtotal - sumaPagosSplit)})`
                          : ` (sobra ${fmt(sumaPagosSplit - subtotal)})`
                      )}
                    </span>
                  </div>
                  {totalConRecargoSplit !== sumaPagosSplit && (
                    <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, color: "var(--amber)", marginTop: 4 }}>
                      Total con recargo de tarjeta: {fmt(totalConRecargoSplit)}
                    </div>
                  )}
                </div>
              )}

              {/* Fila IVA discriminado — solo para Comprobante electrónico */}
              {esComprobante && (
                <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Tipo de factura</label>
                    <select className="form-select" value={tipoFactura} onChange={e => setTipoFactura(e.target.value)}>
                      {TIPOS_FACTURA_VENTA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alícuota IVA</label>
                    <select className="form-select" value={alicuotaIva} onChange={e => setAlicuotaIva(parseFloat(e.target.value))}>
                      {ALICUOTAS_IVA.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Fila 2: depósito + tipo de operación */}
              <div className="form-row form-row-2" style={{ gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Depósito de origen</label>
                  <select
                    className="form-select"
                    value={depositoId || ""}
                    onChange={e => { setDepositoId(parseInt(e.target.value)); setItems([]); }}
                  >
                    <option value="">— Seleccionar —</option>
                    {depositosNormales.map(d => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de operación</label>
                  <div className="segmented-control">
                    <button
                      type="button"
                      className={`segmented-btn${!esSeña ? " active" : ""}`}
                      onClick={() => setEsSeña(false)}
                    >
                      Venta
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${esSeña ? " active" : ""}`}
                      onClick={() => { setEsSeña(true); setModoPago("unico"); }}
                      title="Cobrá una seña parcial ahora; el resto se cobra cuando el cliente retira la mercadería."
                    >
                      Venta con retiro después
                    </button>
                  </div>
                </div>
              </div>

              {/* Info + formulario de seña */}
              {esSeña && depositoId && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ padding: "8px 12px", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", borderRadius: 6, fontSize: 12, color: "var(--accent2)", display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                    <Icon name="box" size={13}/>
                    Artículos reservados: <strong>{depositoNombre}</strong> → <strong>{depositoReserva?.nombre || "Reservas"}</strong>, stock total sin cambios hasta que el cliente retire y se complete el retiro.
                  </div>
                  <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 4 }}>
                    <div className="form-group">
                      <label className="form-label">Monto de la seña</label>
                      <input className="form-input" type="number" min="0" placeholder="0" value={señaMonto} onChange={e => setSeñaMonto(e.target.value)} />
                      {totalConInteres > 0 && (
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                          Saldo pendiente: <strong style={{ color: (totalConInteres - (Number(señaMonto) || 0)) > 0 ? "var(--amber)" : "var(--green)" }}>
                            {fmt(Math.max(0, totalConInteres - (Number(señaMonto) || 0)))}
                          </strong>
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Forma de pago de la seña</label>
                      <select className="form-select" value={señaFormaPago} onChange={e => setSeñaFormaPago(e.target.value)}>
                        {FORMAS_PAGO.filter(f => f !== "Cuenta Corriente").map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {esCtaCte && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, fontSize: 12, color: "var(--amber)" }}>
                  Cuenta corriente: se registrará un saldo pendiente de <strong>{fmt(montoCtaCteForm)}</strong> en el cliente seleccionado.
                  {pctMoraVenta > 0 && (
                    <> Por mora acumulada ({diasMoraSel} días), esta venta lleva un recargo de <strong>+{pctMoraVenta}%</strong>.</>
                  )}
                </div>
              )}

              {/* Descripción / nota interna de la venta */}
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Descripción (opcional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  style={{ resize: "vertical" }}
                  placeholder="Nota interna sobre esta venta..."
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                />
              </div>
            </div>

            {/* Productos */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title">Productos</div>

              {/* Buscador */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", pointerEvents: "none" }}>
                  <Icon name="search" size={14} />
                </div>
                <input
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                  placeholder="Buscar o escanear código..."
                  value={busqueda}
                  onChange={e => handleBusquedaChange(e.target.value)}
                  onFocus={() => busqueda && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  onKeyDown={handleBusquedaKeyDown}
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
                        onMouseDown={e => { e.preventDefault(); addItem(p); }}
                        style={{
                          padding: "10px 14px",
                          cursor: p.stockDeposito === 0 ? "not-allowed" : "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderBottom: "1px solid var(--border)", fontSize: 13,
                          opacity: p.stockDeposito === 0 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => { if (p.stockDeposito > 0) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"; }}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div>
                          <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.codigo} · {p.rubro || p.categoria}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ color: "var(--accent2)", fontWeight: 600 }}>
                            {fmt(precioFinal(p))}
                          </div>
                          {p.stockDeposito === 0
                            ? <div style={{ fontSize: 11, color: "var(--red)" }}>Sin stock en depósito</div>
                            : <div style={{ fontSize: 11, color: "var(--text3)" }}>{depositoNombre}: {p.stockDeposito}</div>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Botón abrir catálogo completo */}
              <button
                className="btn btn-sm"
                style={{ flexShrink: 0, height: 38, whiteSpace: "nowrap" }}
                onClick={() => caja.abierta && setShowCatalogo(true)}
                disabled={!caja.abierta}
              >
                <Icon name="box" size={13} /> Catálogo
              </button>
              </div>{/* fin flex buscador */}

              {/* Carrito */}
              <div style={{
                background: "var(--bg3)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", overflow: "hidden", minHeight: 100
              }}>
                {items.length === 0 ? (
                  <div style={{ padding: 36, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                    <Icon name="box" size={26} /><br />
                    Buscá un producto para agregar
                  </div>
                ) : (
                  <>
                  {promociones.filter(p => p.activa).length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg4)" }}>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>Aplicar promoción a todo el carrito:</span>
                      <select
                        className="form-select"
                        style={{ fontSize: 12, padding: "3px 6px", width: "auto" }}
                        value=""
                        onChange={e => {
                          const promo = promociones.find(p => p.id === Number(e.target.value)) || null;
                          aplicarPromoATodos(promo);
                          e.target.value = "";
                        }}
                      >
                        <option value="">Elegir promoción…</option>
                        {promociones.filter(p => p.activa).map(p => (
                          <option key={p.id} value={p.id}>{p.nombre} (−{p.pct}%)</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {items.map(item => (
                    <div key={item.productoId} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderBottom: "1px solid var(--border)"
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.nombre}
                          {item.codigo && (
                            <span className="mono" style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400, marginLeft: 6 }}>{item.codigo}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                          {item.promoId && (
                            <span style={{ fontSize: 11, color: "var(--text3)", textDecoration: "line-through", opacity: 0.7 }}>{fmt(item.precioBase)}</span>
                          )}
                          {configPrecios?.permitirEditarPrecioVenta ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <input
                                type="number" min="0"
                                value={item.precio}
                                onChange={e => editarPrecioManual(item.productoId, e.target.value)}
                                title="Precio de venta editable — temporal, mientras se cargan bien los precios del sistema"
                                style={{
                                  width: 64, fontSize: 11, padding: "1px 4px", borderRadius: 4,
                                  background: item.precioManual ? "rgba(245,158,11,0.1)" : "var(--bg4)",
                                  border: `1px solid ${item.precioManual ? "var(--amber)" : "var(--border2)"}`,
                                  color: item.precioManual ? "var(--amber)" : "var(--text2)",
                                }}
                              />
                              <span style={{ fontSize: 11, color: "var(--text3)" }}>c/u</span>
                            </span>
                          ) : item.promoId ? (
                            <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>{fmt(item.precio)} c/u</span>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text3)" }}>{fmt(item.precio)} c/u</span>
                          )}
                          {promociones.filter(p => p.activa).length > 0 && (
                            <select
                              value={item.promoId ?? ""}
                              onChange={e => aplicarPromoItem(item.productoId, promociones.find(p => p.id === Number(e.target.value)) || null)}
                              style={{
                                fontSize: 10, padding: "1px 4px", borderRadius: 4,
                                background: "var(--bg4)", border: "1px solid var(--border2)",
                                color: item.promoId ? "var(--green)" : "var(--text3)",
                              }}
                            >
                              <option value="">Sin promo</option>
                              {promociones.filter(p => p.activa).map(p => (
                                <option key={p.id} value={p.id}>{p.nombre} (−{p.pct}%)</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => changeQty(item.productoId, -1)} className="qty-btn">−</button>
                        <span style={{ fontSize: 13, minWidth: 24, textAlign: "center", color: "var(--text1)", fontWeight: 600 }}>
                          {item.qty}
                        </span>
                        <button onClick={() => changeQty(item.productoId, +1)} className="qty-btn">+</button>
                      </div>
                      <div style={{ minWidth: 80, textAlign: "right", fontWeight: 600, color: "var(--accent2)", flexShrink: 0 }}>
                        {fmt(item.precio * item.qty)}
                      </div>
                      <button
                        onClick={() => removeItem(item.productoId)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                  </>
                )}
              </div>
            </div>

          </div>
          {/* fin columna izquierda */}

          {/* ── Panel resumen ── */}
          <div className="venta-panel">
            <div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Resumen
              </div>
              {[
                ["Cliente",   clienteFinal],
                ["Lista",     `${lista.nombre}${lista.pct !== 0 ? ` (${lista.pct > 0 ? "+" : ""}${lista.pct}%)` : ""}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>{k}</span>
                  <span style={{ textAlign: "right", color: "var(--text1)" }}>{v}</span>
                </div>
              ))}
              {esSeña ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                    <span style={{ flexShrink: 0 }}>Seña ({señaFormaPago})</span>
                    <span style={{ textAlign: "right", color: "var(--green)" }}>{fmt(Number(señaMonto) || 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                    <span style={{ flexShrink: 0 }}>Saldo pendiente</span>
                    <span style={{ textAlign: "right", color: (totalConInteres - (Number(señaMonto) || 0)) > 0 ? "var(--amber)" : "var(--green)" }}>
                      {fmt(Math.max(0, totalConInteres - (Number(señaMonto) || 0)))}
                    </span>
                  </div>
                </>
              ) : modoPago === "unico" ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>Pago</span>
                  <span style={{ textAlign: "right", color: "var(--text1)" }}>{formaPago}</span>
                </div>
              ) : (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)" }}>
                    <span>Pago</span><span style={{ color: "var(--text1)" }}>Dividido</span>
                  </div>
                  {pagosSplit.map((p, i) => {
                    const montoFinal = montoFinalFila(p);
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", paddingLeft: 8, marginTop: 2 }}>
                        <span>{p.formaPago}{p.formaPago === "Tarjeta Crédito" && p.cuotas > 1 ? ` (${p.cuotas} cuotas)` : ""}</span>
                        <span>{fmt(montoFinal)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {[
                ["Tipo",      tipo],
                ["Depósito",  depositoNombre],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>{k}</span>
                  <span style={{ textAlign: "right", color: "var(--text1)" }}>{v}</span>
                </div>
              ))}
              {esSeña && (
                <div style={{ marginTop: 4, marginBottom: 6 }}>
                  <span className="badge" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent2)", fontSize: 11 }}>
                    SEÑA — Reserva a {depositoReserva?.nombre}
                  </span>
                </div>
              )}
              {pctMoraVenta > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--amber)", marginBottom: 6, gap: 8 }}>
                  <span>Recargo por mora ({diasMoraSel} días)</span>
                  <span>+{pctMoraVenta}%</span>
                </div>
              )}
              {interesTarjetaPct > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--amber)", marginBottom: 6, gap: 8 }}>
                  <span>Recargo tarjeta ({cuotasSel} cuota{cuotasSel !== 1 ? "s" : ""})</span>
                  <span>+{interesTarjetaPct}%</span>
                </div>
              )}
              <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
              {esComprobante && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6 }}>
                    <span>Neto</span>
                    <span style={{ color: "var(--text1)" }}>{fmt(neto)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6 }}>
                    <span>IVA ({alicuotaIva}%)</span>
                    <span style={{ color: "var(--text1)" }}>{fmt(iva)}</span>
                  </div>
                  <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500 }}>Total</span>
                <span style={{ fontSize: 26, fontWeight: 700, color: "var(--accent2)" }}>
                  {fmt(totalFinal)}
                </span>
              </div>
              {items.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text3)", textAlign: "right" }}>
                  {items.reduce((a, i) => a + i.qty, 0)} artículo{items.reduce((a, i) => a + i.qty, 0) !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 20 }}>
              <button
                className="btn btn-primary"
                onClick={confirmar}
                disabled={!pagosSplitOk || guardandoVenta}
                title={!pagosSplitOk ? "La suma de los medios de pago debe coincidir con el total" : ""}
                style={{ width: "100%", justifyContent: "center", background: esSeña ? "var(--accent)" : undefined }}
              >
                <Icon name="check" size={15} /> {guardandoVenta ? "Guardando..." : (esSeña ? "Registrar seña" : "Confirmar venta")}
              </button>
              <button className="btn" onClick={limpiarForm} style={{ width: "100%", justifyContent: "center" }}>
                Limpiar
              </button>
            </div>
          </div>

        </div>
      </div>
      {/* fin formulario */}

      {/* ═══ HISTORIAL DE VENTAS ══════════════════════════════════════ */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Historial de ventas</div>
            {fTipo && (
              <span className={`badge ${fTipo === "Comprobante" ? "badge-ok" : "badge-warn"}`} style={{ fontSize: 10 }}>
                {fTipo}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className={`btn btn-sm ${soloPendientesRetiro ? "btn-primary" : ""}`}
              onClick={() => setSoloPendientesRetiro(v => !v)}
            >
              Pendientes de retiro{cantPendientesRetiro > 0 ? ` (${cantPendientesRetiro})` : ""}
            </button>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {ventasFiltradas.length} resultado{ventasFiltradas.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Filtros */}
        <div className="filtros-grid" style={{ opacity: soloPendientesRetiro ? 0.4 : 1, pointerEvents: soloPendientesRetiro ? "none" : "auto" }}>
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input className="form-input" placeholder="Todos" value={fUsuario} onChange={e => setFUsuario(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <input className="form-input" placeholder="Todos" value={fCliente} onChange={e => setFCliente(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Desde</label>
            <input type="date" className="form-input" value={fDesde} onChange={e => setFDesde(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hasta</label>
            <input type="date" className="form-input" value={fHasta} onChange={e => setFHasta(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pago</label>
            <select className="form-select" value={fPago} onChange={e => setFPago(e.target.value)}>
              <option value="">Todas</option>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Artículo</label>
            <input className="form-input" placeholder="Buscar..." value={fArticulo} onChange={e => setFArticulo(e.target.value)} />
          </div>
          <button
            className="btn btn-sm"
            onClick={limpiarFiltros}
            title="Limpiar filtros"
            style={{ alignSelf: "flex-end", height: 38 }}
          >
            <Icon name="close" size={13} /> Limpiar
          </button>
        </div>

        {/* Tabla con scroll */}
        <div className="hist-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Depósito</th>
                <th>Pago</th>
                <th>Artículos</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--text3)", padding: 40 }}>
                    No hay ventas en el rango seleccionado
                  </td>
                </tr>
              ) : (
                ventasPagina.map(v => {
                  const anulada    = v.estado === "anulada";
                  const motivoEdit = motivoNoEditar(v);
                  const motivoAnul = motivoNoAnular(v);
                  // Fila "bloqueada": no editable por estado de caja/turno (no por permisos ni por anulada, que ya tienen su propio estilo)
                  const bloqueada  = !anulada && !ventaEditable(v, caja, periodosCerrados).puede;
                  return (
                    <tr
                      key={v.id}
                      style={{
                        borderLeft: anulada
                          ? "2px solid rgba(242,107,91,0.5)"
                          : v.tipo === "Mostrador"
                            ? "2px solid rgba(245,158,11,0.35)"
                            : undefined,
                        opacity: anulada ? 0.55 : 1,
                        background: bloqueada ? "color-mix(in srgb, var(--border) 35%, transparent)" : undefined,
                      }}
                    >
                      <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>#{v.id}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtFechaAR(v.fecha)}</td>
                      <td style={{ color: "var(--text2)" }}>{v.usuario || "—"}</td>
                      <td style={{ color: "var(--text1)", textDecoration: anulada ? "line-through" : "none" }}>
                        {v.cliente}
                        {v.descripcion && (
                          <span title={v.descripcion} style={{ marginLeft: 5, color: "var(--text3)", cursor: "help" }}>
                            <Icon name="info" size={12} />
                          </span>
                        )}
                        {(recibos || []).filter(r => r.ventaId === v.id && r.tipo !== "Recibo" && r.estado !== "anulada").map(r => (
                          <span
                            key={r.id}
                            title={`${r.tipo} ${r.numero} — ${fmt(r.monto)}`}
                            style={{
                              marginLeft: 5, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                              background: r.tipo === "Nota de Crédito" ? "rgba(96,165,250,0.14)" : "rgba(245,158,11,0.14)",
                              color: r.tipo === "Nota de Crédito" ? "var(--blue)" : "var(--amber)",
                            }}
                          >
                            {r.tipo === "Nota de Crédito" ? "NC" : "ND"}
                          </span>
                        ))}
                      </td>
                      <td>
                        {anulada ? (
                          <span className="badge badge-danger" style={{ fontSize: 10 }}>ANULADA</span>
                        ) : v.tipo === "Comprobante" ? (
                          <span className="badge badge-ok" style={{ fontSize: 10 }}>Comprobante</span>
                        ) : (
                          <span className="badge badge-warn" style={{ fontSize: 10 }}>Mostrador</span>
                        )}
                        {v.tipoFactura && !anulada && (
                          <span style={{ marginLeft: 5, fontSize: 10, color: "var(--text3)" }}>{v.tipoFactura}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 12, color: "var(--text2)" }}>{v.depositoNombre || "—"}</span>
                          {v.esSeña && !anulada && (
                            <span className="badge" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent2)", fontSize: 10 }}>
                              {v.estado === "pendiente" ? "SEÑA · Pendiente" : "SEÑA · Retirada"}
                            </span>
                          )}
                          {v.esSeña && v.estado === "pendiente" && !anulada && (
                            <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>
                              Saldo: {fmt(v.total - pagosDeVenta(v).reduce((a, p) => a + p.monto, 0))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {v.pagos && v.pagos.length > 1 ? (
                          <span
                            className="badge badge-accent"
                            title={v.pagos.map(p => `${p.formaPago}: ${fmt(p.monto)}`).join(" · ")}
                          >
                            Combinado ({v.pagos.length})
                          </span>
                        ) : v.formaPago === "Cuenta Corriente" ? (
                          <span className="badge badge-warn">Cta. Cte.</span>
                        ) : (
                          <span className="badge badge-blue">{v.formaPago}</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text3)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.items?.map(i => `${i.qty}× ${i.nombre}`).join(", ") || "—"}
                      </td>
                      <td style={{ color: anulada ? "var(--text3)" : "var(--accent2)", fontWeight: 600, whiteSpace: "nowrap", textDecoration: anulada ? "line-through" : "none" }}>
                        {fmt(v.total)}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm" onClick={() => setShowTicket(v)}>Ver</button>
                          {v.estado === "pendiente" && !anulada && (
                            <button
                              className="btn btn-sm btn-success"
                              title={motivoNoRetirar(v) || "Retirar / cobrar"}
                              onClick={() => {
                                const motivo = motivoNoRetirar(v);
                                if (motivo) { toast(motivo, "warning"); return; }
                                setShowCompletarRetiro(v);
                              }}
                            >
                              Retirar / cobrar
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            title={motivoEdit || ""}
                            onClick={() => {
                              if (motivoEdit) { toast(motivoEdit, "warning"); return; }
                              setVentaParaEditar(v);
                            }}
                            style={{
                              color: motivoEdit ? "var(--text3)" : "var(--accent2)",
                              borderColor: motivoEdit ? "var(--border)" : "color-mix(in srgb, var(--accent) 30%, transparent)",
                              opacity: motivoEdit ? 0.35 : 1,
                              cursor: motivoEdit ? "not-allowed" : "pointer",
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-sm"
                            title={motivoAnul || "Anular esta venta"}
                            onClick={() => {
                              if (motivoAnul) { toast(motivoAnul, "warning"); return; }
                              setShowAnulacion(v);
                            }}
                            style={{
                              color: motivoAnul ? "var(--text3)" : "var(--red)",
                              borderColor: motivoAnul ? "var(--border)" : "rgba(242,107,91,0.35)",
                              opacity: motivoAnul ? 0.35 : 1,
                              cursor: motivoAnul ? "not-allowed" : "pointer",
                            }}
                          >
                            Anular
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Paginacion pagina={paginaVentas} totalPaginas={totalPaginasVentas} onCambiar={setPaginaVentas} totalItems={ventasFiltradas.length} pageSize={pageSizeVentas} etiqueta="ventas" />
      </div>

      </>}

      {tab === "cambios" && <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Cambios de artículo</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {cambiosAgrupados.length} resultado{cambiosAgrupados.length !== 1 ? "s" : ""}
            </span>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => caja.abierta && setShowCambioArt(true)}
              disabled={!caja.abierta}
              title={!caja.abierta ? "Abrí la caja para registrar cambios" : ""}
            >
              <Icon name="tag" size={13} /> Nuevo cambio
            </button>
          </div>
        </div>

        <div className="hist-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nro</th>
                <th>Fecha</th>
                <th>Venta original</th>
                <th>Cliente</th>
                <th>Devuelve</th>
                <th>Recibe</th>
                <th>Diferencia</th>
                <th>Medio</th>
                <th>Usuario</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cambiosAgrupados.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--text3)", padding: 40 }}>
                    Sin cambios registrados
                  </td>
                </tr>
              ) : (
                cambiosPagina.map(g => {
                  const anulado = g.estado === "anulada";
                  const { puede: puedeAnular, motivo: motivoNoAnularCambio } = cambioEditable(g, caja, periodosCerrados);
                  const sinPermiso = !permisos?.[usuarioActivo?.id]?.cambioArticulo;
                  const motivoBloqueo = anulado ? null : (sinPermiso ? "No tenés permiso para anular cambios." : (!puedeAnular ? motivoNoAnularCambio : null));
                  return (
                    <tr key={g.nro} style={anulado ? { opacity: 0.5 } : undefined}>
                      <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>
                        {g.nro}
                        {anulado && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--red)" }}>
                            ANULADO
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtFechaAR(g.fecha)}</td>
                      <td className="mono" style={{ color: "var(--text2)", fontSize: 12 }}>#{g.ventaOriginalId}</td>
                      <td style={{ color: "var(--text1)" }}>{g.ventaOriginalCliente}</td>
                      <td style={{ fontSize: 12, color: "var(--text3)" }}>
                        {g.rows.filter(r => r.itemViejo?.nombre).map((r, i) => <div key={i}>{r.itemViejo.qty}× {r.itemViejo.nombre}</div>)}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text3)" }}>
                        {g.rows.filter(r => r.productoNuevo?.id).map((r, i) => <div key={i}>{r.qtyNuevo}× {r.productoNuevo.nombre}</div>)}
                      </td>
                      <td style={{
                        fontWeight: 600, whiteSpace: "nowrap",
                        color: g.diferencia < 0 ? "var(--amber)" : g.diferencia > 0 ? "var(--blue)" : "var(--green)"
                      }}>
                        {g.diferencia === 0 ? "Sin diferencia" : fmt(Math.abs(g.diferencia))}
                      </td>
                      <td style={{ fontSize: 12, color: g.formaPagoDif === "Cuenta Corriente" ? "var(--amber)" : "var(--text3)" }}>
                        {g.diferencia === 0 ? "—" : (g.formaPagoDif || "—")}
                      </td>
                      <td style={{ color: "var(--text2)" }}>{g.usuario || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => setComprobanteCambio(g.rows)}>Ver</button>
                          {!anulado && (
                            <button
                              className="btn btn-sm"
                              title={motivoBloqueo || "Anular este cambio"}
                              onClick={() => {
                                if (motivoBloqueo) { toast(motivoBloqueo, "warning"); return; }
                                setShowAnulacionCambio(g);
                              }}
                              style={{
                                color: motivoBloqueo ? "var(--text3)" : "var(--red)",
                                borderColor: motivoBloqueo ? "var(--border)" : "rgba(242,107,91,0.35)",
                                opacity: motivoBloqueo ? 0.35 : 1,
                                cursor: motivoBloqueo ? "not-allowed" : "pointer",
                              }}
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Paginacion pagina={paginaCambios} totalPaginas={totalPaginasCambios} onCambiar={setPaginaCambios} totalItems={cambiosAgrupados.length} pageSize={pageSizeCambios} etiqueta="cambios" />
      </div>

      </>}

      {/* Modales */}
      {ventaParaEditar && (
        <ModalEditarVenta
          venta={ventaParaEditar}
          productos={productos}
          listas={listas}
          clientes={clientes}
          setClientes={setClientes}
          stockDepositos={stockDepositos}
          depositos={depositosNormales}
          tarjetas={tarjetas}
          margenBase={margenBase}
          rubros={rubros}
          proveedores={proveedores}
          usuarioActivo={usuarioActivo}
          ventas={ventas}
          pagosCtaCte={pagosCtaCte}
          cambiosArticulo={cambiosArticulo}
          onGuardar={handleGuardarEdicion}
          onClose={() => setVentaParaEditar(null)}
        />
      )}
      {showCatalogo && (
        <ModalBuscadorProductos
          productos={productos}
          lista={lista}
          margenBase={margenBase}
          rubrosDB={rubros}
          proveedores={proveedores}
          recargoPct={pctMoraVenta}
          depositoId={depositoId}
          depositoNombre={depositoNombre}
          stockDepositos={stockDepositos}
          permitirStockNegativo={permitirStockNegativo}
          onAgregar={addItem}
          onClose={() => setShowCatalogo(false)}
        />
      )}
      {showGestionListas && (
        <ModalGestionListas
          listas={listas}
          setListas={setListas}
          productos={productos}
          setProductos={setProductos}
          agregarLista={agregarLista}
          actualizarLista={actualizarLista}
          eliminarLista={eliminarLista}
          configPrecios={configPrecios}
          actualizarConfigPrecios={actualizarConfigPrecios}
          usuarioActivo={usuarioActivo}
          onClose={() => setShowGestionListas(false)}
        />
      )}
      {showGestionPromociones && (
        <ModalGestionPromociones
          promociones={promociones}
          agregarPromocion={agregarPromocion}
          actualizarPromocion={actualizarPromocion}
          eliminarPromocion={eliminarPromocion}
          onClose={() => setShowGestionPromociones(false)}
        />
      )}
      {showNuevoCliente && (
        <ModalNuevoCliente
          onClose={() => setShowNuevoCliente(false)}
          onGuardar={(c) => {
            const nc = { ...c, id: clientes.length + Date.now() };
            setClientes(prev => [...prev, nc]);
            setClienteSelec(nc);
            setClienteInput(nc.nombre);
            setShowNuevoCliente(false);
          }}
        />
      )}
      {showTicket && (
        <ModalTicket
          venta={showTicket}
          cambios={(cambiosArticulo || []).filter(c => c.ventaOriginalId === showTicket.id)}
          logoBase64={configPrecios?.logoBase64}
          onClose={() => setShowTicket(null)}
        />
      )}

      {showCambioArt && (
        <ModalCambioArticulo
          ventas={ventas}
          productos={productos}
          setProductos={setProductos}
          stockDepositos={stockDepositos}
          aplicarDeltaStockMultiple={aplicarDeltaStockMultiple}
          aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple}
          depositos={depositos}
          usuarioActivo={usuarioActivo}
          cambiosArticulo={cambiosArticulo}
          clientes={clientes}
          pagosCtaCte={pagosCtaCte}
          listas={listasActivas}
          margenBase={margenBase}
          rubros={rubros}
          proveedores={proveedores}
          permitirStockNegativo={permitirStockNegativo}
          permitirEditarPrecioVenta={configPrecios?.permitirEditarPrecioVenta}
          onClose={() => setShowCambioArt(false)}
          onConfirmar={async (data) => {
            // Número asignado por Postgres en el momento de confirmar (contador
            // atómico compartido NC-/ND-/CA-) — no calculado en el navegador, para
            // que dos cambios confirmados casi juntos desde las 2 PCs no choquen.
            const { data: nro, error: errNro } = await supabase.rpc('siguiente_nro_cambio', { p_diferencia: data.diferencia });
            if (errNro) {
              toast(`No se pudo generar el número de cambio: ${errNro.message}`, "error");
              throw new Error(errNro.message);
            }
            try {
              const registrosGuardados = [];
              for (const par of data.pares) {
                const registro = await agregarCambioArticulo({
                  nro,
                  fecha:                  data.fecha,
                  hora:                   data.hora,
                  ventaOriginalId:        data.ventaOriginalId,
                  ventaOriginalCliente:   data.ventaOriginalCliente,
                  ventaOriginalClienteId: data.ventaOriginalClienteId,
                  itemViejo:              par.itemViejo || {},
                  productoNuevo:          par.productoNuevo,
                  qtyNuevo:               par.qtyNuevo,
                  totalViejo:             par.totalViejo,
                  totalNuevo:             par.totalNuevo,
                  diferencia:             par.totalNuevo - par.totalViejo,
                  formaPagoDif:           data.formaPagoDif,
                  motivo:                 data.motivo,
                  depositoId:             data.depositoId,
                  usuario:                data.usuario,
                  estado:                 "emitida",
                });
                registrosGuardados.push(registro);
              }

              if (data.diferencia < 0 && data.formaPagoDif === "Cuenta Corriente" && data.ventaOriginalClienteId) {
                try {
                  await agregarPagoCtaCte({
                    clienteId:   data.ventaOriginalClienteId,
                    fecha:       data.fecha,
                    monto:       Math.abs(data.diferencia),
                    observacion: `Nota de crédito ${nro} — cambio de artículo`,
                    usuario:     usuarioActivo?.nombre || "",
                  });
                } catch (ctaErr) {
                  toast(`Cambio registrado. Error al actualizar cta. cte.: ${ctaErr.message}`, "warning");
                }
              }

              setShowCambioArt(false);
              setComprobanteCambio(registrosGuardados);
            } catch (err) {
              toast(err.message, "error");
              // Se propaga el error (antes quedaba atrapado acá sin avisar a
              // nadie más arriba) — ModalCambioArticulo.jsx recién toca el
              // stock DESPUÉS de que esta función resuelva sin tirar error.
              // Si el cambio no se pudo guardar, el stock tiene que quedar
              // intacto: antes el stock se descontaba de entrada (sin esperar
              // esta respuesta) y si el guardado fallaba — como pasó con el
              // bug de "time zone p.m. not recognized" — quedaba descontado
              // sin ningún cambio ni comprobante que lo explicara.
              throw err;
            }
          }}
        />
      )}

      {comprobanteCambio && (
        <ModalComprobanteCambio
          cambios={comprobanteCambio}
          logoBase64={configPrecios?.logoBase64}
          onClose={() => setComprobanteCambio(null)}
        />
      )}

      {showAnulacion && (
        <ModalAnulacionVenta
          venta={showAnulacion}
          caja={caja}
          onClose={() => setShowAnulacion(null)}
          onConfirmar={async ({ motivo }) => {
            try {
              await handleAnular(showAnulacion, motivo);
              setShowAnulacion(null);
            } catch {
              // handleAnular ya mostró el toast de error — dejamos el modal
              // abierto para que se pueda reintentar, igual que antes.
            }
          }}
        />
      )}

      {showCompletarRetiro && (
        <ModalCompletarRetiro
          venta={ventas.find(v => v.id === showCompletarRetiro.id) || showCompletarRetiro}
          configPrecios={configPrecios}
          tarjetas={tarjetas}
          listas={listasActivas}
          onRetirar={handleRetirarSeña}
          onAgregarPago={handleAgregarPagoSeña}
          onRecalcularPrecios={handleRecalcularPrecios}
          onClose={() => setShowCompletarRetiro(null)}
        />
      )}

      {showAnulacionCambio && (
        <ModalAnulacionCambio
          grupo={showAnulacionCambio}
          caja={caja}
          onClose={() => setShowAnulacionCambio(null)}
          onConfirmar={async ({ motivo }) => {
            try {
              await handleAnularCambio(showAnulacionCambio, motivo);
              setShowAnulacionCambio(null);
            } catch {
              // handleAnularCambio ya mostró el toast de error — dejamos el
              // modal abierto para poder reintentar.
            }
          }}
        />
      )}

    </div>
  );
}
