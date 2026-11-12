// @vitest-environment jsdom

/**
 * Settings > Tools shows a preset as off while its base tool is off, because
 * every other surface (and the API route table) treats it that way (#4624).
 * The preset's own `disabledTools` entry is left alone, so re-enabling the
 * base restores whatever the admin set for the preset itself.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

const apiGet = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import { ToolsSection } from "@/components/settings/settings-dialog";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";

const s = en.settings.tools;
const offWithConvert = format(s.offWithBase, { base: en.tools.convert.name });
const offWithCompress = format(s.offWithBase, { base: en.tools.compress.name });

function mockDisabled(ids: string[]) {
  apiGet.mockResolvedValue({ settings: { disabledTools: JSON.stringify(ids) } });
}

async function renderTools() {
  render(
    <I18nProvider>
      <ToolsSection />
    </I18nProvider>,
  );
  await screen.findByRole("button", { name: s.saveButton });
}

const toolSwitch = (name: string) => screen.getByRole("switch", { name });

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "en");
  apiPut.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  apiGet.mockReset();
  apiPut.mockReset();
});

describe("Settings > Tools: presets follow their base tool (#4624)", () => {
  it("renders a preset off and locked, with a hint, while its base is disabled", async () => {
    mockDisabled(["convert"]);
    await renderTools();

    const preset = toolSwitch(en.tools["heic-to-jpg"].name);
    expect(preset).toHaveAttribute("aria-checked", "false");
    expect(preset).toBeDisabled();
    const hintId = preset.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)).toHaveTextContent(offWithConvert);

    fireEvent.click(preset);
    expect(preset).toHaveAttribute("aria-checked", "false");
  });

  it("leaves presets alone while their base is enabled", async () => {
    mockDisabled([]);
    await renderTools();

    const preset = toolSwitch(en.tools["heic-to-jpg"].name);
    expect(preset).toHaveAttribute("aria-checked", "true");
    expect(preset).toBeEnabled();
    expect(preset).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(offWithConvert)).toBeNull();
  });

  it("keeps the base tool's own switch interactive", async () => {
    mockDisabled(["convert"]);
    await renderTools();

    const base = toolSwitch(en.tools.convert.name);
    expect(base).toHaveAttribute("aria-checked", "false");
    expect(base).toBeEnabled();
  });

  it("covers compress presets too", async () => {
    mockDisabled(["compress"]);
    await renderTools();

    const preset = toolSwitch(en.tools["compress-image-to-20kb"].name);
    expect(preset).toHaveAttribute("aria-checked", "false");
    expect(preset).toBeDisabled();
    expect(screen.getAllByText(offWithCompress).length).toBeGreaterThan(0);
  });

  it("restores the preset's own state when the base is re-enabled, without touching its entry", async () => {
    mockDisabled(["convert", "heic-to-png"]);
    await renderTools();

    fireEvent.click(toolSwitch(en.tools.convert.name));

    const jpg = toolSwitch(en.tools["heic-to-jpg"].name);
    expect(jpg).toHaveAttribute("aria-checked", "true");
    expect(jpg).toBeEnabled();
    const png = toolSwitch(en.tools["heic-to-png"].name);
    expect(png).toHaveAttribute("aria-checked", "false");
    expect(png).toBeEnabled();
    expect(screen.queryByText(offWithConvert)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: s.saveButton }));
    await vi.waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(JSON.parse(apiPut.mock.calls[0][1].disabledTools)).toEqual(["heic-to-png"]);
  });

  it("counts only the stored entries, not presets locked by their base", async () => {
    mockDisabled(["convert"]);
    await renderTools();

    const footer = screen.getByRole("button", { name: s.saveButton }).parentElement as HTMLElement;
    expect(within(footer).getByText(format(s.disabledCountOne, { count: 1 }))).toBeInTheDocument();
  });
});
