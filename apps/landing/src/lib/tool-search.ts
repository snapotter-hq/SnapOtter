import { normalizeSearchQuery } from "@snapotter/shared/search/format-aliases.js";

export type ModalityFilter =
  | "all"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "file"
  | "document,file";

type ToolModality = Exclude<ModalityFilter, "all" | "document,file">;

export type ToolSearchItem = {
  id: string;
  name: string;
  description: string;
  modality: ToolModality;
  category: string;
  url: string;
  icon: string;
  iconSvg: string;
  color: string;
  acceptedInputs: string[];
  outputModality?: ToolModality;
  keywords?: string[];
  workflowAliases?: string[];
};

export type ToolSearchResult = {
  item: ToolSearchItem;
  score: number;
  reason: string;
};

export type ToolSearchResponse = {
  results: ToolSearchResult[];
  related: ToolSearchResult[];
  totalMatches: number;
  hasConfidentMatch: boolean;
};

type SearchField = {
  label: "name" | "keyword" | "description" | "input" | "metadata";
  text: string;
  tokens: string[];
  phraseScore: number;
  tokenScore: number;
  fuzzyScore: number;
};

type ConversionDirection = {
  sourceToken?: string;
  destinationToken?: string;
  isConversionIntent: boolean;
  isNoopConversion: boolean;
};

const TASK_ALIAS_GROUPS = [
  [
    "remove background",
    "remove bg",
    "background remover",
    "cutout",
    "cut out",
    "transparent",
    "transparent background",
    "transparent png",
  ],
  ["compress", "compression", "reduce size", "reduce file size", "optimize", "optimise", "shrink"],
  ["convert", "conversion", "change format", "change file type", "format converter", "converter"],
  ["merge", "combine", "join"],
  ["split", "extract pages", "separate pages", "page extract"],
  ["metadata", "exif", "gps", "strip metadata", "remove metadata", "clear metadata"],
  ["redact", "redaction", "black out", "hide text"],
  ["transcribe", "transcription", "subtitles", "captions", "speech to text"],
  ["ocr", "extract text", "text extraction", "recognize text", "recognise text"],
  ["batch", "bulk", "multiple files", "many files"],
] as const;

const CONVERSION_ALIASES = [
  "convert",
  "conversion",
  "change format",
  "change file type",
  "format converter",
  "converter",
] as const;

