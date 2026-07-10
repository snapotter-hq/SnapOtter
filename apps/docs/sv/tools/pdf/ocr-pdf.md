---
description: "Extrahera text från PDF-dokument med AI-driven OCR."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 8169485e1e62
---

# PDF OCR {#pdf-ocr}

Extrahera text från PDF-dokument med AI-driven optisk teckenigenkänning. Stöder flera kvalitetsnivåer och språk. Kräver att OCR-funktionspaketet är installerat.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett valfritt JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| quality | string | Nej | `"balanced"` | OCR-kvalitetsnivå: `fast`, `balanced`, `best` |
| language | string | Nej | `"auto"` | Dokumentspråk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nej | `"all"` | Sidval, t.ex. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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

- Godkänt indataformat: `.pdf`.
- Detta är ett AI-verktyg som kräver att **OCR-funktionspaketet** är installerat. Om paketet inte är installerat returnerar API:et `501 Not Implemented`.
- Kvalitetsnivån `fast` använder en lättare modell för snabbare bearbetning; `best` använder en mer träffsäker modell på bekostnad av hastighet.
- Språkinställningen `auto` försöker upptäcka dokumentspråket automatiskt.
- Du kan rikta in dig på specifika sidor med intervall (`"1-3"`), kommaseparerade listor (`"1,3,5"`) eller `"all"` för varje sida.
- För PDF-filer som redan innehåller markerbar text bör du överväga att använda det snabbare verktyget [PDF to Text](./pdf-to-text) istället.
