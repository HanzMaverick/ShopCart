import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './useDebouncedValue';

type Value = string | number | boolean | null | undefined;

/**
 * Estado de listados en la URL (filtros, orden, pagina): se puede compartir el enlace, el boton "atras" funciona
 * y al recargar se conserva la vista. Cambiar un filtro reinicia la pagina.
 */
export function useUrlState() {
  const [sp, setSp] = useSearchParams();

  const get = (key: string): string | undefined => sp.get(key) ?? undefined;
  const getNum = (key: string): number | undefined => {
    const v = sp.get(key);
    if (v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const getBool = (key: string): boolean | undefined => (sp.get(key) === 'true' ? true : undefined);

  const set = useCallback((patch: Record<string, Value>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === false) next.delete(k); else next.set(k, String(v));
      }
      if (!('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSp]);

  return { get, getNum, getBool, set, page: getNum('page') ?? 1 };
}

/** Campo de texto de un filtro: se escribe localmente y se publica en la URL con retardo (evita una consulta por tecla). */
export function useUrlTextField(url: ReturnType<typeof useUrlState>, key: string, ms = 400) {
  const [value, setValue] = useState(url.get(key) ?? '');
  const debounced = useDebouncedValue(value, ms);
  useEffect(() => {
    if (debounced !== (url.get(key) ?? '')) url.set({ [key]: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return [value, setValue] as const;
}
