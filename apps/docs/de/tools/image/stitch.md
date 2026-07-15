---
description: "Bilder nebeneinander, gestapelt oder in einem Raster zusammenfügen, mit Kontrolle über Ausrichtung, Abstände, Ränder und Skalierungsmodus."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: c197046add93
---

# Bilder zusammenfügen {#stitch-combine}

Fügt mehrere Bilder nebeneinander, vertikal gestapelt oder in einem Raster angeordnet zusammen. Unterstützt Ausrichtung, Abstand, Rand, Eckradius und mehrere Skalierungsmodi.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| direction | string | Nein | `"horizontal"` | Layout-Richtung: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Nein | 2 | Anzahl der Spalten, wenn die Richtung `grid` ist (2 bis 100) |
| resizeMode | string | Nein | `"fit"` | Art der Bildskalierung: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Nein | `"center"` | Ausrichtung auf der Querachse: `start`, `center`, `end` |
| gap | number | Nein | 0 | Abstand zwischen den Bildern in Pixeln (0 bis 1000) |
| border | number | Nein | 0 | Breite des äußeren Rands in Pixeln (0 bis 500) |
| cornerRadius | number | Nein | 0 | Auf die finale Ausgabe angewendeter Eckradius (0 bis 500) |
| backgroundColor | string | Nein | `"#FFFFFF"` | Hintergrund-/Randfarbe als Hexwert (z. B. `#FF0000`) |
| format | string | Nein | `"png"` | Ausgabeformat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nein | 90 | Ausgabequalität (1 bis 100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Hinweise {#notes}

- Erfordert mindestens 2 Bilder. Laden Sie mehrere Bilddateien in der Multipart-Anfrage hoch.
- Unterstützt HEIC-, RAW-, PSD- und SVG-Eingabeformate (automatisch dekodiert).
- Skalierungsmodi:
  - `fit` - Bilder so skalieren, dass sie der kleinsten Abmessung entlang der Verbindungsachse entsprechen.
  - `original` - Originalgrößen beibehalten (kann ungleichmäßige Kanten erzeugen).
  - `stretch` - Bilder erzwingen auf die kleinste Abmessung ohne Beibehaltung des Seitenverhältnisses bringen.
  - `crop` - Bilder per Cover-Zuschnitt auf die kleinste Abmessung bringen.
- Im Modus `grid` werden die Zellen auf die Medianabmessungen aller Bilder dimensioniert.
- Der `cornerRadius` wird auf die gesamte finale Ausgabe angewendet, nicht auf einzelne Bilder.
- Die Leinwandgröße ist durch die Serverkonfiguration `MAX_CANVAS_PIXELS` begrenzt, um eine Speichererschöpfung zu verhindern.