const CONNECTOR_TOKENS = new Set(["to"]);
const CONVERSION_INTENT_TOKENS = new Set(contentTokens(CONVERSION_ALIASES.join(" ")));
const DIRECTION_FILLER_TOKENS = new Set([
  ...CONVERSION_INTENT_TOKENS,
  "a",
  "an",
  "file",
  "files",
  "format",
  "formats",
  "online",
  "the",
  "type",
]);
const KNOWN_CONVERSION_FORMAT_TOKENS = new Set([
  "aac",
  "arw",
  "avi",
  "avif",
  "bmp",
  "cr2",
  "csv",
  "dng",
  "doc",
  "docx",
  "document",
  "eps",
  "excel",
  "flac",
  "gif",
  "heic",
  "heif",
  "html",
  "image",
  "jpeg",
  "jpg",
  "json",
  "markdown",
  "m4a",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "nef",
  "ogg",
  "pdf",
  "png",
  "powerpoint",
  "ppt",
  "pptx",
  "psd",
  "raw",
  "svg",
  "tif",
  "tiff",
  "wav",
  "webm",
  "webp",
  "word",
  "xls",
  "xlsx",
  "xml",
  "zip",
  "audio",
  "audios",
  "documents",
  "file",
  "files",
  "images",
  "video",
  "videos",
]);
const BROAD_CONVERSION_FORMAT_TOKENS = new Set([
  "audio",
  "document",
  "documents",
  "file",
  "files",
  "image",
  "images",
  "video",
]);
const NOOP_FORMAT_ALIAS_GROUPS = [
  ["jpg", "jpeg", "jpe"],
  ["tif", "tiff"],
  ["heic", "heif"],
] as const;
const NOOP_FORMAT_ALIAS_CANONICAL_BY_TOKEN = new Map<string, string>(
  NOOP_FORMAT_ALIAS_GROUPS.flatMap(([canonical, ...aliases]) =>
    [canonical, ...aliases].map((token) => [token, canonical] as const),
  ),
);
const FORMAT_FAMILY_BY_TOKEN = new Map<string, ToolModality>([
  ["arw", "image"],
  ["avif", "image"],
  ["bmp", "image"],
  ["cr2", "image"],
  ["dng", "image"],
  ["eps", "image"],
  ["gif", "image"],
  ["heic", "image"],
  ["heif", "image"],
  ["image", "image"],
  ["jpeg", "image"],
  ["jpg", "image"],
  ["nef", "image"],
  ["png", "image"],
  ["psd", "image"],
  ["raw", "image"],
  ["svg", "image"],
  ["tif", "image"],
  ["tiff", "image"],
  ["webp", "image"],
  ["images", "image"],
  ["aac", "audio"],
  ["audio", "audio"],
  ["audios", "audio"],
  ["flac", "audio"],
  ["m4a", "audio"],
  ["mp3", "audio"],
  ["ogg", "audio"],
  ["wav", "audio"],
  ["avi", "video"],
  ["video", "video"],
  ["videos", "video"],
  ["mkv", "video"],
  ["mov", "video"],
  ["mp4", "video"],
  ["webm", "video"],
  ["csv", "document"],
  ["doc", "document"],
  ["docx", "document"],
  ["document", "document"],
  ["documents", "document"],
  ["excel", "document"],
  ["file", "file"],
  ["files", "file"],
  ["html", "document"],
  ["json", "document"],
  ["markdown", "document"],
  ["pdf", "document"],
  ["powerpoint", "document"],
  ["ppt", "document"],
  ["pptx", "document"],
  ["word", "document"],
  ["xls", "document"],
  ["xlsx", "document"],
  ["xml", "document"],
]);
const RESULT_SCORE_THRESHOLD = 12;
const RELATED_SCORE_THRESHOLD = 6;
const CONFIDENT_SCORE_THRESHOLD = 40;
const ACTION_VERB_TOKENS = new Set(["add", "apply", "insert"]);
const PARTIAL_PHRASE_STOP_TOKENS = new Set([
  "a",
  "an",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "onto",
  "the",
  "to",
  "with",
]);

