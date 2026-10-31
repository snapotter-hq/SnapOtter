import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runEndWrites } from "@/lib/run-teardown";

// #1791, #1814: a run's ending writes each run in their own guard, so one
// that throws can't skip the rest, and the first throw comes back for the
// caller to rethrow once the run is over.
describe("runEndWrites", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it("runs every write and returns null when none throws", () => {
    const ran: number[] = [];
    expect(runEndWrites([() => ran.push(1), () => ran.push(2)])).toBeNull();
    expect(ran).toEqual([1, 2]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("keeps going past a write that throws and returns the first throw", () => {
    const first = new Error("first");
    const second = new Error("second");
    const ran: string[] = [];
    const result = runEndWrites([
      () => {
        ran.push("a");
        throw first;
      },
      () => ran.push("b"),
      () => {
        ran.push("c");
        throw second;
      },
      () => ran.push("d"),
    ]);

    expect(ran).toEqual(["a", "b", "c", "d"]);
    expect(result).toEqual({ cause: first });
    // Every throw is logged, not just the one returned.
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith("Ending the run failed", first);
    expect(consoleError).toHaveBeenCalledWith("Ending the run failed", second);
  });

  it("returns a thrown non-Error value as the cause", () => {
    expect(
      runEndWrites([
        () => {
          throw undefined;
        },
      ]),
    ).toEqual({ cause: undefined });
  });
});
