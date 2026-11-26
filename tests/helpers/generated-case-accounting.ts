interface FeatureUnavailableInput {
  toolId: string;
  statusCode: number;
  code?: unknown;
  requireAiFeatures: boolean;
}

export interface GeneratedCaseSummary {
  attempted: number;
  accepted: number;
  rejected: number;
  skipped: number;
  skips: GeneratedSkipSummary[];
}

export const GENERATED_SKIP_CATEGORIES = [
  "optional-feature",
  "missing-fixture",
  "missing-tool-config",
  "unsupported-generator",
  // CI integration shards ship qpdf and ghostscript but deliberately not
  // ffmpeg, so every media tool is unrunnable there for a reason that says
  // nothing about the product. Without a category for it those cases fall
  // outside the accounting, the contract sees zero accepted cases, and the gate
  // goes red in CI while passing on any machine that has ffmpeg installed.
  "missing-host-binary",
] as const;

/**
 * True when a response says the host has no processing engine.
 *
 * Three shapes, because the gap surfaces at three depths. Input validation
 * refuses up front with 503 ENGINE_UNAVAILABLE. A tool whose input needs no
 * probing is admitted and fails inside the sync window, which returns 422 with
 * the worker's detail. And the engine itself words it two ways: "binary not
 * found" when nothing is on PATH, or a spawn ENOENT when a configured path does
 * not exist. Matching only the first is how a local simulation can pass while
 * CI, which has no ffmpeg at all, still fails.
 *
 * Deliberately narrow: a real ffmpeg crash carries an exit code and stderr and
 * has to stay a failure.
 */
export function isEngineUnavailableResponse(statusCode: number, body: string): boolean {
  if (statusCode === 503 && /ENGINE_UNAVAILABLE/.test(body)) return true;
  return isEngineUnavailableFailure(body);
}

/**
 * The same gap seen from the worker instead of the route.
 *
 * A tool whose input needs no probing, images-to-video being the obvious one,
 * is admitted normally and only discovers the missing engine when it is
 * spawned. Match each engine's own "not found" wording, which it raises before
 * spawning anything. The lean docker test image ships without pdfcpu,
 * LibreOffice (soffice), and pandoc as well as ffmpeg, so all four gate the
 * same way. CI shards have no caire, so content-aware-resize gates here too.
 * A real crash carries an exit code and stderr and has to stay a failure.
 */
export function isEngineUnavailableFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/\b(ffmpeg|ffprobe|pdfcpu|soffice|pandoc|caire)\b[^"]*?\bbinary not found\b/i.test(message)) {
    return true;
  }
  // A job payload carries the worker's fixed sentence, not the cause: it swaps
  // the spawn failure for a SafeError and keeps the program name in `cause`.
  // The lean docker image relies on this for pandoc and the other engines it
  // does not ship (#4099).
  if (
    /Processing is unavailable on this server because a required engine binary could not be started/i.test(
      message,
    )
  ) {
    return true;
  }
  return /spawn\s+\S*(ffmpeg|ffprobe|pdfcpu|soffice|pandoc)\S*\s+ENOENT/i.test(message);
}

/** The parts of a settled job row that say how it ended. */
export interface SettledJobOutcome {
  status: string;
  error: unknown;
}

/**
 * True when an accepted job failed because the worker refused its input.
 *
 * A long tool answers 202, so a file it correctly refuses never comes back as
 * a 4xx response: the job fails, and the worker records the status the sync
 * route would have sent on the failed row (`failureStatus` in
 * apps/api/src/jobs/worker-shared.ts). pdf-to-word refusing a scanned PDF is
 * the case that made this matter (#5038). Read the recorded status, never the
 * message, since the copy gets reworded. Only a 4xx the matrix already allows
 * counts; a server fault or a failure with no recorded status stays a failure.
 */
export function isRecordedRejection(
  row: SettledJobOutcome | undefined,
  allowedStatuses: ReadonlySet<number>,
): boolean {
  if (row?.status !== "failed") return false;
  const httpStatus = (row.error as { httpStatus?: unknown } | null)?.httpStatus;
  return (
    typeof httpStatus === "number" &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    allowedStatuses.has(httpStatus)
  );
}

export type GeneratedSkipCategory = (typeof GENERATED_SKIP_CATEGORIES)[number];

export interface GeneratedSkipSummary {
  category: GeneratedSkipCategory;
  reason: string;
  count: number;
}

interface GeneratedCaseAccountingOptions {
  expectedAttempts?: number;
}

/** Per-tool coverage accounting for generated settings and format campaigns. */
export class GeneratedCaseAccounting {
  readonly #toolId: string;
  #attempted = 0;
  #accepted = 0;
  #rejected = 0;
  #skipped = 0;
  readonly #skipCounts = new Map<string, GeneratedSkipSummary>();
  readonly #expectedAttempts: number | undefined;

  constructor(toolId: string, options: GeneratedCaseAccountingOptions = {}) {
    this.#toolId = toolId;
    this.#expectedAttempts = options.expectedAttempts;
  }

  attempt(): void {
    this.#attempted += 1;
  }

  accept(): void {
    this.#accepted += 1;
  }

  reject(): void {
    this.#rejected += 1;
  }

