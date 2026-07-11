---
description: "Präsentationen in PDF umwandeln."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: eff48ebbd486
---

# PowerPoint zu PDF {#powerpoint-to-pdf}

Wandelt PowerPoint- oder OpenDocument-Präsentationen in ein PDF um, mit einer Folie pro Seite.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Nimmt Multipart-Formulardaten mit einer PowerPoint-/ODP-Datei entgegen.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie eine Präsentation hoch, und sie wird in ein PDF umgewandelt.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Beispielantwort {#example-response}

Gibt `202 Accepted` zurück. Verfolgen Sie den Fortschritt per SSE unter `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Hinweise {#notes}

- Akzeptierte Eingabeformate: `.pptx`, `.ppt`, `.odp`.
- Jede Folie wird zu einer Seite im PDF.
- Die Umwandlung übernimmt LibreOffice, das auf dem Server im Headless-Modus läuft.
- Animationen und Übergänge sind in der PDF-Ausgabe nicht enthalten.
