---
description: "Placera flera PDF-sidor per ark (2-up, 4-up osv.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 454082da0433
---

# Sidor per ark (N-up) {#n-up-pdf}

Placera flera sidor per ark för att spara papper vid utskrift, till exempel 2-up- eller 4-up-layouter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nej | `2` | Sidor per ark: `2`, `3`, `4`, `8`, `9`, `12` eller `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Sidorna placeras i läsordning (från vänster till höger, uppifrån och ned).
- Utdatasidans storlek matchar originalet; enskilda sidor skalas ned för att passa i rutnätet.
- Ett dokument på 20 sidor med `perSheet: 4` ger ett utdata på 5 sidor.
