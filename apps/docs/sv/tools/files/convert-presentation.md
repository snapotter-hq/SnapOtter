---
description: "Konvertera mellan presentationsformaten PowerPoint och OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 973b773ba453
---

# Convert Presentation {#convert-presentation}

Konvertera presentationer mellan formaten PowerPoint (PPTX) och OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Tar emot multipart-formulärdata med en PowerPoint/ODP-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Utdataformat: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Godkända indataformat: `.pptx`, `.ppt`, `.odp`.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
- Animationer och övergångseffekter bevaras kanske inte mellan format.
- Utdataformatet måste skilja sig från indataformatet.
