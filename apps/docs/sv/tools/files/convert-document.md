---
description: "Konvertera mellan formaten Word, OpenDocument, RTF och oformaterad text."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: d63ea4e6bb0b
---

# Convert Document {#convert-document}

Konvertera dokument mellan formaten Word (DOCX), OpenDocument (ODT), RTF och oformaterad text med LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Tar emot multipart-formulärdata med en Word/ODT/RTF/TXT-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Utdataformat: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Godkända indataformat: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
- Komplex formatering (makron, inbäddade objekt) kanske inte överlever konvertering mellan format.
- Utdataformatet måste skilja sig från indataformatet.
