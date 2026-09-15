"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Track a CSS media query from React.
 *
 * `useSyncExternalStore` rather than an effect so the first client render
 * already knows the answer -- a chart that lays itself out for a desktop and
 * then flips on the next frame is worse than one that never flipped.
 *
 * The server snapshot is always `false`, so only use this in components that
 * are rendered client-side (VPChart is loaded with `ssr: false`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
