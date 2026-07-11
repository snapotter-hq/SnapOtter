---
description: "PDF-Dateigröße durch Komprimierung eingebetteter Bilder verringern."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 8c3efda683e2
---

# PDF komprimieren {#compress-pdf}

Verringern Sie die PDF-Dateigröße, indem Sie eingebettete Bilder herunterskalieren. Wählen Sie zwischen einem Qualitätsregler und einer Zieldateigröße.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `"quality"` | Komprimierungsmodus: `quality` oder `targetSize` |
| quality | integer | Nein | `75` | Komprimierungsqualität, 1-100 (höher = weniger Komprimierung). Wird im Modus `quality` verwendet |
| targetSizeKb | number | Nein | - | Zieldateigröße in Kilobyte. Wird im Modus `targetSize` verwendet |

## Example Request {#example-request}

Nach Qualität komprimieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Auf eine Zielgröße komprimieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Im Modus `quality` erzeugen niedrigere Werte kleinere Dateien mit stärkerer Bildverschlechterung.
- Im Modus `targetSize` findet eine binäre Suche die höchste DPI-Auflösung, die in die angeforderte Größe passt.
- Falls die Komprimierung die Datei vergrößern würde, werden die ursprünglichen Bytes unverändert zurückgegeben.
- Text- und Vektorinhalte sind nicht betroffen; nur eingebettete Rasterbilder werden herunterskaliert.
