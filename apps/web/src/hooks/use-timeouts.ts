import { useCallback, useEffect, useRef } from "react";

type Timer = ReturnType<typeof setTimeout>;
type Schedule = (callback: () => void, ms: number, key?: string) => void;

/**
 * A setTimeout tied to the component's lifetime: every timer still pending
 * when the component unmounts is cleared, and a call that arrives after the
 * unmount (a save whose request settles once the screen has closed) schedules
 * nothing. Use it for delayed state resets (a "Saved" or "Copied" message
 * fading out), so closing the screen early never fires a callback into an
 * unmounted tree (#1619).
 *
 * Pass a key naming the state a reset clears (`later(() => setSaveMsg(null),
 * 3000, "saveMsg")`): scheduling the same key again cancels the pending timer
 * first, so a second message shown inside the fade window gets its full time
 * instead of being cleared by the first one's timer (#1798).
 */
export function useTimeouts(): Schedule {
  const pending = useRef(new Set<Timer>());
  const byKey = useRef(new Map<string, Timer>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timers = pending.current;
    const keyed = byKey.current;
    return () => {
      mounted.current = false;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      keyed.clear();
    };
  }, []);

  return useCallback<Schedule>((callback, ms, key) => {
    if (!mounted.current) return;
    if (key !== undefined) {
      const previous = byKey.current.get(key);
      if (previous !== undefined) {
        clearTimeout(previous);
        pending.current.delete(previous);
      }
    }
    const id = setTimeout(() => {
      pending.current.delete(id);
      if (key !== undefined && byKey.current.get(key) === id) byKey.current.delete(key);
      callback();
    }, ms);
    pending.current.add(id);
    if (key !== undefined) byKey.current.set(key, id);
  }, []);
}
