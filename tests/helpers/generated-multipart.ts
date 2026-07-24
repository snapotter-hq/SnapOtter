export interface GeneratedMultipartFixture {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface GeneratedMultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  content: Buffer | string;
}

interface CompanionFixtures {
  image: GeneratedMultipartFixture;
  audio: GeneratedMultipartFixture;
  subtitle: GeneratedMultipartFixture;
}

interface GeneratedMultipartOptions {
  toolId: string;
  primary: GeneratedMultipartFixture;
  settings: unknown;
  companions: CompanionFixtures;
}

const REPEATED_IMAGE_TOOLS = new Set([
  "sprite-sheet",
  "stitch",
  "images-to-video",
  "compare",
  "find-duplicates",
  "collage",
]);

function fileField(fixture: GeneratedMultipartFixture, name = "file"): GeneratedMultipartField {
  return {
    name,
    filename: fixture.filename,
    contentType: fixture.contentType ?? "application/octet-stream",
    content: fixture.content,
  };
}

/** Build route-aware multipart payloads for generated HTTP campaigns. */
export function buildGeneratedMultipartFields({
  toolId,
  primary,
  settings,
  companions,
}: GeneratedMultipartOptions): GeneratedMultipartField[] {
  if (toolId === "sign-pdf") {
    return [
      fileField(primary),
      fileField(companions.image, "sig0"),
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.25, h: 0.1 }]),
      },
    ];
  }

  const fields: GeneratedMultipartField[] = [fileField(primary)];
  if (REPEATED_IMAGE_TOOLS.has(toolId)) fields.push(fileField(companions.image));
  if (toolId === "merge-audio" || toolId === "replace-audio") {
    fields.push(fileField(companions.audio));
  }
  if (toolId === "burn-subtitles" || toolId === "embed-subtitles") {
    fields.push(fileField(companions.subtitle));
  }
  if (toolId === "watermark-image") fields.push(fileField(companions.image, "watermark"));
  if (toolId === "compose") fields.push(fileField(companions.image, "overlay"));

  const effectiveSettings =
    toolId === "collage" && typeof settings === "object" && settings !== null
      ? { templateId: "2-h-equal", ...settings }
      : settings;
  fields.push({ name: "settings", content: JSON.stringify(effectiveSettings) });
  return fields;
}
