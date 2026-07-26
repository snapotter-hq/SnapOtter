/**
 * Snapshots the LIVE tool contract for the container QA sweep.
 *
 * The sweep runs against a production container and must not need a database,
 * but the settings schemas it exercises only exist inside the API process
 * (createToolRoute populates toolRegistry at registration time). This script
 * registers every tool route against a stub Fastify instance, reads the real
 * Zod schemas back out, derives pairwise axes and invalid-value probes from
 * them, and writes tests/qa/tool-contract.json.
 *
 * Nothing here is hand-maintained: catalog, modality, accepted inputs,
 * execution hint, AI mapping, multi-input arity and settings axes all come
 * from code. Re-run whenever the catalog or a schema changes.
 *
 * Needs a Postgres reachable at DATABASE_URL only because registerToolRoutes
 * reads the disabledTools/enableExperimentalTools settings rows. It performs
 * two SELECTs and no writes.
 *
 * Run: ./apps/api/node_modules/.bin/tsx tests/qa/extract-tool-contract.mts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { PYTHON_SIDECAR_TOOLS, TOOLS } from "../../packages/shared/src/constants.js";
import { deriveAxes, type PictAxis } from "../helpers/zod-pict.js";

process.env.DATA_DIR ||= "/tmp/qa-tool-contract";
process.env.DATABASE_URL ||= "postgres://snapotter:snapotter@localhost:5432/snapotter";
process.env.REDIS_URL ||= "redis://127.0.0.1:6379";
process.env.AUTH_ENABLED ||= "true";

export interface ToolContract {
  id: string;
  name: string;
  modality: string;
  section: string;
  acceptedInputs: string[];
  executionHint: string;
  outputModality?: string;
  isAI: boolean;
  registered: boolean;
  maxInputs?: number;
  inputKinds?: string[];
  skipStructuralValidation?: boolean;
  /** Pairwise axes derived from the live Zod schema. */
  axes: PictAxis[];
  /** Settings values the live schema must reject, derived from the axes. */
  invalidProbes: Array<{ key: string; value: unknown; why: string }>;
}

interface FieldBounds {
  min?: number;
  max?: number;
  kind: "number" | "enum" | "boolean" | "other";
}

/**
 * Minimal view of the Zod v3 internals this walker touches, mirroring the
 * approach in tests/helpers/zod-pict.ts. Reaching into `_def` is deliberate; a
 * Zod upgrade that changes it should fail here loudly rather than silently
 * producing an empty bounds map.
 */
interface ZodDefLike {
  typeName?: string;
  schema?: ZodNodeLike;
  innerType?: ZodNodeLike;
  in?: ZodNodeLike;
  shape?: () => Record<string, ZodNodeLike>;
  checks?: Array<{ kind: string; value?: number }>;
}

interface ZodNodeLike {
  _def?: ZodDefLike;
}

/** Strips effects, pipelines, defaults, optionals and nullables. */
function unwrapNode(node: ZodNodeLike): ZodNodeLike {
  let current = node;
  for (let i = 0; i < 10; i++) {
    const def = current._def;
    if (!def) return current;
    if (def.typeName === "ZodEffects" && def.schema) current = def.schema;
    else if (def.typeName === "ZodPipeline" && def.in) current = def.in;
    else if (
      (def.typeName === "ZodDefault" ||
        def.typeName === "ZodOptional" ||
        def.typeName === "ZodNullable") &&
      def.innerType
    )
      current = def.innerType;
    else return current;
  }
  return current;
}

/**
 * Reads the bounds a field actually declares.
 *
 * deriveAxes synthesizes an upper bound for unbounded numbers so the pairwise
 * array has something to sample, which means "one past the largest axis value"
 * is often a perfectly valid input. Boundary probes have to come from the real
 * min and max checks or they accuse the container of accepting things it is
 * supposed to accept.
 */
function readFieldBounds(schema: unknown): Map<string, FieldBounds> {
  const bounds = new Map<string, FieldBounds>();
  const root = unwrapNode(schema as ZodNodeLike);
  const shape = root._def?.shape;
  if (root._def?.typeName !== "ZodObject" || typeof shape !== "function") return bounds;

  for (const [key, field] of Object.entries(shape())) {
    const inner = unwrapNode(field);
    const typeName = inner._def?.typeName;
    if (typeName === "ZodNumber") {
      const entry: FieldBounds = { kind: "number" };
      for (const check of inner._def?.checks ?? []) {
        if (check.kind === "min") entry.min = check.value;
        if (check.kind === "max") entry.max = check.value;
      }
      bounds.set(key, entry);
    } else if (typeName === "ZodEnum" || typeName === "ZodNativeEnum") {
      bounds.set(key, { kind: "enum" });
    } else if (typeName === "ZodBoolean") {
      bounds.set(key, { kind: "boolean" });
    } else {
      bounds.set(key, { kind: "other" });
    }
  }
  return bounds;
}

