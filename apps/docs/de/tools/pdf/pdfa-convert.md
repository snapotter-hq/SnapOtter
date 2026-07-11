---
description: "Eine PDF in das Archivformat PDF/A-2 zur Langzeitarchivierung umwandeln."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: c8a1faebbab8
---

# PDF/A-Umwandlung {#pdf-a-convert}

Wandeln Sie eine PDF in das Archivformat PDF/A-2 um, das für die Langzeitarchivierung und die Einhaltung gesetzlicher Vorschriften geeignet ist.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei. Es ist kein Feld `settings` erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie die PDF-Datei direkt hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Die Ausgabe entspricht dem Standard PDF/A-2.
- PDF/A bettet alle Schriften ein und lässt keine externen Verweise zu, sodass die Ausgabedatei größer sein kann als das Original.
- Verschlüsselung und JavaScript werden während der Umwandlung entfernt, da sie vom PDF/A-Standard nicht zugelassen sind.
