import { type ComponentType, lazy } from "react";
import { useConnectionStore } from "@/stores/connection-store";

export function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("failed to fetch") ||
    msg.includes("unable to preload")
  );
}

export async function retryDynamicImport<T>(
  importFn: () => Promise<T>,
  retries = 3,
  delay = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      if (!isChunkError(error) || attempt === retries) {
        if (isChunkError(error)) {
          useConnectionStore.getState().setDisconnected();
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("unreachable");
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() => retryDynamicImport(importFn));
}
