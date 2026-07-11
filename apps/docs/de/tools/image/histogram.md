---
description: "Erzeugt ein RGB-Histogramm-Diagramm mit Statistiken pro Kanal aus einem Bild."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: b703965f8a11
---

# Histogramm {#histogram}

Erzeugt ein RGB-Histogramm-Diagramm aus einem Bild. Gibt ein PNG-Histogrammbild zusammen mit Statistiken pro Kanal und rohen Histogrammdaten mit 256 Bins im Antwort-JSON zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| scale | string | Nein | `"linear"` | Skala der Y-Achse: `linear` oder `log` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Hinweise {#notes}

- `downloadUrl` verweist auf ein gerendertes PNG-Histogramm-Diagramm, das die Verteilungen von R, G, B und Luminanz zeigt.
- `bins` enthält rohe Arrays mit 256 Werten für jeden Kanal (Rot, Grün, Blau, Luminanz), geeignet für das Rendern eigener Visualisierungen.
- `stats` liefert Mittelwert, Median und Standardabweichung pro Kanal.
- `mean` und `max` sind abwärtskompatible Kurzform-Felder.
- Verwenden Sie die Skala `log`, wenn das Histogramm von wenigen Spitzen dominiert wird und Sie Details in den unteren Bins sehen möchten.
- HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Analyse automatisch decodiert.