/** Bounded Levenshtein: returns edit distance, short-circuiting above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function plainNormalize(value: string): string {
  return compactWhitespace(
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[/_.:+#()[\]{},]+/g, " ")
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeForField(value: string): string[] {
  return unique([plainNormalize(value), normalizeSearchQuery(value)]);
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function contentTokens(value: string): string[] {
  return tokenize(value).filter((token) => !CONNECTOR_TOKENS.has(token));
}

function normalizeBroadFormatToken(token: string): string {
  const broadAliases: Record<string, string> = {
    audios: "audio",
    documents: "document",
    files: "file",
    images: "image",
    videos: "video",
  };
  return broadAliases[token] ?? token;
}

function normalizeNoopFormatAliasToken(token: string): string {
  return NOOP_FORMAT_ALIAS_CANONICAL_BY_TOKEN.get(token) ?? token;
}

function expandCompactConversionToken(token: string): string {
  const match = token.match(/^([a-z0-9]+)(?:2|to)([a-z0-9]+)$/);
  if (!match) return token;

  const [, sourceToken, destinationToken] = match;
  if (
    sourceToken &&
    destinationToken &&
    isConcreteConversionFormatToken(sourceToken) &&
    isConcreteConversionFormatToken(destinationToken)
  ) {
    return `${sourceToken} to ${destinationToken}`;
  }

  return token;
}

function normalizeDirectionToken(token: string): string {
  if (token === "to" || token === "from") return token;
  return normalizeBroadFormatToken(normalizeNoopFormatAliasToken(token));
}

function isDirectionContentToken(token: string): boolean {
  return token !== "from" && !CONNECTOR_TOKENS.has(token) && !DIRECTION_FILLER_TOKENS.has(token);
}

function isKnownConversionFormatToken(token: string): boolean {
  return KNOWN_CONVERSION_FORMAT_TOKENS.has(token);
}

function isConcreteConversionFormatToken(token: string): boolean {
  return isKnownConversionFormatToken(token) && !BROAD_CONVERSION_FORMAT_TOKENS.has(token);
}

function isBroadConversionFormatToken(token: string): boolean {
  return BROAD_CONVERSION_FORMAT_TOKENS.has(token);
}

function formatFamily(token: string): ToolModality | undefined {
  return FORMAT_FAMILY_BY_TOKEN.get(token);
}

function isFormatToFormatDirection({
  sourceToken,
  destinationToken,
}: Pick<ConversionDirection, "sourceToken" | "destinationToken">): boolean {
  return Boolean(
    sourceToken &&
      destinationToken &&
      isKnownConversionFormatToken(sourceToken) &&
      isKnownConversionFormatToken(destinationToken),
  );
}

function isNoopFormatDirection({
  sourceToken,
  destinationToken,
}: Pick<ConversionDirection, "sourceToken" | "destinationToken">): boolean {
  return Boolean(
    sourceToken &&
      destinationToken &&
      isKnownConversionFormatToken(sourceToken) &&
      isKnownConversionFormatToken(destinationToken) &&
      NOOP_FORMAT_ALIAS_CANONICAL_BY_TOKEN.has(sourceToken) &&
      NOOP_FORMAT_ALIAS_CANONICAL_BY_TOKEN.has(destinationToken) &&
      normalizeNoopFormatAliasToken(sourceToken) ===
        normalizeNoopFormatAliasToken(destinationToken),
  );
}

function parseConversionDirection(
  rawQuery: string,
  hasConversionAlias: boolean,
): ConversionDirection {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const tokens = [plainNormalize(rawQuery), normalizedQuery ? plainNormalize(normalizedQuery) : ""]
    .filter(Boolean)
    .flatMap((value) =>
      tokenize(value).flatMap((token) =>
        tokenize(expandCompactConversionToken(token)).map(normalizeDirectionToken),
      ),
    );
  const toIndex = tokens.indexOf("to");
  const fromIndex = tokens.indexOf("from");

  if (toIndex !== -1) {
    const sourceToken = tokens.slice(0, toIndex).filter(isDirectionContentToken).at(-1);
    const destinationToken = tokens.slice(toIndex + 1).find(isDirectionContentToken);
    const isNoopConversion = isNoopFormatDirection({ sourceToken, destinationToken });
    return {
      sourceToken,
      destinationToken,
      isNoopConversion,
      isConversionIntent:
        !isNoopConversion &&
        (hasConversionAlias || isFormatToFormatDirection({ sourceToken, destinationToken })),
    };
  }

  if (fromIndex !== -1) {
    const destinationToken = tokens.slice(0, fromIndex).filter(isDirectionContentToken).at(-1);
    const sourceToken = tokens.slice(fromIndex + 1).find(isDirectionContentToken);
    const isNoopConversion = isNoopFormatDirection({ sourceToken, destinationToken });
    return {
      sourceToken,
      destinationToken,
      isNoopConversion,
      isConversionIntent:
        !isNoopConversion &&
        (hasConversionAlias || isFormatToFormatDirection({ sourceToken, destinationToken })),
    };
  }

  return { isConversionIntent: hasConversionAlias, isNoopConversion: false };
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function aliasExpansionsFor(values: string[]): string[] {
  const haystack = ` ${unique(values.flatMap(normalizeForField)).join(" ")} `;
  const expansions: string[] = [];

  for (const aliases of TASK_ALIAS_GROUPS) {
    const normalizedAliases = unique(aliases.map((alias) => plainNormalize(alias)));
    const hasAlias = normalizedAliases.some((alias) => containsPhrase(haystack, alias));

    if (hasAlias) {
      expansions.push(...normalizedAliases);
    }
  }

  return unique(expansions);
}

function makeSearchText(values: string[]): string {
  return unique(values.flatMap(normalizeForField)).join(" ");
}

function makeSearchField(
  label: SearchField["label"],
  values: string[],
  weights: Pick<SearchField, "phraseScore" | "tokenScore" | "fuzzyScore">,
): SearchField {
  const text = makeSearchText(values);
  return {
    label,
    text,
    tokens: tokenize(text),
    ...weights,
  };
}

function fuzzyTokenMatch(token: string, words: string[]): boolean {
  if (token.length < 3) return false;
  const max = token.length <= 4 ? 1 : 2;
  return words.some((word) => editDistance(token, word, max) <= max);
}

function meaningfulPhraseSegments(value: string): string[][] {
  const segments: string[][] = [];
  let currentSegment: string[] = [];

  for (const token of tokenize(value)) {
    if (PARTIAL_PHRASE_STOP_TOKENS.has(token)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }
    currentSegment.push(token);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

function consecutiveQueryPhrases(values: string[]): string[] {
  const phrases: string[] = [];

  for (const value of values) {
    for (const segment of meaningfulPhraseSegments(value)) {
      for (let start = 0; start < segment.length; start++) {
        const maxLength = Math.min(3, segment.length - start);
        for (let length = 2; length <= maxLength; length++) {
          phrases.push(segment.slice(start, start + length).join(" "));
        }
      }
    }
  }

  return unique(phrases);
}

function buildQuery(rawQuery: string): {
  normalized: string;
  phrases: string[];
  partialPhrases: string[];
  tokens: string[];
  requiredTokens: string[];
  hasConversionIntent: boolean;
  conversionTargetTokens: string[];
  conversionDirection: ConversionDirection;
} {
  const raw = plainNormalize(rawQuery);
  const normalized = normalizeSearchQuery(rawQuery);
  const normalizedOrRaw = normalized || raw;
  const basePhrases = unique([raw, normalized]).filter(
    (phrase) => contentTokens(phrase).length > 0,
  );
  const intentAliases = aliasExpansionsFor(basePhrases);
  const hasConversionAlias = intentAliases.some((alias) =>
    CONVERSION_ALIASES.includes(alias as (typeof CONVERSION_ALIASES)[number]),
  );
  const conversionDirection = parseConversionDirection(rawQuery, hasConversionAlias);
  const hasConversionIntent = conversionDirection.isConversionIntent;
  const phrases = basePhrases;
  const partialPhrases = consecutiveQueryPhrases(basePhrases).filter(
    (phrase) => !phrases.includes(phrase),
  );
  const tokens = unique(contentTokens(basePhrases.join(" ")).map(normalizeBroadFormatToken));
  const requiredTokens = unique(
    contentTokens(basePhrases.join(" ")).map(normalizeBroadFormatToken),
  );
  const conversionTargetTokens = hasConversionIntent
    ? requiredTokens.filter((token) => !CONVERSION_INTENT_TOKENS.has(token))
    : [];

  return {
    normalized: normalizedOrRaw,
    phrases,
    partialPhrases,
    tokens,
    requiredTokens,
    hasConversionIntent,
    conversionTargetTokens,
    conversionDirection,
  };
}

function matchesModality(item: ToolSearchItem, modality: ModalityFilter): boolean {
  if (modality === "all") return true;
  if (modality === "document,file") {
    return item.modality === "document" || item.modality === "file";
  }
  return item.modality === modality;
}

function compareResults(a: ToolSearchResult, b: ToolSearchResult): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id);
}

function fieldContainsToken(field: SearchField, token: string): boolean {
  return field.tokens.includes(token) || containsPhrase(field.text, token);
}

function fieldContainsAnyToken(fields: SearchField[], tokens: Iterable<string>): boolean {
  for (const token of tokens) {
    if (fields.some((field) => fieldContainsToken(field, token))) {
      return true;
    }
  }
  return false;
}

function hasKnownFormatDirectionPhrase(field: SearchField): boolean {
  return field.tokens.some((token, index) => {
    const source = field.tokens[index - 1];
    const destination = field.tokens[index + 1];

    return (
      token === "to" &&
      Boolean(source) &&
      Boolean(destination) &&
      KNOWN_CONVERSION_FORMAT_TOKENS.has(normalizeBroadFormatToken(source)) &&
      KNOWN_CONVERSION_FORMAT_TOKENS.has(normalizeBroadFormatToken(destination))
    );
  });
}

function hasConverterIdentity(fields: SearchField[]): boolean {
  return (
    fieldContainsAnyToken(fields, ["convert", "converter", "conversion"]) ||
    fields.some(hasKnownFormatDirectionPhrase)
  );
}

function hasOutputFamilyExtractionIdentity(
  item: ToolSearchItem,
  identityFields: SearchField[],
  { sourceToken, destinationToken }: ConversionDirection,
): boolean {
  if (!sourceToken || !destinationToken) return false;

  const sourceFamily = formatFamily(sourceToken);
  const destinationFamily = formatFamily(destinationToken);
  return Boolean(
    sourceFamily &&
      destinationFamily &&
      sourceFamily !== destinationFamily &&
      item.outputModality === destinationFamily &&
      fieldContainsAnyToken(identityFields, ["extract"]) &&
      fieldContainsAnyToken(identityFields, [destinationFamily]),
  );
}

function hasBroadAcceptedInputsForFamily(inputField: SearchField, family: ToolModality): boolean {
  const familyTokens = unique(
    [...FORMAT_FAMILY_BY_TOKEN.entries()]
      .filter(([, tokenFamily]) => tokenFamily === family)
      .map(([token]) => token),
  );
  const matchingInputCount = familyTokens.filter((token) =>
    fieldContainsToken(inputField, token),
  ).length;

  return matchingInputCount >= 3;
}

function supportsInputFormat(
  item: ToolSearchItem,
  inputField: SearchField,
  token: string,
): boolean {
  const family = formatFamily(token);
  return (
    fieldContainsToken(inputField, token) ||
    Boolean(family && isBroadConversionFormatToken(token) && item.modality === family) ||
    Boolean(
      family && item.modality === family && hasBroadAcceptedInputsForFamily(inputField, family),
    )
  );
}

function supportsOutputFormat(
  item: ToolSearchItem,
  fields: SearchField[],
  inputField: SearchField,
  token: string,
): boolean {
  const family = formatFamily(token);
  return (
    fields.some(
      (field) =>
        ["name", "keyword", "input", "metadata"].includes(field.label) &&
        fieldContainsToken(field, token),
    ) ||
    Boolean(
      family && item.modality === family && hasBroadAcceptedInputsForFamily(inputField, family),
    )
  );
}

function matchesGenericConversionDirection(
  item: ToolSearchItem,
  fields: SearchField[],
  inputField: SearchField,
  idField: SearchField,
  {
    sourceToken,
    destinationToken,
  }: Required<Pick<ConversionDirection, "sourceToken" | "destinationToken">>,
): boolean {
  return (
    !containsPhrase(idField.text, "to") &&
    supportsInputFormat(item, inputField, sourceToken) &&
    supportsOutputFormat(item, fields, inputField, destinationToken)
  );
}

function matchesBroadSourceConversionDirection(
  item: ToolSearchItem,
  inputField: SearchField,
  text: string,
  {
    sourceToken,
    destinationToken,
  }: Required<Pick<ConversionDirection, "sourceToken" | "destinationToken">>,
): boolean {
  const sourceFamily = formatFamily(sourceToken);
  return Boolean(
    sourceFamily &&
      isBroadConversionFormatToken(sourceToken) &&
      item.modality === sourceFamily &&
      supportsInputFormat(item, inputField, sourceToken) &&
      matchesDestinationDirection(text, destinationToken),
  );
}

function matchesSourceDirection(text: string, token: string): boolean {
  return containsPhrase(text, `${token} to`);
}

function matchesDestinationDirection(text: string, token: string): boolean {
  return containsPhrase(text, `to ${token}`);
}

function matchesExactDirection(
  text: string,
  {
    sourceToken,
    destinationToken,
  }: Required<Pick<ConversionDirection, "sourceToken" | "destinationToken">>,
): boolean {
  return containsPhrase(text, `${sourceToken} to ${destinationToken}`);
}

function directionTokenMatches(queryToken: string, toolToken: string): boolean {
  const query = normalizeBroadFormatToken(queryToken);
  const tool = normalizeBroadFormatToken(toolToken);
  if (query === tool) return true;

  const queryFamily = formatFamily(query);
  const toolFamily = formatFamily(tool);
  return Boolean(
    queryFamily &&
      toolFamily &&
      queryFamily === toolFamily &&
      (isBroadConversionFormatToken(query) || isBroadConversionFormatToken(tool)),
  );
}

function matchesDirectionByTokenOrFamily(
  text: string,
  {
    sourceToken,
    destinationToken,
  }: Required<Pick<ConversionDirection, "sourceToken" | "destinationToken">>,
): boolean {
  const tokens = tokenize(text).map(normalizeBroadFormatToken);

  return tokens.some((token, index) => {
    const source = tokens[index - 1];
    const destination = tokens[index + 1];

    return (
      token === "to" &&
      Boolean(source) &&
      Boolean(destination) &&
      directionTokenMatches(sourceToken, source) &&
      directionTokenMatches(destinationToken, destination)
    );
  });
}

/** True if every normalized query token appears in the haystack (substring), or matches a haystack word within a small edit distance. */
export function matchTool(rawQuery: string, haystack: string): boolean {
  const q = normalizeSearchQuery(rawQuery);
  if (!q) return true;
  const normalizedHaystack = normalizeSearchQuery(haystack);
  const hay = unique([
    plainNormalize(haystack),
    normalizedHaystack ? plainNormalize(normalizedHaystack) : "",
    tokenize(plainNormalize(haystack))
      .flatMap((token) => tokenize(expandCompactConversionToken(token)))
      .join(" "),
  ]).join(" ");
  const hayWords = tokenize(hay);
  const queryDirection = parseConversionDirection(rawQuery, false);
  const hasConcreteFormatDirection = Boolean(
    queryDirection.sourceToken &&
      queryDirection.destinationToken &&
      isConcreteConversionFormatToken(queryDirection.sourceToken) &&
      isConcreteConversionFormatToken(queryDirection.destinationToken),
  );
  const tokens = q.split(/\s+/).filter(Boolean);
  if (hasConcreteFormatDirection) {
    const direction = {
      sourceToken: queryDirection.sourceToken ?? "",
      destinationToken: queryDirection.destinationToken ?? "",
    };
    if (!matchesExactDirection(hay, direction)) {
      return false;
    }
  }

  return tokens.every((tok) => {
    if (tok === "to") return true;
    if (isConcreteConversionFormatToken(tok)) {
      if (hayWords.includes(tok)) return true;
      return false;
    }
    if (hay.indexOf(tok) !== -1) return true;
    const max = tok.length <= 4 ? 1 : 2;
    return hayWords.some((w) => editDistance(tok, w, max) <= max);
  });
}

