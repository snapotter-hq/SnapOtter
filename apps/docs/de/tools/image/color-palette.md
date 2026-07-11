---
description: "Extrahiert die dominierenden Farben eines Bildes als Farbpalette."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: a7b510b51e96
---

# Farbpalette {#color-palette}

Extrahiert die dominierenden Farben eines Bildes und gibt sie als Hex-Farbwerte zurück. Verwendet eine quantisierte Häufigkeitsanalyse, um die auffälligsten und optisch am deutlichsten unterscheidbaren Farben zu ermitteln.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem optionalen JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| count | integer | Nein | `8` | Anzahl der zu extrahierenden Farben (2-16) |
| format | string | Nein | `"hex"` | Farbformat: `hex`, `rgb`, `hsl` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Beispielantwort {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| filename | string | Bereinigter Dateiname |
| colors | array | Array von Farbstrings im angeforderten Format, sortiert nach Dominanz (häufigste zuerst) |
| hex | array | Array von Hex-Farbstrings (immer Hex, unabhängig von der Einstellung `format`) |
| count | number | Anzahl der extrahierten Farben |

## Hinweise {#notes}

- Gibt bis zu `count` dominierende Farben zurück (Standard 8, Bereich 2-16), sortiert nach Häufigkeit (häufigste zuerst).
- Das Bild wird intern auf 100x100 Pixel verkleinert, um es zu analysieren, sodass die Palette die gesamte Farbverteilung und nicht kleine Details widerspiegelt.
- Die Farben werden mit Median-Cut-Quantisierung extrahiert, die die Pixelmengen rekursiv entlang des Kanals mit dem größten Wertebereich aufteilt.
- Der Alphakanal wird vor der Analyse entfernt, sodass transparente Bereiche nicht berücksichtigt werden.
- Dies ist ein reiner Lese-Endpunkt. Er erzeugt weder eine herunterladbare Ausgabedatei noch ein `jobId`.
- HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Analyse automatisch dekodiert.
