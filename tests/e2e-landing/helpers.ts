import type { Page } from "@playwright/test";

/**
 * Wait until every scroll-revealed element has finished fading in.
 *
 * `.reveal` transitions opacity over 0.7s and the delay modifiers push the last
 * one to 1.2s, while `networkidle` fires as soon as the requests stop. An axe
 * scan in that window samples a heading at opacity 0.915, blends its colour
 * with the background, and reports a contrast ratio the user never sees. That
 * is how the landing contrast spec produced a 4.47:1 failure against markup
 * that measures clean once the animation settles.
 *
 * Waits for no element to be mid-transition. An element still at 0 has not been
 * scrolled into view and is not going to move, so it is settled too.
 */
export async function waitForRevealsSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const revealed = document.querySelectorAll<HTMLElement>(".reveal");
    return [...revealed].every((element) => {
      const opacity = Number.parseFloat(getComputedStyle(element).opacity);
      return opacity === 0 || opacity === 1;
    });
  });
}
