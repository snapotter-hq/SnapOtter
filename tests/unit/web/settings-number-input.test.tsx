// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({ settings: {} }));
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

import { AdminSecuritySettings } from "@/components/settings/settings-dialog";

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  apiGet.mockResolvedValue({ settings: {} });
  apiPut.mockReset();
});

describe("settings number fields (#1186)", () => {
  it("can be cleared and retyped instead of snapping back to the default", async () => {
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const input = await screen.findByLabelText("Minimum Password Length");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);

    fireEvent.change(input, { target: { value: "12" } });
    expect(input).toHaveValue(12);
  });

  it("restores the previous value when the field is left empty", async () => {
    apiGet.mockResolvedValue({ settings: { passwordMinLength: "10" } });
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const input = await screen.findByLabelText("Minimum Password Length");
    await waitFor(() => expect(input).toHaveValue(10));

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue(10);
  });

  it("never sends an empty value when saving after clearing a field", async () => {
    apiGet.mockResolvedValue({ settings: { passwordMinLength: "10" } });
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    const input = await screen.findByLabelText("Minimum Password Length");
    await waitFor(() => expect(input).toHaveValue(10));

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    const payload = apiPut.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("passwordMinLength");
  });
});
