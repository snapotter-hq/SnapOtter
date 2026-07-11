---
description: "Konvertera Word-dokument till PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 06a48db3ad4e
---

# Word till PDF {#word-to-pdf}

Konvertera Word-dokument, OpenDocument-text, RTF eller vanliga textfiler till PDF.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Tar emot multipart-formulärdata med en Word/ODT/RTF/TXT-fil.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Ladda upp ett dokument så konverteras det till PDF.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Exempelsvar {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Godtagna indataformat: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
- Teckensnitt som är inbäddade i dokumentet används när de är tillgängliga; annars ersätts de med systemteckensnitt.
- Sidhuvuden, sidfötter, tabeller och bilder bevaras i PDF-utdata.
