---
description: "Konvertera en PDF till ett Word-dokument (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 9f4d2af147e2
---

# PDF to Word {#pdf-to-word}

Konvertera en textbaserad PDF till ett Word-dokument (DOCX). Passar bäst för PDF-filer med markerbar text; skannade sidor behöver OCR först.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Tar emot multipart-formulärdata med en PDF-fil.

## Parameters {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda upp en PDF så konverteras den till DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
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
- Fungerar bäst med textbaserade PDF-filer. Skannade eller enbart bildbaserade sidor ger tom eller minimal utdata; använd [PDF OCR](./ocr-pdf) för att lägga till ett textlager först.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
- Komplexa layouter (flera kolumner, överlappande element) kanske inte konverteras perfekt.
