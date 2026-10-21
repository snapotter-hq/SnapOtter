// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/contexts/i18n-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/i18n-context")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: en,
      locale: "en",
      dir: "ltr",
      setLocale: () => {},
      supportedLocales: [],
    }),
  };
});

import { BulkRenameSettings } from "@/components/tools/bulk-rename-settings";
import { useFileStore } from "@/stores/file-store";

function makeFile(name: string, type = "image/png"): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type });
}

describe("BulkRenameSettings {{original}} preview stem (#3034)", () => {
  beforeEach(() => {
    let blobCount = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
    URL.revokeObjectURL = vi.fn();
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useFileStore.getState().reset();
  });

  it("strips only the trailing extension when the filename stem contains the extension substring", () => {
    useFileStore
      .getState()
      .setFiles([
        makeFile("my.png.photo.png", "image/png"),
        makeFile("logo.svg.backup.svg", "image/svg+xml"),
        makeFile("README", "application/octet-stream"),
        makeFile(".png", "image/png"),
        makeFile("price$$100$&.png", "image/png"),
      ]);

    render(<BulkRenameSettings />);

    const patternInput = screen.getByLabelText(/pattern/i);
    fireEvent.change(patternInput, { target: { value: "{{original}}-copy" } });

    expect(screen.getByText("my.png.photo-copy.png")).toBeInTheDocument();
    expect(screen.getByText("logo.svg.backup-copy.svg")).toBeInTheDocument();
    expect(screen.getByText("README-copy")).toBeInTheDocument();
    expect(screen.getByText(".png-copy")).toBeInTheDocument();
    expect(screen.getByText("price$$100$&-copy.png")).toBeInTheDocument();

    fireEvent.change(patternInput, { target: { value: "{{original}}-{{original}}" } });
    expect(screen.getByText("my.png.photo-my.png.photo.png")).toBeInTheDocument();
  });
});

describe("BulkRenameSettings collision preview and React keys (#3035)", () => {
  beforeEach(() => {
    let blobCount = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
    URL.revokeObjectURL = vi.fn();
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useFileStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("appends _1, _2 collision suffixes for a static pattern without logging duplicate React keys", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useFileStore
      .getState()
      .setFiles([
        makeFile("a.png", "image/png"),
        makeFile("b.png", "image/png"),
        makeFile("c.png", "image/png"),
        makeFile("d.jpg", "image/jpeg"),
      ]);

    const { container } = render(<BulkRenameSettings />);

    const patternInput = screen.getByLabelText(/pattern/i);
    fireEvent.change(patternInput, { target: { value: "photo" } });

    const rows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(rows).toEqual(["photo.png", "photo_1.png", "photo_2.png", "photo.jpg"]);

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("same key")),
    );
    expect(keyWarnings).toEqual([]);
  });

  it("deduplicates case-insensitive, Unicode NFC/NFD, dotfile, and extensionless preview collisions", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useFileStore
      .getState()
      .setFiles([
        makeFile("photo.png", "image/png"),
        makeFile("PHOTO.png", "image/png"),
        makeFile("photo_1.png", "image/png"),
        makeFile("café.png", "image/png"),
        makeFile("café.png", "image/png"),
      ]);

    const { container } = render(<BulkRenameSettings />);

    const patternInput = screen.getByLabelText(/pattern/i);
    fireEvent.change(patternInput, { target: { value: "{{original}}" } });

    const firstRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(firstRows).toEqual([
      "photo.png",
      "PHOTO_1.png",
      "photo_1_1.png",
      "café.png",
      "café_1.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("noext1", "application/octet-stream"),
          makeFile("noext2", "application/octet-stream"),
          makeFile(".png", "image/png"),
          makeFile(".png", "image/png"),
        ]);
    });

    const secondRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(secondRows).toEqual(["noext1", "noext2", ".png", ".png_1"]);

    fireEvent.change(patternInput, { target: { value: "readme" } });
    const thirdRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(thirdRows).toEqual(["readme", "readme_1", "readme_2", "readme_3"]);

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("same key")),
    );
    expect(keyWarnings).toEqual([]);
  });
});
