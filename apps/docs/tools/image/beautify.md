# Beautify Screenshot

Add gradient backgrounds, device frames, shadows, watermarks, and social media sizing to screenshots. Ideal for creating polished images for product marketing, social media, and documentation.

## API Endpoint

`POST /api/v1/tools/beautify`

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | Background type: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | Solid background color (used when `backgroundType` is `solid`) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Gradient color stops (min 2). Each stop has `color` (hex) and `position` (0-100). |
| gradientAngle | number | No | 135 | Gradient angle in degrees (0 to 360) |
| padding | number | No | 64 | Padding around the image in pixels (0 to 256) |
| borderRadius | number | No | 12 | Corner radius on the screenshot (0 to 64) |
| shadowPreset | string | No | `"subtle"` | Shadow preset: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | Custom shadow blur radius (0 to 100, used when `shadowPreset` is `custom`) |
| shadowOffsetX | number | No | 0 | Custom shadow horizontal offset (-50 to 50) |
| shadowOffsetY | number | No | 10 | Custom shadow vertical offset (-50 to 50) |
| shadowColor | string | No | `"#000000"` | Custom shadow color as hex |
| shadowOpacity | number | No | 30 | Custom shadow opacity (0 to 100) |
| frame | string | No | `"none"` | Device or window frame: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | Title text displayed in window frame title bars |
| socialPreset | string | No | `"none"` | Resize to social media dimensions: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | Optional watermark text overlay |
| watermarkPosition | string | No | `"bottom-right"` | Watermark position: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | Watermark opacity (0 to 100) |
| outputFormat | string | No | `"png"` | Output format: `png`, `jpeg`, `webp` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image

```bash
curl -X POST http://localhost:1349/api/v1/tools/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes

- Accepts two file fields: `file` (required, the main screenshot) and `backgroundImage` (optional, used when `backgroundType` is `image`).
- Supports HEIC, RAW, PSD, and SVG input formats (automatically decoded).
- Shadow presets map to specific values:
  - `subtle`: blur 20, offsetY 4, opacity 20%
  - `medium`: blur 40, offsetY 10, opacity 35%
  - `dramatic`: blur 80, offsetY 20, opacity 50%
- Social media presets resize the final output to fit the target dimensions using `contain` mode:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Device frames (`iphone`, `macbook`, `ipad`) apply a hardware bezel around the image and skip the `borderRadius` setting.
- When transparency is required (shadow, border radius, device frames, or transparent background), the output is forced to PNG even if `jpeg` is selected.
- Image backgrounds are not supported in pipeline/batch mode.
