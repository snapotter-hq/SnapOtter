import { ToolInputError } from "@snapotter/shared";
import type { CropOptions, Sharp } from "../types.js";

export async function crop(image: Sharp, options: CropOptions): Promise<Sharp> {
  const metadata = await image.metadata();
  const imgWidth = metadata.width ?? 0;
  const imgHeight = metadata.height ?? 0;

  let left: number;
  let top: number;
  let width: number;
  let height: number;

  if (options.unit === "percent") {
    left = Math.round((options.left / 100) * imgWidth);
    top = Math.round((options.top / 100) * imgHeight);
    width = Math.round((options.width / 100) * imgWidth);
    height = Math.round((options.height / 100) * imgHeight);
  } else {
    left = Math.round(options.left);
    top = Math.round(options.top);
    width = Math.round(options.width);
    height = Math.round(options.height);
  }

  if (width <= 0 || height <= 0) {
    throw new ToolInputError("Crop width and height must be greater than 0");
  }
  if (left < 0 || top < 0) {
    throw new ToolInputError("Crop left and top must be non-negative");
  }

  if (left + width > imgWidth) {
    throw new ToolInputError(
      `Crop region exceeds image width: left(${left}) + width(${width}) > ${imgWidth}`,
    );
  }
  if (top + height > imgHeight) {
    throw new ToolInputError(
      `Crop region exceeds image height: top(${top}) + height(${height}) > ${imgHeight}`,
    );
  }

  return image.extract({ left, top, width, height });
}
