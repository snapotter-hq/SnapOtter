// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ settings: { jobsRetentionDays: "30" } }),
);
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    permissions: [],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
  }),
}));

import { en } from "@snapotter/shared";
import { SystemSection } from "@/components/settings/settings-dialog";
import { ApiError } from "@/lib/api";
import { format } from "@/lib/format";

afterEach(() => {
  cleanup();
  apiGet.mockClear();
  apiPut.mockReset();
});

describe("SystemSection save errors (#1714)", () => {
  it("names the refused setting when apiPut rejects with VALIDATION_ERROR and setting key", async () => {
    apiPut.mockRejectedValue(
      new ApiError('Invalid value for setting "jobsRetentionDays"', 400, "VALIDATION_ERROR", {
        setting: "jobsRetentionDays",
      }),
    );

    render(<SystemSection />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = await screen.findByLabelText(en.settings.dataRetention.jobsRetentionDays);
    fireEvent.change(input, { target: { value: "0" } });

    fireEvent.click(await screen.findByRole("button", { name: en.settings.system.saveButton }));

    const expectedText = format(en.errors.invalidSetting, {
      setting: en.settings.dataRetention.jobsRetentionDays,
    });
    const message = await screen.findByText(expectedText);
    expect(message).toHaveClass("text-destructive");
  });

  it("puts a refused setting back where it was when save is rejected", async () => {
    apiPut.mockRejectedValue(
      new ApiError('Invalid value for setting "jobsRetentionDays"', 400, "VALIDATION_ERROR", {
        setting: "jobsRetentionDays",
      }),
    );

    render(<SystemSection />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = await screen.findByLabelText(en.settings.dataRetention.jobsRetentionDays);
    expect(input).toHaveValue(30);

    fireEvent.change(input, { target: { value: "-5" } });
    expect(input).toHaveValue(-5);

    fireEvent.click(await screen.findByRole("button", { name: en.settings.system.saveButton }));

    await waitFor(() => expect(input).toHaveValue(30));
  });

  it("names fileUploadLimitMb when that setting is refused", async () => {
    apiPut.mockRejectedValue(
      new ApiError('Invalid value for setting "fileUploadLimitMb"', 400, "VALIDATION_ERROR", {
        setting: "fileUploadLimitMb",
      }),
    );

    render(<SystemSection />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = await screen.findByLabelText(en.settings.system.fileUploadLimitLabel);
    expect(input).toHaveValue(100);

    fireEvent.change(input, { target: { value: "0" } });
    expect(input).toHaveValue(0);

    fireEvent.click(await screen.findByRole("button", { name: en.settings.system.saveButton }));

    const expectedText = format(en.errors.invalidSetting, {
      setting: en.settings.system.fileUploadLimitLabel,
    });
    const message = await screen.findByText(expectedText);
    expect(message).toHaveClass("text-destructive");

    // Unset setting restores its fallback default instead of becoming blank
    await waitFor(() => expect(input).toHaveValue(100));
  });

  it("falls back to generic saveFailed when rejected without a specific setting or non-ApiError", async () => {
    apiPut.mockRejectedValue(new Error("Network failure"));

    render(<SystemSection />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = await screen.findByLabelText(en.settings.dataRetention.jobsRetentionDays);
    fireEvent.change(input, { target: { value: "15" } });

    fireEvent.click(await screen.findByRole("button", { name: en.settings.system.saveButton }));

    const message = await screen.findByText(en.settings.system.saveFailed);
    expect(message).toHaveClass("text-destructive");
  });

  it("dismisses the error message when close button is clicked", async () => {
    apiPut.mockRejectedValue(
      new ApiError('Invalid value for setting "jobsRetentionDays"', 400, "VALIDATION_ERROR", {
        setting: "jobsRetentionDays",
      }),
    );

    render(<SystemSection />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = await screen.findByLabelText(en.settings.dataRetention.jobsRetentionDays);
    fireEvent.change(input, { target: { value: "-1" } });

    fireEvent.click(await screen.findByRole("button", { name: en.settings.system.saveButton }));

    const expectedText = format(en.errors.invalidSetting, {
      setting: en.settings.dataRetention.jobsRetentionDays,
    });
    expect(await screen.findByText(expectedText)).toBeInTheDocument();

    const closeBtn = await screen.findByRole("button", { name: en.common.close });
    fireEvent.click(closeBtn);

    expect(screen.queryByText(expectedText)).not.toBeInTheDocument();
  });
});
