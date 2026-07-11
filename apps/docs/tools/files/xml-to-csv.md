---
description: Extract repeating elements from XML into a CSV table.
---

# XML to CSV {#xml-to-csv}

Extract repeating elements from an XML file into a flat CSV table. The tool automatically finds the first array of objects in the XML tree and maps each element to a row.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Accepts multipart form data with an XML file. No settings field is required.

## Parameters {#parameters}

This tool has no configurable parameters. The repeating element is auto-detected from the XML structure.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- Only `.xml` files are accepted as input.
- The tool scans the XML tree for the first repeating set of sibling elements and uses those as rows.
- Each unique child element or attribute name becomes a CSV column header.
- This is a one-way conversion. For bidirectional JSON/XML conversion, use the [JSON to XML](/tools/files/json-xml) tool.
