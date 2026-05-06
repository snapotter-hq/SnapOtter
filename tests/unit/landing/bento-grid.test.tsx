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

afterEach(cleanup);

function getCountText(): string {
  const el = screen.getByText(/^Showing/);
  return el.textContent ?? "";
}

describe("BentoGrid", () => {
  it("renders the section heading", () => {
    render(<BentoGrid />);
    expect(screen.getByText("48 tools. Zero cloud dependency.")).toBeDefined();
  });

  it("renders the search input", () => {
    render(<BentoGrid />);
    expect(screen.getByPlaceholderText("Search tools...")).toBeDefined();
  });

  it("shows all tools by default", () => {
    render(<BentoGrid />);
    const text = getCountText();
    expect(text).toMatch(/Showing 48 of 48 tools/);
  });

  it("renders category filter pills including All", () => {
    render(<BentoGrid />);
    expect(screen.getByText((_, el) => el?.textContent === "All (48)")).toBeDefined();
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
    expect(text).toMatch(/Showing \d+ of 48 tools/);
    expect(screen.queryByText("OCR / Text Extraction")).toBeNull();
  });

  it("filters tools by category", () => {
    render(<BentoGrid />);
    const aiButton = screen.getByText(/AI Tools/);
    fireEvent.click(aiButton);
    const text = getCountText();
    expect(text).toMatch(/Showing 15 of 48 tools/);
    expect(screen.getByText("Remove Background")).toBeDefined();
    expect(screen.queryByText("Resize")).toBeNull();
  });

  it("shows empty state when search matches nothing", () => {
    render(<BentoGrid />);
    const input = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });
    expect(screen.getByText("No tools found. Try a different search.")).toBeDefined();
    const text = getCountText();
    expect(text).toMatch(/Showing 0 of 48 tools/);
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
    expect(getCountText()).toMatch(/Showing 15 of 48 tools/);
    fireEvent.click(screen.getByText((_, el) => el?.textContent === "All (48)"));
    expect(getCountText()).toMatch(/Showing 48 of 48 tools/);
  });

  it("renders each tool with name and description", () => {
    render(<BentoGrid />);
    expect(screen.getByText("Crop")).toBeDefined();
    expect(screen.getByText("Freeform crop, aspect ratio presets, shape crop")).toBeDefined();
  });

  it("renders all 8 category pills", () => {
    render(<BentoGrid />);
    const categoryNames = [
      "Essentials",
      "Optimization",
      "Adjustments",
      "AI Tools",
      "Watermark & Overlay",
      "Utilities",
      "Layout & Composition",
      "Format & Conversion",
    ];
    for (const name of categoryNames) {
      expect(screen.getByText(new RegExp(name))).toBeDefined();
    }
  });
});
