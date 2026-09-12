import type { TranslationKeys } from "@snapotter/shared";
import { useCallback, useEffect, useRef } from "react";
import { type BlockerFunction, useBlocker } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { normalizePath, useWorkInFlight, type WorkReason } from "@/hooks/use-work-in-flight";
import { downloadBlob, triggerDownload } from "@/lib/download";
import { useFileStore } from "@/stores/file-store";

const TITLE_ID = "navigation-guard-title";
const BODY_ID = "navigation-guard-body";

/**
 * Routes the guard steps aside for. Defence in depth: nothing reaches these
 * through the router today.
 *
 * Every current route to them is a document navigation the blocker never sees
 * (window.location.href in avatar-dropdown.tsx, settings-dialog.tsx and
 * login-page.tsx). AuthGuard's <Navigate to="/login" replace /> on session
 * expiry, and its <Navigate to="/change-password" replace /> on a forced
 * password change, are covered by commit ordering instead: AuthGuard renders
 * them INSTEAD of children, so this component unmounts in the same commit and
 * useBlocker's cleanup deletes the blocker before Navigate's effect navigates.
 *
 * What this set guards is the first in-app <Link to="/login"> someone adds,
 * which would otherwise be silently unguarded: a dialog asking about work an
 * expired session can no longer finish, with no answer that helps.
 *
 * Deliberately not AUTH_GUARD_UNGATED_PATHS: that set also holds /privacy, and
 * clicking through to the privacy page mid-run is an ordinary navigation that
 * loses real work and deserves the prompt.
 */
const NEVER_BLOCKED = new Set(["/login", "/change-password"]);

type GuardButton = {
  /** A list key that does not move with the copy or with the locale. */
  id: "stay" | "download" | "leave";
  label: string;
  onClick: () => void;
  primary: boolean;
};

type GuardDialog = { title: string; body: string; buttons: GuardButton[] };

/**
 * The whole dialog for one reason, buttons included.
 *
 * The buttons come from here rather than from a branch in the JSX because only
 * the "unsaved" reason carries `downloads`. Deciding them inside the exhaustive
 * switch keeps that narrowing, and keeps a new WorkReason kind a compile error
 * here rather than a dialog offering an answer it cannot deliver.
 *
 * Staying put is always first. useFocusTrap focuses elements[0], so DOM order
 * picks what a reflexive Enter answers, and that has to be the safe one.
 */
function guardDialog(
  t: TranslationKeys,
  reason: WorkReason,
  actions: { stay: () => void; leave: () => void; downloadThenLeave: () => void },
): GuardDialog {
  const stay: GuardButton = {
    id: "stay",
    label: t.navigationGuard.stay,
    onClick: actions.stay,
    primary: true,
  };
  const leave: GuardButton = {
    id: "leave",
    label: t.navigationGuard.leave,
    onClick: actions.leave,
    primary: false,
  };

  switch (reason.kind) {
    case "processing":
      return {
        title: t.navigationGuard.processingTitle,
        body: t.navigationGuard.processingBody,
        buttons: [stay, leave],
      };
    case "unsaved": {
      const download: GuardButton = {
        id: "download",
        label: t.navigationGuard.downloadAndLeave,
        onClick: actions.downloadThenLeave,
        primary: false,
      };
      return {
        title: t.navigationGuard.unsavedTitle,
        body: t.navigationGuard.unsavedBody,
        // useWorkInFlight hands back no empty list today. The check is what
        // stops a button labelled Download appearing with nothing behind it if
        // a later reason for "unsaved" ever does.
        buttons: reason.downloads.length > 0 ? [stay, download, leave] : [stay, leave],
      };
    }
    case "editor-dirty":
      return {
        title: t.navigationGuard.editorTitle,
        body: t.navigationGuard.editorBody,
        buttons: [stay, leave],
      };
  }
}

/**
 * Warns before a close or a navigation throws away a running job or a result
 * the user never took.
 *
 * This is the only useBlocker call site in the app: the router supports one
 * blocker at a time and warns when a second registers. Anything else that
 * wants to guard navigation adds a reason to useWorkInFlight instead.
 */