export function scoreTool(rawQuery: string, item: ToolSearchItem): ToolSearchResult {
  const query = buildQuery(rawQuery);

  if (!query.normalized) {
    return { item, score: 0, reason: "empty query" };
  }
  if (query.conversionDirection.isNoopConversion) {
    return { item, score: 0, reason: "same-format conversion" };
  }

  const inputField = makeSearchField("input", item.acceptedInputs, {
    phraseScore: 25,
    tokenScore: 9,
    fuzzyScore: 0,
  });
  const nameField = makeSearchField("name", [item.name], {
    phraseScore: 70,
    tokenScore: 16,
    fuzzyScore: 10,
  });
  const keywordField = makeSearchField(
    "keyword",
    [...(item.keywords ?? []), ...(item.workflowAliases ?? [])],
    {
      phraseScore: 60,
      tokenScore: 14,
      fuzzyScore: 8,
    },
  );
  const descriptionField = makeSearchField("description", [item.description], {
    phraseScore: 35,
    tokenScore: 7,
    fuzzyScore: 0,
  });
  const metadataField = makeSearchField(
    "metadata",
    [item.id, item.category, item.modality, item.outputModality ?? ""],
    { phraseScore: 18, tokenScore: 5, fuzzyScore: 0 },
  );
  const fields: SearchField[] = [
    nameField,
    keywordField,
    descriptionField,
    inputField,
    metadataField,
  ];

  const strongConversionFields = fields.filter((field) =>
    ["name", "keyword", "input"].includes(field.label),
  );
  const idField = makeSearchField("metadata", [item.id], {
    phraseScore: 0,
    tokenScore: 0,
    fuzzyScore: 0,
  });
  const directionText = makeSearchText([item.id, item.name, ...(item.keywords ?? [])]);
  const matchedConversionTargets = query.conversionTargetTokens.filter((token) =>
    [...strongConversionFields, idField].some((field) => fieldContainsToken(field, token)),
  );
  const identityFields = [idField, nameField, keywordField];
  const hasConversionCapability =
    hasConverterIdentity(identityFields) ||
    hasOutputFamilyExtractionIdentity(item, identityFields, query.conversionDirection);

  if (query.hasConversionIntent && query.conversionTargetTokens.length > 0) {
    if (!hasConversionCapability) {
      return { item, score: 0, reason: "conversion capability mismatch" };
    }
    if (query.conversionDirection.sourceToken && query.conversionDirection.destinationToken) {
      const direction = {
        sourceToken: query.conversionDirection.sourceToken,
        destinationToken: query.conversionDirection.destinationToken,
      };
      const hasDirectionMatch =
        matchesDirectionByTokenOrFamily(directionText, direction) ||
        matchesExactDirection(directionText, direction) ||
        matchesBroadSourceConversionDirection(item, inputField, directionText, direction) ||
        matchesGenericConversionDirection(item, fields, inputField, idField, direction);

      if (!hasDirectionMatch) {
        return { item, score: 0, reason: "conversion direction mismatch" };
      }
    } else if (query.conversionDirection.destinationToken) {
      if (!matchesDestinationDirection(directionText, query.conversionDirection.destinationToken)) {
        return { item, score: 0, reason: "conversion destination mismatch" };
      }
    } else if (query.conversionDirection.sourceToken) {
      if (!matchesSourceDirection(directionText, query.conversionDirection.sourceToken)) {
        return { item, score: 0, reason: "conversion source mismatch" };
      }
    }
    if (matchedConversionTargets.length === 0) {
      return { item, score: 0, reason: "conversion target mismatch" };
    }
  }

  let score = 0;
  const reasons = new Set<string>();
  const matchedRequiredTokens = new Set<string>();

  const exactNameQueries = normalizeForField(item.name);
  if (exactNameQueries.includes(query.normalized)) {
    score += 100;
    reasons.add("name exact match");
  }

  for (const phrase of query.phrases) {
    for (const field of fields) {
      if (containsPhrase(field.text, phrase)) {
        score += field.phraseScore;
        reasons.add(`${field.label} match`);
      }
    }
  }

  for (const phrase of query.partialPhrases) {
    for (const field of fields) {
      if (
        (field.label === "name" || field.label === "keyword") &&
        containsPhrase(field.text, phrase)
      ) {
        score += Math.ceil(field.phraseScore / 2);
        reasons.add(`${field.label} phrase match`);
      }
    }
  }

  for (const token of query.tokens) {
    let bestScore = 0;
    let bestReason = "";

    for (const field of fields) {
      if (field.tokens.includes(token) && field.tokenScore > bestScore) {
        bestScore = field.tokenScore;
        bestReason = `${field.label} token match`;
      } else if (
        field.fuzzyScore > 0 &&
        fuzzyTokenMatch(token, field.tokens) &&
        field.fuzzyScore > bestScore
      ) {
        bestScore = field.fuzzyScore;
        bestReason = `${field.label} fuzzy match`;
      }
    }

    if (bestScore > 0) {
      score += bestScore;
      reasons.add(bestReason);
      if (query.requiredTokens.includes(token)) {
        matchedRequiredTokens.add(token);
      }
    }
  }

  if (matchedConversionTargets.length > 0) {
    score += matchedConversionTargets.length * 40;
    reasons.add("conversion target match");
  }
  const matchedActionTokens = query.tokens.filter(
    (token) =>
      ACTION_VERB_TOKENS.has(token) && fields.some((field) => fieldContainsToken(field, token)),
  );
  if (matchedActionTokens.length > 0) {
    score += matchedActionTokens.length * 12;
    reasons.add("action match");
  }
  if (
    query.hasConversionIntent &&
    query.conversionDirection.sourceToken &&
    query.conversionDirection.destinationToken
  ) {
    score += 100;
    reasons.add("conversion direction match");
  } else if (
    query.hasConversionIntent &&
    (query.conversionDirection.sourceToken || query.conversionDirection.destinationToken)
  ) {
    score += 80;
    reasons.add("conversion direction match");
  }

  if (
    score > 0 &&
    query.requiredTokens.length > 1 &&
    matchedRequiredTokens.size / query.requiredTokens.length < 0.5
  ) {
    return { item, score: 0, reason: "insufficient token match" };
  }

  return {
    item,
    score,
    reason: reasons.values().next().value ?? "no match",
  };
}

