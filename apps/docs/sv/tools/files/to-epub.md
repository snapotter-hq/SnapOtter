---
description: "Konvertera Word-, Markdown-, HTML- eller vanliga textfiler till EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: f35cb2845235
---

# Konvertera till EPUB {#convert-to-epub}

Konvertera Word-dokument, Markdown, HTML eller vanliga textfiler till e-boksformatet EPUB.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Tar emot multipart-formulärdata med en Word/Markdown/HTML/TXT-fil.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Ladda upp ett dokument så konverteras det till EPUB.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Godtagna indataformat: `.docx`, `.md`, `.html`, `.txt`.
- EPUB-utdata följer EPUB 3-specifikationen.
- Rubriker i källdokumentet används för att generera innehållsförteckningen.
- Konverteringen hanteras av Pandoc på servern.
