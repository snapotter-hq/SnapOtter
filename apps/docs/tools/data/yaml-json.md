---
description: Convert between YAML and JSON, both directions.
---

# YAML / JSON

Convert between YAML and JSON formats in both directions. Upload a YAML file to get JSON, or upload a JSON file to get YAML.

## API Endpoint

`POST /api/v1/tools/yaml-json`

Accepts multipart form data with a YAML or JSON file. No settings field is required.

## Parameters

This tool has no configurable parameters. The conversion direction is determined by the input file extension.

## Example Request

YAML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON to YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes

- Conversion direction is auto-detected from the input file extension: `.yaml` or `.yml` produces `.json`, and `.json` produces `.yaml`.
- Both `.yaml` and `.yml` extensions are accepted.
- Only the first document in a multi-document YAML file is converted; additional documents separated by `---` are ignored.
