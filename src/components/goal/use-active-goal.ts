"use client";

// The signed-in user's locked goal, shared by the top bar, the Desk strip and
// the goal page. One fetch per page load (module cache); a lock anywhere calls
// setActiveGoal() so every consumer updates without refetching.

import { useEffect, useSyncExternalStore } from "react";
import type { GoalSpec } from "@/lib/goal/goal-logic";

export interface ActiveGoalDTO {
  id: string;
  goal: GoalSpec;
  started_at: string;
  finalized_at: string;
}

// undefined = not loaded yet; null = no goal.
let cache: ActiveGoalDTO | null | undefined;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setActiveGoal(g: ActiveGoalDTO | null) {
  cache = g;
  emit();
}

function load() {
  if (inflight || cache !== undefined) return;
  inflight = fetch("/api/goal")
    .then((r) => (r.ok ? r.json() : { goal: null }))
    .then((j) => {
      cache = (j?.goal as ActiveGoalDTO | null) ?? null;
    })
    .catch(() => {
      cache = null;
    })
    .finally(() => {
      inflight = null;
      emit();
    });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => cache;
const getServerSnapshot = () => undefined;

export function useActiveGoal(enabled = true): ActiveGoalDTO | null | undefined {
  const goal = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  return enabled ? goal : undefined;
}
