---
description: Generate an RGB histogram chart with per-channel statistics from an image.
---

# Histogram

Generate an RGB histogram chart from an image. Returns a PNG histogram image along with per-channel statistics and raw 256-bin histogram data in the response JSON.

## API Endpoint

`POST /api/v1/tools/histogram`

Accepts multipart form data with an image file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| scale | string | No | `"linear"` | Y-axis scale: `linear` or `log` |

## Example Request

```bash
curl -X POST http://localhost:1349/api/v1/tools/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Notes

- The `downloadUrl` points to a rendered PNG histogram chart showing the R, G, B, and luminance distributions.
- `bins` contains raw 256-value arrays for each channel (red, green, blue, luminance), suitable for rendering custom visualizations.
- `stats` provides mean, median, and standard deviation per channel.
- `mean` and `max` are backward-compatible shorthand fields.
- Use `log` scale when the histogram is dominated by a few peaks and you want to see detail in the lower bins.
- HEIC, RAW, PSD, and SVG inputs are automatically decoded before analysis.
