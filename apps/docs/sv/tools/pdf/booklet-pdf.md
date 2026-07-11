---
description: "Arrangera PDF-sidor för att vikas till ett häfte."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 1efc429c5b11
---

# Häftes-PDF {#booklet-pdf}

Montera sidor för dubbelsidig utskrift så att de utskrivna arken kan vikas till ett häfte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Sidor per ark: `2`, `4`, `6` eller `8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Standardvärdet `perSheet: 2` placerar två sidor sida vid sida på varje ark, vilket är standardlayouten för häften vid dubbelsidig utskrift.
- Tomma sidor läggs till automatiskt om det totala sidantalet inte är en multipel av arkstorleken.
- Skriv ut utdatan dubbelsidigt med bindning längs kortsidan, vik sedan och häfta.
