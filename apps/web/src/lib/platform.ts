/**
 * The subset of `Navigator` the platform check reads. `userAgentData` is the
 * User-Agent Client Hints object, which lib.dom does not type yet.
 */
export interface PlatformNavigator {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod|ios/i;

/**
 * Whether the app-wide shortcut modifier is Cmd (Apple platforms) rather than
 * Ctrl. The global shortcut handler and every hint that names its modifier
 * read this one function, so a hint can't disagree with the key that works.
 *
 * `navigator.platform` comes first: it is deprecated but present in every
 * browser, reports the real OS, and Playwright's device emulation leaves it
 * alone, whereas the client-hints platform follows an emulated user agent
 * (the "Desktop Chrome" descriptor claims Windows on every host). The client
 * hint and then the user-agent string only cover a browser that blanks
 * `platform`. Without a navigator (Node, SSR) the answer is false.
 */
export function isApplePlatform(
  nav: PlatformNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as PlatformNavigator),
): boolean {
  if (!nav) return false;
  const hint = nav.platform || nav.userAgentData?.platform || nav.userAgent || "";
  return APPLE_PLATFORM.test(hint);
}
