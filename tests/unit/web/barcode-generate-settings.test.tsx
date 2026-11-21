// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BarcodeGenerateSettings } from "@/components/tools/barcode-generate-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

const GENERATE_URL = "/api/v1/tools/image/barcode-generate";

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  const stored = new Map<string, string>([["snapotter-token", "test-token"]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("barcode generate settings", () => {
  it("sends the auth headers with the generate request", async () => {
    const generate = vi.fn(() => respond({ downloadUrl: "/api/v1/files/barcode.png" }));
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).endsWith(GENERATE_URL) ? generate() : respond({}),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <I18nProvider>
        <BarcodeGenerateSettings />
      </I18nProvider>,
    );

    fireEvent.change(getByTestId("barcode-input-text"), {
      target: { value: "123456789012" },
    });
    fireEvent.click(getByTestId("barcode-generate-submit"));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith(GENERATE_URL));
    const headers = new Headers((call?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
