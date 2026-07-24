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
}

/** Per-tool coverage accounting for generated settings and format campaigns. */
export class GeneratedCaseAccounting {
  readonly #toolId: string;
  #attempted = 0;
  #accepted = 0;
  #rejected = 0;
  #prerequisiteSkipped = false;

  constructor(toolId: string) {
    this.#toolId = toolId;
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

  prerequisiteSkip(): void {
    this.#prerequisiteSkipped = true;
  }

  assertCovered(): GeneratedCaseSummary {
    const summary = {
      attempted: this.#attempted,
      accepted: this.#accepted,
      rejected: this.#rejected,
    };
    if (!this.#prerequisiteSkipped && (summary.attempted === 0 || summary.accepted === 0)) {
      throw new Error(
        `${this.#toolId}: generated coverage incomplete (attempted=${summary.attempted}, accepted=${summary.accepted}, rejected=${summary.rejected})`,
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
