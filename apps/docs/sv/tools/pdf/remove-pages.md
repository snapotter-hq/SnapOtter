---
description: "Ta bort specifika sidor från en PDF."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: b0685e12c543
---

# Remove Pages {#remove-pages}

Ta bort specifika sidor från en PDF och behåll alla återstående sidor intakta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| pages | string | Ja | - | Sidintervall att ta bort i qpdf-syntax, t.ex. `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Du kan inte ta bort alla sidor från ett dokument; minst en sida måste finnas kvar.
- Sidintervall använder qpdf-syntax: `3` för en enskild sida, `5-7` för ett intervall, och kommatecken för att kombinera (t.ex. `1,3,5-7`).
