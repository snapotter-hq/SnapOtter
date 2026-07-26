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

/** The API reports an absent processing engine as 503 ENGINE_UNAVAILABLE. */
export function isEngineUnavailableResponse(statusCode: number, body: string): boolean {
  return statusCode === 503 && /ENGINE_UNAVAILABLE/.test(body);
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
    // A tool whose every case was gated because the host has no engine was not
    // tested, but it did not regress either, and the shard it runs on is
    // documented as shipping no ffmpeg. Demanding an accepted case there turns
    // a known environment gap into a permanently red gate. Every other route to
    // zero accepted still fails, including a partial gate, which would
    // otherwise let real failures hide behind one capability skip.
    const fullyGatedOnHost =
      summary.attempted > 0 &&
      summary.skipped === summary.attempted &&
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
