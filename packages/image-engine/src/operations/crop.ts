import type { Sharp, CropOptions } from "../types.js";

export async function crop(image: Sharp, options: CropOptions): Promise<Sharp> {
  const { left, top, width, height } = options;

  if (width <= 0 || height <= 0) {
    throw new Error("Crop width and height must be greater than 0");
  }
  if (left < 0 || top < 0) {
    throw new Error("Crop left and top must be non-negative");
  }

  const metadata = await image.metadata();
  const imgWidth = metadata.width ?? 0;
  const imgHeight = metadata.height ?? 0;

  if (left + width > imgWidth) {
    throw new Error(
      `Crop region exceeds image width: left(${left}) + width(${width}) > ${imgWidth}`
    );
  }
  if (top + height > imgHeight) {
    throw new Error(
      `Crop region exceeds image height: top(${top}) + height(${height}) > ${imgHeight}`
    );
  }

  return image.extract({ left, top, width, height });
}
