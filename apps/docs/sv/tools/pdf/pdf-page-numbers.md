---
description: "Lägg till sidnummer på varje sida i en PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 6118734e13dc
---

# PDF Page Numbers {#pdf-page-numbers}

Lägg till sidnumret "Page N of M" på varje sida i en PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| position | string | Nej | `"bc"` | Placering av sidnummer: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Nej | `10` | Teckenstorlek i punkter (6-24) |

### Position Values {#position-values}

- `tl` uppe till vänster, `tc` uppe i mitten, `tr` uppe till höger
- `bl` nere till vänster, `bc` nere i mitten, `br` nere till höger

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Sidnummer renderas i formatet "Page 1 of 10".
- Nummer läggs till på varje sida, inklusive eventuella befintliga titel- eller omslagssidor.
- Standardpositionen `"bc"` placerar nummer nere i mitten av varje sida.
