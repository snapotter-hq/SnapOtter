---
description: Convert between JSON and XML, both directions.
---

# JSON to XML

Convert between JSON and XML formats in both directions. Upload a JSON file to get XML, or upload an XML file to get JSON.

## API Endpoint

`POST /api/v1/tools/json-xml`

Accepts multipart form data with a JSON or XML file and a JSON `settings` field.

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Pretty-print output with indentation |

## Example Request

JSON to XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes

- Conversion direction is auto-detected from the input file extension: `.json` produces `.xml`, and `.xml` produces `.json`.
- The `pretty` parameter applies to both directions. When `false`, the output is compact with no indentation.
- XML attributes and nested structures are preserved during round-trip conversion where possible.
