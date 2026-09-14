// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

function renderLoginPage() {
  useAuth.mockReturnValue({
    oidcEnabled: false,
    oidcProviderName: null,
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
}

/**
 * Stand in for the parts of Response the handler reads. A `body` of
 * `undefined` models a non-JSON body (a proxy error page), which makes
 * `json()` reject the way fetch does.
 *
 * The body and the header are kept separate per case on purpose: supplying
 * both everywhere would let either read cover for the other, and the two come
 * from different producers.
 */
function stubLoginResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers(headers),
      json: async () => {
        if (body === undefined) throw new Error("Unexpected token < in JSON");
        return body;
      },
    }),
  );
}

async function expectLoginError(text: string) {
  await waitFor(() => {
    expect(screen.getByText(text)).toBeInTheDocument();
  });
  expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
}

describe("LoginPage throttled logins", () => {
  it("reports the wait instead of bad credentials when the username throttle fires", async () => {
    // What a correct password gets during a throttle episode, body and header
    // both, copied from tests/integration/platform/login-throttle.test.ts.
    // Telling this user "invalid credentials" sends them off to guess more
    // passwords, which is exactly what keeps the window hot (#826).
    stubLoginResponse(
      429,
      {
        error: "Too many login attempts. Try again later.",
        code: "LOGIN_THROTTLED",
        retryAfter: 840,
      },
      { "Retry-After": "840" },
    );

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Try again in 14 minutes.");
  });

  it("reads retryAfter from the body when the header is missing", async () => {
    // A proxy that drops Retry-After still leaves the #820 body field, which
    // is the whole reason that field exists. No header here, so the body read
    // is the only thing that can produce a number.
    stubLoginResponse(429, { code: "LOGIN_THROTTLED", retryAfter: 30 });

    renderLoginPage();
    submitLogin();

    // Rounded up: 30 seconds of waiting is not "0 minutes".
    await expectLoginError("Too many login attempts. Try again in 1 minute.");
  });

  it("rounds a part-minute wait up rather than to the nearest minute", async () => {
    // 61 seconds must not render as 1 minute. A user who retries after that
    // minute earns a second 429, which is the loop #826 is trying to break.
    // 61 is live for most of an episode: retryAfterS counts down a window of
    // up to 900 seconds.
    stubLoginResponse(429, { code: "LOGIN_THROTTLED", retryAfter: 61 });

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Try again in 2 minutes.");
  });

  it("falls back to the Retry-After header when the per-IP limiter answers", async () => {
    // @fastify/rate-limit throws, and the error handler in
    // apps/api/src/index.ts reshapes it into {error, details}. No retryAfter
    // field survives that, only the lowercase header the plugin set, so this
    // 429 must not fall through to the no-wait message.
    stubLoginResponse(
      429,
      {
        error: "Rate limit exceeded, retry in 1 minute",
        details: "Rate limit exceeded, retry in 1 minute",
      },
      { "retry-after": "60" },
    );

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Try again in 1 minute.");
  });

  it("ignores a Retry-After that is an HTTP-date rather than a count", async () => {
    // RFC 9110 allows the date form, and a proxy doing its own rate limiting
    // is exactly the actor that sends it. Coercing it gives NaN, so without
    // the finite guard the user reads "Try again in NaN minutes".
    stubLoginResponse(
      429,
      { error: "Too Many Requests" },
      { "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" },
    );

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Please wait before trying again.");
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("ignores a Retry-After that coerces to Infinity", async () => {
    // `seconds > 0` already rejects NaN, so the finite check exists for this
    // one: without it the user reads "Try again in Infinity minutes".
    stubLoginResponse(429, { error: "Too Many Requests" }, { "Retry-After": "Infinity" });

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Please wait before trying again.");
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
  });

  it("uses the header when the body carries a retryAfter it cannot read", async () => {
    // Some other 429 producer with its own body shape. The unusable field
    // must not bury the header, which parses fine.
    stubLoginResponse(429, { retryAfter: "120s" }, { "Retry-After": "120" });

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Try again in 2 minutes.");
  });

  it("still says wait when a 429 carries no usable retry hint at all", async () => {
    // A reverse proxy answering with an HTML error page and no header.
    stubLoginResponse(429, undefined);

    renderLoginPage();
    submitLogin();

    await expectLoginError("Too many login attempts. Please wait before trying again.");
  });

  it("leaves a real 401 on the credentials message", async () => {
    // Guards the other direction: widening the branch past 429 would tell a
    // user who genuinely mistyped their password to sit and wait. Headers are
    // supplied so a widened branch fails on the assertion rather than on a
    // TypeError reading them.
    stubLoginResponse(401, { error: "Invalid credentials" }, {});

    renderLoginPage();
    submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/too many login attempts/i)).not.toBeInTheDocument();
  });
});
