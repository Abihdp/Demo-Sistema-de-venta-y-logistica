import { useState, useMemo, useEffect } from "react";

export const PAGE_SIZE = 15;

// Recorta `items` a la página actual (15 por defecto). Vuelve a página 1 sola
// cuando cambia la cantidad de resultados (típico al tocar un filtro) para no
// quedar en una página vacía.
export function usePaginacion(items, pageSize = PAGE_SIZE) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPagina(1); }, [items.length]);

  const paginaActual = Math.min(pagina, totalPaginas);
  const itemsPagina = useMemo(
    () => items.slice((paginaActual - 1) * pageSize, paginaActual * pageSize),
    [items, paginaActual, pageSize]
  );

  return { pagina: paginaActual, setPagina, totalPaginas, itemsPagina, pageSize };
}
