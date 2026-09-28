"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Fired on this page when a choice is saved; `storage` only reaches other tabs. */
const LOCAL_EVENT = "fale:stored-choice";

/** Where a choice lives when the browser will not store it, until the next refresh. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored != null) return stored;
  } catch {
    // Private windows and blocked site data throw rather than return null.
  }
  return memory.get(key) ?? null;
}

/**
 * A small choice remembered in `localStorage`, so it survives a refresh.
 *
 * `useSyncExternalStore` rather than an effect, for the same reason as
 * `useMediaQuery`: the server snapshot is always `null`, so the server render
 * and the hydration pass agree, and React re-renders with the stored value
 * straight after. A value outside `allowed` -- an old build's, or a hand-edited
 * one -- reads as `null`, which callers treat as "no choice made yet".
 */
export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[]
): [T | null, (value: T) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(LOCAL_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(LOCAL_EVENT, onChange);
    };
  }, []);

  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  );
  const value = raw != null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;

  const setValue = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Nowhere to keep it; `memory` still holds it until the next refresh.
      }
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key]
  );

  return [value, setValue];
}
