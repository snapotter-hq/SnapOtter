import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { stripInternalPaths } from "./errors.js";

const execFileAsync = promisify(execFile);

/** Maximum character length for any single ExifTool tag value. */
const MAX_TAG_VALUE_LENGTH = 10_000;

/** Allowed pattern for ExifTool tag names (alphanumeric, colon, underscore, hyphen). */
const TAG_NAME_PATTERN = /^[a-zA-Z0-9:_-]+$/;

/**
 * Validate and sanitize a tag value: strip null bytes, enforce length limit.
 * Returns the sanitized value or throws if it exceeds the length limit.
 */
export function sanitizeTagValue(value: string, tagName: string): string {
  // Strip null bytes
  const cleaned = value.replace(/\0/g, "");
  if (cleaned.length > MAX_TAG_VALUE_LENGTH) {
    throw new Error(
      `Tag value for "${tagName}" exceeds maximum length of ${MAX_TAG_VALUE_LENGTH} characters`,
    );
  }
  return cleaned;
}

/**
 * Validate a tag name against the allowed pattern.
 * Throws if the name contains invalid characters.
 */
export function validateTagName(name: string): void {
  if (!TAG_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid tag name "${name}": only alphanumeric, colon, underscore, and hyphen are allowed`,
    );
  }
}

/** Grouped metadata returned by ExifTool -json -G */
export interface ExifToolMetadata {
  [group: string]: Record<string, unknown>;
}

/** Structured inspect result for the frontend */
export interface InspectResult {
  filename: string;
  fileSize: number;
  exif: Record<string, unknown> | null;
  iptc: Record<string, unknown> | null;
  xmp: Record<string, unknown> | null;
  gps: Record<string, unknown> | null;
  keywords: string[];
}

let cachedBinary: string | null = null;

async function findExiftool(): Promise<string> {
  if (cachedBinary) return cachedBinary;
  try {
    await execFileAsync("exiftool", ["-ver"], { timeout: 5_000 });
    cachedBinary = "exiftool";
    return "exiftool";
  } catch {
    throw new Error(
      "ExifTool not found. Install libimage-exiftool-perl (Linux) or brew install exiftool (macOS).",
    );
  }
}

/**
 * Read all metadata from an image buffer using ExifTool.
 * Returns grouped metadata sections (EXIF, IPTC, XMP, GPS, etc.)
 */
export async function inspectMetadata(buffer: Buffer, filename: string): Promise<InspectResult> {
  const bin = await findExiftool();
  const safeExt = extname(filename).replace(/[^a-z0-9]/gi, "");
  const suffix = safeExt ? `.${safeExt}` : ".jpg";
  const id = randomUUID();
  const tempPath = join(tmpdir(), `exif-inspect-${id}${suffix}`);

  try {
    await writeFile(tempPath, buffer);
    const { stdout } = await execFileAsync(bin, ["-json", "-G", "-struct", "-n", tempPath], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout);
    const raw = parsed[0] ?? {};

    // Group fields by their ExifTool group prefix (e.g. "EXIF:Artist", "IPTC:Keywords")
    const exif: Record<string, unknown> = {};
    const iptc: Record<string, unknown> = {};
    const xmp: Record<string, unknown> = {};
    const gps: Record<string, unknown> = {};
    const keywords: string[] = [];

    for (const [key, value] of Object.entries(raw)) {
      if (key === "SourceFile") continue;

      const [group, field] = key.includes(":") ? key.split(":", 2) : ["File", key];

      if (group === "EXIF") {
        exif[field] = value;
      } else if (group === "IPTC") {
        if (field === "Keywords") {
          if (Array.isArray(value)) keywords.push(...value.map(String));
          else if (value) keywords.push(String(value));
        }
        iptc[field] = value;
      } else if (group === "XMP") {
        if (field === "Subject") {
          if (Array.isArray(value)) keywords.push(...value.map(String));
        }
        xmp[field] = value;
      } else if (group === "GPS" || group === "Composite") {
        if (field.startsWith("GPS") || field === "GPSPosition") {
          gps[field] = value;
        }
      }
    }

    // Deduplicate keywords
    const uniqueKeywords = [...new Set(keywords)];

    return {
      filename,
      fileSize: buffer.length,
      exif: Object.keys(exif).length > 0 ? exif : null,
      iptc: Object.keys(iptc).length > 0 ? iptc : null,
      xmp: Object.keys(xmp).length > 0 ? xmp : null,
      gps: Object.keys(gps).length > 0 ? gps : null,
      keywords: uniqueKeywords,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(stripInternalPaths(message));
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

/**
 * Write metadata tags to an image buffer using ExifTool.
 * Modifies metadata in-place without re-encoding pixels.
 */
export async function writeMetadata(
  buffer: Buffer,
  filename: string,
  tags: string[],
): Promise<Buffer> {
  if (tags.length === 0) return buffer;

  const bin = await findExiftool();
  const safeExt = extname(filename).replace(/[^a-z0-9]/gi, "");
  const suffix = safeExt ? `.${safeExt}` : ".jpg";
  const id = randomUUID();
  const tempPath = join(tmpdir(), `exif-write-${id}${suffix}`);

  try {
    await writeFile(tempPath, buffer);
    await execFileAsync(bin, ["-overwrite_original", ...tags, tempPath], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return await readFile(tempPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(stripInternalPaths(message));
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function readImageDimensions(
  buffer: Buffer,
  ext?: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const bin = await findExiftool();
    const safeExt = ext?.replace(/[^a-z0-9]/gi, "");
    const suffix = safeExt ? `.${safeExt}` : ".jpg";
    const id = randomUUID();
    const tempPath = join(tmpdir(), `exif-dim-${id}${suffix}`);

    try {
      await writeFile(tempPath, buffer);
      const { stdout } = await execFileAsync(
        bin,
        ["-json", "-ImageWidth", "-ImageHeight", tempPath],
        { timeout: 10_000 },
      );
      const [data] = JSON.parse(stdout);
      if (!data?.ImageWidth || !data?.ImageHeight) return null;
      return { width: data.ImageWidth, height: data.ImageHeight };
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
  } catch {
    return null;
  }
}

/** Settings shape that buildTagArgs accepts */
export interface EditMetadataSettings {
  title?: string;
  author?: string;
  artist?: string;
  copyright?: string;
  imageDescription?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  clearGps?: boolean;
  fieldsToRemove?: string[];
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  keywords?: string[];
  keywordsMode?: "add" | "set";
  dateShift?: string;
  setAllDates?: string;
  iptcTitle?: string;
  iptcHeadline?: string;
  iptcCity?: string;
  iptcState?: string;
  iptcCountry?: string;
}

/**
 * Convert settings object into ExifTool CLI tag arguments.
 * All tag values are sanitized (null bytes stripped, length limited).
 * All tag names in fieldsToRemove are validated against an allowed pattern.
 */
export function buildTagArgs(settings: EditMetadataSettings): string[] {
  const args: string[] = [];

  /** Helper: sanitize a string value before adding as a tag argument. */
  const s = (value: string, tagName: string): string => sanitizeTagValue(value, tagName);

  // Common aliases
  const artist = settings.artist || settings.author;
  const description = settings.imageDescription || settings.title;

  // Basic EXIF fields
  if (artist) args.push(`-Artist=${s(artist, "Artist")}`);
  if (settings.copyright) args.push(`-Copyright=${s(settings.copyright, "Copyright")}`);
  if (description) args.push(`-ImageDescription=${s(description, "ImageDescription")}`);
  if (settings.software) args.push(`-Software=${s(settings.software, "Software")}`);
  if (settings.title) args.push(`-XMP:Title=${s(settings.title, "XMP:Title")}`);

  // Date fields
  if (settings.dateTime) args.push(`-ModifyDate=${s(settings.dateTime, "ModifyDate")}`);
  if (settings.dateTimeOriginal)
    args.push(`-DateTimeOriginal=${s(settings.dateTimeOriginal, "DateTimeOriginal")}`);

  // Date shift (applies to all date fields)
  if (settings.dateShift) {
    const cleaned = s(settings.dateShift, "dateShift");
    const direction = cleaned.startsWith("-") ? "-" : "+";
    const value = cleaned.replace(/^[+-]/, "");
    args.push(`-AllDates${direction}=0:0:0 ${value}:0`);
  }

  // Set all dates to a specific value
  if (settings.setAllDates) {
    args.push(`-AllDates=${s(settings.setAllDates, "setAllDates")}`);
  }

  // GPS coordinates
  if (settings.clearGps) {
    args.push("-gps:all=");
  } else if (settings.gpsLatitude !== undefined && settings.gpsLongitude !== undefined) {
    const lat = settings.gpsLatitude;
    const lon = settings.gpsLongitude;
    args.push(`-GPSLatitude=${Math.abs(lat)}`);
    args.push(`-GPSLatitudeRef=${lat >= 0 ? "N" : "S"}`);
    args.push(`-GPSLongitude=${Math.abs(lon)}`);
    args.push(`-GPSLongitudeRef=${lon >= 0 ? "E" : "W"}`);
    if (settings.gpsAltitude !== undefined) {
      args.push(`-GPSAltitude=${Math.abs(settings.gpsAltitude)}`);
      args.push(
        `-GPSAltitudeRef=${settings.gpsAltitude >= 0 ? "Above Sea Level" : "Below Sea Level"}`,
      );
    }
  }

  // Keywords
  if (settings.keywords && settings.keywords.length > 0) {
    if (settings.keywordsMode === "set") {
      // Clear existing first, then set new ones
      args.push("-IPTC:Keywords=");
      args.push("-XMP:Subject=");
    }
    for (const kw of settings.keywords) {
      const trimmed = s(kw, "keyword").trim();
      if (trimmed) {
        args.push(`-IPTC:Keywords+=${trimmed}`);
        args.push(`-XMP:Subject+=${trimmed}`);
      }
    }
  }

  // IPTC fields
  if (settings.iptcTitle) args.push(`-IPTC:ObjectName=${s(settings.iptcTitle, "IPTC:ObjectName")}`);
  if (settings.iptcHeadline)
    args.push(`-IPTC:Headline=${s(settings.iptcHeadline, "IPTC:Headline")}`);
  if (settings.iptcCity) args.push(`-IPTC:City=${s(settings.iptcCity, "IPTC:City")}`);
  if (settings.iptcState)
    args.push(`-IPTC:Province-State=${s(settings.iptcState, "IPTC:Province-State")}`);
  if (settings.iptcCountry)
    args.push(
      `-IPTC:Country-PrimaryLocationName=${s(settings.iptcCountry, "IPTC:Country-PrimaryLocationName")}`,
    );

  // Field removal -- validate tag names against allowed pattern
  if (settings.fieldsToRemove && settings.fieldsToRemove.length > 0) {
    for (const field of settings.fieldsToRemove) {
      validateTagName(field);
      args.push(`-${field}=`);
    }
  }

  return args;
}
