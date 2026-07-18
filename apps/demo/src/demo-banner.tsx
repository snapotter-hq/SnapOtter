import { useState } from "react";

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative z-[9999] flex items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground">
      <span>
        This is a live demo. All users, teams, and activity shown are sample data, and file
        processing is disabled.{" "}
        <a
          href="https://docs.snapotter.com/guide/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Self-host SnapOtter
        </a>{" "}
        for full functionality.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ms-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-primary-light"
        aria-label="Dismiss banner"
      >
        Dismiss
      </button>
    </div>
  );
}