export function NavigationGuard() {
  const { t } = useTranslation();
  const reason = useWorkInFlight();
  // useWorkInFlight rebuilds its return value every render, so effects key on
  // this boolean. `[reason]` would re-run them on every store patch in a run.
  const hasWork = reason !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Set from the moment a download starts here until the block it answers is
  // gone. See the auto-proceed effect below for both things it holds off.
  const downloadPendingRef = useRef(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // A stable identity, not an inline arrow. In react-router 8.3.0 the effect
  // that allocates a blocker key is keyed on [router] alone, so an arrow buys no
  // second blocker; what it buys is the function-assignment effect re-running on
  // every render, which during a run is every store patch.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (!hasWork) return false;
      // The same spelling useWorkInFlight uses. React Router matches
      // case-insensitively and tolerates a trailing slash, so without this
      // "/image/compress-image/" reads as a different page from the one it
      // renders and the guard asks about a navigation that goes nowhere.
      const next = normalizePath(nextLocation.pathname);
      if (NEVER_BLOCKED.has(next)) return false;
      // automate-page clears router state by navigating to its own path.
      return normalizePath(currentLocation.pathname) !== next;
    },
    [hasWork],
  );

  const blocker = useBlocker(shouldBlock);
  const blocked = blocker.state === "blocked";

  const stay = useCallback(() => blocker.reset?.(), [blocker]);
  const leave = useCallback(() => blocker.proceed?.(), [blocker]);

  // The block this flag answers is over, so the next one starts clean.
  useEffect(() => {
    if (!blocked) downloadPendingRef.current = false;
  }, [blocked]);

  // AuthGuard can swap this component out in the tick between the download and
  // the leave it defers. useBlocker's cleanup deletes the blocker on that
  // unmount, and react-router throws on a proceed that lands on a blocker which
  // is no longer there, out of a timer where nothing catches it.
  useEffect(
    () => () => {
      if (leaveTimerRef.current !== null) clearTimeout(leaveTimerRef.current);
    },
    [],
  );

  // The run finished and auto-saved while the user was reading the dialog.
  // Stop asking about work that is no longer at risk.
  //
  // Never while downloading and leaving is under way, though, on either side of
  // its proceed. Before it: claiming a result drops hasWork, so this effect
  // would commit the navigation mid-download and the remount's reset() would
  // revoke the blob url the browser is still reading. After it: this effect
  // runs once more holding the blocker object from the blocked render, and a
  // second proceed on one block is a transition react-router throws on.
  useEffect(() => {
    if (blocked && !hasWork && !downloadPendingRef.current) blocker.proceed?.();
  }, [blocked, hasWork, blocker]);

  // Escape means stay. A guard a stray keypress dismisses into data loss is
  // worse than no guard, so the destructive answer needs a deliberate click.
  useEffect(() => {
    if (!blocked) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      blocker.reset?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [blocked, blocker]);

  useFocusTrap(dialogRef, blocked);

  if (!blocked || !reason) return null;

  const downloadThenLeave = () => {
    // The flag doubles as the re-entry guard. A second click before the
    // deferred tick would hand the browser the same files again and queue a
    // second proceed on a block that only has one answer left in it.
    if (reason.kind !== "unsaved" || downloadPendingRef.current) return;
    downloadPendingRef.current = true;

    const tookTheZip = reason.downloads.some((item) => item.kind === "zip");
    // Total over the union, so no member can be silently skipped.
    for (const item of reason.downloads) {
      // A zip carries a raw Blob, so downloadBlob mints an object url for it
      // and owns revoking that url. A result carries a url the file store
      // minted and revokes in reset(), so handing it over is the whole job:
      // revoking it here would cut the preview still on screen.
      if (item.kind === "zip") downloadBlob(item.blob, item.filename);
      else triggerDownload(item.url, item.filename);
    }

    // Claim and navigate on a later tick. Proceeding commits the navigation,
    // which remounts tool-page, whose reset() revokes these blob urls. Doing it
    // in this tick can cancel a download the browser has not started yet.
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      const store = useFileStore.getState();
      // Claims exactly what went out above, by the indices the downloads
      // carry, never whatever the store holds now. A result that lands in this
      // window is not in the list, so it stays unclaimed and keeps warning.
      // The zip needs no such care: it holds every result, so taking it claims
      // the whole batch.
      if (tookTheZip) {
        store.markBatchClaimed();
      } else {
        for (const item of reason.downloads) {
          if (item.kind === "result") store.markClaimed(item.index);
        }
      }
      blocker.proceed?.();
    }, 0);
  };

  const dialog = guardDialog(t, reason, { stay, leave, downloadThenLeave });

  return (
    // Above every other fixed layer in the app: the migration banner sits at 55
    // and the connection banner and editor menus at 60, and the survey overlay
    // shares 50 but renders after this one, so a plain z-50 leaves a mouse user
    // clickable buttons outside a dialog aria-modal says is the only thing here.
    // The skip-to-content link at 100 stays on top, as it should.
    <div className="fixed inset-0 z-[65] flex items-center justify-center">
      {/* Inert on purpose. A misplaced click on the backdrop is exactly the
          accident this dialog exists to catch, so it answers nothing. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={BODY_ID}
        className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-border bg-background p-5 text-start shadow-xl"
      >
        <h2 id={TITLE_ID} className="text-sm font-semibold text-foreground">
          {dialog.title}
        </h2>
        <p id={BODY_ID} className="mt-2 text-sm text-muted-foreground">
          {dialog.body}
        </p>

        {/* Stacked, never a row. German runs 59 display units across these
            labels and Japanese 52, against 20 for English's widest. */}
        <div className="mt-5 flex flex-col gap-2">
          {dialog.buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              onClick={button.onClick}
              className={
                button.primary
                  ? "w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  : "w-full rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              }
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
