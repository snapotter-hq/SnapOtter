import { useSyncExternalStore } from "react";
import { parseStringArray } from "@/lib/settings-payload";

const STORAGE_KEY = "snapotter-recent-tools";
const MAX_RECENT = 5;
const EMPTY: string[] = [];

let listeners: Array<() => void> = [];
let cachedRaw: string | null | undefined;
let cachedParsed: string[] = EMPTY;

function getSnapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    cachedRaw = undefined;
    cachedParsed = EMPTY;
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    const parsed = parseStringArray(raw ?? undefined);
    cachedParsed = parsed.length > 0 ? parsed : EMPTY;
  }
  return cachedParsed;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function recordRecentTool(toolId: string) {
  const current = getSnapshot();
  const updated = [toolId, ...current.filter((id) => id !== toolId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage blocked or full
  }
  cachedRaw = undefined;
  for (const l of listeners) l();
}

export function useRecentTools(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
