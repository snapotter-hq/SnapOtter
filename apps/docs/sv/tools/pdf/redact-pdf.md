---
description: "Ta permanent bort textförekomster från en PDF (verifierad äkta redigering)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 6bc27b275c94
---

# Redact PDF {#redact-pdf}

Ta permanent bort angivna textförekomster från en PDF med verifierad äkta redigering. Den redigerade texten tas helt bort från filen, den täcks inte bara över med en svart ruta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| terms | string[] | Ja | - | Textsträngar att redigera bort (1-50 termer, var och en upp till 200 tecken) |
| caseSensitive | boolean | Nej | `false` | Om matchningen är skiftlägeskänslig |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- Detta är ett snabbt (synkront) verktyg som returnerar resultatet direkt.
- Detta utför äkta redigering: matchad text tas bort från PDF-filens innehållsström, den döljs inte bara visuellt.
- Fältet `found` i svaret anger hur många förekomster som redigerades bort.
- Du kan redigera bort upp till 50 termer i en enda begäran.
