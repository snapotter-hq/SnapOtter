---
description: "Extrahera sidor eller dela upp en PDF i delar."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 7b7e6c0e4d22
---

# Split PDF {#split-pdf}

Extrahera ett sidintervall till en ny PDF, eller dela upp ett dokument i delar om N sidor.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `"range"` | Uppdelningsläge: `range` eller `every` |
| range | string | När läget är `range` | - | Sidintervall i qpdf-syntax, t.ex. `"1-5,8,10-z"` |
| everyN | integer | När läget är `every` | - | Dela upp i delar om N sidor (1-500) |

## Example Request {#example-request}

Extrahera specifika sidor:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Dela upp i delar om 10 sidor:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- I läget `range` returneras en enda PDF som innehåller de valda sidorna.
- I läget `every` är resultatet ett ZIP-arkiv som innehåller de enskilda delarna.
- Sidintervall använder qpdf-syntax: `1-5` för sidorna 1 till 5, `z` för den sista sidan, och kommatecken för att kombinera intervall (t.ex. `1-3,7,10-z`).