  skip(category: GeneratedSkipCategory, reason: string): void {
    if (
      !GENERATED_SKIP_CATEGORIES.includes(category) ||
      reason.length === 0 ||
      reason.length > 240
    ) {
      throw new Error(`${this.#toolId}: generated skip reason must be 1-240 characters`);
    }
    this.#skipped += 1;
    const key = `${category}\u0000${reason}`;
    const current = this.#skipCounts.get(key);
    if (current) current.count += 1;
    else this.#skipCounts.set(key, { category, reason, count: 1 });
  }

  assertCovered(): GeneratedCaseSummary {
    const summary = {
      attempted: this.#attempted,
      accepted: this.#accepted,
      rejected: this.#rejected,
      skipped: this.#skipped,
      skips: [...this.#skipCounts.values()],
    };
    if (this.#expectedAttempts !== undefined && summary.attempted !== this.#expectedAttempts) {
      throw new Error(
        `${this.#toolId}: generated run count mismatch (expected=${this.#expectedAttempts}, attempted=${summary.attempted})`,
      );
    }
    if (summary.attempted !== summary.accepted + summary.rejected + summary.skipped) {
      throw new Error(
        `${this.#toolId}: generated accounting is not conserved (attempted=${summary.attempted}, accepted=${summary.accepted}, rejected=${summary.rejected}, skipped=${summary.skipped})`,
      );
    }
    // A tool the host cannot run was not tested, but it did not regress either,
    // and the shard it runs on is documented as shipping no ffmpeg. Demanding
    // an accepted case there turns a known environment gap into a permanently
    // red gate.
    //
    // Not every case has to be skipped for this to hold: a tool is offered
    // fixtures it legitimately refuses, so images-to-video sees 65 host gaps
    // and 4 clean rejections. Requiring skipped to equal attempted missed that
    // and kept the gate red. What matters is that nothing was accepted, at
    // least one case hit the host gap, and every skip is that gap rather than
    // some other reason.
    //
    // This cannot mask a real failure. A case that actually breaks fails its
    // own assertion long before it reaches the accounting, and `rejected` only
    // ever counts a status the matrix already allows. On a host that has
    // ffmpeg there are no host-gap skips at all, so the branch never opens.
    const fullyGatedOnHost =
      summary.attempted > 0 &&
      summary.skipped > 0 &&
      summary.skips.every((skip) => skip.category === "missing-host-binary");
    if (summary.attempted === 0 || (summary.accepted === 0 && !fullyGatedOnHost)) {
      throw new Error(
        `${this.#toolId}: generated coverage incomplete (attempted=${summary.attempted}, accepted=${summary.accepted}, rejected=${summary.rejected}, skipped=${summary.skipped})`,
      );
    }
    return summary;
  }
}

/**
 * Missing optional AI features are explicit skips in ordinary generated runs,
 * but are failures when the caller declares an installed-feature campaign.
 */
export function featureUnavailableDisposition({
  toolId,
  statusCode,
  code,
  requireAiFeatures,
}: FeatureUnavailableInput): "continue" | "skip" {
  const unavailable =
    statusCode === 501 && (code === "FEATURE_NOT_INSTALLED" || code === "FEATURE_INCOMPATIBLE");
  if (!unavailable) return "continue";
  if (requireAiFeatures) {
    throw new Error(`${toolId}: required AI feature returned 501 ${String(code)}`);
  }
  return "skip";
}

/**
 * AI tools whose only bundle is optional and needed by some settings, not by
 * the tool. smart-crop needs face-detection for mode "face" alone; subject and
 * trim are plain Sharp. A matrix that skips requiredAiGate for these must
 * handle a 501 per request, so each case that needs the bundle meets it on its
 * own (#5206).
 */
export const PER_REQUEST_AI_GATED_TOOLS: ReadonlySet<string> = new Set(["smart-crop"]);

export type RequiredAiGate =
  | { kind: "run" }
  | { kind: "skip"; reason: string }
  | { kind: "fail"; reason: string };

interface RequiredAiGateInput {
  requireAiFeatures: boolean;
  /** First bundle the tool needs that DATA_DIR lacks, or null when none is missing. */
  firstMissingBundle: (toolId: string) => string | null;
  dataDir: string | undefined;
}

/**
 * Whether a generated matrix runs an AI tool. Ordinary runs skip them: each
 * fork's DATA_DIR is fresh, so no bundle is ever installed there. The strict
 * lane (REQUIRE_AI_FEATURES=1, the ubuntu_gpu release preflight) runs them
 * against a provisioned DATA_DIR, and a bundle missing from it fails the tool
 * by name before any request, so a half-provisioned host can't pass.
 */
export function requiredAiGate(
  toolId: string,
  { requireAiFeatures, firstMissingBundle, dataDir }: RequiredAiGateInput,
): RequiredAiGate {
  if (!requireAiFeatures) {
    return {
      kind: "skip",
      reason: `${toolId}: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install`,
    };
  }
  const missing = firstMissingBundle(toolId);
  if (!missing) return { kind: "run" };
  return {
    kind: "fail",
    reason: `${toolId}: REQUIRE_AI_FEATURES=1 but bundle "${missing}" is not installed in DATA_DIR=${dataDir || "(unset)"}`,
  };
}
