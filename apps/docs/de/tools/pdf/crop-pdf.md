---
description: "Alle Seiten einer PDF mit einem einheitlichen Rand zuschneiden."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 9f1e0b6112aa
---

# PDF zuschneiden {#crop-pdf}

Schneiden Sie alle Seiten einer PDF zu, indem Sie einen einheitlichen Rand anwenden, der Inhalt an jeder Kante gleichmäßig entfernt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| margin | number | Nein | `20` | Einheitlicher Zuschneiderand in Punkten (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Der Randwert wird in PDF-Punkten angegeben (1 Punkt = 1/72 Zoll).
- Derselbe Rand wird auf alle vier Kanten jeder Seite angewendet.
- Ein Rand von `0` entfernt alle vorhandenen Zuschneideränder und zeigt die vollständige Media-Box.
