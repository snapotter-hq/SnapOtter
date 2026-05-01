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

import TermsPage from "@landing/app/terms/page";

afterEach(cleanup);

describe("TermsPage", () => {
  it("renders the page heading", () => {
    render(<TermsPage />);
    expect(screen.getByText("Terms and Conditions")).toBeDefined();
  });

  it("renders the last updated date", () => {
    render(<TermsPage />);
    expect(screen.getByText(/Last updated/)).toBeDefined();
  });

  it("renders the Navbar and Footer", () => {
    render(<TermsPage />);
    expect(screen.getByTestId("navbar")).toBeDefined();
    expect(screen.getByTestId("footer")).toBeDefined();
  });

  it("renders all section headings", () => {
    render(<TermsPage />);
    const headings = [
      "Overview",
      "Software License",
      "Website Use",
      "Self-Hosted Software",
      "Intellectual Property",
      "Limitation of Liability",
      "Changes",
      "Contact",
    ];
    for (const heading of headings) {
      expect(screen.getByText(heading)).toBeDefined();
    }
  });

  it("mentions AGPL-3.0 license", () => {
    render(<TermsPage />);
    const matches = screen.getAllByText(/AGPL-3.0/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("mentions commercial license availability", () => {
    render(<TermsPage />);
    expect(screen.getByText(/commercial license/)).toBeDefined();
  });

  it("states software is provided as-is", () => {
    render(<TermsPage />);
    expect(screen.getByText(/as is/)).toBeDefined();
  });

  it("mentions user responsibility for deployment", () => {
    render(<TermsPage />);
    expect(screen.getByText(/responsible for your own deployment/)).toBeDefined();
  });

  it("renders the contact email link", () => {
    render(<TermsPage />);
    const emailLinks = screen.getAllByText("contact@snapotter.com");
    const mailto = emailLinks.find(
      (el) => el.closest("a")?.getAttribute("href") === "mailto:contact@snapotter.com",
    );
    expect(mailto).toBeDefined();
  });

  it("states website is for informational purposes", () => {
    render(<TermsPage />);
    expect(screen.getByText(/informational purposes/)).toBeDefined();
  });
});
