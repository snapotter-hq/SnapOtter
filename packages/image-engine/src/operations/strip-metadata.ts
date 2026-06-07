import type { Sharp, StripMetadataOptions } from "../types.js";

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

  if (shouldStripAll) {
    return image;
  }

  const strippingNothing = !stripExif && !stripGps && !stripIcc && !stripXmp;
  if (strippingNothing) {
    return image.withMetadata();
  }

  // Selective stripping: Sharp strips all metadata by default (no calls needed).
  // We chain keepExif() / keepIccProfile() to preserve categories the user
  // does NOT want stripped.
  let pipeline = image;

  if (!stripExif && !stripGps) {
    pipeline = pipeline.keepExif();
  }

  if (!stripIcc) {
    pipeline = pipeline.keepIccProfile();
  }

  // XMP: Sharp has no keepXmp() method. XMP is always stripped in selective mode.

  return pipeline;
}
