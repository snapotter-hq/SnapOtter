import type { Sharp, StripMetadataOptions } from "../types.js";

type MetadataCarrier = {
  options?: {
    keepMetadata?: number;
    lastStripKeepMetadata?: number;
    withExif?: Record<string, string>;
    withExifMerge?: boolean;
    withIccProfile?: string;
    withXmp?: string;
    withMetadataOrientation?: number;
    withMetadataDensity?: number;
  };
};

export async function stripMetadata(
  image: Sharp,
  options: StripMetadataOptions = {},
): Promise<Sharp> {
  const { stripExif, stripGps, stripIcc, stripXmp, stripAll } = options;

  const shouldStripAll =
    stripAll === true ||
    (stripExif === undefined &&
      stripGps === undefined &&
      stripIcc === undefined &&
      stripXmp === undefined &&
      stripAll === undefined);

  const opts = (image as unknown as MetadataCarrier).options;

  if (shouldStripAll) {
    if (opts) {
      opts.keepMetadata = 0;
      opts.lastStripKeepMetadata = 0;
      opts.withExif = {};
      opts.withExifMerge = true;
      opts.withIccProfile = "";
      opts.withXmp = "";
      opts.withMetadataOrientation = -1;
      opts.withMetadataDensity = 0;
    }
    return image;
  }

  const strippingNothing = !stripExif && !stripGps && !stripIcc && !stripXmp;
  if (strippingNothing) {
    if (opts) {
      opts.lastStripKeepMetadata = undefined;
    }
    return image.withMetadata();
  }

  // Selective stripping: Sharp strips all metadata by default (no calls needed).
  // Reset any prior keepMetadata bits and overrides before re-enabling the
  // categories the user does NOT want stripped, while respecting categories
  // stripped by an earlier stripMetadata call on the same instance.
  const previouslyStripped =
    opts?.lastStripKeepMetadata !== undefined
      ? ~(opts.lastStripKeepMetadata | (opts.keepMetadata ?? 0))
      : 0;
  const exifStripped = Boolean(stripExif || stripGps || previouslyStripped & 0b00001);
  const iccStripped = Boolean(stripIcc || previouslyStripped & 0b01000);
  const xmpStripped = Boolean(stripXmp || previouslyStripped & 0b00010);

  if (opts) {
    opts.keepMetadata = 0;
    opts.withIccProfile = "";
    if (exifStripped) {
      opts.withExif = {};
      opts.withExifMerge = true;
      opts.withMetadataOrientation = -1;
      opts.withMetadataDensity = 0;
    }
    if (xmpStripped) {
      opts.withXmp = "";
    }
  }

  let pipeline = image;

  if (!exifStripped) {
    pipeline = pipeline.keepExif();
  }

  if (!iccStripped) {
    pipeline = pipeline.keepIccProfile();
  }

  if (!xmpStripped) {
    pipeline = pipeline.keepXmp();
  }

  if (opts) {
    opts.lastStripKeepMetadata = opts.keepMetadata ?? 0;
  }

  return pipeline;
}
