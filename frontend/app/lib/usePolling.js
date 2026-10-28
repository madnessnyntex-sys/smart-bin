'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Calls fn now and every `ms`, keeps the last good data if a refresh fails.
export function usePolling(fn, deps = [], ms = 5000) {
  const [state, setState] = useState({ data: null, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      setState({ data: await fnRef.current(), error: null });
    } catch (e) {
      setState((s) => ({ ...s, error: e.message }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (!document.hidden) refresh(); }, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ms, ...deps]);

  return { ...state, refresh };
}
