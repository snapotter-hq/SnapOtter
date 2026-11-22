---
description: Work out the missing width or height that keeps an aspect ratio, and simplify the ratio.
---

# Aspect Ratio Calculator {#aspect-ratio-calculator}

Enter an original width and height, then a new width or a new height, and get the other side back so the proportions stay the same. The ratio comes back in its simplest form, so 1920 × 1080 is 16:9. In the web app you can start from a common ratio (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) and swap between landscape and portrait.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Accepts a JSON body, not multipart form data, and answers with numbers instead of a file to download.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | (required) | Original width. |
| `height` | number | (required) | Original height. |
| `newWidth` | number | - | Target width. The response solves `newHeight` from it. |
| `newHeight` | number | - | Target height. The response solves `newWidth` from it. |
| `round` | boolean | `true` | Round the solved side to a whole number. When `false`, it keeps two decimal places. |

Every dimension must be between `0.0001` and `1000000`. Send `newWidth` or `newHeight`, not both. Leave both out to get only the simplified ratio.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` and `newHeight` are `null` when the request sent neither.

## Notes {#notes}

- Fractional sizes are reduced to a whole-number ratio using up to four decimal places, so `8.5` × `11` comes back as `17:22`.
- `ratioDecimal` is width divided by height, rounded to four decimal places.
- A solved side never comes back as `0`. With rounding on it is at least `1`, and with rounding off it is at least `0.01`.
- Sending both `newWidth` and `newHeight`, or a dimension outside the allowed range, returns a 400.
- The calculator never reads or writes a file. To apply the numbers, use [Resize Image](/tools/image/resize) or [Crop Image](/tools/image/crop).
