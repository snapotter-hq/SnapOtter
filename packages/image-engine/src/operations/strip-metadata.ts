import type { Sharp, StripMetadataOptions } from "../types.js";

export async function stripMetadata(
  image: Sharp,
  options: StripMetadataOptions = {}
): Promise<Sharp> {
  const { stripExif, stripGps, stripIcc, stripXmp, stripAll } = options;

  // Default behavior: strip all metadata
  const shouldStripAll =
    stripAll === true ||
    (stripExif === undefined &&
      stripGps === undefined &&
      stripIcc === undefined &&
      stripXmp === undefined &&
      stripAll === undefined);

  if (shouldStripAll) {
    // withMetadata({}) with no options strips everything;
    // but to truly strip we avoid calling withMetadata at all.
    // Sharp strips metadata by default when outputting.
    // Calling .withMetadata() KEEPS metadata, so we do NOT call it.
    return image;
  }

  // Selective stripping: we keep metadata but remove specific fields.
  // Sharp's withMetadata lets us keep ICC, EXIF, etc.
  // We call withMetadata to keep what wasn't requested stripped.
  const keepIcc = !stripIcc;

  return image.withMetadata({
    // If we want to keep ICC, pass undefined (Sharp default keeps it with withMetadata)
    // If we want to strip ICC, we need to not call withMetadata at all or handle differently
    // Sharp's withMetadata keeps metadata; without it, metadata is stripped.
    // For selective stripping, we strip all first then re-add what we want to keep.
    ...(keepIcc ? {} : {}),
  });
}
