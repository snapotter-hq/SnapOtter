// @vitest-environment jsdom

/**
 * AuditLogSection renders its action filter options from `CORE_AUDIT_EVENTS`
 * so SAML and other emitted events can be selected in the UI (#1013).
 */

import "@testing-library/jest-dom/vitest";
import { CORE_AUDIT_EVENTS, en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    permissions: ["audit:read"],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
  }),
}));

import { AuditLogSection } from "@/components/settings/settings-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiGet.mockReset();
});

describe("AuditLogSection action filter (#1013)", () => {
  it("lists every event in CORE_AUDIT_EVENTS, including SAML events, and filters by SAML_LOGIN_FAILED", async () => {
    apiGet.mockResolvedValue({ entries: [], total: 0 });

    render(<AuditLogSection />);

    await screen.findByText(en.settings.auditLog.emptyState);
    expect(apiGet).toHaveBeenCalledWith("/v1/audit-log?page=1&limit=25");

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optionValues = [...select.querySelectorAll("option")].map((o) => o.value);

    expect(optionValues).toEqual(["", ...CORE_AUDIT_EVENTS]);
    expect(optionValues).toEqual(
      expect.arrayContaining([
        "SAML_LOGIN_SUCCESS",
        "SAML_USER_CREATED",
        "SAML_USER_LINKED",
        "SAML_LOGIN_FAILED",
      ]),
    );

    const samlFailedOption = select.querySelector(
      'option[value="SAML_LOGIN_FAILED"]',
    ) as HTMLOptionElement | null;
    expect(samlFailedOption).not.toBeNull();
    expect(samlFailedOption).toHaveTextContent("SAML LOGIN FAILED");

    fireEvent.change(select, { target: { value: "SAML_LOGIN_FAILED" } });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith("/v1/audit-log?page=1&limit=25&action=SAML_LOGIN_FAILED");
    });
    await screen.findByText(en.settings.auditLog.emptyState);
    expect(
      screen.getByRole("option", { name: en.settings.auditLog.allActionsFilter }),
    ).toBeInTheDocument();
  });
});
