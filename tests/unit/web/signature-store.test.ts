// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSignature,
  deleteSignature,
  listSignatures,
  MAX_SIGNATURES,
} from "@/lib/signature-store";

// The jsdom env's native localStorage is a broken stub here (Node's experimental
// Web Storage shadows it, missing methods), so back it with an in-memory map --
// the same approach the other web unit tests use.
const storageMap = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => storageMap.set(key, val)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((_i: number) => null),
});

describe("signature-store", () => {
  beforeEach(() => localStorage.clear());

  it("adds and lists signatures", () => {
    addSignature("data:image/png;base64,AAAA");
    expect(listSignatures()).toHaveLength(1);
    expect(listSignatures()[0].dataUrl).toContain("base64,AAAA");
  });

  it("caps the library at MAX_SIGNATURES (drops oldest)", () => {
    for (let i = 0; i < MAX_SIGNATURES + 3; i++) addSignature(`data:image/png;base64,S${i}`);
    expect(listSignatures()).toHaveLength(MAX_SIGNATURES);
    expect(listSignatures().some((s) => s.dataUrl.endsWith("S0"))).toBe(false);
  });

  it("deletes by id", () => {
    const sig = addSignature("data:image/png;base64,BBBB");
    deleteSignature(sig.id);
    expect(listSignatures()).toHaveLength(0);
  });

  it.each([
    "{corrupt",
    "{}",
    "null",
    "42",
    '"data:image/png;base64,AAAA"',
    "true",
    "[null]",
    "[42]",
    "[{}]",
    "[[]]",
    JSON.stringify([{ id: 123, dataUrl: "data:image/png;base64,AAAA", createdAt: 1 }]),
    JSON.stringify([{ id: "1", dataUrl: null, createdAt: 1 }]),
    JSON.stringify([{ id: "1", dataUrl: "data:image/png;base64,AAAA", createdAt: "1" }]),
    JSON.stringify([{ id: "1", dataUrl: "data:image/png;base64,AAAA", createdAt: null }]),
    JSON.stringify([
      { id: "1", dataUrl: "data:image/png;base64,AAAA", createdAt: 1 },
      { id: "2", dataUrl: 42, createdAt: 2 },
    ]),
  ])("falls back to [] when snapotter.signatures.v1 holds %s (#3421)", (corruptRaw) => {
    localStorage.setItem("snapotter.signatures.v1", corruptRaw);
    expect(listSignatures()).toEqual([]);

    deleteSignature("nonexistent");
    expect(listSignatures()).toEqual([]);

    localStorage.setItem("snapotter.signatures.v1", corruptRaw);
    const added = addSignature("data:image/png;base64,CCCC");
    expect(listSignatures()).toEqual([added]);
  });
});
