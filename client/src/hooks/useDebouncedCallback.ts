import { debounce } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';

/**
 * Returns a stable debounced version of `callback`.
 * The returned function identity does not change on re-renders, preventing
 * timers from being recreated and lost during render cycles.
 *
 * @param callback The function to debounce (always invokes the latest closure).
 * @param delayMs Debounce delay in milliseconds.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const callbackRef = useRef(callback);

  // Keep callbackRef up to date with the latest closure
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Create debounced wrapper once for the given delay
  const debouncedFn = useMemo(
    () =>
      debounce((...args: Args) => {
        callbackRef.current(...args);
      }, delayMs),
    [delayMs],
  );

  // Clean up any pending timer when unmounting or when delay changes
  useEffect(() => {
    return () => {
      if (typeof (debouncedFn as any)?.clear === 'function') {
        (debouncedFn as any).clear();
      }
    };
  }, [debouncedFn]);

  return debouncedFn;
}
