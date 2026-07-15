---
description: "Kombiniert mehrere Bilder zu Rastercollagen mit über 25 Vorlagen, einstellbaren Abständen und Ecken sowie Schwenken und Zoomen pro Zelle."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: 480169ab7be2
---

# Collage & Raster {#collage-grid}

Kombiniert mehrere Bilder zu ansprechenden Rastercollagen mit über 25 Vorlagen. Unterstützt Layouts für 2 bis 9 Bilder mit anpassbarem Abstand, Eckenradius, Hintergrundfarbe sowie Schwenk-/Zoom-Steuerung pro Zelle.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| templateId | string | Ja | - | ID des Vorlagenlayouts (z. B. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Nein | - | Array mit Einstellungen pro Zelle mit `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Ja | - | Index des Bildes, das in diese Zelle platziert wird (0-basiert) |
| cells[].panX | number | Nein | 0 | Horizontaler Schwenkversatz (-100 bis 100) |
| cells[].panY | number | Nein | 0 | Vertikaler Schwenkversatz (-100 bis 100) |
| cells[].zoom | number | Nein | 1 | Zoomstufe (1 bis 10) |
| cells[].objectFit | string | Nein | `"cover"` | Wie das Bild die Zelle ausfüllt: `cover` oder `contain` |
| gap | number | Nein | 8 | Abstand zwischen den Zellen in Pixeln (0 bis 500) |
| cornerRadius | number | Nein | 0 | Eckenradius jeder Zelle in Pixeln (0 bis 500) |
| backgroundColor | string | Nein | `"#FFFFFF"` | Hintergrundfarbe als Hex-Wert oder `"transparent"` |
| aspectRatio | string | Nein | `"free"` | Seitenverhältnis der Leinwand: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Nein | `"png"` | Ausgabeformat: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Nein | 90 | Ausgabequalität (1 bis 100) |

## Verfügbare Vorlagen {#available-templates}

| Vorlagen-ID | Bilder | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Zwei gleich große Spalten |
| `2-v-equal` | 2 | Zwei gleich große Zeilen |
| `2-h-left-large` | 2 | Links 2/3, rechts 1/3 |
| `2-h-right-large` | 2 | Links 1/3, rechts 2/3 |
| `3-left-large` | 3 | Groß links, zwei gestapelt rechts |
| `3-right-large` | 3 | Zwei gestapelt links, groß rechts |
| `3-top-large` | 3 | Groß oben, zwei Spalten unten |
| `3-h-equal` | 3 | Drei gleich große Spalten |
| `3-v-equal` | 3 | Drei gleich große Zeilen |
| `4-grid` | 4 | 2x2-Raster |
| `4-left-large` | 4 | Groß links, drei gestapelt rechts |
| `4-top-large` | 4 | Groß oben, drei Spalten unten |
| `4-bottom-large` | 4 | Drei Spalten oben, groß unten |
| `5-top2-bottom3` | 5 | Zwei oben, drei unten |
| `5-top3-bottom2` | 5 | Drei oben, zwei unten |
| `5-left-large` | 5 | Groß links, vier gestapelt rechts |
| `5-center-large` | 5 | Groß in der Mitte, vier Ecken |
| `6-grid-2x3` | 6 | 2 Spalten x 3 Zeilen |
| `6-grid-3x2` | 6 | 3 Spalten x 2 Zeilen |
| `6-top-large` | 6 | Groß oben, fünf Spalten unten |
| `7-mosaic` | 7 | Mosaiklayout |
| `8-mosaic` | 8 | Mosaiklayout |
| `9-grid` | 9 | 3x3-Raster |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Hinweise {#notes}

- Laden Sie mehrere Bilddateien in der Multipart-Anfrage hoch. Die Bilder werden den Vorlagenzellen in der Reihenfolge des Hochladens zugewiesen.
- Werden mehr Bilder hochgeladen, als die Vorlage unterstützt, werden die überzähligen Bilder ignoriert.
- Unterstützt HEIC-, RAW-, PSD- und SVG-Eingabeformate (werden automatisch dekodiert).
- Die Basisgröße der Leinwand beträgt 2400 px an der längsten Seite und wird anhand des gewählten Seitenverhältnisses skaliert.
- Wenn `aspectRatio` `"free"` ist, verwendet die Leinwand standardmäßig 4:3 (2400x1800).
- Die Werte `panX`/`panY` pro Zelle verschieben das Zuschneidefenster innerhalb der Zelle. Ein Wert von 100 verschiebt vollständig zu einer Kante, -100 zur anderen.
- Die Hintergrundfarbe `"transparent"` bleibt nur bei den Ausgabeformaten `png`, `webp` oder `avif` erhalten.
