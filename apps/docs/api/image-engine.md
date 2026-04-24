# Image engine

The `@snapotter/image-engine` package handles all non-AI image operations. It wraps [Sharp](https://sharp.pixelplumbing.com/) and runs entirely in-process with no external dependencies.

## Operations

### resize

Scale an image to specific dimensions or by percentage.

| Parameter | Type | Description |
|---|---|---|
| `width` | number | Target width in pixels |
| `height` | number | Target height in pixels |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, or `outside` |
| `withoutEnlargement` | boolean | If true, won't upscale smaller images |
| `percentage` | number | Scale by percentage instead of absolute dimensions |

You can set `width`, `height`, or both. If you only set one, the other is calculated to maintain the aspect ratio.

### crop

Cut out a rectangular region from the image.

| Parameter | Type | Description |
|---|---|---|
| `left` | number | X offset from the left edge |
| `top` | number | Y offset from the top edge |
| `width` | number | Width of the crop area |
| `height` | number | Height of the crop area |

### rotate

Rotate the image by a given angle.

| Parameter | Type | Description |
|---|---|---|
| `angle` | number | Rotation angle in degrees (0-360) |
| `background` | string | Fill color for the exposed area (default: transparent or white) |

### flip

Mirror the image horizontally or vertically.

| Parameter | Type | Description |
|---|---|---|
| `direction` | string | `horizontal` or `vertical` |

### convert

Change the image format.

| Parameter | Type | Description |
|---|---|---|
| `format` | string | Target format: `jpeg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic` |
| `quality` | number | Compression quality (1-100, applies to lossy formats) |

### compress

Reduce file size while keeping the same format.

| Parameter | Type | Description |
|---|---|---|
| `quality` | number | Target quality (1-100) |
| `format` | string | Optional format override |

### strip-metadata

Remove EXIF, IPTC, and XMP metadata from the image. Useful for privacy before sharing photos publicly. Takes no parameters.

### Color adjustments

These operations modify the color properties of an image. Each takes a single numeric value.

| Operation | Parameter | Range | Description |
|---|---|---|---|
| `brightness` | `value` | -100 to 100 | Adjust brightness |
| `contrast` | `value` | -100 to 100 | Adjust contrast |
| `saturation` | `value` | -100 to 100 | Adjust color saturation |

### Color filters

These apply a fixed color transformation. They take no parameters.

| Operation | Description |
|---|---|
| `grayscale` | Convert to grayscale |
| `sepia` | Apply a sepia tone |
| `invert` | Invert all colors |

### Color channels

Adjust individual RGB color channels.

| Parameter | Type | Description |
|---|---|---|
| `red` | number | Red channel adjustment (-100 to 100) |
| `green` | number | Green channel adjustment (-100 to 100) |
| `blue` | number | Blue channel adjustment (-100 to 100) |

## Format detection

The engine detects input formats automatically from file headers, not just file extensions. This means a `.jpg` file that is actually a PNG will be handled correctly.

Supported input formats: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF, SVG, RAW (via libraw).

## Metadata extraction

The `info` tool returns image metadata:

```json
{
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "size": 245678,
  "channels": 3,
  "hasAlpha": false,
  "dpi": 72,
  "exif": { ... }
}
```
