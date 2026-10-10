// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

// Every route that returns a session token also sets the session cookie, so by
// the time the form stores the token and username a full localStorage must not
// turn a successful login into a "Connection error" that sends the user back to
// retype a good password (#2053).
const ENROLLMENT_URI = "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter";

let location: { href: string };
let store: Map<string, string>;

beforeEach(() => {
  location = { href: "http://localhost/login" };
  store = new Map();
  vi.stubGlobal("location", location);
  // A full quota: reads and removals work, every write throws.
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    },
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.restoreAllMocks();
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

async function submitLogin() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
}

const session = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ token: "session-token", user: { username: "admin" }, ...extra }),
});

describe("LoginPage when browser storage is unavailable after a successful login", () => {
  it("still goes into the app after a password login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()));

    renderLoginPage();
    await submitLogin();

    await waitFor(() => expect(location.href).toBe("/"));
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
  });

  it("goes to the change-password page when the account must change its password", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(session({ user: { username: "admin", mustChangePassword: true } })),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => expect(location.href).toBe("/change-password"));
  });

  it("still goes into the app after the TOTP step", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
        })
        .mockResolvedValueOnce(session()),
    );

    renderLoginPage();
    await submitLogin();
    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => expect(location.href).toBe("/"));
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
  });

  it("still goes into the app after forced enrollment is confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            requiresMfaEnrollment: true,
            enrollmentToken: "enroll-token-1",
            uri: ENROLLMENT_URI,
            recoveryCodes: ["aaaa1111"],
          }),
        })
        .mockResolvedValueOnce(session()),
    );

    renderLoginPage();
    await submitLogin();
    fireEvent.change(await screen.findByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => expect(location.href).toBe("/"));
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
  });

  it("keeps the buttons disabled while the page leaves, so a second click can't spend the challenge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()));

    renderLoginPage();
    await submitLogin();

    await waitFor(() => expect(location.href).toBe("/"));
    expect(screen.getByRole("button", { name: /logging in/i })).toBeDisabled();
  });

  it("removes a username and token left by an earlier session when the new ones can't be saved", async () => {
    store.set("snapotter-username", "someone-else");
    store.set("snapotter-token", "stale-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()));

    renderLoginPage();
    await submitLogin();

    await waitFor(() => expect(location.href).toBe("/"));
    expect(store.has("snapotter-username")).toBe(false);
    expect(store.has("snapotter-token")).toBe(false);
  });

  it("warns instead of swallowing the storage failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(session()));

    renderLoginPage();
    await submitLogin();

    await waitFor(() => expect(location.href).toBe("/"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/storage/i), expect.anything());
  });
});
