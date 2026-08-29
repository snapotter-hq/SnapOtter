// Real user feedback, quoted verbatim.
//
// RULES FOR EDITING THIS FILE:
//   1. Never write a quote nobody actually said. Every entry traces to a public
//      URL or a `feedback_submitted` PostHog event.
//   2. Keep the author's typos and phrasing. "Painless proces" is not a bug.
//   3. Square brackets mark the only words we changed; "..." marks a cut. Both
//      stay visible to the reader.
//   4. `context: "Shared via in-app feedback"` quotes came through the feedback
//      dialog, which only ever promised "You can contact me about this feedback."
//      They are published unattributed for that reason. Do not attach names to
//      them without asking the author first.
//
// Deliberately EXCLUDED, so nobody re-adds them later:
//   - Four r/selfhosted comments that read as astroturf (two sit at negative
//     score, one trails off mid-sentence). Polished, hollow, and not worth the
//     credibility risk.
//   - Anything from the launch thread, which is dominated by the Stirling naming
//     dispute. Quoting it points readers straight at that argument.

export interface Testimonial {
  /** Displayed text. Verbatim apart from [bracketed] edits and "..." cuts. */
  quote: string;
  /** Person's name or handle, or a neutral descriptor for anonymous in-app feedback. */
  author: string;
  /** Where it was said. Doubles as the link label when `url` is set. */
  context: string;
  /** Public source we can link back to. Absent for in-app feedback. */
  url?: string;
  /** BCP-47 tag when the quote is not in English, for correct screen-reader pronunciation. */
  lang?: string;
  /** Surfaced in the single-row hero strip (a teaser for the full section). */
  hero?: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "This self-hosted tool gave me control. My photos and the light editing I need to do are no longer tied to a subscription.",
    author: "Dhruv Bhutani",
    context: "XDA Developers",
    url: "https://www.xda-developers.com/i-ditched-lightroom-subscription-for-a-self-hosted-tool/",
    hero: true,
  },
  {
    quote:
      "Fantastic software! I managed to replace the old ass convertx and even got more features with SnapOtter.",
    author: "Self-hosted admin",
    context: "Shared via in-app feedback",
    hero: true,
  },
  {
    quote:
      "If you're already running a home server, SnapOtter is a no-brainer addition. The Docker command takes less than a minute...",
    author: "Yadullah Abidi",
    context: "MakeUseOf",
    url: "https://www.makeuseof.com/stopped-using-cloud-image-editors-found-self-hosted-alternative/",
    hero: true,
  },
  {
    quote: "I have a 24/7 server that I run SnapOtter on (which is working perfectly!)",
    author: "@amn-96",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/189",
    hero: true,
  },
  {
    quote: "Holy shit this is great!",
    author: "u/Big_Wave9732",
    context: "r/selfhosted",
    url: "https://www.reddit.com/comments/oinueb0",
  },
  {
    quote: "Installed via UnRAID store. Painless proces, quick and easy. Kudos!",
    author: "Unraid user",
    context: "Shared via in-app feedback",
  },
  {
    quote: "das perfekte Schweizer Taschenmesser für eure Dateien",
    author: "Deployn",
    context: "YouTube",
    url: "https://www.youtube.com/watch?v=UonUAfkSoqM",
    lang: "de",
    hero: true,
  },
  {
    quote: "Your software is incredible ... thanks for all hard work",
    author: "@arturbacilla",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/189#issuecomment-4771081169",
    hero: true,
  },
  {
    quote: "Thank you for your hard work. This is an excellent endeavor.",
    author: "@Wbbdlr",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/106#issuecomment-4354796398",
  },
  {
    quote: "In any case, it's a great program! I really like it.",
    author: "Homelab user",
    context: "Shared via in-app feedback",
  },
  {
    quote: "Looks like a very helpful app, especially removing EXIF easily from a browser UI.",
    author: "u/xilex",
    context: "r/selfhosted",
    url: "https://www.reddit.com/comments/ojmrskw",
  },
  {
    quote:
      "first of all, thank you for creating Snapotter. I really like the concept and the workflow so far.",
    author: "@JamDaBam",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/discussions/357",
  },
  {
    quote: "Thank you for your help!  PS It's a great program.",
    author: "@mptpro",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/214#issuecomment-4697181441",
  },
  {
    quote: "Love the work you guys have put into this! Great job!",
    author: "Docker user",
    context: "Shared via in-app feedback",
    hero: true,
  },
  {
    quote: "SnapOtter has excellent Smart Crop (subject/face/trim) and Split Image tools",
    author: "@MrCoala",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/discussions/609",
    hero: true,
  },
  {
    quote: "Thanks for creating this! Very helpful on linux systems especially",
    author: "u/sidcode",
    context: "r/selfhosted",
    url: "https://www.reddit.com/comments/ojh9ym4",
    hero: true,
  },
  {
    quote: "Hi, awesome tool.",
    author: "@luxmara",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/16",
  },
  {
    quote: "Super Unraid Template! Prima gemacht :)",
    author: "Unraid user",
    context: "Shared via in-app feedback",
    lang: "de",
  },
  {
    quote: "I can confirm this worked. Thank you for the quick reply and fix. The tool works great",
    author: "u/joshrj45",
    context: "r/homelab",
    url: "https://www.reddit.com/comments/ot97w9z",
  },
  {
    quote:
      "the app looks great, and this is something I really need for my team and I as we spend all day merchandising product listings on amazon and other ecommerce sites.",
    author: "@regalen",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/7",
  },
  {
    quote: "Awesome, thank you for the fast fix!",
    author: "@Jisagi",
    context: "GitHub",
    url: "https://github.com/snapotter-hq/SnapOtter/issues/98#issuecomment-4320370719",
  },
  {
    quote:
      "If you're looking for a self-hosted alternative to online image editing services, SnapOtter is a great app.",
    author: "Akash Jain",
    context: "YouTube",
    url: "https://www.youtube.com/watch?v=HWC3jX8-tiw",
    hero: true,
  },
];

/**
 * Split into two rows that scroll in opposite directions.
 * Alternating spreads the strongest quotes across both rows instead of stacking
 * them all in the top one.
 */
export const TESTIMONIAL_ROWS: Testimonial[][] = [
  TESTIMONIALS.filter((_, i) => i % 2 === 0),
  TESTIMONIALS.filter((_, i) => i % 2 === 1),
];

/**
 * Curated single-row subset for the hero social-proof strip, weighted toward
 * quotes with a public, clickable source. In-app quotes stay unattributed per
 * the rules at the top of this file. This is a teaser; the full Testimonials
 * section renders every entry in TESTIMONIALS.
 */
export const HERO_TESTIMONIALS: Testimonial[] = TESTIMONIALS.filter((t) => t.hero);
