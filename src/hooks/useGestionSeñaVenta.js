import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm } from "../components/ui/Confirm.jsx";
import { fmt, today, horaActual, pagosDeVenta, precioPorLista, ventaEditable, motivoNoRetirarSeña, itemsPendientesEntrega } from "../utils/helpers.js";

// Lógica compartida de gestión de una venta con seña ("Venta con retiro
// después"): retirar (total o parcial), agregar pago, anular y recalcular
// precios. Extraída de PageVentas.jsx para que también pueda usarse desde
// Clientes → Reservas sin duplicar las reglas de stock/cuenta corriente/
// permisos.
export function useGestionSeñaVenta({
  caja, periodosCerrados,
  depositos, stockDepositos, productos, listas,
  configPrecios, rubros, proveedores,
  usuarioActivo, permisos,
  editarVenta, editarVentaConItems, anularVenta,
  registrarRetiroSeña, registrarPagoSeña,
  actualizarStock, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple,
  agregarRecibo,
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const margenBase = configPrecios?.margenBase ?? 0;
  const permitirStockNegativo = configPrecios?.permitirStockNegativo ?? false;
  const depositoReserva = depositos.find(d => d.tipo === "reserva");

  // ── Permisos de retiro/pago — a diferencia de motivoNoAnular, NO exige
  // "misma caja/turno que la venta original" (ver motivoNoRetirarSeña). ────
  const motivoNoRetirar = (v) => motivoNoRetirarSeña(v, caja);

  // ── Permisos de anulación ─────────────────────────────────────────────
  const motivoNoAnular = (v) => {
    const { puede, motivo } = ventaEditable(v, caja, periodosCerrados);
    if (!puede) return motivo;
    if (!permisos?.[usuarioActivo?.id]?.anularVenta) return "No tenés permiso para anular ventas.";
    return null;
  };

  // ── Lógica de anulación directa (caja abierta) ───────────────────────
  const handleAnular = async (venta, motivo) => {
    // Reverificar por si el turno se cerró (o se hizo un cierre de control)
    // mientras el modal de anulación estaba abierto.
    const { puede, motivo: motivoBloqueo } = ventaEditable(venta, caja, periodosCerrados);
    if (!puede) {
      toast(motivoBloqueo, "warning");
      return;
    }

    const depositoVentaId   = venta.depositoId;
    const depositoReservaId = depositos.find(d => d.tipo === "reserva")?.id;

    try {
      // 1. Anular en Supabase (marca venta como anulada + registra anulación)
      await anularVenta(venta.id, {
        fecha:   today(),
        hora:    horaActual(),
        motivo,
        usuario: usuarioActivo?.nombre || "—",
        tipo:    "directa",
      });

      // 2. Devolver stock al depósito correspondiente. Una venta con seña
      // todavía "pendiente" nunca descontó stock total (la mercadería vive
      // en el depósito de Reservas) — se revierte el pase. Pero si la seña
      // ya se había completado (el cliente ya retiró), a esa altura el
      // stock total SÍ se descontó, así que se revierte igual que una
      // venta normal.
      if (venta.esSeña && venta.estado === "pendiente" && depositoReservaId && depositoVentaId) {
        // Seña pendiente: revertir en Supabase (Reservas → depósito original)
        try {
          const cambiosSeña = (venta.items || []).flatMap(item => {
            const prod = item.productoId
              ? productos.find(p => p.id === item.productoId)
              : productos.find(p => p.nombre === item.nombre);
            if (!prod) return [];
            return [
              { productoId: prod.id, depositoId: depositoReservaId, delta: -item.qty },
              { productoId: prod.id, depositoId: depositoVentaId,   delta:  item.qty },
            ];
          });
          if (cambiosSeña.length) await aplicarDeltaStockMultiple(cambiosSeña);
        } catch {
          toast("Venta anulada. Error al restaurar stock en depósito — verificá manualmente.", "warning");
        }
        // Stock total del producto no cambia (igual que en la seña original)
      } else if (depositoVentaId) {
        // Venta normal, o seña ya retirada: restaurar en depósito (Supabase) y stock total
        try {
          const cambiosNormal = (venta.items || []).flatMap(item => {
            const prod = item.productoId
              ? productos.find(p => p.id === item.productoId)
              : productos.find(p => p.nombre === item.nombre);
            if (!prod) return [];
            return [{ productoId: prod.id, depositoId: depositoVentaId, delta: item.qty }];
          });
          if (cambiosNormal.length) await aplicarDeltaStockMultiple(cambiosNormal);
        } catch {
          toast("Venta anulada. Error al restaurar stock en depósito — verificá manualmente.", "warning");
        }
        try {
          const cambiosTotal = (venta.items || []).flatMap(item => {
            const prod = productos.find(p => item.productoId ? p.id === item.productoId : p.nombre === item.nombre);
            return prod ? [{ productoId: prod.id, delta: item.qty }] : [];
          });
          if (cambiosTotal.length && aplicarDeltaStockProductoMultiple) {
            await aplicarDeltaStockProductoMultiple(cambiosTotal);
          } else {
            await Promise.all(cambiosTotal.map(c => {
              const prod = productos.find(p => p.id === c.productoId);
              return actualizarStock(c.productoId, prod.stock + c.delta);
            }));
          }
        } catch {
          toast("Venta anulada. Error al restaurar el stock — verificá manualmente el inventario.", "warning");
        }
      }

      // Nota: no hace falta "revertir" el saldo de Cuenta Corriente acá.
      // `montoCtaCte()` (helpers.js) ya devuelve $0 para cualquier venta con
      // estado "anulada" en todos los cálculos de deuda/saldo/mora — la venta
      // anulada deja de contar como deuda automáticamente. Agregar un pago
      // compensatorio acá duplicaba la resta: la deuda ya desaparecía sola, y
      // además se acreditaba un pago que nunca entró realmente a la caja,
      // generando saldos a favor falsos (ver limpieza en pagos_ctacte).
    } catch (err) {
      toast(err.message || "Error al anular la venta.", "error");
      throw err;
    }
  };

  // ── Retirar mercadería de una venta con seña — total o parcial. Nunca
  // toca precios/total (eso es "Recalcular precios", una acción aparte);
  // solo descuenta stock de lo elegido y anota el retiro. No exige que esté
  // todo cobrado ("retiro libre"): el pago es una acción independiente, ver
  // handleAgregarPagoSeña. Mismo patrón que TabReservas.handleRetirarItems.
  const handleRetirarSeña = async (venta, itemsARetirar) => {
    const motivo = motivoNoRetirar(venta);
    if (motivo) throw new Error(motivo);
    if (!itemsARetirar.length) throw new Error("Elegí al menos un producto para retirar.");

    const pendientes = itemsPendientesEntrega(venta);
    for (const item of itemsARetirar) {
      const pend = pendientes.find(p => p.productoId === item.productoId);
      if (!pend || item.qty > pend.qtyPendiente) {
        throw new Error(`"${item.nombre}": cantidad a retirar (${item.qty}) supera lo pendiente (${pend?.qtyPendiente ?? 0}).`);
      }
    }

    const depositoReservaId = depositos.find(d => d.tipo === "reserva")?.id;
    const itemsSinStock = [];
    if (depositoReservaId) {
      for (const item of itemsARetirar) {
        const disp = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === depositoReservaId)?.cantidad ?? 0;
        if (item.qty > disp) {
          if (!permitirStockNegativo) {
            throw new Error(`Stock insuficiente en ${depositoReserva?.nombre || "Reservas"}: "${item.nombre}" — disponible: ${disp}, pedido: ${item.qty}.`);
          }
          itemsSinStock.push({ nombre: item.nombre, resultante: disp - item.qty });
        }
      }
    }

    const cierraVenta = pendientes.every(p => {
      const tomado = itemsARetirar.find(i => i.productoId === p.productoId)?.qty || 0;
      return tomado >= p.qtyPendiente;
    });

    try {
      if (depositoReservaId) {
        const cambiosDeposito = itemsARetirar.map(item => ({
          productoId: item.productoId, depositoId: depositoReservaId, delta: -item.qty,
        }));
        await aplicarDeltaStockMultiple(cambiosDeposito);
      }
      // Delta atómico también para el total (no "prod.stock - qty" calculado
      // acá) — la cantidad ya se validó contra lo pendiente/disponible más
      // arriba, así que no hace falta volver a recortarla.
      if (aplicarDeltaStockProductoMultiple) {
        await aplicarDeltaStockProductoMultiple(
          itemsARetirar.map(item => ({ productoId: item.productoId, delta: -item.qty }))
        );
      } else {
        await Promise.all(itemsARetirar.map(async item => {
          const prod = productos.find(p => p.id === item.productoId);
          if (!prod) return;
          const nuevoTotal = prod.stock - item.qty;
          await actualizarStock(item.productoId, permitirStockNegativo ? nuevoTotal : Math.max(0, nuevoTotal));
        }));
      }
    } catch {
      toast("Error al descontar stock — verificá manualmente.", "warning");
    }

    await registrarRetiroSeña(venta.id, {
      fecha: today(),
      items: itemsARetirar.map(i => ({ productoId: i.productoId, nombre: i.nombre, qty: i.qty, precio: i.precio })),
      usuario: usuarioActivo?.nombre || "",
      cierraVenta,
    });

    toast(
      (cierraVenta ? "Retiro completado. " : "Retiro parcial registrado. ") +
      (itemsSinStock.length ? `Atención: quedó stock negativo en ${itemsSinStock.map(i => `"${i.nombre}" (${i.resultante})`).join(", ")}.` : ""),
      itemsSinStock.length ? "warning" : "success"
    );
  };

  // ── Registrar un pago (parcial o total) del saldo de una venta con seña
  // pendiente — no toca items ni retiro, es la contraparte independiente de
  // handleRetirarSeña. El monto final de la venta solo cambia por el
  // recargo de financiación en tarjeta (mismo cálculo que antes), nunca a
  // mano: la persona sólo elige "cuánto paga ahora" y con qué medio.
  //
  // Este pago queda guardado en `venta.pagos`, pero Caja arma el arqueo del
  // día filtrando `venta.createdAt` (fecha de creación de LA VENTA, no de
  // cada pago) — así que un pago cobrado hoy sobre una venta vieja nunca
  // aparecería en el turno de hoy si solo quedara ahí adentro. Por eso acá
  // también se emite un `recibo` (mismo mecanismo que ya usa el cobro de
  // cuenta corriente en PageClientes.jsx), que Caja sí filtra por su propio
  // `createdAt` — sin tocar cuenta corriente, porque esto no es un pago de
  // cta. cte., es un pago contra el saldo de esta venta puntual.
  const handleAgregarPagoSeña = async (venta, { monto, formaPago, tarjetaInfo }) => {
    const motivo = motivoNoRetirar(venta);
    if (motivo) throw new Error(motivo);

    const cobrado = pagosDeVenta(venta).reduce((a, p) => a + p.monto, 0);
    const saldo = Math.round(venta.total - cobrado);
    if (!monto || monto <= 0 || monto > saldo) {
      throw new Error(`El monto debe ser mayor a $0 y no puede superar el saldo pendiente (${fmt(saldo)}).`);
    }

    const interesPct = tarjetaInfo?.interesPct || 0;
    const montoConRecargo = interesPct > 0 ? Math.round(monto * (1 + interesPct / 100)) : monto;
    const formaPagoFinal = formaPago || "Efectivo";

    await registrarPagoSeña(venta.id, {
      fecha: today(),
      monto: montoConRecargo,
      formaPago: formaPagoFinal,
      recargo: montoConRecargo - monto,
      tarjetaInfo: interesPct > 0 ? {
        tarjetaId: tarjetaInfo.tarjetaId, tarjetaNombre: tarjetaInfo.tarjetaNombre,
        cuotas: tarjetaInfo.cuotas, interesPct,
      } : undefined,
    });

    if (agregarRecibo) {
      try {
        await agregarRecibo({
          tipo: "Recibo",
          fecha: today(),
          hora: horaActual(),
          clienteId: venta.clienteId || null,
          cliente: venta.cliente,
          monto: montoConRecargo,
          formaPago: formaPagoFinal,
          observacion: `Pago de seña — Venta #${venta.id}`,
          usuario: usuarioActivo?.nombre || "",
          ventaId: venta.id,
        });
      } catch {
        toast("Pago registrado, pero no se pudo generar el recibo para Caja — avisá para cargarlo a mano si hace falta.", "warning");
      }
    }

    toast(`Pago de ${fmt(montoConRecargo)} registrado.`, "success");
  };

  // ── Recalcular precios de una venta con seña pendiente. Por defecto usa
  // la lista con la que se hizo la venta (mismo cálculo que usa
  // ModalEditarVenta al cambiar de lista, para el caso "pasó el tiempo y los
  // precios subieron"). Si se pasa `listaOverride` (ej. la lista asignada al
  // medio de pago con el que están cobrando el saldo — señaron en efectivo
  // pero pagan la diferencia con tarjeta), recalcula contra ESA lista y la
  // deja guardada como la lista de la venta. ──
  const handleRecalcularPrecios = async (venta, listaOverride = null) => {
    const listaObj = listaOverride || listas.find(l => l.nombre === venta.lista);
    if (!listaObj) { toast("No se encontró la lista de precios de esta venta.", "error"); return; }

    const nuevosItems = (venta.items || []).map(it => {
      const prod = productos.find(p => p.id === it.productoId);
      if (!prod) return it;
      return { ...it, precio: precioPorLista(prod, listaObj, margenBase, rubros, proveedores) };
    });

    const totalViejo = venta.total;
    const totalNuevo = nuevosItems.reduce((a, it) => a + it.precio * it.qty, 0);
    const cambiaLista = listaObj.nombre !== venta.lista;

    if (totalNuevo === totalViejo && !cambiaLista) {
      toast("Los precios no cambiaron.", "success");
      return;
    }

    const cantCambiados = nuevosItems.filter((it, i) => it.precio !== venta.items[i].precio).length;
    const mensaje = cambiaLista
      ? `Se recalcula con la lista "${listaObj.nombre}". Nuevo total: ${fmt(totalNuevo)} (antes ${fmt(totalViejo)}). ¿Aplicar?`
      : `El precio de ${cantCambiados} artículo${cantCambiados !== 1 ? "s" : ""} cambió. Nuevo total: ${fmt(totalNuevo)} (antes ${fmt(totalViejo)}). ¿Aplicar los precios actuales?`;
    const continuar = await confirm(mensaje, { confirmLabel: "Aplicar" });
    if (!continuar) return;

    try {
      await editarVentaConItems(venta.id, { total: totalNuevo, lista: listaObj.nombre }, nuevosItems);
      toast("Precios actualizados.", "success");
    } catch (err) {
      toast(err.message || "Error al actualizar los precios.", "error");
    }
  };

  return { motivoNoAnular, motivoNoRetirar, handleAnular, handleRetirarSeña, handleAgregarPagoSeña, handleRecalcularPrecios };
}
