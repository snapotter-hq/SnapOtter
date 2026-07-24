import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnHelpers } from "./helpers/spawn-capture.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const mockSpawn = vi.mocked(spawn);
const h = makeSpawnHelpers(mockSpawn);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QPDF_PATH = "/usr/bin/qpdf";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.QPDF_PATH;
});

describe("assertValidRange", () => {
  it("accepts digit/comma/hyphen ranges", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    expect(() => assertValidRange("1-3")).not.toThrow();
    expect(() => assertValidRange("1,3,5")).not.toThrow();
    expect(() => assertValidRange("2-z")).not.toThrow();
    expect(() => assertValidRange("r1-r2")).not.toThrow();
    expect(() => assertValidRange("z")).not.toThrow();
  });

  it("rejects a range that does not start with a digit/r/z", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    expect(() => assertValidRange("-1")).toThrow("Invalid page range: -1");
  });

  it("rejects letters outside the r/z grammar", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    expect(() => assertValidRange("1-a")).toThrow("Invalid page range");
  });

  it("rejects a range longer than 200 characters", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    const longRange = `1${",1".repeat(120)}`; // > 200 chars, all valid characters
    expect(longRange.length).toBeGreaterThan(200);
    expect(() => assertValidRange(longRange)).toThrow("Invalid page range");
  });

  it("truncates the offending range to 50 chars in the message", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    const bad = `x${"y".repeat(80)}`;
    try {
      assertValidRange(bad);
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toBe(`Invalid page range: ${bad.slice(0, 50)}`);
      expect(msg.length).toBeLessThan(bad.length);
    }
  });

  it("accepts exactly 200 characters of valid grammar", async () => {
    const { assertValidRange } = await import("../src/pdf-ops.js");
    const exactly200 = "1".repeat(200);
    expect(exactly200.length).toBe(200);
    expect(() => assertValidRange(exactly200)).not.toThrow();
  });
});

describe("qpdfMerge", () => {
  it("builds --empty --pages <inputs> -- <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) =>
      m.qpdfMerge(["/a.pdf", "/b.pdf", "/c.pdf"], "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual([
      "--empty",
      "--pages",
      "/a.pdf",
      "/b.pdf",
      "/c.pdf",
      "--",
      "/out.pdf",
    ]);
  });

  it("throws when given fewer than two inputs, without spawning", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfMerge(["/only.pdf"], "/out.pdf")),
    ).rejects.toThrow("qpdfMerge needs at least two inputs");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("throws on an empty input list", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfMerge([], "/out.pdf")),
    ).rejects.toThrow("qpdfMerge needs at least two inputs");
  });
});

