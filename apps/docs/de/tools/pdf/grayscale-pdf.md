---
description: "Alle Farben in einer PDF in Graustufen umwandeln."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 5945ef5df97e
---

# PDF in Graustufen {#grayscale-pdf}

Wandeln Sie alle Farben in einer PDF in Graustufen um und erzeugen Sie eine Schwarz-Weiß-Version des Dokuments.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei. Es ist kein Feld `settings` erforderlich.

## Parameters {#parameters}

Dieses Tool hat keine Einstellungsparameter. Laden Sie die PDF-Datei direkt hoch.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Alle Farbräume (RGB, CMYK) werden in Graustufen umgewandelt, einschließlich eingebetteter Bilder, Vektorgrafiken und Text.
- Die Ausgabedatei ist oft kleiner als das Original, da Graustufendaten weniger Bytes pro Pixel benötigen.
