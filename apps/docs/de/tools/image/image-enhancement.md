---
description: "Automatische Verbesserung mit einem Klick, die ein Bild analysiert und Belichtung, Kontrast, Weißabgleich, Sättigung und Schärfe korrigiert."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 4d168bb20b56
---

# Bildverbesserung {#image-enhancement}

Automatische Verbesserung mit einem Klick und intelligenter Analyse. Analysiert das Bild und wendet Korrekturen für Belichtung, Kontrast, Weißabgleich, Sättigung, Schärfe und Rauschunterdrückung an.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Verarbeitung:** Synchron (verwendet die `createToolRoute`-Factory, gibt das Ergebnis direkt zurück)

**Modell-Bundle:** Für die grundlegende Verbesserung ist keines erforderlich. Das Bundle `upscale-enhance` (5-6 GB) wird nur verwendet, wenn `deepEnhance` aktiviert ist (für die KI-Rauschunterdrückung über SCUNet).

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| mode | string | Nein | `"auto"` | Verbesserungsmodus: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Nein | `50` | Gesamtintensität der Verbesserung (0-100) |
| corrections | object | Nein | alle `true` | Selektiv anzuwendende Korrekturen (siehe unten) |
| deepEnhance | boolean | Nein | `false` | KI-gestützte Rauschunterdrückung aktivieren (erfordert installiertes `noise-removal`-Werkzeug) |

### Objekt „corrections“ {#corrections-object}

| Feld | Typ | Standard | Beschreibung |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Belichtung automatisch korrigieren |
| contrast | boolean | `true` | Kontrast automatisch korrigieren |
| whiteBalance | boolean | `true` | Weißabgleich automatisch korrigieren |
| saturation | boolean | `true` | Sättigung automatisch korrigieren |
| sharpness | boolean | `true` | Automatisch schärfen |
| denoise | boolean | `true` | Leichte Rauschunterdrückung |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Antwort (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyse-Endpunkt {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Analysiert ein Bild und gibt Korrekturempfehlungen zurück, ohne sie anzuwenden.

### Parameter {#parameters-1}

| Parameter | Typ | Erforderlich | Beschreibung |
|-----------|------|----------|-------------|
| file | file | Ja | Bilddatei (Multipart) |

### Beispielanfrage {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Antwort (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Hinweise {#notes}

- Dieses Werkzeug verwendet die synchrone `createToolRoute`-Factory und gibt daher eine standardmäßige Antwort zurück (kein asynchrones 202).
- Der Parameter `mode` passt an, wie Korrekturen gewichtet werden (z. B. ist der Porträtmodus sanfter zu Hauttönen, der Landschaftsmodus verstärkt die Sättigung).
- Wenn `deepEnhance` aktiviert und das `noise-removal`-Werkzeug (SCUNet) installiert ist, wird nach den Standardkorrekturen ein zusätzlicher KI-Rauschunterdrückungsdurchgang angewendet.
- Der Analyse-Endpunkt ist nützlich, um eine Vorschau der Korrekturen zu erhalten, bevor sie angewendet werden.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR über automatische Decodierung.
