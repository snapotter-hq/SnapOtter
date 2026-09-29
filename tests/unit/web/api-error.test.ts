/**
 * A non-2xx answer rejects with an ApiError carrying the status, code and
 * body, so a screen can pick translated copy from them (#1445). `message`
 * stays the server's text for callers that haven't moved over.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorMessage, apiPost } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(status: number, body: string, contentType = "application/json") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, headers: { "content-type": contentType } })),
  );
}

describe("ApiError (#1445)", () => {
  it("carries the status, code and body of a JSON error", async () => {
    answer(409, JSON.stringify({ error: "Team name already exists", code: "CONFLICT" }));

    const err = await apiPost("/v1/teams", { name: "x" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      message: "Team name already exists",
      status: 409,
      code: "CONFLICT",
      body: { error: "Team name already exists", code: "CONFLICT" },
    });
  });

  it("still rejects with the status when the body isn't JSON", async () => {
    answer(502, "<html>Bad Gateway</html>", "text/html");

    const err = await apiPost("/v1/teams").catch((e: unknown) => e);

    expect(err).toMatchObject({
      message: "API error: 502",
      status: 502,
      code: undefined,
      body: {},
    });
  });

  it("apiErrorMessage picks by code and falls back otherwise", () => {
    const conflict = new ApiError("English", 409, "CONFLICT", {});
    expect(apiErrorMessage(conflict, { CONFLICT: "taken" }, "fallback")).toBe("taken");
    expect(apiErrorMessage(conflict, {}, "fallback")).toBe("fallback");
    expect(apiErrorMessage(new ApiError("English", 500, undefined, {}), {}, "fallback")).toBe(
      "fallback",
    );
    expect(apiErrorMessage(new Error("plain"), { CONFLICT: "taken" }, "fallback")).toBe("fallback");
  });
});
