import exifReader from "exif-reader";
import sharp from "sharp";
import type { ImageInfo } from "../types.js";

/**
 * Extract comprehensive image metadata from a buffer.
 */
export async function getImageInfo(buffer: Buffer): Promise<ImageInfo> {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    channels: metadata.channels ?? 0,
    size: buffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
    metadata: {
      space: metadata.space,
      density: metadata.density,
      isProgressive: metadata.isProgressive,
      hasProfile: metadata.hasProfile,
      orientation: metadata.orientation,
      exif: !!metadata.exif,
      icc: !!metadata.icc,
      xmp: !!metadata.xmp,
    },
  };
}

/**
 * Serialize a value for JSON - convert Buffers/Dates and drop overly large blobs.
 */
export function sanitizeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) {
    if (v.length > 256) return `<binary ${v.length} bytes>`;
    return Array.from(v);
  }
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

/**
 * Parse an EXIF buffer into sanitized sections.
 */
export function parseExif(exifBuffer: Buffer): {
  image: Record<string, unknown>;
  photo: Record<string, unknown>;
  iop: Record<string, unknown>;
  gps: Record<string, unknown>;
} {
  const result = {
    image: {} as Record<string, unknown>,
    photo: {} as Record<string, unknown>,
    iop: {} as Record<string, unknown>,
    gps: {} as Record<string, unknown>,
  };

  if (!exifBuffer || exifBuffer.length === 0) return result;

  try {
    const parsed = exifReader(exifBuffer);

    if (parsed.Image) {
      for (const [k, v] of Object.entries(parsed.Image)) {
        result.image[k] = sanitizeValue(v);
      }
    }
    if (parsed.Photo) {
      for (const [k, v] of Object.entries(parsed.Photo)) {
        result.photo[k] = sanitizeValue(v);
      }
    }
    if (parsed.Iop) {
      for (const [k, v] of Object.entries(parsed.Iop)) {
        result.iop[k] = sanitizeValue(v);
      }
    }
    if (parsed.GPSInfo) {
      for (const [k, v] of Object.entries(parsed.GPSInfo)) {
        result.gps[k] = sanitizeValue(v);
      }
    }
  } catch {
    // Return empty sections on parse failure
  }

  return result;
}

/**
 * Parse GPS coordinates from EXIF GPSInfo into decimal degrees.
 */
export function parseGps(gps: Record<string, unknown>): {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
} {
  let latitude: number | null = null;
  let longitude: number | null = null;
  let altitude: number | null = null;

  const lat = gps.GPSLatitude as number[] | undefined;
  const latRef = gps.GPSLatitudeRef as string | undefined;
  if (lat && lat.length === 3 && lat.every((v) => typeof v === "number" && !Number.isNaN(v))) {
    latitude = lat[0] + lat[1] / 60 + lat[2] / 3600;
    if (latRef === "S") latitude = -latitude;
  }

  const lon = gps.GPSLongitude as number[] | undefined;
  const lonRef = gps.GPSLongitudeRef as string | undefined;
  if (lon && lon.length === 3 && lon.every((v) => typeof v === "number" && !Number.isNaN(v))) {
    longitude = lon[0] + lon[1] / 60 + lon[2] / 3600;
    if (lonRef === "W") longitude = -longitude;
  }

  if (typeof gps.GPSAltitude === "number" && !Number.isNaN(gps.GPSAltitude)) {
    altitude = gps.GPSAltitude;
    if (gps.GPSAltitudeRef === 1) altitude = -altitude;
  }

  return { latitude, longitude, altitude };
}

/**
 * Parse XMP XML buffer into key-value pairs.
 */
export function parseXmp(xmpBuffer: Buffer): Record<string, string> {
  const xml = xmpBuffer.toString("utf-8");
  const result: Record<string, string> = {};

  for (const match of xml.matchAll(/(\w+:\w+)="([^"]+)"/g)) {
    const key = match[1];
    if (key.startsWith("xmlns:") || key.startsWith("rdf:")) continue;
    result[key] = match[2];
  }

  return result;
}
