import { detectModalityFromMime, MODALITIES, MODALITY_POOL, TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("modality metadata", () => {
  it("defines five modalities with UI metadata", () => {
    expect(MODALITIES.map((m) => m.id)).toEqual(["image", "video", "audio", "document", "file"]);
    for (const m of MODALITIES) {
      expect(m.name).toBeTruthy();
      expect(m.icon).toBeTruthy();
    }
  });

  it("maps every modality to a worker pool", () => {
    expect(MODALITY_POOL.image).toBe("image");
    expect(MODALITY_POOL.video).toBe("media");
    expect(MODALITY_POOL.audio).toBe("media");
    expect(MODALITY_POOL.document).toBe("docs");
    expect(MODALITY_POOL.file).toBe("docs");
  });

  it("every tool declares modality, acceptedInputs and executionHint", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(53);
    for (const tool of TOOLS) {
      expect(tool.modality).toBe("image"); // phase 3: image only
      expect(Array.isArray(tool.acceptedInputs)).toBe(true);
      expect(tool.acceptedInputs.length).toBeGreaterThan(0);
      expect(["fast", "long"]).toContain(tool.executionHint);
    }
  });

  it("AI tools are hinted long", () => {
    const ai = TOOLS.filter((t) => t.category === "ai");
    expect(ai.length).toBeGreaterThan(0);
    for (const t of ai) expect(t.executionHint).toBe("long");
  });

  it("detects modality from mime", () => {
    expect(detectModalityFromMime("image/png")).toBe("image");
    expect(detectModalityFromMime("video/mp4")).toBe("video");
    expect(detectModalityFromMime("audio/mpeg")).toBe("audio");
    expect(detectModalityFromMime("application/pdf")).toBe("document");
    expect(detectModalityFromMime("text/csv")).toBe("file");
    expect(detectModalityFromMime("")).toBe("file");
  });
});
