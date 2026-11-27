import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routesDir = join(__dirname, "../../../apps/api/src/routes/tools");

/** Returns the argument text of every `fn(` call in `source`. */
function callArguments(source: string, fn: string): string[] {
  const calls: string[] = [];
  let from = source.indexOf(`${fn}(`);
  while (from !== -1) {
    let depth = 1;
    let end = from + fn.length + 1;
    while (depth > 0 && end < source.length) {
      const ch = source[end++];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    calls.push(source.slice(from, end));
    from = source.indexOf(`${fn}(`, end);
  }
  return calls;
}

// A tool route that decodes SVG must stop the render child when its client
// leaves (#5343). Each call has to carry a signal; a new route that forgets
// one fails here instead of rendering to the deadline after a disconnect.
describe("single-tool routes pass an abort signal to the SVG render", () => {
  const sources = readdirSync(routesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, source: readFileSync(join(routesDir, name), "utf8") }));

  for (const fn of ["prepareRouteImage", "renderSvgToPng"]) {
    it(`${fn} is never called without a signal`, () => {
      const unsigned = sources.flatMap(({ name, source }) =>
        callArguments(source, fn)
          .filter((call) => !/\bsignal\b/.test(call))
          .map(() => name),
      );
      expect(unsigned).toEqual([]);
    });
  }

  it("covers the routes the issue lists", () => {
    const withCalls = sources
      .filter(({ source }) => callArguments(source, "prepareRouteImage").length > 0)
      .map(({ name }) => name);
    expect(withCalls.length).toBeGreaterThanOrEqual(18);
  });
});

// A disconnect during the render lands in the route's decode catch as an
// AbortError (#5363). Every route that hands the render a disconnect signal
// has to drop it quietly there, or it logs an error and writes a 422 to a
// closed socket.
describe("routes that pass a disconnect signal drop the abort quietly", () => {
  const sources = readdirSync(routesDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, source: readFileSync(join(routesDir, name), "utf8") }));

  it("calls dropIfClientGone wherever clientDisconnectSignal(reply) is used", () => {
    const missing = sources
      .filter(
        ({ source }) =>
          source.includes("clientDisconnectSignal(reply)") && !source.includes("dropIfClientGone("),
      )
      .map(({ name }) => name);
    expect(missing).toEqual([]);
  });
});

// Node never emits `aborted` on a request whose body has fully arrived, so the
// ingress signal of batch and pipeline listens on the response instead.
describe("batch and pipeline ingress signals", () => {
  for (const name of ["batch.ts", "pipeline.ts"]) {
    it(`${name} builds the ingress signal from the response close`, () => {
      const source = readFileSync(join(routesDir, "..", name), "utf8");
      expect(source).not.toContain('"aborted"');
      expect(source).toContain("clientDisconnectSignal(reply)");
    });
  }
});
