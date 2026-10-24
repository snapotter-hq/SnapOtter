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

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("song.png", "image/png"),
          makeFile("\u{017f}ong.png", "image/png"),
          makeFile("masse.png", "image/png"),
          makeFile("ma\u{00df}e.png", "image/png"),
          makeFile("po\u{fb05}.png", "image/png"),
        ]);
    });
    fireEvent.change(patternInput, { target: { value: "{{original}}" } });
    const fourthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(fourthRows).toEqual([
      "song.png",
      "\u{017f}ong_1.png",
      "masse.png",
      "ma\u{00df}e_1.png",
      "po\u{fb05}.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("post.png", "image/png"),
          makeFile("po\u{fb05}.png", "image/png"),
          makeFile("po\u{fb06}.png", "image/png"),
          makeFile("office.png", "image/png"),
          makeFile("o\u{fb03}ce.png", "image/png"),
        ]);
    });
    const fifthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(fifthRows).toEqual([
      "post.png",
      "po\u{fb05}_1.png",
      "po\u{fb06}_2.png",
      "office.png",
      "o\u{fb03}ce_1.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("o\u{fb00}ice.png", "image/png"),
          makeFile("office.png", "image/png"),
          makeFile("\u{fb01}le.png", "image/png"),
          makeFile("file.png", "image/png"),
          makeFile("\u{1e9b}in.png", "image/png"),
        ]);
    });
    const sixthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(sixthRows).toEqual([
      "o\u{fb00}ice.png",
      "office_1.png",
      "\u{fb01}le.png",
      "file_1.png",
      "\u{1e9b}in.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{fb02}ow.png", "image/png"),
          makeFile("flow.png", "image/png"),
          makeFile("ba\u{fb04}e.png", "image/png"),
          makeFile("baffle.png", "image/png"),
          makeFile("\u{1e61}in.png", "image/png"),
        ]);
    });
    const seventhRows = Array.from(
      container.querySelectorAll(".font-mono"),
      (el) => el.textContent,
    );
    expect(seventhRows).toEqual([
      "\u{fb02}ow.png",
      "flow_1.png",
      "ba\u{fb04}e.png",
      "baffle_1.png",
      "\u{1e61}in.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{1e61}in.png", "image/png"),
          makeFile("\u{1e9b}in.png", "image/png"),
          makeFile("masse.png", "image/png"),
          makeFile("MA\u{1e9e}E.png", "image/png"),
        ]);
    });
    const eighthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(eighthRows).toEqual([
      "\u{1e61}in.png",
      "\u{1e9b}in_1.png",
      "masse.png",
      "MA\u{1e9e}E_1.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{03bf}\u{03c2}.png", "image/png"),
          makeFile("\u{03bf}\u{03c3}.png", "image/png"),
          makeFile("10\u{00b5}m.png", "image/png"),
          makeFile("10\u{03bc}m.png", "image/png"),
          makeFile("\u{0587}.png", "image/png"),
        ]);
    });
    const ninthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(ninthRows).toEqual([
      "\u{03bf}\u{03c2}.png",
      "\u{03bf}\u{03c3}_1.png",
      "10\u{00b5}m.png",
      "10\u{03bc}m_1.png",
      "\u{0587}.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{0587}.png", "image/png"),
          makeFile("\u{0565}\u{0582}.png", "image/png"),
          makeFile("\u{1f80}.png", "image/png"),
          makeFile("\u{1f00}\u{03b9}.png", "image/png"),
          makeFile("\u{0149}-\u{1e9a}.png", "image/png"),
        ]);
    });
    const tenthRows = Array.from(container.querySelectorAll(".font-mono"), (el) => el.textContent);
    expect(tenthRows).toEqual([
      "\u{0587}.png",
      "\u{0565}\u{0582}_1.png",
      "\u{1f80}.png",
      "\u{1f00}\u{03b9}_1.png",
      "\u{0149}-\u{1e9a}.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{0149}-\u{1e9a}.png", "image/png"),
          makeFile("\u{02bc}n-a\u{02be}.png", "image/png"),
          makeFile("\u{03d0}\u{03d1}\u{03d5}\u{03d6}\u{03f0}\u{03f1}\u{03f5}.png", "image/png"),
          makeFile("\u{03b2}\u{03b8}\u{03c6}\u{03c0}\u{03ba}\u{03c1}\u{03b5}.png", "image/png"),
        ]);
    });
    const eleventhRows = Array.from(
      container.querySelectorAll(".font-mono"),
      (el) => el.textContent,
    );
    expect(eleventhRows).toEqual([
      "\u{0149}-\u{1e9a}.png",
      "\u{02bc}n-a\u{02be}_1.png",
      "\u{03d0}\u{03d1}\u{03d5}\u{03d6}\u{03f0}\u{03f1}\u{03f5}.png",
      "\u{03b2}\u{03b8}\u{03c6}\u{03c0}\u{03ba}\u{03c1}\u{03b5}_1.png",
    ]);

    act(() => {
      useFileStore
        .getState()
        .setFiles([
          makeFile("\u{fb13}-\u{fb14}-\u{fb15}-\u{fb16}-\u{fb17}.png", "image/png"),
          makeFile(
            "\u{0574}\u{0576}-\u{0574}\u{0565}-\u{0574}\u{056b}-\u{057e}\u{0576}-\u{0574}\u{056d}.png",
            "image/png",
          ),
          makeFile(
            "\u{1c80}\u{1c81}\u{1c82}\u{1c83}\u{1c84}\u{1c85}\u{1c86}\u{1c87}\u{1c88}.png",
            "image/png",
          ),
          makeFile(
            "\u{0432}\u{0434}\u{043e}\u{0441}\u{0442}\u{0442}\u{044a}\u{0463}\u{a64b}.png",
            "image/png",
          ),
        ]);
    });
    const twelfthRows = Array.from(
      container.querySelectorAll(".font-mono"),
      (el) => el.textContent,
    );
    expect(twelfthRows).toEqual([
      "\u{fb13}-\u{fb14}-\u{fb15}-\u{fb16}-\u{fb17}.png",
      "\u{0574}\u{0576}-\u{0574}\u{0565}-\u{0574}\u{056b}-\u{057e}\u{0576}-\u{0574}\u{056d}_1.png",
      "\u{1c80}\u{1c81}\u{1c82}\u{1c83}\u{1c84}\u{1c85}\u{1c86}\u{1c87}\u{1c88}.png",
      "\u{0432}\u{0434}\u{043e}\u{0441}\u{0442}\u{0442}\u{044a}\u{0463}\u{a64b}_1.png",
    ]);

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("same key")),
    );
    expect(keyWarnings).toEqual([]);
  });
});
