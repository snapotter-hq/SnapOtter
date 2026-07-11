---
description: "Mehrere PDF-Seiten pro Blatt anordnen (2-fach, 4-fach usw.)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 6a57859bbdc9
---

# N-up PDF {#n-up-pdf}

Ordnen Sie mehrere Seiten pro Blatt an, um beim Drucken Papier zu sparen, etwa in 2-fach- oder 4-fach-Layouts.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nein | `2` | Seiten pro Blatt: `2`, `3`, `4`, `8`, `9`, `12` oder `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Seiten werden in Leserichtung angeordnet (von links nach rechts, von oben nach unten).
- Die Ausgabeseitengröße entspricht dem Original; einzelne Seiten werden verkleinert, um in das Raster zu passen.
- Ein 20-seitiges Dokument mit `perSheet: 4` erzeugt eine 5-seitige Ausgabe.
