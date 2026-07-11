---
description: "Generera ett RGB-histogramdiagram med statistik per kanal från en bild."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: ae01b9f604e5
---

# Histogram {#histogram}

Generera ett RGB-histogramdiagram från en bild. Returnerar en PNG-histogrambild tillsammans med statistik per kanal och rå 256-bins histogramdata i svars-JSON.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| scale | string | Nej | `"linear"` | Y-axelns skala: `linear` eller `log` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Exempelsvar {#example-response}

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

## Anmärkningar {#notes}

- `downloadUrl` pekar på ett renderat PNG-histogramdiagram som visar fördelningarna för R, G, B och luminans.
- `bins` innehåller råa 256-värdesmatriser för varje kanal (röd, grön, blå, luminans), lämpliga för att rendera anpassade visualiseringar.
- `stats` tillhandahåller medelvärde, median och standardavvikelse per kanal.
- `mean` och `max` är bakåtkompatibla förkortade fält.
- Använd skalan `log` när histogrammet domineras av ett fåtal toppar och du vill se detaljer i de lägre binsen.
- HEIC-, RAW-, PSD- och SVG-inmatningar avkodas automatiskt före analys.
