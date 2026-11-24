// Hand-written, first-hand content for the tool pages that still earn search
// visits (#4911). Every number here was measured by running the real tool on the
// named sample file; nothing is estimated. Pages without an entry render exactly
// as before.

/** One measured run: the sample that went in and the file that came out. */
export interface ToolRun {
  /** What went in, specific enough to reproduce (source, format, dimensions or length). */
  input: string;
  /** The settings used, as a reader would set them in the app. */
  settings: string;
  /** What came out (format, dimensions or length, anything notable). */
  output: string;
  inputBytes: number;
  outputBytes: number;
}

/** A public sample file the runs used, with its licence. */
export interface SampleSource {
  name: string;
  url: string;
  license: string;
}

/**
 * What a hosted alternative restricts, quoted from that service's own public
 * page. Only include one when the claim was checked on that page.
 */
export interface AlternativesNote {
  text: string;
  sourceName: string;
  sourceUrl: string;
  /** ISO date the page was read. */
  checked: string;
}

export interface ToolContent {
  toolId: string;
  /** Version, settings context, and date of the measurement. */
  testedWith: string;
  runs: ToolRun[];
  steps: string[];
  /** Real limits, taken from the code and from what the runs showed. */
  limits: string[];
  sources: SampleSource[];
  alternatives?: AlternativesNote;
}