export function searchTools(
  items: ToolSearchItem[],
  {
    query,
    modality,
    limit,
  }: {
    query: string;
    modality: ModalityFilter;
    limit: number;
  },
): ToolSearchResponse {
  const boundedLimit = Math.max(0, limit);
  const scored = items
    .map((item) => scoreTool(query, item))
    .filter((result) => matchesModality(result.item, modality));

  if (!compactWhitespace(query)) {
    const defaultResults = scored.slice(0, boundedLimit);
    return {
      results: defaultResults,
      related: [],
      totalMatches: scored.length,
      hasConfidentMatch: false,
    };
  }

  const sorted = [...scored].sort(compareResults);
  const resultMatches = sorted.filter((result) => result.score >= RESULT_SCORE_THRESHOLD);
  const relatedMatches = sorted.filter(
    (result) => result.score >= RELATED_SCORE_THRESHOLD && result.score < RESULT_SCORE_THRESHOLD,
  );

  return {
    results: resultMatches.slice(0, boundedLimit),
    related: relatedMatches.slice(0, boundedLimit),
    totalMatches: resultMatches.length + relatedMatches.length,
    hasConfidentMatch: (sorted[0]?.score ?? 0) >= CONFIDENT_SCORE_THRESHOLD,
  };
}

export function buildToolRequestDiscussionUrl(rawQuery: string): string {
  const normalizedQuery = compactWhitespace(rawQuery);
  const titleQuery = normalizedQuery.slice(0, 120);
  const bodyQuery = normalizedQuery.slice(0, 300);
  const params = new URLSearchParams();

  params.set("category", "ideas");
  params.set("title", titleQuery ? `Tool request: ${titleQuery}` : "Tool request");

  const body = [
    "### Tool request",
    "",
    ...(bodyQuery ? ["I searched SnapOtter for:", "", `> ${bodyQuery}`, ""] : []),
    "Describe the workflow, input files, and output you expected.",
  ].join("\n");

  params.set("body", body);

  return `https://github.com/snapotter-hq/snapotter/discussions/new?${params.toString()}`;
}
