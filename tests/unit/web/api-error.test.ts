/**
 * A non-2xx answer rejects with an ApiError carrying the status, code and
 * body, so a screen can pick translated copy from them (#1445). `message`
 * stays the server's text for callers that haven't moved over.
 */

import { en } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});

describe("apiErrorMessage (#1445)", () => {
  const err = (status: number, code?: string) => new ApiError("English", status, code, {});

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picks the screen's message for the code", () => {
    expect(apiErrorMessage(en, err(409, "CONFLICT"), { CONFLICT: "taken" }, "fallback")).toBe(
      "taken",
    );
  });

  it("answers the refusals any request can meet", () => {
    expect(apiErrorMessage(en, err(401, "AUTH_REQUIRED"), {}, "fallback")).toBe(
      en.errors.sessionEnded,
    );
    expect(apiErrorMessage(en, err(403, "FORBIDDEN"), {}, "fallback")).toBe(en.errors.forbidden);
    expect(apiErrorMessage(en, err(429), {}, "fallback")).toBe(en.errors.tooManyRequests);
  });

  it("lets a screen word those refusals its own way", () => {
    expect(apiErrorMessage(en, err(403, "FORBIDDEN"), { FORBIDDEN: "mine" }, "fallback")).toBe(
      "mine",
    );
  });

  it.each([
    ["an unmapped code", err(409, "CONFLICT")],
    ["no code", err(500)],
    ["a plain Error", new Error("plain")],
  ])("falls back for %s and logs the reason", (_case, error) => {
    expect(apiErrorMessage(en, error, {}, "fallback")).toBe("fallback");
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), error);
  });

  it("logs nothing when it has a message", () => {
    apiErrorMessage(en, err(409, "CONFLICT"), { CONFLICT: "taken" }, "fallback");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
