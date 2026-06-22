// Pure, framework-free helpers for ImageViewer drag-to-pan. No React, no DOM,
// no @use-gesture, so the offset math stays unit-testable in isolation.

export interface Point {
  x: number;
  y: number;
}

/**
 * Resolve the pan offset a drag started from. @use-gesture only populates
 * `memo` on the first drag frame, but the handler can still fire on a later
 * frame without that first frame having run with panning active: on pointerUp,
 * or when a concurrent pinch flips the viewer into actual-size (pan) mode
 * mid-gesture. Reading `memo.x` directly then threw in production
 * (Sentry NODE-15 / NODE-17 / NODE-18: "Cannot read properties of undefined
 * (reading 'x')", across Chrome/Safari/Firefox). Fall back to the current pan
 * offset whenever memo is missing; the caller persists the return value as the
 * next frame's memo.
 */
export function resolvePanStart(first: boolean, memo: Point | undefined, panOffset: Point): Point {
  if (first || !memo) return { ...panOffset };
  return memo;
}
