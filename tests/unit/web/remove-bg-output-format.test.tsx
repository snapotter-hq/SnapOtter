// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deployment = vi.hoisted(() => ({
  basePath: "",
  downloadUrl: null as string | null,
  // Phase 1 not run yet: no result, so the submit button is what renders.
  beforeRun: false,
  // What the processor reports while and after a run, for the tests that watch
  // the panel react to a re-run.
  processing: false,
  error: null as string | null,
  processFiles: vi.fn(),
}));

// Phase 1 (background removal) is "done": the processor exposes a mask PNG
// download URL and is no longer processing, so the wrapper renders its
// download controls. Only Phase 2 (the effects request) re-encodes to the
// chosen output format; Phase 1 always emits PNG.
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: deployment.processFiles,
    processAllFiles: vi.fn(),
    processing: deployment.processing,
    error: deployment.error,
    downloadUrl: deployment.beforeRun
      ? null
      : (deployment.downloadUrl ?? `${deployment.basePath}/api/v1/download/JOB123/pic_mask.png`),
    originalSize: 1000,
    processedSize: 500,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { useFileStore } from "@/stores/file-store";

beforeEach(() => {
  // jsdom has no object-URL support; the file store mints preview URLs.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  // One local (non-library) file, so fromLibrary is false and the output
  // format is the only thing that can route the download through Phase 2.
  useFileStore
    .getState()
    .setFiles([new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  deployment.basePath = "";
  deployment.downloadUrl = null;
  deployment.beforeRun = false;
  deployment.processing = false;
  deployment.error = null;
  deployment.processFiles.mockReset();
  useFileStore.getState().setFiles([]);
});

// The single-file page sent only the model to Phase 1, while the batch and
// pipeline paths sent every setting. Edge smoothing and decontamination are
// sidecar options that Phase 2 can't apply, so they have to ride on the
// Phase 1 request (#2077).
describe("remove-background Phase 1 request (#2077)", () => {
  it("sends edge smoothing and decontamination for a single file", async () => {
    deployment.beforeRun = true;
    render(<RemoveBgSettings />);

    fireEvent.click(await screen.findByText("Effects"));
    fireEvent.change(await screen.findByTestId("remove-background-edge-refine"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByTestId("remove-background-decontaminate"));
    fireEvent.click(screen.getByTestId("remove-background-submit"));

    await waitFor(() => expect(deployment.processFiles).toHaveBeenCalledTimes(1));
    const [, settings, options] = deployment.processFiles.mock.calls[0];
    expect(settings).toMatchObject({ edgeRefine: 3, decontaminate: true });
    expect(options).toEqual({ skipLibrarySave: true });
  });

  it("sends only the model when the refinements are left at their defaults", async () => {
    deployment.beforeRun = true;
    render(<RemoveBgSettings />);

    fireEvent.click(await screen.findByTestId("remove-background-submit"));

    await waitFor(() => expect(deployment.processFiles).toHaveBeenCalledTimes(1));
    const [, settings] = deployment.processFiles.mock.calls[0];
    expect(settings).not.toHaveProperty("edgeRefine");
    expect(settings).not.toHaveProperty("decontaminate");
  });
});

// Edge smoothing and decontamination are sidecar options: only a new removal can
// apply them. Changing them after a result leaves the download as it was, so the
// panel says so and offers to run again (#2112).
describe("remove-background refinements changed after the first run (#2112)", () => {
  const stale = () => screen.queryByTestId("remove-background-refine-stale");

  /** Runs the removal with the defaults and lands its result. */
  async function runAndLand(view: ReturnType<typeof render>) {
    deployment.beforeRun = true;
    view.rerender(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-submit"));
    await waitFor(() => expect(deployment.processFiles).toHaveBeenCalledTimes(1));
    deployment.beforeRun = false;
    view.rerender(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
  }

  async function openEffects() {
    fireEvent.click(await screen.findByText(en.toolSettings["remove-bg"].effects));
  }

  it("says nothing while the settings still match the run", async () => {
    const view = render(<RemoveBgSettings />);
    await runAndLand(view);

    expect(stale()).not.toBeInTheDocument();
  });

  it("offers to run again once edge smoothing changes", async () => {
    const view = render(<RemoveBgSettings />);
    await runAndLand(view);
    await openEffects();

    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "3" },
    });

    expect(stale()).toHaveTextContent(en.toolSettings["remove-background"].refineChanged);
  });

  it("offers to run again once decontamination changes, and stops when it is changed back", async () => {
    const view = render(<RemoveBgSettings />);
    await runAndLand(view);
    await openEffects();

    fireEvent.click(screen.getByTestId("remove-background-decontaminate"));
    expect(stale()).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remove-background-decontaminate"));
    expect(stale()).not.toBeInTheDocument();
  });

  it("runs the removal again with the new values", async () => {
    const view = render(<RemoveBgSettings />);
    await runAndLand(view);
    await openEffects();
    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("remove-background-decontaminate"));

    fireEvent.click(screen.getByTestId("remove-background-rerun"));

    await waitFor(() => expect(deployment.processFiles).toHaveBeenCalledTimes(2));
    const [, settings, options] = deployment.processFiles.mock.calls[1];
    expect(settings).toMatchObject({ edgeRefine: 2, decontaminate: true });
    expect(options).toEqual({ skipLibrarySave: true });
  });

  it("still offers to run again for a result restored after a remount", async () => {
    // The mobile settings sheet unmounts the panel while the result stays loaded;
    // the run's own values are gone, so the defaults are assumed and any
    // refinement set afterwards counts as a change.
    const first = render(<RemoveBgSettings />);
    await runAndLand(first);
    first.unmount();

    render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
    expect(stale()).not.toBeInTheDocument();
    await openEffects();
    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "1" },
    });

    expect(stale()).toBeInTheDocument();
  });

  it("does not react to settings Phase 2 can apply itself", async () => {
    const view = render(<RemoveBgSettings />);
    await runAndLand(view);
    await openEffects();

    fireEvent.click(screen.getByTestId("remove-background-format-webp"));

    expect(stale()).not.toBeInTheDocument();
  });
});

