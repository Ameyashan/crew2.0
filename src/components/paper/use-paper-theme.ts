"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getPalette, type Palette } from "./palette";

export type PaperTweaks = {
  dark: boolean;
  accent: string;
  density: "compact" | "regular" | "sparse";
  motion: "still" | "lively";
  followup: "3d" | "5d" | "7d" | "10d" | "never";
  variant: "workspace" | "newsroom";
  headlineIdx: number;
  foreground: string[];
};

const DEFAULTS: PaperTweaks = {
  dark: false,
  accent: "#bd5d3c",
  density: "sparse",
  motion: "lively",
  followup: "5d",
  variant: "workspace",
  headlineIdx: 0,
  foreground: ["apply", "lekhak", "patrakar", "guru"],
};

const STORAGE_KEY = "crew.theme.v1";

// Single in-memory mirror of localStorage. useSyncExternalStore subscribes to
// our own change emitter; we also listen for cross-tab `storage` events so
// theme changes propagate across windows.
let memo: PaperTweaks = DEFAULTS;
let hydrated = false;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

function load(): PaperTweaks {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  memo = load();
  hydrated = true;
}

function subscribe(cb: () => void) {
  ensureHydrated();
  subscribers.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      memo = load();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    subscribers.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): PaperTweaks {
  ensureHydrated();
  return memo;
}

function getServerSnapshot(): PaperTweaks {
  return DEFAULTS;
}

export function setPaperTweak<K extends keyof PaperTweaks>(
  key: K,
  value: PaperTweaks[K],
): void {
  memo = { ...memo, [key]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memo));
  } catch {
    /* ignore */
  }
  emit();
}

export function usePaperTheme(): {
  p: Palette;
  t: PaperTweaks;
  setTweak: <K extends keyof PaperTweaks>(key: K, value: PaperTweaks[K]) => void;
} {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTweak = useCallback(
    <K extends keyof PaperTweaks>(key: K, value: PaperTweaks[K]) => {
      setPaperTweak(key, value);
    },
    [],
  );
  const p = getPalette(t.dark);

  // Reflect background on body so empty space outside route components also
  // takes the theme — purely an external-system sync, which is the legitimate
  // use of useEffect under the new lint rule.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.background = p.paper;
    document.body.style.color = p.ink;
  }, [p.paper, p.ink]);

  return { p, t, setTweak };
}
