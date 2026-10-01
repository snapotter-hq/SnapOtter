import { useCallback, useEffect, useRef } from "react";

type Schedule = (callback: () => void, ms: number) => void;

/**
 * A setTimeout tied to the component's lifetime: every timer still pending
 * when the component unmounts is cleared, and a call that arrives after the
 * unmount (a save whose request settles once the screen has closed) schedules
 * nothing. Use it for delayed state resets (a "Saved" or "Copied" message
 * fading out), so closing the screen early never fires a callback into an
 * unmounted tree (#1619).
 */
export function useTimeouts(): Schedule {
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timers = pending.current;
    return () => {
      mounted.current = false;
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  return useCallback<Schedule>((callback, ms) => {
    if (!mounted.current) return;
    const id = setTimeout(() => {
      pending.current.delete(id);
      callback();
    }, ms);
    pending.current.add(id);
  }, []);
}
