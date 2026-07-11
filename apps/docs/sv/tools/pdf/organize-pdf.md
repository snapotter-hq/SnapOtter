---
description: "Ändra ordning på sidorna i en PDF med en uttrycklig sidordning."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 8285f45a3f9a
---

# Organize PDF {#organize-pdf}

Ändra ordning på sidorna i en PDF genom att ange den önskade sidsekvensen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| order | string | Ja | - | Önskad sidordning i qpdf-syntax, t.ex. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
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

- Sidintervall använder qpdf-syntax: `3,1,2` ordnar om de tre första sidorna, och `5-z` lägger till sidorna 5 till sista sidan.
- Sidor kan dupliceras genom att de listas mer än en gång (t.ex. duplicerar `"1,1,2,3"` sidan 1).
- Sidor som inte listas i ordningssträngen utelämnas från utdata.
