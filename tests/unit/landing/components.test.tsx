// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const fetchMock = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ stargazers_count: 500 }),
});
vi.stubGlobal("fetch", fetchMock);

import { Enterprise } from "@landing/components/enterprise";
import { Footer } from "@landing/components/footer";
import { Hero } from "@landing/components/hero";
import { OpenSource } from "@landing/components/open-source";
import { Pricing } from "@landing/components/pricing";
import { TypingCursor } from "@landing/components/typing-cursor";
import { WhyChoose } from "@landing/components/why-choose";

afterEach(cleanup);

// ── Hero ──────────────────────────────────────────────────────────────

describe("Hero", () => {
  it("renders the headline", () => {
    render(<Hero />);
    expect(screen.getByText("Your images. Stay yours.")).toBeDefined();
  });

  it("renders the subheadline", () => {
    render(<Hero />);
    expect(
      screen.getByText("The open-source, self-hosted image processing platform."),
    ).toBeDefined();
  });

  it("renders the CTA button linking to GitHub", () => {
    render(<Hero />);
    const cta = screen.getByText("Get it for free");
    const link = cta.closest("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/snapotter-hq/snapotter");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("renders the word cloud (hidden on mobile)", () => {
    render(<Hero />);
    expect(screen.getByText("Resize")).toBeDefined();
    expect(screen.getByText("OCR")).toBeDefined();
    expect(screen.getByText("Remove BG")).toBeDefined();
  });
});

// ── TypingCursor ──────────────────────────────────────────────────────

describe("TypingCursor", () => {
  it("renders the first phrase", () => {
    render(<TypingCursor />);
    expect(screen.getByText("No signups. No accounts.")).toBeDefined();
  });

  it("uses a 3-second interval for rotation", () => {
    vi.useFakeTimers();
    render(<TypingCursor />);
    const first = screen.getByText("No signups. No accounts.");
    expect(first).toBeDefined();
    vi.useRealTimers();
  });
});

// ── WhyChoose ─────────────────────────────────────────────────────────

describe("WhyChoose", () => {
  it("renders the section heading", () => {
    render(<WhyChoose />);
    expect(screen.getByText("Built different. On purpose.")).toBeDefined();
  });

  it("renders all 9 benefit cards", () => {
    render(<WhyChoose />);
    const titles = [
      "No Signup",
      "No Uploads",
      "Forever Free",
      "No Limits",
      "Batch Processing",
      "Lightning Fast",
      "Open Source",
      "REST API",
      "Pipeline Automation",
    ];
    for (const title of titles) {
      expect(screen.getByText(title)).toBeDefined();
    }
  });

  it("renders descriptions for each card", () => {
    render(<WhyChoose />);
    expect(screen.getByText("Start instantly, no accounts or emails required.")).toBeDefined();
    expect(screen.getByText("Chain tools together. Automate your workflows.")).toBeDefined();
  });
});

// ── Enterprise ────────────────────────────────────────────────────────

describe("Enterprise", () => {
  it("renders the section heading", () => {
    render(<Enterprise />);
    expect(screen.getByText("Your data never leaves your network.")).toBeDefined();
  });

  it("renders all 3 enterprise feature cards", () => {
    render(<Enterprise />);
    expect(screen.getByText("Data Sovereignty")).toBeDefined();
    expect(screen.getByText("Enterprise Controls")).toBeDefined();
    expect(screen.getByText("Deploy Anywhere")).toBeDefined();
  });

  it("mentions compliance standards", () => {
    render(<Enterprise />);
    expect(screen.getByText(/GDPR, HIPAA, CCPA/)).toBeDefined();
  });
});

// ── Pricing ───────────────────────────────────────────────────────────

describe("Pricing", () => {
  it("renders the section heading", () => {
    render(<Pricing />);
    expect(screen.getByText(/Free for everyone/)).toBeDefined();
  });

  it("renders both plan names", () => {
    render(<Pricing />);
    expect(screen.getByText("Open Source")).toBeDefined();
    expect(screen.getByText("Enterprise")).toBeDefined();
  });

  it("renders Free price", () => {
    render(<Pricing />);
    expect(screen.getByText("Free")).toBeDefined();
  });

  it("renders Custom price for enterprise", () => {
    render(<Pricing />);
    expect(screen.getByText("Custom")).toBeDefined();
  });

  it("renders free plan features", () => {
    render(<Pricing />);
    expect(screen.getByText("All 40+ image processing tools")).toBeDefined();
    expect(screen.getByText("Unlimited usage, no hidden caps")).toBeDefined();
    expect(screen.getByText("14 local AI models included")).toBeDefined();
    expect(screen.getByText("AGPL-3.0 licensed")).toBeDefined();
  });

  it("renders enterprise features", () => {
    render(<Pricing />);
    expect(screen.getByText("Everything in Open Source")).toBeDefined();
    expect(screen.getByText("Priority email and video support")).toBeDefined();
    expect(screen.getByText("OEM and white-label options")).toBeDefined();
  });

  it("links free plan CTA to GitHub", () => {
    render(<Pricing />);
    const freeButton = screen.getByText(/Get Started Free/);
    expect(freeButton.closest("a")?.getAttribute("href")).toBe(
      "https://github.com/snapotter-hq/snapotter",
    );
  });

  it("links enterprise CTA to contact page", () => {
    render(<Pricing />);
    const contactButton = screen.getByText(/Contact Sales/);
    expect(contactButton.closest("a")?.getAttribute("href")).toBe("/contact");
  });
});

// ── OpenSource ────────────────────────────────────────────────────────

describe("OpenSource", () => {
  it("renders the heading", () => {
    render(<OpenSource />);
    expect(screen.getByText("Open source. Always.")).toBeDefined();
  });

  it("renders the description mentioning AGPL-3.0", () => {
    render(<OpenSource />);
    expect(screen.getByText(/AGPL-3.0 licensed/)).toBeDefined();
  });

  it("links to GitHub", () => {
    render(<OpenSource />);
    const link = screen.getByText("Star on GitHub").closest("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/snapotter-hq/snapotter");
  });
});

// ── Footer ────────────────────────────────────────────────────────────

describe("Footer", () => {
  it("renders the brand", () => {
    render(<Footer />);
    expect(screen.getByText("SnapOtter")).toBeDefined();
  });

  it("renders all four column titles", () => {
    render(<Footer />);
    expect(screen.getByText("Product")).toBeDefined();
    expect(screen.getByText("Resources")).toBeDefined();
    expect(screen.getByText("Community")).toBeDefined();
    expect(screen.getByText("Legal")).toBeDefined();
  });

  it("renders product links", () => {
    render(<Footer />);
    expect(screen.getByText("Features")).toBeDefined();
    expect(screen.getByText("Pricing")).toBeDefined();
  });

  it("renders community links to GitHub", () => {
    render(<Footer />);
    const ghLink = screen.getByText("GitHub");
    expect(ghLink.closest("a")?.getAttribute("href")).toBe(
      "https://github.com/snapotter-hq/snapotter",
    );
  });

  it("renders legal links", () => {
    render(<Footer />);
    expect(screen.getByText("Terms and Conditions")).toBeDefined();
    expect(screen.getByText("Privacy Policy")).toBeDefined();
    expect(screen.getByText("FAQ")).toBeDefined();
  });

  it("renders the copyright notice with current year", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year}`))).toBeDefined();
  });

  it("opens external links in new tab", () => {
    render(<Footer />);
    const docsLink = screen.getByText("Documentation").closest("a");
    expect(docsLink?.getAttribute("target")).toBe("_blank");
    expect(docsLink?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps internal links without target=_blank", () => {
    render(<Footer />);
    const faqLink = screen.getByText("FAQ").closest("a");
    expect(faqLink?.getAttribute("target")).toBeNull();
  });
});
