import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-demo.yml");

interface Step {
  name?: string;
  id?: string;
  if?: string;
  "continue-on-error"?: boolean | string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}

interface DeployDemoWorkflow {
  on?: {
    push?: { branches?: string[]; paths?: string[] };
    pull_request?: { branches?: string[]; paths?: string[] };
    workflow_dispatch?: unknown;
  };
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  env?: Record<string, string>;
  jobs?: {
    deploy?: {
      if?: string;
      "continue-on-error"?: boolean | string;
      "timeout-minutes"?: number;
      steps?: Step[];
    };
  };
}

function workflowText(): string {
  expect(existsSync(workflowPath)).toBe(true);
  return readFileSync(workflowPath, "utf8");
}

function parseWorkflow(): DeployDemoWorkflow {
  return load(workflowText()) as DeployDemoWorkflow;
}

function expectBefore(workflow: string, earlier: string, later: string) {
  const earlierIndex = workflow.indexOf(earlier);
  const laterIndex = workflow.indexOf(later);

  expect(earlierIndex, `${earlier} should exist in the workflow`).toBeGreaterThanOrEqual(0);
  expect(laterIndex, `${later} should exist in the workflow`).toBeGreaterThanOrEqual(0);
  expect(earlierIndex, `${earlier} should run before ${later}`).toBeLessThan(laterIndex);
}

const EXPECTED_PATHS = [
  "apps/demo/**",
  "apps/web/**",
  "packages/shared/**",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  ".github/actions/setup/**",
  ".github/actions/playwright-install/**",
  "docker/feature-manifest.json",
  "playwright.demo.config.ts",
  "scripts/check-live-egress.mjs",
  "tests/e2e-demo/**",
  "tests/playwright-run.ts",
  "tests/unit/infra/demo-theme.test.ts",
  "tests/unit/infra/demo-mock-api.test.ts",
  "tests/unit/infra/deploy-demo-workflow.test.ts",
  ".github/workflows/deploy-demo.yml",
];

describe("demo deployment workflow", () => {
  it("deploys the demo app to the Cloudflare Pages demo project", () => {
    const workflow = workflowText();

    expect(workflow).toContain("name: Deploy Demo to Cloudflare Pages");
    expect(workflow).toContain("pnpm --filter @snapotter/demo build");
    expect(workflow).toContain(
      "npx wrangler pages deploy apps/demo/dist --project-name snapotter-demo --branch main --commit-dirty=true",
    );
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: $" + "{{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: $" + "{{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
  });

  it("runs focused demo gates before publishing to Cloudflare", () => {
    const workflow = workflowText();
    const chain = [
      "pnpm vitest run --config vitest.config.ts tests/unit/infra/demo-theme.test.ts tests/unit/infra/deploy-demo-workflow.test.ts tests/unit/infra/demo-mock-api.test.ts",
      "pnpm --filter @snapotter/demo exec tsc --noEmit",
      "pnpm --filter @snapotter/demo build",
      "id: pw-version",
      "uses: actions/cache@",
      "uses: ./.github/actions/playwright-install",
      "pnpm playwright test --config playwright.demo.config.ts",
      "npx wrangler pages deploy apps/demo/dist --project-name snapotter-demo --branch main --commit-dirty=true",
    ];

    for (let i = 0; i < chain.length - 1; i += 1) {
      expectBefore(workflow, chain[i], chain[i + 1]);
    }

    const parsed = parseWorkflow();
    const steps = parsed.jobs?.deploy?.steps ?? [];
    const cacheStep = steps.find((step) => step.uses?.startsWith("actions/cache@"));
    expect(cacheStep?.with?.path).toBe("~/.cache/ms-playwright");
    expect(cacheStep?.with?.key).toContain("steps.pw-version.outputs.version");
    expect(steps.filter((step) => /playwright install\b/.test(step.run ?? ""))).toEqual([]);
  });

  it("rebuilds when the demo shell, real app UI, shared code, or build inputs change", () => {
    const parsed = parseWorkflow();

    expect(parsed.on?.push?.branches).toEqual(["main"]);
    expect(parsed.on?.push?.paths).toEqual(EXPECTED_PATHS);
    expect(parsed.on?.pull_request?.paths).toEqual(EXPECTED_PATHS);
    expect(parsed.on).toHaveProperty("workflow_dispatch");
    expect(parsed.concurrency).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      group: "deploy-demo-${{ github.ref }}",
      "cancel-in-progress": true,
    });
    expect(parsed.env?.TESTCONTAINERS_RYUK_DISABLED).toBe("true");
  });

  it("runs build and smoke gates on pull requests while keeping deploy steps main-only (#1128)", () => {
    const parsed = parseWorkflow();
    const job = parsed.jobs?.deploy;
    const steps = job?.steps ?? [];

    expect(job?.if).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    expect(job?.["timeout-minutes"]).toBeGreaterThanOrEqual(25);

    const deployStep = steps.find((step) => step.name === "Deploy to Cloudflare Pages");
    const egressStep = steps.find(
      (step) => step.name === "Verify the live site loads nothing third-party",
    );
    const mainDeployCondition =
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main'";
    expect(deployStep?.if).toBe(mainDeployCondition);
    expect(egressStep?.if).toBe(deployStep?.if);
    expect(deployStep?.["continue-on-error"]).toBeUndefined();
    expect(egressStep?.["continue-on-error"]).toBeUndefined();

    const gateSteps = steps.filter((step) => step !== deployStep && step !== egressStep);
    expect(gateSteps.length).toBeGreaterThanOrEqual(8);
    for (const step of gateSteps) {
      expect(step.if, step.name ?? step.uses).toBeUndefined();
      expect(step["continue-on-error"], step.name ?? step.uses).toBeUndefined();
    }
  });
});
