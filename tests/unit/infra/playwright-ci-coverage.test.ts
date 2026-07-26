import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * About 2,000 Playwright tests across five configs and three main-config
 * projects collected and passed locally while no workflow ran any of them.
 * Editor, docs-site, analytics-privacy, no-auth and visual-regression behaviour
 * could all regress with every check green.
 *
 * A surface is covered when some workflow step actually runs it. Coverage is
 * read out of `run:` strings only, because a config filename also appears in
 * ci.yml's path filter and that mention runs nothing. Anything genuinely not
 * suited to CI has to say so here, with a reason, instead of just being absent.
 */

const root = path.resolve(import.meta.dirname, "../../..");

/**
 * Surfaces that deliberately have no automatic lane. Each entry must still be
 * genuinely unreferenced: a stale reason is itself a failure, so wiring one up
 * later forces the note to be deleted.
 */
const MANUAL_ONLY: Record<string, string> = {
  "playwright.analytics.config.ts":
    "In-container browser sweep against a running image at BASE_URL: 1072 tests at workers=1 with 120s timeouts. nightly.yml's docker-e2e job already records in-container browser e2e as a separate follow-up that does not fit its 60-minute budget.",
  "tests/qa/playwright.qa.config.ts":
    "Against-production sweep driven by QA_BASE_URL. CI has no deployed target to point it at, so it stays a manual release-verification lane.",
  "chromium-visual":
    "Screenshot baselines are platform-suffixed and only darwin baselines are committed (327 darwin, 0 linux). update-visual-baselines.yml exists to generate the linux set and open a PR; until that lands, a linux lane would fail on every missing snapshot.",
  "chromium-legacy-visual":
    "visual-regression.spec.ts has no maintained baselines on any platform, as playwright.config.ts states. It is kept explicitly runnable rather than silently skipped.",
};

/** Projects that only exist as a dependency of another project. */
const DEPENDENCY_PROJECTS = new Set(["setup"]);

interface Workflow {
  jobs?: Record<string, { steps?: { run?: string }[] }>;
}

function rootScripts(): Record<string, string> {
  return (
    JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
}

/**
 * Every command any workflow actually executes, with `pnpm <script>` references
 * expanded from package.json so `pnpm test:e2e:docs` counts as running the docs
 * config.
 */
function executedCommands(): string {
  const workflowDir = path.join(root, ".github/workflows");
  const commands: string[] = [];
  for (const file of readdirSync(workflowDir).filter((name) => name.endsWith(".yml"))) {
    const workflow = load(readFileSync(path.join(workflowDir, file), "utf8")) as Workflow;
    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.run === "string") commands.push(step.run);
      }
    }
  }

  let corpus = commands.join("\n");
  const scripts = rootScripts();
  // Two passes: a workflow calls a script, which may call another script.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [name, body] of Object.entries(scripts)) {
      const reference = new RegExp(
        `pnpm (?:run )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\S)`,
      );
      if (reference.test(corpus) && !corpus.includes(body)) corpus += `\n${body}`;
    }
  }
  return corpus;
}

function playwrightConfigs(): string[] {
  const configs = readdirSync(root).filter(
    (name) => name.startsWith("playwright.") && name.endsWith(".config.ts"),
  );
  configs.push("tests/qa/playwright.qa.config.ts");
  return configs.sort();
}

function mainConfigProjects(): string[] {
  const source = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
  return [...source.matchAll(/^\s{6}name: "([^"]+)",$/gm)]
    .map((match) => match[1])
    .filter((name) => !DEPENDENCY_PROJECTS.has(name));
}

describe("Playwright CI coverage", () => {
  const corpus = executedCommands();

  it("runs every Playwright config from some workflow, or says why not", () => {
    // playwright.config.ts is the default, so it is never named on a command
    // line: any `playwright test` without --config is running it.
    const defaultConfigRun = /playwright test(?![^\n]*--config)/.test(corpus);
    const unwired = playwrightConfigs().filter((config) => {
      if (config === "playwright.config.ts") return !defaultConfigRun;
      return !corpus.includes(config) && !MANUAL_ONLY[config];
    });
    expect(unwired).toEqual([]);
  });

  it("runs every main-config project from some workflow, or says why not", () => {
    const unwired = mainConfigProjects().filter(
      (project) => !corpus.includes(`--project=${project}`) && !MANUAL_ONLY[project],
    );
    expect(unwired).toEqual([]);
  });

  it("keeps the manual-only list free of stale entries", () => {
    const nowWired = Object.keys(MANUAL_ONLY).filter(
      (surface) =>
        corpus.includes(surface.endsWith(".ts") ? surface : `--project=${surface}`) &&
        // update-visual-baselines regenerates baselines; it is not a gate.
        !corpus.includes("--update-snapshots"),
    );
    expect(nowWired).toEqual([]);
  });

  it("gives every manual-only surface a written reason", () => {
    for (const [surface, reason] of Object.entries(MANUAL_ONLY)) {
      expect(reason.length, `${surface} needs a reason`).toBeGreaterThan(60);
    }
  });
});
