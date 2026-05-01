// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { Navbar } from "@landing/components/navbar";

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    json: () => Promise.resolve({ stargazers_count: 1234 }),
  });
});

afterEach(cleanup);

describe("Navbar", () => {
  it("renders the brand name", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByText("SnapOtter")).toBeDefined();
  });

  it("renders navigation links", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getAllByText("Features").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pricing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Docs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Contact").length).toBeGreaterThan(0);
  });

  it("renders Book a Demo CTA", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    const ctas = screen.getAllByText("Book a Demo");
    expect(ctas.length).toBeGreaterThan(0);
  });

  it("fetches GitHub star count on mount", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/snapotter-hq/snapotter");
  });

  it("displays formatted star count after fetch", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByText("1.2k")).toBeDefined();
  });

  it("formats star count correctly for exact thousands", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ stargazers_count: 2000 }),
    });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByText("2k")).toBeDefined();
  });

  it("shows raw count for numbers under 1000", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ stargazers_count: 456 }),
    });
    await act(async () => {
      render(<Navbar />);
    });
    expect(screen.getByText("456")).toBeDefined();
  });

  it("handles star fetch failure gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));
    await act(async () => {
      render(<Navbar />);
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.getAllByText("Star on GitHub").length).toBeGreaterThan(0);
  });

  it("toggles mobile menu on hamburger click", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    const toggleButton = screen.getByLabelText("Toggle menu");
    expect(screen.queryByText("Book a Demo")).toBeDefined();
    fireEvent.click(toggleButton);
    const mobileLinks = screen.getAllByText("Features");
    expect(mobileLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("closes mobile menu when a link is clicked", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    const mobileFeatures = screen.getAllByText("Features");
    fireEvent.click(mobileFeatures[mobileFeatures.length - 1]);
  });

  it("links Docs to external URL with target=_blank", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    const docsLinks = screen.getAllByText("Docs");
    const externalDoc = docsLinks.find(
      (el) => el.closest("a")?.getAttribute("target") === "_blank",
    );
    expect(externalDoc).toBeDefined();
    expect(externalDoc?.closest("a")?.getAttribute("href")).toBe("https://docs.snapotter.com");
  });

  it("links GitHub button to correct repo", async () => {
    await act(async () => {
      render(<Navbar />);
    });
    const githubLinks = screen.getAllByText("Star on GitHub");
    const link = githubLinks[0].closest("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/snapotter-hq/snapotter");
    expect(link?.getAttribute("target")).toBe("_blank");
  });
});
