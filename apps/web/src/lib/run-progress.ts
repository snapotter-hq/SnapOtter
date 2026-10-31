import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFileStore } from "@/stores/file-store";

export type RunProgressPhase = "idle" | "uploading" | "processing";

export interface RunProgressState {
  phase: RunProgressPhase;
  percent: number;
  stage?: string;
  startTime: number | null;
}

const IDLE_RUN_PROGRESS: RunProgressState = {
  phase: "idle",
  percent: 0,
  stage: undefined,
  startTime: null,
};

let currentProgress: RunProgressState = IDLE_RUN_PROGRESS;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RunProgressState {
  return currentProgress;
}

export function setProgressPhase(phase: RunProgressPhase) {
  if (phase === "idle") {
    resetRunProgress();
    return;
  }
  if (currentProgress.phase === phase && currentProgress.startTime !== null) return;
  currentProgress = {
    ...currentProgress,
    phase,
    startTime: currentProgress.startTime ?? Date.now(),
  };
  notify();
}

export function setProgressPercent(percent: number) {
  if (currentProgress.percent === percent) return;
  currentProgress = { ...currentProgress, percent };
  notify();
}

export function setProgressStage(stage: string | null | undefined) {
  const nextStage = stage ?? undefined;
  if (currentProgress.stage === nextStage) return;
  currentProgress = { ...currentProgress, stage: nextStage };
  notify();
}

export function resetRunProgress() {
  if (currentProgress === IDLE_RUN_PROGRESS) return;
  currentProgress = IDLE_RUN_PROGRESS;
  notify();
}

useFileStore.subscribe((state, prev) => {
  if ((!state.processing && prev.processing) || state.stopCount !== prev.stopCount) {
    resetRunProgress();
  }
});

/**
 * Shared progress state for self-posting tool panels whose runs continue across
 * a bare panel unmount (closing the mobile settings sheet or crossing the 768px
 * layout breakpoint; #1974, #2304, #2315).
 */
export function useRunProgress() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [elapsed, setElapsed] = useState(() =>
    snapshot.startTime !== null ? Math.floor((Date.now() - snapshot.startTime) / 1000) : 0,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (elapsedRef.current !== null) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const startTime = snapshot.startTime;
    if (startTime === null) {
      setElapsed(0);
      return;
    }
    if (elapsedRef.current !== null) return;
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const handle = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => {
      clearInterval(handle);
    };
  }, [snapshot.startTime]);

  const startRunProgress = (): ReturnType<typeof setInterval> | null => {
    const startTime = Date.now();
    currentProgress = {
      phase: "uploading",
      percent: 0,
      stage: undefined,
      startTime,
    };
    setElapsed(0);
    if (elapsedRef.current !== null) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    if (mountedRef.current) {
      elapsedRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    notify();
    return elapsedRef.current;
  };

  const clearRunProgressTimer = (handle: ReturnType<typeof setInterval> | null) => {
    if (!handle) return;
    try {
      clearInterval(handle);
    } finally {
      if (elapsedRef.current === handle) {
        elapsedRef.current = null;
      }
    }
  };

  return {
    progressPhase: snapshot.phase,
    progressPercent: snapshot.percent,
    progressStage: snapshot.stage,
    elapsed,
    startRunProgress,
    clearRunProgressTimer,
    setProgressPhase,
    setProgressPercent,
    setProgressStage,
  };
}
