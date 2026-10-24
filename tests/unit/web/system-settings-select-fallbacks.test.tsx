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

import {
  AdminSecuritySettings,
  GeneralSection,
  SystemSection,
} from "@/components/settings/settings-dialog";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";

const g = en.settings.general;
const s = en.settings.system;
const sec = en.settings.security;

function getReactSelectValue(select: HTMLSelectElement): string | undefined {
  const reactPropsKey = Object.keys(select).find((k) => k.startsWith("__reactProps$"));
  return reactPropsKey
    ? (select as unknown as Record<string, { value?: string }>)[reactPropsKey]?.value
    : undefined;
}

beforeEach(() => {
  useThemeStore.setState({ theme: "dark", resolvedTheme: "dark" });
  useSettingsStore.setState({ defaultToolView: "sidebar" });
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

    expect(localeSelect.value).toBe("en");
    expect(getReactSelectValue(localeSelect)).toBe("en");
    expect(themeSelect.value).toBe("system");
    expect(getReactSelectValue(themeSelect)).toBe("system");
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

describe("GeneralSection select fallbacks for invalid stored preferences (#3967)", () => {
  it("falls back to 'sidebar' when preferences.defaultToolView holds an unsupported string and saves 'sidebar'", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/auth/session") {
        return Promise.resolve({ user: { id: 1, username: "alice", role: "admin" } });
      }
      if (path === "/v1/preferences") {
        return Promise.resolve({ preferences: { defaultToolView: "grid" } });
      }
      return Promise.resolve({});
    });

    render(<GeneralSection />);

    await screen.findByText("alice");
    const viewSelect = screen.getByLabelText(g.defaultToolViewLabel) as HTMLSelectElement;

    expect(viewSelect.value).toBe("sidebar");
    expect(getReactSelectValue(viewSelect)).toBe("sidebar");

    fireEvent.click(screen.getByRole("button", { name: g.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/preferences", { defaultToolView: "sidebar" });
    });
    expect(useSettingsStore.getState().defaultToolView).toBe("sidebar");
  });

  it("preserves a supported preferences.defaultToolView value ('fullscreen')", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/auth/session") {
        return Promise.resolve({ user: { id: 1, username: "alice", role: "admin" } });
      }
      if (path === "/v1/preferences") {
        return Promise.resolve({ preferences: { defaultToolView: "fullscreen" } });
      }
      return Promise.resolve({});
    });

    render(<GeneralSection />);

    await screen.findByText("alice");
    const viewSelect = screen.getByLabelText(g.defaultToolViewLabel) as HTMLSelectElement;

    expect(viewSelect.value).toBe("fullscreen");
    expect(getReactSelectValue(viewSelect)).toBe("fullscreen");

    fireEvent.click(screen.getByRole("button", { name: g.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/preferences", { defaultToolView: "fullscreen" });
    });
    expect(useSettingsStore.getState().defaultToolView).toBe("fullscreen");
  });

  it("lets the user select 'fullscreen' after an invalid stored preference and ignores invalid onChange values", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/auth/session") {
        return Promise.resolve({ user: { id: 1, username: "alice", role: "admin" } });
      }
      if (path === "/v1/preferences") {
        return Promise.resolve({ preferences: { defaultToolView: "grid" } });
      }
      return Promise.resolve({});
    });

    render(<GeneralSection />);

    await screen.findByText("alice");
    const viewSelect = screen.getByLabelText(g.defaultToolViewLabel) as HTMLSelectElement;

    fireEvent.change(viewSelect, { target: { value: "fullscreen" } });
    expect(viewSelect.value).toBe("fullscreen");

    fireEvent.change(viewSelect, { target: { value: "sidebar" } });
    expect(viewSelect.value).toBe("sidebar");

    fireEvent.change(viewSelect, { target: { value: "fullscreen" } });
    expect(viewSelect.value).toBe("fullscreen");

    fireEvent.change(viewSelect, { target: { value: "bogus" } });
    expect(viewSelect.value).toBe("fullscreen");

    fireEvent.click(screen.getByRole("button", { name: g.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/preferences", { defaultToolView: "fullscreen" });
    });
    expect(useSettingsStore.getState().defaultToolView).toBe("fullscreen");
  });
});

describe("AdminSecuritySettings mfaPolicy select fallbacks for invalid stored settings (#3967)", () => {
  it("falls back to 'optional' when settings.mfaPolicy holds an unsupported value and saves a newly selected valid policy", async () => {
    apiGet.mockResolvedValue({
      settings: {
        mfaPolicy: "strict",
        sessionIdleTimeoutMinutes: "0",
      },
    });

    render(<AdminSecuritySettings />);

    const mfaSelect = (await screen.findByLabelText(sec.mfaPolicy)) as HTMLSelectElement;

    expect(mfaSelect.value).toBe("optional");
    expect(getReactSelectValue(mfaSelect)).toBe("optional");

    fireEvent.change(mfaSelect, { target: { value: "required" } });
    expect(mfaSelect.value).toBe("required");

    fireEvent.click(screen.getByRole("button", { name: s.saveButton }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", { mfaPolicy: "required" });
    });
  });

  it.each(["optional", "admins_only", "required"] as const)(
    "preserves supported mfaPolicy value %j",
    async (validPolicy) => {
      apiGet.mockResolvedValue({
        settings: {
          mfaPolicy: validPolicy,
        },
      });

      render(<AdminSecuritySettings />);

      const mfaSelect = (await screen.findByLabelText(sec.mfaPolicy)) as HTMLSelectElement;

      expect(mfaSelect.value).toBe(validPolicy);
      expect(getReactSelectValue(mfaSelect)).toBe(validPolicy);
    },
  );
});
