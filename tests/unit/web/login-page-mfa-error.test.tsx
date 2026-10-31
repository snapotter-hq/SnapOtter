// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

const ENROLLMENT_URI = "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter";

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

async function submitLogin() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
}

describe("LoginPage error messages", () => {
  it("shows the MFA enrollment message when the API returns MFA_ENROLLMENT_REQUIRED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: "MFA enrollment is required before login",
          code: "MFA_ENROLLMENT_REQUIRED",
        }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("says the account is disabled when the API returns USER_DISABLED (#2021)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "User is disabled", code: "USER_DISABLED" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/account is disabled/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("shows the retryable policy message when the API returns MFA_POLICY_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: "The MFA policy could not be checked. Please try again.",
          code: "MFA_POLICY_UNAVAILABLE",
        }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    // A DB blip must not read as "wrong password".
    await waitFor(() => {
      expect(screen.getByText(/mfa policy could not be checked/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("shows a connection error, not invalid credentials, for a 5xx with an unparseable body", async () => {
    // A reverse proxy answering 502 with HTML mid-restart: json() rejects.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("Unexpected token < in JSON");
        },
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("still shows a generic message for a plain invalid-credentials response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
  });

  it("still shows invalid credentials for a 400 without the maxLength rule", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Username and password are required" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
  });

  it("says the IP address is not allowed when the API returns IP_NOT_ALLOWED (#2052)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "IP address not allowed", code: "IP_NOT_ALLOWED" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(
        screen.getByText("Your IP address is not allowed. Contact an administrator."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it.each([
    [
      "a proxy or WAF HTML 403",
      403,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
    [
      "an unrecognized 403 JSON response (auth disabled)",
      403,
      async () => ({ error: "Authentication is disabled" }),
    ],
    [
      "a plain-text 404 for a misrouted POST",
      404,
      async () => {
        throw new Error("Unexpected token N in JSON");
      },
    ],
  ])(
    "shows a connection error, not invalid credentials, for %s (#2052)",
    async (_label, status, json) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json,
        }),
      );

      renderLoginPage();
      await submitLogin();

      await waitFor(() => {
        expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
    },
  );

  it("says the IP address is not allowed and keeps the code on MFA-complete IP_NOT_ALLOWED (#2052)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers(),
          json: async () => ({ error: "IP address not allowed", code: "IP_NOT_ALLOWED" }),
        }),
    );

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Your IP address is not allowed. Contact an administrator."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    expect(codeInput.value).toBe("123456");
  });

  it("leaves Verify enabled for a recovery code when MFA-complete returns IP_NOT_ALLOWED (#2052)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers(),
          json: async () => ({ error: "IP address not allowed", code: "IP_NOT_ALLOWED" }),
        }),
    );

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "a3f9c01b" } });
    const verifyButton = screen.getByRole("button", { name: /^verify$/i });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(
        screen.getByText("Your IP address is not allowed. Contact an administrator."),
      ).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("a3f9c01b");
    expect(verifyButton).toBeEnabled();
  });

  it.each([
    [
      "a proxy 400",
      400,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
    ["an uncoded 401 JSON response", 401, async () => ({ error: "Unauthorized" })],
    [
      "a 400 JSON response with an empty code",
      400,
      async () => ({ error: "Bad request", code: "" }),
    ],
    [
      "a proxy 403",
      403,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
    [
      "a plain-text 404",
      404,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
  ])(
    "shows a connection error and keeps the code on MFA-complete for %s (#2052, #2018)",
    async (_label, status, json) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status,
            headers: new Headers(),
            json,
          }),
      );

      renderLoginPage();
      await submitLogin();

      const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
      fireEvent.change(codeInput, { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
      expect(codeInput.value).toBe("123456");
    },
  );

  it("says the IP address is not allowed and keeps the code on MFA-enrollment IP_NOT_ALLOWED (#2052)", async () => {
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
            recoveryCodes: ["AAAA-1111"],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: new Headers(),
          json: async () => ({ error: "IP address not allowed", code: "IP_NOT_ALLOWED" }),
        }),
    );

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Your IP address is not allowed. Contact an administrator."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    expect(codeInput.value).toBe("123456");
  });

  it.each([
    [
      "a proxy 400",
      400,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
    ["an uncoded 401 JSON response", 401, async () => ({ error: "Unauthorized" })],
    [
      "a proxy 403",
      403,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
    [
      "a plain-text 404",
      404,
      async () => {
        throw new Error("Unexpected token < in JSON");
      },
    ],
  ])(
    "shows a connection error and keeps the code on MFA-enrollment for %s (#2052, #2018)",
    async (_label, status, json) => {
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
              recoveryCodes: ["AAAA-1111"],
            }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status,
            headers: new Headers(),
            json,
          }),
      );

      renderLoginPage();
      await submitLogin();

      const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
      fireEvent.change(codeInput, { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
      expect(codeInput.value).toBe("123456");
    },
  );

  it("renders password-form login errors inside a role=alert live region (#1147)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid username or password/i);
  });

  it("renders MFA-challenge errors inside a role=alert live region (#1147)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "Invalid code", code: "INVALID_CODE" }),
        }),
    );

    renderLoginPage();
    await submitLogin();

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid code/i);
  });

  it("renders MFA-enrollment errors inside a role=alert live region (#1147)", async () => {
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
            recoveryCodes: ["AAAA-1111"],
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "Invalid code", code: "INVALID_CODE" }),
        }),
    );

    renderLoginPage();
    await submitLogin();

    const codeInput = await screen.findByLabelText(/6-digit code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid code/i);
  });
});