describe("qpdfSplitRanges", () => {
  it("builds <in> --pages . <range> -- <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfSplitRanges("/in.pdf", "2-5", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["/in.pdf", "--pages", ".", "2-5", "--", "/out.pdf"]);
  });

  it("validates the range before spawning", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfSplitRanges("/in.pdf", "bad!", "/out.pdf")),
    ).rejects.toThrow("Invalid page range");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("qpdfRotate", () => {
  it("builds --rotate=+<angle>:<range> for 90 degrees", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfRotate("/in.pdf", 90, "1-z", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["--rotate=+90:1-z", "/in.pdf", "/out.pdf"]);
  });

  it("encodes the exact angle in the flag for 180 and 270", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfRotate("/in.pdf", 180, "2", "/out.pdf"));
    expect(h.lastArgs()[0]).toBe("--rotate=+180:2");

    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfRotate("/in.pdf", 270, "3-4", "/out.pdf"));
    expect(h.lastArgs()[0]).toBe("--rotate=+270:3-4");
  });

  it("validates the range before spawning", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfRotate("/in.pdf", 90, "??", "/out.pdf")),
    ).rejects.toThrow("Invalid page range");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("qpdfEncrypt", () => {
  it("builds <in> --encrypt <user> <owner> 256 -- <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) =>
      m.qpdfEncrypt("/in.pdf", "userpw", "ownerpw", "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual([
      "/in.pdf",
      "--encrypt",
      "userpw",
      "ownerpw",
      "256",
      "--",
      "/out.pdf",
    ]);
  });

  it("rejects an empty user password before spawning", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfEncrypt("/in.pdf", "", "owner", "/out.pdf")),
    ).rejects.toThrow("Password must be 1-256 characters");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects an owner password longer than 256 characters", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) =>
        m.qpdfEncrypt("/in.pdf", "user", "o".repeat(257), "/out.pdf"),
      ),
    ).rejects.toThrow("Password must be 1-256 characters");
  });

  it("accepts a 256-character password", async () => {
    h.nextClose({ code: 0 });
    await expect(
      import("../src/pdf-ops.js").then((m) =>
        m.qpdfEncrypt("/in.pdf", "u".repeat(256), "o".repeat(256), "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("qpdfDecrypt", () => {
  it("builds --password=<pw> --decrypt <in> <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfDecrypt("/in.pdf", "secret", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["--password=secret", "--decrypt", "/in.pdf", "/out.pdf"]);
  });

  it("rejects an empty password before spawning", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) => m.qpdfDecrypt("/in.pdf", "", "/out.pdf")),
    ).rejects.toThrow("Password must be 1-256 characters");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("qpdfPagesSpec", () => {
  it("builds <in> --pages . <spec> -- <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfPagesSpec("/in.pdf", "3,1,2", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["/in.pdf", "--pages", ".", "3,1,2", "--", "/out.pdf"]);
  });

  it("enforces the 200-char length cap", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) =>
        m.qpdfPagesSpec("/in.pdf", "1".repeat(201), "/out.pdf"),
      ),
    ).rejects.toThrow("Invalid page range");
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe("qpdfPagesSpecUnchecked", () => {
  it("builds the same argv as qpdfPagesSpec", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) =>
      m.qpdfPagesSpecUnchecked("/in.pdf", "1-9", "/out.pdf"),
    );
    expect(h.lastArgs()).toEqual(["/in.pdf", "--pages", ".", "1-9", "--", "/out.pdf"]);
  });

  it("still enforces the character grammar", async () => {
    await expect(
      import("../src/pdf-ops.js").then((m) =>
        m.qpdfPagesSpecUnchecked("/in.pdf", "1;2", "/out.pdf"),
      ),
    ).rejects.toThrow("Invalid page range");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does NOT enforce the 200-char cap (accepts a very long valid spec)", async () => {
    h.nextClose({ code: 0 });
    const longSpec = "1".repeat(300);
    await expect(
      import("../src/pdf-ops.js").then((m) =>
        m.qpdfPagesSpecUnchecked("/in.pdf", longSpec, "/out.pdf"),
      ),
    ).resolves.toBeUndefined();
    expect(h.lastArgs()[3]).toBe(longSpec);
  });
});

describe("qpdfLinearize", () => {
  it("builds --linearize <in> <out>", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfLinearize("/in.pdf", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["--linearize", "/in.pdf", "/out.pdf"]);
  });
});

describe("qpdfRepair", () => {
  it("builds <in> <out> (plain rewrite)", async () => {
    h.nextClose({ code: 0 });
    await import("../src/pdf-ops.js").then((m) => m.qpdfRepair("/in.pdf", "/out.pdf"));
    expect(h.lastArgs()).toEqual(["/in.pdf", "/out.pdf"]);
  });
});

describe("qpdf pdf-ops use the 60s timeout", () => {
  it("linearize times out at 60s, not 30s", async () => {
    const mod = await import("../src/pdf-ops.js");
    vi.useFakeTimers();
    try {
      const child = h.nextManual();
      const settled = expect(mod.qpdfLinearize("/in.pdf", "/out.pdf")).rejects.toThrow(
        "qpdf timed out after 60s",
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect(child.killed).toBe(false); // still alive at 30s
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});
