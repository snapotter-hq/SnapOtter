// @vitest-environment jsdom

/**
 * Auto Trim had no margin control, so the panel always sent a bare trim even
 * though the API takes padding there too (#1194). Trim now shows a Margin
 * slider that drives the same padding setting as subject and face modes.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { SmartCropControls } from "@/components/tools/smart-crop-settings";
import { I18nProvider } from "@/contexts/i18n-context";

const copy = en.toolSettings["smart-crop"];

afterEach(cleanup);

function lastSettings(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe("Smart Crop trim margin (#1194)", () => {
  it("sends the Margin slider as padding in trim mode", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <SmartCropControls onChange={onChange} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: copy.autoTrim }));
    expect(lastSettings(onChange)).toMatchObject({ mode: "trim", padding: 0 });

    fireEvent.change(screen.getByLabelText(copy.trimMargin), { target: { value: "20" } });
    expect(lastSettings(onChange)).toMatchObject({ mode: "trim", padding: 20 });
  });

  it("restores a saved trim margin", () => {
    render(
      <I18nProvider>
        <SmartCropControls settings={{ mode: "trim", padding: 15 }} />
      </I18nProvider>,
    );
    expect(screen.getByLabelText(copy.trimMargin)).toHaveValue("15");
  });
});
