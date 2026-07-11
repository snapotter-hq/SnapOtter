---
description: "Seiten in einer PDF um 90, 180 oder 270 Grad drehen."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 02533edb972c
---

# PDF drehen {#rotate-pdf}

Drehen Sie alle oder ausgewählte Seiten in einer PDF um einen angegebenen Winkel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| angle | integer | Nein | `90` | Drehwinkel: `90`, `180` oder `270` |
| range | string | Nein | `"1-z"` | Seitenbereich in qpdf-Syntax, z. B. `"1-5,8"` (`"1-z"` = alle Seiten) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Die Drehung erfolgt im Uhrzeigersinn.
- Seitenbereiche verwenden die qpdf-Syntax: `1-5` für die Seiten 1 bis 5, `z` für die letzte Seite und Kommas zum Kombinieren von Bereichen.
- Der Standardbereich `"1-z"` dreht alle Seiten.
