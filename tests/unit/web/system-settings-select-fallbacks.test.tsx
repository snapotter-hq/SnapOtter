// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn());
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

import { SystemSection } from "@/components/settings/settings-dialog";
import { useThemeStore } from "@/stores/theme-store";

const s = en.settings.system;

beforeEach(() => {
  useThemeStore.setState({ theme: "dark", resolvedTheme: "dark" });
  apiPut.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiGet.mockReset();
  apiPut.mockReset();
});

describe("SystemSection select fallbacks for invalid stored settings (#3964)", () => {
  it("falls back to 'en' and 'system' when defaultLocale or defaultTheme holds an unsupported value", async () => {
    apiGet.mockResolvedValue({
      settings: {
        defaultLocale: "de_DE",
        defaultTheme: "solarized",
        fileUploadLimitMb: "100",
      },
    });

    render(<SystemSection />);

    const localeSelect = (await screen.findByLabelText(s.languageLabel)) as HTMLSelectElement;
    const themeSelect = screen.getByLabelText(s.defaultThemeLabel) as HTMLSelectElement;

    const reactPropsKey = Object.keys(localeSelect).find((k) => k.startsWith("__reactProps$"));
    const localeReactProps = reactPropsKey
      ? (localeSelect as unknown as Record<string, { value?: string }>)[reactPropsKey]
      : undefined;

    expect(localeSelect.value).toBe("en");
    expect(localeReactProps?.value).toBe("en");
    expect(themeSelect.value).toBe("system");
  });

  it("preserves supported defaultLocale and defaultTheme values", async () => {
    apiGet.mockResolvedValue({
      settings: {
        defaultLocale: "pt-BR",
        defaultTheme: "dark",
        fileUploadLimitMb: "100",
      },
    });

    render(<SystemSection />);

    const localeSelect = (await screen.findByLabelText(s.languageLabel)) as HTMLSelectElement;
    const themeSelect = screen.getByLabelText(s.defaultThemeLabel) as HTMLSelectElement;

    expect(localeSelect.value).toBe("pt-BR");
    expect(themeSelect.value).toBe("dark");
  });

  it("does not overwrite useThemeStore with an unsupported defaultTheme when saving another field", async () => {
    apiGet.mockResolvedValue({
      settings: {
        defaultLocale: "de_DE",
        defaultTheme: "solarized",
        fileUploadLimitMb: "100",
      },
    });

    render(<SystemSection />);

    const uploadInput = await screen.findByLabelText(s.fileUploadLimitLabel);
    fireEvent.change(uploadInput, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: s.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", { fileUploadLimitMb: "250" });
    });
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("saves newly selected valid defaultLocale and defaultTheme values and updates useThemeStore", async () => {
    apiGet.mockResolvedValue({
      settings: {
        defaultLocale: "de_DE",
        defaultTheme: "solarized",
        fileUploadLimitMb: "100",
      },
    });

    render(<SystemSection />);

    const localeSelect = (await screen.findByLabelText(s.languageLabel)) as HTMLSelectElement;
    const themeSelect = screen.getByLabelText(s.defaultThemeLabel) as HTMLSelectElement;

    fireEvent.change(localeSelect, { target: { value: "fr" } });
    fireEvent.change(themeSelect, { target: { value: "light" } });
    fireEvent.click(screen.getByRole("button", { name: s.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
        defaultLocale: "fr",
        defaultTheme: "light",
      });
    });
    expect(useThemeStore.getState().theme).toBe("light");
  });
});