describe("remove-background output format routing (#720)", () => {
  it("uses the plain (Phase 1) download for the default PNG output", async () => {
    render(<RemoveBgSettings />);

    // Download controls appear once the Phase 1 result is picked up.
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-download-effects")).not.toBeInTheDocument();
  });

  it("routes the download through the effects request when WebP is chosen", async () => {
    render(<RemoveBgSettings />);

    // Default PNG: plain download.
    await screen.findByTestId("remove-background-download");

    // Choose WebP output (transparent background, no effects).
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));

    // The download must now go through Phase 2, the only path that re-encodes,
    // instead of handing back the Phase 1 PNG.
    await waitFor(() => {
      expect(screen.getByTestId("remove-background-download-effects")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("remove-background-download")).not.toBeInTheDocument();
  });
  it.each(["/snapotter", "/apps/snapotter"])(
    "uses the correct job for effects under %s",
    async (basePath) => {
      deployment.basePath = basePath;
      // A failed response prevents navigation while still exercising the real request.
      const fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "test" }) });
      vi.stubGlobal("fetch", fetch);
      render(<RemoveBgSettings />);
      await screen.findByTestId("remove-background-download");
      fireEvent.click(screen.getByTestId("remove-background-format-webp"));
      fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(JSON.parse(fetch.mock.calls[0][1].body.get("settings")).jobId).toBe("JOB123");
    },
  );

  it("does not treat a batch result's blob URL as a finished job", async () => {
    // A multi-file run settles the entry with an object URL for the ZIP entry.
    deployment.downloadUrl = "blob:https://host:1349/3f2a9c1e-0000-4000-8000-000000000000";
    render(<RemoveBgSettings />);

    expect(await screen.findByTestId("remove-background-submit")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-download")).not.toBeInTheDocument();
  });
});

// The effects request reads the mask and original an earlier removal stored.
// When the server no longer holds them it answers 410 BACKGROUND_REMOVAL_EXPIRED
// and the panel removes the background again instead of leaving a download
// button that can never work (#2119).
describe("remove-background effects after the stored cutout expired (#2119)", () => {
  async function applyEffects(answer: { status: number; body: unknown }) {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: answer.status,
      json: async () => answer.body,
    });
    vi.stubGlobal("fetch", fetch);
    const view = render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return view;
  }

  const expired = {
    status: 410,
    body: { error: "expired", code: "BACKGROUND_REMOVAL_EXPIRED" },
  };
  const note = () => en.toolSettings["remove-background"].effectsExpired;

  it("removes the background again and says why", async () => {
    await applyEffects({
      status: 410,
      body: { error: "expired", code: "BACKGROUND_REMOVAL_EXPIRED" },
    });

    expect(
      await screen.findByText(en.toolSettings["remove-background"].effectsExpired),
    ).toBeVisible();
    await waitFor(() => expect(deployment.processFiles).toHaveBeenCalledTimes(1));
    const [files, , options] = deployment.processFiles.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(options).toEqual({ skipLibrarySave: true });
  });

  it("shows any other failure as before, without running the removal again", async () => {
    await applyEffects({ status: 500, body: { error: "disk on fire" } });

    expect(await screen.findByText("disk on fire")).toBeVisible();
    expect(screen.queryByText(en.toolSettings["remove-background"].effectsExpired)).toBeNull();
    expect(deployment.processFiles).not.toHaveBeenCalled();
  });

  it("drops the note when the new removal fails, leaving the real error", async () => {
    const view = await applyEffects(expired);
    expect(await screen.findByText(note())).toBeVisible();

    // A run that starts clears the entry's result, and a failed one leaves it
    // cleared, so the panel never sees a fresh download URL.
    deployment.beforeRun = true;
    deployment.processing = true;
    view.rerender(<RemoveBgSettings />);
    deployment.processing = false;
    deployment.error = "Canceled";
    view.rerender(<RemoveBgSettings />);

    await waitFor(() => expect(screen.queryByText(note())).toBeNull());
    expect(screen.getByText("Canceled")).toBeVisible();
  });

  it("drops the note once the new removal's result arrives", async () => {
    const view = await applyEffects(expired);
    expect(await screen.findByText(note())).toBeVisible();

    deployment.downloadUrl = "/api/v1/download/JOB456/pic_mask.png";
    view.rerender(<RemoveBgSettings />);

    await waitFor(() => expect(screen.queryByText(note())).toBeNull());
  });

  it("does not run the removal again for a file the user has since replaced", async () => {
    let answer!: (response: unknown) => void;
    const fetch = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal("fetch", fetch);
    render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");
    fireEvent.click(screen.getByTestId("remove-background-format-webp"));
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    // A different file lands in the store while the request is in flight.
    act(() => {
      useFileStore
        .getState()
        .setFiles([new File([new Uint8Array([4, 5, 6])], "other.png", { type: "image/png" })]);
    });
    await act(async () => {
      answer({ ok: false, status: 410, json: async () => expired.body });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deployment.processFiles).not.toHaveBeenCalled();
    expect(screen.queryByText(note())).toBeNull();
  });
});
