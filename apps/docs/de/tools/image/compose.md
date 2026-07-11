---
description: "Legt Bilder mit Position, Deckkraft und Mischmodi für die Komposition übereinander."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 1b6ea6385e27
---

# Bildkomposition {#image-composition}

Legt ein Overlay-Bild mit konfigurierbarer Position, Deckkraft und Mischmodus über ein Basisbild. Nützlich zum Zusammenstellen von Logos, Grafiken oder zum Kombinieren mehrerer Bilder.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/compose`

Akzeptiert Multipart-Formulardaten mit **zwei** Bilddateien und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| x | number | Nein | `0` | Horizontaler Versatz des Overlays von der oberen linken Ecke in Pixeln (min. 0) |
| y | number | Nein | `0` | Vertikaler Versatz des Overlays von der oberen linken Ecke in Pixeln (min. 0) |
| opacity | number | Nein | `100` | Deckkraft des Overlays in Prozent (0 bis 100) |
| blendMode | string | Nein | `"over"` | Mischmodus für die Komposition |

### Mischmodi {#blend-modes}

| Wert | Beschreibung |
|-------|-------------|
| `over` | Normales Overlay (Standard) |
| `multiply` | Abdunkeln durch Multiplizieren der Pixelwerte |
| `screen` | Aufhellen durch Invertieren, Multiplizieren und erneutes Invertieren |
| `overlay` | Kombiniert Multiplizieren und Negativ multiplizieren je nach Helligkeit des Basisbildes |
| `darken` | Behält das dunklere Pixel jeder Ebene |
| `lighten` | Behält das hellere Pixel jeder Ebene |
| `hard-light` | Starkes Kontrast-Overlay |
| `soft-light` | Dezentes Kontrast-Overlay |
| `difference` | Absolute Differenz zwischen den Ebenen |
| `exclusion` | Ähnlich wie Differenz, aber mit geringerem Kontrast |

### Dateifelder {#file-fields}

| Feldname | Erforderlich | Beschreibung |
|------------|----------|-------------|
| file | Ja | Das Basis-/Hintergrundbild |
| overlay | Ja | Das Overlay-/Vordergrundbild |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Mit dem Mischmodus Multiplizieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Hinweise {#notes}

- Beide Bilder werden vor der Komposition validiert und dekodiert (HEIC, RAW, PSD, SVG werden unterstützt).
- Das Overlay wird an den exakten Pixelkoordinaten platziert, die durch `x` und `y` angegeben werden. Es wird nicht passend skaliert.
- Ist die Deckkraft kleiner als 100, wird vor dem Mischen eine Alphamaske auf das Overlay angewendet.
- Das Overlay kann über die Grenzen des Basisbildes hinausragen (es wird dann beschnitten).
- Die EXIF-Ausrichtung wird vor der Verarbeitung automatisch auf beide Bilder angewendet.
- Die Ausgabeabmessungen entsprechen den Abmessungen des Basisbildes.
