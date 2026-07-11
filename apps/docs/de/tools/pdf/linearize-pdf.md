---
description: "Eine PDF für schnelle Webanzeige linearisieren (progressiver Download)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 751439e372ea
---

# PDF für das Web optimieren {#web-optimize-pdf}

Linearisieren Sie eine PDF, damit sie in Webbrowsern progressiv heruntergeladen und angezeigt werden kann, ohne auf die vollständige Datei zu warten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei. Es ist kein Feld `settings` erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie die PDF-Datei direkt hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Die Linearisierung ordnet die interne Struktur der PDF neu an, sodass die erste Seite gerendert werden kann, bevor die gesamte Datei heruntergeladen wurde.
- Die Ausgabedatei kann aufgrund der zusätzlichen Linearisierungsdaten geringfügig größer sein als die Eingabe.
- Bereits linearisierte PDFs werden problemlos erneut linearisiert.
