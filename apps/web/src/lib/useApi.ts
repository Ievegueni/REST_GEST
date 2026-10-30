import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** GET com estado de carregamento/erro. `path` null = não carrega. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then((d) => alive && (setData(d), setError('')))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}
