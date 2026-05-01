// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/fade-in", () => ({
  FadeIn: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/components/footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("@/components/navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

const fetchMock = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ stargazers_count: 100 }),
});
vi.stubGlobal("fetch", fetchMock);

import PrivacyPage from "@landing/app/privacy/page";

afterEach(cleanup);

describe("PrivacyPage", () => {
  it("renders the page heading", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Privacy Policy")).toBeDefined();
  });

  it("renders the last updated date", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Last updated/)).toBeDefined();
  });

  it("renders the Navbar and Footer", () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId("navbar")).toBeDefined();
    expect(screen.getByTestId("footer")).toBeDefined();
  });

  it("renders the Overview section", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText(/self-hosted software/)).toBeDefined();
  });

  it("renders all section headings", () => {
    render(<PrivacyPage />);
    const headings = [
      "Overview",
      "Website (snapotter.com)",
      "Self-Hosted Software",
      "Optional Analytics",
      "Contact Form",
      "Open Source",
      "Changes",
      "Contact",
    ];
    for (const heading of headings) {
      expect(screen.getByText(heading)).toBeDefined();
    }
  });

  it("states no tracking cookies are used", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("We do not use tracking cookies.")).toBeDefined();
  });

  it("states all processing happens on user server", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("All image processing happens entirely on your server.")).toBeDefined();
  });

  it("states analytics is disabled by default", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Analytics is disabled by default.")).toBeDefined();
  });

  it("mentions PostHog for analytics", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/PostHog/)).toBeDefined();
  });

  it("mentions Formspree for contact form", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByText(/Formspree/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the contact email link", () => {
    render(<PrivacyPage />);
    const emailLink = screen.getByText("contact@snapotter.com");
    expect(emailLink.closest("a")?.getAttribute("href")).toBe("mailto:contact@snapotter.com");
  });

  it("states the codebase is open source and inspectable", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/inspect the entire codebase/)).toBeDefined();
  });
});
