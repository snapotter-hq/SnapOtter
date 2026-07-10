---
description: "Konvertera presentationer till PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 78166963f580
---

# PowerPoint till PDF {#powerpoint-to-pdf}

Konvertera PowerPoint- eller OpenDocument-presentationer till PDF, med en bild per sida.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Tar emot multipart-formulärdata med en PowerPoint/ODP-fil.

## Parametrar {#parameters}

Det här verktyget har inga konfigurerbara parametrar. Ladda upp en presentation så konverteras den till PDF.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- Godtagna indataformat: `.pptx`, `.ppt`, `.odp`.
- Varje bild blir en sida i PDF-filen.
- Konverteringen hanteras av LibreOffice som körs utan grafiskt gränssnitt på servern.
- Animationer och övergångar inkluderas inte i PDF-utdata.
