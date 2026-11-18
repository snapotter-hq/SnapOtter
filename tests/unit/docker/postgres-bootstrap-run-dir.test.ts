import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A tmpfs on /run hides the socket directory the postgresql package ships
// (#4504). The bootstrap is the only boot step that runs as root before the
// postgres longrun, so it has to make the directory on every boot.
const script = readFileSync(
  path.resolve(import.meta.dirname, "../../../docker/embedded/postgres-bootstrap.sh"),
  "utf8",
);
const lines = script.split("\n");
const MAKE_RUN_DIR = "install -d -o postgres -g postgres -m 2775 /run/postgresql";

describe("postgres-bootstrap.sh socket directory (#4504)", () => {
  it("recreates /run/postgresql with the package's owner and mode", () => {
    expect(lines.filter((line) => line.trim() === MAKE_RUN_DIR)).toHaveLength(1);
  });

  it("does it before the existing-data-dir branch, so restarts get it too", () => {
    const make = lines.findIndex((line) => line.trim() === MAKE_RUN_DIR);
    const branch = lines.findIndex((line) => line.includes('PG_VERSION" ]'));
    expect(branch).toBeGreaterThan(-1);
    expect(make).toBeGreaterThan(-1);
    expect(make).toBeLessThan(branch);
  });

  it("runs it at the top level, not inside a condition", () => {
    const make = lines.findIndex((line) => line.trim() === MAKE_RUN_DIR);
    expect(lines[make]).toBe(MAKE_RUN_DIR);
  });
});
