---
description: "Verringert die Dateigröße eines Bildes über eine Qualitätsstufe oder auf eine Zieldateigröße."
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: f52fc9641e64
---

# Komprimieren {#compress}

Verringert die Dateigröße eines Bildes durch Angabe einer Qualitätsstufe oder einer Zieldateigröße in Kilobyte. Das Werkzeug verwendet eine iterative binäre Suche, um Größenvorgaben präzise zu treffen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/compress`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| mode | string | Nein | `"quality"` | Komprimierungsmodus: `quality` oder `targetSize` |
| quality | number | Nein | `80` | Qualitätsstufe (1-100). Wird verwendet, wenn der Modus `quality` ist. |
| targetSizeKb | number | Nein | - | Zieldateigröße in Kilobyte. Wird verwendet, wenn der Modus `targetSize` ist. |

## Beispielanfrage {#example-request}

Auf Qualität 60 komprimieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Auf eine Zielgröße von 200 KB komprimieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Hinweise {#notes}

- Im Modus `quality` erzeugen niedrigere Werte kleinere Dateien mit mehr Komprimierungsartefakten. Ein Wert von 80 ist ein guter Standard für die Webnutzung.
- Im Modus `targetSize` führt die Engine eine iterative Komprimierung durch, um so nah wie möglich an das Ziel zu kommen, ohne es zu überschreiten.
- Das Ausgabeformat entspricht dem Eingabeformat. Die Komprimierung wird auf die native Kodierung des Formats angewendet (z. B. JPEG-Qualität für JPEG-Dateien, WebP-Qualität für WebP-Dateien).
- Wenn die Standardqualität (80) akzeptabel ist, können Sie den Parameter `quality` ganz weglassen.
