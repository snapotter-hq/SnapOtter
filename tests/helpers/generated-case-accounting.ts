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
] as const;

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
    if (summary.attempted === 0 || summary.accepted === 0) {
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
