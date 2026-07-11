import { describe, expect, it } from "vitest";
import { toFetchResponse } from "../../../apps/api/src/lib/ssrf.js";

describe("toFetchResponse", () => {
  it("null-body statuses never throw, even with a body buffer", async () => {
    for (const status of [204, 304, 205]) {
      const res = toFetchResponse(Buffer.from("stray body"), status, "", new Headers());
      expect(res.status).toBe(status);
      expect(await res.text()).toBe("");
    }
  });
  it("clamps out-of-range statuses to 502", () => {
    expect(toFetchResponse(Buffer.alloc(0), 100, "", new Headers()).status).toBe(502);
    expect(toFetchResponse(Buffer.alloc(0), 700, "", new Headers()).status).toBe(502);
    expect(toFetchResponse(Buffer.alloc(0), undefined, "", new Headers()).status).toBe(502);
  });
  it("passes normal responses through", async () => {
    const res = toFetchResponse(Buffer.from("ok"), 200, "OK", new Headers({ "x-a": "b" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("x-a")).toBe("b");
  });
});
