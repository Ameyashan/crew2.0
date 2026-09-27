"use client";

import { useEffect, useState } from "react";
import type { GoalProgressCounts, GoalProgressModel } from "@/lib/goal/progress-logic";

export type GoalProgressDTO = GoalProgressModel & { counts: GoalProgressCounts };

// Progress for the locked goal. Refetches when the goal changes (a new lock
// resets "dismissed since this goal"). Pass null while there's no goal.
export function useGoalProgress(goalId: string | null | undefined): GoalProgressDTO | null {
  const [state, setState] = useState<{ id: string; progress: GoalProgressDTO | null } | null>(null);
  useEffect(() => {
    if (!goalId) return;
    let alive = true;
    fetch("/api/goal/progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setState({ id: goalId, progress: (j?.progress as GoalProgressDTO | null) ?? null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [goalId]);
  return goalId && state?.id === goalId ? state.progress : null;
}
