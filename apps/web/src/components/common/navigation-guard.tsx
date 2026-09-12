import { useEffect } from "react";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";

/**
 * Warns before a close or a navigation throws away a running job or a result
 * the user never took.
 *
 * This is the only useBlocker call site in the app: the router supports one
 * blocker at a time and warns when a second registers. Anything else that
 * wants to guard navigation adds a reason to useWorkInFlight instead.
 */
export function NavigationGuard() {
  const reason = useWorkInFlight();
  // useWorkInFlight rebuilds its return value every render, so effects key on
  // this boolean. `[reason]` would re-run them on every store patch in a run.
  const hasWork = reason !== null;

  // Registered only while there is something to lose. A permanently
  // registered beforeunload listener can disqualify the page from bfcache.
  useEffect(() => {
    if (!hasWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy support for Chrome and Edge below 119, which raise the prompt
      // off a truthy returnValue rather than off preventDefault. Truthy is the
      // load-bearing part: the legacy path ignores a falsy value, so the "" you
      // see in older snippets does nothing.
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasWork]);

  return null;
}
