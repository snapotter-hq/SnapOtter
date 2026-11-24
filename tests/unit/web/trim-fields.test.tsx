// @vitest-environment jsdom

import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TrimFields,
  type TrimValue,
  trimPayload,
  trimProblem,
  trimValueFrom,
} from "@/components/common/trim-fields";
import { TrimAudioControls } from "@/components/tools/trim-audio-settings";
import { TrimVideoControls } from "@/components/tools/trim-video-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RANGE: TrimValue = { mode: "range", startS: 0, endS: 10, cutStartS: 0, cutEndS: 0 };

describe("trim value helpers (#728)", () => {
  it("sends only the active mode's fields", () => {
    expect(trimPayload({ ...RANGE, cutStartS: 3 })).toEqual({ mode: "range", startS: 0, endS: 10 });
    expect(trimPayload({ ...RANGE, mode: "ends", cutStartS: 3, cutEndS: 2 })).toEqual({
      mode: "ends",
      cutStartS: 3,
      cutEndS: 2,
    });
  });

  it("names what blocks a trim", () => {
    expect(trimProblem(RANGE)).toBeNull();
    expect(trimProblem({ ...RANGE, startS: 10 })).toBe("endBeforeStart");
    expect(trimProblem({ ...RANGE, mode: "ends" })).toBe("nothingToCut");
    expect(trimProblem({ ...RANGE, mode: "ends", cutEndS: 1 })).toBeNull();
  });

  it("flags a range shorter than 0.1s, but not exactly 0.1s (#4960)", () => {
    expect(trimProblem({ ...RANGE, startS: 5, endS: 5.05 })).toBe("windowTooShort");
    expect(trimProblem({ ...RANGE, startS: 5, endS: 5.1 })).toBeNull();
  });

  it("reads saved settings, treating anything but ends as a range", () => {
    expect(trimValueFrom({ startS: 4, endS: 9 }, RANGE)).toEqual({ ...RANGE, startS: 4, endS: 9 });
    expect(trimValueFrom({ mode: "ends", cutStartS: 2 }, RANGE)).toEqual({
      ...RANGE,
      mode: "ends",
      cutStartS: 2,
    });
    expect(trimValueFrom({ mode: "bogus" }, RANGE).mode).toBe("range");
  });
});

function Harness({ onValidity }: { onValidity: (valid: boolean) => void }) {
  const [value, setValue] = useState(RANGE);
  return (
    <TrimFields
      idPrefix="t"
      value={value}
      onChange={setValue}
      labels={en.toolSettings["trim-video"]}
      onTextValidityChange={onValidity}
    />
  );
}

describe("TrimFields (#728)", () => {
  it("shows times as timecodes and explains what is kept", () => {
    render(<Harness onValidity={() => {}} />);
    expect(screen.getByLabelText("End")).toHaveProperty("value", "0:10");
    expect(screen.getByText(en.toolSettings["trim-video"].rangeHint)).toBeTruthy();
  });

  it("flags unparseable text and reports it", async () => {
    const onValidity = vi.fn();
    render(<Harness onValidity={onValidity} />);
    const end = screen.getByLabelText("End");
    await userEvent.clear(end);
    await userEvent.type(end, "1:75");
    expect(end.getAttribute("aria-invalid")).toBe("true");
    expect(onValidity).toHaveBeenLastCalledWith(false);
    await userEvent.clear(end);
    await userEvent.type(end, "1:15");
    expect(end.getAttribute("aria-invalid")).toBe("false");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it("normalises the typed text on blur", async () => {
    render(<Harness onValidity={() => {}} />);
    const end = screen.getByLabelText("End");
    await userEvent.clear(end);
    await userEvent.type(end, "125");
    await userEvent.tab();
    expect(end).toHaveProperty("value", "2:05");
  });

  it("falls back to the last good value when invalid text loses focus", async () => {
    const onValidity = vi.fn();
    render(<Harness onValidity={onValidity} />);
    const end = screen.getByLabelText("End");
    await userEvent.clear(end);
    await userEvent.type(end, "1:7x");
    await userEvent.tab();
    expect(end).toHaveProperty("value", "1:07");
    expect(end.getAttribute("aria-invalid")).toBe("false");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it("ignores a hidden invalid field after switching modes", async () => {
    const onValidity = vi.fn();
    render(<Harness onValidity={onValidity} />);
    await userEvent.type(screen.getByLabelText("End"), "x");
    expect(onValidity).toHaveBeenLastCalledWith(false);
    await userEvent.selectOptions(screen.getByLabelText("Mode"), "ends");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it("warns when an ends cut removes nothing", async () => {
    render(<Harness onValidity={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("Mode"), "ends");
    expect(screen.getByText(en.toolSettings["trim-video"].nothingToCut)).toBeTruthy();
    expect(screen.getByText(en.toolSettings["trim-video"].endsHint)).toBeTruthy();
  });
});

describe("TrimFields minimum window (#4960)", () => {
  it("shows the minimum inline when the range is too short", async () => {
    render(<Harness onValidity={() => {}} />);
    const start = screen.getByLabelText("Start");
    await userEvent.clear(start);
    await userEvent.type(start, "9.95");
    expect(screen.getByText(en.toolSettings["trim-video"].windowTooShort)).toBeTruthy();
  });
});

describe("Trim pipeline controls (#728)", () => {
  it("emits seconds parsed from a typed timecode", async () => {
    const onChange = vi.fn();
    render(<TrimVideoControls onChange={onChange} />);
    const end = screen.getByLabelText("End");
    await userEvent.clear(end);
    await userEvent.type(end, "1:02:03.5");
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "range",
      startS: 0,
      endS: 3723.5,
      precise: false,
    });
  });

  it("emits an ends cut without start/end", async () => {
    const onChange = vi.fn();
    render(<TrimAudioControls onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Mode"), "ends");
    const cutEnd = screen.getByLabelText("Cut from end");
    await userEvent.clear(cutEnd);
    await userEvent.type(cutEnd, "0:30");
    expect(onChange).toHaveBeenLastCalledWith({ mode: "ends", cutStartS: 0, cutEndS: 30 });
  });

  it("restores a saved ends cut", () => {
    render(
      <TrimVideoControls
        settings={{ mode: "ends", cutStartS: 5, cutEndS: 90, precise: true }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Cut from start")).toHaveProperty("value", "0:05");
    expect(screen.getByLabelText("Cut from end")).toHaveProperty("value", "1:30");
  });
});
