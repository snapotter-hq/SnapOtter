// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

async function reachTotpPrompt() {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  renderLoginPage();
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

  const input = await screen.findByPlaceholderText("000000");
  return { input: input as HTMLInputElement, fetchMock };
}

// Recovery codes are 8 lowercase hex characters (apps/api/src/plugins/mfa.ts),
// so the prompt that advertises them has to let letters through (#2050).
describe("LoginPage TOTP prompt accepts recovery codes", () => {
  it("keeps the letters of a hex recovery code and enables Verify", async () => {
    const { input } = await reachTotpPrompt();

    fireEvent.change(input, { target: { value: "a3f9c01b" } });

    expect(input.value).toBe("a3f9c01b");
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeEnabled();
  });

  it("lowercases and drops separators, so a recovery code pasted with dashes or capitals still works", async () => {
    const { input } = await reachTotpPrompt();

    fireEvent.change(input, { target: { value: "A3F9-C01B" } });

    expect(input.value).toBe("a3f9c01b");
  });

  it("keeps a character that can't be in a code visible and leaves Verify disabled", async () => {
    const { input } = await reachTotpPrompt();

    // An "o" for a zero is the typo that would otherwise vanish and leave a
    // 7-character code that can never be valid.
    fireEvent.change(input, { target: { value: "a3f9co1b" } });

    expect(input.value).toBe("a3f9co1b");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeDisabled();
  });

  it.each([
    ["a TOTP one digit short", "12345"],
    ["a 7-character recovery code", "a3f9c01"],
    ["a 7-digit number", "1234567"],
  ])("leaves Verify disabled for %s", async (_label, value) => {
    const { input } = await reachTotpPrompt();

    fireEvent.change(input, { target: { value } });

    expect(screen.getByRole("button", { name: /^verify$/i })).toBeDisabled();
  });

  it("enables Verify for exactly 6 digits or 8 hex characters", async () => {
    const { input } = await reachTotpPrompt();

    fireEvent.change(input, { target: { value: "123 456" } });
    expect(input.value).toBe("123456");
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeEnabled();

    fireEvent.change(input, { target: { value: "a3f9c01b" } });
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeEnabled();
  });

  it.each(["A3F9-C01B", "a3f9 c01b", " a3f9c01b", "A3F9C01B "])(
    "keeps the whole code when %j is pasted, since the browser cuts at maxlength before onChange",
    async (pasted) => {
      const { input } = await reachTotpPrompt();

      await userEvent.setup().click(input);
      await userEvent.setup().paste(pasted);

      expect(input.value).toBe("a3f9c01b");
      expect(screen.getByRole("button", { name: /^verify$/i })).toBeEnabled();
    },
  );

  it("opens a text keyboard, since a numeric one can't type a-f", async () => {
    const { input } = await reachTotpPrompt();

    expect(input).not.toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("pattern");
  });

  it("submits the recovery code to /api/auth/mfa/complete", async () => {
    const { input, fetchMock } = await reachTotpPrompt();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ error: "Invalid TOTP or recovery code", code: "INVALID_CODE" }),
    });

    fireEvent.change(input, { target: { value: "a3f9c01b" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain("/api/auth/mfa/complete");
    expect(JSON.parse(init.body as string)).toEqual({ mfaToken: "mfa-token-1", code: "a3f9c01b" });
  });

  it("keeps a rejected recovery code on screen so the typo can be found, but clears a rejected TOTP", async () => {
    const { input, fetchMock } = await reachTotpPrompt();
    const rejected = () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ error: "Invalid TOTP or recovery code", code: "INVALID_CODE" }),
    });
    fetchMock.mockResolvedValueOnce(rejected()).mockResolvedValueOnce(rejected());

    fireEvent.change(input, { target: { value: "a3f9c01b" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText(/invalid code/i);
    expect(input.value).toBe("a3f9c01b");

    // The same refused code can't be sent again without an edit.
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(input.value).toBe(""));
  });
});
