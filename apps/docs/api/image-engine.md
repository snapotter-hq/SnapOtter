---
description: Image engine operations reference. All Sharp-based image processing operations and their parameters.
---

# Image engine {#image-engine}

The `@snapotter/image-engine` package handles all non-AI image operations. It wraps [Sharp](https://sharp.pixelplumbing.com/) and runs entirely in-process with no external dependencies.

## Operations {#operations}

### resize {#resize}

Scale an image to specific dimensions or by percentage.

| Parameter | Type | Description |
|---|---|---|
| `width` | number | Target width in pixels |
| `height` | number | Target height in pixels |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, or `outside` |
| `withoutEnlargement` | boolean | If true, won't upscale smaller images |
| `percentage` | number | Scale by percentage instead of absolute dimensions |

You can set `width`, `height`, or both. If you only set one, the other is calculated to maintain the aspect ratio.

### crop {#crop}

Cut out a rectangular region from the image.

| Parameter | Type | Description |
|---|---|---|
| `left` | number | X offset from the left edge |
| `top` | number | Y offset from the top edge |
| `width` | number | Width of the crop area |
| `height` | number | Height of the crop area |
| `unit` | string | `px` (default) or `percent` |

### rotate {#rotate}

Rotate the image by a given angle.

| Parameter | Type | Description |
|---|---|---|
| `angle` | number | Rotation angle in degrees (0-360) |
| `background` | string | Fill color for exposed area (default: `#000000`). Only applies to non-90-degree angles. |

### flip {#flip}

Mirror the image horizontally, vertically, or both. At least one must be true.

| Parameter | Type | Description |
|---|---|---|
| `horizontal` | boolean | Mirror left to right |
| `vertical` | boolean | Mirror top to bottom |

### convert {#convert}

Change the image format.

| Parameter | Type | Description |
|---|---|---|
| `format` | string | Target format: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Compression quality (1-100, applies to lossy formats) |

The first seven formats (`jpg` through `jxl`) are encoded by Sharp in-process. The remaining formats use external encoders at the API layer: `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress, and `qoi` via an inline TypeScript codec.

### compress {#compress}

Reduce file size while keeping the same format.

| Parameter | Type | Description |
|---|---|---|
| `quality` | number | Target quality (1-100) |
| `targetSizeBytes` | number | Optional target file size in bytes |
| `format` | string | Optional format override |

### strip-metadata {#strip-metadata}

Remove EXIF, IPTC, XMP, and ICC metadata from the image. With no parameters (or `stripAll: true`), strips everything. Pass individual flags for selective stripping.

| Parameter | Type | Description |
|---|---|---|
| `stripAll` | boolean | Strip all metadata (default when no flags are set) |
| `stripExif` | boolean | Strip EXIF data (including GPS if `stripGps` is not separately set) |
| `stripGps` | boolean | Strip GPS location data |
| `stripIcc` | boolean | Strip ICC color profile |
| `stripXmp` | boolean | Strip XMP metadata |

### Color adjustments {#color-adjustments}

These operations modify the color properties of an image. Each takes a single numeric value.

| Operation | Parameter | Range | Description |
|---|---|---|---|
| `brightness` | `value` | -100 to 100 | Adjust brightness |
| `contrast` | `value` | -100 to 100 | Adjust contrast |
| `saturation` | `value` | -100 to 100 | Adjust color saturation |

### Color filters {#color-filters}

These apply a fixed color transformation. They take no parameters.

| Operation | Description |
|---|---|
| `grayscale` | Convert to grayscale |
| `sepia` | Apply a sepia tone |
| `invert` | Invert all colors |

### Color channels {#color-channels}

Adjust individual RGB color channels. Values are multipliers where 100 = no change.

| Parameter | Type | Description |
|---|---|---|
| `red` | number | Red channel multiplier (0 to 200, 100 = unchanged) |
| `green` | number | Green channel multiplier (0 to 200, 100 = unchanged) |
| `blue` | number | Blue channel multiplier (0 to 200, 100 = unchanged) |

### sharpen {#sharpen}

Simple sharpening controlled by a single value.

| Parameter | Type | Description |
|---|---|---|
| `value` | number | Sharpening intensity (0 to 100). Mapped to a Gaussian sigma of 0.5-10. |

### sharpen-advanced {#sharpen-advanced}

Advanced sharpening with three selectable methods and an optional noise-reduction pre-pass.

| Parameter | Type | Description |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, or `high-pass` |
| `sigma` | number | Gaussian blur radius, 0.5-10 (adaptive) |
| `m1` | number | Flat-area sharpening, 0-10 (adaptive) |
| `m2` | number | Textured-area sharpening, 0-20 (adaptive) |
| `x1` | number | Flat/jagged threshold, 0-10 (adaptive) |
| `y2` | number | Max brightening (halo clamp), 0-50 (adaptive) |
| `y3` | number | Max darkening (halo clamp), 0-50 (adaptive) |
| `amount` | number | Intensity percentage, 0-500 (unsharp-mask) |
| `radius` | number | Blur radius, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | Minimum edge brightness, 0-255 (unsharp-mask) |
| `strength` | number | Blend strength, 0-100 (high-pass) |
| `kernelSize` | number | `3` or `5` for 3x3 / 5x5 kernel (high-pass) |
| `denoise` | string | Noise reduction pre-pass: `off`, `light`, `medium`, or `strong` |

Parameters are method-specific. Only supply the ones relevant to the chosen method.

### color-blindness {#color-blindness}

Simulate a color vision deficiency using a 3x3 color-recombination matrix.

| Parameter | Type | Description |
|---|---|---|
| `type` | string | One of: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Write or remove individual EXIF/IPTC metadata fields without stripping the entire block.

| Parameter | Type | Description |
|---|---|---|
| `artist` | string | EXIF Artist tag |
| `copyright` | string | EXIF Copyright tag |
| `imageDescription` | string | EXIF ImageDescription tag |
| `software` | string | EXIF Software tag |
| `dateTime` | string | EXIF DateTime tag |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal tag |
| `clearGps` | boolean | Remove all GPS tags |
| `fieldsToRemove` | string[] | List of EXIF field names to delete |

All parameters are optional. Fields listed in `fieldsToRemove` are deleted from the existing EXIF block. Fields set via the named parameters are written (or overwritten). Binary/unsafe keys like MakerNote are silently ignored.

## Format detection {#format-detection}

The engine detects input formats automatically from file headers, not just file extensions. This means a `.jpg` file that is actually a PNG will be handled correctly. Detection uses a multi-layer approach: magic bytes first, then file extension as fallback.

SnapOtter supports **55+ input formats** and **13 output formats**, including 23 camera RAW formats from 20+ brands, professional formats (PSD, EPS, OpenEXR, HDR), modern codecs (JPEG XL, AVIF, HEIC, QOI, JPEG 2000), and scientific/gaming formats (FITS, DDS). Decoding is handled by Sharp natively where possible, with automatic fallback to ImageMagick, LibRaw, and specialized CLI decoders.

See the [Supported Formats](/guide/supported-formats) page for the complete list.

## Metadata extraction {#metadata-extraction}

The `info` tool returns image metadata. See [Image Info](/tools/image/info) for the full field reference.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
