---
description: "Rotera sidor i en PDF med 90, 180 eller 270 grader."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: ab77cda241c2
---

# Rotate PDF {#rotate-pdf}

Rotera alla eller valda sidor i en PDF med en angiven vinkel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| angle | integer | Nej | `90` | Rotationsvinkel: `90`, `180` eller `270` |
| range | string | Nej | `"1-z"` | Sidintervall i qpdf-syntax, t.ex. `"1-5,8"` (`"1-z"` = alla sidor) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Rotationen sker medurs.
- Sidintervall använder qpdf-syntax: `1-5` för sidorna 1 till 5, `z` för den sista sidan, och kommatecken för att kombinera intervall.
- Standardintervallet `"1-z"` roterar alla sidor.
