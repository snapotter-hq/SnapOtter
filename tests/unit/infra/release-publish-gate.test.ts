import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const GATE_ENVIRONMENT = "publish-images";

interface Job {
  needs?: string | string[];
  if?: string;
  environment?: string | { name?: string };
  permissions?: Record<string, string> | string;
}

interface Workflow {
  jobs: Record<string, Job>;
}

function readWorkflow(filename: string): Workflow {
  return load(readFileSync(path.join(root, ".github/workflows", filename), "utf8")) as Workflow;
}

function needsOf(job: Job): string[] {
  if (!job.needs) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

function ancestors(workflow: Workflow, name: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...needsOf(workflow.jobs[name])];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.has(next)) continue;
    expect(workflow.jobs[next], `${name} needs a missing job ${next}`).toBeDefined();
    seen.add(next);
    queue.push(...needsOf(workflow.jobs[next]));
  }
  return seen;
}

function isGate(job: Job): boolean {
  const environment = typeof job.environment === "string" ? job.environment : job.environment?.name;
  return environment === GATE_ENVIRONMENT;
}

// A job-level always(), !cancelled(), or failure() runs a job even when the
// approval was rejected, which would skip the gate.
const FORCE_RUN = /always\(\)|cancelled\(\)|failure\(\)/;

// A job can write to Docker Hub, GHCR, or Hugging Face if it holds a write
// credential for one of them or pushes an image.
function canPublish(job: Job): boolean {
  const text = JSON.stringify(job);
  const packagesWrite = typeof job.permissions === "object" && job.permissions.packages === "write";
  return (
    packagesWrite ||
    text.includes("secrets.DOCKERHUB_TOKEN") ||
    text.includes("secrets.HF_TOKEN") ||
    text.includes("push=true") ||
    text.includes('"secrets":"inherit"')
  );
}

describe("release publish approval gate (#4329)", () => {
  const release = readWorkflow("release.yml");

  it("finds the jobs that push to Docker Hub, GHCR, and Hugging Face", () => {
    const publishers = Object.keys(release.jobs).filter((name) => canPublish(release.jobs[name]));
    expect(publishers).toEqual(expect.arrayContaining(["docker", "ai-bundles", "manifest"]));
  });

  it("runs every publishing job only after the publish-images approval", () => {
    const ungated = Object.keys(release.jobs).filter((name) => {
      const job = release.jobs[name];
      if (!canPublish(job) || isGate(job)) return false;
      return ![...ancestors(release, name)].some((ancestor) => isGate(release.jobs[ancestor]));
    });
    expect(ungated).toEqual([]);
  });

  it("never force-runs a publishing job or anything it needs past a rejected approval", () => {
    const forced = Object.keys(release.jobs)
      .filter((name) => canPublish(release.jobs[name]))
      .flatMap((name) => [name, ...ancestors(release, name)])
      .filter((name) => FORCE_RUN.test(release.jobs[name].if ?? ""));
    expect(forced).toEqual([]);
  });

  it("asks for approval before the first image push, not after the scan", () => {
    const gates = [...ancestors(release, "docker")].filter((name) => isGate(release.jobs[name]));
    expect(gates).not.toEqual([]);
  });

  it("only uploads AI bundles to Hugging Face when release.yml calls ai-bundles.yml", () => {
    // ai-bundles.yml also runs on dispatch and schedule. Its publish job must
    // stay behind validate-inputs, which only runs for a release call, so the
    // Hugging Face upload can never bypass release.yml's approval.
    const bundles = readWorkflow("ai-bundles.yml");
    const publishers = Object.keys(bundles.jobs).filter((name) => canPublish(bundles.jobs[name]));
    expect(publishers).toContain("publish");
    for (const name of publishers) {
      const chain = ancestors(bundles, name);
      expect(chain.has("validate-inputs"), `${name} must need validate-inputs`).toBe(true);
      for (const ancestor of [name, ...chain]) {
        expect(bundles.jobs[ancestor].if ?? "", `${ancestor} must not force-run`).not.toMatch(
          FORCE_RUN,
        );
      }
    }
    expect(bundles.jobs["validate-inputs"].if).toBe("inputs.release_commit != ''");
  });
});
