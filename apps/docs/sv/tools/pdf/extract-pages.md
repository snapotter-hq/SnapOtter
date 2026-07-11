---
description: "Plocka ut valda sidor från en PDF till ett nytt dokument."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 84346a8f2b31
---

# Extract Pages {#extract-pages}

Plocka ut valda sidor från en PDF till ett nytt, mindre dokument.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| range | string | Ja | - | Sidintervall i qpdf-syntax, t.ex. `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- Sidintervall använder qpdf-syntax: `1-5` för sidorna 1 till 5, `z` för den sista sidan, och kommatecken för att kombinera intervall (t.ex. `1-3,7,10-z`).
- De extraherade sidorna behåller sin ursprungliga formatering, sina anteckningar och länkar.
