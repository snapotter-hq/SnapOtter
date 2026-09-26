import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderSponsorsBlock,
  replaceSponsorsBlock,
  selectSponsors,
} from "../../../scripts/update-readme-sponsors.mjs";

function node(login: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    createdAt,
    privacyLevel: "PUBLIC",
    sponsorEntity: { login, name: null },
    ...extra,
  };
}

describe("selectSponsors", () => {
  it("keeps lapsed sponsors and orders everyone by when they first sponsored", () => {
    const sponsors = selectSponsors([
      node("dominic427", "2026-09-11T08:49:40Z", { isActive: true }),
      node("kkwpsi", "2026-06-08T19:43:55Z", { isActive: false }),
      node("highb", "2026-08-30T04:17:49Z", { isActive: true }),
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["kkwpsi", "highb", "dominic427"]);
  });

  it("leaves private sponsorships out", () => {
    const sponsors = selectSponsors([
      node("highb", "2026-08-30T04:17:49Z"),
      node("zakka258", "2026-09-25T07:18:23Z", { privacyLevel: "PRIVATE" }),
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["highb"]);
  });

  it("lists someone who sponsored more than once a single time, at their first date", () => {
    const sponsors = selectSponsors([
      node("highb", "2026-08-30T04:17:49Z"),
      node("kkwpsi", "2026-09-20T00:00:00Z"),
      node("kkwpsi", "2026-06-08T19:43:55Z"),
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["kkwpsi", "highb"]);
  });

  it("keeps the earliest date when the earlier sponsorship comes first", () => {
    const sponsors = selectSponsors([
      node("kkwpsi", "2026-06-08T19:43:55Z"),
      node("highb", "2026-08-30T04:17:49Z"),
      node("kkwpsi", "2026-09-20T00:00:00Z"),
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["kkwpsi", "highb"]);
  });

  // GitHub keeps showing a public sponsorship publicly, so one is enough to list
  // someone, dated by their earliest public sponsorship.
  it("lists a sponsor who has both public and private sponsorships", () => {
    const sponsors = selectSponsors([
      node("highb", "2026-08-01T00:00:00Z"),
      node("mixed", "2026-06-01T00:00:00Z", { privacyLevel: "PRIVATE" }),
      node("mixed", "2026-09-01T00:00:00Z"),
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["highb", "mixed"]);
  });

  it("uses the display name when there is one and falls back to the login", () => {
    const [named, bare] = selectSponsors([
      {
        ...node("CSP-Tom", "2026-09-08T17:52:39Z"),
        sponsorEntity: { login: "CSP-Tom", name: "Tom" },
      },
      node("highb", "2026-09-09T00:00:00Z"),
    ]);
    expect(named.name).toBe("Tom");
    expect(bare.name).toBe("highb");
  });

  it("skips sponsor entities GitHub returns empty, such as a deleted account", () => {
    const sponsors = selectSponsors([
      node("highb", "2026-08-30T04:17:49Z"),
      { createdAt: "2026-07-01T00:00:00Z", privacyLevel: "PUBLIC", sponsorEntity: null },
    ]);
    expect(sponsors.map((s) => s.login)).toEqual(["highb"]);
  });
});

describe("renderSponsorsBlock", () => {
  it("renders an avatar row and a handle row", () => {
    const block = renderSponsorsBlock([
      { login: "kkwpsi", name: "Karol" },
      { login: "highb", name: "Brandon High" },
    ]);
    expect(block).toContain(
      '<a href="https://github.com/kkwpsi"><img src="https://github.com/kkwpsi.png?size=72" width="72" height="72" alt="Karol"></a>',
    );
    expect(block).toContain(
      '<a href="https://github.com/kkwpsi">@kkwpsi</a> &nbsp;&middot;&nbsp; <a href="https://github.com/highb">@highb</a>',
    );
  });

  // Display names are whatever the sponsor typed into their GitHub profile.
  it("escapes the display name before it lands in the alt attribute", () => {
    const block = renderSponsorsBlock([{ login: "evil", name: '"><script>x</script>' }]);
    expect(block).toContain('alt="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
    expect(block).not.toContain("<script>");
  });

  it("refuses an empty list rather than wiping the README block", () => {
    expect(() => renderSponsorsBlock([])).toThrow(/no public sponsors/i);
  });
});

describe("replaceSponsorsBlock", () => {
  const readme = "intro\n<!-- sponsors -->\nold\n<!-- sponsors -->\noutro\n";

  it("swaps only what sits between the markers", () => {
    expect(replaceSponsorsBlock(readme, "new")).toBe(
      "intro\n<!-- sponsors -->\nnew\n<!-- sponsors -->\noutro\n",
    );
  });

  it("fails when the markers are missing instead of writing nothing", () => {
    expect(() => replaceSponsorsBlock("no markers here", "new")).toThrow(/markers/);
  });

  it("fails when only one marker is left", () => {
    expect(() => replaceSponsorsBlock("intro\n<!-- sponsors -->\nold\n", "new")).toThrow(/markers/);
  });

  // The workflow opens a PR whenever README.md changes, so a second pass with the
  // same sponsors must be a no-op or it would churn a PR every day.
  it("is idempotent", () => {
    const once = replaceSponsorsBlock(readme, "new");
    expect(replaceSponsorsBlock(once, "new")).toBe(once);
  });

  it("finds the paired markers in the real README", () => {
    const real = readFileSync(path.resolve(process.cwd(), "README.md"), "utf8");
    expect(() => replaceSponsorsBlock(real, "new")).not.toThrow();
  });
});
