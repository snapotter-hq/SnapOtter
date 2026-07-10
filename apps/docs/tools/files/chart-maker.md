---
description: Create bar, line, or pie charts from CSV or JSON data.
---

# Chart Maker {#chart-maker}

Create bar, line, or pie charts from CSV or JSON data. Returns a PNG image of the rendered chart.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Accepts multipart form data with a CSV or JSON file and a JSON `settings` field.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Chart type: `bar`, `line`, `pie` |
| title | string | No | - | Chart title (max 120 characters) |
| width | integer | No | `960` | Chart width in pixels (320-2048) |
| height | integer | No | `540` | Chart height in pixels (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Input must be a `.csv` or `.json` file. CSV files should have a header row with column names.
- The first column is used as the category label; the second column must be numeric and provides the data values. Only two columns are used.
- JSON input should be an array of `{label, value}` objects, or a plain object whose keys become labels and values become data points.
- Maximum 100 data points. All values must be zero or greater.
- Output is always a PNG image regardless of input format.
