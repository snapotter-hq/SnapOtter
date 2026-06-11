// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { BentoGrid } from "@landing/components/bento-grid";
import { CATEGORIES, TOOLS } from "@snapotter/shared";

const TOTAL = TOOLS.length;
const AI_COUNT = TOOLS.filter((t) => t.category === "ai").length;

afterEach(cleanup);

function getCountText(): string {
  const el = screen.getByText(/^Showing/);
  return el.textContent ?? "";
}

describe("BentoGrid", () => {
  it("renders the section heading", () => {
    render(<BentoGrid />);
    expect(screen.getByText("50+ tools. Zero cloud dependency.")).toBeDefined();
  });

  it("renders the search input", () => {
    render(<BentoGrid />);
    expect(screen.getByPlaceholderText("Search tools...")).toBeDefined();
  });

  it("shows all tools by default", () => {
    render(<BentoGrid />);
    const text = getCountText();
    expect(text).toBe(`Showing ${TOTAL} of ${TOTAL} tools`);
  });

  it("renders category filter pills including All", () => {
    render(<BentoGrid />);
    expect(screen.getByText((_, el) => el?.textContent === `All (${TOTAL})`)).toBeDefined();
    expect(screen.getByText(/Essentials/)).toBeDefined();
    expect(screen.getByText(/AI Tools/)).toBeDefined();
    expect(screen.getByText(/Optimization/)).toBeDefined();
  });

  it("filters tools by search query", () => {
    render(<BentoGrid />);
    const input = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "resize" } });
    expect(screen.getByText("Resize")).toBeDefined();
    const text = getCountText();
    expect(text).toMatch(new RegExp(`Showing \\d+ of ${TOTAL} tools`));
    expect(screen.queryByText("OCR / Text Extraction")).toBeNull();
  });

  it("filters tools by category", () => {
    render(<BentoGrid />);
    const aiButton = screen.getByText(/AI Tools/);
    fireEvent.click(aiButton);
    const text = getCountText();
    expect(text).toBe(`Showing ${AI_COUNT} of ${TOTAL} tools`);
    expect(screen.getByText("Remove Background")).toBeDefined();
    expect(screen.queryByText("Resize")).toBeNull();
  });

  it("shows empty state when search matches nothing", () => {
    render(<BentoGrid />);
    const input = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });
    expect(screen.getByText("No tools found. Try a different search.")).toBeDefined();
    const text = getCountText();
    expect(text).toBe(`Showing 0 of ${TOTAL} tools`);
  });

  it("combines search and category filter", () => {
    render(<BentoGrid />);
    const aiButton = screen.getByText(/AI Tools/);
    fireEvent.click(aiButton);
    const input = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "background" } });
    expect(screen.getByText("Remove Background")).toBeDefined();
    expect(screen.queryByText("Image Upscaling")).toBeNull();
  });

  it("clicking All resets category filter", () => {
    render(<BentoGrid />);
    fireEvent.click(screen.getByText(/AI Tools/));
    expect(getCountText()).toBe(`Showing ${AI_COUNT} of ${TOTAL} tools`);
    fireEvent.click(screen.getByText((_, el) => el?.textContent === `All (${TOTAL})`));
    expect(getCountText()).toBe(`Showing ${TOTAL} of ${TOTAL} tools`);
  });

  it("renders each tool with name and description", () => {
    render(<BentoGrid />);
    expect(screen.getByText("Crop")).toBeDefined();
    expect(screen.getByText("Freeform crop, aspect ratio presets, shape crop")).toBeDefined();
  });

  it("renders all category pills", () => {
    render(<BentoGrid />);
    for (const cat of CATEGORIES) {
      const count = TOOLS.filter((t) => t.category === cat.id).length;
      expect(
        screen.getByText((_, el) => el?.textContent === `${cat.name} (${count})`),
      ).toBeDefined();
    }
  });
});
