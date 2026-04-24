// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: { writeText: writeTextMock },
});

import { HowItWorks } from "@landing/components/how-it-works";

beforeEach(() => {
  writeTextMock.mockClear();
});

afterEach(cleanup);

const DOCKER_COMMAND =
  "docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest";

describe("HowItWorks", () => {
  it("renders the section heading", () => {
    render(<HowItWorks />);
    expect(screen.getByText(/One command/)).toBeDefined();
  });

  it("renders the subtitle", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Get started in seconds")).toBeDefined();
  });

  it("displays the Docker command", () => {
    render(<HowItWorks />);
    expect(screen.getByText(DOCKER_COMMAND)).toBeDefined();
  });

  it("displays the dollar sign prompt", () => {
    render(<HowItWorks />);
    expect(screen.getByText("$")).toBeDefined();
  });

  it("shows Copy label before clicking", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("copies command to clipboard on click", async () => {
    render(<HowItWorks />);
    const button = screen.getByText(DOCKER_COMMAND).closest("button")!;
    fireEvent.click(button);
    expect(writeTextMock).toHaveBeenCalledWith(DOCKER_COMMAND);
  });

  it("shows Copied! feedback after clicking", async () => {
    render(<HowItWorks />);
    const button = screen.getByText(DOCKER_COMMAND).closest("button")!;
    fireEvent.click(button);
    expect(screen.getByText("Copied!")).toBeDefined();
  });

  it("sets a timeout to revert copy state", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setTimeout");
    render(<HowItWorks />);
    const button = screen.getByText(DOCKER_COMMAND).closest("button")!;
    fireEvent.click(button);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 2000);
    spy.mockRestore();
    vi.useRealTimers();
  });

  it("renders the terminal window chrome", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Quick Start")).toBeDefined();
  });

  it("links to documentation", () => {
    render(<HowItWorks />);
    const docsLink = screen.getByText("Read the docs");
    expect(docsLink.closest("a")?.getAttribute("href")).toBe("https://docs.snapotter.com");
  });

  it("mentions platform support", () => {
    render(<HowItWorks />);
    expect(screen.getByText(/Linux, macOS, and Windows/)).toBeDefined();
  });
});
