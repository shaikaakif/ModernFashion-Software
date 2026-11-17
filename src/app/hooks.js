import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small request hook. The loader is kept in a ref so callers can pass inline
 * closures without causing an endless fetch loop; deps decides when to reload.
 */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ data: null, loading: immediate, error: null });
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    // `immediate: false` still loads after an explicit reload(); without the
    // version check the reload button would never fetch anything.
    if (!immediate && version === 0) return undefined;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (active) setState({ data: null, loading: false, error });
      });
    return () => {
      active = false;
    };
  }, [depsKey, immediate, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback((updater) => {
    setState((current) => ({
      ...current,
      data: typeof updater === 'function' ? updater(current.data) : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}

export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
