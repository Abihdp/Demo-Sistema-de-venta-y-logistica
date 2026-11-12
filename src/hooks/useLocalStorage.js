import { useState, useEffect } from "react";

/**
 * Igual que useState pero persiste en localStorage.
 * Al recargar la página lee el valor guardado; si no hay nada usa initialValue.
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`useLocalStorage: no se pudo guardar "${key}"`, e);
    }
  }, [key, value]);

  return [value, setValue];
}