/** Settings values the live schema is obliged to refuse. */
function invalidProbesFor(
  axes: PictAxis[],
  bounds: Map<string, FieldBounds>,
): ToolContract["invalidProbes"] {
  const probes: ToolContract["invalidProbes"] = [];
  for (const axis of axes) {
    const field = bounds.get(axis.key);
    if (!field) continue;
    if (field.kind === "number") {
      if (field.min !== undefined) {
        probes.push({ key: axis.key, value: field.min - 1, why: "below declared min" });
      }
      if (field.max !== undefined) {
        probes.push({ key: axis.key, value: field.max + 1, why: "above declared max" });
      }
      probes.push({ key: axis.key, value: "not-a-number", why: "wrong type" });
      continue;
    }
    if (field.kind === "enum") {
      probes.push({ key: axis.key, value: "__snapotter_qa_not_a_member__", why: "enum outsider" });
      probes.push({ key: axis.key, value: 12345, why: "wrong type" });
      continue;
    }
    if (field.kind === "boolean") {
      probes.push({ key: axis.key, value: "yes-please", why: "wrong type" });
    }
  }
  return probes;
}

async function main(): Promise<void> {
  const repo = join(import.meta.dirname, "..", "..");
  const fastifyModule = await import(
    join(repo, "apps", "api", "node_modules", "fastify", "fastify.js")
  );
  const app = fastifyModule.default({ logger: false }) as FastifyInstance;
  // The tool factory only needs these decorators to exist; the sweep drives the
  // real auth stack over HTTP against the container, not through this stub.
  app.decorate("authenticate", async () => {});
  app.decorate("requirePermission", () => async () => {});

  const { registerToolRoutes } = await import(join(repo, "apps/api/src/routes/tools/index.js"));
  await registerToolRoutes(app);

  const { getToolConfig, getRegisteredToolIds } = await import(
    join(repo, "apps/api/src/routes/tool-factory.js")
  );
  const registeredIds = new Set<string>(getRegisteredToolIds());
  const aiTools = new Set<string>(PYTHON_SIDECAR_TOOLS as readonly string[]);

  const { toolSection } = await import(join(repo, "packages/shared/src/section.js"));

  const contracts: ToolContract[] = TOOLS.map((tool) => {
    const config = getToolConfig(tool.id) as
      | {
          settingsSchema?: Parameters<typeof deriveAxes>[0];
          maxInputs?: number;
          inputKinds?: string[];
          skipStructuralValidation?: boolean;
        }
      | undefined;
    let axes: PictAxis[] = [];
    let bounds = new Map<string, FieldBounds>();
    if (config?.settingsSchema) {
      bounds = readFieldBounds(config.settingsSchema);
      try {
        axes = deriveAxes(config.settingsSchema);
      } catch (error) {
        // A Zod upgrade that breaks axis derivation must be visible, not silent.
        console.error(`axis derivation failed for ${tool.id}: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
    return {
      id: tool.id,
      name: tool.name,
      modality: tool.modality,
      section: toolSection(tool),
      acceptedInputs: [...tool.acceptedInputs],
      executionHint: tool.executionHint,
      outputModality: tool.outputModality,
      isAI: aiTools.has(tool.id),
      registered: registeredIds.has(tool.id),
      maxInputs: config?.maxInputs,
      inputKinds: config?.inputKinds,
      skipStructuralValidation: config?.skipStructuralValidation,
      axes,
      invalidProbes: invalidProbesFor(axes, bounds),
    };
  });

  const outPath = join(import.meta.dirname, "tool-contract.json");
  writeFileSync(outPath, `${JSON.stringify(contracts, null, 2)}\n`);

  const bySection: Record<string, number> = {};
  for (const contract of contracts) {
    bySection[contract.section] = (bySection[contract.section] ?? 0) + 1;
  }
  console.log(`wrote ${contracts.length} tool contracts to ${outPath}`);
  console.log("by section:", JSON.stringify(bySection));
  console.log("registered (process-fn):", contracts.filter((c) => c.registered).length);
  console.log("registry-exempt:", contracts.filter((c) => !c.registered).length);
  console.log("AI:", contracts.filter((c) => c.isAI).length);
  console.log("with derived axes:", contracts.filter((c) => c.axes.length > 0).length);
  console.log(
    "total axis values:",
    contracts.reduce((sum, c) => sum + c.axes.reduce((n, a) => n + a.values.length, 0), 0),
  );
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(2);
});
