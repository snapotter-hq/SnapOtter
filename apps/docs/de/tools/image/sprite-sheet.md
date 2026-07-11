---
description: "Mehrere Bilder zu einem einzigen Sprite-Sheet-Raster mit Frame-Metadaten kombinieren."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 52bd054d3541
---

# Sprite-Sheet {#sprite-sheet}

Kombiniert mehrere Bilder zu einem einzigen Sprite-Sheet-Raster. Jedes Bild wird auf die Abmessungen des ersten Bildes skaliert und im Raster platziert. Gibt das Sprite-Sheet-Bild zusammen mit Koordinaten-Metadaten pro Frame zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Nimmt Multipart-Formulardaten mit zwei oder mehr Bilddateien und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| columns | integer | Nein | `4` | Anzahl der Spalten im Raster (1-16) |
| padding | integer | Nein | `0` | Abstand zwischen den Zellen in Pixeln (0-64) |
| background | string | Nein | `"#ffffff"` | Hintergrund-Hexfarbe |
| format | string | Nein | `"png"` | Ausgabeformat: `png`, `webp` oder `jpeg` |
| quality | integer | Nein | `90` | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Hinweise {#notes}

- Nimmt 2 bis 64 Bilder entgegen. Alle Bilder werden auf die Abmessungen des ersten hochgeladenen Bildes skaliert.
- Das Array `frames` liefert die exakten Pixelkoordinaten jedes Frames in der Ausgabe, geeignet für CSS-Sprite-Definitionen oder Frame-Maps von Spiel-Engines.
- Die Anzahl der Zeilen wird automatisch aus der Bildanzahl und dem Wert `columns` berechnet.
- Verwenden Sie den Parameter `padding`, um Abstand zwischen den Zellen einzufügen. Die Farbe `background` ist in Abstandsbereichen und in etwaigen leeren nachfolgenden Zellen sichtbar.
- HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
